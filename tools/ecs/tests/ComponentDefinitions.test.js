import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, ComponentRegistry, System } from "../../../ecs/index.js";
import {
  Transform,
  Velocity,
  Collider,
  Renderable,
  Animation,
  Visible,
  RenderBounds,
  Trail,
  EnemyTag,
  PlayerTag,
  ProjectileTag,
  StaticTag,
} from "../../../ecs/index.js";

const ALL_COMPONENTS = [
  { cls: Transform, schema: { x: "f32", y: "f32", rotation: "f32", scaleX: "f32", scaleY: "f32" }, hasSchema: true },
  { cls: Velocity, schema: { x: "f32", y: "f32" }, hasSchema: true },
  { cls: Collider, schema: { width: "f32", height: "f32" }, hasSchema: true },
  { cls: Renderable, schema: { image: "u16", fillColor: "u32", shape: "u8", layer: "i16" }, hasSchema: true },
  { cls: Animation, schema: { clipId: "u16", frameIndex: "u32", elapsed: "f32", isPlaying: "u8", speed: "f32" }, hasSchema: true },
  { cls: Visible, schema: { value: "u8" }, hasSchema: true },
  { cls: RenderBounds, schema: { width: "f32", height: "f32" }, hasSchema: true },
  { cls: Trail, schema: { enabled: "u8", maxPoints: "u16", spacing: "f32", width: "f32", color: "u32", mode: "u8" }, hasSchema: true },
];

const TAG_COMPONENTS = [
  EnemyTag, PlayerTag, ProjectileTag, StaticTag,
];

function createCleanRegistry() {
  return new ComponentRegistry();
}

function createWorld() {
  const world = new World();
  for (const c of ALL_COMPONENTS) world.register(c.cls);
  for (const c of TAG_COMPONENTS) world.register(c);
  return world;
}

describe("Component Definitions", () => {
  // ─── Construction ────────────────────────────────────
  describe("construction", () => {
    for (const { cls, schema, hasSchema } of ALL_COMPONENTS) {
      it(`${cls.name} instantiates`, () => {
        const inst = new cls();
        assert.ok(inst instanceof cls);
      });
    }

    for (const cls of TAG_COMPONENTS) {
      it(`${cls.name} instantiates`, () => {
        const inst = new cls();
        assert.ok(inst instanceof cls);
      });
    }

    for (const { cls } of ALL_COMPONENTS) {
      it(`${cls.name} constructor name matches`, () => {
        assert.strictEqual(cls.name, cls.prototype.constructor.name);
      });
    }

    for (const cls of TAG_COMPONENTS) {
      it(`${cls.name} constructor name matches`, () => {
        assert.strictEqual(cls.name, cls.prototype.constructor.name);
      });
    }
  });

  // ─── Schema / Defaults ───────────────────────────────
  describe("schema and defaults", () => {
    for (const { cls, schema, hasSchema } of ALL_COMPONENTS) {
      if (hasSchema) {
        it(`${cls.name} defines static schema with ${Object.keys(schema).length} fields`, () => {
          assert.ok(cls.schema);
          assert.strictEqual(typeof cls.schema, "object");
          assert.strictEqual(Object.keys(cls.schema).length, Object.keys(schema).length);
        });

        for (const [field, type] of Object.entries(schema)) {
          it(`${cls.name}.schema.${field} === "${type}"`, () => {
            assert.strictEqual(cls.schema[field], type);
          });
        }
      } else {
        it(`${cls.name} has no schema`, () => {
          assert.strictEqual(cls.schema, undefined);
        });
      }
    }

    for (const cls of TAG_COMPONENTS) {
      it(`${cls.name} has no schema`, () => {
        assert.strictEqual(cls.schema, undefined);
      });
    }
  });

  // ─── No Prototype Methods ────────────────────────────
  describe("no prototype methods", () => {
    for (const { cls } of ALL_COMPONENTS) {
      it(`${cls.name} prototype has no enumerable methods`, () => {
        const proto = cls.prototype;
        const ownKeys = Object.getOwnPropertyNames(proto);
        const methods = ownKeys.filter(k => k !== "constructor");
        assert.strictEqual(methods.length, 0);
      });
    }

    for (const cls of TAG_COMPONENTS) {
      it(`${cls.name} prototype has no enumerable methods`, () => {
        const proto = cls.prototype;
        const ownKeys = Object.getOwnPropertyNames(proto);
        const methods = ownKeys.filter(k => k !== "constructor");
        assert.strictEqual(methods.length, 0);
      });
    }
  });

  // ─── Registration ────────────────────────────────────
  describe("registration", () => {
    for (const { cls } of ALL_COMPONENTS) {
      it(`${cls.name} registers successfully`, () => {
        const reg = createCleanRegistry();
        const meta = reg.register(cls);
        assert.ok(meta);
        assert.strictEqual(meta.name, cls.name);
        assert.ok(reg.has(cls));
        assert.ok(reg.getId(cls) > 0);
      });
    }

    for (const cls of TAG_COMPONENTS) {
      it(`${cls.name} registers successfully`, () => {
        const reg = createCleanRegistry();
        const meta = reg.register(cls);
        assert.ok(meta);
        assert.strictEqual(meta.name, cls.name);
        assert.strictEqual(meta.component, cls);
        assert.deepStrictEqual(meta.schema, {});
      });
    }

    it("returns frozen metadata", () => {
      const reg = createCleanRegistry();
      const meta = reg.register(Transform);
      assert.ok(Object.isFrozen(meta));
      assert.ok(Object.isFrozen(meta.schema));
    });

    it("registering same class twice rejects", () => {
      const reg = createCleanRegistry();
      reg.register(Transform);
      assert.throws(() => reg.register(Transform), /already registered/);
    });

    it("registering same name twice rejects", () => {
      const reg = createCleanRegistry();
      reg.register("MyComponent", { x: "f32" });
      assert.throws(
        () => reg.register("MyComponent", { y: "f32" }),
        /already registered/
      );
    });

    it("register after lock rejects", () => {
      const reg = createCleanRegistry();
      reg.lock();
      assert.throws(() => reg.register(Velocity), /locked/);
    });
  });

  // ─── Unique IDs ──────────────────────────────────────
  describe("unique IDs", () => {
    it("each component gets a different ID", () => {
      const reg = createCleanRegistry();
      const ids = new Set();
      for (const { cls } of ALL_COMPONENTS) {
        const meta = reg.register(cls);
        assert.ok(!ids.has(meta.id), `${cls.name} id ${meta.id} is duplicate`);
        ids.add(meta.id);
      }
      for (const cls of TAG_COMPONENTS) {
        const meta = reg.register(cls);
        assert.ok(!ids.has(meta.id), `${cls.name} id ${meta.id} is duplicate`);
        ids.add(meta.id);
      }
      assert.strictEqual(ids.size, ALL_COMPONENTS.length + TAG_COMPONENTS.length);
    });

    it("IDs are stable across registries", () => {
      const reg1 = createCleanRegistry();
      const reg2 = createCleanRegistry();
      for (const { cls } of ALL_COMPONENTS) {
        const m1 = reg1.register(cls);
        const m2 = reg2.register(cls);
        assert.strictEqual(m1.id, m2.id);
      }
    });

    it("IDs start at 64", () => {
      const reg = createCleanRegistry();
      const meta = reg.register(Transform);
      assert.strictEqual(meta.id, 64);
    });

    it("IDs increment sequentially", () => {
      const reg = createCleanRegistry();
      const meta1 = reg.register(Transform);
      const meta2 = reg.register(Velocity);
      assert.strictEqual(meta2.id, meta1.id + 1);
    });
  });

  // ─── Tag Components ──────────────────────────────────
  describe("tag components", () => {
    for (const cls of TAG_COMPONENTS) {
      it(`${cls.name} is a class`, () => {
        assert.strictEqual(typeof cls, "function");
      });

      it(`${cls.name} has empty schema after registration`, () => {
        const reg = createCleanRegistry();
        reg.register(cls);
        assert.deepStrictEqual(reg.getSchema(cls), {});
      });

      it(`${cls.name} adds no fields to entity`, () => {
        const world = createWorld();
        const e = world.createEntity();
        world.addComponent(e, cls);
        const view = world.getComponent(e, cls);
        assert.deepStrictEqual(Object.keys(view), []);
      });
    }

    it("all four tags exist", () => {
      assert.strictEqual(TAG_COMPONENTS.length, 4);
    });

    it("tags are distinct classes", () => {
      assert.notStrictEqual(EnemyTag, PlayerTag);
      assert.notStrictEqual(EnemyTag, ProjectileTag);
      assert.notStrictEqual(EnemyTag, StaticTag);
      assert.notStrictEqual(PlayerTag, ProjectileTag);
      assert.notStrictEqual(PlayerTag, StaticTag);
      assert.notStrictEqual(ProjectileTag, StaticTag);
    });
  });

  // ─── addComponent / removeComponent ──────────────────
  describe("addComponent / removeComponent", () => {
    it("adds Transform to entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      assert.ok(world.hasComponent(e, Transform));
    });

    it("adds Velocity to entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Velocity);
      assert.ok(world.hasComponent(e, Velocity));
    });

    it("adds Collider to entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Collider);
      assert.ok(world.hasComponent(e, Collider));
    });

    it("adds tag component to entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, EnemyTag);
      assert.ok(world.hasComponent(e, EnemyTag));
    });

    it("removes Transform from entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.removeComponent(e, Transform);
      assert.ok(!world.hasComponent(e, Transform));
    });

    it("removes tag component from entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, EnemyTag);
      world.removeComponent(e, EnemyTag);
      assert.ok(!world.hasComponent(e, EnemyTag));
    });

    it("add is idempotent", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, Transform);
      assert.ok(world.hasComponent(e, Transform));
    });

    it("remove is idempotent", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.removeComponent(e, Transform);
      assert.ok(!world.hasComponent(e, Transform));
    });

    it("adds multiple components", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, Velocity);
      world.addComponent(e, EnemyTag);
      assert.ok(world.hasComponent(e, Transform));
      assert.ok(world.hasComponent(e, Velocity));
      assert.ok(world.hasComponent(e, EnemyTag));
    });

    it("removes one component, keeps others", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, Velocity);
      world.removeComponent(e, Transform);
      assert.ok(!world.hasComponent(e, Transform));
      assert.ok(world.hasComponent(e, Velocity));
    });

    it("re-adds after remove", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.removeComponent(e, Transform);
      world.addComponent(e, Transform);
      assert.ok(world.hasComponent(e, Transform));
    });

    it("adding component to dead entity throws", () => {
      const world = createWorld();
      assert.throws(() => world.addComponent(999, Transform), /not alive/);
    });

    it("removing component from dead entity throws", () => {
      const world = createWorld();
      assert.throws(() => world.removeComponent(999, Transform), /not alive/);
    });
  });

  // ─── getComponent ────────────────────────────────────
  describe("getComponent", () => {
    it("returns an object for schema component", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const view = world.getComponent(e, Transform);
      assert.ok(typeof view === "object");
      assert.notStrictEqual(view, null);
    });

    it("returns an object for tag component", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, EnemyTag);
      const view = world.getComponent(e, EnemyTag);
      assert.ok(typeof view === "object");
    });

    it("returned view has field getters for schema component", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const view = world.getComponent(e, Transform);
      assert.strictEqual(typeof view.x, "number");
      assert.strictEqual(typeof view.y, "number");
      assert.strictEqual(typeof view.rotation, "number");
      assert.strictEqual(typeof view.scaleX, "number");
      assert.strictEqual(typeof view.scaleY, "number");
    });

    it("fields are zero-initialized", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const view = world.getComponent(e, Transform);
      assert.strictEqual(view.x, 0);
      assert.strictEqual(view.y, 0);
      assert.strictEqual(view.rotation, 0);
      assert.strictEqual(view.scaleX, 0);
      assert.strictEqual(view.scaleY, 0);
    });

    it("can set field via view setter", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const view = world.getComponent(e, Transform);
      view.x = 100;
      view.y = 200;
      assert.strictEqual(view.x, 100);
      assert.strictEqual(view.y, 200);
    });

    it("getComponent is cached (same object)", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const v1 = world.getComponent(e, Transform);
      const v2 = world.getComponent(e, Transform);
      assert.strictEqual(v1, v2);
    });

    it("getComponent cache invalidated on archetype change", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const v1 = world.getComponent(e, Transform);
      world.addComponent(e, Velocity);
      const v2 = world.getComponent(e, Transform);
      assert.notStrictEqual(v1, v2);
    });

    it("throws for entity without component", () => {
      const world = createWorld();
      const e = world.createEntity();
      assert.throws(() => world.getComponent(e, Transform), /does not have/);
    });

    it("throws for dead entity", () => {
      const world = createWorld();
      assert.throws(() => world.getComponent(999, Transform), /not alive/);
    });

    it("Velocity fields are accessible", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Velocity);
      const view = world.getComponent(e, Velocity);
      assert.strictEqual(view.x, 0);
      assert.strictEqual(view.y, 0);
    });

    it("Animation fields are accessible", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Animation);
      const view = world.getComponent(e, Animation);
      assert.strictEqual(view.frameIndex, 0);
      assert.strictEqual(view.elapsed, 0);
      assert.strictEqual(view.isPlaying, 0);
    });

    it("Visible field is accessible", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Visible);
      const view = world.getComponent(e, Visible);
      assert.strictEqual(view.value, 0);
    });
  });

  // ─── hasComponent ────────────────────────────────────
  describe("hasComponent", () => {
    it("returns true after add", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      assert.ok(world.hasComponent(e, Transform));
    });

    it("returns false before add", () => {
      const world = createWorld();
      const e = world.createEntity();
      assert.ok(!world.hasComponent(e, Transform));
    });

    it("returns false after remove", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.removeComponent(e, Transform);
      assert.ok(!world.hasComponent(e, Transform));
    });

    it("returns false for dead entity", () => {
      const world = createWorld();
      assert.ok(!world.hasComponent(999, Transform));
    });

    it("works with tag components", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, EnemyTag);
      assert.ok(world.hasComponent(e, EnemyTag));
      world.removeComponent(e, EnemyTag);
      assert.ok(!world.hasComponent(e, EnemyTag));
    });
  });

  // ─── setComponent ────────────────────────────────────
  describe("setComponent", () => {
    it("sets Transform fields", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x: 10, y: 20, rotation: 1.5, scaleX: 2, scaleY: 3 });
      const view = world.getComponent(e, Transform);
      assert.strictEqual(view.x, 10);
      assert.strictEqual(view.y, 20);
      assert.strictEqual(view.rotation, 1.5);
      assert.strictEqual(view.scaleX, 2);
      assert.strictEqual(view.scaleY, 3);
    });

    it("sets Velocity fields", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 5, y: -3 });
      const view = world.getComponent(e, Velocity);
      assert.strictEqual(view.x, 5);
      assert.strictEqual(view.y, -3);
    });

    it("sets Collider fields", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Collider);
      world.setComponent(e, Collider, { width: 32, height: 64 });
      const view = world.getComponent(e, Collider);
      assert.strictEqual(view.width, 32);
      assert.strictEqual(view.height, 64);
    });

    it("throws for entity without component", () => {
      const world = createWorld();
      const e = world.createEntity();
      assert.throws(() => world.setComponent(e, Transform, { x: 1 }), /does not have/);
    });
  });

  // ─── Archetype Migration ─────────────────────────────
  describe("archetype migration", () => {
    it("adding component changes archetype signature", () => {
      const world = createWorld();
      const e = world.createEntity();
      const sig1 = world._archetypeSystem.entitySignature(e);
      world.addComponent(e, Transform);
      const sig2 = world._archetypeSystem.entitySignature(e);
      assert.notStrictEqual(sig1.key, sig2.key);
    });

    it("removing component reverts archetype signature", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const sig1 = world._archetypeSystem.entitySignature(e);
      world.removeComponent(e, Transform);
      const sig2 = world._archetypeSystem.entitySignature(e);
      assert.strictEqual(sig2.size, 0);
      assert.strictEqual(sig2.key, "");
    });

    it("multiple components create combined archetype", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, Velocity);
      const sig = world._archetypeSystem.entitySignature(e);
      assert.ok(sig.contains(world.registry.getId(Transform)));
      assert.ok(sig.contains(world.registry.getId(Velocity)));
    });

    it("tag component triggers archetype migration", () => {
      const world = createWorld();
      const e = world.createEntity();
      const sig1 = world._archetypeSystem.entitySignature(e);
      world.addComponent(e, EnemyTag);
      const sig2 = world._archetypeSystem.entitySignature(e);
      assert.ok(sig2.contains(world.registry.getId(EnemyTag)));
      assert.notStrictEqual(sig1.key, sig2.key);
    });

    it("remove one of two components keeps the other", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, Velocity);
      world.removeComponent(e, Transform);
      const sig = world._archetypeSystem.entitySignature(e);
      assert.ok(!sig.contains(world.registry.getId(Transform)));
      assert.ok(sig.contains(world.registry.getId(Velocity)));
    });

    it("component data preserved across add/remove/re-add", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x: 42 });
      world.removeComponent(e, Transform);
      world.addComponent(e, Transform);
      const view = world.getComponent(e, Transform);
      assert.strictEqual(view.x, 0);
    });
  });

  // ─── Query Matching ──────────────────────────────────
  describe("query matching", () => {
    it("query all of [Transform] matches entity with Transform", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      const query = world.queryEngine.createQuery({ all: [world.registry.getId(Transform)] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.ok(count > 0);
    });

    it("query all of [Transform, Velocity] matches entity with both", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, Velocity);
      const query = world.queryEngine.createQuery({ all: [world.registry.getId(Transform), world.registry.getId(Velocity)] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.strictEqual(count, 1);
    });

    it("query all of [EnemyTag] matches tagged entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, EnemyTag);
      const query = world.queryEngine.createQuery({ all: [world.registry.getId(EnemyTag)] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.strictEqual(count, 1);
    });

    it("query all of [ProjectileTag] matches projectile entity", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, ProjectileTag);
      const query = world.queryEngine.createQuery({ all: [world.registry.getId(ProjectileTag)] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.strictEqual(count, 1);
    });

    it("query none of [EnemyTag] excludes tagged entity", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, EnemyTag);
      const e2 = world.createEntity();
      world.addComponent(e2, Transform);
      const query = world.queryEngine.createQuery({ none: [world.registry.getId(EnemyTag)] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.ok(count >= 1);
    });

    it("query with Transform + EnemyTag combined", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, EnemyTag);
      const tid = world.registry.getId(Transform);
      const eid = world.registry.getId(EnemyTag);
      const query = world.queryEngine.createQuery({ all: [tid, eid] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.strictEqual(count, 1);
    });

    it("query matches zero entities when none match", () => {
      const world = createWorld();
      world.createEntity();
      const query = world.queryEngine.createQuery({ all: [world.registry.getId(Velocity)] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.strictEqual(count, 0);
    });

    it("archetype split creates new matchable table", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, Collider);
      const tid = world.registry.getId(Transform);
      const cid = world.registry.getId(Collider);
      const query = world.queryEngine.createQuery({ all: [tid, cid] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.strictEqual(count, 1);
    });

    it("multiple entities in same archetype all match", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Transform);
      const e2 = world.createEntity();
      world.addComponent(e2, Transform);
      const query = world.queryEngine.createQuery({ all: [world.registry.getId(Transform)] });
      const tables = world.queryEngine.getTables(query);
      let count = 0;
      for (const t of tables) count += t.count;
      assert.strictEqual(count, 2);
    });
  });

  // ─── World Integration ───────────────────────────────
  describe("world integration", () => {
    it("full entity lifecycle with components", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x: 10, y: 20 });
      world.addComponent(e, Velocity);
      world.setComponent(e, Velocity, { x: 1, y: 2 });
      world.addComponent(e, EnemyTag);
      assert.ok(world.hasComponent(e, Transform));
      assert.ok(world.hasComponent(e, Velocity));
      assert.ok(world.hasComponent(e, EnemyTag));
      const t = world.getComponent(e, Transform);
      assert.strictEqual(t.x, 10);
      assert.strictEqual(t.y, 20);
      world.removeComponent(e, Velocity);
      assert.ok(!world.hasComponent(e, Velocity));
      assert.ok(world.hasComponent(e, Transform));
      world.destroyEntity(e);
      assert.ok(!world.isAlive(e));
    });

    it("multiple worlds have independent registries", () => {
      const w1 = createWorld();
      const w2 = createWorld();
      const e1 = w1.createEntity();
      const e2 = w2.createEntity();
      w1.addComponent(e1, Transform);
      w2.addComponent(e2, Transform);
      assert.ok(w1.hasComponent(e1, Transform));
      assert.ok(w2.hasComponent(e2, Transform));
      w1.removeComponent(e1, Transform);
      assert.ok(!w1.hasComponent(e1, Transform));
      assert.ok(w2.hasComponent(e2, Transform));
    });

    it("system can query by Transform", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x: 5 });
      let queriedX = 0;
      class MoveSystem extends System {
        static query = { all: [Transform] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            const col = ctx.column(Transform, "x");
            if (col) queriedX = col[row];
          });
        }
      }
      world.addSystem(new MoveSystem());
      world.update(16);
      assert.strictEqual(queriedX, 5);
    });

    it("system can query by tag component", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, EnemyTag);
      let matched = false;
      class TagCheckSystem extends System {
        static query = { all: [EnemyTag] };
        update(ctx, dt) {
          matched = ctx.entityCount > 0;
        }
      }
      world.addSystem(new TagCheckSystem());
      world.update(16);
      assert.ok(matched);
    });

    it("system can query by combined component + tag", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.addComponent(e, PlayerTag);
      world.setComponent(e, Transform, { x: 99 });
      let val = 0;
      class PlayerMoveSystem extends System {
        static query = { all: [Transform, PlayerTag] };
        update(ctx, dt) {
          ctx.forEach((table, row) => {
            const col = ctx.column(Transform, "x");
            if (col) val = col[row];
          });
        }
      }
      world.addSystem(new PlayerMoveSystem());
      world.update(16);
      assert.strictEqual(val, 99);
    });
  });

  // ─── Serialization Friendliness ──────────────────────
  describe("serialization friendliness", () => {
    for (const { cls } of ALL_COMPONENTS) {
      it(`${cls.name} can be stringified via JSON`, () => {
        const obj = { type: cls.name };
        const str = JSON.stringify(obj);
        assert.ok(typeof str === "string");
        assert.ok(str.includes(cls.name));
      });
    }

    for (const cls of TAG_COMPONENTS) {
      it(`${cls.name} can be stringified via JSON`, () => {
        const obj = { type: cls.name };
        const str = JSON.stringify(obj);
        assert.ok(typeof str === "string");
        assert.ok(str.includes(cls.name));
      });
    }

    it("schema is JSON-serializable", () => {
      const reg = createCleanRegistry();
      reg.register(Transform);
      const schema = reg.getSchema(Transform);
      const str = JSON.stringify(schema);
      assert.ok(str.includes("x"));
      assert.ok(str.includes("f32"));
    });
  });

  // ─── Immutable Schemas ───────────────────────────────
  describe("immutable schemas", () => {
    it("registry returns frozen schema", () => {
      const reg = createCleanRegistry();
      reg.register(Transform);
      const schema = reg.getSchema(Transform);
      assert.ok(Object.isFrozen(schema));
    });

    it("cannot add fields to registered schema", () => {
      const reg = createCleanRegistry();
      reg.register(Velocity);
      const schema = reg.getSchema(Velocity);
      assert.ok(Object.isFrozen(schema));
    });
  });

  // ─── Component Identity ──────────────────────────────
  describe("component identity", () => {
    it("Transform !== Velocity", () => {
      assert.notStrictEqual(Transform, Velocity);
    });

    it("Collider !== Animation", () => {
      assert.notStrictEqual(Collider, Animation);
    });

    it("Renderable !== Visible", () => {
      assert.notStrictEqual(Renderable, Visible);
    });

    it("all data components are distinct classes", () => {
      const classes = [Transform, Velocity, Collider, Renderable, Animation, Visible];
      const set = new Set(classes);
      assert.strictEqual(set.size, classes.length);
    });
  });

  // ─── Export Surface ──────────────────────────────────
  describe("export surface", () => {
    it("exports Transform", () => {
      assert.strictEqual(Transform.name, "Transform");
    });
    it("exports Velocity", () => {
      assert.strictEqual(Velocity.name, "Velocity");
    });
    it("exports Collider", () => {
      assert.strictEqual(Collider.name, "Collider");
    });
    it("exports Renderable", () => {
      assert.strictEqual(Renderable.name, "Renderable");
    });
    it("exports Animation", () => {
      assert.strictEqual(Animation.name, "Animation");
    });
    it("exports Visible", () => {
      assert.strictEqual(Visible.name, "Visible");
    });
    it("exports EnemyTag", () => {
      assert.strictEqual(EnemyTag.name, "EnemyTag");
    });
    it("exports PlayerTag", () => {
      assert.strictEqual(PlayerTag.name, "PlayerTag");
    });
    it("exports ProjectileTag", () => {
      assert.strictEqual(ProjectileTag.name, "ProjectileTag");
    });
    it("exports StaticTag", () => {
      assert.strictEqual(StaticTag.name, "StaticTag");
    });

    it("imports from ecs/index.js barrel", () => {
      assert.strictEqual(typeof Transform, "function");
      assert.strictEqual(typeof Velocity, "function");
    });
  });
});
