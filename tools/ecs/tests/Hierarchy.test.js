import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  World, Transform, WorldTransform, Parent, Children,
  HierarchyGraph, HierarchySystem,
  Velocity, System,
} from "../../../ecs/index.js";

function createWorld() {
  const w = new World();
  w.register(Transform);
  w.register(WorldTransform);
  w.register(Parent);
  w.register(Children);
  w.register(Velocity);
  return w;
}

describe("HierarchyGraph", () => {
  it("attach sets parent on child", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    assert.strictEqual(w.parentOf(child), parent);
  });

  it("attach adds child to parent children list", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    const children = w.childrenOf(parent);
    assert.ok(children);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0], child);
  });

  it("attach adds WorldTransform to child", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    assert.ok(!w.has(child, WorldTransform));
    w.attach(child, parent);
    assert.ok(w.has(child, WorldTransform));
  });

  it("attach adds Children tag to parent", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    assert.ok(!w.has(parent, Children));
    w.attach(child, parent);
    assert.ok(w.has(parent, Children));
  });

  it("rejects self-parenting", () => {
    const w = createWorld();
    w.initHierarchy();
    const e = w.createEntity();
    assert.throws(() => w.attach(e, e));
  });

  it("rejects cycle", () => {
    const w = createWorld();
    w.initHierarchy();
    const a = w.createEntity();
    const b = w.createEntity();
    const c = w.createEntity();
    w.attach(b, a);
    w.attach(c, b);
    assert.throws(() => w.attach(a, c));
  });

  it("rejects attaching to non-existent entity", () => {
    const w = createWorld();
    w.initHierarchy();
    const child = w.createEntity();
    assert.throws(() => w.attach(child, 99999));
  });

  it("rejects attaching non-existent child", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    assert.throws(() => w.attach(99999, parent));
  });

  it("detach removes parent relationship", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    w.detach(child);
    assert.strictEqual(w.parentOf(child), null);
  });

  it("detach removes child from parent list", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    w.detach(child);
    const children = w.childrenOf(parent);
    assert.strictEqual(children, null);
  });

  it("detach removes Children tag when no children remain", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    w.detach(child);
    assert.ok(!w.has(parent, Children));
  });

  it("re-parenting works: moving child to new parent", () => {
    const w = createWorld();
    w.initHierarchy();
    const p1 = w.createEntity();
    const p2 = w.createEntity();
    const child = w.createEntity();
    w.attach(child, p1);
    w.attach(child, p2);
    assert.strictEqual(w.parentOf(child), p2);
    const c1 = w.childrenOf(p1);
    assert.strictEqual(c1, null);
    const c2 = w.childrenOf(p2);
    assert.strictEqual(c2.length, 1);
    assert.strictEqual(c2[0], child);
  });

  it("parentOf returns null for root entity", () => {
    const w = createWorld();
    w.initHierarchy();
    const e = w.createEntity();
    assert.strictEqual(w.parentOf(e), null);
  });

  it("childrenOf returns null for entity with no children", () => {
    const w = createWorld();
    w.initHierarchy();
    const e = w.createEntity();
    assert.strictEqual(w.childrenOf(e), null);
  });

  it("multiple children maintain order", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const c1 = w.createEntity();
    const c2 = w.createEntity();
    const c3 = w.createEntity();
    w.attach(c1, parent);
    w.attach(c2, parent);
    w.attach(c3, parent);
    const children = w.childrenOf(parent);
    assert.deepStrictEqual(children, [c1, c2, c3]);
  });

  it("isDescendant returns true for direct child", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    assert.ok(w.isDescendant(child, parent));
  });

  it("isDescendant returns true for nested descendant", () => {
    const w = createWorld();
    w.initHierarchy();
    const a = w.createEntity();
    const b = w.createEntity();
    const c = w.createEntity();
    w.attach(b, a);
    w.attach(c, b);
    assert.ok(w.isDescendant(c, a));
  });

  it("isDescendant returns false for non-descendant", () => {
    const w = createWorld();
    w.initHierarchy();
    const a = w.createEntity();
    const b = w.createEntity();
    assert.ok(!w.isDescendant(b, a));
  });

  it("rootOf returns top-level ancestor", () => {
    const w = createWorld();
    w.initHierarchy();
    const a = w.createEntity();
    const b = w.createEntity();
    const c = w.createEntity();
    w.attach(b, a);
    w.attach(c, b);
    assert.strictEqual(w.rootOf(c), a);
    assert.strictEqual(w.rootOf(b), a);
    assert.strictEqual(w.rootOf(a), a);
  });

  it("destroying parent detaches children", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    w.destroyEntity(parent);
    assert.ok(!w.isAlive(parent));
    assert.ok(w.isAlive(child));
    assert.strictEqual(w.parentOf(child), null);
  });

  it("attaching to entity with Transform auto-adds WorldTransform", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.attach(child, parent);
    assert.ok(w.has(child, WorldTransform));
  });

  it("attaching multiple children to same parent", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const count = 10;
    const children = [];
    for (let i = 0; i < count; i++) {
      const c = w.createEntity();
      children.push(c);
      w.attach(c, parent);
    }
    const list = w.childrenOf(parent);
    assert.strictEqual(list.length, count);
    assert.deepStrictEqual(list, children);
  });

  it("detach non-existent child is no-op", () => {
    const w = createWorld();
    w.initHierarchy();
    const e = w.createEntity();
    assert.doesNotThrow(() => w.detach(e));
  });

  it("duplicate attach is idempotent", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const child = w.createEntity();
    w.attach(child, parent);
    w.attach(child, parent);
    const children = w.childrenOf(parent);
    assert.strictEqual(children.length, 1);
  });

  it("rejects attach before initHierarchy", () => {
    const w = createWorld();
    const p = w.createEntity();
    const c = w.createEntity();
    assert.throws(() => w.attach(c, p));
  });

  it("parentOf returns null before initHierarchy", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.strictEqual(w.parentOf(e), null);
  });

  it("childrenOf returns null before initHierarchy", () => {
    const w = createWorld();
    const e = w.createEntity();
    assert.strictEqual(w.childrenOf(e), null);
  });
});

describe("HierarchySystem — transform propagation", () => {
  it("copies local transform to world transform for root entity", () => {
    const w = createWorld();
    w.addComponent(w.createEntity(), Transform);
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const e = w.createEntity();
    w.addComponent(e, Transform);
    w.set(e, Transform, { x: 10, y: 20, rotation: 0.5, scaleX: 2, scaleY: 3 });
    w.addComponent(e, WorldTransform);

    w.update(0);

    const wt = w.get(e, WorldTransform);
    assert.strictEqual(wt.x, 10);
    assert.strictEqual(wt.y, 20);
    assert.strictEqual(wt.rotation, 0.5);
    assert.strictEqual(wt.scaleX, 2);
    assert.strictEqual(wt.scaleY, 3);
  });

  it("propagates parent world transform to child", () => {
    const w = createWorld();
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    w.addComponent(parent, WorldTransform);
    w.set(parent, Transform, { x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 });

    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.set(child, Transform, { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
    w.addComponent(child, WorldTransform);

    w.attach(child, parent);
    w.update(0);

    const cwt = w.get(child, WorldTransform);
    assert.strictEqual(cwt.x, 110);
    assert.strictEqual(cwt.y, 220);
  });

  it("hierarchical transform with rotation", () => {
    const w = createWorld();
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    w.addComponent(parent, WorldTransform);
    w.set(parent, Transform, { x: 0, y: 0, rotation: Math.PI / 2, scaleX: 1, scaleY: 1 });

    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.addComponent(child, WorldTransform);
    w.set(child, Transform, { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    w.attach(child, parent);
    w.update(0);

    const cwt = w.get(child, WorldTransform);
    assert.ok(Math.abs(cwt.x - 0) < 0.0001);
    assert.ok(Math.abs(cwt.y - 10) < 0.0001);
    assert.ok(Math.abs(cwt.rotation - Math.PI / 2) < 0.0001);
  });

  it("chain propagation: grandparent → parent → child", () => {
    const w = createWorld();
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const g = w.createEntity();
    w.addComponent(g, Transform);
    w.addComponent(g, WorldTransform);
    w.set(g, Transform, { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    const p = w.createEntity();
    w.addComponent(p, Transform);
    w.addComponent(p, WorldTransform);
    w.set(p, Transform, { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    const c = w.createEntity();
    w.addComponent(c, Transform);
    w.addComponent(c, WorldTransform);
    w.set(c, Transform, { x: 5, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    w.attach(p, g);
    w.attach(c, p);
    w.update(0);

    const cwt = w.get(c, WorldTransform);
    assert.strictEqual(cwt.x, 115);
    assert.strictEqual(cwt.y, 0);
  });

  it("scale propagation", () => {
    const w = createWorld();
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    w.addComponent(parent, WorldTransform);
    w.set(parent, Transform, { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 3 });

    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.addComponent(child, WorldTransform);
    w.set(child, Transform, { x: 10, y: 5, rotation: 0, scaleX: 1, scaleY: 1 });

    w.attach(child, parent);
    w.update(0);

    const cwt = w.get(child, WorldTransform);
    assert.strictEqual(cwt.x, 20);
    assert.strictEqual(cwt.y, 15);
    assert.strictEqual(cwt.scaleX, 2);
    assert.strictEqual(cwt.scaleY, 3);
  });

  it("moving parent moves child on next update", () => {
    const w = createWorld();
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    w.addComponent(parent, WorldTransform);
    w.set(parent, Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.addComponent(child, WorldTransform);
    w.set(child, Transform, { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    w.attach(child, parent);
    w.update(0);

    w.set(parent, Transform, { x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1 });
    w.update(0);

    const cwt = w.get(child, WorldTransform);
    assert.strictEqual(cwt.x, 60);
    assert.strictEqual(cwt.y, 50);
  });
});

describe("HierarchySystem — dirty propagation", () => {
  it("only dirty entities are updated", () => {
    const w = createWorld();
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const root = w.createEntity();
    w.addComponent(root, Transform);
    w.addComponent(root, WorldTransform);
    w.set(root, Transform, { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 });

    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.addComponent(child, WorldTransform);
    w.set(child, Transform, { x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1 });

    w.attach(child, root);
    w.update(0);

    assert.strictEqual(w.get(child, WorldTransform).x, 15);

    w.set(root, Transform, { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });
    w.update(0);

    assert.strictEqual(w.get(child, WorldTransform).x, 105);
  });

  it("non-dirty entities are not recomputed", () => {
    const w = createWorld();
    w.initHierarchy();
    w.addSystem(new HierarchySystem());

    const root = w.createEntity();
    w.addComponent(root, Transform);
    w.addComponent(root, WorldTransform);
    w.set(root, Transform, { x: 10, y: 10 });

    w.update(0);
    const before = w.get(root, WorldTransform).x;
    w.update(1);
    const after = w.get(root, WorldTransform).x;
    assert.strictEqual(after, before);
  });
});

describe("HierarchySystem — edge cases", () => {
  it("no HierarchySystem added is safe", () => {
    const w = createWorld();
    w.initHierarchy();
    const p = w.createEntity();
    w.addComponent(p, Transform);
    w.addComponent(p, WorldTransform);
    const c = w.createEntity();
    w.addComponent(c, Transform);
    w.addComponent(c, WorldTransform);
    w.attach(c, p);
    assert.doesNotThrow(() => w.update(0));
  });

  it("destroying child does not affect parent children list", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    const c1 = w.createEntity();
    const c2 = w.createEntity();
    w.attach(c1, parent);
    w.attach(c2, parent);
    w.destroyEntity(c1);
    const children = w.childrenOf(parent);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0], c2);
  });
});

describe("HierarchyGraph — serialization integration", () => {
  it("serialize includes Parent component", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    w.addComponent(parent, WorldTransform);
    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.addComponent(child, WorldTransform);
    w.attach(child, parent);

    const json = JSON.parse(w.serialize());
    const entriesWithParent = json.entities.filter(e =>
      e.components && e.components.some(c => c.name === "Parent")
    );
    assert.strictEqual(entriesWithParent.length, 1);
    const childEntry = entriesWithParent[0];
    const parentComp = childEntry.components.find(c => c.name === "Parent");
    assert.ok(parentComp);
  });

  it("deserialize preserves parent-child relationship", () => {
    const w = createWorld();
    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    w.addComponent(parent, WorldTransform);
    const child = w.createEntity();
    w.addComponent(child, Transform);
    w.addComponent(child, WorldTransform);
    w.initHierarchy();
    w.attach(child, parent);

    const json = w.serialize();

    const w2 = createWorld();
    w2.initHierarchy();
    const idMap = w2.deserialize(json);

    const newChild = idMap.get(child);
    const newParent = idMap.get(parent);
    assert.strictEqual(w2.parentOf(newChild), newParent);
  });
});

describe("HierarchyGraph — prefab integration", () => {
  it("prefab can include WorldTransform and Parent", () => {
    const w = createWorld();
    w.initHierarchy();
    const parent = w.createEntity();
    w.addComponent(parent, Transform);
    w.addComponent(parent, WorldTransform);
    w.createPrefab("Child")
      .add(Transform, { x: 10, y: 20 })
      .add(WorldTransform);
    const child = w.instantiate("Child");
    w.attach(child, parent);
    assert.ok(w.has(child, WorldTransform));
    assert.strictEqual(w.parentOf(child), parent);
  });
});

describe("World.initHierarchy", () => {
  it("returns the same graph on repeated calls", () => {
    const w = createWorld();
    const g1 = w.initHierarchy();
    const g2 = w.initHierarchy();
    assert.strictEqual(g1, g2);
  });

  it("registers HierarchyGraph as a resource", () => {
    const w = createWorld();
    w.initHierarchy();
    const graph = w.getResource(HierarchyGraph);
    assert.ok(graph instanceof HierarchyGraph);
  });
});
