<p align="center">
  <img src="./logo_jygame.avif" alt="JyGame Logo" width="400">
</p>

<div align="center">

⭐ **Consider Supporting The Project with a star** ⭐

</div>

# jygame

A lightweight 2D game framework for the browser.

```js
import { Game, Scene, Sprite, Input, movementSystem, renderSystem } from "jygame";

class MyScene extends Scene {
  constructor() {
    super();
    this.player = new Sprite(100, 100, 32, 32);
    this.player.style.fill = "#ff6600";
  }

  update(dt) {
    this.player.velocity.x = 0;
    this.player.velocity.y = 0;
    if (Input.isDown("RIGHT")) this.player.velocity.x = 200;
    if (Input.isDown("LEFT")) this.player.velocity.x = -200;
    if (Input.isDown("UP")) this.player.velocity.y = -200;
    if (Input.isDown("DOWN")) this.player.velocity.y = 200;
    movementSystem.updateOne(this.player, dt);
  }

  render(ctx) {
    renderSystem.renderOne(ctx, this.player);
  }
}

const game = new Game({ parent: document.body, width: 800, height: 600 });
game.run(new MyScene());
```

## Install

```sh
npm install jygame
```

## Documentation

Full API reference, guides, and examples: [jygame-documentation.vercel.app](https://jygame-documentation.vercel.app/)

Note: `getPointers()` now returns an iterator (not an array). Use `for...of` or `forEachPointer()` to iterate. `getPointer(id)` and `forEachPointer(fn)` remain unchanged.

## API

| Import | Description |
|---|---|
| `Game` | Main game loop with fixed timestep, canvas setup, UI layer, scene stack (`pushScene`, `popScene`, `replaceScene`, `peekScene`, `switchScene`), and lifecycle management |
| `Scene` | Lifecycle hooks (`enter`, `exit`, `pause`, `resume`, `update`, `interpolate`, `render`, `renderUI`), blocking properties (`blocksUpdateBelow`, `blocksRenderBelow`), stack delegators (`pushScene`, `popScene`, `replaceScene`, `switchScene`), and auto-cleaned event helpers (`on`, `onSwipe`, `onTap`, `cleanup`) |
| `Sprite` | Entity with `Transform`, `Collider`, `Velocity`, `Renderable`, and `Visibility` components. Exposes `x`, `y`, `width`, `height`, `angle`, `scale`, `velocity`, `image`, `style` shorthands. |
| `Group` | Entity container. Iterable (`for...of`). Collision queries delegate to `CollisionSystem`. Optional `SpatialHash` acceleration. `dispose()` for cleanup. |
| `Transform` | Position (`x`, `y`), rotation, and scale — the single source of truth for world position |
| `Collider` | AABB dimensions (`width`, `height`) with static collision helpers (`checkAABB`, `checkRect`, `containsPoint`) |
| `Animation` | State container for animation playback — `animations` (Map), `current`, `frame`, `elapsed`, `playing` |
| `Renderable` | Image or shape style with cached `Path2D` for circle/ellipse/rect |
| `Camera` | View abstraction — world position, zoom, rotation, coordinate conversion. `Camera.main` auto-set on first construction. `Camera.setMain()` for explicit assignment. |
| `Vec2` | 2D vector with add, sub, scale, dot, normalize, rotate, lerp |
| `Rect` | AABB rectangle utility with collision, containment, overlap, and anchor helpers |
| `Clock` | Fixed-timestep accumulator for deterministic updates |
| `Timer` | Countdown timer with optional looping |
| `Input` | Keyboard (`isDown`, `justPressed`, `justReleased`), action bindings (`bind`/`unbind`), and touch (swipe/tap) input handling |
| `SpatialHash` | Spatial partitioning for broad-phase collision acceleration. Stamp-based single-entity dedup; reusable scratch `Set` for pair dedup. |
| `State` | Observable state container with subscribe/unsubscribe |
| `Storage` | `localStorage` wrapper with JSON serialization |
| `Color`, `Colors` | Color class with parsing, manipulation, and a palette of named colors |
| `ImageLoader` | Image preloading with in-memory cache |
| `FontLoader` | FontFace loading for custom web fonts |
| `LoadingTask` | Async loading tracker for preload progress |
| `AudioLoader` | Audio asset loader with in-memory cache. Loads HTMLAudioElement assets via `load(path)`, batch loading via `loadAll(map)`. Uses `canplaythrough` for readiness detection. |
| `AudioManager` | Sound registry with `add(key, asset)` / `get(key)` / `remove(key)`. Manages Sound lifecycle; destroys owned sounds on `clear()` / `destroy()`. |
| `Sound` | HTMLAudioElement wrapper. Constructor takes an audio asset directly. Volume/loop/muted controls, play/pause/stop/restart, and `destroy()` with safety guards. Internal `_playInternal` / `_pauseInternal` / `_stopInternal` abstraction for future backend migration. |
| `Pool` | Low-level object pool for allocation-free reuse. Tracks free objects and capacity. |
| `ActivePool` | Lifecycle-aware object pool built on `Pool`. Tracks active/inactive objects, O(1) acquire/release via index-tagged objects, batch operations (`acquireMany`, `releaseMany`, `releaseInactive`, `clearActive`, `warmup`), and full statistics (`activeCount`, `freeCount`, `capacity`, `peakActive`, `peakFree`, `peakCapacity`, `totalCreated`). |
| `Particle` | Lightweight data container for particle effects. Fields: `x`, `y`, `vx`, `vy`, `ax`, `ay`, `life`, `maxLife`, `size`, `rotation`, `rotationSpeed`, `alpha`, `color`. |
| `ParticleSystem` | ActivePool-backed particle lifecycle. `emit(count, init)` for spawning, `update(dt)` with O(n) auto-release + modifier pipeline, `render(ctx)` with optional custom renderer, `clear()`, `warmup(count)`, `destroy()`. Modifier API: `addModifier(m, priority?)` (validates lifecycle methods, throws if none found), `removeModifier(m)` (calls `modifier.destroy?.()`), `clearModifiers()` (calls `destroy` on all). Modifier lifecycle hooks (all optional, separated into per-hook arrays — zero optional chaining in hot paths): `beginFrame(dt, ctx)`, `update(p, dt, ctx)`, `onEmit(p, ctx)`, `onDeath(p, ctx)`, `endFrame(dt, ctx)`. Modifier priority: lower = earlier, defaults to 0, sorted on add/remove. Modifier enable/disable via `modifier.enabled` (default `true`). Reusable `ctx` provides `ctx.system` and `ctx.activeParticles`. Statistics: `activeCount`, `freeCount`, `capacity`, `peakActive`, `peakCapacity`, `peakFree`, `totalCreated`, `modifierCount`. Convenience helpers: `isEmpty`, `hasParticles`, `particles` (read-only). |
| `ParticleEmitter` | Thin automated spawner on top of `ParticleSystem`. Constructor takes `system`, `rate` (particles/sec), `initializer`. API: `start()`, `stop()`, `toggle()`, `emit(n)`, `burst(n)`, `update(dt)`, `reset()`, `destroy()`. Properties: `active`, `emittedCount`, `rate`, `initializer`, `isFollowing`. Frame-rate independent via accumulator. `destroy()` marks emitter as destroyed — `start()`, `emit()`, `update()` are no-ops after destruction. Zero per-frame allocations. |
| `FadeModifier` | Particle modifier that fades alpha over lifetime. Constructor: `{ mode: "out" | "in" | "in-out" }`. Allocation-free per-particle fade via `lifeRatio`. Clamped to `[0, 1]`. |
| `ScaleModifier` | Particle modifier that interpolates `size` from `from` to `to` over lifetime. Constructor: `{ from: number, to: number }`. Default: `{ from: 1, to: 0 }`. |
| `VelocityModifier` | Particle modifier that applies velocity damping. Constructor: `{ drag: number, affectX: boolean, affectY: boolean }`. Exponential damping via `beginFrame` (1 `exp()` per frame regardless of particle count). `affectX`/`affectY` for per-axis control (default both `true`). Frame-rate independent. Zero allocations. |
| `ColorModifier` | Particle modifier that transitions color over lifetime. Constructor: `{ from: "#hex", to: "#hex" }` (two-stop) or `{ stops: [[pos, "#hex"], ...] }` (multi-stop gradient). Pre-parses all hex in constructor; writes `r/g/b` channels directly (no string). Render builds `rgb(r,g,b)` at draw time. |
| `AnimatedSpriteModifier` | Particle modifier for sprite-sheet animation. Modes: `once`, `loop`, `pingpong`, `random`. Configurable frame durations, per-particle animation state, and frame-change event callbacks. |
| `MovementSystem` | Batch movement logic. Accepts any iterable of entities with `velocity` + `transform`. |
| `AnimationSystem` | Batch frame advancement with per-clip FPS, `while` catch-up, looping, and completion callbacks. Zero allocations. |
| `RenderSystem` | Batch rendering with camera culling, rotation, and scale. Camera is optional — no camera needed for simple games. |
| `animationSystem` | Shared singleton instance of `AnimationSystem` |
| `movementSystem` | Shared singleton instance of `MovementSystem` |
| `collisionSystem` | Shared singleton instance of `CollisionSystem` |
| `renderSystem` | Shared singleton instance of `RenderSystem` |
| `CollisionSystem` | Collision queries with broad-phase strategy lifecycle. Supports array-out and callback modes. |

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full design.

**Quick summary:** Entity-Component-System model. Stateless systems operate
on entities with required components — no type checking. `Sprite` is the
built-in entity (bundles `Transform` + `Collider` + `Renderable` + `Velocity`).
`Group` is a pure iterable container. Systems accept any iterable.

| Component | Fields | System |
|---|---|---|
| `Transform` | `x`, `y`, `rotation`, `scale` | Movement, Render, Collision |
| `Collider` | `width`, `height` | Collision, Render (culling) |
| `Renderable` | `image`, `style`, `draw()` | Render |
| `Velocity` | Vec2 `x`, `y` | Movement |
| `visible` | boolean | Render, Collision, SpatialHash |

Typical per-frame usage:

```javascript
movementSystem.update(enemies, dt);
collisionSystem.beginFrame();
const hits = collisionSystem.collidePoint(enemies, mouse);
renderSystem.render(ctx, enemies);
```

`collisionSystem.beginFrame()` rebuilds all registered broad-phase
strategies. Default is `SpatialHash`. Strategies are pluggable via the
same interface.

### Action Bindings

Actions decouple gameplay logic from physical keys:

```js
Input.bind("JUMP", "SPACE");
Input.bind("JUMP", "W");

// Later: key mapping resolves W → UP, bindings resolve UP → JUMP
if (Input.justPressed("JUMP")) {
  player.jump();
}
```

Resolution order: `Physical Key → Key Alias → Action`. `isDown`,
`justPressed`, and `justReleased` all follow this chain automatically.

## License

GNU General Public License v3.0
