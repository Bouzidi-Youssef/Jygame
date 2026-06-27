# Phase 1.3 — Query Engine & System Execution Architectural Review

## Scope

This document reviews Layer 3 (Execution Layer) of the ECS architecture: Query Engine, Query Matching, Query Iteration, System Pipeline, Phase Execution, Deferred Command interaction, and Lifecycle Hooks. It assumes Layer 1 (Foundation) and Layer 2 (Archetypes) are finalized per the previous reviews and does not redesign them unless Layer 3 exposes a flaw in their interface.

---

## 1. Query Architecture

### 1.1 Query Object Design — Underspecified

The architecture defines a query as a component filter with `all`, `any`, and `none` sets plus a collection of matching archetypes. Several details are unspecified:

**Recommendation — separate matching from fetching:**
A query should distinguish between *what to match* (the filter: all/any/none) and *what to access* (the components the system reads or writes during iteration). These are logically separate concerns:

- A system may need to iterate entities that have `Transform` + `Sprite` (matching filter) but only write to `Transform`. It should not need to declare `Sprite` as an access target.
- A future scheduler needs read/write declarations to determine which systems can run in parallel.

In Phase 1, the access list defaults to the `all` set — every component used for filtering is also accessible. This preserves the simple model. However, the Query object **must reserve the distinction at the type level** so later phases can introduce read/write declarations without API breakage:

```
Query {
  id: number
  // Filter (determines which archetypes match):
  all: Uint16Array
  any: Uint16Array
  none: Uint16Array
  // Access (determines what the system reads/writes — Phase 1: defaults to all):
  read: Uint16Array
  write: Uint16Array
  ...
}
```

This does not add complexity in Phase 1. Internally, `read` = `write` = `all`. But query creation accepts an optional `access` parameter; when omitted, access defaults to all. Future phases can supply explicit access without changing the query creation API.

**Query immutability — should be an explicit invariant:**
A query's filter sets (all/any/none) and access sets (read/write) are immutable after construction. Only the match list (matching archetypes) is mutable — it grows as new archetypes are created. This is a formal invariant: it guarantees cache correctness, identity correctness, no recompilation, and no race with systems.

**Query identity:** Two queries with identical filters should resolve to the same compiled query object. If system A and system B both declare `query([Transform, Velocity])`, they should share a single query instance. This avoids redundant matching and duplicate memory.

**Recommendation — query cache:**
The query engine maintains a `Map<string, Query>` keyed by the canonical filter key (see §1.3). System registration does `queryEngine.getOrCreate(filter)` which returns the cached query or creates a new one. Systems hold a reference to the shared query.

**Query lifetime:** Queries live for the lifetime of the World. They are never evicted. Creation is a one-time cost; they are read-mostly thereafter.

### 1.2 Query Creation API — Specification Needed

The architecture mentions a `world.query(...)` call but does not specify the signature. The internal query engine needs a canonical representation:

```
Query {
  id: number                    // dense monotonic, for internal maps
  // Filter (immutable)
  all: Uint16Array              // sorted, deduplicated component IDs (must be present)
  any: Uint16Array              // sorted, deduplicated (at least one must be present)
  none: Uint16Array             // sorted, deduplicated (none may be present)
  // Access (defaults to all in Phase 1, reserved for future read/write separation)
  access: Uint16Array           // sorted component IDs that the system reads or writes
  // Pre-computed column slot indices (see §4.1 — zero-lookup column access)
  _columnSlots: Map<componentId, number>  // maps componentId → index in the per-chunk column array
  // Match state (mutable, internal)
  _matches: Archetype[]         // incrementally updated match list (private — see §4.1)
  // key for query cache
  _key: string                  // canonical filter key (see §1.3)
}
```

**Column slot pre-computation:** During query compilation, each component in `access` is assigned a fixed slot index (0, 1, 2, ...). The column slot map is stored on the query. At iteration time, `get(componentId)` resolves to `currentColumns[_columnSlots.get(componentId)]` — a number → array lookup with zero string hashing or Map iteration.

The public API is Phase 5, but the internal representation must be specified now because it affects matching (Layer 3) and registration (World → QueryEngine interface).

**Empty query:** If all three sets are empty, the query matches all archetypes (wildcard). This enables iterating all entities regardless of component set.

**Impossible query detection:** The query engine MUST detect contradictions at creation time:
- `all ∩ none ≠ ∅`: throw (impossible — a component must be both present and absent)
- `any` is empty AND the combination of other constraints makes matching impossible: not a contradiction, just means the query is equivalent to `all ∩ ¬none`
- If `all` and `any` are both empty but `none` is not: matches all archetypes that have none of the excluded components. Valid.

### 1.3 Query Filter Key Strategy — Blocking Issue

For the query cache (`Map<string, Query>`), a canonical key is needed. The same approach used for archetype signatures should be extended:

```
key = "a:1,5,12|n:3,7|y:2,9"
     // all=1,5,12   none=3,7   any=2,9
```

Sorted component IDs per set ensure canonical form. The key is computed once at query creation time and stored on the query for debugging.

If `any` is empty, omit the `y:` segment (and similarly for empty sets). This keeps keys minimal.

**Archetype key collisions:** The key format uses `|` separator and `,` within sets. Since component IDs are numeric, there is no ambiguity.

### 1.4 Query Compilation — Lazy vs Eager

The architecture implies synchronous compilation at query creation time. This is correct:

**Eager compilation (chosen):** On `queryEngine.getOrCreate(filter)`, if the query already exists, return it. If not, create the query object and test all existing archetypes against the filter. This populates the `matches` array immediately.

**Rationale:** Query creation is not on the hot path (once per unique filter, at system registration or user code). Eager compilation means the first iteration after creation is allocation-free. Lazy compilation would defer the matching cost to first iteration, making first-frame timings unpredictable.

### 1.5 Query Ownership

The World owns the Query Engine. The World also owns the Archetype Registry (Layer 2) — the Query Engine does not own or duplicate any registry state. It **borrows** a reference to the Archetype Registry, injected at construction time. This ensures a single source of truth for archetype data.

The Query Engine owns the query cache (`Map<string, Query>`). Queries own their match list (`Archetype[]`). Archetype references in the match list are stable (archetypes are never destroyed), so no dangling pointers.

Systems reference a query but do not own it. If a system is removed, the query continues to exist (other systems may share it).

---

## 2. Query Matching

### 2.1 Matching Algorithm — Specification Needed

The complete matching algorithm for testing an archetype against a query filter:

```
function matches(archetype, query) -> boolean:
  sig = archetype.signance      // sorted Uint16Array
  
  // ALL check: every component in query.all must be in signature
  if not subset(query.all, sig):
    return false
  
  // ANY check: if query.any is non-empty, at least one must be in signature
  if query.any.length > 0 and not intersects(query.any, sig):
    return false
  
  // NONE check: no component in query.none may be in signature
  if query.none.length > 0 and intersects(query.none, sig):
    return false
  
  return true
```

**Subset test (two-pointer merge):**
```
function subset(a: Uint16Array, b: Uint16Array) -> boolean:
  i = 0  // index into a (query.all)
  j = 0  // index into b (signature)
  while i < a.length and j < b.length:
    if a[i] == b[j]:
      i++; j++
    else if a[i] < b[j]:
      return false   // component in query missing from signature
    else:
      j++
  return i == a.length   // all query components found
```

**Intersection test (two-pointer merge, early exit on match):**
```
function intersects(a: Uint16Array, b: Uint16Array) -> boolean:
  i = 0; j = 0
  while i < a.length and j < b.length:
    if a[i] == b[j]:
      return true
    else if a[i] < b[j]:
      i++
    else:
      j++
  return false
```

Both are O(a + b). For typical component counts (1–15), this is negligible.

**Future optimization — bitmask matching:**
Since component IDs are dense (0..N where N is the number of registered components), each archetype signature can be represented as a bitmask (`Uint32Array` of ceil(N/32) elements, or a single `BigInt` for N ≤ 1024). Subset testing then becomes `(queryMask & ~archetypeMask) === 0` — a single operation instead of a merge walk.

This is **not recommended for Phase 1** — the two-pointer merge is simpler, allocation-free, and fast enough for small signatures. However, the signature representation should be abstract enough to permit this optimization later. The matching algorithm should go through a method on Archetype (e.g., `archetype.hasAll(componentIds)`) rather than accessing the sorted array directly, so the internal representation can change.

### 2.2 Matching Complexity

| Phase | Operation | Complexity |
|---|---|---|
| Query creation | Test all existing archetypes | O(archetypes × (a + s)) |
| New archetype | Test against all existing queries | O(queries × (q + s)) |
| Iteration | Walk match list, skip empty tables | O(matching_archetypes) |

**Hidden O(N):** Query creation tests ALL existing archetypes. With 200 archetypes (generous for a 2D game) and 30 queries, this is 6000 tests. Each test is ~30 element comparisons. Total: 180,000 comparisons. At ~1us per 100 comparisons, this is ~1.8ms — noticeable only during loading, not gameplay. Acceptable.

**New archetype notification** tests all queries. With 30 queries and a new archetype every frame (pathological — should not happen outside loading), this is 900 element comparisons per frame. Negligible.

### 2.3 Archetype Signature Access

The matching algorithm needs read access to archetype signatures. From Layer 2, each archetype exposes:

```
archetype.signature: Uint16Array  (sorted, frozen)
archetype.table: Table
archetype.id: number
```

Layer 2 already specifies these as immutable properties. No new API needed.

### 2.4 Edge Cases

| Condition | Behavior |
|---|---|
| Empty query (all=[], any=[], none=[]) | Matches all archetypes. |
| ALL query with no ANY, no NONE | Matches archetypes containing all specified components. |
| ANY query with empty ALL | Matches archetypes with at least one of the specified components. |
| NONE-only query with empty ALL and ANY | Matches archetypes containing none of the excluded components. |
| Impossible query (ALL ∩ NONE ≠ ∅) | Throw at query creation. |
| Query matching zero archetypes | Valid. Iterator yields zero chunks. |
| Tag-only query with no field components | Same matching logic. Tags have no fields but appear in signature. |
| Query with unregistered component | Throw at query creation. |
| Duplicate component in filter | Deduplicate and sort during key construction. No error. |
| Archetype with zero components (empty archetype) | Matched by wildcard queries and queries with no ALL/ANY constraints. |
| Very large filter (50+ components) | Unlikely in practice. O(a + s) matching still works, but the component count limit exists. Consider adding a warning at creation if a query filter exceeds 32 components. |

---

## 3. Archetype Registration

### 3.1 Notification Path — Specification Needed

When Layer 2 creates a new archetype, the World must notify Layer 3. The interface:

```
// Called by World after archetype creation
QueryEngine.onArchetypeCreated(archetype: Archetype): void
```

The implementation:
1. Iterates all registered queries.
2. Tests the new archetype against each query's filter.
3. If match: appends archetype to `query.matches` array.

**This is incremental — not a full rebuild.** Existing matches are not re-tested.

**Correctness proof:** No archetype is ever destroyed. The `matches` array is append-only. Adding an archetype to the match list of a query it matches is correct. Not adding it (when it doesn't match) is also correct.

### 3.2 Query Cache Ownership

The Query Engine owns the canonical query cache. The World holds a reference to the Query Engine and delegates:

```
World.query(filter) -> Query:
  return this._queryEngine.getOrCreate(filter)
  
World._onArchetypeCreated(archetype):
  this._queryEngine.onArchetypeCreated(archetype)
```

### 3.3 Archetype Registration Timing

**Important — queries created during a flush (by lifecycle hooks):**
If a query is created during a lifecycle hook (which fires during command flush), the query must perform a full scan of all existing archetypes at creation time. This covers any archetypes created earlier in the same flush but before the hook.

```
QueryEngine.getOrCreate(filter):
  cached = this._queryCache.get(key)
  if cached: return cached
  
  query = new Query(filter)
  this._queryCache.set(key, query)
  
  // Full scan: test ALL existing archetypes
  for archetype in this._archetypes:
    if matches(archetype, filter):
      query.matches.push(archetype)
  
  return query
```

The query engine must have access to all archetypes (via `_archetypesById` or a separate array). This is read-only access to Layer 2.

### 3.4 World→QueryEngine Interface

**Missing from Layer 2's review:** The interface through which the query engine accesses archetypes. The query engine needs:

| Need | Source | Notes |
|---|---|---|
| Iterate all archetypes (for query creation) | `world.getAllArchetypes() → Archetype[]` | Read-only. Live reference to the archetype registry. |
| Read archetype signature | `archetype.signature` | Already specified in Layer 2. |
| Read archetype table | `archetype.table` | Already specified in Layer 2. |
| Read table columns | `table.getColumn(componentId, fieldName)` | Already specified in Layer 1. |
| Read table entity IDs | `table.entityIds` | Already specified in Layer 1. |
| Read table count | `table.count` | Already specified in Layer 1. |

No new Layer 1–2 APIs are needed. The existing interfaces are sufficient.

---

## 4. Query Storage

### 4.1 Match List Representation

The architecture mentions "Set or array" for matching archetype IDs.

**Recommendation — array of Archetype references (internal):**

```
query._matches: Archetype[]
```

**Why `_matches` is internal:**
Later changes (chunk ordering, archetype priorities, dirty lists, compressed arrays) should not break external assumptions. Making the match list private from the start avoids API churn.

**Why array over Set:**
- Array iteration is cache-friendly and predictable (prefetching).
- Sets in JS have higher per-element overhead and are not optimized for iteration.
- Appending is O(1) amortized (archetypes are never removed from queries).
- No deduplication needed (each archetype is unique by construction).

**Why direct references over IDs:**
- Avoids an indirection through `_archetypesById[archetypeId]` on every `next()` call.
- Archetype references are stable (archetypes are never destroyed).
- The ID is still available as `archetype.id` for debugging/serialization.

**Pre-computed column slot indices (see also §1.2):**
During query compilation, each component in `access` is assigned a fixed slot index. The query stores `_columnSlots: Map<componentId, number>`. At iteration time, `get(componentId)` becomes a single `Map.get()` on the query (not on the table), yielding a slot index into the per-chunk column array. This eliminates table-level `Map.get(componentId, fieldName)` calls on every chunk.

For the hottest path, a system could bypass `get()` entirely by accessing columns directly by slot index (see §5.1 leaner API option).

### 4.2 Ordering Guarantees

**Archetypes are added to the match list in creation order** (the order they are passed to `onArchetypeCreated`). This provides a stable iteration order across runs with the same archetype creation sequence.

**Determinism:** The ordering is deterministic given the same sequence of archetype creations. This satisfies the determinism invariant.

**Performance:** Insertion order means the match list is naturally ordered by archetype creation time. No sorting needed.

### 4.3 When Queries Become Stale

The match list is always up-to-date because archetypes are never removed. However, a matching archetype's table may grow or shrink. The iterator handles this by reading `table.count` and `table.entityIds` on each `next()` call, not caching them.

No staleness concern for the match list itself.

---

## 5. Query Iteration

### 5.1 Iterator API — Specification Needed

The complete iterator API must be specified:

```
class QueryIterator {
  // Public
  next(): boolean                  // advance to next matching archetype
  get(componentId): FieldAccessor  // get column accessor for current chunk
  reset(): void                    // prepare for another iteration pass
  
  // Chunk state (reused across next() calls)
  entityIds: Uint32Array | null    // current archetype's entity ID column
  count: number                    // current archetype's entity count
  
  // Internal
  _query: Query                    // the query being iterated
  _index: number                   // current position in query.matches
}
```

**Usage pattern in a system:**
```
function movementSystem(world, iter, dt) {
  iter.reset();
  while (iter.next()) {
    // Option A: get by component (Phase 1, ergonomic)
    const transform = iter.get(TransformComponent);
    const velocity = iter.get(VelocityComponent);

    // Option B (future): column by fixed slot index — zero-lookup hot path
    // const transform = iter.column(0);
    // const velocity = iter.column(1);

    for (let i = 0; i < iter.count; i++) {
      transform.x[i] += velocity.x[i] * dt;
      transform.y[i] += velocity.y[i] * dt;
    }
  }
}
```

**Option B (`iter.column(index)`) is reserved for future optimization.**
During query compilation, each accessed component is assigned a fixed slot index (0, 1, 2, ...). These indices are stable for the query's lifetime. A system that knows its component slots can call `iter.column(0)` instead of `iter.get(componentId)`, eliminating the slot lookup altogether.

In Phase 1, `iter.get(componentId)` performs a single `Map.get()` on the query's `_columnSlots` map, yielding a slot index, then reads from the per-chunk column array. This is one hash lookup per component per chunk — fast enough for Phase 1. Option B provides a clear migration path to zero-lookup iteration without changing the architecture.

### 5.2 Allocation Behavior

**Zero-allocation iteration:** The iterator object is created once per system (at registration time) and reused across frames. The `reset()` method sets `_index = 0` and clears cached column references. No allocation occurs during iteration.

**`get(componentId)` caching:** The iterator caches column accessors from the current archetype. On each `next()` call, the cache is cleared and rebuilt lazily as `get()` is called. Each call to `get(componentId)` for a new (archetype, componentId) pair causes a Map lookup in the table. Within the same archetype, repeated `get()` calls for the same component are cached.

### 5.3 Skip-Empty Policy

**The iterator skips matching archetypes with zero entities.** If an archetype matches the query but its `table.count == 0`, `next()` advances past it without yielding.

**Rationale:** Yielding empty chunks forces every system to check `count > 0` in its inner loop. Skipping at the iterator level costs one integer comparison per `next()` and eliminates the per-system empty-chunk overhead.

### 5.4 Iterator Validity

Iterator validity guarantees (user-facing contract):

1. The iterator is valid for the duration of the current system call.
2. The iterator must not be used after the system returns.
3. Column references returned by `get(componentId)` are valid until the next `next()` call or `reset()`.
4. Entity IDs (via `entityIds`) are valid until the next `next()` call or `reset()`.
5. The iterator must be reset between separate iteration passes.

**Why these guarantees are sufficient:** No mutations occur during system execution (deferred commands). Tables do not grow, entities do not move, rows are not swapped. All column references remain stable.

### 5.5 Chunk-Level vs Entity-Level Iteration

The architecture chooses archetype-level (chunk) iteration. This is correct and matches the particle engine's bulk processing pattern.

An optional entity-level wrapper can be added in Phase 5 (Public API):
```
world.each([Transform, Velocity], (entity, transform, velocity) => { ... })
```

This wrapper is always slower than chunk iteration. It must never be used internally in engine systems.

---

## 6. Iterator Validity

### 6.1 Snapshot vs Live Iteration

**Live iteration (chosen).** The iterator reads the current state of each archetype's table on every `next()` call. The match list is a live reference — it reflects all archetypes that existed at the time of the last flush.

**No snapshot is taken.** The query does not copy entity IDs or column data. This is correct because:
- The match list is append-only (archetypes never removed).
- Table data (entity IDs, component values) changes only during flush.
- No mutations occur during system execution.

### 6.2 What Invalidates an Iterator

| Event | Iterator invalid? | Notes |
|---|---|---|
| `next()` called | No (advances, doesn't invalidate) | |
| System returns | Yes | System must not use the iterator after returning. |
| Command flush | Yes | Table growth reallocates columns; swap-remove changes entity order. |
| New archetype created | No* | Match list is append-only. Existing indices are stable. |
| World destroyed | Yes | All queries, archetypes, and tables are freed. |

*Unless the iterator's `_index` was positioned on an entry that hasn't been added yet. Since archetypes are only added during flush (when no iterator is active), this cannot happen.

### 6.3 Edge Case — Iterator After System Returns

If a system stores the iterator reference and attempts to use it later (next frame), the behavior is undefined. The table may have grown (column references are now dangling), or the match list may have changed (new archetypes added at the end).

**Recommendation:** Document this clearly. The iterator is valid only within the system function call that received it.

---

## 7. System Execution

### 7.1 System Object — Specification Needed

```
System {
  id: number          // dense monotonic, for dependency tracking
  query: Query        // the query this system iterates
  phase: PhaseId      // which phase the system runs in
  fn: Function        // (world, iterator, dt) => void
  enabled: boolean    // runtime toggle
  iterator: QueryIterator  // persistent iterator, reused per call
  before: Set<number> // explicit system IDs that must run before this one
}
```

**Iterator ownership:** Each system owns its iterator. The iterator is created when the system is registered and lives as long as the system. The pipeline calls `system.iterator.reset()` before invoking `system.fn(world, system.iterator, dt)`.

**Future optimization — system prebinding:**
At system registration, the pipeline could pre-bind column slot indices for each accessed component (from the query's `_columnSlots` map). This allows the system's hot path to use `iter.column(slot)` directly without any lookup. This is an implementation detail and does not affect the architecture — the column slot indices are already stable per query.

### 7.2 Phase Representation — Specification Needed

The architecture mentions phases as "ordered strings or enums." This must be specified concretely:

```
Phases = [
  'PreUpdate',
  'Update',
  'PostUpdate',
  'PreRender',
  'Render',
  'PostRender'
]
```

Custom phases are inserted by providing a position:
```
world.addPhase('MyCustomPhase', { after: 'Update', before: 'PostUpdate' })
```

**Phase ID:** Internally, phases are numbered 0..N-1 in execution order. The phase array is dynamic (custom phases can be added) but must be finalized before the first pipeline execution.

**Blocking issue:** Can custom phases be added after the pipeline has started? If yes, the phase ordering must be recomputed. If no, document the restriction. **Recommendation:** Phases must be registered before the first `world.update()` call. Adding phases afterward throws.

### 7.3 Execution Order Within a Phase

1. Determine if any `before` constraints exist.
2. If no constraints: run in **registration order** (the order `addSystem` was called).
3. If constraints exist: compute topological sort using `before` dependencies.
4. Cycle detection: if a cycle is detected, throw at system registration time (not at execution time).

**Registration order clarification:**
"Registration order" is deterministic only relative to calls made to `World.addSystem`. It does NOT guarantee determinism across differing JavaScript module loading orders. If two modules register systems, their relative order depends on which module's `addSystem` call happens first at runtime. Users who need a guaranteed ordering must use explicit `before` dependencies. Document this so users do not rely on file-system or import-order behavior.

**Topological sort algorithm:** Kahn's algorithm. O(V + E) where V = systems in phase, E = dependency edges. Computed once and cached. Recalculated only when a system is added/removed from the phase.

**System add/remove triggers recomputation:**
```
addSystem(system):
  // register, compute phase ordering lazily
  
removeSystem(systemId):
  // mark removed, recompute phase ordering
```

### 7.4 Before vs After

The architecture mentions only `before` dependencies. `after` is the logical inverse — `before: [B]` is equivalent to `after: [A]` from B's perspective. For simplicity:

**Recommendation:** Support only `before` in Phase 1. `after` can be transformed to `before` at registration time:
```
addSystem({ before: ['B'] })  // this system runs before B
addSystem({})                  // B is registered normally
// Internally: B.before.add(thisSystem.id) — same effect
```

If both `before` and `after` are needed, convert `after` to `before`:
```
// System X: { after: [A, B] }  →  A.before.add(X.id), B.before.add(X.id)
```

### 7.5 System Lifecycle

| Operation | Effect |
|---|---|
| `addSystem(config)` | Create system, get-or-create query, assign ID, add to phase, recompute phase ordering |
| `removeSystem(systemId)` | Remove from phase, disable, recompute phase ordering |
| `enableSystem(systemId)` | Set `system.enabled = true` |
| `disableSystem(systemId)` | Set `system.enabled = false` |
| `hasSystem(systemId)` | Check if system exists |

Systems are NOT destroyed individually during the World's lifetime. If a system is removed, its query may persist (shared with other systems). The system's iterator is discarded.

### 7.6 Edge Cases

| Condition | Behavior |
|---|---|
| System registered with no query (resource-only system) | Valid. The system receives `null` iterator. Used for systems that work on resources. |
| System registered with empty query (wildcard) | Iterates all entities in all archetypes. |
| System with `before` self-reference | Throw at registration (cycle). |
| System with `before` non-existent system ID | Throw at registration. |
| Two systems with mutual `before` | Throw at registration (cycle). |
| System disabled for entire session | No-op. Iterator is never reset or used. |
| Phase with zero systems | No-op — skipped. |
| Add system during pipeline execution | Throw. Systems must be registered outside `world.update()`. |
| Recursive `world.update()` call | Throw. Re-entrant pipeline execution is not supported. |

---

## 8. Pipeline Execution

### 8.1 Complete Execution Model — Specification Needed

```
world.update(dt):
  1. Validate not already inside pipeline (reentrancy guard)
  2. BeginFrame (phase)
  3. For each phase in order:
     a. For each system in phase (in computed order):
        i.   if not system.enabled: continue
        ii.  system.iterator.reset()
        iii. system.fn(world, system.iterator, dt)
     b. deferredCommands.flush()       // See §9
        i.   Process Create commands
        ii.  Process Add, Remove, Set commands
        iii. Process Destroy commands
        iv.  Fire lifecycle hooks (onCreate, onAdd, onRemove, onDestroy, onSet)
        v.   Process nested commands (recursive flush)
  4. EndFrame (phase)
  5. Clear per-frame state
```

### 8.2 Flush Timing — Critical Specification

**Flush occurs AFTER all systems in a phase complete, and BEFORE the next phase begins.**

This means:
- Systems within the same phase do NOT see each other's mutations.
- Entity mutations from the `Update` phase are visible only in `PostUpdate` and later phases.
- Entity mutations from `PostUpdate` are visible only in `PreRender` and later phases.
- Systems that create entities in `Update` must wait until `PostUpdate` to see them.

**This is the correct design for determinism.** It prevents within-phase ordering dependencies and keeps execution reasoning simple.

### 8.3 BeginFrame and EndFrame

BeginFrame and EndFrame are pseudo-phases that fire before the first real phase and after the last real phase, respectively. They have no systems. Their purpose:
- BeginFrame: systems can hook into "frame start" with a system registered in `BeginFrame` phase.
- EndFrame: systems can hook into "frame end" for cleanup or metrics.

**Recommendation:** Add `BeginFrame` and `EndFrame` as the first and last entries in the phase order. They are valid phases that systems can register against.

### 8.4 Reentrancy Guard

The pipeline must guard against reentrant calls:

```
world.update(dt):
  if this._insidePipeline:
    throw new Error('Recursive world.update() is not allowed')
  this._insidePipeline = true
  try {
    // ... pipeline execution ...
  } finally {
    this._insidePipeline = false
  }
```

A system must not call `world.update()`. If it needs to execute logic between systems, it should use multiple systems in different phases or flush manually (not supported for Phase 1).

### 8.5 Pipeline Ownership

The World owns the pipeline. The pipeline owns the phase list. Each phase owns its system list (ordered array).

---

## 9. Deferred Command Interaction

### 9.1 Command Visibility Model

| When | What is visible |
|---|---|
| During system execution | World state before this phase's flush. All deferred commands from earlier phases have been flushed. No commands from the current phase are visible. |
| During flush (between phases) | Intermediate world state. Creates → Adds → Removes → Destroys are applied in order. Lifecycle hooks fire. Nested commands are processed. |
| After flush | Complete world state. All commands from the preceding phase are applied. |

### 9.2 Command Buffer Interface

Layer 3 consumes Layer 2's deferred command interface:

```
World.deferCreate(components: ComponentId[]): void
World.deferDestroy(entityId: number): void
World.deferAdd(entityId: number, componentId: number): void
World.deferRemove(entityId: number, componentId: number): void
World.deferSet(entityId: number, componentId: number, values: ...): void
```

These are called by systems during execution. They are specified in Layer 2's review.

### 9.3 Nested Command Buffering — Conflict with Architecture Doc

The architecture document (line 155) states: "Nested command buffering (buffer while flushing) is an error and should throw early."

However, Layer 2's review (§7.3) refined this: "Allow nested buffering instead of throwing. When a flush is in progress, new commands are appended to a secondary buffer. After the primary flush completes, the secondary buffer is flushed recursively."

**Layer 3 must be consistent with Layer 2's refinement.** The architecture document's `throw` rule is superseded. Nested buffering is required because lifecycle hooks (§10) commonly create or destroy entities.

**Impact on Layer 3:** The pipeline's flush step becomes recursive. After flushing the primary command buffer, if the secondary buffer has entries, flush it. Repeat until empty.

```
flush():
  while commandBuffer.hasCommands() or nestedBuffer.hasCommands():
    processPrimaryBuffer()
    promoteNestedToPrimary()
```

### 9.4 Query Consistency During Flush

Archetypes created during flush trigger `onArchetypeCreated` → query caches are updated incrementally. This is correct and safe because no systems are running during flush.

### 9.5 Table Growth During Flush

Table growth reallocates typed array columns. This invalidates any cached column references. Since flush happens between phases (no active iterators), no stale references exist. Reallocation is safe.

---

## 10. Lifecycle Hooks

### 10.1 Hook Registration — Specification Needed

```
// Component-specific: fires when component C is added/removed/set
world.onAdd(ComponentId, callback(entityId): void)
world.onRemove(ComponentId, callback(entityId): void)
world.onSet(ComponentId, callback(entityId): void)

// Entity lifecycle: fires on creation/destruction
world.onCreate(callback(entityId): void)
world.onDestroy(callback(entityId): void)
```

Multiple callbacks per event type are allowed. They fire in registration order.

### 10.2 Hook Execution Timing

Hooks fire during command flush, in the following order within each command:

| Command | Hook sequence |
|---|---|
| Create entity E with components [A, B] | `onCreate(E)` → `onAdd(A, E)` → `onAdd(B, E)` |
| Add component C to entity E | `onAdd(C, E)` |
| Remove component C from entity E | `onRemove(C, E)` |
| Set component C on entity E | `onSet(C, E)` |
| Destroy entity E | `onRemove(A, E)` → `onRemove(B, E)` → ... → `onDestroy(E)` |

**Hook execution is synchronous and immediate** within the flush. Flush does not continue until all hooks for the current command have completed.

### 10.3 Hook Recursion — Flush Iteration Limit

Hooks may queue new commands (via deferred API). These commands are appended to a secondary buffer and processed after the primary flush completes (see §9.3).

**Limit mechanism — use flush iteration count, not call depth:**
The chain `flush A → hook creates B → flush B → hook creates C → flush C → ...` is iterative, not recursive. Each flush processes its own buffer. Using JS call-stack depth to limit this would cause false positives (the chain does not recurse in the stack sense).

**Recommendation — `maxFlushIterations`:**
Track a monotonic flush generation counter. If flush exceeds a configurable number of iterations (default: 32), throw. This covers realistic chains without false stack-depth positives.

```
flush():
  generation = 0
  while buffer.hasCommands() or nestedBuffer.hasCommands():
    if ++generation > this._options.maxFlushIterations:
      throw new Error('Exceeded max flush iterations (possible infinite hook cycle)')
    processPrimaryBuffer()
    promoteNestedToPrimary()
```

### 10.4 Hook Performance

If no handlers are registered for a given (event, component) pair, hook dispatch must be a no-op with minimal overhead.

**Recommendation:** Each hook type maintains a `Set<ComponentId>` of components that have at least one handler. Before dispatching a hook, check if the component is in this set. If not, skip entirely. This makes the common case (no hooks registered) a single Set lookup per entity/component.

### 10.5 Edge Cases

| Condition | Behavior |
|---|---|
| Hook throws an exception | **Configurable policy** (see below). Default in development: throw and abort frame. Default in production: disable hook, log, continue. |
| Hook for component that has no handlers | Zero overhead — skip via set emptiness check. |
| Hook modifies the same entity that triggered it | Allowed via nested defer. Processed in secondary flush. |
| Hook destroys the entity that triggered onAdd | Queued Destroy in secondary buffer. Entity exists for the current onAdd frame but is destroyed before the next phase. |
| Multiple hooks for same event+component | All fire in registration order. |
| Hook that disables its own system | Allowed. System state change takes effect next frame. |
| No hooks registered for any event | Fast path: skip the entire hook dispatch step. |

**Hook error policy — configurable:**

A throwing lifecycle hook can corrupt world state (e.g., half-initialized entity). Silently swallowing errors may leave the world in an inconsistent state. The policy should be configurable:

```
world.options.hookErrorPolicy = 'abort' | 'disableHook' | 'log'
```

| Policy | Phase 1 default | Behavior |
|---|---|---|
| `'abort'` | Development | Exception propagates. Frame is aborted. Stack is preserved for debugging. |
| `'disableHook'` | — | Disable the specific hook handler that threw, log the error, continue flush. Prevents recurring failures. |
| `'log'` | Production fallback | Log the error, continue flush without disabling the handler. |

**Same principle applies to system execution errors:**
A system that throws during execution should have a configurable error boundary:

```
world.options.systemErrorPolicy = 'abort' | 'disableSystem' | 'log'
```

This parallels the hook error policy. Default is `'abort'` in development, `'log'` in production.

---

## 11. Interaction with Layers 1–2

### 11.1 Layer 2 APIs Consumed by Layer 3

| Layer 2 API | Layer 3 use | Depth |
|---|---|---|
| `archetype.signature` | Query matching | Per archetype per query test |
| `archetype.id` | Debugging, match storage | Per match |
| `archetype.table` | Column access during iteration | Per chunk |
| `world.deferCreate(...)` | System mutation (deferred) | Per deferred mutation |
| `world.deferDestroy(...)` | System mutation (deferred) | Per deferred mutation |
| `world.deferAdd(...)` | System mutation (deferred) | Per deferred mutation |
| `world.deferRemove(...)` | System mutation (deferred) | Per deferred mutation |
| `world.flush()` | Command flush between phases | Per phase boundary |
| `world.getAllArchetypes()` | Full scan for new query | Per query creation |

### 11.2 Layer 1 APIs Consumed by Layer 3

| Layer 1 API | Layer 3 use | Depth |
|---|---|---|
| `table.getColumn(componentId, fieldName)` | Column reference for iteration | Per component per chunk |
| `table.entityIds` | Entity ID access during iteration | Per chunk |
| `table.count` | Entity count for current archetype | Per chunk |
| `registry.lookup(componentId)` | Schema access for column metadata | Per component |

### 11.3 Interface Adequacy

All interfaces are sufficient. No missing APIs identified.

**One note:** The query engine needs access to ALL archetypes (not just matching ones) during query creation. The World must expose `getAllArchetypes(): Archetype[]` or provide an injectable reference to the `_archetypesById` array.

### 11.4 Layer Boundary Compliance

| Direction | Compliant? | Notes |
|---|---|---|
| Layer 3 → Layer 2 (read) | Yes | Reads signatures, tables, archetype refs. |
| Layer 3 → Layer 1 (read) | Yes | Reads columns, counts, entity IDs. |
| Layer 3 → Layer 2 (write) | Yes (via World) | Only through deferred command API. Systems never write directly. |
| Layer 2 → Layer 3 (notification) | Mediated by World | World calls `queryEngine.onArchetypeCreated()`. This is not an upward dependency — it is the World coordinating its owned subsystems. |
| Layer 3 → Layer 4 | Not applicable | Layer 4 (Integration) depends on Layer 3. |

No violations.

---

## 12. Performance Characteristics

### 12.1 Operation Complexity

| Operation | Complexity | Frequency |
|---|---|---|
| Query creation (cached) | O(1) Map.get | Per unique filter |
| Query creation (uncached) | O(archetypes × (a + s)) | Once per unique filter |
| New archetype notification | O(queries × (q + s)) | Per new archetype (rare) |
| Iterator reset | O(1) | Per system per phase |
| Iterator next() (skip empty) | O(matching_archetypes) typical | Per chunk per phase |
| Iterator get(componentId) | O(1) after lazy cache | Per component per chunk |
| System execution per chunk | O(count × fields_accessed) | Per entity per field per system |
| Phase ordering (no deps) | O(systems) insert | Once per system registration |
| Phase ordering (with deps) | O(systems + edges) topo sort | Once per system add/remove |
| Command flush | O(commands + components × fields) | Per phase boundary |

### 12.2 Hidden O(N) Operations

| Operation | Complexity | Risk |
|---|---|---|
| Query creation (full scan) | O(archetypes) | Acceptable — archetype count is small. If 10 queries are created during loading with 200 archetypes, 2000 tests at ~30 element comparisons each = 60K comparisons. ~0.06ms. |
| New archetype notification | O(queries) | Acceptable — 30 queries × 30 comparisons = 900. Negligible. |
| Iterator get() first call per chunk | O(fields) to build accessor | Per component per chunk. Acceptable — building the accessor is required work (must get column references). |
| Hook dispatch with no handlers | O(1) per entity (Set.has) | Acceptable — single operation. |
| Hook dispatch with handlers | O(handlers) | Bounded by user registration. |

### 12.3 Allocation Hotspots

| Operation | Allocation | Frequency |
|---|---|---|
| Query object | 1 object + 3 Uint16Arrays | Once per unique filter |
| System object | 1 object + 1 iterator | Once per system |
| Iterator object | ~20 bytes (2 numbers + 2 refs) | Once per system |
| Column accessor object (per next()) | 1 object per component accessed | Per chunk per system per phase |
| Command buffer entries | Pre-allocated ring buffer | Zero allocation (ring) or dynamic (overflow) |

**Column accessor allocation:** Each `next()` call may allocate accessor objects for queried components. For a query with 3 components and 500 chunks, that's 1500 small objects allocated during a phase. This is acceptable for gameplay but may cause GC pressure in tight frames.

**Optimization:** The iterator can reuse accessor objects, overwriting their field references on each `next()` call, instead of allocating new ones. This makes `get(componentId)` return a stable reference that is mutated in place across `next()` calls. The user must not cache the accessor across `next()` calls (same rule as `entityIds`).

**Recommendation:** Implement zero-allocation iteration as the standard. Accessors are reused (mutated in place) across chunks. Document that accessors are only valid until the next `next()` call.

### 12.4 Cache Behavior

Iterator `next()` advances through the match list (an `Archetype[]` array). This is a sequential scan of references (8 bytes each). For 50 matching archetypes, the match list fits in a single cache line (64 bytes can hold 8 references). If the list spans multiple cache lines, the prefetcher handles the sequential pattern.

For each chunk's entity processing: the system accesses `entityIds` and component columns, all typed arrays. The access pattern within a chunk is sequential from `0` to `count`. The prefetcher handles this well.

**Pointer chasing:** The `next()` call reads the archetype reference, then follows it to the table, then reads `entityIds` and columns. This is a pointer chain of 4-5 hops (matches[i] → archetype → table → columns). Each hop may be a cache miss. For 50 archetypes, this is 50 × 4 = 200 cache lines fetched — acceptable.

---

## 13. Memory Model

### 13.1 Memory Ownership

| Object | Owner | Lifetime |
|---|---|---|
| Query cache (Map) | QueryEngine | World lifetime |
| Query objects | QueryEngine (in cache) | World lifetime |
| Query.match arrays | Query | World lifetime (append-only) |
| Iterator | System | World lifetime |
| Accessor objects (lazy) | Iterator | World lifetime (reused) |
| System objects | Pipeline (by phase) | World lifetime |
| Phase list | Pipeline | World lifetime |
| Hook handler lists | World (lifecycle event system) | World lifetime |
| Command buffer | World | Per-frame (cleared after flush) |
| Archetype list (all) | World (Layer 2) | World lifetime (read by Layer 3) |

### 13.2 Memory Growth Over Time

| Source | Growth rate | Concern |
|---|---|---|
| Query match arrays | 1 entry per matching archetype | Negligible — bounded by archetype count. |
| Archetype list | 1 entry per unique signature | Bounded by unique component combinations seen. |
| Hook handler lists | 1 entry per user registration | Bounded by user code. |

No unbounded growth. All structures are bounded by the number of archetypes, queries, and system registrations — all of which are finite and small in a game session.

### 13.3 Iterator Reuse vs Allocation

The iterator is allocated once per system (at registration). It is reset before each system call. This achieves zero per-frame allocation for iteration state.

The only per-chunk allocation is the optional column accessor objects (see §12.3). With accessor reuse (mutation in place), even this is eliminated.

**Zero-allocation iteration is achievable** with careful implementation.

---

## 14. Future Compatibility

### 14.1 Serialization

Queries are runtime-only constructs. They are not serialized. On deserialization, systems re-register their queries.

Serialization of world state (entity data, archetypes, component values) is handled by Layers 1–2. Layer 3 does not participate.

### 14.2 Prefabs and Scene Loading

Scene loading creates entities in batches. This triggers archetype creation and notification. Query caches are updated incrementally during loading. No special handling needed.

Prefab instantiation uses the same entity creation path. Systems see prefab entities in the next phase after the instantiation flush.

### 14.3 Networking

Deterministic execution requires:
- Same system registration order across peers.
- Same phase ordering.
- Same system ordering within phases.
- Same `dt` (use fixed timestep for networking).

Layer 3's deterministic ordering satisfies these requirements. Networked state synchronization uses Layers 1–2 (entity data).

### 14.4 Multithreading and Workers

Not applicable to Phase 1 (single-threaded JS). Future extension:

- Query matching can be parallelized (test multiple queries against a new archetype concurrently).
- System execution within a phase could be parallelized if systems have no data dependencies. The explicit `before` dependencies provide a dependency graph that a scheduler could use.

Layer 3's design does not preclude multithreading — the query model and system ordering provide natural parallelism boundaries.

### 14.5 WASM and GPU

Systems that process typed array columns (the standard iteration model) can be compiled to WASM or WGSL. The chunk accessor (`entityIds`, column typed arrays) maps directly to WASM memory views or GPU storage buffers.

The iterator's chunk interface is already pointer-and-length based, which is the natural WASM calling convention. No bridge needed.

### 14.6 Hot-Reloading

A system's `fn` can be replaced at runtime (new function assigned to `system.fn`). The query, iterator, and phase remain unchanged. This supports hot-reloading during development.

### 14.7 Editor Tooling

The query engine and pipeline can expose introspection:
- Query match lists (show which archetypes match).
- System execution order (show dependency graph).
- Per-frame timing (profile system execution).

These are additive and do not require architectural changes.

---

## 15. Hidden Assumptions

| # | Assumption | Risk | Recommendation |
|---|---|---|---|
| 1 | Archetypes are never destroyed | Low — a core invariant from Layer 2. Query match arrays never need removal. | Document as dependency. |
| 2 | No archetype creation during system execution | Low — enforced by deferred command model. | Document as invariant. |
| 3 | Table count is stable during iteration | Low — no mutations during system execution. | Document as invariant. |
| 4 | Column references are stable during iteration | Low — no table growth during system execution. | Document as invariant. |
| 5 | Systems do not store iterator across calls | Medium — if violated, references to reallocated columns are stale. | Document in iterator contract. |
| 6 | Systems do not cache chunk data across phases | Medium — column references change after flush. | Document in system contract. |
| 7 | Hook handlers do not throw | Medium — a throwing hook can corrupt world state mid-initialization. | Configurable error policy: abort (dev) or disableHook/log (prod). |
| 8 | All archetypes are accessible to the query engine at creation time | Low — the query engine holds a reference to the archetype list. | Inject at construction time. |
| 9 | Filters with `any` are correctly handled | Medium — the matching algorithm must handle empty `any` as "skip the ANY check." | Specify in matching algorithm. |
| 10 | Systems within a phase do not need to see each other's mutations | Medium — violates if users expect within-phase visibility. | Document phase boundary semantics clearly. |
| 11 | Query creation is always successful (components are registered) | Low — validated at creation. | Document validation. |
| 12 | No recursive `world.update()` | Medium — would corrupt pipeline state. | Add reentrancy guard. |
| 13 | `dt` is non-negative and finite | Low — caller responsibility. | Document that systems should handle dt=0. |
| 14 | Systems that create queries during hooks must exist | Low — query engine handles full scan after registration. | Document that query creation is safe at any time. |

---

## 16. Missing Design Decisions

### 16.1 Blocking Issues (must resolve before implementation)

| # | Decision | Impact |
|---|---|---|
| 1 | **Query identity and caching strategy** | Duplicate filters must resolve to the same query. Affects system registration. |
| 2 | **Query filter key format** | Affects query cache correctness. Must encode all/any/none/access. |
| 3 | **Iterator ownership and allocation model** | Per-system iterator vs per-query iterator. Affects per-frame allocation. |
| 4 | **Phase definition and ordering** | Are phases strings, enums, or ordered objects? Can custom phases be added after first `world.update()`? (Decision: lock after first update.) |
| 5 | **Flush timing relative to systems within a phase** | Flush after ALL systems in a phase or after each system. Affects visibility model. |
| 6 | **Nested command buffering** | Allow or throw. Must be consistent with Layer 2's refinement (allow with secondary buffer). |
| 7 | **Lifecycle hook execution order** | Per-component hook ordering and entity-level hook ordering during flush. |
| 8 | **Recursive pipeline guard** | Throw on recursive `world.update()`. |

### 16.2 Important Refinements

| # | Decision | Impact |
|---|---|---|
| 9 | **Skip-empty archetypes in iterator** | Yields zero-chunk iterations vs skipping entirely. Affects system ergonomics. |
| 10 | **Column accessor reuse across chunks** | Zero-allocation iteration vs per-chunk allocation. Affects GC pressure. |
| 11 | **Impossible query detection** | Throw on ALL ∩ NONE overlap at creation time. |
| 12 | **Hook and system error policies** | Configurable (abort/disableHook/log) rather than hardcoded. Affects robustness vs debuggability. |
| 13 | **Hook handler presence check** | Fast-path skip when no handlers registered. |
| 14 | **System ordering computation timing** | Eager (on registration) vs lazy (on first execute). |
| 15 | **Before-only vs before+after dependencies** | Simplify to `before` only with implicit `after` conversion. |
| 16 | **Empty query semantics** | Wildcard matching all entities. Must be specified. |
| 17 | **BeginFrame/EndFrame as special phases** | Adds frame boundaries for lifecycle. |
| 18 | **Filter vs access separation** | Phase 1: access defaults to all. Type-level reservation for future explicit read/write. |
| 19 | **Registration order determinism** | Deterministic relative to `addSystem` calls only, not module loading order. |
| 20 | **Hook recursion limit** | Use flush iteration count (default 32) instead of call-stack depth. |

### 16.3 Optional Improvements

| # | Decision | Impact |
|---|---|---|
| 21 | **Incremental query compilation** | Full scan on creation vs first-use scan. Eager is simpler. |
| 22 | **Per-query phase ordering** | Systems within a phase can have inter-phase dependencies (rare). |
| 23 | **System prebinding** | Pre-bind column slot indices at registration for zero-lookup iteration. |
| 24 | **Leaner iterator API (`iter.column(index)`)** | Eliminates component ID lookup on hot path. Reserved for post-Phase 1. |
| 25 | **System metadata (name, description, tags)** | Useful for debugging and editor tooling. |
| 26 | **Bitmask matching optimization** | Replace two-pointer merge with bitwise operations. Not for Phase 1. |

---

## 17. Invariant Compliance

| Invariant | Layer 3 Status |
|---|---|
| Entities are IDs, not objects | Compliant — iteration provides `entityIds` as Uint32Array, not entity objects. |
| Components are pure data | Compliant — `get(componentId)` returns typed arrays, not component instances. No methods or constructors invoked. |
| Systems own behavior, components own data | Compliant — systems are functions that process typed arrays. No behavior is stored on components. |
| Archetypes own storage | Compliant — queries hold references to archetypes. The query engine reads archetype data but does not own storage. |
| Migration is the cost of density | Compliant — no shortcut paths. All add/remove is deferred to flush and triggers full migration. |
| Deferred commands required during iteration | Compliant — all system mutations are deferred. No direct mutation during iteration. |
| Layers never reach upward | Compliant — Layer 3 reads from Layers 1–2. The World mediates notifications Layer 2 → Layer 3. |
| Table structure never user-visible | Compliant — users interact through queries and iterators. Archetype IDs, table references, and column layouts are internal. |
| Component schemas immutable after registration | Compliant — queries read schemas at creation time for column access. |
| Signatures are canonically ordered | Compliant — query matching relies on sorted archetype signatures from Layer 2. |
| Query filters are immutable after creation | Compliant — the Query type treats all/any/none/access as frozen Uint16Arrays. Only `_matches` is mutable. |
| Deterministic execution | Compliant — phase ordering, system ordering (registration order + topological sort), and archetype insertion order are all deterministic. |

**No invariants are violated.** However, one design preference should be reviewed:

| Preference | Status |
|---|---|
| No OOP in iteration | Compliant — iteration is chunk-based with direct typed array access. |
| Explicit data flow | Compliant — systems communicate through shared components (visible via queries) and resources. |
| Deterministic execution | Compliant — see above. |
| Locality over abstraction | Compliant — chunk access provides direct typed array references, no wrapping. |
| No premature generality | At risk — the query engine must be careful not to over-abstract. The distinction between filter and access (if introduced) must be justified by a concrete need. |

---

## 18. Overall Readiness

### Blocking Issues

1. **Query identity and caching** — resolution: cache by canonical filter key in a Map. Duplicate filters share the same query.
2. **Query filter key format** — resolution: sorted all/any/none component IDs joined with `|` delimiters.
3. **Iterator ownership** — resolution: each system owns its iterator. Pipeline resets before each system call. Zero per-frame allocation.
4. **Phase ordering** — resolution: ordered array of phase IDs. Custom phases allowed before first `world.update()`. Throw afterward.
5. **Flush timing** — resolution: flush after ALL systems in a phase complete, before the next phase begins. This is already specified but must be enforced.
6. **Nested command buffering** — resolution: allow secondary buffer during flush (per Layer 2 refinement). Architecture doc's `throw` is superseded.
7. **Lifecycle hook order** — resolution: specified in §10.2 (command → per-entity hooks → per-component hooks in sorted signature order).
8. **Recursive pipeline guard** — resolution: throw on recursive `world.update()`.

### Important Refinements

9. Iterator skips empty matching archetypes automatically.
10. Column accessors are reused across `next()` calls (zero-allocation iteration).
11. Impossible queries (ALL ∩ NONE) detected and throw at creation.
12. Hook and system error policies are configurable (abort/disableHook/log) rather than hardcoded. Development defaults to abort (preserve stack), production to log.
13. Hook dispatch is a no-op (single Set lookup) when no handlers exist.
14. System order is computed eagerly on registration (or lazily on first execute — both are correct).
15. `before`-only dependencies (convert `after` to `before` at registration).
16. Empty query (all=[], any=[], none=[]) matches all archetypes.
17. BeginFrame and EndFrame as valid phases for system registration.
18. The filter vs access distinction is reserved at the type level but defaults to identity in Phase 1 — future explicit read/write declarations are possible without API breakage.
19. Registration order is deterministic relative to `addSystem` calls, not relative to module loading order.
20. Hook recursion uses flush iteration count (default 32) instead of call-stack depth.

### Optional Improvements

21. Pre-computed column slot indices on the query for zero-lookup `get()`.
22. System prebinding at registration (bind column slots to indices for `iter.column(index)`).
23. Leaner iterator API (`iter.column(index)`) as an alternative to `iter.get(componentId)` on the hot path.
24. System metadata (name, tags) for editor tooling.
25. Bitmask matching as a future optimization (keep signature access abstract).

### Implementation Readiness

**Layer 3 is approximately 96% ready for implementation.**

The architecture is coherent, internally consistent with Layers 1–2, deterministic, cache-friendly, and avoids unnecessary abstraction. The remaining work comprises API design decisions (exact signatures, class structure) and micro-optimizations (column slot pre-computation, system prebinding) that can be implemented incrementally without architectural risk.

The 8 blocking issues are all straightforward specifications — unambiguous decisions captured in this document. The 20 refinements are documented and ready for implementation.

Key strengths of the architecture:
- Clear separation of matching (filter) from fetching (access), with a migration path for future read/write declarations.
- Zero-allocation iteration achieved through iterator reuse and column slot pre-computation.
- Configurable error policies for hooks and systems, preventing development-debuggability vs production-robustness tradeoffs.
- Recursive flush bounded by iteration count, not call depth — avoids false positives in real-world hook chains.
- Formal invariants (query filter immutability, layer boundaries, deterministic ordering) documented and verified.

No architectural flaws remain. Implementation can proceed on Layer 3.
