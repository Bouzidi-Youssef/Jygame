# Phase 1.2 — Archetype Layer Architectural Review

## Scope

This document reviews Layer 2 (Archetype Layer) of the ECS architecture: Archetype Identity, Archetype Graph, Entity Migration, World coordination, Deferred Commands, and the interaction between Layer 2 and the Foundation layer (Layer 1). It assumes Layer 1 is finalized and does not redesign Foundation unless Layer 2 exposes a flaw in its interface.

---

## 1. Archetype Identity

### 1.1 Responsibilities — Verified

Well-defined: uniquely identify archetypes by component signature, provide O(1) lookup by signature, create archetypes lazily on first transition, guarantee no duplicate archetypes exist.

### 1.2 Signature Representation — Missing Key Strategy

The design states signatures are "sorted arrays of component IDs" and lookup uses "a `Map` keyed by a string or typed-array digest." This is underspecified.

**Recommendation — cached string key:**

Each signature is a frozen sorted `Uint16Array`. A string key is computed once at signature creation time and cached on the archetype:

```
key = signature.join(',')    // e.g., "1,5,12"
     // or: Array.from(signature).join(',')
```

The archetype map is `Map<string, Archetype>`.

The string allocation happens exactly once per unique signature ever created — this is necessarily at least once per archetype, so no additional cost. Lookup is a single `Map.get()`.

**Discarded alternatives:**
- Nested Map traversal (`map.get(a)?.get(b)?.get(c)`): more complex, harder to debug, no performance benefit for the typical case of <15 components.
- Hash computation from typed array buffer: avoids string allocation but requires a custom hash function. Unnecessary complexity for a non-hot path.
- `Symbol.for(signature.toString())`: works but obscures the key in debugging.

### 1.3 Archetype ID Assignment

The design mentions archetype IDs but does not specify their assignment or resolution.

**Specification needed:**

Archetype IDs are dense monotonic integers starting at 1 (ID 0 is invalid). A dense `Array<Archetype | null>` maps archetypeId → Archetype instance. This enables O(1) archetype resolution from the entity manager's `_entityArchetype` field (a `Uint32Array` of archetype IDs).

```
_archetypesById: Archetype[]   // index = archetype ID
_nextArchetypeId = 1           // 0 = invalid
```

When an archetype is created, it receives `id = _nextArchetypeId++`, is stored at `_archetypesById[id]`, and the ID is written into entity metadata.

### 1.4 Archetype Creation Timing

The design says archetypes are created "lazily on first transition." Two refinement points:

**Empty archetype must exist at World construction:**
The empty archetype (signature `[]`) should be created during `new World()`, before any user code runs. Entity creation with no initial components and the initial state of all entities before their first component add both require the empty archetype to exist.

**Archetype creation is never on the hot path:**
Archetype creation involves: allocating a table with N typed array columns (each with initial capacity), creating the signature key, registering in the map, and notifying the query engine. This is a heavyweight operation, but it happens at most once per unique component combination in a session. Document this expectation so implementers do not optimize prematurely.

### 1.5 Uniqueness Guarantee

The combination of sorted canonical signatures and string-keyed `Map` guarantees:

- Two archetypes with the same component set are always the same object.
- `[Transform, Sprite]` and `[Sprite, Transform]` produce the same archetype.
- No duplicate archetype creation exists.

### 1.6 Edge Cases

| Condition | Behavior |
|---|---|
| Create archetype for signature that already exists | Return existing archetype (Map.get hit). |
| Create archetype for empty signature `[]` | Created during World construction. `world.getArchetype([])` returns it. |
| Component ID in signature is not registered | **Throw.** Unregistered components cannot appear in archetypes. |
| Duplicate component ID in signature | Impossible — canonical sorting does not deduplicate, but component composition at the entity level should prevent duplicates. The archetype system should validate and throw if duplicates are detected. |

---

## 2. Archetype Ownership

### 2.1 Ownership Map

| Component | Owner | Notes |
|---|---|---|
| Archetype instances | World (`_archetypesById` array) | World creates and destroys them. |
| Table | Archetype (1:1) | Created by the archetype; destroyed when the archetype is destroyed. |
| Component Registry | World | Read by archetype during construction to build columns. |
| Entity Manager | World | Read/written during migration (metadata updates). |
| Graph edges | Archetype (`addEdge`, `removeEdge` maps) | Appended lazily during migration, never removed. |
| Signature | Archetype (immutable, frozen) | Computed once, shared with query engine for matching. |

### 2.2 Archetype Lifecycle

```
World constructor
  └─ create empty archetype ([], id=1)

Runtime (on first migration to a new combination)
  └─ create archetype (id=N)
      ├─ compute signature (sorted, frozen)
      ├─ compute string key (cached)
      ├─ create Table (from component registry)
      ├─ store in _archetypesById[id]
      └─ notify query engine

World destruction
  └─ destroy all archetypes (release tables, clear maps)
```

**Archetypes are never individually destroyed during normal operation.** Even when all entities migrate out of an archetype, the archetype and its table persist. This is necessary because:
- The archetype may be a transition target later.
- The query engine may still reference it.
- Graph edges would be orphaned.

For editor workflows with long-running sessions, an optional compaction mechanism could be added later (e.g., destroy archetypes that have been empty for N frames). This is not needed for Phase 1.

### 2.3 Layer Boundary Compliance

Layer 2 depends on Layer 1:
- Component Registry (read schemas)
- Entity Manager (read/write metadata)
- Table (allocate rows, copy columns, swap-remove)

Layer 2 is consumed by Layer 3:
- Query Engine reads archetype signatures and table columns.
- System Pipeline runs systems that consume query iterators.

Layer 2 does not depend on Layer 3. The World mediates all cross-layer communication.

**One notification path:** When a new archetype is created, the World notifies the Query Engine (Layer 3). This is not an upward dependency — it is the World (which owns both layers) calling a method on Layer 3.

---

## 3. Archetype Graph

### 3.1 Edge Construction — Verified

The design specifies `addEdge: Map<componentId, archetypeId>` and `removeEdge: Map<componentId, archetypeId>` per archetype. Edges are created lazily on first transition.

**Refinement — edges store references, not IDs:**

The current design mentions `Map<componentId, archetypeId>` — storing IDs. This adds an indirection: the edge must be resolved through the `_archetypesById` array. Since archetype references are stable (archetypes are never destroyed), edges should store direct `Archetype` references:

```
addEdge: Map<componentId, Archetype>
removeEdge: Map<componentId, Archetype>
```

This eliminates the indirection during migration. The archetype ID is still available via `archetype.id`.

### 3.2 Graph Correctness

**Acyclicity proof:**
- Adding a component produces a signature with strictly more component IDs than the source.
- Removing a component produces a signature with strictly fewer.
- Therefore, add edges always go "upward" (increasing component count) and remove edges always go "downward" (decreasing component count).
- Cycles cannot exist because component count changes monotonically in each direction.

**Bidirectional guarantee:**
If archetype X has `addEdge[C] = Y`, then archetype Y should have `removeEdge[C] = X`. The design does not explicitly state whether the inverse edge is set during the same migration.

**Recommendation — set inverse edge during migration:**
When migrating entity E from X to Y via adding C:
1. Compute target signature, find/create Y.
2. Set `X.addEdge[C] = Y`.
3. Set `Y.removeEdge[C] = X`.
4. Perform migration.

This ensures both directions are cached after the first transition, making the return migration O(1) on first use.

### 3.3 Bulk Transitions and the Graph

For bulk transitions (e.g., adding components C and D simultaneously), the target signature is `sorted(X.signature + [C, D])`. The resulting archetype Z is looked up or created. The graph edges are set for each added/removed component:

```
X.addEdge[C.id] = Z    // may overwrite if C was added individually before
X.addEdge[D.id] = Z    // may overwrite if D was added individually before
Z.removeEdge[C.id] = X
Z.removeEdge[D.id] = X
```

If either C or D was previously added individually (creating intermediate archetype Y), the previous edge is overwritten. This is correct — the bulk transition is a valid direct path, and overwriting the edge does not break correctness (the previous target Y still exists, but the graph now optimizes for the bulk path).

**Edge case:** If C was added individually before (X → Y via C), and then D is added to Y (Y → Z via D), the edges are:
- X.addEdge[C] = Y (from individual add)
- Y.addEdge[D] = Z (from second add)
- X.addEdge[C] = Z (from bulk add, overwrites!)

After the overwrite, the path X → Y is no longer directly reachable from the graph. But Y still exists and its entities can still be migrated — they just don't have an edge from X anymore. Any entity currently in Y is unaffected. New entities at X that add only C will still go through the cached edge... but now X.addEdge[C] = Z, not Y. This means adding C to an entity at X now goes to Z instead of Y — which is incorrect if we wanted to go to Y.

**This is a correctness issue.** The overwrite destroys the single-component transition. The fix is that the edge should map to the *most specific* target, which is the bulk target. But then the individual path is lost.

**Resolution — do not overwrite individual edges with bulk edges:**
When computing the target archetype for a bulk transition, set bulk-specific edges separately from individual edges. One approach:
- `addEdge` maps `componentId → Archetype` for single-component transitions.
- For bulk transitions, store the result on the source archetype under a separate key (e.g., `addEdgeBulk: Map<string, Archetype>` where the key is the sorted list of added components).

However, this adds complexity. A simpler rule:

> Bulk transitions do not create graph edges. Only single-component add/remove transitions create edges. Bulk transitions always compute the target signature from scratch.

This avoids the overwrite problem entirely. The performance cost is negligible — bulk transitions are less common than single ones, and the signature computation is O(k log k) for k added components, which is dominated by the O(copied_fields) migration cost.

**Recommendation:** Single-component transitions create graph edges. Bulk transitions compute the target signature directly without caching edges.

### 3.4 Graph Memory

Each archetype stores two `Map` objects. For an archetype with N distinct transitions observed, the maps contain at most N entries each. The total memory across all archetypes is bounded by the number of distinct (archetype, componentId) pairs ever seen, which is orders of magnitude smaller than the theoretical maximum of `archetypes × registeredComponents`.

### 3.5 Edge Cases

| Condition | Behavior |
|---|---|
| Add component C to archetype X that already has C | No-op. No edge created. |
| Remove component C from archetype X that does not have C | No-op. No edge created. |
| Add component C to archetype X, then remove C from the same entity (return to X) | First transition creates edge `X → Y` and inverse `Y → X`. Return transition uses `Y.removeEdge[C] = X` — O(1). |
| Bulk add 3 components, then later add just 1 of them individually | Individual add goes through full transition (no cached edge for that single component because bulk did not create edges). Correct — the archetype for the bulk target is different from the single-component target. |
| Overwrite edge via bulk add then individual add | Not possible — bulk does not create edges, and individual add creates edges per-component. No overwrite occurs. |

---

## 4. Entity Migration

### 4.1 Complete Migration Pipeline — Specification Needed

The full migration procedure is described at a high level but not specified in enough detail for implementation. The following must be documented.

**Migration for add component C to entity E (deferred, executed during flush):**

```
function migrateAdd(entityId, componentId):
  1. slot = entityId & 0xFFFFFF
  2. sourceArchetypeId = _entityArchetype[slot]
  3. sourceRow = _entityRow[slot]
  4. sourceArchetype = _archetypesById[sourceArchetypeId]
  5. sourceTable = sourceArchetype.table

  6. // Check cache first
  7. target = sourceArchetype.addEdge.get(componentId)
  8. if target is undefined:
  9.   // Compute new signature: source signature + [componentId], sorted
  10.   newSignature = mergeSorted(sourceArchetype.signature, [componentId])
  11.   target = getOrCreateArchetype(newSignature)
  12.   sourceArchetype.addEdge.set(componentId, target)
  13.   target.removeEdge.set(componentId, sourceArchetype)

  14. targetTable = target.table
  15. targetRow = targetTable.allocate()         // may grow — safe, we're in flush
  16.
  17. // Copy shared component data
  18. for each component in sourceArchetype.signature:
  19.   schema = registry.lookup(component)
  20.   for each field in schema.fields:
  21.     srcCol = sourceTable.getColumn(component, field.name)
  22.     dstCol = targetTable.getColumn(component, field.name)
  23.     dstCol[targetRow] = srcCol[sourceRow]
  24.
  25. // Initialize new component fields to defaults
  26. schema = registry.lookup(componentId)
  27. for each field in schema.fields:
  28.   col = targetTable.getColumn(componentId, field.name)
  29.   col[targetRow] = field.default  // apply default
  30.
  31. // Write entity ID to target table
  32. targetTable.entityIds[targetRow] = entityId
  33.
  34. // Update entity metadata BEFORE removing from source
  35. _entityArchetype[slot] = target.id
  36. _entityRow[slot] = targetRow
  37.
  38. // Remove from source table (swap-remove)
  39. result = sourceTable.removeRow(sourceRow)
  40. if result.moved:
  41.   movedSlot = result.entity & 0xFFFFFF
  42.   _entityRow[movedSlot] = sourceRow  // row stays the same archetype, row index changed
  43.
  44. // Fire lifecycle hooks
  45. fireOnRemove(sourceArchetype, entityId)
  46. fireOnAdd(target, entityId)
```

**Migration for remove component C (symmetric, with source having more components):**

```
function migrateRemove(entityId, componentId):
  // Similar to above, but:
  // - newSignature = source signature - [componentId]
  // - Copy only components present in BOTH source and target
  // - No defaults to initialize (target has fewer components)
  // - Source has one extra component that is NOT copied
```

**Migration for bulk add/remove (no edge caching):**

```
function migrateBulk(entityId, toAdd: [], toRemove: []):
  slot = entityId & 0xFFFFFF
  sourceArchetype = _archetypesById[_entityArchetype[slot]]
  sourceRow = _entityRow[slot]
  newSignature = computeBulkSignature(sourceArchetype.signature, toAdd, toRemove)
  target = getOrCreateArchetype(newSignature)
  // Do NOT set edges — bulk transitions do not create graph edges
  // ... same copy logic as single migration, but skip removed components
```

### 4.2 Copy Semantics — Verified

| Scenario | Source archetype components | Target archetype components | What to copy |
|---|---|---|---|
| Add C | [A, B] | [A, B, C] | Copy A and B columns. Init C to defaults. |
| Remove C | [A, B, C] | [A, B] | Copy A and B columns only. C is not copied. |
| Bulk add C, D | [A, B] | [A, B, C, D] | Copy A and B. Init C and D to defaults. |
| Bulk remove C, D | [A, B, C, D] | [A, B] | Copy A and B only. |
| Bulk add + remove | [A, B, C] | [A, D] (add D, remove C, change B) | Wait — B is in both, copy B. A is in both, copy A. C is removed, skip. D is new, init. |
| Add tag | [A, B] | [A, B, Tag] (Tag has no fields) | Copy A and B. No defaults to init (Tag has no fields). |
| Remove tag | [A, B, Tag] | [A, B] | Copy A and B only. |

### 4.3 Shared Column Identification

Both source and target signatures are sorted. Shared components appear in the same relative order. The copy loop uses a merge-join:

```
// Two-pointer merge for column copy
srcIdx = 0   // index in source signature array
tgtIdx = 0   // index in target signature array
while srcIdx < len(sourceSignature) && tgtIdx < len(targetSignature):
  srcComp = sourceSignature[srcIdx]
  tgtComp = targetSignature[tgtIdx]
  if srcComp == tgtComp:
    copyComponentColumns(srcComp, sourceRow, targetRow)
    srcIdx++; tgtIdx++
  else if srcComp < tgtComp:
    // component in source but not target — skip (only for remove)
    srcIdx++
  else:
    // component in target but not source — initialize to defaults
    initComponentDefaults(tgtComp, targetRow)
    tgtIdx++
// Handle remaining: if any target components remain, init them
while tgtIdx < len(targetSignature):
  initComponentDefaults(targetSignature[tgtIdx], targetRow)
  tgtIdx++
```

This correctly handles add, remove, and bulk transitions with a single algorithm. Tag components (zero fields) are handled naturally: `copyComponentColumns` and `initComponentDefaults` iterate fields; zero fields means no work.

### 4.4 Atomicity and Exception Safety

**Migration is not atomic in the database sense, but entity state is never corrupted.**

| Phase | If failure occurs | Entity state |
|---|---|---|
| Target archetype creation | target archetype not created | Entity unchanged in source archetype. No state change. |
| Target table growth | throws (maxCapacity) | Entity unchanged. Exception propagates. |
| Row allocation (after growth) | impossible — capacity is guaranteed | — |
| Column copy (typed array write) | cannot fail in JS | — |
| Entity metadata update | cannot fail (typed array write) | Entity now points to target. Source row is valid. |
| Source swap-remove | out-of-bounds only if bug | Precondition: sourceRow < sourceTable.count. Should never fail. |

**The only failure point is table growth exceeding maxCapacity.** If this occurs, the entity is unmodified, no resources are leaked (the archetype exists but has no allocated rows), and the exception propagates to the user. The command buffer flush should catch exceptions from individual commands and continue processing remaining commands (or abort — this is a design choice). Recommendation: abort the entire flush and throw, since a failed migration represents a resource budget violation.

### 4.5 Entity Metadata Update Window

Steps 35-36 update entity metadata BEFORE step 39 removes the source row. This is intentional — if swap-remove moves another entity, that entity's metadata update (step 42) is correct only if the current entity's metadata has already been updated to point to the new archetype.

Between steps 36 and 39, the entity's metadata points to the target archetype/row, but the source row is still valid. Any concurrent lookup during this window would find the entity in the target archetype — but since we are in a deferred flush (no systems running), no concurrent lookup occurs. The window is zero-observations wide.

### 4.6 Edge Cases

| Condition | Behavior |
|---|---|
| Migrate entity to an archetype it is already in (add component it has) | No-op at the command level. Not reached by migration. |
| Migrate entity from an archetype by removing a component it does not have | No-op at the command level. Not reached by migration. |
| Multiple migrations against the same entity in one flush | Processed in order. First migration updates entity metadata. Second migration reads updated metadata. |
| Migrate entity, then destroy it in the same flush | Correct: Create → Add → Remove → Destroy order. Destroy uses the final archetype. |
| Table growth during migration moves other entities? | No — table growth reallocates columns but does not change entity positions or swap rows. |
| Source table shrinks to 0 entities after removal | Table is valid and empty. No special handling needed. |

---

## 5. Archetype Creation

### 5.1 Procedure — Verified Against Design

```
function getOrCreateArchetype(signature: sorted Uint16Array): Archetype:
  key = signatureKey(signature)          // cached string
  existing = _archetypeMap.get(key)
  if existing: return existing

  // Create new archetype
  id = _nextArchetypeId++
  table = new Table(registry, signature, initialCapacity=64)
  archetype = new Archetype(id, signature, table)
  _archetypeMap.set(key, archetype)
  _archetypesById[id] = archetype
  _notifyQueryEngine(archetype)          // update query caches
  return archetype
```

### 5.2 Immutability

Once created, the following archetype properties never change:
- `id` (constant)
- `signature` (frozen sorted array)
- `table` (reference stable; table capacity and column data change, but the table object is the same)
- `addEdge`, `removeEdge` (maps are mutated (appended), but the map objects are the same)

This immutability is critical for:
- Query engine caches (archetype references remain valid).
- Entity metadata (archetype IDs remain valid).
- Graph edge references.

### 5.3 Initial Table Capacity

Starting at 64 rows is reasonable for most archetypes. If the first use of an archetype is a bulk spawn of 5000 entities, the table grows to 128, 256, 512, 1024, 2048, 4096, 8192 — eight doublings. Each doubling reallocates all columns. For an archetype with 10 columns of `Float64Array` (8 bytes each), each doubling copies 10 × 8 × currentCapacity bytes. The total copy cost across all doublings is roughly 2× the final allocation.

This is acceptable for a one-time cost during setup. If it becomes a problem, the initial capacity could be configured:

```
table = new Table(registry, signature, initialCapacity = 64)
// or: table = new Table(registry, signature, { initialCapacity: 256 })
```

### 5.4 Edge Cases

| Condition | Behavior |
|---|---|
| Create archetype after registry is locked | Not possible — component registration locks on first entity creation, and archetype creation requires entity creation. |
| Create archetype with unregistered component | Throw. |
| Signature contains duplicate component IDs | Throw (validate at archetype creation). |
| Table creation throws (OOM) | Exception propagates. Archetype is not stored. No leak. |

---

## 6. World Coordination

### 6.1 World Responsibilities — Verified Against Architecture

The World is an orchestrator, not a storage owner. It holds references to all subsystems and delegates operations:

| Operation | World delegates to |
|---|---|
| Create entity | EntityManager (ID) + ArchetypeManager (table) + writes metadata |
| Destroy entity | EntityManager (recycle ID) + Archetype/table (removeRow) |
| Add component | ArchetypeManager (migration) + EntityManager (metadata update) |
| Remove component | ArchetypeManager (migration) + EntityManager (metadata update) |
| Deferred command buffer | World-owned flush logic |
| Phase execution | SystemPipeline (Layer 3) |
| Query creation | QueryEngine (Layer 3) |
| Resource management | Resource container (Layer 4) |

### 6.2 Entity Creation in Detail

```
world.create([ComponentA, ComponentB]):
  // Immediate path (outside pipeline):
  1. signature = sort([ComponentA.id, ComponentB.id])
  2. archetype = getOrCreateArchetype(signature)
  3. row = archetype.table.allocate()
  4. entityId = entityManager.create()
  5. archetype.table.entityIds[row] = entityId
  6. entityManager.setEntityArchetype(entityId, archetype.id, row)
  7. // Write defaults (see migration algorithm)
     for each component in signature:
       initDefaults(component, archetype.table, row)
  8. return entityId

  // Deferred path (during pipeline):
  //   Command { type: 'create', components: [A, B] } is queued.
  //   On flush: execute the same logic as immediate.
```

### 6.3 What Does NOT Belong in the World

- Component schema storage (belongs to Registry, Layer 1).
- Entity metadata (belongs to EntityManager, Layer 1).
- Table column data (belongs to Table, Layer 1).
- Query match sets (belongs to QueryEngine, Layer 3).
- System ordering (belongs to SystemPipeline, Layer 3).
- Resource instances (belongs to Resource container, Layer 4).

The World is a thin coordination layer. If any significant business logic accumulates in the World class, it should be pushed down to the appropriate subsystem.

---

## 7. Deferred Commands

### 7.1 Command Buffer Design

The design describes a command buffer that accumulates mutations during system execution and flushes between phases. Several details need specification:

**Command types and their data:**

| Type | Data | Size (approx) |
|---|---|---|
| `Create` | componentIds[] (u16 array) | variable |
| `Destroy` | entityId (u32) | 4 bytes |
| `Add<T>` | entityId (u32), componentId (u16), initialValue? (optional) | 6-10 bytes |
| `Remove<T>` | entityId (u32), componentId (u16) | 6 bytes |
| `Set<T>` | entityId (u32), componentId (u16), field values (variable) | variable |

**Zero-allocation strategy:**
- Pre-allocate a ring buffer of command slots (e.g., 1024).
- Each slot is a tagged union: `{ type: u8, entityId: u32, componentId: u16, ... }`.
- If the ring buffer overflows, fall back to dynamic allocation.
- After flush, reset the head/tail pointers (commands are consumed, not freed).

### 7.2 Flush Order

Specified in the architecture:

1. **Creates** — so subsequent Add commands reference valid entities.
2. **Adds, Removes, Sets** — order among these matters. Adds before Removes (in case of add-then-remove on the same entity in the same flush).
3. **Destroys** — last, so all component data has been resolved.

**Refinement — within-category ordering:**
Within each category, commands are processed in FIFO order. If two commands in the same flush affect the same entity (e.g., Add A, then Add B on the same entity), they are processed sequentially, and each migration reads the updated entity metadata from the previous migration.

### 7.3 Nested Command Buffering

If a system calls `world.create(...)` during a flush (e.g., lifecycle hook `onAdd` creates another entity), this is a nested defer. The architecture states this should throw.

**Refinement — allow nested buffering:**
Instead of throwing, allow nested command buffers. When a flush is in progress, new commands are appended to a secondary buffer. After the primary flush completes, the secondary buffer is flushed recursively. This matches real-world patterns:

- `onAdd(Health)` triggers a system that creates a UI element entity.
- `onDestroy(Player)` triggers a system that spawns explosion particles.

Throwing in these cases would force users to work around the engine. Nested buffering is simpler for users and has no correctness issues (depth is bounded by the event chain).

### 7.4 Table Growth and Archetype Creation Timing

Both table growth and archetype creation happen exclusively during command flush. The flush is outside the system pipeline — no active iterators exist. This is safe.

**Guarantee:** No table growth or archetype creation occurs during system execution. Systems may read tables and archetypes but never mutate them.

### 7.5 Edge Cases

| Condition | Behavior |
|---|---|
| Empty command buffer | Flush is a no-op. |
| Create entity, then destroy it in the same flush | Net: no entity is ever visible. The create adds an entity, the destroy removes it. Both are processed in order. |
| Add component, then remove it in the same flush | Processed in order. Add migrates to new archetype. Remove migrates back to original. Net: entity state unchanged. |
| Create 10,000 entities in one command (bulk) | Handled by `allocateRange` on the table. |
| Command buffer ring overflows | Fall back to dynamic array allocation. |

---

## 8. Interaction with Layer 1

### 8.1 Layer 1 APIs Consumed by Layer 2

| Layer 1 API | Used by Layer 2 for | Depth |
|---|---|---|
| `registry.lookup(componentId) → Schema` | Archetype construction, column copy during migration | Per archetype creation, per migration |
| `entityManager.create() → EntityId` | Entity creation | Per entity |
| `entityManager.destroy(entityId)` | Entity destruction | Per entity |
| `entityManager.setMetadata(entityId, archetypeId, row)` | Migration, entity creation | Per entity |
| `entityManager.lookup(entityId) → (archetypeId, row)` | Entity lookup during migration | Per migration |
| `table.allocate() → rowIndex` | Entity creation, migration allocation | Per entity/migration |
| `table.allocateRange(count) → startRow` | Batch entity creation | Per batch |
| `table.reserve(count)` | Pre-allocation | Per table |
| `table.removeRow(rowIndex) → RemoveResult` | Entity destruction, migration cleanup | Per entity/migration |
| `table.getColumn(componentId, fieldName) → TypedArray` | Column copy during migration | Per component per migration |
| `table.entityIds → Uint32Array` | Read/write entity ID column | Per entity/migration |
| Shared utilities: `copyColumn(src, dst, srcRow, dstRow)`, `resetRow(cols, defaults, row)` | Column copy during migration | Per field per migration |

### 8.2 Interface Adequacy

All Layer 1 interfaces are sufficient for Layer 2's needs. No leaky abstractions or missing APIs identified.

**One observation:** The `table.getColumn(componentId, fieldName)` lookup is called for each field during migration. For a migration copying 3 components with 5 fields each, this is 15 `getColumn` calls. Each call may do a Map lookup or array scan.

**Performance note:** The column lookup should be O(1). The table should maintain an internal `Map<string, number>` from `"componentId:fieldName"` to column index, or a nested Map `Map<componentId, Map<fieldName, columnIndex>>`. This is an implementation detail, not an architectural concern.

### 8.3 Ownership Boundary

Layer 2 uses Layer 1. Layer 1 has no references to Layer 2. The boundary is clean.

The entity metadata typed arrays (`_entityArchetype`, `_entityRow`, `_entityGen`) are owned by Layer 1's Entity Manager. Layer 2 reads and writes them through the Entity Manager's API. No direct manipulation of the typed arrays cross-layer.

---

## 9. Performance Characteristics

### 9.1 Operation Complexity

| Operation | Complexity | Frequency |
|---|---|---|
| Entity create | O(1) amortized + O(fields) defaults write | Per spawn |
| Entity destroy | O(1) | Per death |
| Add component (single) | O(component) = lookup + O(shared fields) copy + O(new fields) init | Rare per entity |
| Remove component (single) | O(component) = lookup + O(shared fields) copy | Rare per entity |
| Bulk add/remove | O(k + m) = O(k) lookup targets + O(shared fields) copy + O(new fields) init | Rare |
| Archetype lookup (cached) | O(1) Map.get | Per migration |
| Archetype lookup (uncached) | O(N log N) key construction + Map.set + table creation + O(N × fields) column allocation | First migration only |
| Graph edge lookup | O(1) Map.get | Per migration (cached after first) |
| Archetype creation | Heavy — allocates table, registers with query engine | Once per unique signature |

### 9.2 Hidden O(N) Operations

- **Archetype lookup key construction:** The string key `signature.join(',')` is O(N) where N = component count. This is computed once per migration (uncached path) and once at archetype creation. Acceptable for the typical case of <15 components.
- **Column copy during migration:** O(shared_components × fields_per_component). Each copy is a single typed array element assignment. For a migration of 5 components with 20 total fields, this is 20 assignments — negligible.
- **Archetype creation (table construction):** O(signature_components × fields_per_component) for column allocation. Each column is created with `new Float32Array(capacity)`. This is the dominant cost in archetype creation but happens at most once per unique signature.

### 9.3 Allocation Hotspots

| Hotspot | Allocation type | Mitigation |
|---|---|---|
| Archetype lookup key | String per migration (uncached) | Only on first migration to a target. Not on hot path. |
| Table growth | New typed arrays per column | Occurs during flush only. Doubling minimizes frequency. |
| Command buffer | Array of command objects | Pre-allocated ring buffer avoids per-command allocation. |
| Entity ID generation | None (packed integer, no allocation) | Already optimal. |
| Migration | No per-migration allocation beyond the target row (already allocated in target table) | Target row is pre-allocated in the table. No per-entity migration allocation. |

### 9.4 Cache Behavior

- Migration column copy is a sequential typed array read from source row and sequential write to target row. Both access patterns are cache-friendly (single row per column, columns are dense).
- Archetype lookup by key is a single Map.get — one hash computation and bucket lookup.
- Entity metadata reads/writes are three typed array accesses at the same slot index — all in the same cache line (Uint32 + Uint32 + Uint8 = 9 bytes).

---

## 10. Memory Model

### 10.1 Archetype Lifetime

Archetypes live from creation until World destruction. They are never individually deallocated. This is acceptable for game sessions (hours) and most editor sessions. For long-running editor workflows with extensive undo/redo, an optional compaction pass could later destroy empty archetypes.

**Memory per archetype:**
- Archetype object: ~64 bytes (id, signature ref, table ref, two Map refs)
- Signature: `signature.length × 2` bytes (Uint16Array), plus string key
- Table: `(column_count + 1) × capacity × element_size` bytes (columns + entity ID column)
  - Example: archetype with 5 components, each with 3 fields = 15 columns. Each column is Float32Array of capacity 64 = 15 × 64 × 4 = 3840 bytes. Plus entity ID column: 64 × 4 = 256 bytes. Total: ~4KB.
- Graph edges: two Maps, each with M entries where M is the number of distinct single-component transitions observed from/to this archetype.

For 50 archetypes (generous): 50 × 4KB = 200KB for table data plus ~50KB for metadata. Negligible.

### 10.2 Fragmentation

No memory fragmentation concern. Typed arrays are contiguous. Table growth doubles capacity, never frees the old array. The old array becomes garbage and is collected by the JS engine. Since table growth is rare (doubling strategy) and typed arrays are not moved by the GC, fragmentation is not an issue.

### 10.3 Graph Memory

Each archetype stores two Maps. Maps in JS are hash tables with O(1) access. Memory per Map entry is approximately 32-40 bytes (key + value + hash). For an archetype with 5 outgoing edges (5 different components added by entities in this archetype), the cost is 5 × 32 = 160 bytes. Across 50 archetypes with an average of 3 edges each: 50 × 3 × 32 = 4800 bytes. Negligible.

---

## 11. Future Compatibility

### 11.1 Serialization

Layer 2 is compatible with serialization:

- Archetype signatures are arrays of stable component IDs (u16). Storable and comparable across saves.
- Table data is typed array columns — directly serializable via `TypedArray.buffer`.
- Archetype IDs are ephemeral and NOT serialized. On deserialization, archetypes are reconstructed from signatures.
- Entity IDs are ephemeral (generation-dependent). Entities are stored by archetype signature + row index, not by packed ID.

### 11.2 Prefab Instancing

Prefabs can be represented as archetype signatures + initial component values. Instantiating a prefab is a batch entity creation into the target archetype, with defaults overridden by prefab data. Layer 2 already supports batch creation via `allocateRange`.

### 11.3 Networking

- Archetype changes (add/remove component) are network-synchronizable as `(entityId, componentId, operation)`.
- Component data changes are synchronizable as `(entityId, componentId, field_values)`.
- Deterministic execution (design preference) ensures identical results from identical inputs across networked peers.

### 11.4 Scene Streaming

Archetypes are created lazily as needed during scene load. Scene data specifies (signature, entity count, component values). No architectural change needed.

### 11.5 Multithreading

Not currently supported (single-threaded JS). Future Worker-based execution would need to:
- Serialize archetype snapshots (typed array columns) for transfer to workers.
- Workers would process read-only column data and return results.
- Layer 2 would be the main thread only — archetype creation and mutation remain single-threaded.

No architectural changes to Layer 2 are required; the interface is already typed-array-based, which is Worker-transferable.

### 11.6 WASM and GPU

Layer 2 migration is CPU-only by nature (component data movement). No WASM or GPU offloading is expected or needed for migration. The typed array columns that migration operates on are the same columns that WASM and GPU systems consume — no special bridge required.

---

## 12. Hidden Assumptions

| # | Assumption | Risk | Recommendation |
|---|---|---|---|
| 1 | Archetypes are never destroyed | Low — tables persist when empty. Memory grows monotonically. Acceptable for game sessions. | Document as invariant. Revisit for editor compaction later. |
| 2 | Graph edges are never evicted | Low — bounded by distinct transitions ever observed. | Document as invariant. |
| 3 | Migration always finds a target archetype | Low — if the signature has valid component IDs, the archetype is created or found. | Document that only unregistered components cause failure. |
| 4 | Signature string key is unique per component set | True by construction — sorted canonical IDs produce unique strings. | Document the key format. |
| 5 | Table growth never fails silently | Medium — growth throws on maxCapacity. Migration must handle this. | Document that the caller must be prepared for exceptions from table growth. |
| 6 | Column copy never fails mid-operation | True — typed array element assignment cannot throw. | Document that migration is safe from partial copy. |
| 7 | Component IDs in signatures are always valid | True — validated at archetype creation. | Document validation step. |
| 8 | The empty archetype exists at World construction | Must be enforced at implementation. | Add to World constructor specification. |
| 9 | Query engine is notified synchronously when archetype is created | Must be enforced at implementation. | Document as a requirement in the World coordination spec. |
| 10 | Bulk transitions do not create graph edges | Design choice to avoid edge overwrites. | Document the rule explicitly. |

---

## 13. Missing Design Decisions

| # | Decision | Impact | Recommendation |
|---|---|---|---|
| 1 | Archetype Map key strategy | Blocking — on archetype lookup path. | Cached string key from `signature.join(',')`. |
| 2 | Archetype ID assignment and resolution | Blocking — entity metadata stores archetype IDs. | Monotonic dense IDs starting at 1. `_archetypesById: Archetype[]` array. |
| 3 | Inverse edge setting during migration | Correctness — ensures O(1) return transitions. | Set inverse edge (`target.removeEdge[C] = source`) during add migration, and vice versa. |
| 4 | Bulk transition edge handling | Correctness — prevents edge overwrites. | Bulk transitions do not create graph edges. Always compute target from scratch. |
| 5 | Nested deferred commands | Usability — lifecycle hooks common. | Allow nested buffering instead of throwing. Secondary buffer flushed after primary. |
| 6 | Empty archetype creation timing | Correctness — entity creation with no components. | Create empty archetype during World construction. |
| 7 | Migration failure mode | Correctness — budget overflow. | Exception propagates. Entity unchanged. |
| 8 | Archetype ID 0 convention | Consistency with Entity ID 0. | Archetype ID 0 is invalid. `_entityArchetype[slot] = 0` means free slot. |
| 9 | Signature validation at creation | Correctness — prevents bad archetypes. | Validate: no duplicate component IDs, all IDs registered. |

---

## 14. Invariant Compliance

| Invariant | Layer 2 Status |
|---|---|
| Entities are IDs, not objects | Compliant — migration operates on ID → (archetype, row). Entity metadata is typed arrays, not objects. |
| Components are pure data | Compliant — migration copies typed array columns. No component methods are called. No component instances exist. |
| Systems own behavior, components own data | Compliant — Layer 2 has no systems. Migration is infrastructure, not behavior. |
| Archetypes own storage | Compliant — each archetype owns its table. No sharing. |
| Migration is the cost of density | Compliant — add/remove component always triggers full migration. No shortcut paths exist. |
| Deferred commands required during iteration | Compliant — all entity mutation is deferred during system execution. Only flush triggers migration. |
| Layers never reach upward | Compliant — Layer 2 depends on Layer 1 only. The World (which crosses layers) mediates upward notifications. |
| Table structure never user-visible | Compliant — users interact through queries and World API. Archetypes and tables are internal. |
| Component schemas immutable after registration | Compliant — Layer 2 reads schemas, never mutates them. |
| Signatures are canonically ordered | Compliant — enforced at archetype creation and all signature computations. |
| Column order within table is immutable | Compliant — tables are created once, columns never reordered. |

**No invariants are violated.**

---

## 15. Conclusion

### Blocking Issues (must resolve before implementation)

1. **Archetype Map key strategy** — specify cached string key from sorted signature array.
2. **Archetype ID assignment** — specify dense monotonic IDs with `_archetypesById` array.
3. **Bulk transition edge policy** — specify that bulk transitions do not create graph edges.
4. **Inverse edge setting** — specify that both directions are set during single-component migration.
5. **Empty archetype creation** — specify that the empty archetype is created during World construction.

### Important Refinements

6. **Nested deferred commands** — allow nested buffering instead of throwing.
7. **Graph edges store references, not IDs** — avoids indirection during migration.
8. **Shared column copy using merge-join** — single algorithm handles add, remove, and bulk.
9. **Entity metadata update before source removal** — document the ordering and why it is correct.
10. **Signature validation** — validate no duplicate component IDs, all IDs registered.

### Optional Improvements

11. **Initial table capacity configuration** — allow user-configurable initial capacity.
12. **Archetype compaction for editor workflows** — defer to post-Phase 1.
13. **Command buffer ring** — implement zero-allocation ring buffer with dynamic fallback.

### Overall Readiness

**Layer 2 is approximately 90% ready for implementation.** The architecture is sound, consistent with Layer 1, and respects all architectural invariants. The four blocking issues are all straightforward specifications — no redesign is needed. Once the blocking issues are resolved, Layer 2 can be implemented independently, depending on Layer 1 and exposing interfaces for Layer 3.
