import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, System } from "../../../ecs/index.js";
import { Transform, Collider, Visible, EnemyTag } from "../../../ecs/index.js";
import { CollisionSystem } from "../../../ecs/systems/CollisionSystem.js";
import { SpatialHash } from "../../../collision/SpatialHash.js";
import { CollisionQuery } from "../../../ecs/collision/CollisionQuery.js";
import { MovementSystem } from "../../../ecs/systems/MovementSystem.js";
import { AnimationSystem } from "../../../ecs/systems/AnimationSystem.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Collider);
  world.register(Visible);
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

function setupWorld(entities, cellSize) {
  const world = createWorld();
  const hash = new SpatialHash(cellSize);
  world.setResource(SpatialHash, hash);
  world.addSystem(new CollisionSystem());
  const ids = [];
  for (const opts of entities) {
    ids.push(createEntity(world, [
      [Transform, { x: opts.x, y: opts.y }],
      [Collider, { width: opts.w, height: opts.h }],
      [Visible, { value: opts.v != null ? opts.v : 1 }],
    ]));
  }
  return { world, hash, ids };
}

describe("CollisionSystem (ECS)", () => {
  // ─── Construction ────────────────────────────────────
  describe("construction", () => {
    it("instantiates", () => {
      const sys = new CollisionSystem();
      assert.ok(sys instanceof CollisionSystem);
    });

    it("extends System", () => {
      const sys = new CollisionSystem();
      assert.ok(sys instanceof System);
    });

    it("is enabled by default", () => {
      const sys = new CollisionSystem();
      assert.strictEqual(sys.enabled, true);
    });

    it("has static query requiring Transform, Collider, Visible", () => {
      const q = CollisionSystem.query;
      assert.ok(q.all);
      assert.ok(q.all.includes(Transform));
      assert.ok(q.all.includes(Collider));
      assert.ok(q.all.includes(Visible));
      assert.strictEqual(q.all.length, 3);
    });

    it("has priority 2 (after Animation)", () => {
      assert.strictEqual(CollisionSystem.priority, 2);
    });

    it("has compiled componentIds after being added to world", () => {
      const world = createWorld();
      const sys = new CollisionSystem();
      world.addSystem(sys);
      assert.ok(sys._compiled);
      assert.ok(sys._compiled.componentIds instanceof Map);
      assert.ok(sys._compiled.componentIds.has(Transform));
      assert.ok(sys._compiled.componentIds.has(Collider));
      assert.ok(sys._compiled.componentIds.has(Visible));
    });
  });

  // ─── Scheduler ───────────────────────────────────────
  describe("scheduler", () => {
    it("executes when update is called", () => {
      let ran = false;
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      class SpySystem extends System {
        update(ctx, dt) { ran = true; }
      }
      world.addSystem(new SpySystem());
      world.update(16);
      assert.ok(ran);
    });

    it("can be disabled", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      const sys = new CollisionSystem();
      world.addSystem(sys);
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      sys.enabled = false;
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 0);
    });

    it("executes after Animation system (priority 2 > 1)", () => {
      const order = [];
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      class OrderSystemA extends System {
        static priority = 1;
        update(ctx, dt) { order.push("A"); }
      }
      class OrderSystemB extends System {
        static priority = 2;
        update(ctx, dt) { order.push("B"); }
      }
      world.addSystem(new OrderSystemB());
      world.addSystem(new OrderSystemA());
      world.update(16);
      assert.deepStrictEqual(order, ["A", "B"]);
    });

    it("executes after Animation and Movement if all present", () => {
      const order = [];
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      class Movement extends System {
        static priority = 0;
        update(ctx, dt) { order.push("M"); }
      }
      class Animation extends System {
        static priority = 1;
        update(ctx, dt) { order.push("A"); }
      }
      class Collision extends System {
        static priority = 2;
        update(ctx, dt) { order.push("C"); }
      }
      world.addSystem(new Collision());
      world.addSystem(new Animation());
      world.addSystem(new Movement());
      world.update(16);
      assert.deepStrictEqual(order, ["M", "A", "C"]);
    });

    it("runs in independent worlds", () => {
      const w1 = createWorld();
      const h1 = new SpatialHash();
      w1.setResource(SpatialHash, h1);
      w1.addSystem(new CollisionSystem());
      createEntity(w1, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);

      const w2 = createWorld();
      const h2 = new SpatialHash();
      w2.setResource(SpatialHash, h2);
      w2.addSystem(new CollisionSystem());
      createEntity(w2, [[Transform, { x: 100, y: 100 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);

      w1.update(16);
      w2.update(16);

      const rect1 = { left: -5, right: 5, top: -5, bottom: 5 };
      const rect2 = { left: 95, right: 105, top: 95, bottom: 105 };
      assert.strictEqual(h1.queryRect(rect1).length, 1);
      assert.strictEqual(h1.queryRect(rect2).length, 0);
      assert.strictEqual(h2.queryRect(rect2).length, 1);
      assert.strictEqual(h2.queryRect(rect1).length, 0);
    });
  });

  // ─── Spatial Hash Population ─────────────────────────
  describe("spatial hash population", () => {
    it("inserts entities into spatial hash", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 1);
    });

    it("rebuilds hash every frame (cleared and re-inserted)", () => {
      const { world, hash, ids } = setupWorld([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 0, y: 0, w: 10, h: 10 },
      ]);
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 2);

      world.removeComponent(ids[0], Collider);
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 1);
    });

    it("empty world does not crash", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      world.addSystem(new CollisionSystem());
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 0);
    });

    it("multiple archetypes are all queried", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      world.addSystem(new CollisionSystem());
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      createEntity(world, [[Transform, { x: 50, y: 50 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }], [EnemyTag]]);
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 1);
      assert.strictEqual(hash.queryRect({ left: 45, right: 55, top: 45, bottom: 55 }).length, 1);
    });

    it("clear removes all entries between frames", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      hash.insert(999, 0, 0, 10, 10);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      const results = hash.queryRect(rect);
      assert.strictEqual(results.length, 1);
      assert.notStrictEqual(results[0], 999);
    });
  });

  // ─── Visibility ─────────────────────────────────────
  describe("visibility", () => {
    it("invisible entity is skipped", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10, v: 0 }]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 0);
    });

    it("mixed visibility only inserts visible ones", () => {
      const { world, hash, ids } = setupWorld([
        { x: 0, y: 0, w: 10, h: 10, v: 1 },
        { x: 0, y: 0, w: 10, h: 10, v: 0 },
      ]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 1);
      assert.strictEqual(hash.queryRect(rect)[0], ids[0]);
    });
  });

  // ─── Rectangle Queries ───────────────────────────────
  describe("rectangle queries", () => {
    it("returns hit for overlapping entity", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      const hits = hash.queryRect(rect);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("returns empty for miss", () => {
      const { world, hash } = setupWorld([{ x: 100, y: 100, w: 10, h: 10 }]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 0);
    });

    it("touching edges counts as hit", () => {
      const { world, hash, ids } = setupWorld([{ x: 5, y: 5, w: 10, h: 10 }]);
      world.update(16);
      const rect = { left: 0, right: 10, top: 0, bottom: 10 };
      const hits = hash.queryRect(rect);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("finds overlapping rectangle with many entities", () => {
      const { world, hash, ids } = setupWorld([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 100, y: 100, w: 10, h: 10 },
        { x: 3, y: 3, w: 10, h: 10 },
        { x: 200, y: 200, w: 10, h: 10 },
      ]);
      world.update(16);
      const rect = { left: -5, right: 8, top: -5, bottom: 8 };
      const hits = hash.queryRect(rect);
      assert.strictEqual(hits.length, 2);
      assert.ok(hits.includes(ids[0]));
      assert.ok(hits.includes(ids[2]));
    });

    it("large query rect matches everything", () => {
      const { world, hash } = setupWorld([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 500, y: 500, w: 10, h: 10 },
        { x: -300, y: -300, w: 10, h: 10 },
      ]);
      world.update(16);
      const rect = { left: -1000, right: 1000, top: -1000, bottom: 1000 };
      assert.strictEqual(hash.queryRect(rect).length, 3);
    });

    it("reuses output array when provided", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const out = [];
      const result = hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }, out);
      assert.strictEqual(result, out);
      assert.strictEqual(out.length, 1);
    });
  });

  // ─── Point Queries ───────────────────────────────────
  describe("point queries", () => {
    it("returns hit for point inside", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryPoint({ x: 0, y: 0 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("returns empty for point outside", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryPoint({ x: 100, y: 100 });
      assert.strictEqual(hits.length, 0);
    });

    it("boundary point is inside", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryPoint({ x: 5, y: 5 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });
  });

  // ─── Circle Queries ──────────────────────────────────
  describe("circle queries", () => {
    it("returns hit for circle overlapping entity", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryCircle(0, 0, 5);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("returns empty for circle far from entity", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryCircle(100, 100, 5);
      assert.strictEqual(hits.length, 0);
    });

    it("tangent circle touches entity edge", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryCircle(10, 0, 5);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });
  });

  // ─── AABB Queries ────────────────────────────────────
  describe("AABB queries", () => {
    it("returns hit for overlapping AABB", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryAABB(0, 0, 10, 10);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("returns empty for non-overlapping AABB", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryAABB(100, 100, 10, 10);
      assert.strictEqual(hits.length, 0);
    });
  });

  // ─── Raycasts ────────────────────────────────────────
  describe("raycasts", () => {
    it("returns hit for entity along ray", () => {
      const { world, hash, ids } = setupWorld([{ x: 50, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.raycast(0, 0, 1, 0, 100);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("returns empty when ray misses all entities", () => {
      const { world, hash } = setupWorld([{ x: 50, y: 50, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.raycast(0, 0, 1, 0, 100);
      assert.strictEqual(hits.length, 0);
    });

    it("returns multiple hits along ray path", () => {
      const { world, hash, ids } = setupWorld([
        { x: 30, y: 0, w: 10, h: 10 },
        { x: 60, y: 0, w: 10, h: 10 },
      ]);
      world.update(16);
      const hits = hash.raycast(0, 0, 1, 0, 100);
      assert.strictEqual(hits.length, 2);
      assert.ok(hits.includes(ids[0]));
      assert.ok(hits.includes(ids[1]));
    });

    it("short ray does not reach entity", () => {
      const { world, hash } = setupWorld([{ x: 50, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.raycast(0, 0, 1, 0, 10);
      assert.strictEqual(hits.length, 0);
    });
  });

  // ─── Archetype Migration ─────────────────────────────
  describe("archetype migration", () => {
    it("gain Collider mid-frame", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      world.addSystem(new CollisionSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Visible, { value: 1 }]]);
      world.addComponent(e, Collider);
      world.setComponent(e, Collider, { width: 10, height: 10 });
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 1);
    });

    it("lose Collider mid-frame", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.removeComponent(ids[0], Collider);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 0);
    });

    it("gain Visible mid-frame", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      world.addSystem(new CollisionSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }]]);
      world.addComponent(e, Visible);
      world.setComponent(e, Visible, { value: 1 });
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 1);
    });

    it("lose Visible mid-frame", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.removeComponent(ids[0], Visible);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 0);
    });

    it("destroyed entity is removed", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.destroyEntity(ids[0]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 0);
    });

    it("new entity after update appears next frame", () => {
      const { world, hash } = setupWorld([]);
      world.update(16);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 1);
    });
  });

  // ─── Resources ───────────────────────────────────────
  describe("resources", () => {
    it("missing SpatialHash throws descriptive error", () => {
      const world = createWorld();
      world.addSystem(new CollisionSystem());
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      assert.throws(() => world.update(16), /SpatialHash resource is not set/);
    });

    it("replacing SpatialHash uses new instance", () => {
      const { world } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const hash2 = new SpatialHash();
      world.setResource(SpatialHash, hash2);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash2.queryRect(rect).length, 1);
    });

    it("SpatialHash as resource supports has and get", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      assert.ok(world.hasResource(SpatialHash));
      assert.strictEqual(world.getResource(SpatialHash), hash);
    });

    it("can use CollisionQuery as a resource", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const query = new CollisionQuery(hash);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      const hits = query.queryRect(rect);
      assert.strictEqual(hits.length, 1);
    });
  });

  // ─── Negative Coordinates ────────────────────────────
  describe("negative coordinates", () => {
    it("entity at negative position is inserted", () => {
      const { world, hash, ids } = setupWorld([{ x: -50, y: -50, w: 10, h: 10 }]);
      world.update(16);
      const rect = { left: -55, right: -45, top: -55, bottom: -45 };
      const hits = hash.queryRect(rect);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("point query at negative coordinates works", () => {
      const { world, hash, ids } = setupWorld([{ x: -50, y: -50, w: 10, h: 10 }]);
      world.update(16);
      const hits = hash.queryPoint({ x: -50, y: -50 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

  });

  // ─── Large World ─────────────────────────────────────
  describe("large world", () => {
    it("handles 100 entities", () => {
      const { world, hash } = setupWorld([]);
      for (let i = 0; i < 100; i++) {
        createEntity(world, [[Transform, { x: i * 20, y: i * 20 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      }
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 1);
    });

    it("handles 1000 entities", () => {
      const { world, hash } = setupWorld([]);
      for (let i = 0; i < 1000; i++) {
        createEntity(world, [[Transform, { x: (i % 100) * 30, y: Math.floor(i / 100) * 30 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      }
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.ok(hash.queryRect(rect).length >= 1);
    });

    it("handles 10000 entities", () => {
      const { world, hash } = setupWorld([]);
      for (let i = 0; i < 10000; i++) {
        createEntity(world, [[Transform, { x: (i % 200) * 30, y: Math.floor(i / 200) * 30 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      }
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.ok(hash.queryRect(rect).length >= 1);
    });
  });

  // ─── Repeated Updates ────────────────────────────────
  describe("repeated updates", () => {
    it("deterministic results across repeated updates", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      world.update(16);
      const first = hash.queryRect(rect).slice();
      world.update(16);
      const second = hash.queryRect(rect).slice();
      assert.deepStrictEqual(first, second);
    });

    it("large dt does not break insertion", () => {
      const { world, hash } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(100000);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      assert.strictEqual(hash.queryRect(rect).length, 1);
    });

    it("sparse world does not break queries", () => {
      const { world, hash } = setupWorld([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 10000, y: 10000, w: 10, h: 10 },
        { x: -10000, y: -10000, w: 10, h: 10 },
      ]);
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 1);
      assert.strictEqual(hash.queryRect({ left: 9995, right: 10005, top: 9995, bottom: 10005 }).length, 1);
      assert.strictEqual(hash.queryRect({ left: -10005, right: -9995, top: -10005, bottom: -9995 }).length, 1);
    });

    it("entity with zero-sized collider is inserted", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 0, h: 0 }]);
      world.update(16);
      const hits = hash.queryPoint({ x: 0, y: 0 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });
  });

  // ─── System Lifecycle ────────────────────────────────
  describe("system lifecycle", () => {
    it("onAdded is called when system is added to world", () => {
      let called = false;
      const world = createWorld();
      class LifecycleSystem extends System {
        onAdded(w) { called = true; }
      }
      const sys = new LifecycleSystem();
      world.addSystem(sys);
      assert.ok(called);
    });

    it("onRemoved is called when system is removed from world", () => {
      let called = false;
      const world = createWorld();
      class LifecycleSystem extends System {
        onRemoved(w) { called = true; }
      }
      const sys = new LifecycleSystem();
      world.addSystem(sys);
      world.removeSystem(sys);
      assert.ok(called);
    });

    it("remove and re-add system", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      const sys = new CollisionSystem();
      world.addSystem(sys);
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 1);
      world.removeSystem(sys);
      hash.clear();
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 0);
      world.addSystem(sys);
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 1);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────
  describe("edge cases", () => {
    it("system with no matching entities does not crash", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      world.addSystem(new CollisionSystem());
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }]]);
      world.update(16);
      assert.strictEqual(hash.queryRect({ left: -5, right: 5, top: -5, bottom: 5 }).length, 0);
    });

    it("ctx.resources.has works for SpatialHash", () => {
      let hasResource = false;
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      world.addSystem(new CollisionSystem());
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]);
      class SpySystem extends System {
        update(ctx, dt) { hasResource = ctx.resources.has(SpatialHash); }
      }
      world.addSystem(new SpySystem());
      world.update(16);
      assert.ok(hasResource);
    });

    it("multiple entities in same cell deduplicated in queryRect", () => {
      const { world, hash } = setupWorld([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 2, y: 2, w: 10, h: 10 },
      ]);
      world.update(16);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      const hits = hash.queryRect(rect);
      assert.strictEqual(hits.length, 2);
    });

    it("collision system does not modify component columns", () => {
      const { world, ids } = setupWorld([{ x: 10, y: 20, w: 30, h: 40 }]);
      world.update(16);
      const t = world.getComponent(ids[0], Transform);
      assert.strictEqual(t.x, 10);
      assert.strictEqual(t.y, 20);
    });
  });

  // ─── CollisionQuery ──────────────────────────────────
  describe("CollisionQuery", () => {
    it("queryRect via CollisionQuery works", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const query = new CollisionQuery(hash);
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      const hits = query.queryRect(rect);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("queryPoint via CollisionQuery works", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const query = new CollisionQuery(hash);
      const hits = query.queryPoint({ x: 0, y: 0 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("queryCircle via CollisionQuery works", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const query = new CollisionQuery(hash);
      const hits = query.queryCircle(0, 0, 5);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("queryAABB via CollisionQuery works", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const query = new CollisionQuery(hash);
      const hits = query.queryAABB(0, 0, 10, 10);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("raycast via CollisionQuery works", () => {
      const { world, hash, ids } = setupWorld([{ x: 50, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const query = new CollisionQuery(hash);
      const hits = query.raycast(0, 0, 1, 0, 100);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });
  });

  // ─── System Queries ──────────────────────────────────
  describe("system queries", () => {
    it("CollisionSystem.queryRect forwards to hash", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const sys = new CollisionSystem();
      const rect = { left: -5, right: 5, top: -5, bottom: 5 };
      const hits = sys.queryRect(hash, rect);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });

    it("CollisionSystem.queryPoint forwards to hash", () => {
      const { world, hash, ids } = setupWorld([{ x: 0, y: 0, w: 10, h: 10 }]);
      world.update(16);
      const sys = new CollisionSystem();
      const hits = sys.queryPoint(hash, { x: 0, y: 0 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], ids[0]);
    });
  });

  // ─── Canonical Pattern ───────────────────────────────
  describe("canonical pattern", () => {
    it("does not use ctx.column()", () => {
      const src = CollisionSystem.prototype.update.toString();
      assert.ok(!src.includes("ctx.column("));
      assert.ok(!src.includes("ctx.column ("));
    });

    it("uses for-of ctx iteration", () => {
      const src = CollisionSystem.prototype.update.toString();
      assert.ok(src.includes("for (const table of ctx)"));
    });

    it("uses table.getColumn for column access", () => {
      const src = CollisionSystem.prototype.update.toString();
      assert.ok(src.includes("table.getColumn("));
    });

    it("uses _compiled.componentIds for ID lookup", () => {
      const src = CollisionSystem.prototype.update.toString();
      assert.ok(src.includes("_compiled.componentIds"));
    });

    it("iterates rows per table with for loop", () => {
      const src = CollisionSystem.prototype.update.toString();
      assert.ok(src.includes("for (let r = 0; r < count; r"));
    });

    it("uses ctx.resources.get for resource access", () => {
      const src = CollisionSystem.prototype.update.toString();
      assert.ok(src.includes("ctx.resources.get("));
    });

    it("does not use getComponent()", () => {
      const src = CollisionSystem.prototype.update.toString();
      assert.ok(!src.includes("getComponent("));
    });
  });

  // ─── Export Surface ──────────────────────────────────
  describe("export surface", () => {
    it("exports CollisionSystem from ecs/systems", () => {
      assert.strictEqual(CollisionSystem.name, "CollisionSystem");
    });

    it("exports CollisionQuery from ecs/collision", () => {
      assert.strictEqual(CollisionQuery.name, "CollisionQuery");
    });
  });

  // ─── Zero Allocation ─────────────────────────────────
  describe("zero allocation", () => {
    it("no object allocations in update loop", () => {
      const world = createWorld();
      const hash = new SpatialHash();
      world.setResource(SpatialHash, hash);
      const sys = new CollisionSystem();
      world.addSystem(sys);
      const entities = [];
      for (let i = 0; i < 100; i++) {
        entities.push(createEntity(world, [[Transform, { x: i * 20, y: 0 }], [Collider, { width: 10, height: 10 }], [Visible, { value: 1 }]]));
      }
      const beforeKeys = Object.keys(sys);
      world.update(16);
      world.update(16);
      const afterKeys = Object.keys(sys);
      assert.deepStrictEqual(afterKeys, beforeKeys);
    });
  });
});
