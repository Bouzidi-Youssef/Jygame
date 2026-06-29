import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, System } from "../../../ecs/index.js";
import { Transform, Velocity, Collider, EnemyTag, PlayerTag } from "../../../ecs/index.js";
import { MovementSystem } from "../../../ecs/systems/MovementSystem.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Velocity);
  world.register(Collider);
  world.register(EnemyTag);
  world.register(PlayerTag);
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

function pos(e, world) {
  const t = world.getComponent(e, Transform);
  return { x: t.x, y: t.y };
}

describe("MovementSystem (ECS)", () => {
  // ─── Construction ────────────────────────────────────
  describe("construction", () => {
    it("instantiates", () => {
      const sys = new MovementSystem();
      assert.ok(sys instanceof MovementSystem);
    });

    it("extends System", () => {
      const sys = new MovementSystem();
      assert.ok(sys instanceof System);
    });

    it("is enabled by default", () => {
      const sys = new MovementSystem();
      assert.strictEqual(sys.enabled, true);
    });

    it("has static query", () => {
      assert.ok(MovementSystem.query);
    });

    it("static query requires Transform and Velocity", () => {
      const q = MovementSystem.query;
      assert.ok(q.all);
      assert.ok(q.all.includes(Transform));
      assert.ok(q.all.includes(Velocity));
      assert.strictEqual(q.all.length, 2);
    });

    it("has default priority", () => {
      assert.strictEqual(MovementSystem.priority, 0);
    });
  });

  // ─── Scheduler Integration ───────────────────────────
  describe("scheduler integration", () => {
    it("adds to scheduler", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      assert.ok(world._scheduler.has(sys));
    });

    it("removes from scheduler", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      world.removeSystem(sys);
      assert.ok(!world._scheduler.has(sys));
    });

    it("compiles query on add", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      assert.ok(sys._compiled);
      assert.ok(sys._compiled.componentIds.has(Transform));
      assert.ok(sys._compiled.componentIds.has(Velocity));
    });

    it("compileQuery produces stable IDs", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const tid = sys._compiled.componentIds.get(Transform);
      const vid = sys._compiled.componentIds.get(Velocity);
      assert.strictEqual(tid, world.registry.getId(Transform));
      assert.strictEqual(vid, world.registry.getId(Velocity));
    });

    it("scheduler calls update with context", () => {
      const world = createWorld();
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      let ctxReceived = null;
      class SpySystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) { ctxReceived = ctx; }
      }
      world.addSystem(new SpySystem());
      world.update(16);
      assert.ok(ctxReceived);
      assert.strictEqual(ctxReceived.world, world);
    });
  });

  // ─── Static Query ────────────────────────────────────
  describe("static query compilation", () => {
    it("compiledIds contains Transform component ID", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      world.createEntity();
      assert.ok(sys._compiled.componentIds.has(Transform));
    });

    it("compiledIds contains Velocity component ID", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      assert.ok(sys._compiled.componentIds.has(Velocity));
    });

    it("query matches only entities with both components", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const e1 = createEntity(world, [[Transform], [Velocity]]);
      const e2 = createEntity(world, [[Transform]]);
      const e3 = createEntity(world, [[Velocity]]);
      world.update(16);
      const ids = world.queryEngine.getTables(sys.query);
      let count = 0;
      for (const t of ids) count += t.count;
      assert.strictEqual(count, 1);
    });
  });

  // ─── Movement on X ───────────────────────────────────
  describe("movement on X", () => {
    it("moves entity along positive X", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 10, y: 20 }], [Velocity, { x: 5, y: 0 }]]);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 10 + 5 * 16);
      assert.strictEqual(p.y, 20);
    });

    it("moves entity along X repeatedly", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      for (let i = 0; i < 5; i++) world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 2 * 16 * 5);
    });

    it("preserves Y when moving on X", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 100 }], [Velocity, { x: 3, y: 0 }]]);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.y, 100);
    });

    it("handles large X velocity", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1000, y: 0 }]]);
      world.update(1);
      const p = pos(e, world);
      assert.strictEqual(p.x, 1000);
    });
  });

  // ─── Movement on Y ───────────────────────────────────
  describe("movement on Y", () => {
    it("moves entity along positive Y", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 0, y: 5 }]]);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 0);
      assert.strictEqual(p.y, 80);
    });

    it("moves entity along Y repeatedly", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 0, y: 3 }]]);
      for (let i = 0; i < 10; i++) world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.y, 300);
    });

    it("preserves X when moving on Y", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 50, y: 0 }], [Velocity, { x: 0, y: 2 }]]);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 50);
    });
  });

  // ─── Diagonal Movement ───────────────────────────────
  describe("diagonal movement", () => {
    it("moves entity diagonally", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 3, y: 4 }]]);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 30);
      assert.strictEqual(p.y, 40);
    });

    it("diagonal movement with non-uniform velocities", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 100, y: 200 }], [Velocity, { x: 2, y: 7 }]]);
      world.update(5);
      const p = pos(e, world);
      assert.strictEqual(p.x, 110);
      assert.strictEqual(p.y, 235);
    });

    it("diagonal adds correctly over multiple frames", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 1 }]]);
      world.update(10);
      world.update(10);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 30);
      assert.strictEqual(p.y, 30);
    });
  });

  // ─── Zero Velocity ───────────────────────────────────
  describe("zero velocity", () => {
    it("no movement with zero velocity", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 10, y: 20 }], [Velocity, { x: 0, y: 0 }]]);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 10);
      assert.strictEqual(p.y, 20);
    });

    it("no movement with zero velocity multiple frames", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 5, y: 5 }], [Velocity, { x: 0, y: 0 }]]);
      for (let i = 0; i < 100; i++) world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 5);
      assert.strictEqual(p.y, 5);
    });
  });

  // ─── Negative Velocity ───────────────────────────────
  describe("negative velocity", () => {
    it("moves entity backward on X", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 100, y: 0 }], [Velocity, { x: -5, y: 0 }]]);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 50);
    });

    it("moves entity backward on Y", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 100 }], [Velocity, { x: 0, y: -4 }]]);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.y, 60);
    });

    it("negative velocity in both axes", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 50, y: 50 }], [Velocity, { x: -2, y: -3 }]]);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 30);
      assert.strictEqual(p.y, 20);
    });
  });

  // ─── Fractional dt ───────────────────────────────────
  describe("fractional dt", () => {
    it("moves with fractional dt", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(0.5);
      const p = pos(e, world);
      assert.strictEqual(p.x, 5);
    });

    it("moves with very small dt", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 60, y: 0 }]]);
      world.update(1 / 60);
      const p = pos(e, world);
      assert.strictEqual(p.x, 1);
    });

    it("moves with decimal dt", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 3, y: 0 }]]);
      world.update(1.5);
      const p = pos(e, world);
      assert.strictEqual(p.x, 4.5);
    });

    it("handles pi as dt", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(Math.PI);
      const p = pos(e, world);
      const expected = Math.fround(Math.PI);
      assert.strictEqual(p.x, expected);
    });
  });

  // ─── Zero dt ─────────────────────────────────────────
  describe("zero dt", () => {
    it("no movement with zero dt", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 10, y: 10 }], [Velocity, { x: 100, y: 100 }]]);
      world.update(0);
      const p = pos(e, world);
      assert.strictEqual(p.x, 10);
      assert.strictEqual(p.y, 10);
    });

    it("no movement with zero dt repeatedly", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 5, y: 5 }], [Velocity, { x: 50, y: 50 }]]);
      for (let i = 0; i < 10; i++) world.update(0);
      const p = pos(e, world);
      assert.strictEqual(p.x, 5);
      assert.strictEqual(p.y, 5);
    });
  });

  // ─── Multiple Entities ───────────────────────────────
  describe("multiple entities", () => {
    it("moves all entities independently", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const e2 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      world.update(10);
      const p1 = pos(e1, world);
      const p2 = pos(e2, world);
      assert.strictEqual(p1.x, 10);
      assert.strictEqual(p2.x, 20);
    });

    it("moves entities with different velocities", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 1 }]]);
      const e2 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 10 }]]);
      world.update(10);
      const p1 = pos(e1, world);
      const p2 = pos(e2, world);
      assert.strictEqual(p1.x, 50);
      assert.strictEqual(p1.y, 10);
      assert.strictEqual(p2.x, 20);
      assert.strictEqual(p2.y, 100);
    });

    it("many entities with same velocity stay in formation", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const entities = [];
      for (let i = 0; i < 10; i++) {
        const e = createEntity(world, [[Transform, { x: i * 10, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
        entities.push(e);
      }
      world.update(16);
      for (let i = 0; i < entities.length; i++) {
        const p = pos(entities[i], world);
        assert.strictEqual(p.x, i * 10 + 16);
      }
    });
  });

  // ─── Multiple Archetypes ─────────────────────────────
  describe("multiple archetypes", () => {
    it("processes only entities with Transform+Velocity", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const e2 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Collider, { width: 10, height: 10 }]]);
      const e3 = createEntity(world, [[Velocity]]);
      world.update(10);
      const p1 = pos(e1, world);
      assert.strictEqual(p1.x, 10);
      assert.strictEqual(world.hasComponent(e2, Transform), true);
    });

    it("handles entities in different archetypes with same components", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const e2 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }], [Collider]]);
      world.update(10);
      const p1 = pos(e1, world);
      const p2 = pos(e2, world);
      assert.strictEqual(p1.x, 10);
      assert.strictEqual(p2.x, 20);
    });

    it("processes multiple archetypes containing Transform+Velocity", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 1, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const e2 = createEntity(world, [[Transform, { x: 2, y: 0 }], [Velocity, { x: 1, y: 0 }], [Collider]]);
      const e3 = createEntity(world, [[Transform, { x: 3, y: 0 }], [Velocity, { x: 1, y: 0 }], [EnemyTag]]);
      world.update(10);
      assert.strictEqual(pos(e1, world).x, 11);
      assert.strictEqual(pos(e2, world).x, 12);
      assert.strictEqual(pos(e3, world).x, 13);
    });
  });

  // ─── Missing Velocity ────────────────────────────────
  describe("missing Velocity", () => {
    it("entity without Velocity is not moved", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 100, y: 100 }]]);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100);
      assert.strictEqual(p.y, 100);
    });

    it("entity without Velocity is not visited", () => {
      const world = createWorld();
      let visited = 0;
      class SpySystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) { visited = ctx.entityCount; }
      }
      world.addSystem(new SpySystem());
      createEntity(world, [[Transform, { x: 0, y: 0 }]]);
      world.update(16);
      assert.strictEqual(visited, 0);
    });

    it("entity that loses Velocity stops moving", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(10);
      world.removeComponent(e, Velocity);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100);
    });
  });

  // ─── Missing Transform ───────────────────────────────
  describe("missing Transform", () => {
    it("entity without Transform is not processed", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Velocity, { x: 5, y: 5 }]]);
      world.update(16);
      const v = world.getComponent(e, Velocity);
      assert.strictEqual(v.x, 5);
      assert.strictEqual(v.y, 5);
    });

    it("entity without Transform is not visited", () => {
      const world = createWorld();
      let visited = 0;
      class SpySystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) { visited = ctx.entityCount; }
      }
      world.addSystem(new SpySystem());
      createEntity(world, [[Velocity]]);
      world.update(16);
      assert.strictEqual(visited, 0);
    });

    it("entity that loses Transform stops being processed", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(10);
      world.removeComponent(e, Transform);
      world.update(10);
      const v = world.getComponent(e, Velocity);
      assert.strictEqual(v.x, 10);
    });
  });

  // ─── Disabled System ─────────────────────────────────
  describe("disabled system", () => {
    it("disabled system does not move entities", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      sys.enabled = false;
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 0);
    });

    it("re-enabled system resumes movement", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      sys.enabled = false;
      world.update(10);
      sys.enabled = true;
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100);
    });

    it("toggle disable/enable mid-frame works", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      world.update(10);
      sys.enabled = false;
      world.update(10);
      sys.enabled = true;
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100);
    });

    it("disabled by default does not move on first frame", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      sys.enabled = false;
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(16);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 0);
    });
  });

  // ─── Priority Ordering ───────────────────────────────
  describe("priority ordering", () => {
    it("has default priority 0", () => {
      assert.strictEqual(MovementSystem.priority, 0);
    });

    it("systems run in priority order", () => {
      const order = [];
      class LowSystem extends System {
        static priority = -10;
        update(ctx, dt) { order.push("low"); }
      }
      class HighSystem extends System {
        static priority = 10;
        update(ctx, dt) { order.push("high"); }
      }
      const world = createWorld();
      world.addSystem(new LowSystem());
      world.addSystem(new MovementSystem());
      world.addSystem(new HighSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(16);
      assert.strictEqual(order[0], "low");
      assert.strictEqual(order[order.length - 1], "high");
    });

    it("movement system runs at priority 0", () => {
      const order = [];
      class NegSystem extends System {
        static priority = -5;
        update(ctx, dt) { order.push("neg"); }
      }
      class PosSystem extends System {
        static priority = 5;
        update(ctx, dt) { order.push("pos"); }
      }
      const world = createWorld();
      world.addSystem(new NegSystem());
      world.addSystem(new MovementSystem());
      world.addSystem(new PosSystem());
      createEntity(world, [[Transform], [Velocity]]);
      world.update(16);
      assert.strictEqual(order[0], "neg");
      assert.strictEqual(order[1], "pos");
    });
  });

  // ─── Archetype Migration ─────────────────────────────
  describe("archetype migration", () => {
    it("entity gains Velocity mid-frame and moves in subsequent frames", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }]]);
      world.update(10);
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 5, y: 0 });
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 50);
    });

    it("entity loses Velocity mid-frame and stops", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(10);
      world.removeComponent(e, Velocity);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100);
    });

    it("entity gains Transform mid-frame and starts moving", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Velocity, { x: 3, y: 0 }]]);
      world.update(10);
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x: 0, y: 0 });
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 30);
    });

    it("entity loses Transform mid-frame and stops", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      world.update(10);
      world.removeComponent(e, Transform);
      world.update(10);
      assert.ok(world.hasComponent(e, Velocity));
    });

    it("adding Collider to moving entity does not affect movement", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      world.update(10);
      world.addComponent(e, Collider);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 40);
    });

    it("adding tag does not affect movement", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(10);
      world.addComponent(e, EnemyTag);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 20);
    });

    it("multiple archetype hops preserve movement", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(10);
      world.addComponent(e, Collider);
      world.update(10);
      world.addComponent(e, EnemyTag);
      world.update(10);
      world.removeComponent(e, Collider);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 40);
    });

    it("re-add removed component restores movement", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      world.update(10);
      world.removeComponent(e, Velocity);
      world.update(10);
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 5, y: 0 });
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100);
    });

    it("add component to entity not in system query (no Velocity) then add Velocity", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }]]);
      world.addComponent(e, Collider);
      world.update(10);
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 2, y: 0 });
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 20);
    });
  });

  // ─── Add/Remove Component During Runtime ─────────────
  describe("add/remove component during runtime", () => {
    it("add component between frames works", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }]]);
      world.update(10);
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 3, y: 0 });
      world.update(10);
      assert.strictEqual(pos(e, world).x, 30);
    });

    it("remove component between frames stops processing", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      world.update(10);
      world.removeComponent(e, Velocity);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 50);
    });

    it("remove then re-add component between frames", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      world.update(10);
      world.removeComponent(e, Velocity);
      world.update(10);
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 2, y: 0 });
      world.update(10);
      assert.strictEqual(pos(e, world).x, 40);
    });

    it("add component at entity creation before system runs", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 5, y: 0 }]]);
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 1, y: 0 });
      world.update(10);
      assert.strictEqual(pos(e, world).x, 15);
    });
  });

  // ─── Repeated Updates ────────────────────────────────
  describe("repeated updates", () => {
    it("movement accumulates over many frames", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      for (let i = 0; i < 100; i++) world.update(1);
      assert.strictEqual(pos(e, world).x, 200);
    });

    it("movement with alternating dt values", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(5);
      world.update(15);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 300);
    });

    it("1000 updates with small dt", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      for (let i = 0; i < 1000; i++) world.update(0.1);
      const result = pos(e, world).x;
      const expected = Math.fround(100);
      assert.ok(Math.abs(result - expected) < 0.001);
    });
  });

  // ─── Deterministic Execution ─────────────────────────
  describe("deterministic execution", () => {
    it("same inputs produce same outputs", () => {
      const run = () => {
        const world = createWorld();
        world.addSystem(new MovementSystem());
        const e = createEntity(world, [[Transform, { x: 10, y: 20 }], [Velocity, { x: 3, y: 7 }]]);
        world.update(5);
        world.update(3);
        world.update(2);
        return pos(e, world);
      };
      const r1 = run();
      const r2 = run();
      assert.deepStrictEqual(r1, r2);
    });

    it("order of entity creation does not affect movement", () => {
      const run = (order) => {
        const world = createWorld();
        world.addSystem(new MovementSystem());
        const entities = order.map(() => createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]));
        world.update(10);
        return entities.map(e => pos(e, world).x);
      };
      const r1 = run([0, 1, 2]);
      const r2 = run([2, 0, 1]);
      assert.deepStrictEqual(r1, r2);
    });
  });

  // ─── Zero Allocations ────────────────────────────────
  describe("zero allocations during update", () => {
    it("update does not add new properties to system", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const beforeKeys = Object.keys(sys);
      world.update(16);
      world.update(16);
      world.update(16);
      const afterKeys = Object.keys(sys);
      assert.deepStrictEqual(afterKeys, beforeKeys);
    });

    it("update mutates columns in place", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      const tBefore = world.getComponent(e, Transform);
      world.update(10);
      const tAfter = world.getComponent(e, Transform);
      assert.strictEqual(tBefore, tAfter);
    });

    it("update does not create new SystemContext each frame", () => {
      const world = createWorld();
      let lastCtx = null;
      let same = true;
      class SpySystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          if (lastCtx) same = same && (ctx === lastCtx);
          lastCtx = ctx;
        }
      }
      world.addSystem(new SpySystem());
      createEntity(world, [[Transform], [Velocity]]);
      world.update(16);
      world.update(16);
      world.update(16);
      assert.ok(same);
    });

    it("column returns same typed array each frame", () => {
      const world = createWorld();
      let cols = [];
      class SpySystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          cols.push(ctx.column(Transform, "x"));
        }
      }
      world.addSystem(new SpySystem());
      createEntity(world, [[Transform], [Velocity]]);
      world.update(16);
      world.update(16);
      assert.strictEqual(cols[1], cols[0]);
    });
  });

  // ─── Large Iteration ─────────────────────────────────
  describe("large iteration", () => {
    it("processes 100 entities", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const es = [];
      for (let i = 0; i < 100; i++) {
        es.push(createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]));
      }
      world.update(10);
      for (const e of es) {
        assert.strictEqual(pos(e, world).x, 10);
      }
    });

    it("processes 1000 entities", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const es = [];
      for (let i = 0; i < 1000; i++) {
        es.push(createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]));
      }
      world.update(10);
      for (const e of es) {
        assert.strictEqual(pos(e, world).x, 10);
      }
    });

    it("processes 1000 entities with diverse velocities", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const es = [];
      for (let i = 0; i < 1000; i++) {
        es.push(createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: i % 10, y: 0 }]]));
      }
      world.update(10);
      for (let i = 0; i < 1000; i++) {
        assert.strictEqual(pos(es[i], world).x, (i % 10) * 10);
      }
    });

    it("processes 1000 entities across multiple archetypes", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const es = [];
      for (let i = 0; i < 1000; i++) {
        const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
        if (i % 2 === 0) world.addComponent(e, Collider);
        if (i % 3 === 0) world.addComponent(e, EnemyTag);
        es.push(e);
      }
      world.update(10);
      for (const e of es) {
        assert.strictEqual(pos(e, world).x, 10);
      }
    });

    it("1000 entities with repeated updates", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const es = [];
      for (let i = 0; i < 1000; i++) {
        es.push(createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]));
      }
      for (let f = 0; f < 100; f++) world.update(1);
      for (const e of es) {
        assert.strictEqual(pos(e, world).x, 100);
      }
    });
  });

  // ─── Edge Cases ──────────────────────────────────────
  describe("edge cases", () => {
    it("entity with zero Transform does not crash", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 0, y: 0 }]]);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 0);
      assert.strictEqual(p.y, 0);
    });

    it("negative dt does not crash", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 100, y: 100 }], [Velocity, { x: 10, y: 10 }]]);
      world.update(-10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100 - 100);
      assert.strictEqual(p.y, 100 - 100);
    });

    it("Infinity velocity does not crash", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: Infinity, y: 0 }]]);
      world.update(1);
      const p = pos(e, world);
      assert.strictEqual(p.x, Infinity);
    });

    it("NaN in velocity does not crash columns", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: NaN, y: 0 }]]);
      world.update(1);
      const p = pos(e, world);
      assert.ok(Number.isNaN(p.x));
    });

    it("empty world does not crash", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      world.update(16);
      world.update(16);
      assert.ok(true);
    });

    it("world with only non-matching entities does not crash", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = world.createEntity();
      world.addComponent(e, Collider);
      world.update(16);
      assert.ok(true);
    });

    it("system with no entities in query returns early", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      world.createEntity();
      world.update(16);
      assert.ok(true);
    });

    it("velocity carries over across frames", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(10);
      world.update(10);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 300);
    });

    it("transform x and y are independent", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 100, y: 200 }], [Velocity, { x: 3, y: 5 }]]);
      world.update(10);
      const p = pos(e, world);
      assert.strictEqual(p.x, 130);
      assert.strictEqual(p.y, 250);
    });
  });

  // ─── Entity Lifecycle ───────────────────────────────
  describe("entity lifecycle", () => {
    it("entity created after system added is processed", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 50);
    });

    it("destroyed entity stops accumulating", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(10);
      world.destroyEntity(e);
      world.update(10);
    });

    it("entity created mid-frame is processed next frame", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      world.update(10);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 3, y: 0 }]]);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 30);
    });
  });

  // ─── System Lifecycle ───────────────────────────────
  describe("system lifecycle", () => {
    it("add system then entities works", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 10);
    });

    it("remove system stops movement", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      world.update(10);
      world.removeSystem(sys);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 50);
    });

    it("remove and re-add system", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      world.update(10);
      world.removeSystem(sys);
      world.update(10);
      world.addSystem(sys);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 40);
    });

    it("system with priority runs in correct order", () => {
      const world = createWorld();
      const order = [];
      class PreMove extends System {
        static priority = -1;
        update(ctx, dt) { order.push("pre"); }
      }
      class PostMove extends System {
        static priority = 1;
        update(ctx, dt) { order.push("post"); }
      }
      world.addSystem(new PreMove());
      world.addSystem(new MovementSystem());
      world.addSystem(new PostMove());
      createEntity(world, [[Transform], [Velocity]]);
      world.update(16);
      assert.strictEqual(order[0], "pre");
      assert.strictEqual(order[1], "post");
    });
  });

  // ─── Non-Matching Entities ──────────────────────────
  describe("non-matching entities", () => {
    it("entity with only Transform is not moved", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 100, y: 100 }]]);
      world.update(16);
      const p = pos(e, world);
      assert.strictEqual(p.x, 100);
      assert.strictEqual(p.y, 100);
    });

    it("entity with only Velocity is not moved", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Velocity, { x: 10, y: 10 }]]);
      world.update(16);
    });

    it("entity with neither Transform nor Velocity is ignored", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Collider]]);
      world.update(16);
    });

    it("mixed matching and non-matching entities", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      createEntity(world, [[Collider]]);
      createEntity(world, [[Transform]]);
      createEntity(world, [[Velocity]]);
      const e2 = createEntity(world, [[Transform, { x: 1, y: 0 }], [Velocity, { x: 3, y: 0 }]]);
      world.update(10);
      assert.strictEqual(pos(e1, world).x, 20);
      assert.strictEqual(pos(e2, world).x, 31);
    });
  });

  // ─── Velocity Changes ───────────────────────────────
  describe("velocity changes", () => {
    it("changing velocity mid-frame affects next frame", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(10);
      world.setComponent(e, Velocity, { x: 20, y: 0 });
      world.update(10);
      assert.strictEqual(pos(e, world).x, 300);
    });

    it("setting velocity to zero stops movement", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }]]);
      world.update(10);
      world.setComponent(e, Velocity, { x: 0, y: 0 });
      world.update(10);
      assert.strictEqual(pos(e, world).x, 100);
    });

    it("changing from zero to positive velocity starts movement", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 0, y: 0 }]]);
      world.update(10);
      world.setComponent(e, Velocity, { x: 5, y: 0 });
      world.update(10);
      assert.strictEqual(pos(e, world).x, 50);
    });

    it("velocity is unchanged by movement system", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 7, y: 3 }]]);
      world.update(10);
      const v = world.getComponent(e, Velocity);
      assert.strictEqual(v.x, 7);
      assert.strictEqual(v.y, 3);
    });
  });

  // ─── Other Components Unaffected ─────────────────────
  describe("other components unaffected", () => {
    it("Collider component is not modified by movement system", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }], [Collider, { width: 50, height: 100 }]]);
      world.update(10);
      const c = world.getComponent(e, Collider);
      assert.strictEqual(c.width, 50);
      assert.strictEqual(c.height, 100);
    });

    it("transform rotation and scale are not modified", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0, rotation: 1.5, scaleX: 2, scaleY: 3 }], [Velocity, { x: 10, y: 20 }]]);
      world.update(10);
      const t = world.getComponent(e, Transform);
      assert.strictEqual(t.rotation, 1.5);
      assert.strictEqual(t.scaleX, 2);
      assert.strictEqual(t.scaleY, 3);
    });
  });

  // ─── Multiple Worlds ────────────────────────────────
  describe("multiple worlds", () => {
    it("two worlds with independent movement", () => {
      const w1 = createWorld();
      const w2 = createWorld();
      w1.addSystem(new MovementSystem());
      w2.addSystem(new MovementSystem());
      const e1 = createEntity(w1, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const e2 = createEntity(w2, [[Transform, { x: 100, y: 0 }], [Velocity, { x: -1, y: 0 }]]);
      w1.update(10);
      w2.update(10);
      assert.strictEqual(pos(e1, w1).x, 10);
      assert.strictEqual(pos(e2, w2).x, 90);
    });

    it("worlds with different dt values", () => {
      const w1 = createWorld();
      const w2 = createWorld();
      w1.addSystem(new MovementSystem());
      w2.addSystem(new MovementSystem());
      const e1 = createEntity(w1, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const e2 = createEntity(w2, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      w1.update(10);
      w2.update(20);
      assert.strictEqual(pos(e1, w1).x, 10);
      assert.strictEqual(pos(e2, w2).x, 20);
    });

    it("system removed from one world does not affect other", () => {
      const w1 = createWorld();
      const w2 = createWorld();
      const sys = new MovementSystem();
      w1.addSystem(sys);
      w2.addSystem(new MovementSystem());
      const e1 = createEntity(w1, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      const e2 = createEntity(w2, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 5, y: 0 }]]);
      w1.update(10);
      w2.update(10);
      w1.removeSystem(sys);
      w1.update(10);
      w2.update(10);
      assert.strictEqual(pos(e1, w1).x, 50);
      assert.strictEqual(pos(e2, w2).x, 100);
    });
  });

  // ─── Varying dt Patterns ────────────────────────────
  describe("varying dt patterns", () => {
    it("alternating large and small dt", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(100);
      world.update(0.1);
      world.update(50);
      const result = pos(e, world).x;
      const expected = Math.fround(150.1);
      assert.strictEqual(result, expected);
    });

    it("dt pattern matches expected total", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 3 }]]);
      const dts = [10, 20, 5, 15];
      let sum = 0;
      for (const dt of dts) {
        world.update(dt);
        sum += dt;
      }
      const p = pos(e, world);
      assert.strictEqual(p.x, 2 * sum);
      assert.strictEqual(p.y, 3 * sum);
    });

    it("dt sums correctly over irregular intervals", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(1);
      world.update(2);
      world.update(3);
      world.update(4);
      world.update(5);
      assert.strictEqual(pos(e, world).x, 15);
    });
  });

  // ─── Combined Scenarios ─────────────────────────────
  describe("combined scenarios", () => {
    it("only matching entities move, others stay", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }]]);
      const e2 = createEntity(world, [[Transform, { x: 100, y: 0 }]]);
      const e3 = createEntity(world, [[Velocity, { x: 5, y: 0 }]]);
      world.update(10);
      assert.strictEqual(pos(e1, world).x, 20);
      assert.strictEqual(pos(e2, world).x, 100);
    });

    it("entities with extra components move correctly", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 3, y: 0 }], [Collider, { width: 10, height: 10 }], [EnemyTag]]);
      world.update(10);
      assert.strictEqual(pos(e, world).x, 30);
    });

    it("multiple archetypes all move at correct rates", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e1 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const e2 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }], [Collider]]);
      const e3 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 3, y: 0 }], [EnemyTag]]);
      const e4 = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 4, y: 0 }], [Collider, { width: 10, height: 10 }]]);
      world.addComponent(e4, EnemyTag);
      world.update(10);
      assert.strictEqual(pos(e1, world).x, 10);
      assert.strictEqual(pos(e2, world).x, 20);
      assert.strictEqual(pos(e3, world).x, 30);
      assert.strictEqual(pos(e4, world).x, 40);
    });
  });

  // ─── Precision ──────────────────────────────────────
  describe("floating point precision", () => {
    it("f32 columns accumulate predictably", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 0.1, y: 0 }]]);
      for (let i = 0; i < 10; i++) world.update(1);
      const result = pos(e, world).x;
      const expected = Math.fround(1);
      assert.ok(Math.abs(result - expected) < 0.0001);
    });

    it("f32 large dt does not overflow", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1e10, y: 0 }]]);
      world.update(1);
      const result = pos(e, world).x;
      assert.ok(result > 0);
    });

    it("f32 very small velocities accumulate", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1e-6, y: 0 }]]);
      for (let i = 0; i < 1000; i++) world.update(1);
      const result = pos(e, world).x;
      assert.ok(result > 0);
    });
  });

  // ─── Static Properties ──────────────────────────────
  describe("static properties", () => {
    it("priority is 0 by default", () => {
      assert.strictEqual(MovementSystem.priority, 0);
    });

    it("query.all contains Transform and Velocity", () => {
      const q = MovementSystem.query;
      assert.ok(q.all.includes(Transform));
      assert.ok(q.all.includes(Velocity));
      assert.strictEqual(q.all.length, 2);
    });

    it("query has no any or none constraints", () => {
      const q = MovementSystem.query;
      assert.strictEqual(q.any, undefined);
      assert.strictEqual(q.none, undefined);
    });
  });

  // ─── No Side Effects ────────────────────────────────
  describe("no side effects", () => {
    it("movement system does not modify scheduler state", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      createEntity(world, [[Transform], [Velocity]]);
      const before = world._scheduler.systemCount;
      world.update(16);
      assert.strictEqual(world._scheduler.systemCount, before);
    });

    it("movement system does not create new tables", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      createEntity(world, [[Transform], [Velocity]]);
      const before = world.archetypeSystem.archetypeCount;
      world.update(16);
      assert.strictEqual(world.archetypeSystem.archetypeCount, before);
    });
  });

  // ─── Compiled Metadata ──────────────────────────────
  describe("compiled metadata", () => {
    it("system._compiled is set after addSystem", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      assert.strictEqual(sys._compiled, null);
      world.addSystem(sys);
      assert.ok(sys._compiled);
    });

    it("system._compiled is frozen", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      assert.ok(Object.isFrozen(sys._compiled));
    });

    it("system._compiled.query is a compiled query object", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      assert.ok(sys._compiled.query);
    });

    it("system._compiled.componentIds is a Map with correct keys", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const ids = sys._compiled.componentIds;
      assert.ok(ids instanceof Map);
      assert.ok(ids.has(Transform));
      assert.ok(ids.has(Velocity));
      assert.strictEqual(ids.size, 2);
    });

    it("system._compiled.componentIds maps to numeric IDs", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const tid = sys._compiled.componentIds.get(Transform);
      const vid = sys._compiled.componentIds.get(Velocity);
      assert.strictEqual(typeof tid, "number");
      assert.strictEqual(typeof vid, "number");
      assert.strictEqual(tid, world.registry.getId(Transform));
      assert.strictEqual(vid, world.registry.getId(Velocity));
    });

    it("system.query getter returns compiled query", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      assert.strictEqual(sys.query, sys._compiled.query);
    });

    it("system._compiled contains priority", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      assert.strictEqual(sys._compiled.priority, 0);
    });

    it("removing and re-adding system recompiles metadata", () => {
      const world = createWorld();
      const sys = new MovementSystem();
      world.addSystem(sys);
      const c1 = sys._compiled;
      world.removeSystem(sys);
      world.addSystem(sys);
      const c2 = sys._compiled;
      assert.ok(c2);
      assert.notStrictEqual(c1, c2);
    });

    it("system without query has null compiled metadata", () => {
      class NoQuerySystem extends System { update(ctx, dt) {} }
      const world = createWorld();
      const sys = new NoQuerySystem();
      world.addSystem(sys);
      assert.strictEqual(sys._compiled, null);
    });
  });

  // ─── SystemContext Iterable ──────────────────────────
  describe("SystemContext iterable", () => {
    it("ctx is iterable via for-of", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const tables = [];
      class IterSystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          for (const table of ctx) {
            tables.push(table);
          }
        }
      }
      world.addSystem(new IterSystem());
      world.update(16);
      assert.ok(tables.length > 0);
    });

    it("for-of iterates same tables as ctx.tables()", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      const fromForOf = [];
      const fromTables = [];
      class CompareSystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          for (const table of ctx) fromForOf.push(table);
          for (const table of ctx.tables()) fromTables.push(table);
        }
      }
      world.addSystem(new CompareSystem());
      world.update(16);
      assert.strictEqual(fromForOf.length, fromTables.length);
      for (let i = 0; i < fromForOf.length; i++) {
        assert.strictEqual(fromForOf[i], fromTables[i]);
      }
    });

    it("for-of iteration is allocation-free (uses same tables reference)", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      const e = createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      let iterCount = 0;
      class IterSystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          for (const _ of ctx) iterCount++;
        }
      }
      world.addSystem(new IterSystem());
      world.update(16);
      assert.strictEqual(iterCount, 1);
    });

    it("for-of handles multiple archetypes", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      createEntity(world, [[Transform, { x: 0, y: 0 }], [Velocity, { x: 2, y: 0 }], [Collider]]);
      let tableCount = 0;
      class IterSystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          for (const _ of ctx) tableCount++;
        }
      }
      world.addSystem(new IterSystem());
      world.update(16);
      assert.strictEqual(tableCount, 2);
    });

    it("for-of on empty query is no-op", () => {
      const world = createWorld();
      world.addSystem(new MovementSystem());
      let called = false;
      class IterSystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          for (const _ of ctx) called = true;
        }
      }
      world.addSystem(new IterSystem());
      world.update(16);
      assert.ok(!called);
    });
  });

  // ─── Canonical Pattern Verification ──────────────────
  describe("canonical pattern", () => {
    it("MovementSystem does not use ctx.column()", () => {
      const src = MovementSystem.prototype.update.toString();
      assert.ok(!src.includes("ctx.column("));
      assert.ok(!src.includes("ctx.column ("));
    });

    it("MovementSystem uses ctx.tables() for iteration", () => {
      const src = MovementSystem.prototype.update.toString();
      assert.ok(src.includes("ctx.tables()"));
    });

    it("MovementSystem uses table.getColumn for column access", () => {
      const src = MovementSystem.prototype.update.toString();
      assert.ok(src.includes("table.getColumn("));
    });

    it("MovementSystem uses _compiled.componentIds for ID lookup", () => {
      const src = MovementSystem.prototype.update.toString();
      assert.ok(src.includes("_compiled.componentIds"));
    });

    it("MovementSystem iterates rows per table with for loop", () => {
      const src = MovementSystem.prototype.update.toString();
      assert.ok(src.includes("for (let r = 0; r < count; r"));
    });

    it("SystemContext.column() still works for backward compat", () => {
      const world = createWorld();
      let col = null;
      class ColumnTestSystem extends System {
        static query = { all: [Transform, Velocity] };
        update(ctx, dt) {
          col = ctx.column(Transform, "x");
        }
      }
      world.addSystem(new ColumnTestSystem());
      createEntity(world, [[Transform, { x: 42, y: 0 }], [Velocity, { x: 1, y: 0 }]]);
      world.update(16);
      assert.ok(col instanceof Float32Array);
      assert.strictEqual(col[0], 42);
    });
  });

  // ─── Export ──────────────────────────────────────────
  describe("export surface", () => {
    it("exports MovementSystem from ecs/systems", () => {
      assert.strictEqual(MovementSystem.name, "MovementSystem");
    });
  });
});
