import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  World,
  System,
  Transform,
  Velocity,
  Collider,
  Renderable,
  Animation,
  AnimationClip,
  AnimationClipRegistry,
  AnimationSystem,
} from "../../../ecs/index.js";

function createWorld() {
  const world = new World();
  world.register(Animation);
  world.register(Renderable);
  world.register(Transform);
  world.register(Velocity);
  world.register(Collider);
  return world;
}

function createEntity(world, components) {
  const e = world.createEntity();
  for (const [cls, values] of components) {
    world.addComponent(e, cls);
    if (values) world.setComponent(e, cls, values);
  }
  return e;
}

// ─── AnimationClip ──────────────────────────────────
describe("AnimationClip", () => {
  it("creates a clip with frames and fps", () => {
    const clip = new AnimationClip({ frames: [0, 1, 2], fps: 10 });
    assert.ok(clip instanceof AnimationClip);
    assert.deepStrictEqual(clip.frames, [0, 1, 2]);
    assert.strictEqual(clip.fps, 10);
  });

  it("defaults loop to true", () => {
    const clip = new AnimationClip({ frames: [0], fps: 10 });
    assert.strictEqual(clip.loop, true);
  });

  it("accepts loop = false", () => {
    const clip = new AnimationClip({ frames: [0, 1], fps: 5, loop: false });
    assert.strictEqual(clip.loop, false);
  });

  it("frameCount returns correct value", () => {
    const clip = new AnimationClip({ frames: [0, 1, 2, 3], fps: 10 });
    assert.strictEqual(clip.frameCount, 4);
  });

  it("frameDuration returns 1/fps", () => {
    const clip = new AnimationClip({ frames: [0, 1], fps: 20 });
    assert.strictEqual(clip.frameDuration, 0.05);
  });

  it("duration returns frameCount / fps", () => {
    const clip = new AnimationClip({ frames: [0, 1, 2], fps: 10 });
    assert.strictEqual(clip.duration, 0.3);
  });

  it("is frozen (immutable)", () => {
    const clip = new AnimationClip({ frames: [0], fps: 10 });
    assert.ok(Object.isFrozen(clip));
  });

  it("frames array is frozen", () => {
    const clip = new AnimationClip({ frames: [0, 1], fps: 10 });
    assert.ok(Object.isFrozen(clip.frames));
  });

  it("rejects empty frames", () => {
    assert.throws(() => new AnimationClip({ frames: [], fps: 10 }), TypeError);
  });

  it("rejects non-array frames", () => {
    assert.throws(() => new AnimationClip({ frames: "abc", fps: 10 }), TypeError);
  });

  it("rejects missing fps", () => {
    assert.throws(() => new AnimationClip({ frames: [0] }), /fps/);
  });

  it("rejects zero fps", () => {
    assert.throws(() => new AnimationClip({ frames: [0], fps: 0 }), /fps/);
  });

  it("rejects negative fps", () => {
    assert.throws(() => new AnimationClip({ frames: [0], fps: -5 }), /fps/);
  });

  it("rejects Infinity fps", () => {
    assert.throws(() => new AnimationClip({ frames: [0], fps: Infinity }), /fps/);
  });

  it("rejects NaN fps", () => {
    assert.throws(() => new AnimationClip({ frames: [0], fps: NaN }), /fps/);
  });

  it("rejects non-boolean loop", () => {
    assert.throws(() => new AnimationClip({ frames: [0], fps: 10, loop: 1 }), /loop/);
  });

  it("rejects missing constructor argument", () => {
    assert.throws(() => new AnimationClip(), /frames/);
  });

  it("clip with many frames", () => {
    const frames = Array.from({ length: 100 }, (_, i) => i);
    const clip = new AnimationClip({ frames, fps: 30 });
    assert.strictEqual(clip.frameCount, 100);
  });

  it("getters return correct types", () => {
    const clip = new AnimationClip({ frames: [5, 10, 15], fps: 12 });
    assert.strictEqual(typeof clip.frames[0], "number");
    assert.strictEqual(typeof clip.fps, "number");
    assert.strictEqual(typeof clip.loop, "boolean");
    assert.strictEqual(typeof clip.frameCount, "number");
    assert.strictEqual(typeof clip.frameDuration, "number");
    assert.strictEqual(typeof clip.duration, "number");
  });
});

// ─── AnimationClipRegistry ──────────────────────────
describe("AnimationClipRegistry", () => {
  it("creates empty registry", () => {
    const reg = new AnimationClipRegistry();
    assert.strictEqual(reg.count, 0);
  });

  it("registers a clip", () => {
    const reg = new AnimationClipRegistry();
    const clip = new AnimationClip({ frames: [0, 1], fps: 10 });
    const id = reg.register("walk", clip);
    assert.strictEqual(typeof id, "number");
    assert.ok(id > 0);
    assert.strictEqual(reg.count, 1);
  });

  it("returns clip by name", () => {
    const reg = new AnimationClipRegistry();
    const clip = new AnimationClip({ frames: [0], fps: 10 });
    reg.register("idle", clip);
    assert.strictEqual(reg.get("idle"), clip);
  });

  it("returns clip by id", () => {
    const reg = new AnimationClipRegistry();
    const clip = new AnimationClip({ frames: [0], fps: 10 });
    const id = reg.register("run", clip);
    assert.strictEqual(reg.getById(id), clip);
  });

  it("returns id by name", () => {
    const reg = new AnimationClipRegistry();
    const clip = new AnimationClip({ frames: [0], fps: 10 });
    const id = reg.register("jump", clip);
    assert.strictEqual(reg.getId("jump"), id);
  });

  it("has returns true for registered name", () => {
    const reg = new AnimationClipRegistry();
    reg.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    assert.ok(reg.has("a"));
  });

  it("has returns false for unknown name", () => {
    const reg = new AnimationClipRegistry();
    assert.ok(!reg.has("nonexistent"));
  });

  it("get returns null for unknown name", () => {
    const reg = new AnimationClipRegistry();
    assert.strictEqual(reg.get("missing"), null);
  });

  it("getById returns null for unknown id", () => {
    const reg = new AnimationClipRegistry();
    assert.strictEqual(reg.getById(999), null);
  });

  it("rejects duplicate registration", () => {
    const reg = new AnimationClipRegistry();
    reg.register("dup", new AnimationClip({ frames: [0], fps: 10 }));
    assert.throws(() => reg.register("dup", new AnimationClip({ frames: [1], fps: 5 })), /already registered/);
  });

  it("rejects empty string name", () => {
    const reg = new AnimationClipRegistry();
    assert.throws(() => reg.register("", new AnimationClip({ frames: [0], fps: 10 })), /non-empty string/);
  });

  it("rejects non-string name", () => {
    const reg = new AnimationClipRegistry();
    assert.throws(() => reg.register(42, new AnimationClip({ frames: [0], fps: 10 })), /non-empty string/);
  });

  it("removes a clip by name", () => {
    const reg = new AnimationClipRegistry();
    reg.register("x", new AnimationClip({ frames: [0], fps: 10 }));
    const result = reg.remove("x");
    assert.ok(result);
    assert.strictEqual(reg.count, 0);
    assert.strictEqual(reg.get("x"), null);
  });

  it("remove returns false for unknown name", () => {
    const reg = new AnimationClipRegistry();
    assert.ok(!reg.remove("nope"));
  });

  it("clears all clips", () => {
    const reg = new AnimationClipRegistry();
    reg.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    reg.register("b", new AnimationClip({ frames: [1], fps: 5 }));
    reg.clear();
    assert.strictEqual(reg.count, 0);
    assert.strictEqual(reg.get("a"), null);
    assert.strictEqual(reg.get("b"), null);
  });

  it("multiple registries are independent", () => {
    const r1 = new AnimationClipRegistry();
    const r2 = new AnimationClipRegistry();
    r1.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    assert.strictEqual(r1.count, 1);
    assert.strictEqual(r2.count, 0);
  });

  it("count increases with each registration", () => {
    const reg = new AnimationClipRegistry();
    reg.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    reg.register("b", new AnimationClip({ frames: [0], fps: 10 }));
    reg.register("c", new AnimationClip({ frames: [0], fps: 10 }));
    assert.strictEqual(reg.count, 3);
  });

  it("IDs are sequential", () => {
    const reg = new AnimationClipRegistry();
    const id1 = reg.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    const id2 = reg.register("b", new AnimationClip({ frames: [0], fps: 10 }));
    assert.strictEqual(id2, id1 + 1);
  });
});

// ─── Animation Component ────────────────────────────
describe("Animation component", () => {
  it("has schema with clipId, frameIndex, elapsed, isPlaying, speed", () => {
    const schema = Animation.schema;
    assert.strictEqual(schema.clipId, "u16");
    assert.strictEqual(schema.frameIndex, "u32");
    assert.strictEqual(schema.elapsed, "f32");
    assert.strictEqual(schema.isPlaying, "u8");
    assert.strictEqual(schema.speed, "f32");
  });

  it("fields zero-initialized on add", () => {
    const world = createWorld();
    const e = createEntity(world, [[Animation]]);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.clipId, 0);
    assert.strictEqual(a.frameIndex, 0);
    assert.strictEqual(a.elapsed, 0);
    assert.strictEqual(a.isPlaying, 0);
    assert.strictEqual(a.speed, 0);
  });

  it("isPlaying can be set to 1", () => {
    const world = createWorld();
    const e = createEntity(world, [[Animation, { isPlaying: 1, speed: 1 }]]);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.isPlaying, 1);
  });

  it("clipId can be set", () => {
    const world = createWorld();
    const e = createEntity(world, [[Animation, { clipId: 5 }]]);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.clipId, 5);
  });

  it("frameIndex can be set and read back", () => {
    const world = createWorld();
    const e = createEntity(world, [[Animation, { frameIndex: 3 }]]);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 3);
  });
});

// ─── Renderable Component ───────────────────────────
describe("Renderable component", () => {
  it("has schema with image", () => {
    assert.strictEqual(Renderable.schema.image, "u16");
  });

  it("image zero-initialized", () => {
    const world = createWorld();
    const e = createEntity(world, [[Renderable]]);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(r.image, 0);
  });

  it("image can be set", () => {
    const world = createWorld();
    const e = createEntity(world, [[Renderable, { image: 42 }]]);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(r.image, 42);
  });
});

// ─── AnimationSystem — Basic ────────────────────────
describe("AnimationSystem — basic", () => {
  it("extends System", () => {
    const sys = new AnimationSystem();
    assert.ok(sys instanceof System);
  });

  it("is enabled by default", () => {
    const sys = new AnimationSystem();
    assert.strictEqual(sys.enabled, true);
  });

  it("has static query requiring Animation and Renderable", () => {
    const q = AnimationSystem.query;
    assert.ok(q.all.includes(Animation));
    assert.ok(q.all.includes(Renderable));
    assert.strictEqual(q.all.length, 2);
  });

  it("has priority 1 (after Movement)", () => {
    assert.strictEqual(AnimationSystem.priority, 1);
  });

  it("throws descriptive error when registry is missing", () => {
    const world = createWorld();
    world.addSystem(new AnimationSystem());
    createEntity(world, [[Animation, { isPlaying: 1, speed: 1 }], [Renderable]]);
    assert.throws(() => world.update(16), /AnimationClipRegistry resource is not set/);
  });

  it("runs successfully when registry is set", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("idle", new AnimationClip({ frames: [10], fps: 10 }));
    const id = registry.getId("idle");
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    createEntity(world, [[Animation, { clipId: id, isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(16);
  });

  it("compiledIds contain Animation and Renderable", () => {
    const world = createWorld();
    const sys = new AnimationSystem();
    world.addSystem(sys);
    assert.ok(sys._compiled.componentIds.has(Animation));
    assert.ok(sys._compiled.componentIds.has(Renderable));
  });

  it("scheduler runs system", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("idle", new AnimationClip({ frames: [0], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    let ran = false;
    class Spy extends AnimationSystem {
      update(ctx, dt) { ran = true; }
    }
    world.addSystem(new Spy());
    world.update(16);
    assert.ok(ran);
  });
});

// ─── AnimationSystem — Frame Advancement ─────────────
describe("AnimationSystem — frame advancement", () => {
  function setup(fps, frames, loop) {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("clip", new AnimationClip({ frames, fps, loop }));
    const clipId = registry.getId("clip");
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId, isPlaying: 1, speed: 1 }], [Renderable]]);
    return { world, e, registry, clipId };
  }

  it("advances to frame 1 after one frame duration", () => {
    const { world, e } = setup(10, [5, 10]);
    world.update(0.1);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 1);
  });

  it("advances to frame 2 after two frame durations", () => {
    const { world, e } = setup(10, [5, 10, 15]);
    world.update(0.2);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 2);
  });

  it("stays at frame 0 with zero dt", () => {
    const { world, e } = setup(10, [5, 10]);
    world.update(0);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 0);
  });

  it("advances with fractional dt", () => {
    const { world, e } = setup(10, [1, 2, 3]);
    world.update(0.15);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 1);
  });

  it("advances multiple frames with large dt", () => {
    const { world, e } = setup(10, [10, 20, 30, 40, 50], false);
    world.update(0.4);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 4);
  });

  it("accumulates elapsed time across frames", () => {
    const { world, e } = setup(10, [1, 2]);
    world.update(0.05);
    world.update(0.05);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 1);
  });

  it("stays at frame 0 when not playing", () => {
    const { world, e } = setup(10, [5, 10]);
    world.setComponent(e, Animation, { isPlaying: 0 });
    world.update(0.5);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 0);
  });

  it("resumes playing when re-enabled", () => {
    const { world, e } = setup(10, [1, 2]);
    world.setComponent(e, Animation, { isPlaying: 0 });
    world.update(0.1);
    world.setComponent(e, Animation, { isPlaying: 1, speed: 1 });
    world.update(0.1);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 1);
  });

  it("frameIndex resets when clip loops", () => {
    const { world, e } = setup(10, [1, 2, 3], true);
    world.update(0.3);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 0);
  });

  it("non-looping clip stops at last frame", () => {
    const { world, e } = setup(10, [1, 2], false);
    world.update(0.3);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 1);
  });

  it("non-looping clip holds last frame on large dt", () => {
    const { world, e } = setup(10, [1, 2, 3], false);
    world.update(10);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 2);
  });

  it("looping clip wraps around multiple times", () => {
    const { world, e } = setup(10, [1, 2], true);
    world.update(0.5);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 1);
  });

  it("exact boundary lands on correct frame", () => {
    const { world, e } = setup(10, [1, 2, 3], true);
    world.update(0.2);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 2);
  });
});

// ─── AnimationSystem — Cross-Component Writes ───────
describe("AnimationSystem — cross-component writes", () => {
  function setup(fps, frames, loop) {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("clip", new AnimationClip({ frames, fps, loop }));
    const clipId = registry.getId("clip");
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId, isPlaying: 1, speed: 1 }], [Renderable]]);
    return { world, e, registry };
  }

  it("sets image to first frame value", () => {
    const { world, e } = setup(10, [42, 99]);
    world.update(0.0);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(r.image, 42);
  });

  it("updates image when frame advances", () => {
    const { world, e } = setup(10, [5, 10]);
    world.update(0.1);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(r.image, 10);
  });

  it("image cycles on looping clip", () => {
    const { world, e } = setup(10, [1, 2], true);
    world.update(0.2);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(r.image, 1);
  });

  it("image holds on non-looping clip", () => {
    const { world, e } = setup(10, [3, 7], false);
    world.update(0.2);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(r.image, 7);
  });

  it("no stale frame after multiple updates", () => {
    const { world, e } = setup(10, [10, 20, 30], true);
    world.update(0.1);
    world.update(0.1);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(r.image, 30);
  });

  it("image is u16 typed", () => {
    const { world, e } = setup(10, [1, 2]);
    world.update(0.1);
    const r = world.getComponent(e, Renderable);
    assert.strictEqual(typeof r.image, "number");
  });
});

// ─── AnimationSystem — Registry Integration ─────────
describe("AnimationSystem — registry integration", () => {
  it("looks up clip by numeric id from component", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [100], fps: 10 }));
    const id = registry.getId("a");
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: id, isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Renderable).image, 100);
  });

  it("multiple entities with different clips", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("walk", new AnimationClip({ frames: [10, 20], fps: 10 }));
    registry.register("run", new AnimationClip({ frames: [30, 40], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e1 = createEntity(world, [[Animation, { clipId: registry.getId("walk"), isPlaying: 1, speed: 1 }], [Renderable]]);
    const e2 = createEntity(world, [[Animation, { clipId: registry.getId("run"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e1, Renderable).image, 20);
    assert.strictEqual(world.getComponent(e2, Renderable).image, 40);
  });

  it("unknown clipId is skipped (no crash)", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    createEntity(world, [[Animation, { clipId: 999, isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(16);
  });

  it("registry can be replaced between frames", () => {
    const world = createWorld();
    const r1 = new AnimationClipRegistry();
    r1.register("idle", new AnimationClip({ frames: [1], fps: 10 }));
    world.setResource(AnimationClipRegistry, r1);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: r1.getId("idle"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Renderable).image, 1);
    const r2 = new AnimationClipRegistry();
    r2.register("idle", new AnimationClip({ frames: [99], fps: 10 }));
    world.setResource(AnimationClipRegistry, r2);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Renderable).image, 99);
  });

  it("multiple worlds have independent registries", () => {
    const w1 = createWorld();
    const w2 = createWorld();
    const reg1 = new AnimationClipRegistry();
    reg1.register("a", new AnimationClip({ frames: [10], fps: 10 }));
    const reg2 = new AnimationClipRegistry();
    reg2.register("a", new AnimationClip({ frames: [99], fps: 10 }));
    w1.setResource(AnimationClipRegistry, reg1);
    w2.setResource(AnimationClipRegistry, reg2);
    w1.addSystem(new AnimationSystem());
    w2.addSystem(new AnimationSystem());
    const e1 = createEntity(w1, [[Animation, { clipId: reg1.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    const e2 = createEntity(w2, [[Animation, { clipId: reg2.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    w1.update(0.1);
    w2.update(0.1);
    assert.strictEqual(w1.getComponent(e1, Renderable).image, 10);
    assert.strictEqual(w2.getComponent(e2, Renderable).image, 99);
  });
});

// ─── AnimationSystem — Scheduler Integration ────────
describe("AnimationSystem — scheduler integration", () => {
  it("runs after MovementSystem", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    const order = [];
    class TrackSystem extends System {
      static priority = -1;
      update(ctx, dt) { order.push("pre"); }
    }
    world.addSystem(new TrackSystem());
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(16);
    assert.ok(order.includes("pre"));
  });

  it("works with multiple archetypes", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [10, 20], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e1 = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    const e2 = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable, { image: 0 }], [Collider]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e1, Renderable).image, 20);
    assert.strictEqual(world.getComponent(e2, Renderable).image, 20);
  });
});

// ─── Edge Cases ─────────────────────────────────────
describe("AnimationSystem — edge cases", () => {
  it("disabled system does not advance animations", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    const sys = new AnimationSystem();
    sys.enabled = false;
    world.addSystem(sys);
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 0);
  });

  it("re-enabling system resumes advancement", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    const sys = new AnimationSystem();
    world.addSystem(sys);
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    sys.enabled = false;
    world.update(0.1);
    sys.enabled = true;
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 1);
  });

  it("entity without Renderable is not processed", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = world.createEntity();
    world.addComponent(e, Animation);
    world.setComponent(e, Animation, { isPlaying: 1, speed: 1 });
    let count = 0;
    class Spy extends AnimationSystem {
      update(ctx, dt) { count = ctx.entityCount; }
    }
    world.addSystem(new Spy());
    world.update(16);
    assert.strictEqual(count, 0);
  });

  it("entity without Animation is not processed", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    createEntity(world, [[Renderable]]);
    let count = 0;
    class Spy extends AnimationSystem {
      update(ctx, dt) { count = ctx.entityCount; }
    }
    world.addSystem(new Spy());
    world.update(16);
    assert.strictEqual(count, 0);
  });

  it("destroyed entity does not cause errors", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.destroyEntity(e);
    world.update(16);
  });

  it("add/remove Animation between frames", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Renderable]]);
    world.update(0.1);
    world.addComponent(e, Animation);
    world.setComponent(e, Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 });
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 1);
  });

  it("archetype migration preserves animation state", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(0.1);
    world.addComponent(e, Collider);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 0);
  });

  it("empty world does not crash", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    world.update(16);
  });
});

// ─── Performance / Zero Allocation ──────────────────
describe("AnimationSystem — performance", () => {
  it("does not use ctx.column() in update", () => {
    const src = AnimationSystem.prototype.update.toString();
    assert.ok(!src.includes("ctx.column("));
  });

  it("uses canonical table iteration", () => {
    const src = AnimationSystem.prototype.update.toString();
    assert.ok(src.includes("for (const table of ctx)"));
  });

  it("uses table.getColumn for column access", () => {
    const src = AnimationSystem.prototype.update.toString();
    assert.ok(src.includes("table.getColumn("));
  });

  it("does not add properties to system during update", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    const sys = new AnimationSystem();
    world.addSystem(sys);
    createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    const before = Object.keys(sys);
    world.update(16);
    world.update(16);
    const after = Object.keys(sys);
    assert.deepStrictEqual(after, before);
  });

  it("processes many entities", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2, 3], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const es = [];
    for (let i = 0; i < 100; i++) {
      es.push(createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]));
    }
    world.update(0.15);
    for (const e of es) {
      assert.strictEqual(world.getComponent(e, Animation).frameIndex, 1);
    }
  });

  it("uses compiled component IDs", () => {
    const world = createWorld();
    const sys = new AnimationSystem();
    world.addSystem(sys);
    assert.ok(sys._compiled.componentIds.has(Animation));
    assert.ok(sys._compiled.componentIds.has(Renderable));
  });

  it("update is deterministic", () => {
    const run = () => {
      const world = createWorld();
      const registry = new AnimationClipRegistry();
      registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
      world.setResource(AnimationClipRegistry, registry);
      world.addSystem(new AnimationSystem());
      const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
      world.update(0.05);
      world.update(0.05);
      world.update(0.1);
      return world.getComponent(e, Renderable).image;
    };
    assert.strictEqual(run(), run());
  });
});

// ─── Export Surface ─────────────────────────────────
describe("export surface", () => {
  it("exports AnimationSystem from ecs/index", () => {
    assert.strictEqual(AnimationSystem.name, "AnimationSystem");
  });

  it("exports AnimationClip from ecs/index", () => {
    assert.strictEqual(AnimationClip.name, "AnimationClip");
  });

  it("exports AnimationClipRegistry from ecs/index", () => {
    assert.strictEqual(AnimationClipRegistry.name, "AnimationClipRegistry");
  });

  it("all exports are constructible from ecs/index barrel", () => {
    assert.strictEqual(typeof AnimationSystem, "function");
    assert.strictEqual(typeof AnimationClip, "function");
    assert.strictEqual(typeof AnimationClipRegistry, "function");
  });
});

// ─── Additional AnimationClip Edge Cases ─────────────
describe("AnimationClip — additional edge cases", () => {
  it("1-frame clip", () => {
    const clip = new AnimationClip({ frames: [5], fps: 10 });
    assert.strictEqual(clip.frameCount, 1);
    assert.strictEqual(clip.duration, 0.1);
  });

  it("high fps clip", () => {
    const clip = new AnimationClip({ frames: [0, 1], fps: 60 });
    assert.strictEqual(clip.frameDuration, 1 / 60);
  });

  it("low fps clip", () => {
    const clip = new AnimationClip({ frames: [0, 1, 2], fps: 1 });
    assert.strictEqual(clip.frameDuration, 1);
    assert.strictEqual(clip.duration, 3);
  });

  it("frames array is not extensible", () => {
    const clip = new AnimationClip({ frames: [1, 2], fps: 10 });
    assert.ok(Object.isFrozen(clip.frames));
  });

  it("fps is stored as a number", () => {
    const clip = new AnimationClip({ frames: [0], fps: 30 });
    assert.strictEqual(clip.fps, 30);
  });
});

// ─── Additional Registry Edge Cases ──────────────────
describe("AnimationClipRegistry — additional edge cases", () => {
  it("remove unknown name returns false", () => {
    const reg = new AnimationClipRegistry();
    assert.strictEqual(reg.remove("nope"), false);
  });

  it("clear after remove works", () => {
    const reg = new AnimationClipRegistry();
    reg.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    reg.remove("a");
    reg.clear();
    assert.strictEqual(reg.count, 0);
  });

  it("getById after remove returns null", () => {
    const reg = new AnimationClipRegistry();
    const id = reg.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    reg.remove("a");
    assert.strictEqual(reg.getById(id), null);
  });

  it("getId after remove returns null", () => {
    const reg = new AnimationClipRegistry();
    reg.register("a", new AnimationClip({ frames: [0], fps: 10 }));
    reg.remove("a");
    assert.strictEqual(reg.getId("a"), null);
  });
});

// ─── Additional AnimationSystem Tests ───────────────
describe("AnimationSystem — additional", () => {
  function setup(fps, frames, loop) {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("clip", new AnimationClip({ frames, fps, loop }));
    const clipId = registry.getId("clip");
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId, isPlaying: 1, speed: 1 }], [Renderable]]);
    return { world, e, registry, clipId };
  }

  it("entity starting at non-zero frame continues from there", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2, 3], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1, frameIndex: 1, elapsed: 0.1 }], [Renderable]]);
    world.update(0.15);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 2);
  });

  it("multiple entities with mixed isPlaying states", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const id = registry.getId("a");
    const e1 = createEntity(world, [[Animation, { clipId: id, isPlaying: 1, speed: 1 }], [Renderable]]);
    const e2 = createEntity(world, [[Animation, { clipId: id, isPlaying: 0 }], [Renderable]]);
    world.update(0.15);
    assert.strictEqual(world.getComponent(e1, Animation).frameIndex, 1);
    assert.strictEqual(world.getComponent(e2, Animation).frameIndex, 0);
  });

  it("system remove/re-add does not break animation", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    const sys = new AnimationSystem();
    world.addSystem(sys);
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 1);
    world.removeSystem(sys);
    world.update(0.1);
    world.addSystem(sys);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 0);
  });

  it("resource removal between frames causes error", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(16);
    world.removeResource(AnimationClipRegistry);
    assert.throws(() => world.update(16), /AnimationClipRegistry resource is not set/);
  });

  it("exact frame boundary with non-looping", () => {
    const { world, e } = setup(10, [1, 2, 3], false);
    world.update(0.2);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 2);
  });

  it("dt exactly at clip duration with looping wraps", () => {
    const { world, e } = setup(10, [1, 2, 3], true);
    world.update(0.3);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 0);
  });

  it("dt exactly at clip duration with non-looping stops at last", () => {
    const { world, e } = setup(10, [1, 2, 3], false);
    world.update(0.3);
    const a = world.getComponent(e, Animation);
    assert.strictEqual(a.frameIndex, 2);
  });

  it("multiple archetypes with different clips", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [10, 20], fps: 10 }));
    registry.register("b", new AnimationClip({ frames: [30, 40], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e1 = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]);
    const e2 = createEntity(world, [[Animation, { clipId: registry.getId("b"), isPlaying: 1, speed: 1 }], [Renderable, { image: 0 }], [Collider]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e1, Renderable).image, 20);
    assert.strictEqual(world.getComponent(e2, Renderable).image, 40);
  });

  it("entity with zero dt does not advance", () => {
    const { world, e } = setup(10, [1, 2], true);
    world.update(0);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 0);
  });

  it("entity with negative dt does not crash", () => {
    const { world, e } = setup(10, [1, 2], true);
    world.update(-0.1);
  });

  it("very large dt does not crash on looping clip", () => {
    const { world, e } = setup(10, [1, 2], true);
    world.update(100000);
    const a = world.getComponent(e, Animation);
    assert.ok(typeof a.frameIndex === "number");
  });

  it("clipId column holds u16 values", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: 65535, isPlaying: 1, speed: 1 }], [Renderable]]);
    world.update(0.1);
    assert.strictEqual(world.getComponent(e, Animation).clipId, 65535);
  });

  it("accessing ctx.resources.get with unknown key returns undefined", () => {
    const world = createWorld();
    let result;
    class TestSystem extends System {
      update(ctx, dt) { result = ctx.resources.get("nonexistent"); }
    }
    world.addSystem(new TestSystem());
    world.update(16);
    assert.strictEqual(result, undefined);
  });

  it("ctx.resources.has works for registered resources", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    world.setResource(AnimationClipRegistry, registry);
    let has;
    class TestSystem extends System {
      update(ctx, dt) { has = ctx.resources.has(AnimationClipRegistry); }
    }
    world.addSystem(new TestSystem());
    world.update(16);
    assert.ok(has);
  });

  it("speed=0 prevents frame advancement", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    world.addSystem(new AnimationSystem());
    const e = createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 0 }], [Renderable]]);
    world.update(0.5);
    assert.strictEqual(world.getComponent(e, Animation).frameIndex, 0);
  });

  it("AnimationSystem does not allocate per entity", () => {
    const world = createWorld();
    const registry = new AnimationClipRegistry();
    registry.register("a", new AnimationClip({ frames: [1, 2], fps: 10 }));
    world.setResource(AnimationClipRegistry, registry);
    const sys = new AnimationSystem();
    world.addSystem(sys);
    const es = [];
    for (let i = 0; i < 100; i++) {
      es.push(createEntity(world, [[Animation, { clipId: registry.getId("a"), isPlaying: 1, speed: 1 }], [Renderable]]));
    }
    const beforeKeys = Object.keys(sys);
    world.update(16);
    world.update(16);
    const afterKeys = Object.keys(sys);
    assert.deepStrictEqual(afterKeys, beforeKeys);
  });
});
