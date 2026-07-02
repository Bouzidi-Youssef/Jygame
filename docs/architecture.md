# Architecture

## Entity-Component-System Model

Entities are composed from lightweight component objects. Systems operate on
entities that expose the required components — no type checking, no base class.

### Components

| Component | Fields | Read by |
|---|---|---|
| `Transform` | `x`, `y`, `rotation`, `scale` | MovementSystem, RenderSystem, CollisionSystem, SpatialHash |
| `Collider` | `width`, `height` | CollisionSystem, SpatialHash, RenderSystem (culling) |
| `Renderable` | `image`, `style`, `draw()` | RenderSystem, AnimationSystem |
| `Animation` | `animations`, `current`, `frame`, `elapsed`, `playing` | AnimationSystem |
| `Velocity` | `x`, `y` (Vec2) | MovementSystem |
| `Visible` | `visible` (boolean) | RenderSystem, CollisionSystem, SpatialHash |

### Systems

| System | Reads | Writes | Singleton |
|---|---|---|---|
| `AnimationSystem` | `animation`, `renderable` | `renderable.image`, `animation.frame`, `animation.elapsed`, `animation.playing` | `animationSystem` |
| `MovementSystem` | `velocity`, `transform` | `transform.x`, `transform.y` | `movementSystem` |
| `RenderSystem` | `transform`, `collider`, `renderable`, `visible` | canvas (side effect) | `renderSystem` |
| `CollisionSystem` | `transform`, `collider`, `visible` | none | `collisionSystem` |
| `SpatialHash` | `transform`, `collider`, `visible` | `__shId`, `__shStamp` (internal) | instance per Group |

### Who Owns What

| Concern | Owner | Why |
|---|---|---|
| Position, rotation, scale | `Transform` — authoritative | Single source of truth |
| Entity size (AABB) | `Collider` — authoritative | Separate from visual bounds |
| Visual appearance | `Renderable` — authoritative | Image or shape style |
| Animation state | `Animation` — authoritative | `current`, `frame`, `elapsed`, `playing` |
| Frame advancement | `AnimationSystem` | Writes `renderable.image`, advances `Animation` state |
| Speed and direction | `Velocity` — authoritative | Consumed by MovementSystem |
| Entity membership | `Group._sprites` | Private array, iterable |
| World-to-screen transform | `Camera` — authoritative | Position, zoom, rotation applied by RenderSystem |
| Visible world region | `Camera` — derived from position + zoom + size | Used for culling |
| SpatialHash lifecycle | `CollisionSystem` | `beginFrame()` → all rebuilds |
| Broad-phase strategy | `CollisionSystem` + strategy instance | Pluggable via `useSpatialHash()` |

### What Is Derived

| Value | Derived From | Used By |
|---|---|---|
| Sprite `x`, `y`, `width`, `height` | `Transform + Collider` (center → top-left) | Public convenience getters |
| `Rect` from entity | `Transform + Collider` | SpatialHash cell calculation |
| Entity center | `Transform.x`, `Transform.y` | Collision checks, rendering |
| World-space AABB | `Transform + Collider + scale` | Camera culling |
| Visible world bounds | `Camera (x, y, width, height, zoom)` | Culling, worldToScreen, screenToWorld |

## Ownership Boundaries

### Group

```
Group (container only)
├── _sprites: Entity[]       (private, iterable)
├── add/remove/clear/has     (membership)
├── dispose()                (unregister + clear)
├── useSpatialHash()         (registers with CollisionSystem)
├── collideXxx()             (delegates to CollisionSystem)
├── forEach/filter/map       (delegates to Array methods)
└── [Symbol.iterator]        (iterable)
```

- Does NOT own update, render, or collision logic
- Does NOT expose internal array
- `dispose()` is the single cleanup call

### Sprite

```
Sprite (data entity)
├── Transform
├── Collider
├── Velocity (Vec2)
├── Renderable
├── Animation
├── visible: boolean
└── groups: Group[]
```

- No `update()`, no `render()`, no animation logic — systems handle behavior
- `kill()` removes from all groups
- Public getters (`x`, `y`, `width`, `height`, `image`, `style`, `angle`, `scale`) are convenience shorthands over components

### Camera

```
Camera (transform)
├── x, y              center of view in world space
├── width, height     viewport size in pixels
├── zoom              scale factor (higher = zoomed in)
├── rotation get/set  world rotation with cached cos/sin
├── static main       first created Camera becomes default
├── static setMain()  explicit main camera assignment
├── _cos, _sin        cached trig values (updated on rotation set)
├── apply(ctx)        one-shot canvas transform
├── worldToScreen()   world → pixel coords (uses cached cos/sin)
├── screenToWorld()  pixel → world coords (uses cached cos/sin)
└── follow(entity)    snap to entity.transform
```

- `Camera.main` is auto-set in constructor if no main exists
- `Camera.setMain(camera)` for explicit transitions (scene changes)
- `IDENTITY` (internal to RenderSystem, width=0) disables transform
  and culling when no camera exists — `render(ctx, entities)` works
  without any camera setup
- `_cos`/`_sin` cached on rotation set — no trig per query
- Not a System, not a Component — it is a standalone view abstraction
- Future features (shake, smoothing, parallax, dead zones) go in
  camera controllers, not in Camera itself

### Input

```
Input (facade) → InputContext (implementation)
├── _pressed, _justPressed, _justReleased    Map<name, bool>
├── _keyMap      Map<physicalKey, alias>      alias resolution
├── _actions     Map<action, Set<input>>     action resolution
├── _pointers    Map<pointerId, data>
├── _swipeListeners / _tapListeners          Set<callback>
├── isDown / justPressed / justReleased       key → alias → action
├── mapKey / unmapKey / setKeyMap / resetKeyMap
├── bind / unbind / getBindings / clearBindings
├── getPointers()                             returns iterator (no alloc)
├── forEachPointer(fn)
├── getPointer(id)
├── onSwipe / onTap                           return unsubscribe fn (no alloc)
├── removeSwipe / removeTap                   O(1) Set.delete
└── consumeBuffer / peekBuffer
```

Resolution chain: `Physical Key → Key Alias → Action`

All three query methods (`isDown`, `justPressed`, `justReleased`) follow the
same chain via `_resolve(name, map)` — no duplicated lookup logic.

Listeners use `Set` (O(1) add/delete). Unsubscribe functions capture the
callback and call `Set.delete()` — no array allocation on removal.

`getPointers()` returns `Map.values()` iterator directly — no array copy.

The `Input` facade delegates every method to the default `InputContext`
singleton, including the new `bind`/`unbind`/`getBindings`/`clearBindings`.

### AnimationSystem

```
AnimationSystem
├── update(entities, dt)    batch frame advancement
├── updateOne(entity, dt)   single entity
└── no per-frame allocations
```

- Operates on any entity with `animation` + `renderable`
- `while (elapsed >= frameTime)` loop — catches up frames after spikes
- Per-clip FPS (no global animation speed)
- Non-looping clips stop on last frame, fire callback once
- Writes `entity.renderable.image` directly — RenderSystem is unaware of AnimationSystem
- Future sprite sheet support: `clip.frames[n]` can be metadata without changing the system

### RenderSystem

```
RenderSystem
├── render(ctx, entities, camera?)       batch render (camera optional)
├── renderOne(ctx, entity, camera?)      single entity
├── _getViewBounds(camera) → bounds|null shared bounds computation
├── _isVisible(entity, bounds) → bool    shared culling (bounds=null → true)
├── _drawEntity(ctx, entity)             shared entity transform + draw
└── camera ??= Camera.main ?? IDENTITY
```

- Camera transform applied once per batch (not per entity)
- `_getViewBounds`: returns null when `camera.width === 0` (no culling) —
  avoids `Infinity` arithmetic
- `_isVisible`: single culling implementation used by both `render`
  and `renderOne`
- `_drawEntity`: single entity-drawing implementation used by both
- `IDENTITY` sentinel (width=0, plain object) disables both transform
  and culling — no camera setup required for simple games
- Accepts any iterable of entities

### CollisionSystem

```
CollisionSystem
├── _groups: Map<Group, { strategy, entities }>
├── beginFrame()            rebuilds all strategy instances
├── useSpatialHash()        registers a Group with SpatialHash
├── removeGroup()           unregisters a Group
├── collideRect/Point/Group/Sprite()
└── _query/_queryPairs      internal helpers
```

- `beginFrame()` takes no arguments — iterates all registered groups
- Strategy is pluggable (currently `SpatialHash`)
- `_queryPairs` supports callback mode (zero-allocation)

### SpatialHash

```
SpatialHash (strategy)
├── rebuild(entities)           clears + rebuilds cell grid
├── collideRect/Point/Sprite()  stamp-based single-entity dedup
├── collideGroup()              scratch Set pair dedup (reused)
├── _queryStamp                 stamp counter (no Set allocation)
├── _seen                       reusable Set for pair dedup
└── __shId, __shStamp           entity markers (internal)
```

- Single-entity queries (`collideRect`, `collideSprite`) use `_queryStamp++`
  and stamp each entity — zero allocation per query.
- `collideGroup` uses a scratch `_seen` Set per instance (one constructor
  allocation), cleared each call.
- `collideGroup` supports callback mode (zero pair allocation).

## Scene Architecture

### Scene Hierarchy

There is a single canonical Scene hierarchy. The ECS Scene is the generic base,
and the engine Scene extends it with game-specific functionality.

```
ecs/scene/Scene           (ECS layer — generic, reusable)
        ↑
core/Scene                (Engine layer — game-specific)
```

### ECS Scene (`ecs/scene/Scene`)

Responsibilities:
- Owns a `World` instance (lazy-created via `_createWorld()`)
- Manages the `_created` flag for SceneManager integration
- Provides lifecycle hooks: `onCreate`, `onEnter`, `onExit`, `onPause`, `onResume`, `onDestroy`
- Provides `update(dt)` and `render(ctx)` — no-ops by default

The `_createWorld()` method can be overridden by subclasses to customize World
construction. By default it returns `new World()`.

### Engine Scene (`core/Scene`)

Extends ECS Scene with:

- **DOM integration**: creates a `root` `<div>` element for UI rendering
- **Input helpers**: `on(event, handler)`, `onSwipe(cb)`, `onTap(cb)`, `cleanup(fn)`
- **Game navigation**: `pushScene`, `popScene`, `replaceScene`, `switchScene`, `transitionTo`
- **Engine lifecycle**: `enter()`/`exit()` (called by `Game._mountScene`/`_unmountScene`)
- **Sprite integration**: manages `Sprite._defaultWorld` on enter/exit
- **Camera/CanvasContext**: installs game-specific resources on enter when a Game is available

Overrides `_createWorld()` to use `DefaultWorldBuilder.createDefault()`.

### WorldFactory / DefaultWorldBuilder

All ECS initialization logic is extracted from Scene into a dedicated builder.

**File**: `ecs/bootstrap/DefaultWorldBuilder.js`

```js
const world = DefaultWorldBuilder.createDefault();
```

The builder:

1. Creates a new `World`
2. Registers all engine components:
   - Transform, Velocity, Collider, Renderable, RenderBounds
   - Animation, Visible, Trail
   - EnemyTag, PlayerTag, ProjectileTag, StaticTag
3. Installs engine resources:
   - SpatialHash, TrailManager, RenderQueue, AnimationClipRegistry
4. Installs engine systems:
   - MovementSystem, AnimationSystem, CollisionSystem
   - RenderSystem, TrailSystem

Game-specific resources (Camera, CanvasContext) are NOT installed by the builder
— they are set up by `core/Scene.enter()` when a Game is available.

### SceneManager

Decomposed internally into three concerns:

| Concern | Implementation | Responsibility |
|---------|---------------|----------------|
| **SceneRegistry** | Private `_registry` (Map) | `add`, `remove`, `get`, `has` — owns loaded scenes |
| **SceneStack** | Public `_stack` (Array) | `push`, `pop`, `peek`, `length` — active scene ordering |
| **SceneManager** | Coordinator | Lifecycle orchestration: `start`, `change`, `replace`, `push`, `pop`, `update`, `render` |

Public API unchanged. The decomposition is purely internal.

### Ownership Relationships

```
Game
├── owns _sceneStack: Scene[]       (core/Scene instances)
├── manages enter/exit lifecycle
└── delegates to scene.world.*       (ECS World per scene)

SceneManager
├── owns _registry: Map<string, Scene>  (ecs/scene/Scene instances)
├── owns _stack: Scene[]               (active scenes)
└── manages onCreate/onEnter/onExit/onPause/onResume/onDestroy lifecycle
```

Each Scene owns exactly one World. Worlds are never shared between scenes.
Systems, components, prefabs, and events are isolated per World.

## Scene Stack

### Overview

`Game` replaces the single `scene` property with `_sceneStack[]`. The top
scene is the active scene. Underlying scenes remain alive — nothing is
destroyed when a new scene is pushed on top.

```
Game
├── _sceneStack: Scene[]     (index 0 = bottom, top = active)
├── run(scene)               initial scene (clears stack)
├── pushScene(scene)         stack an overlay
├── popScene()               remove the top overlay
├── replaceScene(scene)      pop current + push new (correct lifecycle)
├── peekScene() → Scene      top without side effects
├── switchScene(scene)       full replacement (clears stack)
├── get scene                → peekScene() (backward compat)
├── get sceneCount           → _sceneStack.length
├── getScenes() → Scene[]    → shallow copy of stack (safe)
├── getScene(index) → Scene  → bounds-checked access
├── containsScene(scene)     → _sceneStack.includes(scene)
├── isTopScene(scene)        → this.scene === scene
└── Scene delegates          pushScene/popScene/replaceScene/switchScene
```

### Lifecycle Order

```
pushScene(newScene)
├── if newScene.blocksUpdateBelow:
│   └── top.pause()
└── newScene.enter()

popScene()
├── top.exit()
├── if top.blocksUpdateBelow:
│   └── below.resume()
└── refresh UI

replaceScene(scene)
├── old = stack.pop()
├── old.exit()
├── stack.push(scene)
├── scene.enter()
└── refresh UI

switchScene(newScene)
├── for each s in stack:
│   ├── s.exit()
│   └── s.root.remove()
├── stack = [newScene]
├── newScene.enter()
└── refresh UI
```

### Blocking Rules

Each scene can control whether scenes below it receive updates and renders.

| Property | Default | Purpose |
|---|---|---|
| `blocksUpdateBelow` | `true` | Stop game logic when paused |
| `blocksRenderBelow` | `false` | Show game dimmed behind menu |

Pause/resume lifecycle is aligned with update blocking. A scene pushed with
`blocksUpdateBelow = false` (e.g. FPS overlay, chat) does NOT pause the scene
below it. On pop, the scene below is resumed only if the popped scene had been
blocking updates.

Traversal walks downward from top until a blocker is found, then executes
the visible set bottom-to-top. Blocking indices are computed once per frame
inside `_loop()` and shared across `_updateScenes`, `_interpolateScenes`, and
`_renderScenes` — zero redundant scans.

```
Stack: [GameScene, PauseScene, InventoryScene]

_updateScenes:
  Inventory allows updates below  → continue
  Pause   blocks updates below   → start = 1
  Execute: Pause.update(), Inventory.update()

_renderScenes:
  Inventory allows render below  → continue
  Pause   allows render below    → continue
  Game    reaches bottom         → start = 0
  Execute: Game.render(), Pause.render(), Inventory.render()
```

### Scene Lifecycle Hooks

| Hook | When Called |
|---|---|---|
| `enter()` | Scene is mounted (after push, replace, switch, or run) |
| `exit()` | Scene is unmounted (pop, replace, switch, or destroy) |
| `pause()` | Another scene is pushed above AND `blocksUpdateBelow` is true |
| `resume()` | Scene becomes top again AND the popped scene had been blocking |
| `update(dt)` | Each frame if not blocked from below |
| `interpolate(alpha)` | Each frame, follows same rules as update |
| `render(ctx)` | Each frame if not blocked from below |
| `renderUI()` | Called after push/pop/switch to refresh DOM |
| `pushScene` / `popScene` / `replaceScene` / `switchScene` | Stack management delegated to `this.game` |

### Lifecycle Safety

#### Single-Use Scenes

Scenes are single-use objects. Once `exit()` is called, the same scene instance
must not be mounted again. Both `enter()` and `exit()` guard against double
calls and throw descriptive errors.

```js
const pause = new PauseScene();
game.pushScene(pause);
game.popScene();
game.pushScene(pause); // throws: scene has already exited
```

#### Scene Ownership

Each scene belongs to exactly one `Game` instance. Attempting to mount a scene
on a second game throws:

```js
gameA.pushScene(scene);
gameB.pushScene(scene); // throws: belongs to another Game
```

#### Mutation Safety During Update

Scene operations (`pushScene`, `popScene`, `replaceScene`, `switchScene`) that
occur during `update()` or `interpolate()` are queued and deferred. They are
flushed in FIFO order after the update phase finishes and before rendering.

This prevents subtle iteration bugs when scene code mutates the stack:

```js
update(dt) {
  this.pushScene(new PauseScene()); // queued, not executed now
  this.popScene();                   // queued
}
// flushed after update, before render
```

#### Input Validation

All scene-accepting methods validate their argument:

| Method | Rejects |
|---|---|
| `run(scene)` | null, non-Scene, already-running game |
| `pushScene(scene)` | null, non-Scene |
| `replaceScene(scene)` | null, non-Scene |
| `switchScene(scene)` | null, non-Scene |
| `popScene()` | empty stack or last remaining scene |

### Per-Frame Lifecycle

```
Game._loop(time)
│
├── compute updateStart = _findBlockingIndex("blocksUpdateBelow")
├── compute renderStart = _findBlockingIndex("blocksRenderBelow")
│
├── _updating = true
│   │  scene operations are queued, not executed immediately
│   │
│   ├── _updateScenes(fixedDt, updateStart)
│   │   │  only scenes at or above updateStart
│   │   ├── user input handling
│   │   ├── animationSystem.update(group, dt)
│   │   ├── movementSystem.update(group, dt)
│   │   ├── collisionSystem.beginFrame()
│   │   ├── collisionSystem.collideXxx(...)
│   │   └── scene-specific logic
│   │
│   ├── _interpolateScenes(alpha, updateStart)
│   │   same visibility as update
│   │
│   └── _updating = false
│
├── _flushSceneOps()
│   executes all queued push/pop/replace/switch in FIFO order
│
└── _renderScenes(ctx, renderStart)
    │  only scenes at or above renderStart
    ├── renderSystem.render(ctx, group, camera?)
    └── scene-specific rendering
```

### Allocations Per Frame (hot path)

| Operation | Allocation |
|---|---|
| `AnimationSystem.update` | 0 |
| `MovementSystem.update` | 0 |
| `RenderSystem.render` (no camera) | 0 (IDENTITY sentinel, width=0 → no culling, no transform) |
| `RenderSystem.render` (with camera) | 0 (one `ctx.save/restore`, bounds computed once) |
| `Camera.apply` | 0 |
| `Camera.worldToScreen` | 0 (writes to user-provided `out`) |
| `Camera.screenToWorld` | 0 (writes to user-provided `out`) |
| `CollisionSystem.beginFrame()` | 0 (cells cleared + reused) |
| `SpatialHash.collideRect` / `collideSprite` | 0 (stamp++) |
| `SpatialHash.collideGroup` (with callback) | 0 (reused scratch Set) |
| `SpatialHash.collideGroup` (with out array) | 0 (scratch Set + reuses out array) |
| `SpatialHash._insert` | cell key string (unavoidable) |
| `Renderable.draw` with circle/ellipse | 0 (Path2D cached) |

Goal: **0 allocations per frame** during normal gameplay on the hot path.
Pull-based APIs (`out`, callback) shift allocation control to the caller.

## Entity Component Contract

Any object with the following properties works with the engine:

```js
// Required by MovementSystem
entity.transform   // { x, y }
entity.velocity    // { x, y }

// Additional requirement for AnimationSystem
entity.animation   // { animations, current, frame, elapsed, playing }
entity.renderable  // { draw(ctx, w, h) }

// Additional requirement for RenderSystem
entity.visible     // boolean
entity.collider    // { width, height }
entity.renderable  // { draw(ctx, w, h) }

// Additional requirement for CollisionSystem / SpatialHash
entity.visible     // boolean
entity.collider    // { width, height }
entity.transform   // { x, y }
```

No entity needs to extend `Sprite`. Any plain object with the right
properties can be used with any system. `Sprite` is the built-in
implementation that provides these components on construction and
exposes convenience getters.

## Strategy Interface

Pluggable broad-phase strategies must implement:

```js
interface BroadPhaseStrategy {
  rebuild(entities): void
  collideRect(rect, out?): Entity[]
  collidePoint(point, out?): Entity[]
  collideSprite(entity, out?): Entity[]
  collideGroup(other, cbOrOut?): Pair[] | void
}
```

`SpatialHash` is the default strategy. Future strategies (`SweepAndPrune`,
`Quadtree`, `BVH`) implement the same interface and are swapped in via
`CollisionSystem.useSpatialHash()`.

---

## Hierarchy System

### Ownership Model

| Concern | Owner | Type |
|---------|-------|------|
| Parent pointer | `Parent` component | `{ entity: u32 }` — stored in ECS table |
| Child list | `HierarchyGraph._children` | `Map<entityId, entityId[]>` — authoritative |
| Child marker | `Children` component | Empty-schema tag for ECS queries |
| Dirty set | `HierarchyGraph._dirty` | `Set<entityId>` — entities needing WT recomputation |

**Children ownership (Option B):** The `Children` component is a lightweight marker
that enables ECS queries (e.g., "find all entities with children"). The authoritative
child list lives in `HierarchyGraph._children` as a `Map`. This avoids the ECS's
fixed-schema limitation — child lists are variable-length and sparse, which fits a
Map better than table columns.

**Dirty ownership:** Dirty state lives in `HierarchyGraph._dirty` as a `Set<entityId>`.
This was chosen over per-component dirty flags for several reasons:

- Adding a dirty column to every entity's table would impose memory overhead on all
  entities regardless of hierarchy membership.
- The dirty set is naturally sparse (only entities whose Transform changed since the
  last update are dirty).
- `Set<entityId>` provides O(1) add/delete/has with no per-entity storage overhead
  for non-dirty entities.
- Moving dirty state into a dedicated `DirtyTransform` component was considered but
  rejected: adding/removing a component on every Transform change would cause
  archetype moves, which are significantly more expensive than a Set operation.

### Hierarchy Traversal Algorithm

The `HierarchySystem` replaces full-table iteration with a **BFS from dirty roots**:

```
1. Snapshot the dirty set into an array (one allocation per frame).
2. For each entity in the snapshot:
   a. If already processed (removed from dirty set), skip.
   b. If it has a Parent that is still dirty, skip (parent will reach it via BFS).
   c. Otherwise, BFS from this entity:
      - Resolve entity → (Table, row) via archetype system + entity manager.
      - If root (no Parent): copy local Transform → WorldTransform via typed arrays.
      - If child: read parent's WorldTransform via parent's table columns, compute.
      - Remove from dirty set.
      - Push dirty children (from hierarchy._children) to the BFS queue.
3. After all seeds processed: any remaining dirty entries are stale (safety clear).
```

Complexity analysis:

| Scenario | Old (table scan) | New (BFS) |
|----------|-----------------|-----------|
| No dirty entities | O(world entities) | O(1) — early return |
| Single root changed, N descendants dirty | O(N × D × world) | O(N) |
| K roots changed, N total dirty | O(K × N × world) | O(N) |
| Deep chain (depth D), single root changed | O(D × world) | O(D) |

**Key insight:** The old algorithm scanned every table for every pass (number of
passes = max depth). The new algorithm only visits dirty entities, processing each
exactly once via BFS from its dirty root ancestor.

### Determinism

- BFS queue preserves parent-before-child ordering.
- Children are enqueued in insertion order (from `_children` array), preserving
  sibling order.
- The snapshot of the dirty set (`[...dirty]`) is processed in insertion order,
  but the BFS from each seed guarantees correct propagation regardless of seed order.

### Dirty Propagation (Explicit Stack)

The recursive `_markDirtyRecursive` was replaced with an explicit stack to avoid
JavaScript recursion limits on deep hierarchies:

```js
_markDirtyRecursive(entity) {
    const stack = [entity];
    while (stack.length > 0) {
        const current = stack.pop();
        if (this._dirty.has(current)) continue;
        this._dirty.add(current);
        const children = this._children.get(current);
        if (children) {
            for (let i = 0; i < children.length; i++) {
                stack.push(children[i]);
            }
        }
    }
}
```

This handles arbitrarily deep hierarchies (up to available memory) without stack
overflow.

### World API Lookup Reduction

The optimized HierarchySystem reduces per-entity World API calls in the hot loop:

| Operation | Old (per entity per pass) | New (per entity, one pass) |
|-----------|--------------------------|---------------------------|
| `world.has(entity, Parent)` | 1 | 0 — uses `sig.contains(pid)` |
| `world.has(parent, WorldTransform)` | 1 | 0 — parent guaranteed to have WT |
| `world.get(entity, Parent)` | 1 | 1 (only for children) |
| `world.get(parent, WorldTransform)` | 1 | 0 — reads parent WT from typed arrays directly |
| `world.isAlive(parent)` | 1 | 0 — parent is alive by invariant |
| `hierarchy.isDirty(entity)` | 1 | 1 — O(1) Set lookup |
| entity → (Table, row) | 0 (table iteration) | 2 (`entityTable` + `getRow`) |

### Integration with ECS

The HierarchySystem uses `priority = -10` to run before all gameplay systems
(which default to priority 0). This ensures WorldTransform is up-to-date before
MovementSystem, RenderSystem, CollisionSystem, etc. read it.

`HierarchyGraph` is stored as a World resource, retrieved via
`ctx.resources.get(HierarchyGraph)`.

---

## Scene Streaming System

### Current Phase

The streaming system (Phase 33) provides the **infrastructure only**. It enables
entities to be grouped into named cells and cells to be loaded and unloaded
deterministically. No serialization, asynchronous loading, disk I/O, world
partitioning, or LOD is implemented in this phase.

### StreamingCell

A `StreamingCell` represents a logical collection of entities within a World.

**Responsibilities:**
- Unique name identification
- `loaded` / `unloaded` state tracking
- Ownership of entity membership via a `Set<entityId>`
- Deterministic cleanup

**Entity ownership rules:**
- Each entity belongs to at most one `StreamingCell`.
- Adding an entity already owned by another cell throws.
- Adding a dead or invalid entity ID throws.
- Destroyed entities are automatically removed from their owning cell.

**API:**

| Member | Type | Description |
|--------|------|-------------|
| `cell.name` | `string` | Unique cell name |
| `cell.loaded` | `boolean` | Whether the cell is loaded |
| `cell.entityCount` | `number` | Number of owned entities |
| `cell.entities` | `Set<number>` | Set of owned entity IDs |
| `cell.addEntity(entity)` | `void` | Add entity to cell |
| `cell.removeEntity(entity)` | `void` | Remove entity from cell |
| `cell.clear()` | `void` | Remove all entities (no destruction) |
| `cell.contains(entity)` | `boolean` | Check entity membership |

### StreamingManager

The `StreamingManager` owns every `StreamingCell` within a World. It is stored
as a World resource.

**Responsibilities:**
- Cell lifecycle: create, retrieve, destroy
- Load/unload orchestration (entity destruction on unload)
- Entity-to-cell mapping for O(1) cleanup on entity destruction

**API:**

| Method | Description |
|--------|-------------|
| `createCell(name)` | Create a new cell (throws on duplicate) |
| `getCell(name)` | Retrieve cell or null |
| `hasCell(name)` | Check if cell exists |
| `destroyCell(name)` | Remove cell (unloads first if loaded) |
| `load(name)` | Activate cell (no-op if already loaded) |
| `unload(name)` | Destroy all owned entities, clear cell, mark unloaded |
| `loadAll()` | Activate all cells |
| `unloadAll()` | Unload all cells |
| `loadedCells()` | Return array of loaded cells |
| `cellCount` | Total number of cells |

### Loading Lifecycle

```
load(name)
  → cell found?  (throw if not)
  → already loaded?  (no-op)
  → mark cell._loaded = true
  → entities are preserved
```

### Unloading Lifecycle

```
unload(name)
  → cell found?  (throw if not)
  → already unloaded?  (no-op)
  → snapshot entity IDs
  → clear cell._entityIds
  → remove entity→cell mappings
  → destroyEntity() for each entity
  → mark cell._loaded = false
```

### Entity Destruction Integration

When `World.destroyEntity(entity)` is called, the streaming system is notified
via a registered callback. The callback:
1. Looks up the entity in `StreamingManager._entityToCell` (a `Map<entityId, StreamingCell>`).
2. Removes the entity from the cell's `_entityIds` Set.
3. Removes the entity→cell mapping.

This ensures no stale entity IDs remain in any cell after entity destruction,
and that unload remains safe even if entities were destroyed externally.

### Relationship with SceneManager

The streaming system is **orthogonal** to SceneManager:
- `Scene` owns an entire World with full lifecycle (create, enter, pause, resume,
  exit, destroy).
- `StreamingCell` organizes entities within a single World.
- A Scene may have zero or more StreamingCells.
- Future phases may integrate cell loading with scene transitions.

### Relationship with Serialization (Future)

- `StreamingCell._name` serves as a serialization identifier.
- Future phases will introduce serialized cells: cells that can be written to
  disk as prefab-like assets and instantiated on demand.
- No serialization logic exists in this phase.

### Performance Characteristics

| Operation | Cost |
|-----------|------|
| `createCell` | O(1) Map insert |
| `destroyCell` | O(N) if loaded (N = entities to destroy) |
| `addEntity` | O(1) Set add + Map set |
| `removeEntity` | O(1) Set delete + Map delete |
| `contains` | O(1) Set has |
| `load` | O(1) flag set |
| `unload` | O(N) (N = entities to destroy) |
| `onEntityDestroyed` | O(1) Map get + Set delete + Map delete |

### Future Phases

- **Phase 34:** Serialized cells — cells become assets streamed from disk.
- **Phase 35:** Asynchronous loading — cells load in the background.
- **Phase 36:** Streaming radii — cells activate based on proximity.
- **Phase 37:** World partitioning — spatial subdivision for large worlds.
- **Phase 38:** LOD — level-of-detail cell variants.

