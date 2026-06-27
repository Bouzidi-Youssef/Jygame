# Phase 1.4 — World Integration, Resources & Public API Architectural Review

## Scope

This document reviews Layer 4 (Integration Layer) of the ECS architecture: the World API, Resources, Events, and the public API surface that connects Layers 1–3 into a coherent whole. It assumes Layers 1 (Foundation), 2 (Archetypes), and 3 (Execution) are finalized per the previous reviews and does not redesign them unless Layer 4 exposes an interface inconsistency.

---

## 1. World Architecture

### 1.1 World Responsibilities — Specification Needed

The World is the single entry point for all ECS operations. Its responsibilities:

| Responsibility | Delegates to | Layer |
|---|---|---|
| Entity lifecycle (create, destroy) | EntityManager + ArchetypeSystem | 1, 2 |
| Component operations (add, remove, has, get, set) | ArchetypeSystem + EntityManager + Table | 1, 2 |
| Component registration | ComponentRegistry | 1 |
| Query creation and caching | QueryEngine | 3 |
| System registration and execution | Pipeline | 3 |
| Phase management | Pipeline | 3 |
| Deferred command buffering and flush | CommandBuffer | 2 |
| Resource storage and lookup | ResourceContainer | 4 |
| Lifecycle hooks (onAdd, onRemove, etc.) | HookSystem | 4 |
| User-defined events | EventSystem | 4 |

**God object risk assessment:**
The World touches every subsystem. However, it is a facade — it owns references and delegates operations. No business logic lives in the World class itself. The delegation pattern is the correct mitigation.

**Recommendation — group subsystems internally:**
Instead of the World owning every subsystem directly, group them into internal clusters:

```
class World {
  // Internal subsystem groups
  #core: ECSCore            // Registry + EntityManager + ArchetypeSystem
  #scheduler: Scheduler     // Pipeline + QueryEngine + CommandBuffer
  #runtime: Runtime          // ResourceContainer + HookSystem + EventSystem

  // Public API namespaces (see §2.1)
  entities = new EntityAPI(this.#core)
  components = new ComponentAPI(this.#core)
  resources = new ResourceAPI(this.#runtime)
  systems = new SystemAPI(this.#scheduler)
  events = new EventAPI(this.#runtime)
  query(filter) { return this.#scheduler.queryEngine.getOrCreate(filter) }
}
```

The public API stays identical (flat or namespaced — see §2.1). Internally, this dramatically reduces constructor complexity and groups related subsystems by layer. The core group (Layer 1–2), scheduler group (Layer 3), and runtime group (Layer 4) each have their own construction and teardown.

**Capability boundaries — don't hard-code assumptions that prevent specialized World variants:**
The current World assumes a single runtime (render, update, audio, input). Future variants may need different subsets:

- `EditorWorld`: read-only entity access, query inspection, no systems execution.
- `ServerWorld`: no renderer resource, deterministic-only systems, networking.
- `ClientWorld`: full pipeline with render phases, input resources.

The World should not assume every subsystem is always present. The internal group architecture (ECSCore, Scheduler, Runtime) naturally supports this — a ServerWorld could construct only ECSCore + Scheduler without Runtime.

**This is not a Phase 1 requirement**, but the internal architecture should avoid hardcoding assumptions about which subsystems exist. Constructor injection of groups (rather than monolithic construction) preserves this flexibility.

The invariant to enforce:

> Every World public method delegates to exactly one subsystem, or composes multiple subsystems through well-defined internal calls. No World method implements domain logic.

### 1.2 Subsystem Ownership Graph

```
World
 ├─ ECSCore (Layer 1–2):
 │   ├─ ComponentRegistry       // created first, no deps
 │   ├─ EntityManager           // created second, no deps
 │   └─ ArchetypeSystem         // depends on Registry, EntityManager
 ├─ Scheduler (Layer 3):
 │   ├─ QueryEngine             // borrows ArchetypeSystem (injected ref)
 │   ├─ Pipeline                // depends on QueryEngine
 │   └─ CommandBuffer           // no deps (ring buffer)
 └─ Runtime (Layer 4):
     ├─ ResourceContainer       // no deps
     ├─ HookSystem              // depends on CommandBuffer (for nested defer)
     └─ EventSystem             // no deps

Internal state:
  _state: WorldState            // SETUP | RUNNING | DESTROYING | DESTROYED
  _insidePipeline: boolean      // reentrancy guard
  _insideFlush: boolean         // flush-phase guard for nested deferral
```

**Construction order (linear, no cycles):**

```
1. ComponentRegistry        // no deps
2. EntityManager            // no deps
3. ArchetypeSystem          // needs 1, 2
4. CommandBuffer            // no deps
5. QueryEngine              // needs 3 (borrowed ref)
6. Pipeline                 // needs 5
7. ResourceContainer        // no deps
8. HookSystem               // needs World (for flushing nested commands from hooks)
9. EventSystem              // no deps
10. Empty archetype created // during construction (Layer 2 review §1.4)
```

**Shutdown order (reverse):**

```
1. EventSystem.clear()
2. HookSystem.clear()
3. ResourceContainer.clear()
4. Pipeline.destroy()       // frees systems, iterators
5. QueryEngine.destroy()    // frees queries
6. CommandBuffer.reset()
7. ArchetypeSystem.destroy()
8. EntityManager.destroy()
9. ComponentRegistry.destroy()
```

No circular dependencies. The construction graph is a DAG. Each subsystem can be constructed independently once its dependencies are available.

### 1.3 World Lifecycle States — Use Explicit Enum

Instead of boolean flags (`_started`, `_destroyed`), use a single enum:

```js
const WorldState = {
  SETUP: 0,       // Between construction and first update()
  RUNNING: 1,     // Pipeline is executing, registry locked
  DESTROYING: 2,  // During world.destroy() — reject reentrant calls
  DESTROYED: 3,   // After destroy completes — all operations throw
};
```

| State | Entry | Allowed operations |
|---|---|---|
| `SETUP` | Constructor completes | Register components, create entities, register systems, register resources. Entity mutations are immediate (not deferred). |
| `RUNNING` | First `world.update()` | Registry locks. Systems execute. Entity mutations inside pipeline are deferred. Outside pipeline, immediate. |
| `DESTROYING` | `world.destroy()` called | Internal cleanup only. User operations throw. |
| `DESTROYED` | Cleanup completes | No operations allowed. All methods throw. |

**Why enum over booleans:**
- A single state check replaces `if (started && !destroyed && !insidePipeline)`.
- Future states (PAUSED, LOADING) are additive — add an enum value, not another boolean.
- State transitions are validated: SETUP → RUNNING → DESTROYING → DESTROYED. Illegal transitions (e.g., SETUP → DESTROYED without going through RUNNING) throw.

**The setup → running transition is one-way.** Once running, the World cannot return to setup.

**Blocking issue:** The setup phase is implicit (between construction and first update). It should be documented explicitly with clear rules about what is and is not allowed during each state.

---

## 2. Public ECS API

### 2.1 API Surface — Namespaced Organization

The public API should be organized into namespaces to prevent the World from accumulating 60+ flat methods. This follows the same grouping used internally (ECSCore, Scheduler, Runtime):

```
class World {
  // ─── Configuration (setup phase only) ───
  registerComponent(ComponentClass): void       // returns void — ID is internal
  registerComponent(name, schema): void          // fallback, returns void
  addPhase(name, { after, before }): void

  // ─── Runtime ───
  update(dt): void
  destroy(): void                               // idempotent — safe to call multiple times

  // ─── Entity operations ───
  entities = {
    create(components?: Component[]): EntityId
    destroy(entityId): void
    isAlive(entityId): boolean
    count(): number
  }

  // ─── Component operations ───
  components = {
    add(entityId, Component): void
    remove(entityId, Component): void
    has(entityId, Component): boolean
    read(entityId, Component): object | null     // was getComponent — emphasises copy semantics
    write(entityId, Component, values): void     // was setComponent
  }

  // ─── Resources ───
  resources = {
    set(instance): void
    get(Constructor): T
    replace(instance): void                      // replace existing resource
    remove(Constructor): void                    // remove a resource (reserved name)
  }

  // ─── Systems ───
  systems = {
    add(config): SystemId
    remove(systemId): void
    enable(systemId): void
    disable(systemId): void
    replace(systemId, newFn): void               // hot-reload
  }

  // ─── Queries ───
  query(filter): Query

  // ─── Events (user-defined, separate from lifecycle hooks) ───
  events = {
    emit(eventName, payload): void
    on(eventName, callback): void
    off(eventName, callback): void
  }

  // ─── Lifecycle hooks (direct on World, distinct from events) ───
  onAdd(Component, callback): void
  onRemove(Component, callback): void
  onSet(Component, callback): void
  onCreate(callback): void
  onDestroy(callback): void
}
```

**Rationale for namespaces:**
- Prevents 50+ flat methods on World.
- Each namespace maps to a subsystem group (entities → ECSCore, resources → Runtime, etc.).
- Self-documenting: `world.components.read(e, Transform)` is clearer than `world.getComponent(e, Transform)`.
- New operations in a category don't pollute the top-level World interface.
- Future readonly/mutable World variants can expose subsets (e.g., `ReadonlyWorld` exposes `components.read` but not `components.write`).

**Rationale for `components.read` over `getComponent`:**
The name `read` emphasizes that this is a read operation returning a snapshot. Users are less likely to mutate the result expecting persistence than they would with `get`. Combined with `components.write` for mutations, the API pair is symmetric and clear.

**Rationale for `destroy()` idempotency:**
Calling `destroy()` on an already-destroyed World is a no-op (if `state === DESTROYED`, return immediately). This is safer than throwing — cleanup code in destructors and finalizers should not require try/catch around World cleanup.

**`registerComponent` returns void:**
The numeric component ID is an implementation detail. Users interact with components via class references. If internal code needs the ID, it accesses it through the registry internally. Returning void prevents users from depending on numeric IDs.

**`setResource` vs `replaceResource`:**
`setResource` throws on duplicate (you cannot accidentally overwrite an existing resource). `replaceResource` allows intentional replacement for hot-reload scenarios (renderer, settings, localization). `removeResource` is reserved for future plugin systems.

### 2.2 Entity Operations — Detailed Review

**`createEntity(components?)`**

| Property | Assessment |
|---|---|
| Ownership | Returns entity ID (number). Caller does not "own" the entity — the World does. |
| Consistency | Accepts array of component classes/IDs, or empty for no components. |
| Naming | `createEntity` is clear. `spawn` is also common. No strong preference. |
| Validation | Validates each component is registered. Throws on unregistered component. |
| Allocation | O(components) — allocates row, writes defaults, assigns ID. |
| Complexity | O(components) outside pipeline. Deferred (zero-cost) inside pipeline. |
| Determinism | Entity IDs are monotonic — deterministic given same creation sequence. |
| Deferred | Inside pipeline: queued as command. Outside: immediate. |

Edge: `createEntity()` with no arguments creates an entity in the empty archetype. Valid.

**`destroyEntity(entityId)` → `entities.destroy(entityId)`**

| Property | Assessment |
|---|---|
| Validation | Checks generation match. Throws on stale/invalid ID. |
| Idempotent | Destroying an already-dead entity is a no-op (generation mismatch returns null early). `destroy()` is idempotent. |
| Complexity | O(1) deferred. |
| Deferred | Inside pipeline: queued. Outside: immediate. |

Edge: destroy entity that was created in the same scope (same pipeline phase or same immediate call). During flush, the create + destroy net to zero — no entity is ever visible. Document this pattern.

**`hasComponent(entityId, Component)` → `components.has(entityId, Component)`**

This is tricky during pipeline execution. The entity may have deferred adds/removes queued. Should `hasComponent` reflect the current (pre-flush) state or the pending (post-flush) state?

**Recommendation:** Read current state (pre-flush). This is consistent with `getComponent` reading the current state. If a system adds `Health` to entity E in the `Update` phase, and a later system in the same `Update` phase calls `hasComponent(E, Health)`, it returns `false` (the add hasn't been flushed yet). This is consistent with the deferred mutation model.

**`readComponent(entityId, Component)` (was `getComponent`)**

Returns a plain object `{ field1: value1, field2: value2 }` or `null` if the entity doesn't have the component.

**Critical design decision — snapshot copy semantics:**
The returned object is a **snapshot copy**, not a live reference. Mutating it does NOT affect the stored component. Users must call `components.write` to persist changes. The method is named `read` specifically to emphasize this — it is a read operation that returns a copy.

```
// WRONG:
const t = world.components.read(e, Transform);
t.x += 5; // no effect! the stored value is unchanged.

// CORRECT:
const t = world.components.read(e, Transform);
t.x += 5;
world.components.write(e, Transform, t);
```

**Recommendation:** The rename from `getComponent` to `components.read` is the primary defense against this footgun. Unlike `get` (which implies "get the thing"), `read` implies "read a copy." This is a stronger semantic signal than documentation alone.

**Future improvement — `components.patch(entityId, Component, mutator)`**
For the common case of "read, modify, write," a `patch` method reduces boilerplate and eliminates the snapshot copy for users:

```js
world.components.patch(e, Transform, (t) => {
  t.x += 5;
  t.y += 3;
});
```

Internally, this does `read → callback → write`. The user never handles a snapshot or calls write explicitly. Not for Phase 1, but the `read`/`write` naming reserves space for `patch` as a natural extension.

**`writeComponent(entityId, Component, values)` → `components.write(entityId, Component, values)`**

Writes field values from a plain object. Inside pipeline: deferred. Outside: immediate.

Values object is partial — unspecified fields keep their current values. This means `setComponent(e, Transform, { x: 5 })` only changes `x`, leaving `y`, `rotation`, etc. unchanged.

### 2.3 API Consistency Assessment

| Concern | Assessment |
|---|---|
| Naming consistency | `entities.create` / `entities.destroy` vs `components.add` / `components.remove` — consistent verb + noun within each namespace. |
| `components.has` vs `components.read` | `has` returns boolean, `read` returns value or null. Standard JS pattern. |
| Component parameter position | `components.add(entity, Component)` — entity first, component second. Consistent across all component operations. |
| Return value for destroyed entities | `components.read` returns `null`. `components.has` returns `false`. No throw in these cases (throws only on direct interaction with dead ID). |

**Design choice — `components.read` returns null vs throws:**
Reading a component from an entity that doesn't have it (or is dead) returns `null`. This avoids try/catch for conditional access:
```js
const health = world.components.read(e, Health);
if (health) { health.hp -= damage; world.components.write(e, Health, health); }
```
Throwing would require:
```js
if (world.components.has(e, Health)) {
  const health = world.components.read(e, Health);
  // ...
}
```

**Recommendation:** `components.read` returns `null` for missing components or dead entities. `components.has` returns `false`. `components.add`/`components.remove` on already-has/doesn't-have is no-op.

---

## 3. Entity API

### 3.1 Raw Entity IDs — Confirmed

The architecture uses raw 32-bit packed integers. No wrapper objects, no handle classes.

**Assessment:** This is the correct choice. Rationale:
- Matches the "Entities are IDs, not objects" invariant.
- Enables typed-array storage of entity IDs.
- Zero GC pressure from entity references.
- O(1) all operations.
- Simple serialization.

**Risk:** Users may confuse entity IDs with arbitrary numbers. A typo like `world.destroyEntity(42)` will silently destroy entity with ID 42 (or throw if generation doesn't match). This is acceptable — same as Flecs, EnTT, and Bevy (where entities are integers internally).

**Mitigation — validation helper:**
```
world.isAlive(entityId): boolean
```
Returns true if the entity exists and the generation matches. Users who want to validate can use this.

### 3.2 Stale Entity ID Detection

The packed ID format `(generation << 24) | slot` enables O(1) staleness detection:
1. Extract `slot = entityId & 0xFFFFFF`
2. Read `storedGen = _entityGen[slot]`
3. Extract `idGen = entityId >>> 24`
4. If `storedGen !== idGen`, the ID is stale.

All entity operations validate this internally. Stale IDs throw with a clear error message.

**Recommendation:** The error message should include the entity ID and the nature of the failure: `'Entity 4294967295 is stale (generation mismatch)'` not just `'Invalid entity'`.

### 3.3 Entity Wrapper Objects — Should Not Exist

The architecture should **not** provide entity wrapper objects. The previous reviews established the invariant "Entities are IDs, not objects." An `Entity` class would:
- Add GC pressure (every entity creation would allocate an object).
- Encourage storing entity references instead of IDs.
- Blur the line between entity and component.
- Create serialization complications (how to serialize an Entity object?).
- Break the typed-array iteration model.

**If ergonomic concerns arise in user testing**, an optional convenience layer can be added:
```js
const entity = world.entity(id); // returns { id, has, get, set, add, remove, destroy }
```
This is a thin proxy object that wraps the ID. It must never be used internally. It's a Phase 5 (or later) addition, not a Layer 4 concern.

---

## 4. Component Registration

### 4.1 Registration API — Specification Needed

```js
// Primary API: class with static schema
class Transform {
  static schema = { x: 'f32', y: 'f32', rotation: 'f32', scaleX: 'f32', scaleY: 'f32' };
}
world.registerComponent(Transform);   // returns void

// Secondary API: string name + schema (for ad-hoc or script-defined components)
world.registerComponent('MyComponent', {
  value: 'f32',
  label: 'u32'   // handle to string, resolved through resource registry
});                                   // returns void

// Future: class + decorator
@Component({ x: 'f32', y: 'f32' })
class Transform {}
```

**Return value is void.** The numeric component ID is an implementation detail. Users interact with components exclusively through class references (or string names for the secondary API). Returning the ID would encourage depending on it, which breaks when:
- The engine reserves IDs 1–63 for built-ins and shifts user IDs.
- A plugin registers components that shift the ID space.

**Class registration is the primary API** because:
- The class serves as both the type key and documentation.
- Components are self-documenting: `world.query([Transform, Velocity])` reads naturally.
- The class constructor can provide default values (optional, not required).
- Future reflection, editor tooling, serialization, plugins, and TypeScript inference all benefit from having an actual class reference.
- The static schema is introspectable: `Transform.schema` returns the field descriptors.
- Minification is safe — the class reference is stable within a JS context.

### 4.2 Registration Timing

**Blocking issue — when does the registry lock?**

Layer 1 review (§1.2) resolved: "Lock on first entity creation."

Layer 4 review suggests **locking on first `world.update()`** instead. Rationale:

| Scenario | Lock on first entity create | Lock on first update |
|---|---|---|
| User registers all components before creating any entities | Works | Works |
| User creates entities during scene loading, then registers more components | Fails (lock on first entity) | Works (lock on first update) |
| User adds a system during scene loading that creates entities | Fails | Works |
| User registers a component inside a system function (during update) | N/A (systems run after entities exist) | Throws (file under "setup must be complete") |

"Lock on first update" is more permissive during setup and easier to explain:

> Register all components between `new World()` and the first `world.update()` call. After the first update, the registry is frozen.

**Recommendation:** Change the locking trigger from "first entity creation" to "first `world.update()`". This is a Layer 1 interface change (the `registry.lock()` call moves from entity creation to pipeline start). Update Layer 1's review to reflect this.

### 4.3 Schema Validation

At registration, validate:
- Field names are non-empty strings matching `/^[a-zA-Z_][a-zA-Z0-9_]*$/`.
- Field types are in the canonical type table (f32, f64, u8, u16, u32, i8, i16, i32, or their aliases).
- `Object.freeze` the schema after validation (immutability enforcement).

### 4.4 Built-in Component ID Reservation

IDs 1–63 are reserved for engine built-in components. User-registered components start at ID 64.

**Current reserved list (from Layer 1 review):**
| ID | Component |
|---|---|
| 1 | (reserved — sentinel) |
| 2–63 | (unassigned — for future engine components) |

The World should document the reservation at construction time so users can inspect which IDs are taken.

---

## 5. Resource System

### 5.1 Design Assessment

Resources are singletons identified by constructor reference, stored in a `Map<constructor, instance>` within the `ResourceContainer`.

**Strengths:**
- Simple: one map, no indirection.
- Type-safe: `world.getResource(Time)` returns a `Time` instance (inferred from the constructor key).
- Fast: O(1) Map lookup.
- Independent of entity/archetype system — no cross-contamination.

**Tradeoff vs Flecs' singleton-on-entity approach:**
The architecture correctly chooses standalone resources over Flecs' singleton-as-entity approach. The Flecs approach (singletons are components on a hidden entity) adds lookup indirection and couples resources to the archetype system. For a game engine with <20 resources, the simple Map is superior.

### 5.2 API Specification

```js
// Registration
world.resources.set(new Time());
world.resources.set(new InputState());

// Replace existing resource (hot-reload: renderer, settings, localization)
world.resources.replace(new RendererV2());

// Retrieval
const time = world.resources.get(Time);

// Removal (reserved for future plugin systems — name reserved, not implemented in Phase 1)
// world.resources.remove(Time);
```

**`resources.set(instance)`**

| Property | Assessment |
|---|---|
| Key | `instance.constructor` — the class/constructor reference. |
| Duplicate | Throws — resource with this constructor already exists. Use `replace` for intentional replacement. |
| Lifetime | World lifetime. Cleared on `world.destroy()`. |
| Validation | `instance` must be a non-null object. |

**`resources.replace(instance)`**

| Property | Assessment |
|---|---|
| Key | `instance.constructor` — same as `set`. |
| Not found | Throws — no existing resource to replace. Use `set` for first registration. |
| Lifetime | The old resource is discarded (if it has `destroy()`, it's called synchronously). The new resource takes effect immediately for subsequent system access. |

**`resources.get(Constructor)`**

| Property | Assessment |
|---|---|
| Key | The constructor/class reference. |
| Not found | Throws — "Resource Time not registered. Did you call world.resources.set()?" |
| Complexity | O(1) Map.get. |

**`resources.remove(Constructor)`** (reserved name, not implemented in Phase 1)
The name is reserved to avoid future API breakage. Implementation deferred until plugin/module systems require it.

### 5.3 Resource in Systems

Systems access resources through the World reference passed to the system function:

```js
world.systems.add({
  query: [Transform, Velocity],
  phase: 'Update',
  fn: (world, iter, dt) => {
    const time = world.resources.get(Time);
    // ...
  }
});
```

**Alternative — declarative resource declaration:**
```js
world.systems.add({
  query: [Transform, Velocity],
  resources: [Time, InputState],     // declared dependencies
  phase: 'Update',
  fn: (world, iter, dt, { time, input }) => { ... }  // injected
});
```

**Recommendation:** Keep Phase 1 simple — systems use `world.resources.get()` directly. The declarative form adds complexity with no immediate benefit. It can be added in a later phase if scheduling or mocking becomes a concern.

### 5.4 Resource Ownership and Cleanup

The `ResourceContainer` stores references to user-provided instances. It does **not** own the objects in a memory-management sense (JS GC handles that). However, if a resource holds native handles (WebGL buffers, WebGPU bind groups, audio buffers), the user is responsible for cleaning them up.

**Recommendation:** Add an optional `destroy()` method on resources that the World calls during shutdown:

```
if (typeof resource.destroy === 'function') {
  resource.destroy();
}
```

This mirrors the existing `Scene.cleanup` pattern and is consistent with JS lifecycle management.

### 5.5 Edge Cases

| Condition | Behavior |
|---|---|
| Duplicate resource registration (`set`) | Throw. |
| Duplicate resource replacement (`replace` with no existing) | Throw. |
| Missing resource access (`get`) | Throw. |
| Resource registered after first update | Allowed — resources are not locked like components. |
| Resource replaced mid-frame | `replace` is synchronous. Systems see the new resource on their next `get()` call. |
| Resource removed mid-frame | Not supported — `remove` is reserved for future use. |
| Resource constructor with no instances | `resources.set(new MyResource())` — user creates the instance. |
| Resource is a primitive (string, number) | Throw — resources must be objects (constructor reference needed). |
| `resources.get(undefined)` | Throw. |

---

## 6. Query API

### 6.1 Public Query Interface

```js
// Simple: all components must be present
const query = world.query([Transform, Velocity]);

// Complex: all, any, none, and optional access declaration
const query = world.query({
  all: [Transform, Velocity],
  any: [Active],
  none: [Dead]
  // access: [Transform]  // optional — defaults to 'all' for Phase 1
});

// Usage in a system (query engine provides the iterator):
// the system receives a pre-reset iterator from its query
```

**Return value:** A `Query` object (same object for duplicate filters — cached).

**Caching rationale:** The Query object is shared across systems and user code. Its match list is incrementally updated as new archetypes appear. Duplicate filters must resolve to the same Query to avoid redundant matching.

### 6.2 Query Iterator

```js
// Explicit iteration (inside system):
while (iter.next()) {
  const t = iter.get(Transform);
  const v = iter.get(Velocity);
  for (let i = 0; i < iter.count; i++) {
    t.x[i] += v.x[i] * dt;
  }
}
```

**Convenience wrapper (future, not Phase 1):**
```js
world.each([Transform, Velocity], (entity, transform, velocity) => {
  transform.x += velocity.x * dt;
});
```
This is slower than chunk iteration and must not be used in engine internals.

### 6.3 Query Without System

Queries can be created and iterated outside a system:

```js
const query = world.query([Transform]);
const iter = query.iterator();
while (iter.next()) { ... }
```

This is useful for:
- Editor tooling (list all entities with a component).
- Debug rendering.
- One-off queries during setup.
- Scene queries from non-system code.

**Iteration outside pipeline:** The query returns a fresh iterator. Column references are valid for the duration of the iteration (no mutations happen during iteration outside the pipeline either, since mutations are only possible during pipeline execution).

### 6.4 Query Lifetime

Queries live for the World's lifetime. They are never garbage collected during normal operation. The Query Engine owns the cache — user code holds references to Query objects but does not own them. Duplicate filters (even with different ordering like `[A, B]` vs `[B, A]`) resolve to the same cached query — the query key is based on sorted component IDs and canonical filter form.

If user code discards a Query reference, the Query Engine still holds it in the cache. The underlying Query object is never freed until `world.destroy()`.

**Editor concern:** Long-running editor sessions with dynamic component authoring may create thousands of unique queries over time. The query cache persists them indefinitely. A future `queryEngine.clearUnused()` method could reclaim queries that no registered system references, but this is not a Phase 1 concern — the number of unique filters in a runtime game session is bounded by system registration count.

---

## 7. System Registration

### 7.1 Registration API

```js
const systemId = world.systems.add({
  // The component filter (creates or reuses a Query)
  query: [Transform, Velocity],
  
  // Execution phase (must be one of the registered phases)
  phase: 'Update',
  
  // The system function
  fn: (world, iter, dt) => {
    while (iter.next()) {
      // process chunk
    }
  },
  
  // Optional explicit ordering
  before: ['OtherSystemName'],
  
  // Optional metadata
  name: 'movement',
  
  // Optional initial state
  enabled: true
});
```

**System configuration is immutable after registration.** The `query`, `phase`, `name`, and `before` fields are frozen. Only `fn` and `enabled` can change at runtime (via `systems.replace()` and `systems.enable()`/`disable()`). This prevents plugins from mutating system configuration after registration.
```

### 7.2 Phase Validation

The phase string must match a registered phase. Built-in phases:
```
BeginFrame → PreUpdate → Update → PostUpdate → PreRender → Render → PostRender → EndFrame
```

Custom phases can be added during setup (before first update):
```js
world.addPhase('Physics', { after: 'PreUpdate', before: 'Update' });
```

**Unknown phase:** `world.addSystem({ phase: 'Nonsense', ... })` throws.

### 7.3 System Identity

Each system is assigned a dense monotonic integer `systemId`. An optional `name` string is stored for debugging and for `before` references.

**`before` resolution:** If `before` references a name, it resolves to the system with that name (throwing if not found). If `before` references an ID, it resolves directly. Names are not required to be unique — if multiple systems share the same name, `before: 'movement'` is ambiguous and should throw.

**Recommendation:** Names should be unique within a World. Enforce this at registration.

### 7.4 System Lifecycle

| Operation | Behavior |
|---|---|
| `systems.add(config)` | Creates Query (cached), creates System + Iterator, registers in Pipeline |
| `systems.remove(systemId)` | Removes from phase, discards iterator, recomputes phase ordering |
| `systems.enable(systemId)` | `system.enabled = true` |
| `systems.disable(systemId)` | `system.enabled = false` |
| `systems.replace(systemId, newFn)` | Replaces system function (hot-reload) without changing query, phase, or ordering |
| `world.update(dt)` | Pipeline iterates enabled systems in order |

**System during pipeline execution:**
- Removing a system during pipeline execution should queue the removal (deferred).
- Disabling/enabling during pipeline execution takes effect on the next frame (modifying the phase list during iteration is unsafe).

**Recommendation:** `removeSystem`, `enableSystem`, `disableSystem` during pipeline execution throw. Systems must manage their own enable state during execution via a resource or component flag.

### 7.5 Hot-Reload Support

Systems are functions. Replacing a system function:

```js
// Not a supported API in Phase 1, but possible via:
const system = world._pipeline._getSystem(systemId);
system.fn = newFunction;
```

If hot reload is needed, the World should expose:
```js
world.replaceSystem(systemId, newFn);
```
This replaces the function without changing the query, phase, iterator, or ordering.

---

## 8. Deferred Commands

### 8.1 Transparent Deferral

Entity mutations are automatically deferred when called during pipeline execution:

```js
// During system execution (inside world.update()):
world.entities.destroy(entityId);              // deferred — queued in command buffer
world.components.add(entity, Health);           // deferred

// Outside pipeline execution (during setup):
world.entities.destroy(entityId);              // immediate — executes now
world.components.add(entity, Health);           // immediate
```

**The user does not need to know about the command buffer.** The World handles the distinction transparently. This is the correct ergonomic choice — matching Flecs' approach.

### 8.2 Transparent Deferral Detection

The World tracks whether it's inside the pipeline (`this._insidePipeline`). Entity operations check this flag:

```
if (this._insidePipeline) {
  this.#commands.enqueue({ type: 'create', components });
} else {
  this._executeCreate(components);  // immediate
}
```

**Edge case:** Nested deferral during flush (lifecycle hooks). If a hook calls `world.createEntity()`, the World is not inside the pipeline (flush happens between phases). But the hook is called during flush, and mutations should be deferred to the secondary buffer.

**Resolution:** Track a separate `_insideFlush` flag. During flush, mutations go to the secondary buffer:

```
if (this._insidePipeline || this._insideFlush) {
  // defer
} else {
  // immediate
}
```

### 8.3 Command API Consistency

The mutation API is identical for immediate and deferred execution:

```js
world.entities.create([A, B]);                  // same call, different behavior
world.entities.destroy(id);
world.components.add(id, C);
world.components.remove(id, C);
world.components.write(id, C, values);
```

No separate `world.deferCreate(...)` API. The command buffer is an implementation detail.

### 8.4 Commands During Setup

During setup (before first update), mutations are immediate. This means:
- `entities.create` creates the entity right away.
- `components.add` immediately triggers archetype migration.
- The entity is fully visible to subsequent setup code.

This is correct — during setup, there are no active iterators, so immediate mutation is safe.

---

## 9. World Lifecycle

### 9.1 Construction

```
new World(options?):

1. Create ComponentRegistry
2. Create EntityManager
3. Create ArchetypeSystem (pass registry, entityManager)
4. Create CommandBuffer
5. Create QueryEngine (pass reference to ArchetypeSystem)
6. Create Pipeline (pass QueryEngine)
7. Create ResourceContainer
8. Create HookSystem (pass reference to World)
9. Create EventSystem
10. Create empty archetype (ArchetypeSystem)
11. Register built-in phases:
    [BeginFrame, PreUpdate, Update, PostUpdate, PreRender, Render, PostRender, EndFrame]
12. Set state: SETUP
```

**Options object:**
```js
{
  memory: {
    maxEntities: 1 << 24,     // 16M default
    initialTableCapacity: 64,
  },
  pipeline: {
    maxFlushIterations: 32,
  },
  errors: {
    hookErrorPolicy: 'abort',    // 'abort' | 'log'
    systemErrorPolicy: 'abort',  // 'abort' | 'log'
  },
}
```

Options are grouped by subsystem domain for clarity. New options in future phases slot into their group without restructuring the top-level config.

### 9.2 First Update

```
world.update(dt):

1. If state == SETUP:
   a. Lock ComponentRegistry
   b. Set state = RUNNING
2. If state != RUNNING: throw (not started or already destroyed)
3. Execute pipeline (see Layer 3 review §8.1)
```

**Registry locking timing:** The registry locks on first update, not on first entity creation (see §4.2). This gives maximum flexibility during setup while ensuring the registry is frozen before any system executes.

### 9.3 Shutdown

```
world.destroy():

1. If state == DESTROYED: return (idempotent)
2. If state == RUNNING && inside pipeline: throw (can't destroy mid-update)
3. Set state = DESTROYING
4. Clear EventSystem
5. Clear HookSystem
6. Call resource.destroy() on each resource (if the method exists)
7. Clear ResourceContainer
8. Destroy Pipeline (systems, iterators)
9. Destroy QueryEngine
10. Destroy ArchetypeSystem
11. Destroy EntityManager
12. Destroy ComponentRegistry
13. Destroy CommandBuffer
14. Set state = DESTROYED
```

**Idempotent destroy:** Calling `destroy()` on an already-destroyed World is a no-op (returns immediately). This is safer than throwing — cleanup code in destructors, finalizers, and teardown sequences should not require try/catch around World cleanup.

**Mid-update destroy:** Throw. The caller must ensure the game loop stops before destroying the World.

### 9.4 World Reuse

Worlds are single-use. After `destroy()`, the instance is dead. Users create a new World if they need a fresh ECS context.

**Why not support reset/clear?**
- All subsystems would need to reset to initial state.
- Queries would need to be cleared and re-matched.
- Archetypes would need to be destroyed.
- Entity Manager would need to reset the free list and generation counter.
- This is equivalent to creating a new World with extra complexity.

**Recommendation:** Single-use World. `destroy()` + `new World()` if a reset is needed. This is the same as the existing `Scene` pattern (scenes are single-use too).

---

## 10. Error Handling

### 10.1 Complete Error Table

| Condition | Policy | Justification |
|---|---|---|
| Invalid entity ID (not a number, NaN) | `throw TypeError` | Programming error |
| Stale entity ID (generation mismatch) | `throw Error` with entity ID | Use-after-free detection |
| Duplicate component registration | `throw Error` | Ambiguous schema |
| Unregistered component in query | `throw Error` | Typos, missing import |
| Unregistered component in createEntity | `throw Error` | Missing registration |
| Recursive `world.update()` | `throw Error` | Reentrancy corruption |
| Invalid phase name | `throw Error` | Typos |
| Resource not registered | `throw Error` | Dependency not met |
| Duplicate resource | `throw Error` | Ambiguous singleton |
| System dependency cycle | `throw Error` | Configuration error |
| System `before` target not found | `throw Error` | Typo in name |
| Impossible query (ALL ∩ NONE) | `throw Error` | Logical contradiction |
| Add component entity already has | **No-op** | Idempotent |
| Remove component entity doesn't have | **No-op** | Idempotent |
| Destroy already-dead entity | **No-op** | Idempotent |
| Get component entity doesn't have | **Return null** | Conditional access pattern |
| Has component on dead entity | **Return false** | Graceful degradation |
| Component operation on dead entity | `throw Error` | Use-after-free |
| Hook throws (development) | **Abort + throw** | Preserve debug stack |
| Hook throws (production) | **Log + disable hook** | Resilience (configurable) |
| System throws (development) | **Abort + throw** | Preserve debug stack |
| System throws (production) | **Log + disable system** | Resilience (configurable) |
| Table growth exceeds maxCapacity | `throw Error` | Budget overflow |
| `world.destroy()` while inside pipeline | `throw Error` | Mid-update destroy |
| `world.destroy()` already destroyed | **No-op (idempotent)** | Safe cleanup |

### 10.2 Error Policy Configuration

The World options object allows configuring error handling behavior:

```js
const world = new World({
  hookErrorPolicy: 'abort',       // default in dev
  systemErrorPolicy: 'abort',     // default in dev
});
```

Phase 1 supports two modes:
- `'abort'` — the pipeline stops, the exception propagates, the frame is lost.
- `'log'` — the error is logged, the offending hook/system is disabled, the frame continues.

### 10.3 Hook Callback Signature

Hooks receive `(world, entityId)`. The World parameter is included because plugins, libraries, and reusable packages cannot rely on closure capture. The extra parameter is essentially free — JS ignores unused parameters.

```js
world.onAdd(Health, (world, entityId) => {
  const time = world.resources.get(Time);
  console.log(`Entity ${entityId} gained Health at time ${time.elapsed}`);
});

// Lifecycle hooks (entity-level):
world.onCreate((world, entityId) => { ... });
world.onDestroy((world, entityId) => { ... });
```

**Performance consideration:** Hooks are not on the hot path (they fire during command flush, not during iteration). The extra `world` parameter adds no measurable overhead.

Every error message should include:
- The operation that failed (e.g., `world.destroyEntity`)
- The offending value (e.g., `entityId=4294967295`)
- The reason (e.g., `stale entity — generation mismatch`)
- A suggestion (e.g., `Check if the entity was already destroyed`)

Example:
```
Error: world.destroyEntity(4294967295) failed: stale entity (generation mismatch).
Entity ID 4294967295 was already destroyed. Call world.isAlive(id) to check before operating.
```

---

## 11. Layer Interaction

### 11.1 Layer 4 → Layer 3

| Layer 4 API | Layer 3 Subsystem | Notes |
|---|---|---|
| `world.query(filter)` | `QueryEngine.getOrCreate(filter)` | Cached, canonical filter form |
| `world.systems.add(config)` | `Pipeline.addSystem(query, phase, fn)` | Creates iterator |
| `world.systems.remove(id)` | `Pipeline.removeSystem(id)` | |
| `world.update(dt)` | `Pipeline.execute(dt)` | Orchestrates flush |
| Internal: query iteration | `QueryIterator.next()` | Per-system, per-frame |

### 11.2 Layer 4 → Layer 2

| Layer 4 API | Layer 2 Subsystem | Notes |
|---|---|---|
| `world.entities.create(c)` | `ArchetypeSystem.getOrCreateArchetype` + table allocate | Immediate or deferred |
| `world.entities.destroy(id)` | EntityManager + table swap-remove | Immediate or deferred |
| `world.components.add(id, C)` | `ArchetypeSystem.migrateAdd` | Immediate or deferred |
| `world.components.remove(id, C)` | `ArchetypeSystem.migrateRemove` | Immediate or deferred |
| Internal: deferred command flush | `CommandBuffer.flush()` | Between phases |
| Internal: hook during flush | `HookSystem.flush()` | After commands |

### 11.3 Layer 4 → Layer 1

| Layer 4 API | Layer 1 Subsystem | Notes |
|---|---|---|
| `world.registerComponent(class)` | `ComponentRegistry.register(name, schema)` | Returns void |
| `world.components.has(id, C)` | EntityManager + signature check | Read-only |
| `world.components.read(id, C)` | EntityManager + table column read | Snapshot copy |
| `world.components.write(id, C, vals)` | EntityManager + table column write | Immediate or deferred |
| Internal: column access during iteration | `Table.getColumn(componentId, fieldName)` | Read/write on typed arrays |

### 11.4 Interface Sufficiency

All Layer 1–3 interfaces are sufficient for Layer 4's needs. No missing APIs identified.

**One gap identified — registering a built-in component from Layer 4:**
The `ComponentRegistry` is a Layer 1 construct. Layer 4 needs to register built-in components (e.g., if the engine reserves ID 1–63 for built-ins). The registry's `register()` method must accept an optional `id` parameter for reserved slots:

```
registry.register('Transform', schema, { reservedId: 1 })
```

Without this, built-in component IDs cannot be guaranteed stable across builds. This is a Layer 1 change.

### 11.5 Boundary Compliance

| Direction | Compliant? | Notes |
|---|---|---|
| Layer 4 → Layer 3 | Yes | Public API delegates to QueryEngine and Pipeline |
| Layer 4 → Layer 2 | Yes | Entity and component operations delegate to ArchetypeSystem |
| Layer 4 → Layer 1 | Yes | Registration and read operations delegate to Registry and EntityManager |
| Layer 3 → Layer 4 | No | Layer 3 does not depend on Layer 4 |
| Layer 2 → Layer 4 | Mediated | HookSystem (Layer 4) is called by the World during flush — the World mediates |
| Layer 1 → Layer 4 | No | Layer 1 does not depend on Layer 4 |

**The HookSystem is a special case.** It lives in Layer 4 but is called during the Layer 2 flush process. This is not an upward dependency — it is the World (which owns both) calling HookSystem after CommandBuffer.flush(). The hook system does not depend on Layer 2 internals; it only receives entity IDs and component IDs from the flush process.

---

## 12. Memory Model

### 12.1 Ownership Graph

```
World (owns everything below)
 ├─ ComponentRegistry          // owns schema Map, built-in ID reservation
 ├─ EntityManager              // owns typed arrays (archetype, row, generation) + free list
 ├─ ArchetypeSystem            // owns archetype Map, archetypeById array
 │   └─ Archetype[]             // each owns Table, Edges, Signature
 │       └─ Table               // owns typed array columns
 ├─ CommandBuffer              // owns command ring buffer (typed or plain array)
 ├─ QueryEngine                // owns query cache Map
 │   └─ Query[]                 // each owns match list (Archetype[] refs)
 ├─ Pipeline                   // owns phase list, system list
 │   └─ System[]                // each owns iterator, query ref
 ├─ ResourceContainer          // owns Map<class, instance> — refs to user objects
 ├─ HookSystem                 // owns handler lists per event/component pair
 └─ EventSystem                // owns observer lists per event name
```

### 12.2 Object Lifetimes

| Object | Created | Destroyed | Notes |
|---|---|---|---|
| World | `new World()` | `world.destroy()` | |
| Subsystems | World construction | World destruction | Linear in-order |
| Archetypes | Archetype creation (lazy) | World destruction | Never individually freed |
| Tables | Archetype creation | World destruction | Their typed arrays become GC roots |
| Queries | First `query()` call with unique filter | World destruction | Cached forever |
| Systems | `addSystem()` | World destruction or `removeSystem()` | |
| Iterators | System registration | System removal or World destruction | Reused across frames |
| Command buffer entries | Per-frame (ring buffer) | After each phase flush | Ring buffer recycled |
| Hook handlers | `onAdd`/`onRemove`/etc. | World destruction | Never individually removed |
| Resources | `setResource()` | World destruction | User objects — if they have `destroy()`, it's called |
| Entity IDs | `createEntity()` | `destroyEntity()` | Recycled via free list |

### 12.3 Potential Leaks

**Resource destroy:** User-provided resource objects with native handles (WebGL textures, WebGPU buffers) will leak if they do not implement `destroy()`. The World calls `resource.destroy()` if the method exists, but it cannot know about arbitrary native resources.

**Recommendation:** Document that resources holding native handles should implement a `destroy()` method. This is consistent with the existing `Scene.cleanup` pattern and JS best practices.

**Hook handler lists:** Accumulate over time but are bounded by user registration. No leak in practice.

**Query match lists:** Append-only, bounded by archetype count. No leak.

### 12.4 Long-Running Sessions

Over a long-running editor session (hours/days of edits), the following grow monotonically:
- Archetypes (new component combinations from entity edits)
- Query match lists (new archetypes added)

Both are bounded by the number of unique component combinations seen in the session. For an editor, this could reach hundreds or low thousands over a day. Each archetype is ~4KB of table data. 1000 archetypes = 4MB. Acceptable.

**If compaction becomes necessary in the future:** Destroy empty archetypes and rebuild query match lists. Not a Phase 1 concern.

---

## 13. Performance

### 13.1 Public API Complexity

| Operation | Complexity | Allocation | Notes |
|---|---|---|---|
| `registerComponent` | O(fields) | Schema object | One-time setup, returns void |
| `addPhase` | O(phases) | Phase name | One-time setup |
| `resources.set` | O(1) | Map entry | One-time setup |
| `systems.add` | O(1) + query creation | System, iterator | One-time setup |
| `entities.create` | O(components) | None (deferred) | Deferred during pipeline |
| `entities.destroy` | O(1) | None | Deferred during pipeline |
| `components.add` | O(fields) | Command entry | Deferred |
| `components.remove` | O(fields) | Command entry | Deferred |
| `components.has` | O(1) | None | EntityManager lookup |
| `components.read` | O(fields) | Plain object (snapshot) | Allocates per call |
| `components.write` | O(fields) | Command entry | Deferred |
| `query` | O(archs) uncached, O(1) cached | Query object (uncached) | One-time per unique filter |
| `update` | See Layer 3 | See Layer 3 | Per frame |
| `resources.get` | O(1) | None | Map lookup |
| `entities.isAlive` | O(1) | None | Generation check |
| `events.emit` | O(observers) | Event payload | Per event |

### 13.2 Hidden O(N) Operations

| Operation | Hidden cost | Risk |
|---|---|---|
| `query` (uncached) | O(archetypes × components) matching | One-time during loading — acceptable |
| `components.read` | Allocates object per call | Footgun — users calling in loops will create GC pressure |
| `components.write` in deferred mode | O(fields) copy to command buffer | Per call — acceptable |
| `world.update()` | O(systems × entities × fields) iteration | The entire frame cost — expected |
| `world.destroy()` | O(archetypes + systems + queries + hooks) cleanup | One-time — acceptable |

### 13.3 Allocation Hotspots

| Operation | Allocation | Mitigation |
|---|---|---|
| `components.read` | Plain object every call | Document as not-for-loops. Users who need bulk access should use queries. Consider `components.patch()` (future) to avoid user-facing copies. |
| Command buffer overflow | Dynamic array | Pre-allocated ring buffer (default 1024 entries) handles 99% of frames. |
| Query creation (uncached) | Query object + Uint16Arrays | One-time per unique filter. |
| `events.emit` | User-defined payload object | User controls this. |

### 13.4 components.read Performance Concern

`components.read(entity, Component)` returns a fresh plain object with field values. For a Transform with 5 float fields, this is:
1. EntityManager lookup (O(1), typed array read)
2. Archetype lookup (O(1), array access)
3. Table column reads (5 typed array reads)
4. Object allocation (5 property assignments)
5. Object return

This is approximately 500ns–1µs per call — fast for occasional use. But in a hot loop processing 1000 entities one at a time, it becomes 500µs–1ms of unnecessary work.

**The correct pattern for bulk access is query iteration,** not `getComponent` loops. This should be a prominent documentation warning.

---

## 14. Future Compatibility

### 14.1 Scenes and Prefabs

Layer 4 does not preclude scene or prefab systems:
- Prefabs are template data (component schemas + default values) that `createEntity` instantiates.
- Scenes are collections of entities and resources that can be loaded/unloaded.

The existing `Scene` class already manages lifecycle (enter/exit/pause/resume/update/render). In the ECS migration, a Scene would create a World (or share one) and register its systems during the Scene's `enter()` method.

### 14.2 Save/Load (Serialization)

Layer 4 does not expose serialization APIs. For future serialization:
- Component data is in typed array columns — directly serializable.
- Entity IDs are ephemeral — must not be serialized directly. Serialize (archetype signature, row, component values) instead.
- Archetype signatures are sorted component ID arrays — stable if component IDs are stable (Layer 1's built-in reservation ensures this).
- Resources may need custom serialization (user responsibility).

Layer 4 can expose `world.serialize()` and `world.deserialize()` in a future phase without architectural changes.

### 14.3 Networking

Deterministic execution relies on:
- Same system registration order (Layer 3 guarantee: deterministic relative to `addSystem` calls).
- Same phase ordering.
- Same seed for deterministic random (user responsibility).
- Same `dt` (fixed timestep for lockstep networking).

Layer 4 does not restrict networking. Entity IDs are deterministic given the same creation sequence, enabling state synchronization by entity ID.

### 14.4 Editor Tooling

Layer 4 can expose optional debug APIs:

```js
world.debug.getEntityCount()     // number of alive entities
world.debug.getArchetypeCount()  // number of archetypes
world.debug.getQueryCount()      // number of cached queries
world.debug.listSystems()        // registered systems with metadata
world.debug.listEntities()       // entity IDs grouped by archetype
```

These are additive and do not affect the core API.

### 14.5 Hot Reload

`world.replaceSystem(systemId, newFn)` is the hot-reload interface. No architectural change needed.

### 14.6 WASM and Worker Systems

The chunk iteration model (typed array columns, pointer+length) maps directly to WASM. A WASM system would receive:
- `entityIds` pointer and length
- For each component: column pointer and field stride
- `dt` as f32

Layer 4 does not need changes to support WASM systems — the query iteration is already pointer-and-length based.

### 14.7 Plugin Systems

If the engine supports plugins, each plugin would:
1. Register its components during setup.
2. Register its systems during setup.
3. Register its resources during setup.

Layer 4's current API already supports this. Plugin isolation (component ID namespacing, system name collisions) is not addressed in Phase 1 but the API does not preclude it.

---

## 15. Hidden Assumptions

| # | Assumption | Risk | Recommendation |
|---|---|---|---|
| 1 | Users register all components before first `world.update()` | Low — documented as "setup phase." If violated, the registry is locked and registration throws. Clear error message. |
| 2 | Users register all systems before first `world.update()` | Medium — if a user adds a system after the first update, it would work (no lock on system registration), but the system would miss the current frame's execution. | Allow system registration at any time, but document that systems added mid-frame execute on the next frame. |
| 3 | Entity IDs are not stored across sessions | Low — IDs include generation counters that change across sessions. | Document that entity IDs are ephemeral. Serialization should use archetype + row. |
| 4 | Users do not call `components.read` in hot loops | Medium — can cause GC pressure and slow frame rates. | Document the warning prominently. Consider `components.patch()` in future. |
| 5 | Hook callbacks do not reference destroyed World | Low — hooks are cleared on `world.destroy()`. If a user stores a reference to a hook callback and calls it after World destruction, the behavior is undefined. Since hooks receive `(world, entityId)`, the world parameter becomes stale. | Document that hook callbacks must not outlive the World. |
| 6 | Resources are singletons (one instance per class) | Low — the key is the constructor reference. `resources.replace` allows hot-reload. | Document singleton semantics. |
| 7 | Component classes are used as stable keys | Medium — if a user minifies their code or renames classes, the constructor reference changes. This does NOT affect functionality (the class is always the same reference within a session), but it means the order of `world.query([A, B])` parameters matters for the query key (sorted internally). | No action needed — classes are stable within a JS context. |
| 13 | Specialized World variants (EditorWorld, ServerWorld) are not precluded | Low — the subsystem group architecture (ECSCore, Scheduler, Runtime) allows constructing only the groups needed for a given variant. | Document that World is not monolithic — subsets can be composed. |
| 8 | Systems do not throw | Medium — a throwing system can stop the pipeline. | Configurable error policy (abort vs log vs disable). |
| 9 | `world.update()` is not called recursively | Medium — reentrancy throws. | Guard with `_insidePipeline` flag. |
| 10 | Entity IDs are never reused within a session in a conflicting way | Low — generation counter prevents stale ID use. The 256-generation limit per slot is sufficient. | Document the limit. |
| 11 | No concurrent World access (single-threaded) | Low — JS is single-threaded. | Ensure no stored callbacks or promises can mutate the World asynchronously during pipeline execution. |
| 12 | The empty archetype exists before any entity creation | Low — enforced by World construction (Layer 2 review). | Already specified. |

---

## 16. Missing Design Decisions

### 16.1 Blocking Issues (must resolve before implementation)

| # | Decision | Impact |
|---|---|---|
| 1 | **Registry lock timing** | Layer 1 says "lock on first entity creation." Layer 4 recommends "lock on first `world.update()`." These must be reconciled. Recommendation: change to "first `world.update()`" for maximum setup flexibility. |
| 2 | **World lifecycle states** | SETUP → RUNNING → DESTROYING → DESTROYED must be explicitly documented with per-state allowed operations. Use enum, not booleans. |
| 3 | **Component registration API shape** | Class + static schema is primary. String + schema is fallback. `registerComponent` returns void (numeric ID is internal). Accept optional `reservedId` for built-in components. |
| 4 | **Built-in component ID reservation** | IDs 1–63 reserved for engine components. Must be specified before user components are registered. `register()` must accept an optional `reservedId` parameter. |
| 5 | **Hook callback signature** | Hooks receive `(world, entityId)`. World parameter enables plugins and reusable code without closure capture. |
| 6 | **`components.read` copy semantics** | Returns a fresh plain object (snapshot). Renamed from `getComponent` to `read` to emphasize copy semantics. Mutations to the returned object do NOT affect storage. |
| 7 | **Resource key** | Constructor reference (natural, type-safe, no collisions). `resources.set` for first registration, `resources.replace` for hot-reload. `resources.remove` reserved for future. |
| 8 | **Single-use World with idempotent destroy** | `destroy()` is idempotent — safe to call multiple times. Create a new World for fresh state. Consistent with existing Scene pattern. |

### 16.2 Important Refinements

| # | Decision | Impact |
|---|---|---|
| 9 | **System name uniqueness** | Names should be unique within a World. Enforce and throw on duplicate. |
| 10 | **Phase locking** | Custom phases must be registered before first `world.update()`. Throw afterward. |
| 11 | **Resource `destroy()` convention** | World calls `resource.destroy()` on shutdown if the method exists. Document this convention. |
| 12 | **System lifecycle operations during pipeline** | `systems.remove`, `systems.enable`, `systems.disable` during pipeline execution should throw. |
| 13 | **`components.read` returns null for missing** | Consistent with `components.has` returning false. Not an error. |
| 14 | **Error message quality** | Every error must include operation name, offending value, reason, and suggestion. |
| 15 | **Transparent deferral** | Entity mutation API is identical for deferred (inside pipeline) and immediate (outside). World handles the distinction. |
| 16 | **Secondary buffer tracking** | World tracks both `_insidePipeline` and `_insideFlush` flags for correct deferral during lifecycle hooks. |
| 17 | **Debug API** | `entities.isAlive()`, `entities.count()`, and optionally more debug methods should be exposed. |
| 18 | **System configuration immutability** | After `systems.add`, the config (query, phase, name) is frozen. Only `fn` and `enabled` can change at runtime. |
| 19 | **API namespaces** | Group methods under `entities.*`, `components.*`, `resources.*`, `systems.*`, `events.*` to prevent 50+ flat methods on World. |
| 20 | **World configuration options grouping** | Group options into `memory`, `pipeline`, `errors` sub-objects for extensibility. |
| 21 | **Capability boundaries** | The World architecture should not hard-code assumptions that prevent specialized variants (EditorWorld, ServerWorld). Subsystem groups (ECSCore, Scheduler, Runtime) enable composition. |

### 16.3 Optional Improvements

| # | Decision | Impact |
|---|---|---|
| 22 | **Convenience `world.each()`** | Entity-level callback iteration (slower than chunk iteration). Not for Phase 1. |
| 23 | **Declarative resource injection in systems** | Systems declare resource dependencies alongside query. Not for Phase 1. |
| 24 | **`components.patch(entity, C, mutator)`** | Copy → mutate → write in one call. Reduces boilerplate and snapshot confusion. Not for Phase 1. |
| 25 | **Entity proxy object** | `world.entity(id)` returns a thin proxy for ergonomic access. Not for Phase 1. |
| 26 | **World serialization** | `world.serialize()` / `world.deserialize()`. Not for Phase 1. |
| 27 | **Readonly World interface** | A `ReadonlyWorld` type exposes `components.read` but not `components.write`. Useful for system isolation. Not for Phase 1. |

---

## 17. Invariant Compliance

| Invariant | Layer 4 Status |
|---|---|
| Entities are IDs, not objects | Compliant — `createEntity` returns a number. No wrapper objects. `getComponent` returns data objects (not entity objects). |
| Components are pure data | Compliant — the public API exposes component data through `getComponent` (data object) and `setComponent` (data object). No methods on components. |
| Systems own behavior, components own data | Compliant — `addSystem` registers behavior. Components are schemas with typed fields. |
| Archetypes own storage | Compliant — table creation and management are internal to Layers 1–2. The public API never exposes tables. |
| Migration is the cost of density | Compliant — `addComponent`/`removeComponent` always triggers migration. No lazy or cached paths in the public API. |
| Deferred commands required during iteration | Compliant — entity mutations during pipeline execution are transparently deferred. The public API has no "force immediate" escape hatch during iteration. |
| Layers never reach upward | Compliant — Layer 4 calls into Layers 1–3. No upward dependencies. HookSystem is owned by Layer 4 and called by the World (which owns all layers), not by Layer 2 directly. |
| Table structure never user-visible | Compliant — queries return chunks with component accessors, not table references. Users cannot inspect or manipulate table structure. |
| Component schemas immutable after registration | Compliant — `registerComponent` freezes the schema. No public API to modify it afterward. |
| Signatures are canonically ordered | Compliant — query filters are sorted internally. User-provided filter order does not affect behavior. |
| Query filters are immutable after creation | Compliant — the public API returns a reference to an internal Query object. No method to modify it. |
| Deterministic execution | Compliant — system ordering (registration order + topological sort), archetype creation order, and entity ID allocation are all deterministic given the same sequence of API calls. |

**No invariants are violated.**

**One concern — the `components.read` return value:**
Returning a plain object is technically a "component data" object. If a user treats it as a live reference and modifies it expecting persistence, they violate the "components are pure data" principle (they're treating the snapshot as the component). The rename from `getComponent` to `read` mitigates this — `read` emphasizes copy semantics. Additionally, the future `components.patch()` API (see §16.3) provides a safe mutation path that never exposes a snapshot to the user.

---

## 18. Overall Readiness

### Blocking Issues

1. **Registry lock timing**: Change from "first entity creation" (Layer 1) to "first `world.update()`" (Layer 4). This is a minor change to Layer 1's interface — the `registry.lock()` call moves from the entity creation path to the pipeline start path. The lock itself is the same mechanism; only the trigger changes.

2. **World lifecycle specification**: The SETUP → RUNNING → DESTROYING → DESTROYED state machine must be documented and enforced in the World implementation. Use an enum, not boolean flags.

3. **Component registration API**: Class + static schema is primary, string + schema is fallback. `registerComponent` returns void. Accept optional `reservedId` for built-in components (IDs 1–63).

4. **Built-in component ID reservation**: Reserve IDs 1–63 in the ComponentRegistry. Add `register(name, schema, { reservedId })` for engine internals.

5. **Hook callback signature**: Hooks receive `(world, entityId)`. World parameter enables plugins without closure capture.

6. **`components.read` (was `getComponent`) copy semantics**: Returns a fresh plain object snapshot. Renamed to `read` to emphasize copy semantics. Mutations to the returned object do NOT affect storage.

7. **Resource key by constructor**: Primary key is `constructor`. `set` for first registration, `replace` for hot-reload. `remove` reserved for future.

8. **Idempotent destroy and single-use World**: `destroy()` is idempotent (safe to call multiple times). Create a new World for fresh state.

### Important Refinements

9. System names must be unique within a World.
10. Custom phases must be registered before first `world.update()`.
11. World calls `resource.destroy()` on shutdown if the method exists.
12. System lifecycle operations throw during pipeline execution.
13. `components.read` returns `null` for missing components (not an error).
14. Every error message includes operation, reason, and suggestion.
15. Transparent deferral — same API for deferred and immediate execution.
16. Track `_insideFlush` separately from `_insidePipeline` for correct hook deferral.
17. Expose `entities.isAlive()` and `entities.count()` for debugging.
18. System configuration (query, phase, name) is immutable after registration.
19. API is namespaced: `entities.*`, `components.*`, `resources.*`, `systems.*`, `events.*`.
20. World options are grouped by domain: `memory`, `pipeline`, `errors`.
21. Capability boundaries preserved — subsystem groups (ECSCore, Scheduler, Runtime) allow specialized World variants.
22. `components.patch(entity, C, mutator)` reserved for future safe mutation API.

### Optional Improvements

23. `world.each()` convenience iteration (post-Phase 1).
24. Declarative resource injection (post-Phase 1).
25. Entity proxy objects for ergonomic access (post-Phase 1).
26. World serialization (post-Phase 1).
27. Readonly World interface for system isolation (post-Phase 1).
28. `queryEngine.clearUnused()` for editor scenarios (post-Phase 1).

### Implementation Readiness

**Layer 4 is approximately 97% ready for implementation.**

The architecture is coherent, consistent with Layers 1–3, and preserves all architectural invariants. No design flaws, layer violations, or ownership issues were identified.

The 8 blocking issues are all specification decisions (not redesigns). The most impactful is the registry lock timing change — moving the lock from "first entity creation" to "first `world.update()`" — which requires updating one line in Layer 1's specification but affects no fundamental architecture.

The remaining surface-level choices (exact namespace names, parameter order, error message format) are implementation decisions that do not affect the architectural review.

**Summary assessment by area:**

| Area | Score |
|---|---|
| World architecture & ownership | 10/10 |
| Public API design | 9.5/10 |
| Entity API & ID semantics | 10/10 |
| Component registration | 9.5/10 |
| Resource system | 10/10 |
| Query API | 10/10 |
| System registration | 9.5/10 |
| Deferred commands | 10/10 |
| World lifecycle | 9.5/10 |
| Error handling | 9.5/10 |
| Layer interaction | 10/10 |
| Memory model | 10/10 |
| Performance | 9.5/10 |
| Future extensibility | 10/10 |
| **Overall** | **9.8/10** |
