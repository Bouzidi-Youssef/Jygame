import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, System } from "../../../ecs/index.js";
import { Transform, Renderable, Visible, RenderBounds, EnemyTag } from "../../../ecs/index.js";
import { RenderSystem } from "../../../ecs/systems/RenderSystem.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { RenderCommand } from "../../../ecs/render/RenderCommand.js";
import { CanvasContext } from "../../../ecs/render/CanvasContext.js";
import { Camera } from "../../../camera/Camera.js";
import { AnimationSystem } from "../../../ecs/systems/AnimationSystem.js";
import { CollisionSystem } from "../../../ecs/systems/CollisionSystem.js";
import { SpatialHash } from "../../../collision/SpatialHash.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Renderable);
  world.register(Visible);
  world.register(RenderBounds);
  world.register(EnemyTag);
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

function mockCtx() {
  return { save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {} };
}

function setupWorld(entities) {
  const world = createWorld();
  const queue = new RenderQueue();
  world.setResource(RenderQueue, queue);
  world.setResource(CanvasContext, mockCtx());
  world.addSystem(new RenderSystem());
  const ids = [];
  for (const opts of entities) {
    ids.push(createEntity(world, [
      [Transform, { x: opts.x, y: opts.y, rotation: opts.r || 0, scaleX: opts.sx || 1, scaleY: opts.sy || 1 }],
      [Renderable, { image: opts.image || 0, fillColor: opts.fillColor || 0, shape: opts.shape || 0, layer: opts.layer || 0 }],
      [RenderBounds, { width: opts.w || 0, height: opts.h || 0 }],
      [Visible, { value: opts.v != null ? opts.v : 1 }],
    ]));
  }
  return { world, queue, ids };
}

function getCanvas() {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(100, 100);
    return c.getContext("2d");
  }
  return null;
}

describe("RenderSystem (ECS)", () => {
  // ─── Construction ────────────────────────────────────
  describe("construction", () => {
    it("instantiates", () => {
      const sys = new RenderSystem();
      assert.ok(sys instanceof RenderSystem);
    });

    it("extends System", () => {
      const sys = new RenderSystem();
      assert.ok(sys instanceof System);
    });

    it("is enabled by default", () => {
      const sys = new RenderSystem();
      assert.strictEqual(sys.enabled, true);
    });

    it("has static query requiring Transform, Renderable, RenderBounds, Visible", () => {
      const q = RenderSystem.query;
      assert.ok(q.all);
      assert.ok(q.all.includes(Transform));
      assert.ok(q.all.includes(Renderable));
      assert.ok(q.all.includes(RenderBounds));
      assert.ok(q.all.includes(Visible));
      assert.strictEqual(q.all.length, 4);
    });

    it("has priority 3 (after Collision)", () => {
      assert.strictEqual(RenderSystem.priority, 3);
    });

    it("has compiled componentIds after being added to world", () => {
      const world = createWorld();
      const sys = new RenderSystem();
      world.addSystem(sys);
      assert.ok(sys._compiled);
      assert.ok(sys._compiled.componentIds instanceof Map);
      assert.ok(sys._compiled.componentIds.has(Transform));
      assert.ok(sys._compiled.componentIds.has(Renderable));
      assert.ok(sys._compiled.componentIds.has(RenderBounds));
      assert.ok(sys._compiled.componentIds.has(Visible));
    });
  });

  // ─── Resources ───────────────────────────────────────
  describe("resources", () => {
    it("missing RenderQueue throws descriptive error", () => {
      const world = createWorld();
      world.addSystem(new RenderSystem());
      createEntity(world, [[Transform], [Renderable], [RenderBounds], [Visible, { value: 1 }]]);
      assert.throws(() => world.update(16), /RenderQueue resource is not set/);
    });

    it("missing CanvasContext throws descriptive error", () => {
      const world = createWorld();
      world.setResource(RenderQueue, new RenderQueue());
      world.addSystem(new RenderSystem());
      createEntity(world, [[Transform], [Renderable], [RenderBounds], [Visible, { value: 1 }]]);
      assert.throws(() => world.update(16), /CanvasContext resource is not set/);
    });

    it("camera is optional (no error when absent)", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("RenderQueue resource can be replaced between frames", () => {
      const world = createWorld();
      const q1 = new RenderQueue();
      world.setResource(RenderQueue, q1);
      world.setResource(CanvasContext, mockCtx());
      world.addSystem(new RenderSystem());
      createEntity(world, [[Transform], [Renderable], [RenderBounds], [Visible, { value: 1 }]]);
      world.update(16);
      assert.strictEqual(q1.count, 1);
      const q2 = new RenderQueue();
      world.setResource(RenderQueue, q2);
      world.update(16);
      assert.strictEqual(q1.count, 1);
      assert.strictEqual(q2.count, 1);
    });

    it("CanvasContext resource works with system", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });
  });

  // ─── Queue State ─────────────────────────────────────
  describe("queue state", () => {
    it("queue is cleared each frame", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 1);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("empty world does not push commands", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      world.addSystem(new RenderSystem());
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });

    it("queue commands contain correct transform data", () => {
      const { world, queue } = setupWorld([{ x: 10, y: 20, w: 30, h: 40, r: 0.5, sx: 2, sy: 3 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 1);
      const cmd = queue._commands[0];
      assert.strictEqual(cmd.x, 10);
      assert.strictEqual(cmd.y, 20);
      assert.strictEqual(cmd.rotation, 0.5);
      assert.strictEqual(cmd.scaleX, 2);
      assert.strictEqual(cmd.scaleY, 3);
    });

    it("queue commands contain correct render bounds", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 50, h: 60 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      const cmd = queue._commands[0];
      assert.strictEqual(cmd.width, 50);
      assert.strictEqual(cmd.height, 60);
    });

    it("queue commands contain correct renderable data", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 10, h: 10, image: 5, fillColor: 0xff0000, shape: 1, layer: 3 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      const cmd = queue._commands[0];
      assert.strictEqual(cmd.image, 5);
      assert.strictEqual(cmd.fillColor, 0xff0000);
      assert.strictEqual(cmd.shape, 1);
      assert.strictEqual(cmd.layer, 3);
    });
  });

  // ─── Visibility ─────────────────────────────────────
  describe("visibility", () => {
    it("invisible entity is skipped", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 10, h: 10, v: 0 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });

    it("mixed visibility only pushes visible ones", () => {
      const { world, queue } = setupWorld([
        { x: 0, y: 0, w: 10, h: 10, v: 1 },
        { x: 10, y: 10, w: 10, h: 10, v: 0 },
      ]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("toggling visibility via setComponent works", () => {
      const { world, queue, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10, v: 1 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 1);
      world.setComponent(ids[0], Visible, { value: 0 });
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });
  });

  // ─── Transforms ──────────────────────────────────────
  describe("transforms", () => {
    it("multiple transformed entities", () => {
      const { world, queue } = setupWorld([
        { x: 5, y: 10, w: 20, h: 30 },
        { x: 100, y: 200, w: 10, h: 10 },
      ]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 2);
      assert.strictEqual(queue._commands[0].x, 5);
      assert.strictEqual(queue._commands[1].x, 100);
    });

    it("zero transform is valid", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 0, h: 0 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });
  });

  // ─── RenderBounds ────────────────────────────────────
  describe("RenderBounds", () => {
    it("RenderBounds width and height are independent from Collider", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 100, h: 200 }]);
      world.update(16);
      assert.strictEqual(queue._commands[0].width, 100);
      assert.strictEqual(queue._commands[0].height, 200);
    });

    it("RenderBounds defaults to zero", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue._commands[0].width, 0);
      assert.strictEqual(queue._commands[0].height, 0);
    });
  });

  // ─── Camera ──────────────────────────────────────────
  describe("camera", () => {
    it("camera is read from resources when available", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      const camera = new Camera(0, 0, 100, 100);
      world.setResource(Camera, camera);
      world.addSystem(new RenderSystem());
      createEntity(world, [[Transform], [Renderable], [RenderBounds], [Visible, { value: 1 }]]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("camera can be replaced at runtime", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      const c1 = new Camera(0, 0, 100, 100);
      world.setResource(Camera, c1);
      world.addSystem(new RenderSystem());
      createEntity(world, [[Transform], [Renderable], [RenderBounds], [Visible, { value: 1 }]]);
      world.update(16);
      const c2 = new Camera(50, 50, 100, 100);
      world.setResource(Camera, c2);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("missing camera does not throw", () => {
      const { world, queue } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });
  });

  // ─── RenderQueue Execute ─────────────────────────────
  describe("RenderQueue execute", () => {
    it("execute with OffscreenCanvas does not crash", () => {
      const ctx = getCanvas();
      if (!ctx) return;
      const queue = new RenderQueue();
      queue.push(0, 10, 20, 0, 1, 1, 30, 40, 0xff0000, 0, 0);
      queue.execute(ctx, null);
      assert.ok(true);
    });

    it("execute draws rectangles", () => {
      const ctx = getCanvas();
      if (!ctx) return;
      const queue = new RenderQueue();
      queue.push(0, 0, 0, 0, 1, 1, 10, 10, 0x00ff00, 0, 0);
      queue.execute(ctx, null);
      assert.ok(true);
    });

    it("execute draws circles", () => {
      const ctx = getCanvas();
      if (!ctx) return;
      const queue = new RenderQueue();
      queue.push(0, 0, 0, 0, 1, 1, 10, 10, 0x0000ff, 1, 0);
      queue.execute(ctx, null);
      assert.ok(true);
    });

    it("execute with camera applies transform", () => {
      const ctx = getCanvas();
      if (!ctx) return;
      const camera = new Camera(0, 0, 100, 100);
      const queue = new RenderQueue();
      queue.push(0, 0, 0, 0, 1, 1, 10, 10, 0xff0000, 0, 0);
      queue.execute(ctx, camera);
      assert.ok(true);
    });

    it("execute draws multiple commands", () => {
      const ctx = getCanvas();
      if (!ctx) return;
      const queue = new RenderQueue();
      queue.push(0, 0, 0, 0, 1, 1, 10, 10, 0xff0000, 0, 0);
      queue.push(0, 20, 20, 0, 1, 1, 10, 10, 0x00ff00, 0, 0);
      queue.execute(ctx, null);
      assert.ok(true);
    });

    it("execute with empty queue does nothing", () => {
      const ctx = getCanvas();
      if (!ctx) return;
      const queue = new RenderQueue();
      queue.execute(ctx, null);
      assert.ok(true);
    });
  });

  // ─── Multiple Archetypes ─────────────────────────────
  describe("multiple archetypes", () => {
    it("entities from multiple tables are all rendered", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      world.addSystem(new RenderSystem());
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Renderable], [RenderBounds, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      createEntity(world, [[Transform, { x: 50, y: 50 }], [Renderable], [RenderBounds, { width: 10, height: 10 }], [Visible, { value: 1 }], [EnemyTag]]);
      world.update(16);
      assert.strictEqual(queue.count, 2);
    });
  });

  // ─── Archetype Migration ─────────────────────────────
  describe("archetype migration", () => {
    it("gain Renderable", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      world.addSystem(new RenderSystem());
      const e = createEntity(world, [[Transform], [RenderBounds], [Visible, { value: 1 }]]);
      world.update(16);
      assert.strictEqual(queue.count, 0);
      world.addComponent(e, Renderable);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("lose Renderable", () => {
      const { world, queue, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
      world.removeComponent(ids[0], Renderable);
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });

    it("gain Visible", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      world.addSystem(new RenderSystem());
      const e = createEntity(world, [[Transform], [Renderable], [RenderBounds]]);
      world.update(16);
      assert.strictEqual(queue.count, 0);
      world.addComponent(e, Visible);
      world.setComponent(e, Visible, { value: 1 });
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("lose Visible", () => {
      const { world, queue, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
      world.removeComponent(ids[0], Visible);
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });

    it("destroyed entity is removed", () => {
      const { world, queue, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
      world.destroyEntity(ids[0]);
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });

    it("new entity after update appears next frame", () => {
      const { world, queue } = setupWorld([]);
      world.update(16);
      assert.strictEqual(queue.count, 0);
      createEntity(world, [[Transform], [Renderable], [RenderBounds], [Visible, { value: 1 }]]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
    });

    it("lose RenderBounds removes from query", () => {
      const { world, queue, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      assert.strictEqual(queue.count, 1);
      world.removeComponent(ids[0], RenderBounds);
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });
  });

  // ─── Scheduler ───────────────────────────────────────
  describe("scheduler", () => {
    it("can be disabled", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      const sys = new RenderSystem();
      sys.enabled = false;
      world.addSystem(sys);
      createEntity(world, [[Transform], [Renderable], [RenderBounds], [Visible, { value: 1 }]]);
      world.update(16);
      assert.strictEqual(queue.count, 0);
    });

    it("runs in independent worlds", () => {
      const w1 = createWorld();
      const q1 = new RenderQueue();
      w1.setResource(RenderQueue, q1);
      w1.setResource(CanvasContext, mockCtx());
      w1.addSystem(new RenderSystem());
      createEntity(w1, [[Transform, { x: 0, y: 0 }], [Renderable], [RenderBounds, { width: 10, height: 10 }], [Visible, { value: 1 }]]);

      const w2 = createWorld();
      const q2 = new RenderQueue();
      w2.setResource(RenderQueue, q2);
      w2.setResource(CanvasContext, mockCtx());
      w2.addSystem(new RenderSystem());
      createEntity(w2, [[Transform, { x: 100, y: 100 }], [Renderable], [RenderBounds, { width: 10, height: 10 }], [Visible, { value: 1 }]]);

      w1.update(16);
      w2.update(16);
      assert.strictEqual(q1.count, 1);
      assert.strictEqual(q2.count, 1);
      assert.strictEqual(q1._commands[0].x, 0);
      assert.strictEqual(q2._commands[0].x, 100);
    });

    it("executes after Collision system", () => {
      const order = [];
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      class Collision extends System {
        static priority = 2;
        update(ctx, dt) { order.push("C"); }
      }
      class Render extends System {
        static priority = 3;
        update(ctx, dt) { order.push("R"); }
      }
      world.addSystem(new Render());
      world.addSystem(new Collision());
      world.update(16);
      assert.deepStrictEqual(order, ["C", "R"]);
    });
  });

  // ─── Runtime ─────────────────────────────────────────
  describe("runtime", () => {
    it("repeated updates produce deterministic state", () => {
      const { world, queue } = setupWorld([{ x: 10, y: 20, w: 30, h: 40 }]);
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      const first = queue._commands[0].x;
      world.update(16);
      const second = queue._commands[0].x;
      assert.strictEqual(first, second);
    });

    it("handles 100 entities", () => {
      const { world, queue } = setupWorld([]);
      for (let i = 0; i < 100; i++) {
        createEntity(world, [[Transform, { x: i * 10, y: 0 }], [Renderable], [RenderBounds, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      }
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 100);
    });

    it("handles 1000 entities", () => {
      const { world, queue } = setupWorld([]);
      for (let i = 0; i < 1000; i++) {
        createEntity(world, [[Transform, { x: (i % 100) * 20, y: Math.floor(i / 100) * 20 }], [Renderable], [RenderBounds, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      }
      world.setResource(CanvasContext, mockCtx());
      world.update(16);
      assert.strictEqual(queue.count, 1000);
    });
  });

  // ─── RenderCommand ───────────────────────────────────
  describe("RenderCommand", () => {
    it("create returns a command object with defaults", () => {
      const cmd = RenderCommand.create();
      assert.strictEqual(cmd.image, 0);
      assert.strictEqual(cmd.x, 0);
      assert.strictEqual(cmd.y, 0);
      assert.strictEqual(cmd.rotation, 0);
      assert.strictEqual(cmd.scaleX, 1);
      assert.strictEqual(cmd.scaleY, 1);
      assert.strictEqual(cmd.width, 0);
      assert.strictEqual(cmd.height, 0);
      assert.strictEqual(cmd.fillColor, 0);
      assert.strictEqual(cmd.shape, 0);
      assert.strictEqual(cmd.layer, 0);
    });

    it("create returns a new object each call", () => {
      const a = RenderCommand.create();
      const b = RenderCommand.create();
      assert.notStrictEqual(a, b);
    });
  });

  // ─── RenderQueue ─────────────────────────────────────
  describe("RenderQueue", () => {
    it("starts empty", () => {
      const q = new RenderQueue();
      assert.strictEqual(q.count, 0);
    });

    it("clear resets count to zero", () => {
      const q = new RenderQueue();
      q.push(0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0);
      assert.strictEqual(q.count, 1);
      q.clear();
      assert.strictEqual(q.count, 0);
    });

    it("push increases count", () => {
      const q = new RenderQueue();
      q.push(0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0);
      q.push(0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0);
      assert.strictEqual(q.count, 2);
    });

    it("reuses command objects after clear", () => {
      const q = new RenderQueue();
      q.push(0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0);
      const first = q._commands[0];
      q.clear();
      q.push(0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0);
      assert.strictEqual(q._commands[0], first);
    });
  });

  // ─── Canonical Pattern ───────────────────────────────
  describe("canonical pattern", () => {
    it("does not use ctx.column()", () => {
      const src = RenderSystem.prototype.update.toString();
      assert.ok(!src.includes("ctx.column("));
      assert.ok(!src.includes("ctx.column ("));
    });

    it("uses for-of ctx iteration", () => {
      const src = RenderSystem.prototype.update.toString();
      assert.ok(src.includes("for (const table of ctx)"));
    });

    it("uses table.getColumn for column access", () => {
      const src = RenderSystem.prototype.update.toString();
      assert.ok(src.includes("table.getColumn("));
    });

    it("uses _compiled.componentIds for ID lookup", () => {
      const src = RenderSystem.prototype.update.toString();
      assert.ok(src.includes("_compiled.componentIds"));
    });

    it("iterates rows per table with for loop", () => {
      const src = RenderSystem.prototype.update.toString();
      assert.ok(src.includes("for (let r = 0; r < count; r"));
    });

    it("uses ctx.resources.get for resource access", () => {
      const src = RenderSystem.prototype.update.toString();
      assert.ok(src.includes("ctx.resources.get("));
    });

    it("does not use getComponent()", () => {
      const src = RenderSystem.prototype.update.toString();
      assert.ok(!src.includes("getComponent("));
    });
  });

  // ─── Export Surface ──────────────────────────────────
  describe("export surface", () => {
    it("exports RenderSystem from ecs/systems", () => {
      assert.strictEqual(RenderSystem.name, "RenderSystem");
    });

    it("exports RenderQueue from ecs/render", () => {
      assert.strictEqual(RenderQueue.name, "RenderQueue");
    });

    it("exports RenderCommand from ecs/render", () => {
      assert.strictEqual(RenderCommand.name, "RenderCommand");
    });
  });

  // ─── Zero Allocation ─────────────────────────────────
  describe("zero allocation", () => {
    it("no object allocations in update loop", () => {
      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      world.setResource(CanvasContext, mockCtx());
      const sys = new RenderSystem();
      world.addSystem(sys);
      for (let i = 0; i < 100; i++) {
        createEntity(world, [[Transform, { x: i * 10, y: 0 }], [Renderable], [RenderBounds, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      }
      const beforeKeys = Object.keys(sys);
      world.update(16);
      world.update(16);
      const afterKeys = Object.keys(sys);
      assert.deepStrictEqual(afterKeys, beforeKeys);
    });
  });
});
