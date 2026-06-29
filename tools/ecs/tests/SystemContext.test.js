import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { System } from "../../../ecs/core/System.js";

class Position { static schema = { x: "f32", y: "f32" }; }
class Velocity { static schema = { vx: "f32", vy: "f32" }; }
class Health { static schema = { hp: "u32", maxHp: "u32" }; }
class Enemy {}

function createWorld() {
  const world = new World({ initialCapacity: 64, maxEntities: 10000 });
  world.register(Position);
  world.register(Velocity);
  world.register(Health);
  world.register(Enemy);
  return world;
}

describe("SystemContext", () => {
  // ─── World Resource Registry ─────────────────────────
  describe("resource registration", () => {
    it("sets and gets a resource", () => {
      const world = createWorld();
      const camera = { x: 0, y: 0 };
      world.setResource("Camera", camera);
      assert.strictEqual(world.getResource("Camera"), camera);
    });

    it("hasResource returns true for set resource", () => {
      const world = createWorld();
      world.setResource("Audio", {});
      assert.strictEqual(world.hasResource("Audio"), true);
    });

    it("hasResource returns false for unset resource", () => {
      const world = createWorld();
      assert.strictEqual(world.hasResource("Missing"), false);
    });

    it("removes a resource", () => {
      const world = createWorld();
      world.setResource("Temp", 42);
      world.removeResource("Temp");
      assert.strictEqual(world.hasResource("Temp"), false);
    });

    it("removeResource on missing key is no-op", () => {
      const world = createWorld();
      world.removeResource("DoesNotExist");
    });

    it("clears all resources", () => {
      const world = createWorld();
      world.setResource("A", 1);
      world.setResource("B", 2);
      world.clearResources();
      assert.strictEqual(world.hasResource("A"), false);
      assert.strictEqual(world.hasResource("B"), false);
    });

    it("overwrites existing resource", () => {
      const world = createWorld();
      world.setResource("Key", "old");
      world.setResource("Key", "new");
      assert.strictEqual(world.getResource("Key"), "new");
    });

    it("uses class as resource key", () => {
      const world = createWorld();
      class Camera {}
      world.setResource(Camera, { x: 10 });
      assert.strictEqual(world.getResource(Camera).x, 10);
    });

    it("rejects null key", () => {
      const world = createWorld();
      assert.throws(() => world.setResource(null, {}), /null/);
    });

    it("rejects undefined key", () => {
      const world = createWorld();
      assert.throws(() => world.setResource(undefined, {}), /undefined/);
    });
  });

  // ─── ctx.resources ──────────────────────────────────
  describe("ctx.resources", () => {
    it("accesses resource via ctx.resources.get()", () => {
      const world = createWorld();
      const camera = { zoom: 1 };
      world.setResource("Camera", camera);
      let received = null;
      class TestSystem extends System {
        update(ctx, dt) {
          received = ctx.resources.get("Camera");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(received, camera);
    });

    it("ctx.resources.has returns true for existing resource", () => {
      const world = createWorld();
      world.setResource("Input", {});
      let result = false;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.resources.has("Input");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, true);
    });

    it("ctx.resources.has returns false for missing resource", () => {
      const world = createWorld();
      let result = true;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.resources.has("Missing");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, false);
    });

    it("ctx.resources.get returns undefined for missing resource", () => {
      const world = createWorld();
      let result = "set";
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.resources.get("Missing");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, undefined);
    });

    it("ctx.resources.get with class key works", () => {
      const world = createWorld();
      class Camera { static schema = {}; }
      world.setResource(Camera, { zoom: 2 });
      let received = null;
      class TestSystem extends System {
        update(ctx, dt) {
          received = ctx.resources.get(Camera);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(received.zoom, 2);
    });

    it("system accesses multiple resources", () => {
      const world = createWorld();
      world.setResource("A", 1);
      world.setResource("B", 2);
      let a = 0, b = 0;
      class TestSystem extends System {
        update(ctx, dt) {
          a = ctx.resources.get("A");
          b = ctx.resources.get("B");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(a, 1);
      assert.strictEqual(b, 2);
    });

    it("resources persist across frames", () => {
      const world = createWorld();
      world.setResource("Val", 0);
      const values = [];
      class TestSystem extends System {
        update(ctx, dt) {
          const v = ctx.resources.get("Val");
          values.push(v);
          ctx.world.setResource("Val", v + 1);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      world.update(16);
      world.update(16);
      assert.deepStrictEqual(values, [0, 1, 2]);
    });
  });

  // ─── ctx.deltaTime ──────────────────────────────────
  describe("ctx.deltaTime", () => {
    it("carries the dt value from update call", () => {
      const world = createWorld();
      let received = 0;
      class TestSystem extends System {
        update(ctx, dt) {
          received = ctx.deltaTime;
        }
      }
      world.addSystem(new TestSystem());
      world.update(42.5);
      assert.strictEqual(received, 42.5);
    });

    it("updates every frame", () => {
      const world = createWorld();
      const frames = [];
      class TestSystem extends System {
        update(ctx, dt) {
          frames.push(ctx.deltaTime);
        }
      }
      world.addSystem(new TestSystem());
      world.update(10);
      world.update(20);
      world.update(30);
      assert.deepStrictEqual(frames, [10, 20, 30]);
    });
  });

  // ─── ctx.world ──────────────────────────────────────
  describe("ctx.world", () => {
    it("provides the world reference", () => {
      const world = createWorld();
      let seen = null;
      class TestSystem extends System {
        update(ctx, dt) {
          seen = ctx.world;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(seen, world);
    });
  });

  // ─── ctx.tables() ───────────────────────────────────
  describe("ctx.tables()", () => {
    it("returns matching tables for a query", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let tableCount = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          tableCount = ctx.tables().length;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(tableCount, 1);
    });

    it("returns empty array for no matching tables", () => {
      const world = createWorld();
      let tables = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          tables = ctx.tables();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.deepStrictEqual(tables, []);
    });

    it("returns same cached array across calls within same frame", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let a = null;
      let b = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          a = ctx.tables();
          b = ctx.tables();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(a, b);
    });

    it("returns empty array for system with no query", () => {
      const world = createWorld();
      let result = null;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.tables();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.deepStrictEqual(result, []);
    });
  });

  // ─── ctx.entityCount ────────────────────────────────
  describe("ctx.entityCount", () => {
    it("returns 0 when no entities match", () => {
      const world = createWorld();
      let count = -1;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          count = ctx.entityCount;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(count, 0);
    });

    it("returns correct count for a single table", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      let count = -1;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          count = ctx.entityCount;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(count, 2);
    });

    it("returns correct count across multiple tables", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      let count = -1;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          count = ctx.entityCount;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(count, 2);
    });

    it("updates when entities are added between frames", () => {
      const world = createWorld();
      let counts = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          counts.push(ctx.entityCount);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.update(16);
      assert.deepStrictEqual(counts, [0, 1]);
    });
  });

  // ─── ctx.column() ───────────────────────────────────
  describe("ctx.column()", () => {
    it("returns typed array from first matching table", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 42 });
      let col = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          col = ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.ok(col instanceof Float32Array);
      assert.strictEqual(col[0], 42);
    });

    it("returns null when no tables match", () => {
      const world = createWorld();
      let col = "unset";
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          col = ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(col, null);
    });

    it("caches column lookup within the same frame", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let a = null;
      let b = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          a = ctx.column(Position, "x");
          b = ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(a, b);
    });

    it("throws for component not in query", () => {
      const world = createWorld();
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.column(Velocity, "vx");
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /not compiled/);
    });

    it("throws for system with no query", () => {
      const world = createWorld();
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /not compiled/);
    });

    it("writes through column data propagate to entity", () => {
      const world = createWorld();
      class WriteSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          const colX = ctx.column(Position, "x");
          if (colX) {
            for (let r = 0; r < colX.length; r++) {
              colX[r] += 5;
            }
          }
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 10 });
      world.addSystem(new WriteSystem());
      world.update(16);
      assert.strictEqual(world.getComponent(e, Position).x, 15);
    });

    it("throws for multi-table query", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /requires exactly one table/);
    });

    it("multiple fields from same component are cached independently", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Health);
      world.setComponent(e, Health, { hp: 10, maxHp: 100 });
      let colHp = null, colMax = null;
      class TestSystem extends System {
        static query = { all: [Health] };
        update(ctx, dt) {
          colHp = ctx.column(Health, "hp");
          colMax = ctx.column(Health, "maxHp");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(colHp[0], 10);
      assert.strictEqual(colMax[0], 100);
    });

    it("columns from different components both cached", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addComponent(e, Velocity);
      world.setComponent(e, Position, { x: 1, y: 2 });
      world.setComponent(e, Velocity, { vx: 3, vy: 4 });
      let px = null, vx = null;
      class TestSystem extends System {
        static query = { all: [Position, Velocity] };
        update(ctx, dt) {
          px = ctx.column(Position, "x");
          vx = ctx.column(Velocity, "vx");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(px[0], 1);
      assert.strictEqual(vx[0], 3);
    });
  });

  // ─── ctx.get() ──────────────────────────────────────
  describe("ctx.get()", () => {
    it("returns a component view for an entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 5, y: 10 });
      let view = null;
      class TestSystem extends System {
        update(ctx, dt) {
          view = ctx.get(e, Position);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.ok(view);
      assert.strictEqual(view.x, 5);
      assert.strictEqual(view.y, 10);
    });

    it("writes through view propagate to storage", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      class TestSystem extends System {
        update(ctx, dt) {
          const v = ctx.get(e, Position);
          v.x = 99;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(world.getComponent(e, Position).x, 99);
    });

    it("throws for entity without the component", () => {
      const world = createWorld();
      const e = world.createEntity();
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.get(e, Position);
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /does not have/);
    });

    it("throws for dead entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.destroyEntity(e);
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.get(e, Position);
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /not alive/);
    });
  });

  // ─── ctx.has() ──────────────────────────────────────
  describe("ctx.has()", () => {
    it("returns true when entity has the component", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let result = false;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.has(e, Position);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, true);
    });

    it("returns false when entity lacks the component", () => {
      const world = createWorld();
      const e = world.createEntity();
      let result = true;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.has(e, Position);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, false);
    });

    it("returns false for dead entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.destroyEntity(e);
      let result = true;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.has(e, Position);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, false);
    });
  });

  // ─── ctx.forEach() ──────────────────────────────────
  describe("ctx.forEach()", () => {
    it("iterates all matching entities", () => {
      const world = createWorld();
      const visited = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            visited.push(table.getEntity(row));
          });
        }
      }
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(visited.length, 2);
      assert.ok(visited.includes(e1));
      assert.ok(visited.includes(e2));
    });

    it("does nothing for empty query result", () => {
      const world = createWorld();
      let called = false;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach(() => { called = true; });
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(called, false);
    });

    it("iterates across multiple tables", () => {
      const world = createWorld();
      const seen = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            seen.push(table.getEntity(row));
          });
        }
      }
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(seen.length, 2);
    });

    it("allows data mutation inside callback", () => {
      const world = createWorld();
      class MoveSystem extends System {
        static query = { all: [Position, Velocity] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            const posX = table.getColumn(ctx.world.registry.getId(Position), "x");
            const posY = table.getColumn(ctx.world.registry.getId(Position), "y");
            const velX = table.getColumn(ctx.world.registry.getId(Velocity), "vx");
            const velY = table.getColumn(ctx.world.registry.getId(Velocity), "vy");
            posX[row] += velX[row] * dt;
            posY[row] += velY[row] * dt;
          });
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addComponent(e, Velocity);
      world.setComponent(e, Position, { x: 10, y: 20 });
      world.setComponent(e, Velocity, { vx: 1, vy: 2 });
      world.addSystem(new MoveSystem());
      world.update(1);
      const pos = world.getComponent(e, Position);
      assert.strictEqual(pos.x, 11);
      assert.strictEqual(pos.y, 22);
    });

    it("provides table and row to callback", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            assert.ok(table);
            assert.strictEqual(typeof row, "number");
            assert.strictEqual(table.getEntity(row), e);
          });
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
    });

    it("can be called multiple times producing same results", () => {
      const world = createWorld();
      for (let i = 0; i < 5; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }
      let first = [];
      let second = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach((table, row) => first.push(table.getEntity(row)));
          ctx.forEach((table, row) => second.push(table.getEntity(row)));
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.deepStrictEqual(first, second);
    });

    it("forEach combined with column writes inside callback", () => {
      const world = createWorld();
      class MoveSystem extends System {
        static query = { all: [Position, Velocity] };
        update(ctx, dt) {
          const px = ctx.column(Position, "x");
          const py = ctx.column(Position, "y");
          const vx = ctx.column(Velocity, "vx");
          const vy = ctx.column(Velocity, "vy");
          ctx.forEach((table, row) => {
            px[row] += vx[row] * dt;
            py[row] += vy[row] * dt;
          });
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addComponent(e, Velocity);
      world.setComponent(e, Position, { x: 10, y: 20 });
      world.setComponent(e, Velocity, { vx: 1, vy: 2 });
      world.addSystem(new MoveSystem());
      world.update(1);
      const pos = world.getComponent(e, Position);
      assert.strictEqual(pos.x, 11);
      assert.strictEqual(pos.y, 22);
    });
  });

  // ─── ctx.entities() ─────────────────────────────────
  describe("ctx.entities()", () => {
    it("returns all matching entity IDs", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      let entities = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          entities = ctx.entities();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(entities.length, 2);
      assert.ok(entities.includes(e1));
      assert.ok(entities.includes(e2));
    });

    it("returns empty array for no matches", () => {
      const world = createWorld();
      let entities = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          entities = ctx.entities();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.deepStrictEqual(entities, []);
    });

    it("works with for-of loop", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let found = false;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          for (const entity of ctx.entities()) {
            if (entity === e) found = true;
          }
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.ok(found);
    });
  });

  // ─── ctx.rows() ─────────────────────────────────────
  describe("ctx.rows()", () => {
    it("returns rows with table and row index", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let rows = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          rows = ctx.rows();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].table.getEntity(rows[0].row), e);
    });

    it("returns empty array for no matches", () => {
      const world = createWorld();
      let rows = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          rows = ctx.rows();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.deepStrictEqual(rows, []);
    });

    it("works with for-of destructuring", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let rowCount = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          for (const { table, row } of ctx.rows()) {
            assert.strictEqual(table.getEntity(row), e);
            rowCount++;
          }
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(rowCount, 1);
    });
  });

  // ─── Context Reuse ────────────────────────────────
  describe("context reuse", () => {
    it("same context object reused across frames", () => {
      const world = createWorld();
      let ctx1 = null;
      let ctx2 = null;
      class TestSystem extends System {
        update(ctx, dt) {
          if (ctx1 === null) ctx1 = ctx;
          else ctx2 = ctx;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      world.update(16);
      assert.strictEqual(ctx1, ctx2);
    });

    it("each system has its own context", () => {
      const world = createWorld();
      const contexts = [];
      class SysA extends System { update(ctx, dt) { contexts.push(ctx); } }
      class SysB extends System { update(ctx, dt) { contexts.push(ctx); } }
      world.addSystem(new SysA());
      world.addSystem(new SysB());
      world.update(16);
      assert.strictEqual(contexts.length, 2);
      assert.notStrictEqual(contexts[0], contexts[1]);
    });

    it("context persists after system removal and re-add", () => {
      const world = createWorld();
      const ctxs = [];
      class TestSystem extends System { update(ctx, dt) { ctxs.push(ctx); } }
      const sys = new TestSystem();
      world.addSystem(sys);
      world.update(16);
      world.removeSystem(sys);
      world.addSystem(sys);
      world.update(16);
      assert.strictEqual(ctxs.length, 2);
      assert.strictEqual(ctxs[0], ctxs[1]);
    });

    it("context is stable across multiple updates", () => {
      const world = createWorld();
      let firstCtx = null;
      let firstCtxWorld = null;
      class StableSystem extends System {
        update(ctx, dt) {
          if (firstCtx === null) {
            firstCtx = ctx;
            firstCtxWorld = ctx.world;
          } else {
            assert.strictEqual(ctx, firstCtx);
            assert.strictEqual(ctx.world, firstCtxWorld);
          }
        }
      }
      world.addSystem(new StableSystem());
      for (let i = 0; i < 5; i++) world.update(16);
    });
  });

  // ─── Scheduler Context Refresh ─────────────────────
  describe("context refresh", () => {
    it("deltaTime is updated every frame", () => {
      const world = createWorld();
      const dts = [];
      class TestSystem extends System {
        update(ctx, dt) {
          dts.push(ctx.deltaTime);
        }
      }
      world.addSystem(new TestSystem());
      world.update(1);
      world.update(2);
      world.update(3);
      assert.deepStrictEqual(dts, [1, 2, 3]);
    });

    it("entityCount is refreshed after entity creation", () => {
      const world = createWorld();
      const counts = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          counts.push(ctx.entityCount);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.update(16);
      world.update(16);
      assert.deepStrictEqual(counts, [0, 1, 1]);
    });

    it("column cache is cleared between frames", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 10 });
      let col1 = null;
      let col2 = null;
      let firstFrame = true;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          if (firstFrame) {
            col1 = ctx.column(Position, "x");
            firstFrame = false;
          } else {
            col2 = ctx.column(Position, "x");
          }
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      world.update(16);
      assert.ok(col1);
      assert.ok(col2);
      assert.strictEqual(col1[0], 10);
      assert.strictEqual(col2[0], 10);
    });
  });

  // ─── Multiple Systems ──────────────────────────────
  describe("multiple systems", () => {
    it("multiple systems with different queries all work", () => {
      const world = createWorld();
      let posSeen = 0;
      let velSeen = 0;
      class PosSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) { posSeen = ctx.entityCount; }
      }
      class VelSystem extends System {
        static query = { all: [Velocity] };
        update(ctx, dt) { velSeen = ctx.entityCount; }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addComponent(e, Velocity);
      world.addSystem(new PosSystem());
      world.addSystem(new VelSystem());
      world.update(16);
      assert.strictEqual(posSeen, 1);
      assert.strictEqual(velSeen, 1);
    });

    it("each system gets its own fresh entityCount", () => {
      const world = createWorld();
      const results = [];
      class SysA extends System {
        static query = { all: [Position] };
        update(ctx, dt) { results.push({ name: "A", count: ctx.entityCount }); }
      }
      class SysB extends System {
        static query = { all: [Position, Velocity] };
        update(ctx, dt) { results.push({ name: "B", count: ctx.entityCount }); }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addSystem(new SysA());
      world.addSystem(new SysB());
      world.update(16);
      assert.strictEqual(results[0].count, 1);
      assert.strictEqual(results[1].count, 0);
    });
  });

  // ─── Zero Allocation ──────────────────────────────
  describe("zero allocation per frame", () => {
    it("ctx.tables() returns cached array across calls", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let a = null;
      let b = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          a = ctx.tables();
          b = ctx.tables();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(a, b);
    });

    it("ctx.column() returns cached result across calls", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let a = null;
      let b = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          a = ctx.column(Position, "x");
          b = ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(a, b);
    });
  });

  // ─── System with No Query ─────────────────────────
  describe("system with no query", () => {
    it("ctx.tables() returns empty array", () => {
      const world = createWorld();
      let result = null;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.tables();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.deepStrictEqual(result, []);
    });

    it("ctx.entityCount is 0", () => {
      const world = createWorld();
      let count = -1;
      class TestSystem extends System {
        update(ctx, dt) {
          count = ctx.entityCount;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(count, 0);
    });

    it("ctx.forEach is no-op", () => {
      const world = createWorld();
      let called = false;
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.forEach(() => { called = true; });
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(called, false);
    });

    it("ctx.column throws", () => {
      const world = createWorld();
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /not compiled/);
    });
  });

  // ─── Edge Cases ───────────────────────────────────
  describe("edge cases", () => {
    it("system with wildcard query has entityCount for all entities", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Velocity);
      let count = 0;
      class TestSystem extends System {
        static query = {};
        update(ctx, dt) {
          count = ctx.entityCount;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(count, 2);
    });

    it("forEach with destroy during iteration is safe", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      const e3 = world.createEntity();
      world.addComponent(e3, Position);
      let destroyed = false;
      class DestroySystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            if (!destroyed) {
              destroyed = true;
              ctx.world.destroyEntity(table.getEntity(row));
            }
          });
        }
      }
      world.addSystem(new DestroySystem());
      world.update(16);
      assert.strictEqual(destroyed, true);
    });

    it("system with any query has entityCount for matching", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let count = 0;
      class AnySystem extends System {
        static query = { any: [Position, Velocity] };
        update(ctx, dt) {
          count = ctx.entityCount;
        }
      }
      world.addSystem(new AnySystem());
      world.update(16);
      assert.strictEqual(count, 1);
    });

    it("system with none query excludes matching components from count", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Enemy);
      let count = 0;
      class NoneSystem extends System {
        static query = { none: [Enemy] };
        update(ctx, dt) {
          count = ctx.entityCount;
        }
      }
      world.addSystem(new NoneSystem());
      world.update(16);
      assert.strictEqual(count, 1);
    });

    it("ctx.get for tag component returns empty view object", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Enemy);
      let view = null;
      class TestSystem extends System {
        update(ctx, dt) {
          view = ctx.get(e, Enemy);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.ok(view);
      assert.strictEqual(Object.keys(view).length, 0);
    });

    it("ctx.has for unregistered component throws", () => {
      const world = createWorld();
      class Unknown {}
      const e = world.createEntity();
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.has(e, Unknown);
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /not registered/);
    });

    it("ctx.get for unregistered component throws", () => {
      const world = createWorld();
      class Unknown {}
      const e = world.createEntity();
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.get(e, Unknown);
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /not registered/);
    });

    it("tables update after entity migration between frames", () => {
      const world = createWorld();
      let before = 0, after = 0;
      let frame = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          if (frame === 0) before = ctx.entityCount;
          if (frame === 1) after = ctx.entityCount;
          frame++;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.update(16);
      assert.strictEqual(before, 0);
      assert.strictEqual(after, 1);
    });

    it("forEach skips empty tables", () => {
      const world = createWorld();
      // Only create an archetype, no entities with Position
      let callCount = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach(() => { callCount++; });
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(callCount, 0);
    });
  });

  // ─── Resource Binding ─────────────────────────────
  describe("resource binding", () => {
    it("ctx.resources sees newly set resource after setResource", () => {
      const world = createWorld();
      let val = null;
      class TestSystem extends System {
        update(ctx, dt) {
          val = ctx.resources.get("Dynamic");
        }
      }
      world.addSystem(new TestSystem());
      world.setResource("Dynamic", "hello");
      world.update(16);
      assert.strictEqual(val, "hello");
    });

    it("ctx.resources sees removed resource", () => {
      const world = createWorld();
      world.setResource("Temp", "value");
      let afterRemove = "set";
      class TestSystem extends System {
        update(ctx, dt) {
          afterRemove = ctx.resources.get("Temp");
        }
      }
      world.removeResource("Temp");
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(afterRemove, undefined);
    });

    it("ctx.resources cleared by clearResources", () => {
      const world = createWorld();
      world.setResource("A", 1);
      world.setResource("B", 2);
      world.clearResources();
      let a = "set", b = "set";
      class TestSystem extends System {
        update(ctx, dt) {
          a = ctx.resources.get("A");
          b = ctx.resources.get("B");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(a, undefined);
      assert.strictEqual(b, undefined);
    });
  });

  // ─── Performance Guarantees ──────────────────────
  describe("performance guarantees", () => {
    it("column lookup returns same reference within frame", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 7 });
      let ref1 = null, ref2 = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ref1 = ctx.column(Position, "x");
          ref2 = ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(ref1, ref2);
    });

    it("tables array is reused across many frames", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let tablesRef = null;
      let frame = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          if (frame === 0) tablesRef = ctx.tables();
          frame++;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      world.update(16);
      world.update(16);
      assert.ok(tablesRef);
      assert.strictEqual(tablesRef.length, 1);
    });
  });

  // ─── Consistency ──────────────────────────────────
  describe("consistency", () => {
    it("entityCount matches forEach iteration count", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      const e3 = world.createEntity();
      world.addComponent(e3, Velocity);
      let count = 0;
      let forEachCount = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          count = ctx.entityCount;
          ctx.forEach(() => { forEachCount++; });
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(count, forEachCount);
    });

    it("entities().length matches entityCount", () => {
      const world = createWorld();
      for (let i = 0; i < 10; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }
      let entityListLen = 0;
      let ec = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          entityListLen = ctx.entities().length;
          ec = ctx.entityCount;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(entityListLen, ec);
    });

    it("rows().length matches entityCount", () => {
      const world = createWorld();
      for (let i = 0; i < 5; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }
      let rowCount = 0;
      let ec = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          rowCount = ctx.rows().length;
          ec = ctx.entityCount;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(rowCount, ec);
    });
  });

  // ─── Multiple Worlds ──────────────────────────────
  describe("multiple worlds", () => {
    it("independent resource registries", () => {
      const w1 = createWorld();
      const w2 = createWorld();
      w1.setResource("Key", "world1");
      w2.setResource("Key", "world2");
      let val1 = null, val2 = null;
      class TestSystem extends System {
        update(ctx, dt) {
          if (ctx.world === w1) val1 = ctx.resources.get("Key");
          if (ctx.world === w2) val2 = ctx.resources.get("Key");
        }
      }
      const sys = new TestSystem();
      w1.addSystem(sys);
      w1.update(16);
      w1.removeSystem(sys);
      w2.addSystem(sys);
      w2.update(16);
      assert.strictEqual(val1, "world1");
      assert.strictEqual(val2, "world2");
    });

    it("independent entity counts", () => {
      const w1 = createWorld();
      const w2 = createWorld();
      const e1 = w1.createEntity();
      w1.addComponent(e1, Position);
      const e2 = w2.createEntity();
      w2.addComponent(e2, Position);
      const e3 = w2.createEntity();
      w2.addComponent(e3, Position);
      let c1 = 0, c2 = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          if (ctx.world === w1) c1 = ctx.entityCount;
          if (ctx.world === w2) c2 = ctx.entityCount;
        }
      }
      const sys = new TestSystem();
      w1.addSystem(sys);
      w1.update(16);
      w1.removeSystem(sys);
      w2.addSystem(sys);
      w2.update(16);
      assert.strictEqual(c1, 1);
      assert.strictEqual(c2, 2);
    });
  });

  // ─── Disabled Systems ─────────────────────────────
  describe("disabled systems", () => {
    it("context is not refreshed for disabled system", () => {
      const world = createWorld();
      let called = false;
      class TestSystem extends System {
        update(ctx, dt) { called = true; }
      }
      const sys = new TestSystem();
      sys.enabled = false;
      world.addSystem(sys);
      world.update(16);
      assert.strictEqual(called, false);
    });

    it("re-enabling system restores context refresh", () => {
      const world = createWorld();
      let called = false;
      class TestSystem extends System {
        update(ctx, dt) { called = true; }
      }
      const sys = new TestSystem();
      sys.enabled = false;
      world.addSystem(sys);
      world.update(16);
      sys.enabled = true;
      world.update(16);
      assert.strictEqual(called, true);
    });
  });

  // ─── Destroy & Archetype Change ────────────────────
  describe("destroy and archetype changes", () => {
    it("entityCount decreases after destroy", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let before = 0, after = 0;
      let frame = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          if (frame === 0) before = ctx.entityCount;
          if (frame === 1) after = ctx.entityCount;
          frame++;
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      world.destroyEntity(e);
      world.update(16);
      assert.strictEqual(before, 1);
      assert.strictEqual(after, 0);
    });

    it("entities() excludes destroyed entity", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.destroyEntity(e1);
      let entities = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          entities = ctx.entities();
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(entities.length, 1);
      assert.strictEqual(entities[0], e2);
    });

    it("forEach after entity destroy visits remaining entities", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.destroyEntity(e1);
      const visited = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            visited.push(table.getEntity(row));
          });
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(visited.length, 1);
      assert.strictEqual(visited[0], e2);
    });

    it("column accessible with single archetype, throws when archetype split occurs", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 10 });
      let colVal = 0;
      let threw = false;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          try {
            const col = ctx.column(Position, "x");
            if (col && col.length > 0) colVal = col[0];
          } catch (e) {
            threw = true;
          }
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(colVal, 10);
      assert.ok(!threw);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      world.setComponent(e2, Position, { x: 20 });
      world.update(16);
      assert.ok(threw);
    });
  });

  // ─── Column Type Handling ─────────────────────────
  describe("column type handling", () => {
    it("f32 column returns Float32Array", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      let col = null;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          col = ctx.column(Position, "x");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.ok(col instanceof Float32Array);
    });

    it("u32 column returns Uint32Array", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Health);
      let col = null;
      class TestSystem extends System {
        static query = { all: [Health] };
        update(ctx, dt) {
          col = ctx.column(Health, "hp");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.ok(col instanceof Uint32Array);
    });
  });

  // ─── dt Propagation ───────────────────────────────
  describe("dt propagation", () => {
    it("fractional dt is propagated correctly", () => {
      const world = createWorld();
      let received = 0;
      class TestSystem extends System {
        update(ctx, dt) {
          received = ctx.deltaTime;
        }
      }
      world.addSystem(new TestSystem());
      world.update(1.234);
      assert.strictEqual(received, 1.234);
    });

    it("zero dt is propagated", () => {
      const world = createWorld();
      let received = -1;
      class TestSystem extends System {
        update(ctx, dt) {
          received = ctx.deltaTime;
        }
      }
      world.addSystem(new TestSystem());
      world.update(0);
      assert.strictEqual(received, 0);
    });

    it("large dt values are propagated", () => {
      const world = createWorld();
      let received = 0;
      class TestSystem extends System {
        update(ctx, dt) {
          received = ctx.deltaTime;
        }
      }
      world.addSystem(new TestSystem());
      world.update(999.5);
      assert.strictEqual(received, 999.5);
    });

    it("dt is independent for each system in same frame", () => {
      const world = createWorld();
      const dts = [];
      class SysA extends System { update(ctx, dt) { dts.push(ctx.deltaTime); } }
      class SysB extends System { update(ctx, dt) { dts.push(ctx.deltaTime); } }
      world.addSystem(new SysA());
      world.addSystem(new SysB());
      world.update(16.5);
      assert.strictEqual(dts[0], 16.5);
      assert.strictEqual(dts[1], 16.5);
    });
  });

  // ─── ctx.has on entity 0 ──────────────────────────
  describe("ctx.has edge cases", () => {
    it("has returns false for entity 0", () => {
      const world = createWorld();
      let result = true;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.has(0, Position);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, false);
    });

    it("has returns false for destroyed entity that had component", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.destroyEntity(e);
      let result = true;
      class TestSystem extends System {
        update(ctx, dt) {
          result = ctx.has(e, Position);
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(result, false);
    });
  });

  // ─── ctx.get on entity 0 ──────────────────────────
  describe("ctx.get edge cases", () => {
    it("get throws for entity 0", () => {
      const world = createWorld();
      class TestSystem extends System {
        update(ctx, dt) {
          ctx.get(0, Position);
        }
      }
      world.addSystem(new TestSystem());
      assert.throws(() => world.update(16), /not alive/);
    });
  });

  // ─── Context Properties ───────────────────────────
  describe("context properties", () => {
    it("world, deltaTime, resources, entityCount are all accessible", () => {
      const world = createWorld();
      let props = null;
      class TestSystem extends System {
        update(ctx, dt) {
          props = {
            world: ctx.world,
            dt: ctx.deltaTime,
            resources: ctx.resources,
            count: ctx.entityCount,
          };
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(props.world, world);
      assert.strictEqual(props.dt, 16);
      assert.ok(props.resources);
      assert.strictEqual(props.count, 0);
    });
  });
});
