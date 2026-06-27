# Phase 1.1 — Foundation Layer Architectural Review

## Scope

This document reviews Layer 1 (Foundation) of the ECS architecture: Component Registry, Entity Manager, Table Storage, and the shared column-management utilities. It identifies edge cases, ownership ambiguities, missing specifications, and potential correctness issues before implementation begins.

---

## 1. Component Registry

### 1.1 Responsibilities — Verified

The responsibility is well-defined: assign IDs, store schemas, provide lookups. No missing or overlapping responsibilities detected.

### 1.2 Ownership — Clear with One Refinement

The registry is owned by the World. The design states it is "read-only after World construction" or "at any time if no archetypes have been created yet."

**Refinement needed:** These two conditions are not equivalent in practice. If registration happens at any time before the first archetype is created, then a user who registers all components upfront and never creates an entity until later is on the early path. But a user who creates entities during a loading screen and then registers additional components afterward would encounter an error. The rule should be simplified:

> Components may be registered at any time. Once a component is registered, it cannot be unregistered. The registry is locked on the first call to `world.update()` (not on first entity creation). After that, no new components may be registered.

This rule has been revised from the original Layer 4 review (Phase 1.4). The original Layer 1 specification ("lock on first entity creation") is superseded. Locking on `world.update()` gives maximum flexibility during setup: a game can register components, create entities during scene loading, then register more components before the game loop starts. The lock must be explicit (`registry.lock()`) and is called by the World at the beginning of the first `world.update()` call. Subsequent `register()` calls throw.

**Rationale for change:**

### 1.3 Data Model — Missing Field Type Specification

The design mentions `f32` maps to `Float32Array` and `u8` maps to `Uint8Array`, but does not specify the full type system. Before implementation, the following should be enumerated:

**Canonical type names and their TypedArray constructors:**

| Canonical name | Alias | TypedArray | Range | Particle precedent |
|---|---|---|---|---|
| `f32` | `float` | Float32Array | ±3.4×10³⁸ | `_x`, `_y`, `_life`, ... |
| `f64` | `double` | Float64Array | ±1.8×10³⁰⁸ | None |
| `u8` | `bool` | Uint8Array | 0–255 | `_r`, `_g`, `_b`, `_alive` |
| `u16` | — | Uint16Array | 0–65535 | None |
| `u32` | `uint` | Uint32Array | 0–4.3×10⁹ | `_id`, `_segment` |
| `i8` | — | Int8Array | –128–127 | None |
| `i16` | — | Int16Array | –32768–32767 | None |
| `i32` | `int` | Int32Array | ±2.1×10⁹ | `_segment` |

Aliases are resolved to canonical names at registration time. User code may write `float` or `f32` interchangeably.

**Deliberate exclusion — no built-in `'ref'` type:**
Layer 1 is intentionally numeric-only. Non-numeric data (textures, callbacks, strings) is addressed through handles stored as `u32`. For example, `textureHandle: u32` is stored in a `Uint32Array` column, and the handle resolves to an `HTMLImageElement` through a separate resource registry. This keeps all component storage dense, serializable, WASM-compatible, and GPU-uploadable. Object references that cannot be reduced to handles are owned by resources (Layer 4), never by component fields.

### 1.4 Default Values — Underspecified

The registry stores default values per field. The design describes this but does not specify:
- How non-zero defaults are provided at registration time (e.g., `default: 1` for `scaleX`).
- How defaults are represented internally.
- What happens when a component is added to an existing entity (the new row is initialized to defaults, but the entity already exists with other component data — the new component's defaults should not overwrite existing unrelated data).
- Whether defaults are applied eagerly on archetype creation (writes to the whole column) or lazily on row acquisition.

**Recommendation — API for defaults:**

Each field descriptor includes an optional `default` property:

```
{ name: "x",     type: "f32", default: 0 }
{ name: "y",     type: "f32", default: 0 }
{ name: "scale", type: "f32", default: 1 }
```

Defaults are stored internally as a flat `Float64Array` (one entry per field, cast to the field's type when applied). They are applied lazily — only when a row is allocated (via `_resetSlot`-style initialization). Eager initialization on archetype creation is not used: typed arrays are already zeroed by the engine, so only non-zero defaults need explicit writes.

When a component is added to an existing entity, only the new component's fields are initialized to defaults. Existing component data on the same entity is never touched — the migration copies all columns from the source archetype, then fills the new component's columns with defaults.

### 1.5 Component ID Stability

The design reserves "the first N IDs for built-in engine components." This implies IDs are stable across engine versions: `Transform` is always ID 1, `Sprite` is always ID 2, etc. This is valuable for:
- Serialization (archetype signatures in saved games contain stable component IDs).
- Networking (component IDs in network packets do not depend on registration order).
- WASM (hardcoded component IDs in compiled modules).

**Specification needed:** Document the reserved range (e.g., IDs 1–63 for built-in components, IDs 64+ for user components). ID 0 is invalid/unregistered.

**Archetype signature construction:**
Signatures are stored as immutable sorted arrays of ascending component IDs. `[Sprite, Transform, Velocity]` is immediately normalized to `[Transform, Sprite, Velocity]` at archetype creation. The sorted representation guarantees that two component sets with the same members produce the same archetype, regardless of declaration order.

**Canonical component ordering also applies to queries and migrations:**
When a user declares a query with components `[Velocity, Transform]`, the query engine normalizes the set to `[Transform, Velocity]` before matching. When adding components to an entity, the resulting signature is computed as `sorted(union(current, toAdd))`. This ensures consistency everywhere component sets appear.

**Schema immutability after registration:**
Once a component is registered, its schema — field layout, field types, default values, and field order — never changes for the lifetime of the World. The registry publishes frozen schemas (`Object.freeze` on the schema object and each field descriptor). Attempting to mutate a registered schema fails silently in sloppy mode or throws in strict mode. This prevents accidental invalidation of existing archetypes.

### 1.6 Edge Cases

| Condition | Behavior |
|---|---|
| Component ID pool exhausted (>65535) | Throw. The engine is beyond its supported component count. |
| Invalid field type string | Throw at registration time. |
| Empty field list | Valid — component is a pure tag (no data). |
| Duplicate field name within component | Throw. |
| Schema with no fields but non-zero default values | Throw — defaults require fields. |
| `lock()` called, then `register()` called | Throw. |
| Mutate a registered schema (add/remove/reorder fields, change types or defaults) | Silently no-op in sloppy mode, throw in strict mode. Use `Object.freeze` at registration. |

---

## 2. Entity Manager

### 2.1 Responsibilities — Verified

Well-defined: allocate IDs, recycle IDs, track (archetype, row) per entity, generation-guard lookups. No missing responsibilities detected.

### 2.2 Data Model — Memory Refinement Needed

The current design specifies a "sparse array (`entities`) mapping slot index → `{ archetypeId, row, generation }`." In a JS array of 16M slots, each occupied slot is a small object `{ archetypeId, row, generation }`. Three concerns arise:

**Memory overhead with objects:**
At 1M entities (a reasonable cap for a 2D game), 1M small objects at ~40 bytes each = 40MB for entity metadata alone. This is high but perhaps acceptable. At 16M entities it becomes prohibitive.

**Solution — typed-array entity metadata:**
Replace the object-per-entity with three parallel typed arrays indexed by slot index:

```
_entityArchetype: Uint32Array  — archetype ID (0xFFFFFFFF = free slot)
_entityRow:       Uint32Array  — row within archetype table
_entityGen:       Uint8Array   — generation counter (0–255)
```

Total per-entity metadata: 4 + 4 + 1 = 9 bytes. At 1M entities: ~9MB. At 100K entities: ~900KB. Eliminates per-entity object allocation entirely. An entity lookup becomes three O(1) typed array reads.

**Packed entity ID layout — 32 bits:**
```
bits 31..24:  generation (8 bits, 0–255)
bits 23..0:   slot index (24 bits, 0–16,777,215)
id = (generation << 24) | slotIndex
```

This keeps entity IDs inside the exact integer range of a JS Number (53-bit mantissa) with room to spare. 16M slots is more than any 2D game will require. The 8-bit generation counter (`Uint8Array` in metadata) wraps after 256 recycles of the same slot — infeasible to encounter in a single session. Both the metadata and the packed ID agree on 8 bits.

**Refinement:** Document the typed-array metadata layout explicitly. The "sparse array of objects" wording could mislead an implementer into allocating per-entity heap objects.

### 2.3 Free-List Design — Verified

A simple array of slot indices, LIFO (pop from end). Matches the particle engine's `_freeList` pattern exactly. O(1) acquire/release.

**Edge case:** Free-list empty on acquire. The entity manager must either:
- Reject (throw) — not acceptable if the entity cap is just a configuration limit.
- Grow the metadata arrays (archetype, row, generation) and the free-list. Growth means reallocating the three typed arrays and the free-list array.

**Recommendation:** The entity manager should grow its metadata arrays (analogous to table growth) when the free-list is empty, up to an optional `maxEntityCount`. This avoids an arbitrary entity cap. The default max should be large enough for any game (e.g., 1M or 16M depending on the packing scheme chosen).

### 2.4 Generation Management During Destroy

Per the lifecycle:
1. Unpack ID, extract slot and generation.
2. Verify entity is alive (generation matches).
3. Return slot to free list.
4. **Increment generation** in metadata.

**Edge case:** The generation is stored as `Uint8`. After 255, wrapping to 0 is handled by the validity check (see §2.2). At the implementation level, incrementing `_entityGen[slot]` past 255 wraps naturally for Uint8Array. 256 cycles per slot before wraparound is infeasible to encounter in any practical session.

**Edge case:** Destroying an already-destroyed entity. The generation check catches this because the metadata generation no longer matches the entity ID's generation. Returns silently or throws? The design says "return null/undefined" for lookup. For destroy, it should be a no-op (matching the invariant "Remove component entity does not have → no-op" and "Add component entity already has → no-op"). Destroying an already-destroyed entity should similarly be a no-op.

### 2.5 Bidirectional Mapping — Missing Coordination Specification

The entity manager maps `entityId → (archetypeId, row)`. The table maps `row → entityId`. During swap-remove, the table moves the last row into the vacated position. The moved entity's `(archetypeId, row)` in the entity manager is now stale — it still points to the old row.

The design mentions "updating the entity manager's sparse entry for the moved entity" but does not specify who performs this update.

**Issue:** The table does not own entity metadata. The entity manager does not own the swap-remove operation. Neither can unilaterally perform the update.

**Three possible coordinators:**

| Coordinator | Pros | Cons |
|---|---|---|
| **The table** receives an entity-manager callback | Simple, the table already performs the swap | Table depends on entity manager — coupling within Layer 1 |
| **The entity manager** orchestrates removals | Entity manager maintains correctness | Entity manager needs to know about table internals |
| **The World** coordinates (Layer 2) | Clean, the World already mediates | Moves swap-remove coordination out of Layer 1, complicating the interface |

**Recommendation:** The table owns swap-remove as a pure data operation: it swaps the data, decrements count, and **returns the entity ID of the moved entity** (or `INVALID_ENTITY` if no move occurred). The caller (entity manager or World) uses this returned entity ID to update its metadata. This keeps the table ignorant of entity metadata while making the operation trivially composable.

**Method signature for the table:**

```
removeRow(rowIndex) → RemoveResult
```

Where:

```
RemoveResult = { moved: boolean; entity: EntityId }
// or a { movedEntity: EntityId } with INVALID_ENTITY = 0
```

- Copies last row into `rowIndex`.
- Returns a result containing `entity` = the ID of the entity that was moved into `rowIndex` (previously at the last row), and `moved: true`. If `rowIndex` was the last row, returns `moved: false` / `INVALID_ENTITY`.
- The caller updates the entity metadata for the moved entity: `_entityArchetype[movedSlot] = thisArchetypeId`, `_entityRow[movedSlot] = rowIndex`.

### 2.6 Entity Lookup Performance

The current design: extract slot and generation, check generation match, read `(archetypeId, row)` from metadata. Three typed array reads and one comparison. This is O(1) and cache-efficient.

**Use case:** Systems that need to look up entities by ID in a hot loop (e.g., parent-child relationships). The typed-array metadata design ensures this is fast.

### 2.7 Edge Cases

| Condition | Behavior |
|---|---|
| Create entity when free-list is empty | Grow metadata arrays (up to configured max), then allocate. |
| Destroy entity ID 0 (null sentinel) | Return silently (no-op). |
| Destroy entity with generation mismatch | Return silently (already destroyed). |
| Look up entity ID 0 | Return null. |
| Look up entity with generation mismatch | Return null. |
| Slot recycled 256 times (generation wraps) | Infeasible in any practical session. Acceptable. |
| Exceed `maxEntityCount` | Throw at creation time. |

---

## 3. Table Storage

### 3.1 Responsibilities — Verified

The table owns typed array columns, the entity ID column, provides row allocation/deallocation, manages capacity growth, and performs swap-remove. Correctly scoped.

### 3.2 Data Model — Missing Column Registry

The design says each archetype table owns "one typed array per component field." The set of columns is derived from the archetype's component signature. But no mechanism is described for constructing columns from a signature.

**Required mapping at table creation:**
```
signature: [componentId_A, componentId_B, ...]

columns = []
for each componentId in signature:
  schema = registry.lookup(componentId)       // { fields: [{name, type, default}, ...] }
  for each field in schema.fields:
    typedArray = new TypedArrayForType(field.type, initialCapacity)
    columns.push({ componentId, fieldName, typedArray })
```

This is straightforward but should be documented. The table initializer receives the component registry and the archetype signature, calls the registry to resolve schemas, and allocates all columns.

**Column order immutability:**
Column order within a table is immutable for the lifetime of the table. Once created, the sequence of columns (e.g., `Transform.x`, `Transform.y`, `Velocity.x`, `Velocity.y`) never changes. This guarantees that cached column lookups — stored as array indices or direct typed array references — remain valid for the entire table lifetime. No column is ever inserted, removed, or reordered.

### 3.3 Entity ID Column — Verified

The table owns a `Uint32Array` for entity IDs at `row → entityId`. This is the table's row 0. It is not a component column. It is the reverse of the entity manager's mapping.

### 3.4 Layer 1 Is Numeric-Only

As established in §1.3, Layer 1 does not support non-numeric component fields. All component data is stored in typed arrays. Non-numeric data is handled via integer handles (stored as `u32`) that resolve through resource registries at higher layers. This keeps all columns dense, GPU-serializable, and WASM-compatible.

### 3.4a Tag Components

A component with zero fields (pure tag) is valid. Tags occupy no column storage in the table beyond the entity ID column. Adding or removing a tag component triggers an archetype migration identically to data-bearing components — the entity moves to a different table because its component signature changed. The migration copies all data-bearing columns from the source table to the target; the target table simply has no additional columns for the tag. No column copy is needed for the tag itself.

### 3.5 Growth Strategy — Verified Against Particle Engine

The particle engine's `_grow` method doubles capacity, allocates new typed arrays, copies via `TypedArray.set()`, and discards old arrays. The ECS table should replicate this exactly. The particle engine's implementation is 40 lines and serves as the direct template.

**No special growth logic needed beyond typed arrays —** Layer 1 has no object columns.

### 3.6 Swap-Remove Coordination

As specified in §2.5, the table's `removeRow` implementation:

```
1. If rowIndex >= count, throw.
2. Decrement count.
3. If rowIndex === count (was the last row), return { moved: false, entity: INVALID_ENTITY }.
4. Copy entity ID from row count into rowIndex.
5. For each typed array column: column[rowIndex] = column[count].
6. Return { moved: true, entity: entityId[rowIndex] }.
```

The caller then updates the entity manager's metadata for the moved entity.

### 3.7 Row Reset Strategy — Lazy, Matching the Particle Engine

The Foundation layer never clears freed memory eagerly. Everything resets on acquisition, exactly like the particle engine's `_resetSlot` approach. Freed rows (beyond `count`) retain their last values until the slot is reused. This is safe — no code reads beyond `count`. Consistency with the particle engine beats micro-optimizations.

### 3.8 Batch Row Allocation

The current design assumes single-row allocation (one entity at a time). For particle spawn events where thousands of entities are created in one frame, repeated single-row allocation means growth checks on every call.

Three distinct APIs with different semantics:

| Method | Behavior |
|---|---|
| `reserve(count)` | Ensures capacity for at least `count` total rows. Grows once if needed. Does **not** allocate rows or increment `count`. |
| `allocate()` | Consumes one row. Returns the row index. May trigger growth if `count === capacity` (call `reserve` first to avoid this). |
| `allocateRange(count)` | Consumes `count` contiguous rows. Returns the starting row index `[start, start + count)`. One bounds check, one `count` update. May trigger growth. |

```
// Pattern 1 — reserve then individual allocate
table.reserve(5000);
for (let i = 0; i < 5000; i++) {
  const row = table.allocate();
  // write entity ID etc.
}

// Pattern 2 — range allocation
const start = table.allocateRange(5000);
for (let i = 0; i < 5000; i++) {
  // entityIds[start + i] = ...
}
```

The particle engine's batch emission pattern is the motivating use case.

**Edge case:** If `reserve(count)` is called with `count < capacity`, it is a no-op. If `count` exceeds `maxCapacity`, growth clamps to `maxCapacity` and may throw.

### 3.9 Table Growth Safety During Iteration

When a table grows (reallocates all typed arrays), any system currently iterating that table holds references to the old typed arrays. Subsequent reads from those references read from detached arrays.

**Guarantee:** Table growth must never occur during system execution. This is enforced by Layer 2's deferred command system: entity creation (which may trigger table growth) is queued and flushed between phases, after all systems have finished reading. During phase execution, no table growth occurs.

**World setup path:** During initial entity creation outside the pipeline (e.g., scene setup), growth can happen freely because no iterators exist. This is safe.

**Edge case:** A user calls `world.create(...)` directly (not through deferred commands) while a system is running. This must be explicitly forbidden — the design already states that direct mutation during iteration is not permitted.

### 3.10 Column Iteration Interface for Higher Layers

The table is consumed by the Query Engine (Layer 3). The query engine needs to:
- Get the entity ID column (read-only).
- Get typed array columns for specific component fields (read-write).
- Get the active row count.
- Iterate by archetype chunk.

The table should expose:

```
get entityIds(): Uint32Array       // entity ID column, length = count
getColumn(componentId, fieldName): TypedArray | Array  // may return null if component not in this table
get count(): number
get capacity(): number
```

This interface is sufficient for Layer 3. No per-row accessors should be exposed (that would encourage OOP iteration).

### 3.11 Edge Cases

| Condition | Behavior |
|---|---|
| Allocate row when at capacity | Double capacity (reallocate all columns, copy data), then allocate. |
| Allocate row when at maxCapacity and full | Throw. |
| `removeRow(row)` where row >= count | Throw — out of bounds. |
| Table with empty signature (tag-only) | Zero typed array columns. Only entity ID column. `count`, `capacity`, `removeRow` all work normally on entity IDs. |
| Component with 100 fields | Allocate 100 typed array columns. Manageable but higher creation cost. Validate design handles this. |
| Table growth for tag-only table | Only the entity ID column needs reallocation. |
| Remove last remaining entity from table | `count` becomes 0. Table remains valid but empty. |

---

## 4. Shared Column Utilities

### 4.1 Responsibilities — Need Clarification

The design states "The column management code (growth, copying, swap-remove, reset-on-acquire) should be extracted into a shared utility." But the exact boundary is unclear.

**What should be shared:**
- Growth: allocating a new typed array of larger capacity, copying old data, replacing the reference. This is identical for every typed array column regardless of element type.
- Swap-remove: swapping values at two indices in a typed array. Identical for every typed array, just parameterized by the array type.
- Reset-slot: writing default values to one row. Parameterized by the list of defaults.

**What should NOT be shared:**
- Column metadata management (component ID, field name). This is specific to the ECS table.
- Entity ID column management. Particle engine does not have an entity ID column — it uses accessors.

**Utility interface:**
```
function growColumns(columns: TypedArray[], oldCap: number, newCap: number): void
function swapRemoveColumn(col: TypedArray, index: number, lastIndex: number): void
function resetRow(columns: TypedArray[], defaults: number[], row: number): void
```

These are pure functions operating on typed arrays. They belong in a `shared/` or `utils/` directory within the Foundation layer. Both the ECS table and `SoAParticleStorage` import them.

### 4.2 Particle Engine Integration

The particle engine's `SoAParticleStorage._grow()` currently manually allocates each of its 20 typed arrays and copies data. With the shared utility, it would:

```
growColumns(this._typedArrays, oldCap, newCap);
```

Where `_typedArrays` is a pre-registered list of its field columns (not using the ECS component registry — the particle engine registers its own column list).

**Ownership:** The shared utilities belong in Layer 1 (Foundation). Both the ECS table and the particle engine depend on Layer 1. Neither depends on each other. This is architecturally clean.

**Refinement:** The particle engine should NOT be required to use the ECS component registry. It should be able to call the column utility functions directly with its own typed arrays. The utility functions operate on `TypedArray[]` and `number[]` (defaults), with no knowledge of components or schemas.

---

## 5. Cross-Cutting Concerns

### 5.1 Entity Creation Flow (World Orchestration)

The entity creation flow crosses all three Layer 1 subsystems. It should be explicitly documented:

```
1. User calls world.create(ComponentA, ComponentB) or equivalent.
2. World registers the command in the deferred buffer (or immediately if outside pipeline).
3. On execution:
   a. Resolve or create the archetype for [ComponentA, ComponentB].
   b. Get the archetype's table.
   c. Allocate row(s) in the table (maybe batch).
   d. Create entity ID(s) via entity manager.
   e. Write entity IDs into the table's entity ID column.
   f. Write default values for each component field (from registry).
   g. Record (archetypeId, row) in entity metadata.
   h. Return entity ID(s).
4. Fire onCreate/onAdd lifecycle hooks.
```

Step `c` (table growth) and step `d` (entity metadata growth) are independent — growth in one does not affect the other. Both are coordinated by the World.

### 5.2 Archetype ↔ Table Binding (Layer 1 → Layer 2)

The archetype system (Layer 2) owns archetypes. Each archetype references exactly one table. The table does not reference the archetype.

**Implication:** When the table is swap-removing a row, it returns the moved entity ID. The caller (the World, Layer 2) must determine which archetype the entity was in, to update the entity metadata. The table cannot provide the archetype ID because it does not know it.

**How the caller knows the archetype:**
- The entity's `_entityArchetype[slot]` field stores the archetype ID before the removal. This is read from entity metadata (not from the table).
- After swap-remove, the caller updates `_entityRow[movedSlot] = replacementRowIndex` (the row the moved entity now occupies). The archetype ID does not change.

This is correct. The table does not need an archetype reference.

### 5.3 Future Serialization Support

Layer 1 should not block serialization. Specifically:

- **Component IDs** must be stable across saves and versions. The built-in component ID reservation (§1.5) ensures this.
- **Entity IDs** are ephemeral — they include generation counters that change across runs. Serialization should store archetype signatures and component data, not packed entity IDs.
- **Archetype signatures** are sorted arrays of component IDs. Storable as a flat array of u16.
- **Table data** is typed array columns — directly serializable via `TypedArray.buffer`.

No Layer 1 change is needed to support serialization, as long as component IDs are stable and signatures are storable.

### 5.4 Future WASM and GPU Support

Layer 1 is already compatible:
- Typed array columns expose their underlying `ArrayBuffer` for WASM memory sharing.
- Field-level SoA means each field is a contiguous WASM-accessible buffer.
- `fillUploadBuffer`-style interleaving can be a Layer 1 utility that operates on column arrays.

No changes needed.

---

## 6. Hidden Assumptions

| # | Assumption | Risk | Recommendation |
|---|---|---|---|
| 1 | Component counts remain under 65535 | Low — 64K components is far beyond any game's needs | Document the limit, reserve 1–64 for built-ins |
| 2 | Entity counts remain under ~16M | Low — no 2D game needs 16M simultaneous entities | Document the limit, make it configurable |
| 3 | Generation never wraps around in practice | Low — 256 cycles per slot before wraparound | Document the limit |
| 4 | All component fields have numeric types | Low — handles keep all storage numeric | Design choice, not an assumption |
| 5 | Tables never need to shrink | Medium — could cause memory waste in scenes with fluctuating entity counts | Add optional compaction or leave unchecked for now |
| 6 | Entity creation is always single | **Medium** — particle spawns create thousands at once | Add `reserve(count)` and optionally `allocateRange(count)` (§3.8) |
| 7 | The particle engine uses the same schema system | Low — particle engine registers its own columns directly, not via Component Registry | Confirm particle engine integration path (§4.2) |
| 8 | Table growth never happens during iteration | Medium — enforced by Layer 2 deferred commands, but must be documented as a hard requirement | Document in the table's interface contract |
| 9 | Component registration order does not affect behavior | Low — IDs are dense and monotonic but never exposed in the public API | No action needed |

---

## 7. Missing Design Decisions

| # | Decision | Impact | Recommendation |
|---|---|---|---|
| 1 | Field type enumeration | Blocking for implementation. Without the complete type list, column construction cannot begin. | Enumerate the typed array type system before implementation (§1.3). |
| 2 | (removed — Layer 1 is numeric-only) | — | — |
| 3 | Batch row allocation | Performance-critical for spawn-heavy games (bullet hell, particles). | Add `table.reserve(count)` and optionally `allocateRange(count)` (§3.8). |
| 4 | Table ↔ entity manager coordination during swap-remove | Correctness-critical. | Table returns the moved entity ID from `removeRow()`; the caller updates entity metadata (§2.5, §3.6). |
| 5 | Registry lock timing | Blocks World construction. | Lock the registry on first `world.update()` (World calls `registry.lock()`), not on first entity creation (§1.2). This decision supersedes the earlier "on first entity creation" specification — see Layer 4 review for rationale. |
| 6 | Entity metadata storage format | Performance and memory. | Use three parallel typed arrays (archetype, row, generation), not objects (§2.2). |
| 7 | Shared utility exact interface | Blocks both ECS table and particle engine refactoring. | Define pure functions over `TypedArray[]` and `number[]` in Layer 1 (§4.1). |
| 8 | Component schema immutability | Correctness — prevents archetype invalidation. | Schemas are immutable after registration. No field additions, removals, type changes, or default changes. |
| 9 | Canonical component ordering | Correctness — ensures signature equality. | Archetype signatures are always sorted by component ID. `[Sprite, Transform]` and `[Transform, Sprite]` produce the same archetype. |
| 10 | Column order immutability | Correctness — cached lookups remain valid. | Column order within a table never changes after table creation. |
| 11 | Schema immutability enforcement | Correctness — prevents archetype invalidation. | Schemas are `Object.freeze`d at registration. |
| 12 | Type alias support | API usability — users should not memorize canonical names. | Define aliases: `float → f32`, `double → f64`, `int → i32`, `uint → u32`, `bool → u8`. |

---

## 8. Summary of Required Refinements

### Before Implementation Begins

1. **Specify the field type system.** Enumerate all supported typed array constructors and their string aliases. Layer 1 is numeric-only; non-numeric data uses `u32` handles.

2. **Design the shared column utility.** Define `growColumns`, `swapRemoveColumn`, `resetRow` as pure functions over typed arrays.

3. **Specify entity metadata as typed arrays.** Reject the object-per-entity model. Three parallel typed arrays (archetype: Uint32, row: Uint32, generation: Uint8). Packed entity ID is 32 bits: `(gen << 24) | slot`.

4. **Define `table.removeRow(rowIndex) → movedEntityId`.** Document the swap-remove protocol between table and caller.

5. **Add `table.reserve(count)` and optionally `table.allocateRange(count)`.** Batch allocation for spawn events.

6. **Define registry lock semantics.** Lock on first entity creation, not on first archetype creation.

7. **Specify component schema immutability.** Once registered, a schema's field layout, types, and defaults never change. `Object.freeze` schemas at registration.

8. **Specify canonical component ordering.** Archetype signatures are stored as immutable sorted arrays of ascending component IDs.

9. **Define type aliases.** `float → f32`, `double → f64`, `int → i32`, `uint → u32`, `bool → u8`.

10. **Specify column order immutability.** Column order within a table is fixed for the table's lifetime.

### Important But Non-Blocking

11. **Document default value specification.** How the user provides non-zero defaults during component registration.

12. **Document built-in component ID reservation.** IDs 1–63 reserved for engine components.

13. **Clarify row reset timing.** Lazy reset, matching particle engine. Foundation never clears freed memory eagerly.

14. **Document growth safety contract.** Table growth never occurs during query iteration; deferred command system is the enforcement mechanism.

15. **Document tag component migration.** Adding/removing a tag triggers full archetype migration, even though no columns are copied.

---

## 9. Invariant Compliance Check

| Invariant | Layer 1 Status |
|---|---|
| Entities are IDs, not objects | Compliant — generation-packed integer IDs, typed-array metadata |
| Components are pure data | Compliant — typed array columns, no methods |
| Systems own behavior, components own data | Compliant — Layer 1 has no notion of systems |
| Archetypes own storage | Compliant — tables are attached to archetypes (Layer 2+) |
| Migration is the cost of density | Compliant — swap-remove is the only removal mechanism |
| Deferred commands required during iteration | Compliant — table growth and mutation are deferred |
| Layers never reach upward | Compliant — Layer 1 exposes utilities only, no Layer 2 dependencies |
| Table structure never user-visible | Compliant — tables are accessed through the World or archetype |

**No invariants are violated.**

---

## 10. Conclusion

Layer 1 is architecturally sound. The design correctly generalizes the particle engine's proven storage patterns. Twelve missing design decisions should be resolved before implementation begins (summarized in §8). The most critical are the field type system (including aliases), the swap-remove coordination protocol between table and entity manager, and the entity ID packing layout. 

**Note — registry lock timing revised:** The original Layer 1 specification locked the registry on first entity creation. The Layer 4 (Integration) review revised this to lock on first `world.update()`, providing greater flexibility during setup/scene loading. This change does not affect Layer 1's lock mechanism — only the trigger event. See §1.2 for the updated specification and the Layer 4 review for the full rationale.

Once these specifications are resolved, Layer 1 can be implemented independently — it has no dependencies on higher layers and exposes a clean interface for Layer 2 (Archetype System) to consume.
