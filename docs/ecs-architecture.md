# Phase 1 — ECS Architecture Design

## Executive Summary

The new ECS replaces the current "entity as bag-of-properties" (Sprite owns Transform, Collider, Renderable by hardcoded construction) with an archetype-based data-oriented architecture that mirrors the pattern already proven in the particle engine. It is designed as four incremental layers so each can be built, tested, and shipped independently without a big-bang migration.

---

## Architecture Layers

| Layer | Subsystems | Dependency |
|-------|-----------|------------|
| **1 — Foundation** | Component Registry, Entity Manager, Storage | None |
| **2 — World** | Archetype System, Table Graph, Deferred Commands | Layer 1 |
| **3 — Execution** | Query Engine, System Pipeline | Layer 2 |
| **4 — Integration** | Resources, Events, Migration Bridge | Layer 3 |

Each layer exposes a minimal interface to the layer above. No layer reaches across to bypass another.

---

## Foundation Layer

### Component Registry

**Responsibility:** Assign numeric IDs to component types, store their field schemas, and provide a canonical mapping from "component class or name" to `(id, fieldDescriptors)`.

**Design:**

- Each component is registered explicitly with a schema that describes its fields and their types. Example: `Transform(x: f32, y: f32, rotation: f32, scaleX: f32, scaleY: f32)`.
- The registry assigns a dense, monotonic integer ID (0–65535) per registration. The first N IDs are reserved for built-in engine components so their IDs are stable across builds.
- The schema drives typed-array column construction (Layer 1 Storage): each `f32` field becomes one `Float32Array`, each `u8` field becomes one `Uint8Array`, and so on.
- The registry also stores default values per field, used when an entity first receives a component and when a row is recycled.

**Tradeoff — field-level vs struct-level schema:**
- *Field-level* (one typed array per primitive field, matching the particle engine): maximally cache-friendly when iterating a single field; natural alignment; simplest interop with the existing `SoAParticleStorage` pattern. Slightly more metadata to manage.
- *Struct-level* (one typed array per component, using stride+offset): fewer arrays, closer to Flecs' opaque blob model. But JS lacks raw pointer arithmetic, so field access would require division+modulus or a wrapper — adding overhead.
- **Chosen: Field-level.** It directly mirrors the existing particle engine pattern, is cache-predictable, and avoids the struct-packing complexity that JS handles poorly.

**Ownership:** The registry is owned by the World and is read-only after World construction (registration is allowed only during a setup phase or explicitly at any time if no archetypes have been created yet).

### Entity Manager

**Responsibility:** Allocate, recycle, and look up entity IDs. Track which archetype and row each entity occupies.

**Design:**

- Entity ID is a single positive integer. It packs a 24-bit slot index and 8-bit generation: `id = (generation << 24) | index`. This supports up to 16M entities with 256 reuse generations per slot — sufficient for any 2D game session.
- A sparse array (`entities`) maps slot index → `{ archetypeId, row, generation }`. The generation comparison guards against stale ID usage (use-after-free).
- A free-list of slot indices supports O(1) recycling. When an entity is destroyed, its slot index is returned to the free list and its generation is incremented.
- Entity ID 0 is reserved as a null/sentinel value, matching Flecs' convention.
- Lookup by ID: extract the slot index and generation, verify match, return the `(archetypeId, row)` pair. This is a hash-table-free O(1) operation at the cost of the generation guard.

**Tradeoff — packed u64 vs separate fields:**
- Flecs packs 64-bit entity IDs as `(index: u32, generation: u32)`. JavaScript numbers are IEEE 754 doubles with 53-bit integer precision, so we can safely pack `(generation: 8, index: 24)` = 32 bits. The reserved top bits are unused but available for future flags.
- An alternative is to store `{ id: number }` objects, but that defeats the data-oriented goal and adds GC pressure.
- **Chosen: Packed 32-bit number.** The 16M / 256-gen limit is generous for a 2D engine, and the single-number representation enables efficient sets, maps, and typed arrays of entity IDs.

**Entity lifecycle:**
1. **Create:** Pop a slot from the free list, increment its generation (if recycled), pack the ID, look up or create the archetype for the initial component set, allocate a row, write default component values.
2. **Destroy:** Unpack the ID, verify it is alive, run `onRemove` hooks for each component (deferred), return the slot to the free list, increment generation.
3. **Add/Remove component:** Handled by the Archetype System (Layer 2) — the entity manager only updates its sparse entry with the new archetype and row.

### Storage (Table Columns)

**Responsibility:** Own the dense typed-array columns for one archetype's component data.

**Design:**

- Each archetype table owns one typed array per component field. This is literally the same pattern as `SoAParticleStorage._x`, `_y`, `_vx`, etc., but dynamically generated from the component registry's field schemas.
- A table also owns a `Uint32Array` of entity IDs (column 0 — not a component, but intrinsic to the table), and a sparse per-row "generation" check used during swap-remove to avoid stale access.
- Growth strategy (from the particle engine, unchanged):
  - Start at a small power-of-2 capacity (e.g., 64).
  - Double when full, up to an optional `maxCapacity`.
  - On growth, allocate new typed arrays, copy old data via `TypedArray.set()`, discard old arrays.
- Deletion uses swap-remove (copy the last entity's data into the vacated row, decrement `count`). This preserves density — no holes — at the cost of updating the entity manager's sparse entry for the moved entity. Swap-remove is O(1) in both the entity array and every component column.
- Unused rows (above `count` but below `capacity`) are not reset eagerly — reset is lazy on re-acquisition, matching the particle engine's `_resetSlot` approach.

**Edge case — zero-component archetype:**
- An archetype with no components is valid. It is a pure "tag" — it carries only the entity ID column. This is useful for entity groups that serve as markers without data.
- The zero-component table has no typed array columns beyond the entity ID array.

**Relationship to particle storage:**
- The particle engine's `SoAParticleStorage` is effectively a single table with a fixed set of 20 typed array columns. The new ECS generalizes this to N tables each with a dynamic set of columns derived from component registration.
- The column management code (growth, copying, swap-remove, reset-on-acquire) should be extracted into a shared utility. Both the particle storage and the ECS table can delegate to it. This is the core "shared abstraction" between the two systems.

---

## World Layer

### Archetype System

**Responsibility:** Maintain the mapping from "set of component IDs" → "table." Create new archetypes on demand.

**Design:**

- An archetype is uniquely identified by its component signature — a sorted array of component IDs.
- Archetype lookup uses a `Map` keyed by a string or typed-array digest of the signature. Since archetype registration is infrequent (once per unique component combination ever seen at runtime), the string-keyed map lookup is not on a hot path.
- Each archetype stores:
  - `id` (monotonic integer)
  - `signature` (sorted array of component IDs)
  - `table` (the Storage for this archetype)
  - `edges` (the Table Graph — see below)

**Archetype creation:**
1. A migration requires a target archetype (e.g., current `[Position]` + add `[Velocity]` → target `[Position, Velocity]`).
2. If the target archetype does not exist, create it: register with the World, create a new table with the combined component columns, add it to the query cache's pending rebuild set.
3. If it exists, return it immediately.

**Tradeoff — eager vs lazy archetype creation:**
- *Eager:* Pre-generate all possible archetypes for registered components. Exponential blowup — impossible for any non-trivial component count.
- *Lazy (chosen):* Create archetypes on first transition. First add/remove pair between two signatures creates the target archetype. Subsequent transitions are a cache hit. This matches Flecs' approach and is the only practical choice for an open system.

**Signature representation:**
- A sorted `Uint16Array` of component IDs.
- Queries test subset membership by scanning the query's `all` set against the archetype's signature using a merge-join (two pointers, O(a+b)) or a Bloom-filter pre-check for early rejection.
- Component count per archetype is expected to be small (1–15 in practice), so the linear scan is negligible on the hot path.

### Table Graph

**Responsibility:** Cache the result of archetype transitions so add/remove operations are O(1) after the first transition between two archetypes.

**Design:**

- Each archetype node stores two light maps:
  - `addEdge: Map<componentId, archetypeId>` — add this component → go to this archetype
  - `removeEdge: Map<componentId, archetypeId>` — remove this component → go to this archetype
- When an entity adds a component:
  1. Look up `addEdge` for the component ID.
  2. If the edge exists, the target archetype is known — migrate directly.
  3. If the edge does not exist, compute the new signature (current + component), look up or create the archetype, store the edge.
- The graph structure is a forest (in practice, a DAG) rooted at the empty archetype. Cycles cannot occur because adding a component always produces a strictly larger signature (in component-count terms).
- Edges are never evicted — the number of distinct transitions in a game session is bounded by the number of distinct component combinations ever used, which is orders of magnitude smaller than the theoretical maximum.

**Bulk transitions:**
- Adding or removing multiple components at once can skip intermediate archetypes by computing the target signature directly: `sorted(union(current, toAdd) \ toRemove)`.
- This avoids N sequential migrations when adding 3 components to an entity.

### Deferred Commands

**Responsibility:** Queue entity mutations that occur during iteration and flush them when iteration is complete, preventing invalidation of table rows mid-iteration.

**Design:**

- Commands are: `Create`, `Destroy`, `Add<T>`, `Remove<T>`, `Set<T>` (set component value).
- The World exposes a command buffer. During system execution (or any explicit "defer" scope), mutations are appended to the buffer instead of executing immediately.
- On flush, commands are processed in order:
  1. Creates first (so subsequent Add commands reference valid entities).
  2. Then Adds, Removes, Sets.
  3. Then Destroys (after all other commands have been processed).
- After flush, lifecycle hooks fire:
  - For each component that was added to an entity: `onAdd` observers.
  - For each component that was removed: `onRemove` observers.
  - For each destroyed entity: `onDestroy` observers.
- Nested command buffering (buffer while flushing) is an error and should throw early.

**Concealed complexity:**
- A deferred `Add<T>` must record which entity, which component, and the initial component value. This requires a staging area that holds the value until flush.
- A deferred `Remove<T>` must record which entity and component ID.
- The command buffer design can be a simple array of tagged structs (plain objects). Allocation at this rate (once per mutation, not per frame) is acceptable. For zero-allocation frames, a ring buffer of pre-allocated command slots can be used.

**Why not execute immediately?**
- In Flecs/jygame, during a query iteration, the table's row count and entity order must not change. Add/Remove changes the entity's archetype (moves to a different table). Destroy removes a row. All three invalidate the current iteration's row pointers.
- In some games, immediate mutation is desirable (e.g., a collision callback that destroys both entities). Deferred commands serve this: queue the destruction, flush after the collision system finishes, the entities die on the same frame but iteration remains safe.

---

## Execution Layer

### Query Engine

**Responsibility:** Find all archetypes matching a component filter. Cache and incrementally update the match set.

**Design:**

- A query consists of three component sets:
  - `all` (must include all of these)
  - `any` (must include at least one of these)
  - `none` (must include none of these)
- The query stores a `Set<archetypeId>` or array of matching archetype IDs.
- When a new archetype is created, the engine tests it against every registered query. The test is:
  1. `(queryAll ⊆ signature)` — all required components present.
  2. If `any` is non-empty: `(queryAny ∩ signature) ≠ ∅`.
  3. `(queryNone ∩ signature) = ∅` — no excluded components present.
- Matching archetypes are added to each query's match set.
- Queries are never evicted. (Archetypes are not destroyed — entities can migrate out, but the table persists.)

**Iteration model:**
- A query iterator yields one "chunk" at a time: all entities from one matching archetype.
- For each chunk, the iterator provides:
  - The entity ID array (read-only)
  - For each requested component: the typed array column (read-write)
  - The row range (start, count) within the table
- Systems access these arrays directly — no per-entity callback. This is the key performance characteristic: a system iterating 10,000 entities with `[Transform, Sprite]` gets two `Float32Array` views and a `Uint32Array` of entity IDs, and processes them in a tight loop.

**Tradeoff — archetype-level vs entity-level iteration:**
- *Entity-level:* call a callback per entity. More convenient, less cache-friendly.
- *Archetype-level (chosen):* iterate columns in bulk. Matches the particle engine's `fillUploadBuffer` pattern (interleave-free per-field access). Enables WASM-accelerated batch processing in the future.

### System Pipeline

**Responsibility:** Define when systems run and in what order. Execute them.

**Design:**

- Systems are registered with the World. Each system specifies:
  - A query (what entities it operates on)
  - A phase (when it runs)
  - Optionally, a list of system IDs that must run before it (explicit ordering)
- Phases are ordered strings or enums. The built-in phases in execution order:

  ```
  PreUpdate → Update → PostUpdate → PreRender → Render → PostRender
  ```

  Custom phases can be inserted between these.
- Within a phase, systems run in registration order unless explicit dependencies force reordering. Dependency cycles are detected and reported as errors.
- Each phase is executed in sequence. Between phases, deferred commands are flushed (so an `Update` phase system can queue entity creations that are available to `PostUpdate` systems on the same frame).
- Systems can be enabled/disabled at runtime. A disabled system is skipped but its query cache remains valid.

**System signature:**

```
system(query, phase, fn(world, iterator, dt))
```

Systems receive the `iterator` from their query, not raw entity lists. They call `iterator.next()` to advance through matching archetype chunks.

**Relation to current engine:**
- Today's `MovementSystem`, `AnimationSystem`, `RenderSystem`, `CollisionSystem` are standalone classes with hand-written update loops. In the new architecture, each would be converted to a registered system with a query, e.g.:
  - `MovementSystem` → system with query `[Transform, Velocity]` in phase `Update`
  - `RenderSystem` → system with query `[Transform, Sprite]` in phase `Render`
- The conversion is deferred to Phase 6 (migration strategy).

---

## Integration Layer

### Resources

**Responsibility:** Provide global singleton data accessible to systems.

**Design:**

- A resource is a single instance of a registered type, owned by the World.
- Resources are identified by their constructor/class or a string key.
- Systems can declare resource dependencies alongside their component query. At execution, the system receives the resource instance.
- Common resources:
  - `Time` — `dt`, `elapsed`, `alpha` (interpolation factor)
  - `InputState` — current keyboard/mouse/pointer state
  - `Renderer` — canvas context, camera transform
  - `AssetRegistry` — loaded textures, audio, fonts
- Unlike entities, resources never change archetype. They are a fixed mapping from class to instance.

**Relationship to Flecs' singleton approach:**
Flecs treats singletons as components on a special hidden entity. This is elegant but adds a lookup indirection on every access. For jygame, a simpler `Map<class, instance>` with direct access is fine — the number of resources is small (< 20) and the lookup is not on a hot path (systems cache the resource reference during setup or each frame start).

### Events

**Responsibility:** Notify observers of component and entity lifecycle changes. Provide a foundation for user-defined event systems.

**Design (high-level, not implementation):**

- Two categories of events:
  1. **Built-in lifecycle events:** `onAdd`, `onRemove`, `onSet`, `onCreate`, `onDestroy`. These fire automatically when deferred commands are flushed.
  2. **User-defined events:** Emitted explicitly (e.g., `world.emit('Collision', { a, b })`). Observers can be per-component-type or global.
- Observers are registered by the user. They receive the event payload.
- Lifecycle events fire immediately during command flush, in entity order. User-defined events fire immediately on `emit()` unless inside a defer scope, in which case they are buffered and fire after the current flush.
- Events are *not* queued for the next frame by default. If a system needs delayed events, it manually stores them in a component or resource.

**What is NOT designed here:**
- The observer registration API is part of Phase 5 (Public API Design).
- The event queue internals, memory pooling of event objects, and observer list data structure are implementation details deferred to the implementation phase.

---

## Relationship with the Particle Engine

### Concepts to Share (Not Rewrite)

The particle engine should not be redesigned. The following concepts are architecturally shared but independently maintained:

| Concept | Particle Engine | ECS Equivalent |
|---------|----------------|----------------|
| Typed array columns | `SoAParticleStorage._x`, `_y`, ... | Table column per component field |
| Column growth | `_grow()` doubles capacity | Same strategy, extracted to shared utility |
| Swap-remove deletion | `release()` in active list | Same, applied to table rows |
| Free-list slot management | `_freeList` array | Entity Manager's slot free-list |
| Accessor pattern | `ParticleAccessor`+`SoAParticleAccessor` | Could be offered as optional convenience layer for component access |
| Backend abstraction | `CpuParticleBackend` / `GpuParticleBackend` | Future: system execution could use same backend dispatch |
| Buffer upload (GPU) | `fillUploadBuffer()` interleaves columns for transfer | Future: ECS tables could expose the same `fillUploadBuffer` interface for GPU compute |

### What Remains Independent

- The particle renderer (`CanvasParticleRenderer`, `WebGpuParticleRenderer`)
- The particle modifier system (`ModifierStack`, `ModifierCompiler`, `WgslGenerator`)
- The WASM death sweep
- The GPU compute dispatcher
- The particle-specific sorting (`ParticleSortManager`)

These are domain-specific optimizations for particles. They do not generalize to the ECS and should not be pulled into shared infrastructure.

### Integration Path

In the future (not Phase 1), a `ParticleComponent` could serve as a bridge: entities with `ParticleComponent` delegate to the particle engine for update and rendering. This makes particles "ECS-native" without rewriting the particle engine. The particle system's `emit()` creates an entity with `ParticleComponent`, and the particle engine's modifier system runs as a specialized system in the ECS pipeline.

---

## Key Design Decisions

| Decision | Alternative | Rationale |
|----------|------------|-----------|
| **Archetype-based** (vs sparse set) | Sparse set avoids migration cost | Dense iteration is more important for cache efficiency. Most entities do not change components frequently. Archetype matches particle engine philosophy. |
| **Field-level SoA** (vs struct-level AoS) | Struct-of-arrays per component | Directly mirrors existing `SoAParticleStorage`. Avoids JS struct-packing overhead. More flexible field-level queries. |
| **Swap-remove** (vs mark-sweep) | Mark-sweep avoids shuffling | Swap-remove is O(1), maintains density, and the moved entity's sparse entry update is also O(1). Mark-sweep requires a second pass and fragments memory. |
| **Deferred commands** (vs immediate mutation) | Immediate is simpler | Immediate mutation during iteration is unsound in archetype ECS. Deferred is the proven approach (Flecs, Bevy). |
| **Packed entity ID** (vs object) | Object is simpler to debug | Single number enables typed-array storage, efficient Sets, and avoids GC pressure. The 16M/256-gen limit is generous. |
| **Archetype-level iteration** (vs entity-level callback) | Callback is more ergonomic | Column-level bulk iteration matches the particle engine and enables future WASM acceleration. An optional entity callback wrapper can be added in the public API. |
| **Lazy archetype creation** (vs eager) | Eager is simpler conceptually | Exponential blowup makes eager impractical. Lazy is the standard approach in all modern ECS frameworks. |
| **Phased system pipeline** (vs dynamic scheduling) | Dynamic scheduling is more flexible | Phases are predictable and easy to debug. Within-phase reordering through explicit dependencies handles the 5% of cases that need it. Simpler to implement. |

---

## Boundary Conditions and Error Handling

| Condition | Behavior |
|-----------|----------|
| Register same component twice | Throw — component IDs must be unique |
| Use unregistered component in query | Throw at query creation |
| Use destroyed entity ID | Detect via generation mismatch — return null/undefined |
| Exceed maxCapacity on table growth | Throw (like SoAParticleStorage today) |
| Dependency cycle in system ordering | Throw during system registration |
| Command buffer mutation during flush | Throw — nested defer is an error |
| Archetype with 0 components | Valid — tag-only archetype; table has only entity ID column |
| Entity create with empty component set | Valid — entity exists in empty archetype (like a scene root) |
| Remove component entity does not have | No-op (silently ignored) |
| Add component entity already has | No-op (silently ignored) |

---

## What Phase 1 Does NOT Cover

The following are explicitly out of scope for this phase. They are the subjects of subsequent phases:

- **Storage internals** (Phase 2): precise column layout, chunk allocation, page-level growth, alignment.
- **Query engine internals** (Phase 3): match caching invalidation strategies, iterator memory, sorting/filtering.
- **Entity migration algorithms** (Phase 4): bulk copy between tables, reordering, edge computation.
- **Public API design** (Phase 5): ergonomic JavaScript API for the ECS.
- **Migration strategy** (Phase 6): how to incrementally convert existing engine subsystems to ECS without breaking existing user code.
- **Future extensions** (Phase 7): relations, multithreading, WASM systems, serialization, networking.

This layered separation ensures each subsystem can be designed, implemented, and tested independently. No subsystem needs to "know about" future extensions to be correct.
