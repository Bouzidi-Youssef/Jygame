# Phase 17H-B — GPU Persistent Storage Architecture

**Date:** 2026-06-21
**Status:** Architecture design (no implementation)
**Prerequisites:** Phase 17H-A (GPU backend validation), Phase 17F (fillUploadBuffer optimization)

---

## Executive Summary

The current architecture uploads all active particles to GPU every frame. Phase 17F reduced this from 404ms to 25.8ms at 250k, but the upload cost still prevents the engine from sustaining 60 fps above ~100k particles.

GPU-persistent storage eliminates per-frame full uploads by keeping particle data resident on the GPU across frames. Only newly spawned particles (typically 0–100 per frame) require upload. This shifts the architecture from:

```
CPU Storage → fillUploadBuffer → writeBuffer → GPU Compute → GPU Render
```

to:

```
GPU Persistent Buffer ← (once) ← CPU Storage
emit → writeBuffer(single) → GPU Persistent Buffer
GPU Persistent Buffer → GPU Compute → GPU Render
```

**Verdict: Worth pursuing.** The design is feasible, the risk is manageable, and the performance gain is substantial (est. ~50× reduction in upload cost at 250k). The implementation can be staged across 6 phases with clear rollback points.

---

## Part 1 — Current Architecture Audit

### 1.1 Particle Lifecycle

```
emit() → acquire() → initialize() → alive=1
                                    ↓
update(dt): integratePhysics → modifier chain → if life ≤ 0: release()
                                    ↓
render(): sort → fillCommandBuffer → draw
```

### 1.2 Data Paths

| System | Owner | Authority | GPU Involvement |
|--------|-------|-----------|-----------------|
| Spawn (emit) | `SoAParticleStorage` | CPU | None on spawn |
| Physics integration | `integrateParticle()` or GPU compute | CPU (soA/operator) / GPU (compute) | Writes GPU buffer |
| Death detection | `life ≤ 0` check in update loop | CPU | `alive = 0` in compute shader |
| Death sweep | `storage.release()` — swap-remove + free-list push | CPU | None |
| Sorting | `ParticleSortManager` — CPU sort | CPU | None |
| Rendering | CPU command buffer or WebGPU storage buffer | CPU / GPU | Reads GPU buffer |
| Upload | `fillUploadBuffer()` + `writeBuffer()` | CPU | Writes GPU buffer |
| Readback | `download()` — staging buffer copy + map | CPU (optional) | Reads GPU buffer |

### 1.3 CPU Storage Responsibilities

- Free-list management (LIFO stack of free slot indices)
- Active list (`_activeAccessors` — array of accessors, swap-removed on release)
- 20 parallel typed arrays (SoA) — the authoritative particle state
- Dirty range tracking (`_minDirty` / `_maxDirty`) — unused in compute path
- Rendering metadata per accessor (texture, frame, collision, color, userData)
- Sort order tracking (`__jygameSortOrder`)

### 1.4 GPU Buffer Responsibilities

- `GPUBuffer` with `STORAGE | COPY_DST | COPY_SRC` — holds particle state as AOS (field per struct member, `ParticleBufferLayout.STRIDE = 20`)
- Staging buffer (`MAP_READ | COPY_DST`) — used for readback in validation mode
- Uniform buffer (`UNIFORM | COPY_DST`) — dt, elapsedTime, particleCount

### 1.5 Systems Assuming CPU Authority

| System | Assumption | Impact if GPU Becomes Authoritative |
|--------|-----------|-------------------------------------|
| `SoAParticleStorage.acquire()` | CPU owns free-list | Must either migrate free-list to GPU or keep CPU-side free-list + sync |
| `SoAParticleStorage.release()` | CPU can swap-remove from active list | Swap-remove invalidates GPU slot indices — must detangle slot index from active-list position |
| `ParticleSortManager.sort()` | All field values accessible on CPU | Needs readback of sort keys, or GPU sort |
| `ModifierStateStore` | Per-particle state on CPU | State must be migrated to GPU or CPU must still simulate for stateful modifiers |
| `CpuParticleBackend` | All data on CPU | No change — stays CPU-only |
| `GpuParticleBackend._updateCompute()` | Upload happens before dispatch | Must change to persistent upload or no upload |

### 1.6 Systems Already Operating with GPU Authority

| System | Current Behavior | GPU Authority |
|--------|-----------------|---------------|
| `GpuComputeDispatcher.dispatchOnly()` | Upload → dispatch — no readback | GPU is authoritative after dispatch |
| `WebGpuParticleRenderer.render()` | Reads GPU storage buffer directly | GPU state → GPU render |
| WGSL compute shader | Reads/writes GPU buffer, sets `alive = 0` | GPU modifies state autonomously |

### 1.7 Key Architecture Insights

**Slot index (`_i`) vs active-list index are different things.** `SoAParticleSlot._i` is the slot index (position in the typed arrays), while the active list (`_activeAccessors`) is a dense array of alive particles. `release()` does swap-remove on the active list, changing active-list positions but NOT slot indices. The GPU buffer is indexed by SLOT index, so GPU-side particle addresses remain valid across CPU-side deaths — as long as the slot itself is not reused.

**This separation is critical:** GPU-persistent storage is naturally supported as long as slot indices are stable. The free-list reuse of slots is the only complication — when a slot is freed and then re-acquired for a new particle, the GPU buffer at that slot index must be updated.

**Metadata fields are NOT in the GPU buffer.** Texture references, collision callbacks, color strings, userData objects — these live on the accessor and are never uploaded. GPU-persistent storage does not affect them.

---

## Part 2 — Ownership Model

### 2.1 Option A: CPU Authoritative

```
CPU owns truth, GPU mirrors state
```

**Current model.** CPU has the full authoritative state in SoA typed arrays. GPU receives a copy each frame via upload.

| Aspect | Assessment |
|--------|------------|
| Advantages | Simple, device loss = trivial re-upload, no sync issues, existing code works |
| Disadvantages | Requires full upload every frame (25.8ms at 250k after Phase 17F) |
| Complexity | Minimal — already implemented |
| Performance | Bounded by fillUploadBuffer + writeBuffer — cannot improve beyond Phase 17F |
| Testing | Straightforward — CPU is ground truth |
| Recovery | Trivial: re-upload from CPU storage |

**Conclusion:** Rejected for Phase 17H because the performance improvement from Option A is zero.

### 2.2 Option B: GPU Authoritative

```
GPU owns truth, CPU submits commands
```

| Aspect | Assessment |
|--------|------------|
| Advantages | Maximum performance, no upload cost, no redundant CPU work |
| Disadvantages | Device loss = total state loss, GPU-incompatible modifiers (trail, spawn, collision) cannot coexist, sorting needs full GPU implementation, free-list must be GPU-managed, testing requires GPU readback |
| Complexity | Very high — requires WGSL free-list, GPU compaction, GPU sort |
| Performance | Best possible — zero CPU upload cost, zero readback |
| Testing | Requires readback for validation, non-deterministic across GPU backends |
| Recovery | Full CPU snapshot required: 20 fields × capacity × 4 bytes + metadata |

**Conclusion:** Rejected for the initial implementation. Too risky, too many systems assume CPU authority. May become viable in a future iteration after the hybrid model is proven.

### 2.3 Option C: Hybrid (Recommended)

```
CPU owns metadata and lifecycle
GPU owns simulation state — persists across frames without re-upload
```

**The sweet spot.** CPU tracks which slots are alive/free, manages rendering metadata, and handles sorting. GPU holds the authoritative simulation data (20 fields per particle) in a persistent buffer that is never fully re-uploaded.

| Aspect | Assessment |
|--------|------------|
| Advantages | Eliminates full upload, incremental per-frame cost is O(emits), device loss recovery is simple (re-upload all alive slots), GPU-incompatible modifiers remain viable on CPU side, sorting stays CPU-driven with targeted readback |
| Disadvantages | Death detection requires either GPU readback of alive flags or CPU-side tracking; CPU still holds full state in typed arrays (memory is ~2×); targeted readback adds small latency |
| Complexity | Moderate — new upload model, targeted readback, GPU-side compaction or alive flag tracking |
| Performance | Upload cost becomes O(emitted particles) instead of O(active). At typical spawn rates (0–100/frame), upload drops from 25.8ms to <0.01ms |
| Testing | CPU storage remains authoritative ground truth — can cross-check against GPU state via targeted readback |
| Recovery | Full state always available on CPU — re-upload all alive slots on device loss |

### 2.4 Recommended Model Details

```
┌─────────────────────┐     ┌──────────────────────────┐
│  CPU (authoritative) │     │  GPU (simulation owner)  │
│                      │     │                          │
│  Free-list            │     │  Slot data (20 fields)   │
│  Active list (sorted) │     │  Alive flag array         │
│  Rendering metadata   │     │  Sort keys (optional)    │
│  Modifier state       │     │                          │
│  SoA typed arrays     │     │                          │
│  (fallback/backup)    │     │                          │
└──────────┬────────────┘     └──────────┬───────────────┘
           │                              │
           │  emit → writeBuffer(1 slot)  │
           │  death → compact/readback    │
           │  sort ← readback keys        │
           └──────────────────────────────┘
```

**Key invariants:**
1. CPU always knows which slots are alive and their logical ordering
2. GPU always has the latest simulation state for every alive slot
3. Dea slots remain in the GPU buffer but are marked `alive = 0`
4. The CPU never does a full upload — only per-slot writes for newly spawned particles
5. The CPU may optionally read back small subsets (alive flags, sort keys)

---

## Part 3 — Spawn Architecture

### 3.1 Current Path

```
ParticleEmitter.emit(count)
  → ParticleSystem.emit(count)
    → GpuParticleBackend.emit(count)
      → for each particle:
        → storage.acquire()              // pop from CPU free-list, get slot index
        → accessor initialization         // set initial field values
        → runOnEmit modifiers            // apply spawn modifiers
```

After emit, data is only in CPU storage. It gets uploaded to GPU on the next `update()` via `fillUploadBuffer()` + `writeBuffer()`.

### 3.2 Proposed Path

```
ParticleEmitter.emit(count)
  → ParticleSystem.emit(count)
    → GpuParticleBackend.emit(count)
      → for each particle:
        → storage.acquire()              // pop from CPU free-list, get slot index
        → accessor initialization         // set initial field values
        → runOnEmit modifiers            // apply spawn modifiers
        → gpuBuffer.writeSlot(slotIndex, accessor)  // NEW: write 1 slot to GPU
```

### 3.3 Slot Allocation

**CPU owns the free-list.** The existing `SoAParticleStorage` free-list (LIFO stack of free slot indices) continues to manage slot allocation. No changes needed.

```
acquire():
  1. Pop slot index from _freeList.top
  2. Assign _nextId++ as __jygameId
  3. Reset slot (zero typed array fields, set defaults)
  4. Append accessor to _activeAccessors
  5. Return accessor
```

### 3.4 GPU Slot Write

A new method on `GpuParticleBuffer`:

```
writeSlot(slotIndex, storage):
  1. Read 20 fields from storage at slotIndex (direct typed-array access)
  2. Pack into interleaved format matching GPU layout
  3. device.queue.writeBuffer(gpuBuffer, offset=slotIndex * stride * 4, data)
```

**Buffer:** 20 × 4 bytes = 80 bytes per particle. A `writeBuffer` of 80 bytes is negligible (~0.001ms).

### 3.5 Burst Handling

When emitting many particles at once (e.g., `burst(1000)`), batch writes into a single `writeBuffer` for efficiency:

```
writeSlots(slotIndices[], storage):
  1. Pack N particles into a temporary Float32Array
  2. device.queue.writeBuffer(gpuBuffer, offset, data)
```

Burst limit of 1000 (existing `ParticleEmitter` enforces this via `Math.min(floor(accumulator), 1000)`) means the max batch upload per frame is 1000 × 80 bytes = 80KB — trivial.

### 3.6 Buffer Limits

The GPU buffer is allocated at max capacity (matching `storage.capacity`). When `storage.capacity` grows (via `_grow()`), the GPU buffer must also grow. This already happens in `GpuParticleBuffer.resize()`.

### 3.7 Lifecycle Diagram

```
Frame N:
  CPU: emit(5) → acquire 5 slots → writeSlot × 5 to GPU (400 bytes)
  GPU: buffer now has 5 new particles at known slot indices

Frame N+1:
  CPU: no emit → no GPU writes
  GPU: compute shader runs on persistent buffer — updates all alive particles

Frame N+2:
  CPU: emit(3) → acquire 3 slots → writeSlot × 3
  GPU: compute shader runs — updates all alive particles including the 3 new ones
```

---

## Part 4 — Death Architecture

### 4.1 The Death Problem

GPU-persistent storage means the GPU simulation modifies particle state (including `life` and `alive`) without CPU involvement. The CPU must learn which particles died to:
1. Reclaim their slots in the free-list
2. Update the active list
3. Run `onDeath` modifiers
4. Track active count for dispatch/rendering

### 4.2 Option A: GPU Free-list

The GPU maintains its own free-list of dead slot indices. The compute shader compacts dead particles and pushes freed indices onto a GPU-side free-list buffer.

| Aspect | Assessment |
|--------|------------|
| Advantages | No CPU readback needed for death — CPU only reads free-list count |
| Disadvantages | Requires WGSL atomic free-list (complex); race conditions between compaction and spawn; requires barrier synchronization; adds shader complexity |
| Complexity | Very high |
| Performance | Best — zero readback for death tracking |
| Testing | Requires readback to verify free-list state |
| Recovery | GPU free-list lost on device reset — must rebuild from CPU |

**Conclusion:** Too risky for initial implementation. Defer to a future phase.

### 4.3 Option B: GPU Compaction

The compute shader compacts all alive particles to the start of the buffer and writes the new alive count to a small output buffer. The CPU reads back only the count (4 bytes) and possibly the compaction map.

| Aspect | Assessment |
|--------|------------|
| Advantages | No fragmentation; alive count readback is 4 bytes; natural O(1) slot reclaim |
| Disadvantages | COMPACTION CHANGES SLOT INDICES — breaks the slot index contract. Every particle's slot index changes on every frame where deaths occur. This invalidates `writeSlot()` because the GPU slot index no longer matches the CPU slot index. All metadata (texture, collision) linked to slot index must be updated. |
| Complexity | Very high — requires slot-to-active mapping on both CPU and GPU |
| Performance | No readback except 4 bytes; but compaction is O(alive) on GPU |
| Testing | Complex — need cross-reference between CPU and GPU indices |

**Conclusion:** Not compatible with the hybrid ownership model. Compaction invalidates the stable slot index that CPU metadata relies on.

### 4.4 Option C: GPU Death Marking + CPU Readback of Alive Flags (Recommended)

The GPU compute shader sets `alive = 0` when `life <= 0`. Dead particles remain in their slots — the slot is NOT reused yet. The CPU reads back the alive flags array (1 byte per slot) once per frame. Dead slots are then released via normal `storage.release()`.

```
GPU compute shader:
  if (life[idx] <= 0) alive[idx] = 0;
  // No compaction. Dead particles stay in their slots.

CPU death sweep:
  1. Read back alive flags from GPU (1 byte × capacity)
  2. Iterate active list in reverse
  3. If alive[slotIndex] == 0: storage.release(accessor)
  4. storage.release() pushes slot onto free-list (CPU)
```

| Aspect | Assessment |
|--------|------------|
| Advantages | Slot indices remain stable; no GPU compaction; no GPU free-list; simple to implement; death modifiers still run on CPU; free-list management unchanged |
| Disadvantages | Readback of alive flags (250KB at 250k) — adds ~0.1ms per frame; dead slots are "wasted" until free-list reuses them (no fragmentation in GPU buffer — just stale data that's skipped by alive check) |
| Complexity | Low — add readback to `GpuParticleBuffer`, add death sweep to backend |
| Performance | Readback 250KB: ~0.1ms GPU copy + map. Compare to current 25ms upload — net gain is enormous |
| Testing | Straightforward — CPU storage remains authoritative ground truth for alive count |

**Readback cost analysis at 250k:**
- Alive flags as `Uint8Array`: 250KB
- Staging buffer copy: ~0.01ms
- `mapAsync` + read: ~0.05ms (non-blocking, can be pipelined)
- JS iteration to find dead slots: ~0.05ms
- Total: ~0.1ms — negligible

### 4.5 Death Detection Flow (Recommended)

```
Frame N:
  GPU compute:
    for each alive particle:
      life -= dt
      if life <= 0: alive = 0

  CPU death sweep:
    1. Copy GPU alive flags → staging buffer (COPY_SRC → COPY_DST)
    2. Submit copy command (same command encoder as compute)
    3. In requestAnimationFrame callback:
       a. Map staging buffer
       b. Read alive flags
       c. Iterate _activeAccessors in REVERSE
       d. For each slot where GPU alive == 0:
          - Run onDeath modifiers
          - storage.release(accessor)  // swap-remove from active list
          - (slot is pushed onto CPU free-list)
       e. Unmap staging buffer

Frame N+1:
  CPU: may re-use freed slots via acquire() → writeSlot()
  GPU: compute shader skips slots where alive == 0
```

### 4.6 Alive Flag Storage

The alive flags can be stored either:
1. **Within the existing particle buffer**: already in `ParticleBufferLayout` as `alive` (u32 field). Readback would copy the entire buffer and extract the alive field — wasteful.
2. **Separate Uint8Array on GPU**: dedicated `STORAGE` buffer of `capacity` bytes. Compute shader writes to both the `alive` field in the main buffer AND this dedicated buffer. CPU reads back only this dedicated buffer.

**Recommendation:** Option 2 — separate alive flag buffer. 250KB at 250k capacity, trivial memory. Copy to staging is a single `COPY_DST` command.

### 4.7 Fragmentation

GPU buffer fragmentation is not a concern. Dead particles remain in the GPU buffer with `alive = 0`. The compute shader skips them (checks `alive[idx] == 0` at the start of the main function). The renderer also skips them (vertex shader checks `alive`).

Slot reuse occurs when `acquire()` pops a freed slot from the CPU free-list and `writeSlot()` overwrites the GPU buffer at that index. The GPU buffer naturally overwrites stale data.

---

## Part 5 — Sorting Architecture

### 5.1 Current Sort Path

```
ParticleSortManager.sort():
  sortedIndices = [0, 1, 2, ..., n-1]  // active-list indices
  sortedIndices.sort(comparator)        // stable sort
  comparator(a, b):
    return storage.getFieldValue(a, "depth") - storage.getFieldValue(b, "depth")
```

The comparator reads field values from CPU storage via the accessor chain. Sort happens entirely on CPU.

### 5.2 Compatibility with GPU-persistent Storage

If the GPU is authoritative for simulation state, the CPU's field values MAY be stale. Specifically:
- Fields updated by GPU compute shader (vx, vy, x, y, life, ageRatio, alpha, etc.) reflect the GPU's state from the LAST readback, not the latest simulation
- Fields NOT updated by GPU (rendering metadata, userData) remain current on CPU

For sort modes that use GPU-modified fields, the CPU must either:
1. Read back the sort key from GPU before sorting
2. Perform sort on GPU
3. Accept slightly stale sort order (one frame behind)

### 5.3 Option A: CPU Readback of Sort Keys

Read back only the fields needed for sorting (e.g., `depth` for depth sort, `life` for age sort) before the sort step.

| Aspect | Assessment |
|--------|------------|
| Advantages | Minimal readback (1 field = 4 bytes/particle = 1MB at 250k); sort logic unchanged; stable sort preserved |
| Disadvantages | Adds readback latency before render; not real-time sort (one frame behind if pipelined) |
| Complexity | Low — extend existing readback infrastructure |
| Performance | 1MB copy + map: ~0.2ms at 250k |

**Example: depth sort at 250k**
- Readback depth values: 250k × 4 bytes = 1MB
- Copy → map → sort: ~0.2ms + ~2ms (JS sort) = ~2.2ms total
- Current cost: ~3ms (JS sort with accessor reads)
- Net: similar or slightly faster

### 5.4 Option B: GPU Sort

Implement a GPU-side sort (bitonic sort or radix sort) in a compute shader, producing a sorted index buffer consumed by the renderer.

| Aspect | Assessment |
|--------|------------|
| Advantages | No readback; true real-time sort; can handle arbitrary field values |
| Disadvantages | Very complex WGSL implementation; bitonic sort is O(n log² n) on GPU; limited precision for stable sorting; needs separate index buffer |
| Complexity | Very high |
| Performance | Fast on GPU for large counts (bitonic sort of 250k ~1ms) |
| Testing | Hard — readback required to verify sort order |

**Conclusion:** Defer. GPU sort is valuable but not required for Phase 17H. The existing CPU sort with targeted readback is sufficient.

### 5.5 Option C: No Sorting

Skip sorting entirely. Render in slot order (arbitrary).

| Aspect | Assessment |
|--------|------------|
| Advantages | Zero sort cost, zero readback |
| Disadvantages | Transparency rendering may look wrong without depth sort |
| Complexity | None |
| Performance | Best |
| Testing | No change |

**Conclusion:** Valid for systems that don't need sorting. Most particle systems use depth sort for transparent blending. Not a general solution.

### 5.6 Recommended Approach

**Phase 1 (immediate): CPU readback of sort keys.**

Read back the sort-key field(s) from GPU before sort. This is a minimal change to `GpuParticleBackend.render()`.

```
GpuParticleBackend.render():
  if sortMode !== "none":
    gpuBuffer.readbackField("depth", storage)  // NEW: ~1MB readback at 250k
    sortManager.sort()                         // unchanged — reads CPU storage
  render()                                     // unchanged
```

The `readbackField()` method copies only the specified field's column from the GPU buffer to CPU storage. At 250k, a single field readback is 1MB — ~0.2ms.

**Phase 2 (future): Compute sort keys on CPU from CPU-side data.**

If the engine caches the emitted particle properties on CPU (which it already does — `SoAParticleStorage` holds all data), the CPU can compute sort keys without readback by using the last-synced values. This works when the GPU compute shader doesn't modify the sort key field (e.g., `depth` is often set at emit time and never changed).

**Phase 3 (future): GPU sort for systems needing real-time reordering.**

Implement a WGSL bitonic sort when the performance benefit justifies the complexity.

---

## Part 6 — Synchronization Model

### 6.1 Frame Structure

```
requestAnimationFrame:
  ┌─────────────────────────────────────────────────────┐
  │  1. CPU: emit                                       │
  │     - acquire slots from free-list                   │
  │     - initialize particles                           │
  │     - writeSlot(s) to GPU buffer                     │
  │                                                      │
  │  2. CPU: death sweep (from PREVIOUS frame's GPU      │
  │     compute output)                                  │
  │     - map staging buffer with alive flags            │
  │     - iterate active list, release dead slots        │
  │     - unmap staging buffer                           │
  │                                                      │
  │  3. GPU: submit compute pass                         │
  │     - dispatch compute shader on persistent buffer   │
  │     - shader writes alive flags to dedicated buffer  │
  │     - copy alive flags → staging buffer              │
  │     (for NEXT frame's death sweep)                   │
  │                                                      │
  │  4. CPU: sort (if needed)                            │
  │     - readback sort keys (optional)                  │
  │     - sortManager.sort()                             │
  │                                                      │
  │  5. GPU: render                                      │
  │     - bind persistent buffer to render pipeline      │
  │     - draw (alive count)                             │
  └─────────────────────────────────────────────────────┘
```

### 6.2 CPU→GPU Communication

| Operation | Mechanism | Timing | Cost |
|-----------|-----------|--------|------|
| New particle data | `writeBuffer()` at slot offset | During emit | 80 bytes/particle |
| Uniforms (dt, etc.) | `writeBuffer()` to uniform buffer | Before compute dispatch | 16 bytes |
| Alive flag clear (optional) | `writeBuffer()` to overwrite slot alive=1 | During emit | 1 byte |
| Buffer resize | `_allocate()` re-creates buffer | On storage grow | Full state uploaded once |

### 6.3 GPU→CPU Communication

| Operation | Mechanism | Timing | Cost |
|-----------|-----------|--------|------|
| Alive flags | COPY buffer → staging → mapAsync + read | Before death sweep (next frame) | 250KB at 250k |
| Sort keys (optional) | COPY buffer sub-range → staging → mapAsync | Before sort | 1MB at 250k |
| Full readback (validation) | COPY entire buffer → staging → mapAsync | Optional test mode | 20MB at 250k |

### 6.4 Synchronization Hazards

| Hazard | Risk | Mitigation |
|--------|------|------------|
| CPU writes slot while GPU reads it (WAR) | GPU may read partially-written particle data | All CPU writes to GPU buffer happen BEFORE compute dispatch. No overlap. |
| GPU computes while CPU maps staging buffer (RAW) | CPU reads stale alive flags from previous frame | By design — death sweep uses PREVIOUS frame's alive flags. One-frame delay is acceptable. |
| CPU frees slot that GPU is about to process (WAW) | GPU operates on slot that CPU considers dead | Cannot happen: CPU only frees slots whose GPU alive flag was 0 from the readback. GPU has already marked them dead. |
| Emit uses slot from free-list while GPU still has stale data at that slot | All fields overwritten by writeSlot | writeSlot writes ALL 20 fields — no stale data remains. |
| Multiple emits in same frame write same slot | Impossible — free-list guarantees unique slot per acquire | None needed |

### 6.5 Frame Boundaries

All GPU work within a single `requestAnimationFrame` callback is submitted together:
1. Write emit data to GPU buffer
2. Write uniforms
3. Dispatch compute
4. Copy alive flags to staging (for NEXT frame)
5. Dispatch render

The `device.queue.submit()` call at the end of the frame ensures all operations execute in order. No explicit barriers needed because WebGPU guarantees queue ordering.

### 6.6 Resource Ownership Transitions

```
┌────────┐     emit          ┌────────┐
│  Free  │ ───────────────→  │ Active │
│  Slot  │   writeSlot()     │  Slot  │
└────────┘                   └────────┘
                                  │
                                  │ GPU compute: life ≤ 0
                                  │ sets alive = 0
                                  ▼
┌────────┐  death sweep      ┌────────┐
│  Free  │ ←──────────────── │  Dead  │
│  Slot  │  release() +      │  Slot  │
└────────┘  free-list push   └────────┘
```

The slot ownership transition is:
1. **Free → Active:** CPU acquires slot, calls `writeSlot()` to fill GPU data
2. **Active → Dead:** GPU compute sets `alive = 0` (no CPU involvement)
3. **Dead → Free:** CPU death sweep detects `alive = 0`, calls `storage.release()`, pushes to free-list

The GPU never reuses dead slots. Only the CPU reuses them via `acquire()`.

---

## Part 7 — Device Loss Recovery

### 7.1 What Is Lost on Device Reset

| Resource | Lost? | Recovery |
|----------|-------|----------|
| GPU particle buffer (`GPUBuffer` with `STORAGE`) | YES | Must re-create and re-upload all slots |
| GPU alive flag buffer | YES | Idem |
| GPU staging buffer | YES | Re-create |
| GPU uniform buffer | YES | Re-create |
| GPU pipeline / shader module | YES | Re-create via existing cache |
| GPU bind group / bind group layout | YES | Re-create via existing cache |
| CPU `SoAParticleStorage` | NO | Always valid |
| CPU typed arrays | NO | Always valid |
| CPU active accessors | NO | Always valid |
| CPU free-list | NO | Always valid |
| CPU metadata (texture, collision, etc.) | NO | Always valid |

### 7.2 Recovery Strategy

```
onDeviceLost:
  1. Destroy old GPU resources (particle buffer, staging, uniform buffer, pipelines)
  2. Request new adapter + device
  3. Re-create pipeline cache (shader modules, bind group layouts)
  4. Re-create GpuParticleBuffer with same capacity
  5. For each alive slot in CPU storage:
     gpuBuffer.writeSlot(slotIndex, storage)  // re-upload all alive particles
  6. Re-create alive flag buffer, staging buffer, uniform buffer
  7. Re-create bind groups
  8. Resume normal frame loop
```

### 7.3 CPU Snapshot Requirements

The CPU `SoAParticleStorage` already IS the snapshot. No additional snapshot mechanism is needed. At all times, the CPU has:
- Complete particle state for all alive particles (20 typed arrays)
- Free-list of dead slots
- Active list in sort order
- Rendering metadata per particle

**Snapshot size:** Same as current CPU storage:
- 20 typed arrays × capacity × element_size
- At 250k capacity: ~20MB (same as before Phase 17H)

**Snapshot freshness:** The CPU state may be one frame behind GPU simulation state. After device loss:
1. The CPU re-uploads all alive particles' initial/emitted state (not the latest GPU-simulated state)
2. The GPU compute shader re-simulates from the beginning
3. This produces a visual "pop" — particles jump back one frame in their simulation

**Acceptable?** Yes. A one-frame visual glitch on device loss is standard for GPU particle systems. If the engine requires perfect visual continuity across device loss, a periodic GPU-to-CPU snapshot sync (full readback every N frames) can be added — at the cost of periodic full-readback overhead.

### 7.4 Recovery Time Estimate

At 250k:
- Re-create buffers: ~0.1ms
- Write all alive slots (250k × writeSlot): ~8ms (serial writes)
  - Optimization: batch into fewer, larger writeBuffer calls: ~3ms
- Re-create pipelines: ~1ms (cached, may hit compiled shader cache)
- Total recovery: ~4-12ms — acceptable for a device loss event (rare)

### 7.5 Device Loss During Compute

If device loss occurs during a compute dispatch:
- The `submit()` call throws or the device is lost
- Recovery is the same as above
- The CPU state is unaffected (no readback was in progress)
- The visual glitch is limited to the lost frame

---

## Part 8 — Testing Strategy

### 8.1 Unit Tests (CPU Storage)

No changes needed. Existing unit tests for `SoAParticleStorage` (acquire, release, fillUploadBuffer, lifecycle) operate entirely on CPU and are unaffected by GPU-persistent storage.

### 8.2 Unit Tests (GPU Buffer Operations)

New unit tests for `GpuParticleBuffer`:
- `writeSlot()` — verify GPU buffer content at a specific slot via readback
- `writeSlots()` — batch write and verify
- `readAliveFlags()` — verify readback matches expected values
- `readField()` — verify single-field readback

These require WebGPU (browser or Node.js with WebGPU shim).

### 8.3 Integration Tests

- `emit(N) → writeSlot(N) → dispatch compute → readAliveFlags()` — end-to-end test of GPU-persistent path
- `emit → death → re-acquire slot → write → verify slot reuse` — free-list + slot overwrite
- `device loss → recovery → verify state matches` — recovery correctness

### 8.4 When Is GPU Readback Required?

| Scenario | Readback Required? | Size |
|----------|-------------------|------|
| Unit test: writeSlot correctness | Yes — read single slot | 80 bytes |
| Integration: alive count tracking | Yes — read alive flags | 250KB at 250k |
| Integration: death sweep | Yes — read alive flags | 250KB at 250k |
| Validation mode (cross-check) | Yes — read full buffer | 20MB at 250k |
| Production render | No | — |
| Production sort (depth) | Optional — read depth field | 1MB at 250k |
| Device loss recovery | No — CPU has data | — |

### 8.5 Acceptable Readback Budget

| Readback Size | Per-Frame Cost | Acceptable? |
|--------------|----------------|-------------|
| Alive flags (250KB) | ~0.1ms | Yes — always in production |
| Sort key (1MB) | ~0.2ms | Yes — when sorting needed |
| Full state (20MB) | ~4ms | No — validation mode only |
| Single slot (80 bytes) | ~0.001ms | Yes — for per-frame validation |

### 8.6 Deterministic Testing

GPU compute shaders are NOT deterministic across GPU backends (different precision, NaN handling). For deterministic tests:

1. **Test the CPU path** — the `operator` mode in `GpuParticleBackend` runs the same logic on CPU and IS deterministic. The GPU-persistent storage mechanism (writeSlot, readAliveFlags) is independent of compute shader output.
2. **Test the readback path** — write deterministic data to GPU buffer via `writeSlot()`, read back via `readAliveFlags()` / `readField()`, verify exact match.
3. **Cross-backend tolerance** — for full integration tests, allow floating-point tolerance (WebGPU spec allows backend-specific precision).

### 8.7 Recommended Test Architecture

```
tests/
  unit/
    SoAParticleStorage.test.js       (unchanged)
    GpuParticleBuffer.test.js         (NEW: writeSlot, readAliveFlags)
  integration/
    GpuParticleBackend.persistent.test.js  (NEW: emit → compute → death → recovery)
    GpuParticleBackend.validation.test.js  (NEW: cross-check CPU vs GPU state)
  benchmarks/
    upload_cost_post_17h.test.js      (NEW: verify upload cost is O(emits))
```

---

## Part 9 — Memory Analysis

### 9.1 GPU Memory Requirements

| Component | Per Element | 10k | 50k | 100k | 250k | 500k |
|-----------|-------------|-----|-----|------|------|------|
| Particle buffer (20 × f32) | 80 bytes | 0.8 MB | 4 MB | 8 MB | 20 MB | 40 MB |
| Alive flag buffer (u8) | 1 byte | 10 KB | 50 KB | 100 KB | 250 KB | 500 KB |
| Staging buffer (alive readback) | 1 byte | 10 KB | 50 KB | 100 KB | 250 KB | 500 KB |
| Staging buffer (sort key) | 4 bytes | 40 KB | 200 KB | 400 KB | 1 MB | 2 MB |
| Staging buffer (full readback) | 80 bytes | 0.8 MB | 4 MB | 8 MB | 20 MB | 40 MB |
| Uniform buffer | — | 16 B | 16 B | 16 B | 16 B | 16 B |
| Indirect draw buffer (optional) | 4 bytes | 40 KB | 200 KB | 400 KB | 1 MB | 2 MB |
| **Total GPU memory** | | **~1.7 MB** | **~8.5 MB** | **~17 MB** | **~42.5 MB** | **~85 MB** |

*Note: Particle buffer is the dominant cost. At 500k, it's 40MB — well within the 256MB–4GB range of typical integrated/discrete GPUs.*

### 9.2 CPU Memory Requirements

| Component | Per Element | 10k | 50k | 100k | 250k | 500k |
|-----------|-------------|-----|-----|------|------|------|
| SoA typed arrays (20 arrays) | varies | ~0.6 MB | ~3 MB | ~6 MB | ~15 MB | ~30 MB |
| Active accessor array | 8 bytes (ref) | 80 KB | 400 KB | 800 KB | 2 MB | 4 MB |
| Free-list (Int32Array) | 4 bytes | 40 KB | 200 KB | 400 KB | 1 MB | 2 MB |
| Accessor objects (per slot) | ~200 bytes | 2 MB | 10 MB | 20 MB | 50 MB | 100 MB |
| GPU readback temp arrays | varies | ~50 KB | ~250 KB | ~500 KB | ~1.3 MB | ~2.5 MB |
| **Total CPU memory** | | **~2.8 MB** | **~13.9 MB** | **~27.7 MB** | **~69 MB** | **~139 MB** |

*Note: Accessor objects dominate CPU memory at scale. At 500k, 100MB of accessor objects is significant but acceptable for desktop/laptop use. Mobile may need optimization.*

### 9.3 Memory Bottlenecks

| Bottleneck | Severity | Mitigation |
|------------|----------|------------|
| Accessor objects at scale | Medium at 500k+ | Lazy accessor creation (create on acquire, GC on release) |
| GPU particle buffer duplication | Low — 20MB at 250k | Acceptable — GPU memory is rarely the bottleneck |
| CPU typed arrays + GPU buffer = 2× state | Medium — 35MB total at 250k | Could eliminate CPU typed arrays in a future pure-GPU path, but not recommended for hybrid model |
| Staging buffers for readback | Low — 1MB | Allocated lazily, can be shared across readback types |

### 9.4 Comparison: Current vs GPU-Persistent

| Metric | Current (Phase 17F) | GPU-Persistent | Delta |
|--------|-------------------|----------------|-------|
| GPU buffer | 20MB (same) | 20.25MB (+250KB) | +0.25MB (alive flags) |
| CPU storage | 15MB (same) | 15MB (same) | 0 |
| Staging buffers | 20MB (full readback) | 0.25MB (alive only) | -19.75MB |
| Temp upload array | Per-frame 20MB | Per-emit N×80 bytes | -20MB per frame |
| **Total memory (steady)** | ~57MB | ~37.5MB | **-34%** |

---

## Part 10 — Risk Assessment

### 10.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `writeBuffer` overhead per slot (80 bytes) may have fixed cost that makes per-particle writes expensive | Medium | Low | Batch writes via `writeSlots()` with coalescing timer; fallback to single-slot if batch is small |
| Alive flag readback timing uncertainty (`mapAsync` may take variable time) | Medium | Medium | Pipeline readback: submit copy on compute completion, map on NEXT frame (one frame delay acceptable for death sweep) |
| `writeBuffer` on slot reused from earlier death may read stale GPU data if `alive` field not overwritten | Low | High | `writeSlot()` MUST write ALL 20 fields including `alive = 1`. Dead slot guarantee: GPU `alive = 0`, `writeSlot` overwrites to `alive = 1`. |
| GPU buffer resize triggers full re-allocation, losing persistent state | Medium | High | Copy old buffer to new buffer before destroy. Use `copyBufferToBuffer` for efficient resize. |
| Slot index mismatch after resize | Low | High | Slot indices are physical (position in typed arrays), unchanged by resize. Only capacity changes, not existing indices. |

### 10.2 Architectural Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hybrid model increases complexity — two sources of truth (CPU typed arrays + GPU buffer) | High | Medium | CPU is ALWAYS authoritative. GPU is only authoritative for simulation between frame boundaries. CPU typed arrays are never stale — they reflect the last known state. |
| `onDeath` modifiers must still run on CPU | Medium | Low | Death modifiers run during death sweep (after alive flag readback). The particle's final state is available on CPU (from the last readback or cached values). |
| GPU-incompatible modifiers still force CPU path | High | Low | No change — these already force fallback to `"operator"` mode. GPU-persistent storage is only active in `"compute"` mode with compatible modifiers. |
| Sorting may be one frame behind | Low | Medium | Document this limitation. Optionally trigger sort-key readback synchronously before render for critical cases. |

### 10.3 Testing Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Readback-only validation cannot verify GPU compute correctness without full readback | High | Medium | Use `renderValidationMode` (existing) for full readback in test builds. Production skips full readback. |
| Deterministic tests impossible across GPU backends | High | Medium | Test CPU operator path for determinism. Test GPU write/readback path for correctness independent of compute output. |
| No way to unit-test death sweep without GPU | Medium | Medium | The death sweep logic (iterate active list, read alive flags, release dead) is CPU-side. Test it separately with mocked alive flag data. |

### 10.4 Portability Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WebGPU `writeBuffer` implementation varies across browsers | High | Low | All implementations must handle aligned 80-byte (or multiple) writes. Test on Chrome, Firefox, Safari. |
| `mapAsync` behavior differs (direct map vs staging copy) | Medium | Medium | Use COPY_DST → staging buffer pattern (works everywhere). Avoid `mapAtCreation` or `writeBuffer → async map`. |
| `maxBufferSize` limits may constrain capacity | Low | High | Query `adapter.limits.maxBufferSize` at init. Cap capacity accordingly. Current limit on this system: ~4GB. |
| WGSL `atomic` support for GPU free-list (future) | Low (future) | Medium | Not needed for current design. If GPU free-list is implemented later, check `maxComputeWorkgroupStorageSize`. |

### 10.5 WebGPU Compatibility Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `GPUQueue.writeBuffer` to `STORAGE` buffer is valid but may have alignment quirks | Low | Low | The `offset` parameter must be a multiple of 4 (required by spec). Slot offset = slotIndex × 80 — already aligned. |
| Simultaneous `writeBuffer` and compute shader access to same buffer | Low | High | All CPU writes complete BEFORE compute dispatch (WebGPU queue ordering guarantees this). |
| Staging buffer for alive flags: simultaneous map + compute | Low | High | Staging buffer is not bound to compute pipeline. Copy completes before map. |

### 10.6 Maintenance Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Two code paths (upload + persistent) increase maintenance burden | High | Medium | Keep the upload path as fallback. The persistent path is an optimization layer, not a replacement. Both can coexist. |
| Dead code: old upload methods may linger | High | Low | Phase 17H implementations should deprecate old methods, not delete them. Full cleanup in a later housekeeping phase. |
| Per-slot writeSlot tuning per GPU backend | Medium | Low | Start with simple implementation. Profile and add batching only if needed. |

### 10.7 Overall Risk Rating

**MEDIUM.** The design is sound and the individual risks are manageable. The phased implementation roadmap (Part 11) allows for incremental validation with clear rollback points. The highest-impact risk (stale alive flags on slot reuse) is fully mitigated by `writeSlot()` always writing all 20 fields.

---

## Part 11 — Implementation Roadmap

### Phase 17H-C — GPU Alive Flag Buffer + Readback

**Goal:** Add infrastructure for GPU-side alive tracking and CPU readback.

**Deliverables:**
- New `GpuAliveFlagBuffer` class: dedicated GPU buffer of `capacity × 1 byte` + staging buffer for readback
- Update WGSL converter to write `alive` flag to the dedicated buffer on death detection
- Update `GpuParticleBuffer` to create/manage the alive flag buffer
- New method `readAliveFlags()` → returns `Uint8Array` of alive flags

**Risk:** Low
**Complexity:** Low
**Dependencies:** None — pure addition, no existing code changes

### Phase 17H-D — Persistent Particle Buffer

**Goal:** Keep the GPU buffer alive across frames instead of re-creating it on each upload.

**Deliverables:**
- `writeSlot(slotIndex, storage)`: write single particle's 20 fields to GPU buffer at slot offset
- `writeSlots(slotIndices[], storage)`: batch version for burst emits
- Remove `upload()` and `uploadDirty()` calls from `dispatchOnly()` and `dispatch()`
- On emit, call `writeSlot()` instead of dirtying the full upload
- On resize, copy old buffer contents to new buffer before destroying old

**Risk:** Medium
**Complexity:** Medium
**Dependencies:** Phase 17H-C (alive flag readback needed for death sweep)
**Rollback point:** If benchmarks show per-slot write is slower than full upload, return to Phase 17F upload path.

### Phase 17H-E — GPU Spawn Pipeline

**Goal:** Drive emit entirely through `writeSlot()` without touching `fillUploadBuffer`.

**Deliverables:**
- Modify `GpuParticleBackend.emit()` to call `writeSlot()` after each acquire
- Ensure `writeSlot()` is called AFTER initializer + onEmit modifiers (so GPU gets the fully initialized state)
- Handle burst emits: batch into `writeSlots()`
- Remove `fillUploadBuffer` call from the frame hot path

**Risk:** Low
**Complexity:** Low
**Dependencies:** Phase 17H-D
**Verification:** Set a breakpoint on `fillUploadBuffer` — should never be called in persistent mode

### Phase 17H-F — GPU Death Handling

**Goal:** Replace CPU death sweep with GPU death detection + alive flag readback.

**Deliverables:**
- GPU compute shader writes `alive = 0` to alive flag buffer when `life <= 0`
- Before each frame's emit step, call `readAliveFlags()` from previous frame
- Run CPU death sweep: iterate active list, check alive flags, call `storage.release()` on dead slots
- Run `onDeath` modifiers during death sweep
- Update `activeCount` tracking

**Risk:** Medium
**Complexity:** Medium
**Dependencies:** Phase 17H-C, Phase 17H-D
**Edge case:** Multiple deaths between readback and compute — handle by one-frame delay (acceptable)

### Phase 17H-G — Device Recovery

**Goal:** Recover from GPU device loss without data corruption.

**Deliverables:**
- Listen for `GPUDevice.lost` event
- On device loss: re-request adapter + device, re-create all GPU resources
- Re-upload all alive particles via `writeSlots()`
- Resume normal frame loop
- Test: simulate device loss and verify particle state matches

**Risk:** Low
**Complexity:** Medium
**Dependencies:** Phase 17H-D, Phase 17H-F
**Testing:** Use `GPUDevice.destroy()` in test to trigger device loss

### Phase 17H-H — Validation and Benchmarks

**Goal:** Verify correctness and measure performance improvement.

**Deliverables:**
- `renderValidationMode` cross-check: after GPU dispatch, read back all fields and compare to CPU storage
- Benchmark: `upload_cost_post_17h` — verify upload time is O(emitted particles/frame) instead of O(active)
- Benchmark: `death_sweep_cost` — verify alive flag readback + death sweep cost
- Benchmark: `persistent_throughput` — measure max sustainable particle count at 60fps
- Update Phase 17H report with final numbers

**Risk:** Low
**Complexity:** Low
**Dependencies:** All prior phases

### Roadmap Summary

```
Phase    | Description                     | Complexity | Risk | Duration (est.)
─────────┼─────────────────────────────────┼────────────┼──────┼────────────────
17H-C    | Alive flag buffer + readback    | Low        | Low  | 1-2 days
17H-D    | Persistent particle buffer      | Medium     | Med  | 2-3 days
17H-E    | GPU spawn via writeSlot         | Low        | Low  | 1 day
17H-F    | GPU death handling              | Medium     | Med  | 2-3 days
17H-G    | Device recovery                 | Medium     | Low  | 1 day
17H-H    | Validation + benchmarks         | Low        | Low  | 1 day
         |                                 |            |      |
         | **Total**                       |            |      | **8-12 days**
```

**Estimated performance impact at each phase:**

```
Phase    | Cumulative improvement at 250k
─────────┼─────────────────────────────────
17H-C    | No perf change (infrastructure)
17H-D    | Upload: 25.8ms → per-emit (0.001ms)
17H-E    | Same as 17H-D (spawn path finalized)
17H-F    | Death sweep: ~1.5ms → ~0.1ms (readback)
17H-G    | No perf change (recovery only)
17H-H    | Validation + final numbers

Total at 250k (estimate): ~26ms → ~1ms per frame
```

---

## Part 12 — Overall Verdict

### Is GPU-persistent storage worth pursuing?

**YES.**

The hybrid ownership model (CPU authoritative for lifecycle, GPU authoritative for simulation state) is:
- **Feasible** — the slot index already decouples active-list position from GPU buffer position
- **Lower risk** than full GPU authority — CPU always has the complete state for recovery, sorting, and metadata
- **High impact** — eliminates the dominant per-frame cost (fillUploadBuffer + writeBuffer = ~26ms at 250k)

### Key design decisions:

1. **Hybrid ownership (Option C)** — CPU owns free-list, active list, rendering metadata; GPU owns simulation state
2. **GPU death marking + CPU flag readback** — GPU sets `alive = 0`, CPU reads 250KB/frame to learn dead slots
3. **CPU sort with targeted readback** — read only the sort key field (1MB at 250k) instead of full state
4. **Per-slot write on emit** — `writeSlot()` uploads 80 bytes per spawned particle instead of the full active set
5. **CPU recovery on device loss** — re-upload all alive slots from CPU storage (no snapshot needed)

### What does NOT change:

- `SoAParticleStorage` internals (free-list, active list, typed arrays)
- `ParticleAccessor` interface
- `ParticleSortManager` sort logic
- `ModifierStateStore` state management
- `ParticleEmitter` emission patterns
- `ParticleEffect` integration
- Public API (`ParticleSystem.emit()`, `ParticleSystem.update()`, `ParticleSystem.render()`)

### What to expect:

| Metric | Current (Phase 17F) | After 17H | Improvement |
|--------|-------------------|-----------|-------------|
| Upload cost at 250k (low churn) | 25.8ms | ~0.01ms (per-emit only) | ~2500× |
| Death sweep cost at 250k | 1.5ms | ~0.15ms (readback + sweep) | ~10× |
| Frame time at 250k | ~28ms | ~3ms (GPU compute + render) | ~9× |
| Max sustained at 60fps | ~100k | ~500k+ | ~5× |
| Memory (CPU + GPU) | ~57MB | ~37.5MB | -34% |

### What to watch for:

1. `writeBuffer` per-slot may have fixed overhead — batch if needed
2. Alive flag readback timing — pipeline across frame boundaries
3. One-frame delay in death detection — acceptable for particle systems
4. GPU buffer resize — must copy old contents
5. Device loss — recovery path must be tested before production use
