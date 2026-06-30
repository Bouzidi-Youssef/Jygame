import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  World,
  Transform,
  Velocity,
  Collider,
  Renderable,
  Visible,
  Animation,
  RenderBounds,
  Trail,
  EnemyTag,
  PlayerTag,
  ProjectileTag,
  StaticTag,
} from "../../../ecs/index.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Velocity);
  world.register(Collider);
  world.register(Renderable);
  world.register(Visible);
  world.register(Animation);
  world.register(RenderBounds);
  world.register(Trail);
  world.register(EnemyTag);
  world.register(PlayerTag);
  world.register(ProjectileTag);
  world.register(StaticTag);
  return world;
}

function entityWithTransform(world, x, y) {
  const e = world.createEntity();
  world.add(e, Transform);
  world.set(e, Transform, { x, y });
  return e;
}

// ─────────────────────────────────────────────────────────
// Entity Lifecycle
// ─────────────────────────────────────────────────────────
describe("Entity lifecycle", () => {
  it("creates an entity", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.ok(typeof e === "number");
    assert.ok(e > 0);
    assert.ok(w.isAlive(e));
  });

  it("creates unique entities", () => {
    const w = createWorld();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    assert.notStrictEqual(e1, e2);
  });

  it("destroys an entity", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.destroyEntity(e);
    assert.ok(!w.isAlive(e));
  });

  it("destroy is idempotent for dead entity", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.destroyEntity(e);
    w.destroyEntity(e); // should not throw
    assert.ok(!w.isAlive(e));
  });

  it("recycles entity slots after destroy", () => {
    const w = createWorld();
    const e1 = w.createEntity();
    const slot1 = e1 & 0xffffff;
    w.destroyEntity(e1);
    const e2 = w.createEntity();
    const slot2 = e2 & 0xffffff;
    assert.strictEqual(slot1, slot2);
    assert.notStrictEqual(e1, e2);
    assert.ok(w.isAlive(e2));
  });

  it("entity is alive after creation", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.ok(w.isAlive(e));
  });

  it("entity is not alive after destroy", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.destroyEntity(e);
    assert.ok(!w.isAlive(e));
  });

  it("zero is not alive", () => {
    const w = createWorld();
    assert.ok(!w.isAlive(0));
  });

  it("negative numbers are not alive", () => {
    const w = createWorld();
    assert.ok(!w.isAlive(-1));
  });

  it("float entity number is not alive", () => {
    const w = createWorld();
    assert.ok(!w.isAlive(1.5));
  });

  it("repeated create/destroy cycles", () => {
    const w = createWorld();
    const ids = [];
    for (let i = 0; i < 100; i++) {
      const e = w.createEntity();
      ids.push(e);
    }
    for (const id of ids) {
      assert.ok(w.isAlive(id));
      w.destroyEntity(id);
      assert.ok(!w.isAlive(id));
    }
  });

  it("large number of entities", () => {
    const w = createWorld();
    const ids = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(w.createEntity());
    }
    assert.strictEqual(ids.length, 1000);
    for (const id of ids) assert.ok(w.isAlive(id));
  });
});

// ─────────────────────────────────────────────────────────
// Component Operations
// ─────────────────────────────────────────────────────────
describe("Component operations", () => {
  it("add component via add()", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    assert.ok(w.has(e, Transform));
  });

  it("add is idempotent", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.add(e, Transform);
    assert.ok(w.has(e, Transform));
  });

  it("remove component via remove()", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.remove(e, Transform);
    assert.ok(!w.has(e, Transform));
  });

  it("remove is idempotent when missing", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.remove(e, Transform); // should not throw
    assert.ok(!w.has(e, Transform));
  });

  it("has returns true for owned component", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    assert.ok(w.has(e, Transform));
  });

  it("has returns false for absent component", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.ok(!w.has(e, Transform));
  });

  it("has returns false for dead entity", () => {
    const w = createWorld();
    assert.ok(!w.has(999, Transform));
  });

  it("get returns component view", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    const view = w.get(e, Transform);
    assert.ok(typeof view === "object");
    assert.ok("x" in view);
    assert.ok("y" in view);
  });

  it("get throws for entity without component", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.throws(() => w.get(e, Transform), /does not have/);
  });

  it("get throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.get(999, Transform), /not alive/);
  });

  it("set assigns fields", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.set(e, Transform, { x: 10, y: 20 });
    const view = w.get(e, Transform);
    assert.strictEqual(view.x, 10);
    assert.strictEqual(view.y, 20);
  });

  it("set partial fields does not overwrite others", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.set(e, Transform, { x: 10, y: 20, rotation: 1.5, scaleX: 2, scaleY: 3 });
    w.set(e, Transform, { x: 99 });
    const view = w.get(e, Transform);
    assert.strictEqual(view.x, 99);
    assert.strictEqual(view.y, 20);
    assert.strictEqual(view.rotation, 1.5);
  });

  it("set throws for entity without component", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.throws(() => w.set(e, Transform, { x: 1 }), /does not have/);
  });

  it("set throws for unknown field", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    assert.throws(() => w.set(e, Transform, { nonexistent: 1 }), /unknown field/);
  });

  it("get/set field via view", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Velocity);
    const view = w.get(e, Velocity);
    view.x = 5;
    view.y = -3;
    assert.strictEqual(view.x, 5);
    assert.strictEqual(view.y, -3);
    const view2 = w.get(e, Velocity);
    assert.strictEqual(view2.x, 5);
  });

  it("add multiple components sequentially", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.add(e, Velocity);
    w.add(e, Collider);
    assert.ok(w.has(e, Transform));
    assert.ok(w.has(e, Velocity));
    assert.ok(w.has(e, Collider));
  });

  it("remove one component keeps others", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.add(e, Velocity);
    w.remove(e, Transform);
    assert.ok(!w.has(e, Transform));
    assert.ok(w.has(e, Velocity));
  });

  it("add after remove works", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.set(e, Transform, { x: 42 });
    w.remove(e, Transform);
    w.add(e, Transform);
    const view = w.get(e, Transform);
    assert.strictEqual(view.x, 0);
  });

  it("add throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.add(999, Transform), /not alive/);
  });

  it("remove throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.remove(999, Transform), /not alive/);
  });

  it("add throws for unregistered component", () => {
    const w = createWorld();
    class Unregistered {}
    const e = w.createEntity();
    assert.throws(() => w.add(e, Unregistered), /not registered/);
  });

  it("set after get mutates in place", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Velocity);
    const view = w.get(e, Velocity);
    view.x = 100;
    const sameView = w.get(e, Velocity);
    assert.strictEqual(sameView.x, 100);
  });

  it("view is cached (same object)", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    const v1 = w.get(e, Transform);
    const v2 = w.get(e, Transform);
    assert.strictEqual(v1, v2);
  });
});

// ─────────────────────────────────────────────────────────
// Clear
// ─────────────────────────────────────────────────────────
describe("clear", () => {
  it("removes all components", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.add(e, Velocity);
    w.add(e, Collider);
    w.add(e, EnemyTag);
    w.clear(e);
    assert.ok(!w.has(e, Transform));
    assert.ok(!w.has(e, Velocity));
    assert.ok(!w.has(e, Collider));
    assert.ok(!w.has(e, EnemyTag));
  });

  it("entity is still alive after clear", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.clear(e);
    assert.ok(w.isAlive(e));
  });

  it("can add components after clear", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.set(e, Transform, { x: 10 });
    w.clear(e);
    w.add(e, Velocity);
    w.set(e, Velocity, { x: 5 });
    assert.ok(w.has(e, Velocity));
    assert.ok(!w.has(e, Transform));
  });

  it("clear on empty entity is no-op", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.clear(e);
    assert.ok(w.isAlive(e));
  });

  it("clear throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.clear(999), /not alive/);
  });
});

// ─────────────────────────────────────────────────────────
// Bulk Operations
// ─────────────────────────────────────────────────────────
describe("addMany / removeMany", () => {
  it("addMany adds multiple components", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Velocity, Collider);
    assert.ok(w.has(e, Transform));
    assert.ok(w.has(e, Velocity));
    assert.ok(w.has(e, Collider));
  });

  it("addMany with no components is no-op", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e);
    assert.ok(w.isAlive(e));
  });

  it("addMany is idempotent for existing components", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.addMany(e, Transform, Velocity);
    assert.ok(w.has(e, Transform));
    assert.ok(w.has(e, Velocity));
  });

  it("removeMany removes multiple components", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Velocity, Collider, Renderable);
    w.removeMany(e, Velocity, Collider);
    assert.ok(w.has(e, Transform));
    assert.ok(!w.has(e, Velocity));
    assert.ok(!w.has(e, Collider));
    assert.ok(w.has(e, Renderable));
  });

  it("removeMany with no components is no-op", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.removeMany(e);
    assert.ok(w.has(e, Transform));
  });

  it("removeMany idempotent for missing components", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.removeMany(e, Velocity, Collider);
    assert.ok(w.has(e, Transform));
  });

  it("addMany reduces archetype transitions", () => {
    const w = createWorld();
    const e = w.createEntity();
    const sigBefore = w._archetypeSystem.entitySignature(e);
    w.addMany(e, Transform, Velocity, Collider, Renderable, Visible);
    const sigAfter = w._archetypeSystem.entitySignature(e);
    assert.ok(sigAfter.containsAll(sigBefore) || sigBefore.size === 0);
    assert.strictEqual(sigAfter.size, 5);
  });

  it("removeMany reduces archetype transitions", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Velocity, Collider);
    w.removeMany(e, Velocity, Collider);
    const sig = w._archetypeSystem.entitySignature(e);
    assert.ok(sig.contains(w.registry.getId(Transform)));
    assert.ok(!sig.contains(w.registry.getId(Velocity)));
    assert.ok(!sig.contains(w.registry.getId(Collider)));
  });

  it("addMany with tags", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, EnemyTag, PlayerTag);
    assert.ok(w.has(e, Transform));
    assert.ok(w.has(e, EnemyTag));
    assert.ok(w.has(e, PlayerTag));
  });

  it("removeMany with tags", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, EnemyTag, PlayerTag);
    w.removeMany(e, EnemyTag);
    assert.ok(w.has(e, Transform));
    assert.ok(w.has(e, PlayerTag));
    assert.ok(!w.has(e, EnemyTag));
  });

  it("addMany throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.addMany(999, Transform), /not alive/);
  });

  it("removeMany throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.removeMany(999, Transform), /not alive/);
  });
});

// ─────────────────────────────────────────────────────────
// Entity Builder
// ─────────────────────────────────────────────────────────
describe("Entity builder", () => {
  it("builds entity with single component", () => {
    const w = createWorld();
    const e = w.entity().with(Transform).create();
    assert.ok(w.isAlive(e));
    assert.ok(w.has(e, Transform));
  });

  it("builds entity with multiple components", () => {
    const w = createWorld();
    const e = w.entity().with(Transform).with(Velocity).with(Collider).create();
    assert.ok(w.has(e, Transform));
    assert.ok(w.has(e, Velocity));
    assert.ok(w.has(e, Collider));
  });

  it("builds entity with component values", () => {
    const w = createWorld();
    const e = w.entity().with(Transform, { x: 10, y: 20 }).with(Velocity, { x: 5 }).create();
    const t = w.get(e, Transform);
    const v = w.get(e, Velocity);
    assert.strictEqual(t.x, 10);
    assert.strictEqual(t.y, 20);
    assert.strictEqual(v.x, 5);
  });

  it("builder with duplicate components", () => {
    const w = createWorld();
    const e = w.entity().with(Transform).with(Transform).with(Transform).create();
    assert.ok(w.has(e, Transform));
  });

  it("builder with tags", () => {
    const w = createWorld();
    const e = w.entity().with(Transform).with(EnemyTag).with(PlayerTag).create();
    assert.ok(w.has(e, EnemyTag));
    assert.ok(w.has(e, PlayerTag));
  });

  it("empty builder creates bare entity", () => {
    const w = createWorld();
    const e = w.entity().create();
    assert.ok(w.isAlive(e));
    assert.ok(!w.has(e, Transform));
  });

  it("builder with() returns this for chaining", () => {
    const w = createWorld();
    const builder = w.entity();
    assert.strictEqual(builder.with(Transform), builder);
  });

  it("builder with unregistered component throws", () => {
    const w = createWorld();
    class Unregistered {}
    assert.throws(() => w.entity().with(Unregistered), /not registered/);
  });

  it("chained builder sets values correctly", () => {
    const w = createWorld();
    const e = w
      .entity()
      .with(Transform, { x: 1, y: 2 })
      .with(Velocity, { x: 3, y: 4 })
      .with(Collider, { width: 32, height: 64 })
      .create();
    assert.strictEqual(w.get(e, Transform).x, 1);
    assert.strictEqual(w.get(e, Transform).y, 2);
    assert.strictEqual(w.get(e, Velocity).x, 3);
    assert.strictEqual(w.get(e, Velocity).y, 4);
    assert.strictEqual(w.get(e, Collider).width, 32);
    assert.strictEqual(w.get(e, Collider).height, 64);
  });

  it("multiple builders produce independent entities", () => {
    const w = createWorld();
    const e1 = w.entity().with(Transform, { x: 10 }).create();
    const e2 = w.entity().with(Transform, { x: 20 }).create();
    assert.strictEqual(w.get(e1, Transform).x, 10);
    assert.strictEqual(w.get(e2, Transform).x, 20);
  });
});

// ─────────────────────────────────────────────────────────
// Clone
// ─────────────────────────────────────────────────────────
describe("clone", () => {
  it("clones entity with all components", () => {
    const w = createWorld();
    const e = w.entity().with(Transform, { x: 10, y: 20 }).with(Velocity, { x: 1, y: 2 }).create();
    const c = w.clone(e);
    assert.ok(w.isAlive(c));
    assert.notStrictEqual(c, e);
    assert.strictEqual(w.get(c, Transform).x, 10);
    assert.strictEqual(w.get(c, Transform).y, 20);
    assert.strictEqual(w.get(c, Velocity).x, 1);
    assert.strictEqual(w.get(c, Velocity).y, 2);
  });

  it("cloned entity is independent", () => {
    const w = createWorld();
    const e = w.entity().with(Transform, { x: 10 }).create();
    const c = w.clone(e);
    w.set(e, Transform, { x: 99 });
    assert.strictEqual(w.get(e, Transform).x, 99);
    assert.strictEqual(w.get(c, Transform).x, 10);
  });

  it("clone preserves tags", () => {
    const w = createWorld();
    const e = w.entity().with(Transform).with(EnemyTag).with(PlayerTag).create();
    const c = w.clone(e);
    assert.ok(w.has(c, EnemyTag));
    assert.ok(w.has(c, PlayerTag));
  });

  it("clone preserves archetype", () => {
    const w = createWorld();
    const e = w.entity().with(Transform).with(Velocity).create();
    const c = w.clone(e);
    const sigE = w._archetypeSystem.entitySignature(e);
    const sigC = w._archetypeSystem.entitySignature(c);
    assert.ok(sigE.equals(sigC));
  });

  it("clone of bare entity", () => {
    const w = createWorld();
    const e = w.createEntity();
    const c = w.clone(e);
    assert.ok(w.isAlive(c));
    assert.notStrictEqual(c, e);
  });

  it("mutating clone does not affect original", () => {
    const w = createWorld();
    const e = w.entity().with(Transform, { x: 5 }).with(Velocity, { x: 1 }).create();
    const c = w.clone(e);
    w.set(c, Transform, { x: 100 });
    w.set(c, Velocity, { x: 50 });
    assert.strictEqual(w.get(e, Transform).x, 5);
    assert.strictEqual(w.get(e, Velocity).x, 1);
    assert.strictEqual(w.get(c, Transform).x, 100);
    assert.strictEqual(w.get(c, Velocity).x, 50);
  });

  it("clone with many components", () => {
    const w = createWorld();
    const e = w.entity()
      .with(Transform, { x: 1, y: 2, rotation: 0.5, scaleX: 2, scaleY: 3 })
      .with(Velocity, { x: 4, y: 5 })
      .with(Collider, { width: 32, height: 64 })
      .with(Renderable, { image: 1, fillColor: 0xff0000, shape: 0, layer: 0 })
      .with(Visible, { value: 1 })
      .with(RenderBounds, { width: 32, height: 64 })
      .create();
    const c = w.clone(e);
    assert.strictEqual(w.get(c, Transform).x, 1);
    assert.strictEqual(w.get(c, Transform).y, 2);
    assert.strictEqual(w.get(c, Transform).rotation, 0.5);
    assert.strictEqual(w.get(c, Transform).scaleX, 2);
    assert.strictEqual(w.get(c, Transform).scaleY, 3);
    assert.strictEqual(w.get(c, Velocity).x, 4);
    assert.strictEqual(w.get(c, Velocity).y, 5);
    assert.strictEqual(w.get(c, Collider).width, 32);
    assert.strictEqual(w.get(c, Collider).height, 64);
    assert.strictEqual(w.get(c, Renderable).image, 1);
    assert.strictEqual(w.get(c, Visible).value, 1);
  });

  it("clone throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.clone(999), /not alive/);
  });

  it("clone then modify both independently", () => {
    const w = createWorld();
    const e = w.entity().with(Transform, { x: 0, y: 0 }).create();
    const c = w.clone(e);
    w.set(e, Transform, { x: 10 });
    w.set(c, Transform, { y: 20 });
    assert.strictEqual(w.get(e, Transform).x, 10);
    assert.strictEqual(w.get(e, Transform).y, 0);
    assert.strictEqual(w.get(c, Transform).x, 0);
    assert.strictEqual(w.get(c, Transform).y, 20);
  });
});

// ─────────────────────────────────────────────────────────
// Query Integration
// ─────────────────────────────────────────────────────────
describe("Query integration", () => {
  it("query matches entity after add", () => {
    const w = createWorld();
    const e = w.createEntity();
    const q = { all: [w.registry.getId(Transform)] };
    let count = 0;
    for (const t of w.queryEngine.getTables(w.queryEngine.createQuery(q))) {
      count += t.count;
    }
    assert.strictEqual(count, 0);
    w.add(e, Transform);
    count = 0;
    for (const t of w.queryEngine.getTables(w.queryEngine.createQuery(q))) {
      count += t.count;
    }
    assert.strictEqual(count, 1);
  });

  it("query updates after remove", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    const q = { all: [w.registry.getId(Transform)] };
    w.remove(e, Transform);
    let count = 0;
    for (const t of w.queryEngine.getTables(w.queryEngine.createQuery(q))) {
      count += t.count;
    }
    assert.strictEqual(count, 0);
  });

  it("query matches entity after addMany", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Velocity);
    const q = { all: [w.registry.getId(Transform), w.registry.getId(Velocity)] };
    let count = 0;
    for (const t of w.queryEngine.getTables(w.queryEngine.createQuery(q))) {
      count += t.count;
    }
    assert.strictEqual(count, 1);
  });

  it("query updates after removeMany", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Velocity);
    w.removeMany(e, Velocity);
    const q1 = { all: [w.registry.getId(Transform), w.registry.getId(Velocity)] };
    let count = 0;
    for (const t of w.queryEngine.getTables(w.queryEngine.createQuery(q1))) {
      count += t.count;
    }
    assert.strictEqual(count, 0);
    const q2 = { all: [w.registry.getId(Transform)] };
    count = 0;
    for (const t of w.queryEngine.getTables(w.queryEngine.createQuery(q2))) {
      count += t.count;
    }
    assert.strictEqual(count, 1);
  });

  it("world.query() returns cached QueryView", () => {
    const w = createWorld();
    const q = { all: [w.registry.getId(Transform)] };
    const v1 = w.query(q);
    const v2 = w.query(q);
    assert.strictEqual(v1, v2);
  });
});

// ─────────────────────────────────────────────────────────
// Resources
// ─────────────────────────────────────────────────────────
describe("Resources unaffected", () => {
  it("clone does not copy resources", () => {
    const w = createWorld();
    const key = {};
    w.setResource(key, "value");
    const e = w.createEntity();
    const c = w.clone(e);
    assert.strictEqual(w.getResource(key), "value");
  });

  it("destroy entity does not affect resources", () => {
    const w = createWorld();
    const key = {};
    w.setResource(key, "value");
    const e = w.createEntity();
    w.destroyEntity(e);
    assert.strictEqual(w.getResource(key), "value");
  });

  it("clear entity does not affect resources", () => {
    const w = createWorld();
    const key = {};
    w.setResource(key, "value");
    const e = w.createEntity();
    w.add(e, Transform);
    w.clear(e);
    assert.strictEqual(w.getResource(key), "value");
  });
});

// ─────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────
describe("Error handling", () => {
  it("add throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.add(999, Transform), /not alive/);
  });

  it("remove throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.remove(999, Transform), /not alive/);
  });

  it("get throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.get(999, Transform), /not alive/);
  });

  it("set throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.set(999, Transform, { x: 1 }), /not alive/);
  });

  it("clear throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.clear(999), /not alive/);
  });

  it("clone throws for dead entity", () => {
    const w = createWorld();
    assert.throws(() => w.clone(999), /not alive/);
  });

  it("add throws for unregistered component", () => {
    const w = createWorld();
    class Unknown {}
    const e = w.createEntity();
    assert.throws(() => w.add(e, Unknown), /not registered/);
  });

  it("get throws when component missing", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    assert.throws(() => w.get(e, Velocity), /does not have/);
  });

  it("set throws when component missing", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    assert.throws(() => w.set(e, Velocity, { x: 1 }), /does not have/);
  });

  it("add throws with invalid component type", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.throws(() => w.add(e, 123), /must be a component class/);
  });

  it("add throws with null component", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.throws(() => w.add(e, null), /must be a component class/);
  });
});

// ─────────────────────────────────────────────────────────
// Archetype Migration
// ─────────────────────────────────────────────────────────
describe("Archetype migration", () => {
  it("add component changes archetype", () => {
    const w = createWorld();
    const e = w.createEntity();
    const sig1 = w._archetypeSystem.entitySignature(e);
    w.add(e, Transform);
    const sig2 = w._archetypeSystem.entitySignature(e);
    assert.notStrictEqual(sig1.key, sig2.key);
  });

  it("remove component changes archetype back", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    const sig1 = w._archetypeSystem.entitySignature(e);
    w.remove(e, Transform);
    const sig2 = w._archetypeSystem.entitySignature(e);
    assert.strictEqual(sig2.size, 0);
  });

  it("addMany produces single archetype transition", () => {
    const w = createWorld();
    const e = w.createEntity();
    const sigBefore = w._archetypeSystem.entitySignature(e);
    w.addMany(e, Transform, Velocity, Collider);
    const sigAfter = w._archetypeSystem.entitySignature(e);
    // All three should be in the signature
    assert.strictEqual(sigAfter.size, 3);
  });

  it("remove of all components returns to empty archetype", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Velocity);
    w.removeMany(e, Transform, Velocity);
    const sig = w._archetypeSystem.entitySignature(e);
    assert.strictEqual(sig.size, 0);
  });

  it("entity starts in empty archetype", () => {
    const w = createWorld();
    const e = w.createEntity();
    const sig = w._archetypeSystem.entitySignature(e);
    assert.strictEqual(sig.size, 0);
  });
});

// ─────────────────────────────────────────────────────────
// Performance / Stress
// ─────────────────────────────────────────────────────────
describe("Performance", () => {
  it("addMany with 100 entities", () => {
    const w = createWorld();
    const ids = [];
    for (let i = 0; i < 100; i++) {
      const e = w.createEntity();
      w.addMany(e, Transform, Velocity, Collider, Renderable, Visible);
      w.set(e, Transform, { x: i, y: i * 2 });
      ids.push(e);
    }
    for (const id of ids) {
      assert.ok(w.has(id, Transform));
      assert.ok(w.has(id, Velocity));
    }
  });

  it("repeated create/destroy cycles", () => {
    const w = createWorld();
    for (let cycle = 0; cycle < 100; cycle++) {
      const e = w.createEntity();
      w.add(e, Transform);
      w.set(e, Transform, { x: cycle });
      w.destroyEntity(e);
    }
    assert.ok(true);
  });

  it("builder with 100 entities", () => {
    const w = createWorld();
    for (let i = 0; i < 100; i++) {
      w.entity()
        .with(Transform, { x: i, y: i })
        .with(Velocity, { x: 1, y: 0 })
        .with(EnemyTag)
        .create();
    }
  });

  it("clone 100 entities", () => {
    const w = createWorld();
    const originals = [];
    for (let i = 0; i < 100; i++) {
      const e = w.entity().with(Transform, { x: i }).create();
      originals.push(e);
    }
    for (const e of originals) {
      const c = w.clone(e);
      assert.ok(w.isAlive(c));
      assert.strictEqual(w.get(c, Transform).x, w.get(e, Transform).x);
    }
  });

  it("add/remove cycle stress", () => {
    const w = createWorld();
    const e = w.createEntity();
    for (let i = 0; i < 500; i++) {
      w.add(e, Transform);
      w.remove(e, Transform);
    }
    assert.ok(w.isAlive(e));
  });
});

// ─────────────────────────────────────────────────────────
// Tag Components
// ─────────────────────────────────────────────────────────
describe("Tag components", () => {
  it("add tag via add()", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, EnemyTag);
    assert.ok(w.has(e, EnemyTag));
  });

  it("remove tag via remove()", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, EnemyTag);
    w.remove(e, EnemyTag);
    assert.ok(!w.has(e, EnemyTag));
  });

  it("multiple tags", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, EnemyTag, PlayerTag, ProjectileTag);
    assert.ok(w.has(e, EnemyTag));
    assert.ok(w.has(e, PlayerTag));
    assert.ok(w.has(e, ProjectileTag));
    w.removeMany(e, EnemyTag, ProjectileTag);
    assert.ok(!w.has(e, EnemyTag));
    assert.ok(w.has(e, PlayerTag));
    assert.ok(!w.has(e, ProjectileTag));
  });

  it("tag + data component", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, EnemyTag);
    w.set(e, Transform, { x: 42 });
    assert.strictEqual(w.get(e, Transform).x, 42);
    assert.ok(w.has(e, EnemyTag));
  });
});

// ─────────────────────────────────────────────────────────
// API Consistency
// ─────────────────────────────────────────────────────────
describe("API consistency", () => {
  it("add delegates to addComponent", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    assert.ok(w.hasComponent(e, Transform) === w.has(e, Transform));
  });

  it("remove delegates to removeComponent", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addComponent(e, Transform);
    w.remove(e, Transform);
    assert.ok(!w.hasComponent(e, Transform));
  });

  it("has delegates to hasComponent", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addComponent(e, Transform);
    assert.strictEqual(w.hasComponent(e, Transform), w.has(e, Transform));
  });

  it("get delegates to getComponent", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.addComponent(e, Transform);
    const v1 = w.getComponent(e, Transform);
    const v2 = w.get(e, Transform);
    assert.strictEqual(v1, v2);
  });

  it("set delegates to setComponent", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.add(e, Transform);
    w.set(e, Transform, { x: 99 });
    assert.strictEqual(w.getComponent(e, Transform).x, 99);
  });
});
