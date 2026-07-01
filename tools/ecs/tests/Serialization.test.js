import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, Serializer, Transform, Velocity, Collider, Visible,
  Renderable, EnemyTag, PlayerTag, ProjectileTag, System } from "../../../ecs/index.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Velocity);
  world.register(Collider);
  world.register(Visible);
  world.register(Renderable);
  world.register(EnemyTag);
  world.register(PlayerTag);
  world.register(ProjectileTag);
  return world;
}

function roundTrip(world) {
  const json = world.serialize();
  const restored = new World();
  restored.register(Transform);
  restored.register(Velocity);
  restored.register(Collider);
  restored.register(Visible);
  restored.register(Renderable);
  restored.register(EnemyTag);
  restored.register(PlayerTag);
  restored.register(ProjectileTag);
  const idMap = restored.deserialize(json);
  return { restored, json, idMap };
}

describe("Serializer — basic", () => {
  it("serializes empty world", () => {
    const world = createWorld();
    const json = world.serialize();
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.version, 1);
    assert.ok(Array.isArray(parsed.entities));
    assert.strictEqual(parsed.entities.length, 0);
  });

  it("version field exists", () => {
    const world = createWorld();
    const json = world.serialize();
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.version, 1);
  });

  it("deserialize empty world", () => {
    const world = createWorld();
    const json = world.serialize();
    const restored = new World();
    restored.register(Transform);
    restored.register(Velocity);
    restored.deserialize(json);
    assert.strictEqual([...restored.query(restored.queryEngine.createQuery({})).entities()].length, 0);
  });

  it("round-trip single entity", () => {
    const world = createWorld();
    const e = world.entity()
      .with(Transform, { x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 })
      .with(Velocity, { x: 5, y: -3 })
      .create();

    const { restored } = roundTrip(world);
    const entities = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.strictEqual(entities.length, 1);

    const t = restored.get(entities[0], Transform);
    assert.strictEqual(t.x, 100);
    assert.strictEqual(t.y, 200);
    assert.strictEqual(t.rotation, 0);
    assert.strictEqual(t.scaleX, 1);
    assert.strictEqual(t.scaleY, 1);

    const v = restored.get(entities[0], Velocity);
    assert.strictEqual(v.x, 5);
    assert.strictEqual(v.y, -3);
  });

  it("round-trip multiple entities", () => {
    const world = createWorld();
    for (let i = 0; i < 10; i++) {
      world.entity()
        .with(Transform, { x: i * 10, y: i * 20, rotation: 0, scaleX: 1, scaleY: 1 })
        .with(Velocity, { x: i, y: -i })
        .create();
    }

    const { restored } = roundTrip(world);
    const entities = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.strictEqual(entities.length, 10);

    const sorted = [...entities].sort((a, b) => a - b);
    for (let i = 0; i < 10; i++) {
      const t = restored.get(sorted[i], Transform);
      assert.strictEqual(t.x, i * 10);
      assert.strictEqual(t.y, i * 20);
      const v = restored.get(sorted[i], Velocity);
      assert.strictEqual(v.x, i);
    }
  });

  it("preserves entity values exactly", () => {
    const world = createWorld();
    const e = world.entity()
      .with(Transform, { x: 1.5, y: -2.5, rotation: Math.PI, scaleX: 0.5, scaleY: 1.5 })
      .with(Collider, { width: 64, height: 128 })
      .with(Visible, { value: 1 })
      .create();

    const { restored } = roundTrip(world);
    const [re] = [...restored.query(restored.queryEngine.createQuery({})).entities()];

    const t = restored.get(re, Transform);
    assert.strictEqual(t.x, 1.5);
    assert.strictEqual(t.y, -2.5);
    assert.ok(Math.abs(t.rotation - Math.PI) < 1e-6);
    assert.strictEqual(t.scaleX, 0.5);
    assert.strictEqual(t.scaleY, 1.5);

    const c = restored.get(re, Collider);
    assert.strictEqual(c.width, 64);
    assert.strictEqual(c.height, 128);

    const v = restored.get(re, Visible);
    assert.strictEqual(v.value, 1);
  });
});

describe("Serializer — tags", () => {
  it("round-trips tags", () => {
    const world = createWorld();
    world.entity()
      .with(Transform, { x: 0, y: 0 })
      .with(EnemyTag)
      .with(ProjectileTag)
      .create();

    const { restored } = roundTrip(world);
    const [re] = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.ok(restored.has(re, EnemyTag));
    assert.ok(restored.has(re, ProjectileTag));
    assert.ok(restored.has(re, Transform));
  });

  it("entity with only tags", () => {
    const world = createWorld();
    world.entity().with(EnemyTag).with(PlayerTag).create();

    const { restored } = roundTrip(world);
    const [re] = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.ok(restored.has(re, EnemyTag));
    assert.ok(restored.has(re, PlayerTag));
  });

  it("multiple entities with different tags", () => {
    const world = createWorld();
    world.entity().with(Transform, { x: 0, y: 0 }).with(EnemyTag).create();
    world.entity().with(Transform, { x: 1, y: 1 }).with(PlayerTag).create();
    world.entity().with(Transform, { x: 2, y: 2 }).with(ProjectileTag).create();

    const { restored } = roundTrip(world);
    const eId = restored.registry.getId(EnemyTag);
    const pId = restored.registry.getId(PlayerTag);
    const jId = restored.registry.getId(ProjectileTag);
    const qEnemy = restored.query(restored.queryEngine.createQuery({ all: [eId] }));
    const qPlayer = restored.query(restored.queryEngine.createQuery({ all: [pId] }));
    const qProj = restored.query(restored.queryEngine.createQuery({ all: [jId] }));

    assert.strictEqual([...qEnemy.entities()].length, 1);
    assert.strictEqual([...qPlayer.entities()].length, 1);
    assert.strictEqual([...qProj.entities()].length, 1);
  });
});

describe("Serializer — determinism", () => {
  it("same world produces same JSON", () => {
    const world = createWorld();
    for (let i = 0; i < 5; i++) {
      world.entity()
        .with(Transform, { x: i, y: i * 2 })
        .with(EnemyTag)
        .create();
    }

    const json1 = world.serialize();
    const json2 = world.serialize();
    assert.strictEqual(json1, json2);
  });

  it("JSON output is stable sorted", () => {
    const world = createWorld();
    for (let i = 0; i < 5; i++) {
      world.entity()
        .with(Velocity, { x: i, y: i })
        .with(Transform, { x: i, y: i })
        .create();
    }

    const json = world.serialize();
    const parsed = JSON.parse(json);

    for (let ei = 1; ei < parsed.entities.length; ei++) {
      assert.ok(parsed.entities[ei].id > parsed.entities[ei - 1].id);
    }

    for (const entry of parsed.entities) {
      if (entry.components) {
        for (let ci = 1; ci < entry.components.length; ci++) {
          assert.ok(entry.components[ci].name > entry.components[ci - 1].name);
        }
      }
    }
  });

  it("tags are sorted alphabetically", () => {
    const world = createWorld();
    world.entity()
      .with(ProjectileTag)
      .with(EnemyTag)
      .with(PlayerTag)
      .create();

    const json = world.serialize();
    const parsed = JSON.parse(json);
    const entry = parsed.entities[0];
    assert.ok(entry.tags);
    assert.deepStrictEqual(entry.tags, ["EnemyTag", "PlayerTag", "ProjectileTag"]);
  });
});

describe("Serializer — edge cases", () => {
  it("entity with no components", () => {
    const world = createWorld();
    world.createEntity();
    const { restored } = roundTrip(world);
    const entities = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.strictEqual(entities.length, 1);
  });

  it("entity with only one component (no tags)", () => {
    const world = createWorld();
    world.entity().with(Transform, { x: 42, y: 99 }).create();

    const { restored } = roundTrip(world);
    const [re] = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.strictEqual(restored.get(re, Transform).x, 42);
  });

  it("throws on JSON parse error", () => {
    const world = createWorld();
    assert.throws(() => world.deserialize("not json"), /invalid JSON/);
  });

  it("throws on missing entities array", () => {
    const world = createWorld();
    assert.throws(() => world.deserialize('{"version":1}'), /invalid format/);
  });

  it("throws on wrong version", () => {
    const world = createWorld();
    assert.throws(() => world.deserialize('{"version":999,"entities":[]}'), /unsupported version/);
  });

  it("throws on unknown component", () => {
    const json = JSON.stringify({
      version: 1,
      entities: [{ id: 1, components: [{ name: "UnknownComp", data: {} }] }],
    });
    const world = new World();
    world.register(Transform);
    assert.throws(() => world.deserialize(json), /not registered/);
  });

  it("throws on invalid entity id", () => {
    const world = createWorld();
    assert.throws(() => world.deserialize('{"version":1,"entities":[{"id":0}]}'), /invalid entity id/);
  });
});

describe("Serializer — prefab integration", () => {
  it("serializes prefab-instantiated entities", () => {
    const world = createWorld();
    world.createPrefab("Enemy")
      .add(Transform, { x: 0, y: 0 })
      .add(Velocity, { x: 1, y: 1 })
      .tag(EnemyTag);

    const e1 = world.instantiate("Enemy");
    const e2 = world.instantiate("Enemy", {
      Transform: { x: 500, y: 300 },
    });

    const { restored } = roundTrip(world);
    const entities = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.strictEqual(entities.length, 2);

    const sorted = [...entities].sort((a, b) => a - b);
    const t1 = restored.get(sorted[0], Transform);
    const t2 = restored.get(sorted[1], Transform);
    assert.strictEqual(t1.x, 0);
    assert.strictEqual(t2.x, 500);
  });
});

describe("Serializer — world deserialize static creation", () => {
  it("deserialize creates new world if none provided", () => {
    const world = createWorld();
    world.entity()
      .with(Transform, { x: 10, y: 20 })
      .with(EnemyTag)
      .create();
    const json = world.serialize();

    const target = new World();
    target.register(Transform);
    target.register(EnemyTag);
    target.deserialize(json);

    const entities = [...target.query(target.queryEngine.createQuery({})).entities()];
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(target.get(entities[0], Transform).x, 10);
    assert.ok(target.has(entities[0], EnemyTag));
  });
});

describe("Serializer — large round-trip", () => {
  it("round-trips 1000 entities", () => {
    const world = createWorld();
    for (let i = 0; i < 1000; i++) {
      world.entity()
        .with(Transform, { x: i, y: i * 2, rotation: 0, scaleX: 1, scaleY: 1 })
        .with(Velocity, { x: 1, y: -1 })
        .with(Collider, { width: 32, height: 32 })
        .with(Visible, { value: 1 })
        .with(EnemyTag)
        .create();
    }

    const { restored } = roundTrip(world);
    const entities = [...restored.query(restored.queryEngine.createQuery({})).entities()];
    assert.strictEqual(entities.length, 1000);

    const sorted = [...entities].sort((a, b) => a - b);
    for (let i = 0; i < 1000; i++) {
      const t = restored.get(sorted[i], Transform);
      assert.strictEqual(t.x, i);
      assert.strictEqual(t.y, i * 2);
      assert.ok(restored.has(sorted[i], EnemyTag));
    }
  });
});
