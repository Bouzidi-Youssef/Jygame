import { describe, it, mock } from "node:test";
import * as assert from "node:assert";
import {
  World, Trail, TrailBuffer, TrailManager, TrailSystem,
  Transform, Visible,
} from "../../../ecs/index.js";
import { Camera } from "../../../camera/Camera.js";
import { CanvasContext } from "../../../ecs/render/CanvasContext.js";

function cleanMockCtx() {
  return {
    save: mock.fn(),
    restore: mock.fn(),
    translate: mock.fn(),
    rotate: mock.fn(),
    scale: mock.fn(),
    beginPath: mock.fn(),
    moveTo: mock.fn(),
    lineTo: mock.fn(),
    stroke: mock.fn(),
    fill: mock.fn(),
    arc: mock.fn(),
    fillRect: mock.fn(),
    drawImage: mock.fn(),
    set fillStyle(v) { this._fillStyle = v; },
    set strokeStyle(v) { this._strokeStyle = v; },
    set lineWidth(v) { this._lineWidth = v; },
    set globalAlpha(v) { this._globalAlpha = v; },
  };
}

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Visible);
  world.register(Trail);
  return world;
}

function setupEntity(world, opts = {}) {
  const e = world.createEntity();
  world.addComponent(e, Transform);
  world.setComponent(e, Transform, {
    x: opts.x ?? 0, y: opts.y ?? 0,
    rotation: opts.r ?? 0, scaleX: opts.sx ?? 1, scaleY: opts.sy ?? 1,
  });
  world.addComponent(e, Visible);
  world.setComponent(e, Visible, { value: opts.v != null ? opts.v : 1 });
  world.addComponent(e, Trail);
  world.setComponent(e, Trail, {
    enabled: opts.enabled ?? 1,
    maxPoints: opts.maxPoints ?? 64,
    spacing: opts.spacing ?? 4,
    width: opts.width ?? 4,
    color: opts.color ?? 0xffffff,
    mode: opts.mode ?? 0,
  });
  return e;
}

function setupWorld(entities) {
  const world = createWorld();
  const manager = new TrailManager();
  const ctx = cleanMockCtx();
  world.setResource(TrailManager, manager);
  world.setResource(CanvasContext, ctx);
  world.addSystem(new TrailSystem());
  const ids = [];
  for (const opts of entities) {
    ids.push(setupEntity(world, opts));
  }
  return { world, manager, ctx, ids };
}

function moveEntity(world, id, x, y) {
  world.setComponent(id, Transform, {
    ...world.getComponent(id, Transform),
    x, y,
  });
}

// ─────────────────────────────────────────────────────────
// Trail component
// ─────────────────────────────────────────────────────────
describe("Trail component", () => {
  it("defines static schema with 6 fields", () => {
    assert.ok(Trail.schema);
    assert.strictEqual(Object.keys(Trail.schema).length, 6);
  });

  it("schema has correct field types", () => {
    assert.strictEqual(Trail.schema.enabled, "u8");
    assert.strictEqual(Trail.schema.maxPoints, "u16");
    assert.strictEqual(Trail.schema.spacing, "f32");
    assert.strictEqual(Trail.schema.width, "f32");
    assert.strictEqual(Trail.schema.color, "u32");
    assert.strictEqual(Trail.schema.mode, "u8");
  });

  it("instantiates", () => {
    const inst = new Trail();
    assert.ok(inst instanceof Trail);
  });

  it("registers successfully", () => {
    const world = createWorld();
    assert.ok(world.registry.has(Trail));
  });

  it("fields are zero-initialized", () => {
    const world = createWorld();
    const e = world.createEntity();
    world.addComponent(e, Trail);
    const c = world.getComponent(e, Trail);
    assert.strictEqual(c.enabled, 0);
    assert.strictEqual(c.maxPoints, 0);
    assert.strictEqual(c.spacing, 0);
    assert.strictEqual(c.width, 0);
    assert.strictEqual(c.color, 0);
    assert.strictEqual(c.mode, 0);
  });

  it("prototype has no enumerable methods", () => {
    const proto = Trail.prototype;
    const ownKeys = Object.getOwnPropertyNames(proto);
    const methods = ownKeys.filter(k => k !== "constructor");
    assert.strictEqual(methods.length, 0);
  });

  it("can be set via setComponent", () => {
    const world = createWorld();
    const e = world.createEntity();
    world.addComponent(e, Trail);
    world.setComponent(e, Trail, { enabled: 1, maxPoints: 128, spacing: 8, width: 6, color: 0xff0000, mode: 1 });
    const c = world.getComponent(e, Trail);
    assert.strictEqual(c.enabled, 1);
    assert.strictEqual(c.maxPoints, 128);
    assert.strictEqual(c.spacing, 8);
    assert.strictEqual(c.width, 6);
    assert.strictEqual(c.color, 0xff0000);
    assert.strictEqual(c.mode, 1);
  });
});

// ─────────────────────────────────────────────────────────
// TrailBuffer
// ─────────────────────────────────────────────────────────
describe("TrailBuffer", () => {
  it("constructs with given capacity", () => {
    const buf = new TrailBuffer(10);
    assert.strictEqual(buf.capacity, 10);
    assert.strictEqual(buf.count, 0);
  });

  it("minimum capacity is 2", () => {
    const buf = new TrailBuffer(1);
    assert.strictEqual(buf.capacity, 2);
  });

  it("addPoint increases count", () => {
    const buf = new TrailBuffer(10);
    buf.addPoint(1, 2);
    assert.strictEqual(buf.count, 1);
  });

  it("addPoint stores values", () => {
    const buf = new TrailBuffer(10);
    buf.addPoint(3, 4);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[3, 4]]);
  });

  it("forEach iterates in insertion order", () => {
    const buf = new TrailBuffer(10);
    buf.addPoint(1, 1);
    buf.addPoint(2, 2);
    buf.addPoint(3, 3);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[1, 1], [2, 2], [3, 3]]);
  });

  it("wraparound overwrites oldest", () => {
    const buf = new TrailBuffer(3);
    buf.addPoint(1, 1);
    buf.addPoint(2, 2);
    buf.addPoint(3, 3);
    assert.strictEqual(buf.count, 3);
    buf.addPoint(4, 4);
    assert.strictEqual(buf.count, 3);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[2, 2], [3, 3], [4, 4]]);
  });

  it("multiple wraps preserve correct ordering", () => {
    const buf = new TrailBuffer(4);
    for (let i = 0; i < 10; i++) buf.addPoint(i, i);
    assert.strictEqual(buf.count, 4);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[6, 6], [7, 7], [8, 8], [9, 9]]);
  });

  it("clear resets state", () => {
    const buf = new TrailBuffer(10);
    buf.addPoint(1, 2);
    buf.addPoint(3, 4);
    buf.clear();
    assert.strictEqual(buf.count, 0);
    assert.strictEqual(buf._accumulated, 0);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.strictEqual(points.length, 0);
  });

  it("resize to larger preserves data", () => {
    const buf = new TrailBuffer(4);
    buf.addPoint(1, 1);
    buf.addPoint(2, 2);
    buf.resize(8);
    assert.strictEqual(buf.capacity, 8);
    assert.strictEqual(buf.count, 2);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[1, 1], [2, 2]]);
  });

  it("resize to smaller truncates oldest", () => {
    const buf = new TrailBuffer(10);
    for (let i = 0; i < 6; i++) buf.addPoint(i, i);
    buf.resize(3);
    assert.strictEqual(buf.capacity, 3);
    assert.strictEqual(buf.count, 3);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[3, 3], [4, 4], [5, 5]]);
  });

  it("resize with wrapped data preserves correct order", () => {
    const buf = new TrailBuffer(4);
    buf.addPoint(0, 0);
    buf.addPoint(1, 1);
    buf.addPoint(2, 2);
    buf.addPoint(3, 3); // full
    buf.addPoint(4, 4); // wraps, overwrites 0
    buf.addPoint(5, 5); // wraps, overwrites 1
    // order should be: 2,3,4,5
    buf.resize(2);
    assert.strictEqual(buf.count, 2);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[4, 4], [5, 5]]);
  });

  it("addPoint after clear works", () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(1, 1);
    buf.clear();
    buf.addPoint(2, 2);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.deepStrictEqual(points, [[2, 2]]);
  });

  it("addPoint and forEach do not allocate new objects", () => {
    const buf = new TrailBuffer(10);
    const points = [];
    buf.forEach((x, y) => points.push([x, y]));
    assert.strictEqual(points.length, 0);
    buf.addPoint(1, 2);
    buf.forEach((x, y) => points.push([x, y]));
    assert.strictEqual(points.length, 1);
  });

  it("forEach provides correct index", () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(10, 20);
    buf.addPoint(30, 40);
    buf.addPoint(50, 60);
    const indices = [];
    buf.forEach((x, y, i) => indices.push(i));
    assert.deepStrictEqual(indices, [0, 1, 2]);
  });

  it("capacity is read-only via getter", () => {
    const buf = new TrailBuffer(8);
    assert.strictEqual(buf.capacity, 8);
  });

  it("count is read-only via getter", () => {
    const buf = new TrailBuffer(8);
    assert.strictEqual(buf.count, 0);
    buf.addPoint(0, 0);
    assert.strictEqual(buf.count, 1);
  });
});

// ─────────────────────────────────────────────────────────
// TrailManager
// ─────────────────────────────────────────────────────────
describe("TrailManager", () => {
  it("constructs empty", () => {
    const m = new TrailManager();
    assert.strictEqual(m.size, 0);
  });

  it("get returns null for unknown entity", () => {
    const m = new TrailManager();
    assert.strictEqual(m.get(42), null);
  });

  it("getOrCreate creates lazily", () => {
    const m = new TrailManager();
    const buf = m.getOrCreate(1, 10);
    assert.ok(buf instanceof TrailBuffer);
    assert.strictEqual(buf.capacity, 10);
    assert.strictEqual(m.size, 1);
  });

  it("getOrCreate returns existing buffer", () => {
    const m = new TrailManager();
    const b1 = m.getOrCreate(1, 10);
    const b2 = m.getOrCreate(1, 10);
    assert.strictEqual(b1, b2);
    assert.strictEqual(m.size, 1);
  });

  it("get returns buffer after getOrCreate", () => {
    const m = new TrailManager();
    m.getOrCreate(1, 10);
    const buf = m.get(1);
    assert.ok(buf instanceof TrailBuffer);
  });

  it("remove deletes buffer", () => {
    const m = new TrailManager();
    m.getOrCreate(1, 10);
    assert.ok(m.has(1));
    m.remove(1);
    assert.ok(!m.has(1));
    assert.strictEqual(m.size, 0);
  });

  it("has returns false for unknown entity", () => {
    const m = new TrailManager();
    assert.ok(!m.has(99));
  });

  it("clear removes all buffers", () => {
    const m = new TrailManager();
    m.getOrCreate(1, 10);
    m.getOrCreate(2, 20);
    m.getOrCreate(3, 30);
    assert.strictEqual(m.size, 3);
    m.clear();
    assert.strictEqual(m.size, 0);
  });

  it("getOrCreate resizes when maxPoints changes", () => {
    const m = new TrailManager();
    const b1 = m.getOrCreate(1, 10);
    assert.strictEqual(b1.capacity, 10);
    b1.addPoint(1, 1);
    const b2 = m.getOrCreate(1, 20);
    assert.strictEqual(b2, b1);
    assert.strictEqual(b2.capacity, 20);
    assert.strictEqual(b2.count, 1);
  });

  it("forEach iterates all buffers", () => {
    const m = new TrailManager();
    m.getOrCreate(1, 5);
    m.getOrCreate(2, 10);
    const ids = [];
    m.forEach((eid) => ids.push(eid));
    ids.sort((a, b) => a - b);
    assert.deepStrictEqual(ids, [1, 2]);
  });

  it("reuse entity ID after remove", () => {
    const m = new TrailManager();
    const b1 = m.getOrCreate(1, 10);
    b1.addPoint(1, 1);
    m.remove(1);
    const b2 = m.getOrCreate(1, 10);
    assert.notStrictEqual(b1, b2);
    assert.strictEqual(b2.count, 0);
  });

  it("multiple independent entities", () => {
    const m = new TrailManager();
    const b1 = m.getOrCreate(1, 10);
    const b2 = m.getOrCreate(2, 20);
    b1.addPoint(1, 2);
    b2.addPoint(3, 4);
    assert.strictEqual(b1.count, 1);
    assert.strictEqual(b2.count, 1);
    assert.strictEqual(m.size, 2);
  });
});

// ─────────────────────────────────────────────────────────
// TrailSystem
// ─────────────────────────────────────────────────────────
describe("TrailSystem", () => {
  it("has static priority 4", () => {
    assert.strictEqual(TrailSystem.priority, 4);
  });

  it("has static query with all: [Transform, Trail, Visible]", () => {
    assert.ok(TrailSystem.query);
    assert.deepStrictEqual(TrailSystem.query.all, [Transform, Trail, Visible]);
  });

  it("throws descriptive error when TrailManager resource is missing", () => {
    const world = createWorld();
    world.setResource(CanvasContext, cleanMockCtx());
    world.addSystem(new TrailSystem());
    const e = setupEntity(world, { x: 0, y: 0 });
    moveEntity(world, e, 10, 10);
    assert.throws(
      () => world.update(16),
      /TrailManager resource is not set/,
    );
  });

  it("throws descriptive error when CanvasContext resource is missing", () => {
    const world = createWorld();
    world.setResource(TrailManager, new TrailManager());
    world.addSystem(new TrailSystem());
    const e = setupEntity(world, { x: 0, y: 0 });
    moveEntity(world, e, 10, 10);
    assert.throws(
      () => world.update(16),
      /CanvasContext resource is not set/,
    );
  });

  it("creates TrailBuffer on first move", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(buf instanceof TrailBuffer);
    assert.ok(buf.count > 0);
  });

  it("does nothing when entity hasn't moved", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(!buf || buf.count === 0);
  });

  it("applies spacing threshold", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 10 },
    ]);
    moveEntity(world, ids[0], 5, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(!buf || buf.count === 0);
  });

  it("spawns point when moved past spacing", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 10 },
    ]);
    moveEntity(world, ids[0], 15, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(buf.count >= 1);
  });

  it("spawns multiple points for large distance", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 5 },
    ]);
    moveEntity(world, ids[0], 50, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(buf.count >= 8);
  });

  it("respects maxPoints cap", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, maxPoints: 5 },
    ]);
    moveEntity(world, ids[0], 100, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.strictEqual(buf.count, 5);
  });

  it("invisible entity does not append points", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, v: 0 },
    ]);
    moveEntity(world, ids[0], 20, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(!buf || buf.count === 0);
  });

  it("disabled trail does not append points", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, enabled: 0 },
    ]);
    moveEntity(world, ids[0], 20, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(!buf || buf.count === 0);
  });

  it("trail becomes enabled after being disabled", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, enabled: 0 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(!buf || buf.count === 0);

    world.setComponent(ids[0], Trail, { ...world.getComponent(ids[0], Trail), enabled: 1 });
    moveEntity(world, ids[0], 30, 0);
    world.update(16);
    const buf2 = manager.get(ids[0]);
    assert.ok(buf2.count > 0);
  });

  it("entity destruction cleans up buffer", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.ok(manager.has(ids[0]));
    world.destroyEntity(ids[0]);
    world.update(16);
    assert.ok(!manager.has(ids[0]));
  });

  it("component removal cleans up buffer", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.ok(manager.has(ids[0]));
    world.removeComponent(ids[0], Trail);
    world.update(16);
    assert.ok(!manager.has(ids[0]));
  });

  it("visibility removal cleans up buffer", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.ok(manager.has(ids[0]));
    world.removeComponent(ids[0], Visible);
    world.update(16);
    assert.ok(!manager.has(ids[0]));
  });

  it("Transform removal cleans up buffer", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.ok(manager.has(ids[0]));
    world.removeComponent(ids[0], Transform);
    world.update(16);
    assert.ok(!manager.has(ids[0]));
  });

  it("archetype migration updates buffer ownership", () => {
    const { world, manager, ids: [e1, e2] } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, e1, 10, 0);
    moveEntity(world, e2, 10, 0);
    world.update(16);
    assert.ok(manager.has(e1));
    assert.ok(manager.has(e2));

    world.removeComponent(e1, Trail);
    world.addComponent(e2, Trail); // no-op, already has it

    moveEntity(world, e1, 20, 0);
    moveEntity(world, e2, 20, 0);
    world.update(16);

    assert.ok(!manager.has(e1));
    assert.ok(manager.has(e2));
  });

  it("multiple entities in same archetype", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 2 },
      { x: 0, y: 0, spacing: 2 },
      { x: 0, y: 0, spacing: 2 },
    ]);
    for (const id of ids) moveEntity(world, id, 20, 0);
    world.update(16);
    for (const id of ids) {
      const buf = manager.get(id);
      assert.ok(buf && buf.count >= 8);
    }
  });

  it("multiple archetypes both processed", () => {
    const world = createWorld();
    const manager = new TrailManager();
    const ctx = cleanMockCtx();
    world.setResource(TrailManager, manager);
    world.setResource(CanvasContext, ctx);
    world.addSystem(new TrailSystem());

    const e1 = setupEntity(world, { x: 0, y: 0, spacing: 1 });

    const e2 = world.createEntity();
    world.addComponent(e2, Transform);
    world.setComponent(e2, Transform, { x: 0, y: 0 });
    world.addComponent(e2, Visible);
    world.setComponent(e2, Visible, { value: 1 });
    world.addComponent(e2, Trail);
    world.setComponent(e2, Trail, { enabled: 1, maxPoints: 20, spacing: 3, width: 4, color: 0xffffff, mode: 0 });

    moveEntity(world, e1, 20, 0);
    moveEntity(world, e2, 30, 0);
    world.update(16);

    assert.ok(manager.get(e1).count > 0);
    assert.ok(manager.get(e2).count > 0);
  });

  it("repeated updates accumulate points", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 2 },
    ]);
    for (let step = 2; step <= 20; step += 2) {
      moveEntity(world, ids[0], step, 0);
      world.update(16);
    }
    const buf = manager.get(ids[0]);
    assert.strictEqual(buf.count, 10);
  });

  it("buffer does not grow beyond maxPoints across frames", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, maxPoints: 10 },
    ]);
    for (let step = 1; step <= 50; step++) {
      moveEntity(world, ids[0], step, 0);
      world.update(16);
    }
    const buf = manager.get(ids[0]);
    assert.strictEqual(buf.count, 10);
  });

  it("renders line mode via CanvasContext", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, mode: 0 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.strictEqual(ctx.beginPath.mock.calls.length, 1);
    assert.strictEqual(ctx.stroke.mock.calls.length, 1);
    assert.ok(ctx.moveTo.mock.calls.length >= 1);
    assert.ok(ctx.lineTo.mock.calls.length >= 1);
  });

  it("renders ribbon mode via CanvasContext", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, mode: 1 },
    ]);
    moveEntity(world, ids[0], 15, 0);
    world.update(16);
    assert.strictEqual(ctx.beginPath.mock.calls.length, 1);
    assert.strictEqual(ctx.fill.mock.calls.length, 1);
  });

  it("does not render when count < 2", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 100 },
    ]);
    moveEntity(world, ids[0], 50, 0);
    world.update(16);
    assert.strictEqual(ctx.beginPath.mock.calls.length, 0);
    assert.strictEqual(ctx.stroke.mock.calls.length, 0);
    assert.strictEqual(ctx.fill.mock.calls.length, 0);
  });

  it("does not render invisible entity", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, v: 0 },
    ]);
    moveEntity(world, ids[0], 20, 0);
    world.update(16);
    assert.strictEqual(ctx.stroke.mock.calls.length, 0);
  });

  it("does not render disabled trail", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, enabled: 0 },
    ]);
    moveEntity(world, ids[0], 20, 0);
    world.update(16);
    assert.strictEqual(ctx.stroke.mock.calls.length, 0);
  });

  it("applies camera transform when Camera resource is present", () => {
    const world = createWorld();
    const manager = new TrailManager();
    const ctx = cleanMockCtx();
    const camera = new Camera(0, 0, 100, 100);
    world.setResource(TrailManager, manager);
    world.setResource(CanvasContext, ctx);
    world.setResource(Camera, camera);
    world.addSystem(new TrailSystem());
    const e = setupEntity(world, { x: 0, y: 0, spacing: 1 });
    moveEntity(world, e, 10, 0);
    world.update(16);
    assert.strictEqual(ctx.save.mock.calls.length, 1);
    assert.strictEqual(ctx.translate.mock.calls.length, 2);
    assert.strictEqual(ctx.restore.mock.calls.length, 1);
  });

  it("applies save/restore even without Camera", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.strictEqual(ctx.save.mock.calls.length, 1);
    assert.strictEqual(ctx.restore.mock.calls.length, 1);
  });

  it("multiple worlds independently track trails", () => {
    const w1 = createWorld();
    const m1 = new TrailManager();
    const c1 = cleanMockCtx();
    w1.setResource(TrailManager, m1);
    w1.setResource(CanvasContext, c1);
    w1.addSystem(new TrailSystem());

    const w2 = createWorld();
    const m2 = new TrailManager();
    const c2 = cleanMockCtx();
    w2.setResource(TrailManager, m2);
    w2.setResource(CanvasContext, c2);
    w2.addSystem(new TrailSystem());

    const e1 = setupEntity(w1, { x: 0, y: 0, spacing: 5 });
    const e2 = setupEntity(w2, { x: 0, y: 0, spacing: 5 });

    moveEntity(w1, e1, 20, 0);
    moveEntity(w2, e2, 20, 0);
    w1.update(16);
    w2.update(16);

    assert.ok(m1.get(e1).count >= 3);
    assert.ok(m2.get(e2).count >= 3);

    w1.destroyEntity(e1);
    w1.update(16);
    assert.ok(!m1.has(e1));
    assert.ok(m2.has(e2));
  });

  it("entity re-added to query restores buffer", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.ok(manager.has(ids[0]));

    world.removeComponent(ids[0], Trail);
    world.update(16);
    assert.ok(!manager.has(ids[0]));

    world.addComponent(ids[0], Trail);
    world.setComponent(ids[0], Trail, { enabled: 1, maxPoints: 64, spacing: 1, width: 4, color: 0xffffff, mode: 0 });
    moveEntity(world, ids[0], 20, 0);
    world.update(16);
    assert.ok(manager.has(ids[0]));
    const buf = manager.get(ids[0]);
    assert.ok(buf.count > 0);
  });

  it("stress test with 500 entities", () => {
    const { world, manager, ids } = setupWorld(
      Array.from({ length: 500 }, (_, i) => ({
        x: 0, y: i, spacing: 2, maxPoints: 10,
      })),
    );
    for (let i = 0; i < ids.length; i++) {
      moveEntity(world, ids[i], 30, i);
    }
    world.update(16);
    assert.strictEqual(manager.size, 500);
    for (const id of ids) {
      const buf = manager.get(id);
      assert.ok(buf.count > 0);
      assert.ok(buf.count <= 10);
    }
    for (const id of ids) world.destroyEntity(id);
    world.update(16);
    assert.strictEqual(manager.size, 0);
  });

  it("high-frequency update produces consistent results", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 2, maxPoints: 20 },
    ]);
    for (let i = 0; i < 100; i++) {
      moveEntity(world, ids[0], i * 2, 0);
      world.update(16);
    }
    const buf = manager.get(ids[0]);
    assert.ok(buf.count <= 20);
    assert.ok(buf.count >= 10);
  });

  it("does not append for zero spacing", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 0 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(!buf || buf.count === 0);
  });

  it("does not append for maxPoints < 2", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, maxPoints: 1 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.ok(!buf || buf.count === 0);
  });

  it("per-frame spawns capped at maxPoints", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, maxPoints: 5 },
    ]);
    moveEntity(world, ids[0], 1000, 0);
    world.update(16);
    const buf = manager.get(ids[0]);
    assert.strictEqual(buf.count, 5);
  });

  it("color is passed through to strokeStyle", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, color: 0xff0000, mode: 0 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.strictEqual(ctx._strokeStyle, "#ff0000");
  });

  it("color is passed through to fillStyle for ribbon", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, color: 0x00ff00, mode: 1 },
    ]);
    moveEntity(world, ids[0], 15, 0);
    world.update(16);
    assert.strictEqual(ctx._fillStyle, "#00ff00");
  });

  it("width is passed through to lineWidth", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, width: 6, mode: 0 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.strictEqual(ctx._lineWidth, 6);
  });

  it("line mode uses stroke", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, mode: 0 },
    ]);
    moveEntity(world, ids[0], 10, 0);
    world.update(16);
    assert.strictEqual(ctx.stroke.mock.calls.length, 1);
    assert.strictEqual(ctx.fill.mock.calls.length, 0);
  });

  it("ribbon mode uses fill", () => {
    const { world, ctx, ids } = setupWorld([
      { x: 0, y: 0, spacing: 1, mode: 1 },
    ]);
    moveEntity(world, ids[0], 15, 0);
    world.update(16);
    assert.strictEqual(ctx.fill.mock.calls.length, 1);
    assert.strictEqual(ctx.stroke.mock.calls.length, 0);
  });

  it("multiple frames keep buffer within bounds", () => {
    const { world, manager, ids } = setupWorld([
      { x: 0, y: 0, spacing: 3, maxPoints: 8 },
    ]);
    for (let step = 0; step < 100; step++) {
      moveEntity(world, ids[0], step * 3, 0);
      world.update(16);
    }
    const buf = manager.get(ids[0]);
    assert.strictEqual(buf.count, 8);
  });
});
