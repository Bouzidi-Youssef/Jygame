# ECS Design Principles & Architectural Foundation

## Overall Philosophy

The new ECS is not a library that the engine uses. It **is** the engine.

The World becomes the execution runtime of the engine. Engine subsystems are no longer orchestrated by bespoke update loops with ad-hoc ordering; they participate in the same scheduling model as user systems. A `RenderSystem` registered with the World runs alongside user systems — it has no special status, no privileged access, no implicit ordering. The pipeline drives everything.

Entities are not objects. They are IDs. They own nothing. They carry no data. They are ephemeral tickets into tables.

Components are not objects. They are ranges within typed arrays. A `Transform` component is not an instance of a class sitting on an entity. It is a set of typed array columns (`x`, `y`, `rotation`, `scaleX`, `scaleY`) indexed by the entity's row within its archetype table.

Systems are not classes with methods. They are functions that receive typed array views and iterate them in tight loops.

The particle engine already embodies every one of these principles. The ECS does not invent a new philosophy — it generalizes the one already proven into a universal foundation.

---

## Why Archetypes (Not Sparse Sets)

There are two dominant ECS storage strategies: archetypes (Flecs, Bevy) and sparse sets (EnTT). The choice between them is the most consequential architectural decision because it dictates memory layout, iteration speed, and the mutation model.

| Property | Archetype | Sparse Set |
|----------|-----------|------------|
| Entity storage | Dense per signature | Dense per component |
| Iteration | Contiguous rows, sequential memory | Scattered lookups per component |
| Component add/remove | Migrate entity to new table | Update sparse metadata only |
| Query matching | Pre-computed archetype set | Component-level intersection |
| Iteration cache behavior | Predictable prefetch, single cache line per column | Random access into each component's dense array |

An archetype ECS stores each unique combination of components in its own table. All entities with `[Transform, Sprite, Collider]` live in one table. Adding `Velocity` moves the entity to the `[Transform, Sprite, Collider, Velocity]` table. The entity moves, but within each table, every row is densely packed, and iteration across all entities with a given signature is a linear scan of contiguous typed arrays.

A sparse set ECS stores each component independently. An entity ID maps to a slot in each component's dense array via a sparse index. Iterating `[Transform, Sprite]` requires walking the dense entity array, then for each entity, reading two sparse lookups to find its position in the `Transform` and `Sprite` arrays. These lookups are O(1) but unpredictable — each entity potentially hits a different cache line.

In games, the critical path is iteration, not mutation. Most entities keep a stable component signature for their entire lifetime. Bullets, enemies, particles, tiles, and UI elements do not add and remove components every frame. They are created with a fixed set and destroyed with the same set. Archetypes optimize the dominant case (iteration) and accept a controlled cost for the rare case (migration).

A secondary but important reason: the existing particle engine uses a single-table archetype already. `SoAParticleStorage` is an archetype table with a fixed signature. It stores 20 typed array columns and iterates them densely. The ECS is not introducing a new storage model; it is making the existing model dynamic.

---

## Why Field-Level SoA (Current Standard)

Given an archetype table, there are two natural ways to store component columns:

**Field-level SoA** (current standard):

```
transform.x:     Float32Array  [0, 0, 0, ...]
transform.y:     Float32Array  [0, 0, 0, ...]
transform.rot:   Float32Array  [0, 0, 0, ...]
transform.sX:    Float32Array  [0, 0, 0, ...]
transform.sY:    Float32Array  [0, 0, 0, ...]
```

**Struct-level SoA** (alternative, not the standard):

```
transform: Float32Array  [x0, y0, rot0, sX0, sY0, x1, y1, rot1, sX1, sY1, ...]
```

The struct-level approach stores each component as a fixed-stride struct within a single typed array. This is closer to Flecs' opaque blob model. It reduces the number of arrays and simplifies GPU upload (one buffer per component instead of one per field). However, in JavaScript, struct-level access requires arithmetic to compute offsets: `array[entityIndex * STRIDE + FIELD_OFFSET]`. This is not inherently slow, but it means every field access includes a multiply-and-add.

Field-level SoA eliminates that arithmetic. Accessing `transform.x[i]` is a direct typed array index. More importantly, an iteration that only needs `x` and `y` reads exactly two cache lines per batch, not five. A physics system that only touches `velocity.x` and `velocity.y` loads exactly those two arrays, not an entire struct containing rotation and scale that it does not use.

The particle engine already stores each field as its own typed array (`_x`, `_y`, `_vx`, `_vy`, ...). The ECS extends this pattern consistently. The metadata to map "component + field name" → typed array is stored once in the component registry, not computed at access time.

Field-level SoA also simplifies WASM and GPU compute integration. A WASM function that processes `transform.x` and `transform.y` receives two typed array pointers. A GPU compute shader binds each field as a separate storage buffer. No struct repacking is needed.

Field-level SoA is the standard layout. Alternative layouts (struct-level, hybrid, or packed) are permitted only when they demonstrate a measurable advantage for a specific subsystem. The standard should not be replaced speculatively.

---

## Why Deferred Commands Are Fundamental

Deferred commands are not a convenience feature. They are a correctness requirement of archetype ECS.

When a system iterates a table, it holds direct references to that table's typed array columns and relies on the row count remaining stable. Adding a component to an entity in that table moves the entity to a different archetype (triggering a swap-remove in the source table and append in the target table). Destroying an entity triggers a swap-remove in the source table. Both operations change the row count and potentially invalidate indices the system is currently iterating.

This is not a theoretical concern. It is the most common mutation pattern in games: "when two entities collide, destroy both." Without deferred commands, this pattern would corrupt the iteration state of whatever system discovered the collision.

Deferred commands solve this by buffering all mutations during system execution and flushing them between phases:
1. System runs, reads table data, queues `Destroy(entityA)`, `Destroy(entityB)`.
2. System finishes.
3. Flush: swap-remove both entities from their tables, fire `onRemove` hooks.
4. Next system runs with stable table state.

Deferred commands also handle inter-phase consistency. An `Update` phase system can create entities that a `PostUpdate` system immediately operates on, because the flush happens between phases. Without this, entity creation during update would require the user to manually defer creation or risk the creating system stumbling over partially-initialized state.

The command buffer is not expensive. Each command is a small fixed-size record (entity ID + component ID + optional value). For zero-allocation frames, the buffer can be a pre-allocated ring that simply discards old entries (commands are flushed every phase, never persistent across frames).

No alternative provides equivalent safety without sacrificing the dense iteration that defines the architecture.

---

## Why Dense Iteration Is Prioritized

Modern CPU performance is dominated by memory latency, not instruction throughput. A single cache miss costs hundreds of cycles that could have processed dozens of entities from dense arrays.

Consider two ways to iterate 10,000 entities:

**Dense (archetype table):**
```
transform_x:  [0, 1, 2, 3, 4, 5, ...]   sequential
transform_y:  [0, 1, 2, 3, 4, 5, ...]   sequential
```

The prefetcher recognizes the sequential access pattern and pulls future cache lines before they are needed. The CPU pipeline stalls near zero for memory access. A simple system updates 10,000 transforms in under 0.1ms.

**Sparse (current engine):**
```
for each entity:
  entity.transform.x += ...
  entity.transform.y += ...
```

Each entity is a JavaScript object with its `transform` pointing to another object allocated elsewhere on the heap. The iteration pointer jumps unpredictably between heap locations. The prefetcher cannot predict the next address. Every entity potentially misses the cache. The same system on the same 10,000 entities takes 2–5ms even though the arithmetic workload is identical.

This is not a theoretical advantage of archetypes. It is the fundamental reason archetype ECS designs exist. The particle engine already demonstrates it: CPU particle backends update 100,000 particles in < 1ms because `SoAParticleStorage._x[i]` is a linear typed array access, not `particles[i].x`.

Dense iteration also enables WASM and GPU offloading. A WASM function that processes dense arrays receives a pointer and a length — no object traversal, no property lookup. A GPU compute shader does the same with storage buffers. Sparse iteration cannot be meaningfully offloaded because the access pattern is inherently pointer-chasing.

The cost of denseness is migration on component add/remove. This is a deliberate tradeoff: pay the cost when signatures change (rare), reap the benefit every frame during iteration (common).

---

## How This Complements the Existing Particle Engine

The particle engine is not replaced. It becomes a specialized subsystem that runs within the same architectural philosophy.

### Shared Abstractions

The ECS generalizes the storage patterns that `SoAParticleStorage` pioneered. Column growth, swap-remove, free-list management, and typed array allocation are extracted into shared utilities that both the ECS table and the particle storage call. The particle engine's storage becomes a special case of the general pattern rather than a parallel implementation.

### Where the ECS Stops and the Particle Engine Begins

- The ECS handles entity lifecycle, component queries, archetype management, and system scheduling.
- The particle engine handles emission, modifiers, GPU compute, WASM death sweep, sorting, and specialized rendering.
- A `ParticleComponent` on an entity signals "this entity is managed by the particle engine." The particle engine reads from the ECS entity array and its own internal storage.

### Why Not Merge Them

Particles operate at an order of magnitude higher entity counts than game objects. A game might have 500 game entities and 50,000 particles. The particle engine's specialized optimizations (GPU compute, WASM sweep, batched emission) would complicate the general ECS with no benefit to normal entities. Keeping them separate with a thin bridge preserves the particle engine's ability to optimize aggressively for its domain while the ECS handles the general case cleanly.

### What the Particle Engine Gains

The particle engine does not need an entity abstraction today. But with an ECS bridge, particle emitters become entities. Particle effects become component combinations. Systems can query "which entities are emitters" and "which particles are near the player" using the same query API. The ECS gives the particle engine entity composition it does not have today, while the particle engine gives the ECS production-proven storage patterns it builds on.

---

## Architectural Invariants

These are non-negotiable. Every implementation decision in every subsequent phase must be tested against this list. They should still be true in version 3.0.

**Entities are IDs, not objects.**
No entity ever holds a reference to its components. An entity is a value that selects a row in a table. Do not add fields, methods, or metadata to entities.

**Components are pure data.**
A component is a collection of typed array fields. No methods. No constructors. No getters or setters on the canonical storage. The accessor pattern (like `ParticleAccessor` in the particle engine) is acceptable as a convenience layer for user code, but it must never be on the hot path or replace direct array access.

**Systems own behavior, components own data.**
No component carries domain logic. A `RigidBody` component stores mass, velocity, and forces — it does not have an `applyForce` method. `applyForce` is a system that reads `RigidBody` and writes `acceleration`. This separation is what enables future WASM and GPU execution: a system can be compiled to WGSL or WASM because it is a pure transformation over typed arrays.

**Archetypes own storage.**
Tables own component columns. The World owns archetypes. Systems never own persistent component data. Queries borrow data temporarily. Ownership should always be obvious from the architecture.

**Migration is the cost of density.**
If an entity's signature changes, move it to the correct table. Do not cache stale rows. Do not leave entities in a wrong archetype. The system that processes the entity expects it to be in the correct archetype.

**Deferred commands are required for correctness during iteration.**
Direct mutation of entity state during query iteration is not permitted. All mutations during iteration go through the command buffer and are flushed between phases. The buffer is cheap; an iteration corruption is a crash.

**Layers never reach upward.**
Foundation → World → Execution → Integration is a directed acyclic graph. Storage does not know about Systems. The Query Engine does not know about the Game loop. Each layer defines its interface for the layer above; the layer above depends on it, never the reverse.

**Table structure is never user-visible.**
Users query by component, not by archetype. Archetype IDs, table references, and column layout are internal. The user cannot create tables, add columns to an existing table, or attach data to a table. This preserves the engine's ability to reorganize storage without breaking user code.

---

## Design Preferences

These are strong recommendations, not constitutional rules. They should be followed unless there is a specific, measured reason to deviate.

**Structure of Arrays.**
The engine standardizes on field-level SoA because it best matches JavaScript, TypedArrays, and the existing particle engine. The column manager utility (growth, swap-remove, free-list) serves both the ECS and the particle engine. Alternative layouts must demonstrate a measurable advantage before replacing this standard.

**No OOP in iteration.**
Systems iterate columns, not objects. No `forEach` on entity lists. No per-entity callbacks in critical paths. The iteration primitive is: give the system the typed arrays for the requested components and the entity ID array, from index `start` to `end`. The user-facing API may wrap this in a callback for convenience, but the engine internals never depend on it.

**Explicit data flow.**
Systems communicate through world state, resources, events, or deferred commands. Hidden coupling through global mutable state should be avoided. If two systems interact, the interaction should be visible in the architecture — through shared component access, a resource, or an event observer.

**Deterministic execution.**
Given the same initial state and the same sequence of commands, the ECS should produce the same final world state. Hidden mutation, implicit ordering, and nondeterministic iteration should be avoided whenever practical. Determinism enables replay, networking, debugging, editor undo, and reproducible tests.

**Locality over abstraction.**
The architecture prefers keeping related data physically close rather than hiding it behind layers of abstraction. A system that accesses `Transform` and `Sprite` should receive pointers to those exact arrays, not iterators, streams, or lazily-evaluated views. The particle engine's `fillUploadBuffer` demonstrates this principle: it directly interleaves typed array data into a GPU buffer with no abstraction layer between the storage and the transfer.

**No premature generality.**
Build for what the engine needs today. If a pattern serves only one use case, do not abstract it. The particle engine's `fillUploadBuffer` is useful for GPU upload; do not generalize it into a universal serialization framework unless a concrete need arises. Generalization is driven by at least three proven use cases, not by speculation.

---

## Boundary Conditions

| Condition | Behavior |
|-----------|----------|
| Register same component twice | Throw |
| Use unregistered component in query | Throw |
| Use destroyed entity ID | Detect via generation mismatch — return null |
| Exceed maxCapacity on table growth | Throw |
| Dependency cycle in system ordering | Throw during system registration |
| Command buffer mutation during flush | Throw |
| Archetype with 0 components | Valid — tag-only archetype |
| Entity create with empty component set | Valid — entity in empty archetype |
| Remove component entity does not have | No-op |
| Add component entity already has | No-op |

---

## Summary

The architecture is defined by its invariants, not its implementation. Entity IDs will remain IDs — whether 32-bit, 53-bit, or BigInt is an implementation detail that can evolve. Systems will remain column-iterating functions — whether they receive typed arrays directly or through a wrapper is an implementation detail. The particle engine will remain independent, sharing only column management utilities.

Every decision in subsequent phases should be tested against these invariants and preferences. If a decision conflicts with an invariant, the decision should be reconsidered. If it conflicts with a preference, the decision requires justification and typically a measurement.
