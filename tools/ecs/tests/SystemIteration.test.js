import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { System } from "../../../ecs/core/System.js";

class Position { static schema = { x: "f32", y: "f32" }; }
class Velocity { static schema = { vx: "f32", vy: "f32" }; }
class Health { static schema = { hp: "u32", maxHp: "u32" }; }
class Sprite { static schema = { texture: "u32", alpha: "f32" }; }
class Enemy {}
class Sleeping {}

function createWorld() {
  const world = new World({ initialCapacity: 64, maxEntities: 10000 });
  world.register(Position);
  world.register(Velocity);
  world.register(Health);
  world.register(Sprite);
  world.register(Enemy);
  world.register(Sleeping);
  return world;
}

describe("SystemIteration", () => {
  // ─── SystemContext ────────────────────────────────────────
  describe("SystemContext", () => {
    it("provides world reference", () => {
      const world = createWorld();
      let ctxRef = null;
      class TestSystem extends System {
        update(ctx, dt) { ctxRef = ctx; }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(ctxRef.world, world);
    });

    it("provides tables from compiled query", () => {
      const world = createWorld();
      let tableCount = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          const tables = [...ctx.tables()];
          tableCount = tables.length;
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(tableCount, 1);
    });

    it("provides entities from compiled query", () => {
      const world = createWorld();
      const visited = [];
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          for (const entity of ctx.entities()) {
            visited.push(entity);
          }
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(visited.length, 1);
      assert.strictEqual(visited[0], e);
    });

    it("provides rows from compiled query", () => {
      const world = createWorld();
      let rowsLen = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          rowsLen = [...ctx.rows()].length;
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(rowsLen, 1);
    });

    it("provides column access via column()", () => {
      const world = createWorld();
      let sumX = 0;
      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          const colX = ctx.column(Position, "x");
          if (colX) {
            for (let r = 0; r < colX.length; r++) {
              sumX += colX[r];
            }
          }
        }
      }
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 10, y: 20 });
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.setComponent(e2, Position, { x: 30, y: 40 });
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(sumX, 40);
    });

    it("column() returns null when no tables match", () => {
      const world = createWorld();
      let colResult = undefined;
      class TestSystem extends System {
        static query = { all: [Sprite] };
        update(ctx, dt) {
          colResult = ctx.column(Sprite, "texture");
        }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(colResult, null);
    });

    it("column() throws for component not in query", () => {
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

    it("provides forEach iteration with zero-allocation", () => {
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
  });

  // ─── QueryView.column() ──────────────────────────────────
  describe("QueryView.column()", () => {
    it("returns typed array from first matching table", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 42, y: 0 });
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      const colX = view.column(posId, "x");
      assert.ok(colX instanceof Float32Array);
      assert.strictEqual(colX[0], 42);
    });

    it("returns null when no tables match", () => {
      const world = createWorld();
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      assert.strictEqual(view.column(posId, "x"), null);
    });

    it("returns null for unknown component on matching table", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const posId = world.registry.getId(Position);
      const spriteId = world.registry.getId(Sprite);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      assert.strictEqual(view.column(spriteId, "texture"), null);
    });

    it("accesses column data from single-archetype query", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 1, y: 2 });
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.setComponent(e2, Position, { x: 3, y: 4 });
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      const colX = view.column(posId, "x");
      const colY = view.column(posId, "y");
      assert.strictEqual(colX[0], 1);
      assert.strictEqual(colX[1], 3);
      assert.strictEqual(colY[0], 2);
      assert.strictEqual(colY[1], 4);
    });

    it("column data writes propagate back to entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 10, y: 20 });
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      const colX = view.column(posId, "x");
      colX[0] = 99;
      assert.strictEqual(world.getComponent(e, Position).x, 99);
    });

    it("column from multi-archetype query returns first table's data", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 10 });
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      world.setComponent(e2, Position, { x: 20 });
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      const tables = [...view.tables()];
      assert.ok(tables.length > 1);
      const colX = view.column(posId, "x");
      assert.strictEqual(colX[0], 10);
    });
  });

  // ─── QueryView.forEach() ─────────────────────────────────
  describe("QueryView.forEach()", () => {
    it("iterates all rows across all tables", () => {
      const world = createWorld();
      const visited = [];
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      view.forEach((table, row) => {
        visited.push(table.getEntity(row));
      });
      assert.strictEqual(visited.length, 2);
    });

    it("does nothing for empty query results", () => {
      const world = createWorld();
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      let count = 0;
      view.forEach(() => count++);
      assert.strictEqual(count, 0);
    });

    it("provides table and row to callback", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      view.forEach((table, row) => {
        assert.ok(table);
        assert.strictEqual(typeof row, "number");
        assert.strictEqual(table.getEntity(row), e);
      });
    });

    it("allows data mutation inside callback", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 5, y: 10 });
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      view.forEach((table, row) => {
        const colX = table.getColumn(posId, "x");
        colX[row] += 10;
      });
      assert.strictEqual(world.getComponent(e, Position).x, 15);
    });

    it("iterates multiple tables in order", () => {
      const world = createWorld();
      const order = [];
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      view.forEach((table, row) => {
        order.push(table.getEntity(row));
      });
      assert.strictEqual(order.length, 2);
    });

    it("can be called multiple times producing same results", () => {
      const world = createWorld();
      for (let i = 0; i < 5; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      let first = [];
      let second = [];
      view.forEach((table, row) => first.push(table.getEntity(row)));
      view.forEach((table, row) => second.push(table.getEntity(row)));
      assert.deepStrictEqual(first, second);
    });
  });

  // ─── Table.columns() ─────────────────────────────────────
  describe("Table.columns()", () => {
    it("returns object with field name keys", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const posId = world.registry.getId(Position);
      const table = world.archetypeSystem.entityTable(e);
      const cols = table.columns(posId);
      assert.ok(cols);
      assert.ok("x" in cols);
      assert.ok("y" in cols);
    });

    it("values are typed arrays", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const posId = world.registry.getId(Position);
      const table = world.archetypeSystem.entityTable(e);
      const cols = table.columns(posId);
      assert.ok(cols.x instanceof Float32Array);
      assert.ok(cols.y instanceof Float32Array);
    });

    it("returns null for component not in table", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const spriteId = world.registry.getId(Sprite);
      const table = world.archetypeSystem.entityTable(e);
      assert.strictEqual(table.columns(spriteId), null);
    });

    it("returns same cached object on repeated calls", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const posId = world.registry.getId(Position);
      const table = world.archetypeSystem.entityTable(e);
      const a = table.columns(posId);
      const b = table.columns(posId);
      assert.strictEqual(a, b);
    });

    it("fields match schema definition", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Health);
      const healthId = world.registry.getId(Health);
      const table = world.archetypeSystem.entityTable(e);
      const cols = table.columns(healthId);
      assert.strictEqual(Object.keys(cols).length, 2);
      assert.ok("hp" in cols);
      assert.ok("maxHp" in cols);
    });

    it("columns from multi-field component have correct types", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Sprite);
      const spriteId = world.registry.getId(Sprite);
      const table = world.archetypeSystem.entityTable(e);
      const cols = table.columns(spriteId);
      assert.ok(cols.texture instanceof Uint32Array);
      assert.ok(cols.alpha instanceof Float32Array);
    });

    it("data written via columns() is reflected in entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 7, y: 14 });
      const posId = world.registry.getId(Position);
      const table = world.archetypeSystem.entityTable(e);
      const cols = table.columns(posId);
      cols.x[0] = 100;
      assert.strictEqual(world.getComponent(e, Position).x, 100);
    });
  });

  // ─── ctx.forEach Integration ─────────────────────────────
  describe("ctx.forEach integration", () => {
    it("iterates all matching entities in system update", () => {
      const world = createWorld();
      const count = [];
      class CountSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.forEach(() => count.push("x"));
        }
      }
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addSystem(new CountSystem());
      world.update(16);
      assert.strictEqual(count.length, 2);
    });

    it("allows mutation through ctx.forEach", () => {
      const world = createWorld();
      class MoveSystem extends System {
        static query = { all: [Position, Velocity] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            const posId = ctx.world.registry.getId(Position);
            const velId = ctx.world.registry.getId(Velocity);
            const px = table.getColumn(posId, "x");
            const py = table.getColumn(posId, "y");
            const vx = table.getColumn(velId, "vx");
            const vy = table.getColumn(velId, "vy");
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

    it("ctx.forEach with no matching entities is no-op", () => {
      const world = createWorld();
      let called = false;
      class EmptySystem extends System {
        static query = { all: [Sprite] };
        update(ctx, dt) {
          ctx.forEach(() => { called = true; });
        }
      }
      world.addSystem(new EmptySystem());
      world.update(16);
      assert.strictEqual(called, false);
    });

    it("ctx.forEach across multiple archetypes", () => {
      const world = createWorld();
      const seen = [];
      class PosSystem extends System {
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
      world.addSystem(new PosSystem());
      world.update(16);
      assert.strictEqual(seen.length, 2);
      assert.ok(seen.includes(e1));
      assert.ok(seen.includes(e2));
    });

    it("ctx.forEach can be mixed with ctx.entities()", () => {
      const world = createWorld();
      const forEach = [];
      const entityIter = [];
      class MixSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
           ctx.forEach((table, row) => forEach.push(table.getEntity(row)));
          for (const e of ctx.entities()) entityIter.push(e);
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addSystem(new MixSystem());
      world.update(16);
      assert.strictEqual(forEach.length, 1);
      assert.strictEqual(entityIter.length, 1);
      assert.strictEqual(forEach[0], entityIter[0]);
    });
  });

  // ─── ctx.column Integration ──────────────────────────────
  describe("ctx.column integration", () => {
    it("accesses column data in update", () => {
      const world = createWorld();
      let result = 0;
      class ReadSystem extends System {
        static query = { all: [Health] };
        update(ctx, dt) {
          const col = ctx.column(Health, "hp");
          if (col) result = col[0];
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Health);
      world.setComponent(e, Health, { hp: 75 });
      world.addSystem(new ReadSystem());
      world.update(16);
      assert.strictEqual(result, 75);
    });

    it("writes through column data", () => {
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

    it("column() for tag component returns null (no fields)", () => {
      const world = createWorld();
      let colResult = "unset";
      class TagSystem extends System {
        static query = { all: [Enemy] };
        update(ctx, dt) {
          colResult = ctx.column(Enemy, "nonexistent");
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Enemy);
      world.addSystem(new TagSystem());
      world.update(16);
      assert.strictEqual(colResult, null);
    });

    it("column works with any query filter", () => {
      const world = createWorld();
      let hpSum = 0;
      class AnySystem extends System {
        static query = { any: [Health, Sprite] };
        update(ctx, dt) {
          const col = ctx.column(Health, "hp");
          if (col) {
            for (let r = 0; r < col.length; r++) hpSum += col[r];
          }
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Health);
      world.setComponent(e, Health, { hp: 50 });
      world.addSystem(new AnySystem());
      world.update(16);
      assert.strictEqual(hpSum, 50);
    });

    it("column throws for multi-table query", () => {
      const world = createWorld();
      class MultiTableSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          ctx.column(Position, "x");
        }
      }
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      world.addSystem(new MultiTableSystem());
      assert.throws(() => world.update(16), /requires exactly one table/);
    });
  });

  // ─── System with No Query ────────────────────────────────
  describe("system with no query", () => {
    it("ctx.tables() returns empty array", () => {
      const world = createWorld();
      let result = null;
      class NoQuerySystem extends System {
        update(ctx, dt) {
          result = [...ctx.tables()];
        }
      }
      world.addSystem(new NoQuerySystem());
      world.update(16);
      assert.deepStrictEqual(result, []);
    });

    it("ctx.entities() returns empty generator", () => {
      const world = createWorld();
      let count = 0;
      class NoQuerySystem extends System {
        update(ctx, dt) {
          for (const _ of ctx.entities()) count++;
        }
      }
      world.addSystem(new NoQuerySystem());
      world.update(16);
      assert.strictEqual(count, 0);
    });

    it("ctx.forEach is no-op", () => {
      const world = createWorld();
      let called = false;
      class NoQuerySystem extends System {
        update(ctx, dt) {
          ctx.forEach(() => { called = true; });
        }
      }
      world.addSystem(new NoQuerySystem());
      world.update(16);
      assert.strictEqual(called, false);
    });

    it("ctx.column throws", () => {
      const world = createWorld();
      class NoQuerySystem extends System {
        update(ctx, dt) {
          ctx.column(Position, "x");
        }
      }
      world.addSystem(new NoQuerySystem());
      assert.throws(() => world.update(16), /not compiled/);
    });
  });

  // ─── Reusability & Context Identity ──────────────────────
  describe("context reusability", () => {
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

    it("context object is stable across multiple updates", () => {
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
  });

  // ─── Zero Allocation Guarantees ──────────────────────────
  describe("zero allocation per frame", () => {
    it("getTables() returns cached array across calls", () => {
      const world = createWorld();
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const a = world.queryEngine.getTables(query);
      const b = world.queryEngine.getTables(query);
      assert.strictEqual(a, b);
    });

    it("column() returns direct typed array reference", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 42 });
      const posId = world.registry.getId(Position);
      const query = world.queryEngine.createQuery({ all: [posId] });
      const view = world.query(query);
      const colX = view.column(posId, "x");
      assert.ok(colX instanceof Float32Array);
      assert.strictEqual(colX[0], 42);
      colX[0] = 99;
      assert.strictEqual(world.getComponent(e, Position).x, 99);
    });

    it("columns() returns cached object", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const posId = world.registry.getId(Position);
      const table = world.archetypeSystem.entityTable(e);
      const a = table.columns(posId);
      const b = table.columns(posId);
      assert.strictEqual(a, b);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────
  describe("edge cases", () => {
    it("system with wildcard query iterates all entities", () => {
      const world = createWorld();
      const visited = [];
      class WildcardSystem extends System {
        static query = {};
        update(ctx, dt) {
          for (const e of ctx.entities()) visited.push(e);
        }
      }
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Velocity);
      world.addSystem(new WildcardSystem());
      world.update(16);
      assert.strictEqual(visited.length, 2);
      assert.ok(visited.includes(e1));
      assert.ok(visited.includes(e2));
    });

    it("ctx.column works before archetype split, throws after", () => {
      const world = createWorld();
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
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 5 });
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(colVal, 5);
      assert.ok(!threw);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      world.setComponent(e2, Position, { x: 10 });
      world.update(16);
      assert.ok(threw);
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

    it("system with any query has ctx.column from first matched component", () => {
      const world = createWorld();
      let result = null;
      class AnyColSystem extends System {
        static query = { any: [Position, Velocity] };
        update(ctx, dt) {
          result = ctx.column(Position, "x");
        }
      }
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 77 });
      world.addSystem(new AnyColSystem());
      world.update(16);
      assert.strictEqual(result[0], 77);
    });

    it("system with none-only query provides iteration", () => {
      const world = createWorld();
      const visited = [];
      class NoneSystem extends System {
        static query = { none: [Enemy] };
        update(ctx, dt) {
          for (const e of ctx.entities()) visited.push(e);
        }
      }
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Enemy);
      world.addSystem(new NoneSystem());
      world.update(16);
      assert.ok(visited.includes(e1));
      assert.ok(!visited.includes(e2));
    });
  });
});
