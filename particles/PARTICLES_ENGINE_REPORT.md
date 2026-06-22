# jygame Particles Engine — Architecture Report

**Date:** June 22, 2026  
**Version:** 0.7.4  
**Location:** `particles/` (109 files, ~15k LOC)

---

## 1. Overview

The jygame Particles Engine is a layered, multi-backend particle simulation system with three execution modes:

| Mode | Backend | Simulation | Best For |
|---|---|---|---|
| **CPU** | `CpuParticleBackend` | JavaScript per-particle loop | Node.js testing, legacy browsers |
| **Operator** | `GpuParticleBackend` (mode=`"operator"`) | JavaScript per-modifier per-particle, optional SoA | Canvas2D with moderate counts |
| **Compute** | `GpuParticleBackend` (mode=`"compute"`) | WebGPU compute shaders | High-density GPU-accelerated |

Storage, access, and rendering are decoupled via abstract interfaces, allowing any backend to work with any storage type.

---

## 2. Directory Layout

```
particles/
├── ParticleSystem.js            # Main public API — delegates to a _backend
├── ParticleEffect.js            # Spawnable effect from an asset
├── ParticleEmitter.js           # Rate/burst emission controller
├── ParticleSortManager.js       # Sorting (age, depth, reverse, custom)
├── ParticleAsset.js             # Reusable particle template
├── ParticleAssetRegistry.js     # Global registry for named assets
├── SimulationContext.js         # Abstraction over slot vs accessor context
├── ModifierStateStore.js        # Per-modifier per-particle state storage
│
├── accessors/
│   ├── ParticleAccessor.js      # Abstract base
│   ├── SoAParticleAccessor.js   # Proxies get/set into SoA typed arrays
│   └── ObjectParticleAccessor.js# Delegates to object properties
│
├── backends/
│   ├── CpuParticleBackend.js    # Pure CPU (operator execution, always)
│   └── GpuParticleBackend.js    # Operator + Compute (WebGPU)
│
├── storage/
│   ├── ParticleStorage.js       # Abstract base
│   ├── SoAParticleStorage.js    # Structure of Arrays (20 typed arrays)
│   ├── ObjectParticleStorage.js # Array of Objects (ActivePool)
│   └── StorageResolver.js       # Factory + type detection
│
├── gpu/
│   ├── ModifierCompiler.js      # Modifier descriptors → pass layout
│   ├── WgslGenerator.js         # Pass layout → WGSL shader source
│   ├── GpuPassExecutor.js       # CPU-side pass execution (operator mode)
│   ├── GpuUniformLayout.js      # Uniform struct definition
│   ├── ParticleBufferLayout.js  # Constants: 20 fields, STRIDE=20
│   ├── GpuBufferLayout.js       # WGSL struct generation
│   ├── SimulationBufferView.js  # Get/set/integrate over SoA arrays
│   ├── GpuComputeProgram.js     # Compiled compute program container
│   ├── GpuProgramDescriptor.js  # Descriptor from compiler
│   ├── ParticleBackendCapabilities.js  # Feature detection
│   │
│   ├── operators/               # CPU Operator implementations
│   │   ├── index.js             # Registry by type string
│   │   ├── FadeOperator.js      ─
│   │   ├── ScaleOperator.js      │
│   │   ├── VelocityOperator.js   │ 11 operators total
│   │   ├── RotationOperator.js   │
│   │   ├── AttractionOperator.js │
│   │   ├── OrbitOperator.js      │
│   │   ├── WindOperator.js       │
│   │   ├── ForceOperator.js      │
│   │   ├── ColorOperator.js      │
│   │   ├── TurbulenceOperator.js │
│   │   └── AnimationOperator.js ─
│   │   └── forceUtils.js        # Shared force helpers
│   │
│   └── shaders/
│       ├── wgslUtils.js         # WGSL utility functions
│       └── operators/           # WGSL shader codegens
│           ├── index.js         # Registry by type string
│           ├── FadeShader.js    ─
│           ├── ScaleShader.js    │
│           ├── VelocityShader.js │ 11 shader operators
│           ├── RotationShader.js │ (one per CPU operator)
│           ├── AttractionShader.js│
│           ├── OrbitShader.js    │
│           ├── WindShader.js     │
│           ├── ForceShader.js    │
│           ├── ColorShader.js    │
│           ├── TurbulenceShader.js│
│           └── AnimationShader.js─
│
├── gpu/webgpu/                  # WebGPU platform layer
│   ├── WebGpuDeviceManager.js   # Singleton adapter + device
│   ├── WebGpuWgslConverter.js   # Rewrites bare WGSL → engine struct WGSL
│   ├── GpuComputeDispatcher.js  # Orchestrates upload → dispatch → readback
│   ├── GpuParticleBuffer.js     # GPU storage + staging buffer pair
│   ├── GpuComputePipelineCache.js# Pipeline/module/layout/bind-group cache
│   ├── GpuAliveFlagManager.js   # Alive-flag extraction compute shader
│   └── GpuUniformBuffer.js      # 16-byte uniform (dt, elapsedTime, count)
│
├── renderers/
│   ├── ParticleRenderer.js      # Abstract base
│   ├── CanvasParticleRenderer.js# Canvas2D renderer
│   ├── GpuParticleRenderer.js   # WebGL2 instanced renderer
│   └── webgpu/
│       └── WebGpuParticleRenderer.js  # WebGPU storage-buffer renderer
│
├── renderdata/
│   ├── ParticleRenderData.js    # Sorted/unsorted particle view
│   └── ParticleRenderCommandBuffer.js  # Flat Float32Array command buffer
│
├── layers/
│   ├── ParticleLayer.js         # Named grouping layer
│   └── ParticleLayerManager.js  # Ordered multi-layer management
│
├── testing/
│   ├── TestRunner.js            # describe/it/assert framework
│   ├── TestHelpers.js           # Mock backends, creation helpers
│   └── ParticleSnapshot.js      # Snapshot equality for parity tests
│
└── tests/
    ├── run_all.js               # Orchestrator (44 tests)
    ├── compute/
    │   ├── ComputeParity.test.js    # 10 tests (9 pass, 1 skip w/o WebGPU)
    │   ├── ModifierParity.test.js   # 9 tests
    │   ├── EmitParity.test.js       # 3 tests
    │   └── LifecycleParity.test.js  # 3 tests
    ├── wgsl/
    │   └── WgslVerification.test.js # 29 tests
    └── benchmarks/
        ├── serve.sh                  # Python HTTP server
        ├── phase16x_readback_*       # Readback perf (phases 16-17h)
        ├── phase16z_*
        ├── phase17b_alive_parity_*
        ├── phase17b_dirty_upload_*
        ├── phase17b_state_residency_*
        ├── phase17c_death_queue_*
        ├── phase17d_pipeline_*
        ├── phase17e_upload_decompose_*
        ├── phase17f_extract_decompose_*
        ├── phase17g_floor_dissect_*
        ├── phase17h_c_death_sweep_*
        ├── phase17h_c1_persistent_upload_*
        └── phase17h_gpu_validate_*

../modifiers/              # 20 modifier implementations
├── FadeModifier.js        ─
├── ScaleModifier.js        │
├── VelocityModifier.js     │
├── RotationModifier.js     │
├── AttractionModifier.js   │
├── OrbitModifier.js        │
├── WindModifier.js         │
├── ForceModifier.js        │
├── ColorModifier.js        │
├── TurbulenceModifier.js   │
├── AnimationModifier.js    │
├── AnimatedSpriteModifier.js│ (CPU-only)
├── SpawnModifier.js        │ (CPU-only)
├── TrailModifier.js        │ (CPU-only)
├── CollisionModifier.js    │ (CPU-only)
└── ... (ModifierStack, ModifierRegistry, etc.)
```

---

## 3. Architecture & Data Flow

### 3.1 Public API (`ParticleSystem`)

`ParticleSystem` is a thin facade that delegates everything to a `_backend`. By default it creates a `CpuParticleBackend`. The GPU backend is created explicitly:

```js
const system = new ParticleSystem({
  backend: new GpuParticleBackend({ mode: "compute", canvas, gpuPersistentUpload: true })
});
```

### 3.2 Frame Update Loop

```
ParticleSystem.update(dt)
    │
    ├── CpuParticleBackend.update(dt)
    │      ├── beginFrame modifiers
    │      ├── for each active particle:
    │      │     storage.integrateParticle(p, dt)   [Euler: v+=a·dt, pos+=v·dt, life-=dt]
    │      │     update modifiers (per-particle)
    │      ├── death sweep: if life ≤ 0 → onDeath → release
    │      └── endFrame modifiers
    │
    └── GpuParticleBackend.update(dt)
           │
           ├── mode="operator"
           │     (same as CPU but with SimulationBufferView +
           │      GpuPassExecutor.runPass for each pass group)
           │
           └── mode="compute"  ─── async _updateCompute(dt)
                  │
                  ├── _ensureWebGpu()  [lazy init, once]
                  │
                  ├── persistentUpload=false  (full readback path)
                  │     dispatcher.dispatch(storage, uniforms)
                  │       → upload all particles to GPU buffer
                  │       → submit compute shader
                  │       → download GPU buffer back to CPU storage
                  │     → CPU death sweep over active list
                  │
                  └── persistentUpload=true  (zero-readback path)
                        dispatcher.ensureParticleBuffer(cap)
                        _cpuDeathSweep(dt)  [CPU decrements life, compacts]
                        dispatcher.dispatchOnly(storage, uniforms)
                          → submit compute shader only (no readback)
                          → GPU processes same life value
```

### 3.3 Render Loop

```
ParticleSystem.render(ctx)
    │
    ├── CpuParticleBackend: build RenderData → fill CommandBuffer → CanvasRenderer
    │
    ├── GpuParticleBackend (operator mode): same as CPU path
    │
    └── GpuParticleBackend (compute mode + GPU renderer):
          WebGpuParticleRenderer.setParticleBuffer(computeBuffer)
          WebGpuParticleRenderer.render(particleCount, textureView)
            → instanced draw: 6 indices × particleCount
            → vertex shader reads particle struct from storage buffer
            → null-particle culling: alive=0 → degenerate position
```

### 3.4 Emission

```
ParticleSystem.emit(count, initializer, emitter)
    → backend.emit(count, initializer, emitter)
        → for i in 0..count:
              storage.acquire()         → get accessor from free list
              acc.wrap(accessor)        → bind to SoA/Object storage
              initializer(p, i, emitter)→ user sets fields
              p.alive = 1
              persistentUpload mode:
                  persistentSlots.push(p._i)

        → persistentUpload mode:
              writeSlots(persistentSlots, storage)
                → sorts slots, finds contiguous ranges
                → one writeBuffer per contiguous range
```

---

## 4. Storage Layer

### SoAParticleStorage (primary)

20 parallel `Float32Array`/`Uint8Array` typed arrays, one per particle field. A particle is a vertical slice at shared index `_i`.

- **Access:** `SoAParticleAccessor` proxies get/set into typed arrays (e.g., `acc.x` → `_x[_i]`).
- **Free list:** LIFO stack of slot indices. `acquire()` pops; `release()` pushes.
- **GPU upload:** `fillUploadBuffer()` interleaves active particle data into a flat `Float32Array` matching `ParticleBufferLayout` (20 floats per particle).
- **Dirty tracking:** Write-through via `_markDirty(index)` tracks a dirty range `[_minDirty, _maxDirty]` for incremental uploads.
- **Growth:** `_grow()` doubles capacity, creates new arrays, copies subarrays.

### ObjectParticleStorage (fallback)

Uses `ActivePool` to manage plain `Particle` objects. Simpler, no dirty tracking, better for CPU-only paths.

### StorageResolver

Factory with `isSoA()`, `isObject()`, `createDefault()`, `createAccessor()` — used by backends to abstract over storage type.

---

## 5. Accessor Layer

Bridges the gap between field-oriented modifier code and the underlying storage layout.

| Accessor | Storage | Field Access |
|---|---|---|
| `SoAParticleAccessor` | SoA typed arrays | `_x[_i]`, `_y[_i]`, ... |
| `ObjectParticleAccessor` | Objects | `particle.x`, `particle.y`, ... |

Both implement the same interface (`x`, `y`, `vx`, `vy`, `life`, `maxLife`, `ageRatio`, `rotation`, `rotationSpeed`, `size`, `alpha`, `depth`, `r`, `g`, `b`, `alive`, `seed`, `segment`, `_i`, `_activeIndex`, `__jygameId`, `__jygameSortOrder`, etc.).

---

## 6. Modifier System

### Definition (in `../modifiers/`)

Each modifier implements `toDescriptor()` → returns a descriptor with `{ type, pass, properties }`. Modifiers are registered via `addModifier(modifier, priority)` and sorted by priority.

### Compilation

```
addModifier(fadeModifier, 0)
addModifier(velocityModifier, 1)

_rebuildProgram()
  → ModifierCompiler.compile(descriptors)
     → validates GPU compatibility
     → groups into passes: integration, force, visual
     → produces GpuProgramDescriptor

  → mode="compute":
      → WgslGenerator.generate(programDescriptor)
         → for each pass, for each descriptor:
             resolve shader operator by type
             shaderOperator.emit(descriptor) → WGSL code
         → produces GpuComputeProgram with full WGSL source

  → mode="operator":
      → GpuPassExecutor compiles pass lists
```

### Lifecycle Hooks

| Hook | When | CPU | Compute |
|---|---|---|---|
| `beginFrame` | Start of `update()` | ✓ | ✓ (in WGSL) |
| `onEmit` | During `emit()` | ✓ | ✓ (in WGSL) |
| `update` | Per particle per frame | ✓ | ✓ (in WGSL) |
| `onDeath` | When particle dies | ✓ | ✓ (CPU after sweep) |
| `endFrame` | End of `update()` | ✓ | ✓ (in WGSL) |

### GPU-Compatible Modifiers (11)

Fade, Scale, Velocity, Rotation, Attraction, Orbit, Wind, Force, Color, Turbulence, Animation

### CPU-Only Modifiers (4)

AnimatedSprite, Spawn, Trail, Collision

---

## 7. GPU Compute Pipeline (WebGPU)

### Initialization

```
WebGpuDeviceManager.initialize()
  → navigator.gpu.requestAdapter()
  → adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize } })
```

### Dispatch Path

```
GpuComputeDispatcher.dispatchOnly(storage, uniforms)
    │
    ├── ensureParticleBuffer(capacity)
    │     → creates/replaces GpuParticleBuffer(STORAGE|COPY_DST|COPY_SRC)
    │
    ├── persistentUpload? _seedBuffer(storage) : upload(storage)
    │     seed:  uploadFromStorage → write all particles once
    │     non-persistent: upload → write all particles every frame
    │
    ├── _uniformBuffer.write({dt, elapsedTime, particleCount})
    │     → device.queue.writeBuffer (16 bytes)
    │
    ├── _ensureComputeBindGroup()
    │     → GpuComputePipelineCache.getBindGroup(particleBuffer, uniformBuffer)
    │
    └── _submitCompute(count)
          ├── commandEncoder.beginComputePass()
          ├── setPipeline, setBindGroup(0), dispatchWorkgroups(ceil(count/64))
          ├── optional: GpuAliveFlagManager extraction pass
          └── device.queue.submit([encoder.finish()])
```

### Shader Generation (WgslGenerator → WebGpuWgslConverter)

```
User modifiers
    → ModifierCompiler → descriptors grouped by pass
    → WgslGenerator.generate(descriptor)
        → struct ParticleData { 20 fields }
        → struct SimUniforms { dt, elapsedTime, particleCount }
        → var<storage, read_write> particles : ParticleBuffer
        → var<uniform> uniforms : SimUniforms
        → for each pass (integration, force, visual):
            → for each modifier descriptor:
                → getShaderOperator(type).emit(descriptor)
                → appends WGSL code
        → full WGSL source

    → WebGpuWgslConverter.toWebGpuWgsl(wgsl)
        → rewrites bare field references → particles.data[index].field
        → injects base integration (velocity Verlet, life decay)
        → returns final WGSL
```

### Persistent Upload Mode (Phase 17H-C)

```
Key insight: GPU owns simulation state; CPU only needs lifecycle.

Frame N:
  1. CPU decrements storage._life by dt for ALL active particles
  2. CPU detects death: life ≤ 0 → onDeath → release → free list
  3. CPU compacts active list (linear scan, write cursor)
  4. CPU emits new particles → acquire from free list → writeSlots to GPU
  5. CPU submits compute dispatch → GPU decrements life AGAIN
     (CPU and GPU stay in sync: both decrement by dt per frame)
  6. CPU does NOT read back GPU results (0ms readback)

Result: No GPU readback, no staging buffer, no promise chains.
Upload is ONLY for newly emitted particles (writeSlots).
Death sweep is pure CPU, cost scales with active count.
```

---

## 8. Rendering

### CanvasParticleRenderer

Iterates command buffer, calls `ctx.drawImage` or fills rects per particle. Used by CPU backend.

### GpuParticleRenderer (WebGL2)

Instanced rendering: one draw call per texture batch. Instance buffer has 17 floats per particle (position, rotation, size, color, UV). Vertex shader transforms a unit quad, fragment shader samples texture.

### WebGpuParticleRenderer (WebGPU)

Reads particle struct directly from compute storage buffer via `@group(0) @binding(0)`. Vertex shader emits degenerate position for dead particles (alive=0). Single `drawIndexed(6, particleCount)` call.

---

## 9. Phase 17 Optimization Journey

### Phase 17D — Pipeline Bottleneck Attribution
- **Problem:** CPU frame time dominated by upload (~97.6–99.9%)
- **Fix:** Identified upload as the bottleneck

### Phase 17E — Upload Decomposition
- **Problem:** Within upload, `fillUploadBuffer()` data extraction was 88–92%
- **Fix:** Confirmed extraction as the sub-bottleneck

### Phase 17F — SoA Direct Fill
- **Problem:** String property lookup `[fieldName]` was 93.5% of extraction
- **Results:**
  | Count | Before | After | Speedup |
  |-------|--------|-------|---------|
  | 250k  | 404ms  | 25.8ms | 15.7× |

### Phase 17G — Upload Floor Dissection
- **Problem:** Remaining cost was memory-bandwidth bound (~1.1 GB/s on SwiftShader)
- **Insight:** Hardware limit on upload speed

### Phase 17H-A — GPU Validation
- **Problem:** Vulkan disabled (SwiftShader fallback)
- **Fix:** Enabled Vulkan → detected AMD Radeon R5 M330 (GCN-1)

### Phase 17H-B — Architecture Design
- **Decision:** Hybrid ownership — GPU simulates, CPU manages lifecycle
- **Key constraint:** No GPU readback on GCN-1 (mapAsync ~400ms)

### Phase 17H-C — Persistent Upload + CPU Death Sweep
- **Problem:** GPU readback via mapAsync took ~400ms on GCN-1 (unusable)
- **Solution:** Replace GPU readback with CPU-side `life -= dt` + compaction
- **Death sweep evolution:**
  | Version | 250k/90% | Technique |
  |---------|-----------|-----------|
  | Initial (GPU readback + sweep) | ~458ms | readAliveFlags + sweep |
  | CPU decrement (two-pass) | 238ms | batch decrement + batch compaction |
  | + no _resetSlot | 161ms | skip slot zeroing |
  | **+ combined single-pass**  | **117ms** | **decrement + compact in one loop** |

- **writeSlots evolution:**
  | Version | 250k/30% (75k emits) | Technique |
  |---------|----------------------|-----------|
  | Per-slot writeBuffer | 102ms | 75,000 DMA calls |
  | **+ contiguous batching** | **74ms** | **sort + one DMA per range** |

### Current Best Numbers (GCN-1, AMD Radeon R5 M330)

**Death sweep (pure CPU, 0ms GPU readback):**

| Particles | 10% death | 50% death | 90% death |
|-----------|-----------|-----------|-----------|
| 10k       | 0.58ms    | 1.07ms    | 1.88ms    |
| 50k       | 4.16ms    | 8.04ms    | 12.12ms   |
| 100k      | 9.37ms    | 23.71ms   | 33.19ms   |
| 250k      | 33.51ms   | 79.41ms   | 117.23ms  |

**Continuous churn (30% emit + death per frame):**

| Particles | Upload (writeSlots) | Sweep | Total/frame |
|-----------|-------------------|-------|-------------|
| 10k       | 2.29ms (3k parts) | 0.61ms | 2.90ms |
| 50k       | 12.30ms (15k)     | 4.66ms | 16.97ms |
| 100k      | 26.73ms (30k)     | 15.63ms | 42.36ms |
| 250k      | 74.02ms (75k)     | 59.81ms | 133.82ms |

**Legacy upload baseline (Phase 17F, full upload of all particles):** 47ms at 250k.

**Key insight:** The persistent upload path has a different cost profile. At 250k/30% churn, the total per-frame (133.82ms) is higher than the legacy baseline (47ms). But at counts ≤100k, the total (42.36ms) is at parity or better. The architecture is optimized for typical use cases (≤10k particles, ~3ms/frame).

---

## 10. Testing & Benchmarks

### Unit Tests (44 total, Node.js)

| Suite | Tests | What It Validates |
|-------|-------|-------------------|
| ComputeParity | 9 pass, 1 skip (WebGPU) | CPU vs Operator modifier parity |
| ModifierParity | 9 | Field-by-field modifier output parity |
| EmitParity | 3 | Emission count and state correctness |
| LifecycleParity | 3 | Death timing and slot reuse |
| WgslVerification | 29 | WGSL struct, binding, pass generation |

### Benchmarks (13 pairs, browser only)

Run via `python3 serve.sh` in the benchmarks directory, then open `http://localhost:8000/phase17h_c_death_sweep_benchmark.html`

---

## 11. File Reference

### Core Architecture Files

| File | Lines | Role |
|------|-------|------|
| `ParticleSystem.js` | 171 | Public API facade |
| `ParticleEffect.js` | 154 | Effect wrapper |
| `ParticleEmitter.js` | 160 | Emission controller |
| `ParticleSortManager.js` | 180 | Sorting (age, depth, custom) |
| `SimulationContext.js` | 100 | Slot/accessor context abstraction |
| `ModifierStateStore.js` | 95 | Per-modifier per-particle state |

### Storage

| File | Lines | Role |
|------|-------|------|
| `SoAParticleStorage.js` | ~300 | Primary storage: 20 typed arrays |
| `ObjectParticleStorage.js` | ~100 | Object storage via ActivePool |
| `StorageResolver.js` | 60 | Factory + type detection |

### Backends

| File | Lines | Role |
|------|-------|------|
| `CpuParticleBackend.js` | ~360 | Pure CPU simulation |
| `GpuParticleBackend.js` | 618 | Operator + Compute modes |

### GPU Layer

| File | Lines | Role |
|------|-------|------|
| `ModifierCompiler.js` | 151 | Descriptor → pass layout |
| `WgslGenerator.js` | ~200 | Pass layout → WGSL |
| `GpuPassExecutor.js` | 127 | CPU-side operator execution |
| `ParticleBufferLayout.js` | 55 | 20-field layout constants |
| `SimulationBufferView.js` | 77 | SoA get/set/integrate |

### WebGPU Platform

| File | Lines | Role |
|------|-------|------|
| `GpuComputeDispatcher.js` | 204 | Upload → dispatch → readback orchestrator |
| `GpuParticleBuffer.js` | 263 | GPU storage + staging buffer pair |
| `GpuComputePipelineCache.js` | 93 | Pipeline/module/layout cache |
| `GpuAliveFlagManager.js` | ~150 | Alive-flag extraction shader |
| `GpuUniformBuffer.js` | 49 | 16-byte uniform (dt, time, count) |
| `WebGpuDeviceManager.js` | 65 | Singleton adapter + device |
| `WebGpuWgslConverter.js` | ~150 | WGSL struct binding injection |

### Renderers

| File | Lines | Role |
|------|-------|------|
| `CanvasParticleRenderer.js` | ~120 | Canvas2D rendering |
| `GpuParticleRenderer.js` | 381 | WebGL2 instanced rendering |
| `WebGpuParticleRenderer.js` | 335 | WebGPU storage-buffer rendering |
| `ParticleRenderCommandBuffer.js` | 90 | Flat Float32Array command buffer |
| `ParticleRenderData.js` | 35 | Sorted/unsorted particle view |

### Renderers (Abstract)

| File | Lines | Role |
|------|-------|------|
| `ParticleRenderer.js` | 16 | Abstract base class |

---

## 12. Control Flow Diagram

```
User Code
    │
    ├── new ParticleSystem({ backend: GpuParticleBackend })
    │     ├── StorageResolver.createDefault() → SoAParticleStorage
    │     └── GpuParticleBackend
    │           ├── ModifierCompiler
    │           ├── GpuPassExecutor (operator mode only)
    │           └── GpuComputeDispatcher (lazy, after _ensureWebGpu)
    │
    ├── system.addModifier(fadeModifier)
    │     └── backend.addModifier → marks _isDirty = true
    │
    ├── system.emit(100, initFn)
    │     └── backend.emit → storage.acquire × 100
    │           → initFn(p, i) → p.alive = 1
    │           → persistentUpload? writeSlots(slots, storage)
    │
    ├── system.update(dt)
    │     └── GpuParticleBackend._updateCompute(dt)
    │           ├── _ensureWebGpu() [once]
    │           ├── _rebuildProgram() [if dirty]
    │           ├── _cpuDeathSweep(dt)  [persistent mode]
    │           │     └── lifeArr[idx] -= dt → compact
    │           └── dispatcher.dispatchOnly(storage, uniforms)
    │                 └── _submitCompute(count)
    │                       └── GPU: workgroup(64) × ceil(count/64)
    │
    └── system.render(ctx)
          └── GpuParticleBackend.render
                ├── GPU mode: WebGpuParticleRenderer
                │     → instanced draw from storage buffer
                └── CPU mode: build RenderData → fill CommandBuffer
                      → CanvasParticleRenderer / GpuParticleRenderer
```

---

## 13. Key Design Decisions

1. **No GPU death readback** — `mapAsync` on GCN-1 took ~400ms, replaced with CPU-side life tracking and batch compaction (Phase 17H-C).

2. **Persistent upload** — GPU buffer is seeded once; only emitted particles are written each frame (writeSlots). Saves full 20MB upload per frame at 250k.

3. **CPU death sweep** — O(n) per frame (decrement life for all active particles). Acceptable for ≤10k particles (~2ms), scales linearly.

4. **Batch compaction over swap-remove** — Single-pass linear scan with write cursor. Avoids `_resetSlot` (20 array zeroings per death). Dead slot data is overwritten by next emit's writeSlot.

5. **WriteSlots contiguous batching** — Sort slot indices, find runs, one writeBuffer per contiguous range. Transforms 75k DMA calls into 1 in the common case.

6. **SoA primary storage** — Cache-friendly for CPU iteration; direct float array views for GPU upload; no object overhead.

7. **Dual shader path** — 11 operators have both CPU (Operator) and GPU (Shader) implementations, verified by parity tests.

8. **Lazy WebGPU init** — `GpuParticleBackend._ensureWebGpu()` runs on first compute update, not at construction. Graceful fallback to operator mode if WebGPU unavailable.
