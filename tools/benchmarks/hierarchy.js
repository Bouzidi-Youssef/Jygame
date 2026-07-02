import { benchmark, printResult, divider } from "./runner.js";
import { World, Transform, WorldTransform, Parent, Children, HierarchyGraph, HierarchySystem } from "../../ecs/index.js";

function createHierarchyWorld() {
  const w = new World();
  w.register(Transform);
  w.register(WorldTransform);
  w.register(Parent);
  w.register(Children);
  w.initHierarchy();
  w.addSystem(new HierarchySystem());
  return w;
}

function setupEntity(w) {
  const e = w.createEntity();
  w.addComponent(e, Transform);
  w.addComponent(e, WorldTransform);
  w.set(e, Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  return e;
}

function buildChain(w, n) {
  const root = setupEntity(w);
  let prev = root;
  for (let i = 1; i < n; i++) {
    const e = setupEntity(w);
    w.attach(e, prev);
    prev = e;
  }
  return root;
}

function buildWideTree(w, depth, branch) {
  const roots = [];
  for (let i = 0; i < branch; i++) {
    const root = setupEntity(w);
    roots.push(root);
    let prev = root;
    for (let d = 1; d < depth; d++) {
      const e = setupEntity(w);
      w.attach(e, prev);
      prev = e;
    }
  }
  return roots;
}

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) {
    iterations = Math.min(config.iterations, 200);
    warmup = Math.min(config.warmup, 20);
  } else if (count <= 1000) {
    iterations = Math.min(config.iterations, 50);
    warmup = Math.min(config.warmup, 10);
  } else {
    iterations = Math.min(config.iterations, 10);
    warmup = Math.min(config.warmup, 3);
  }
  return { iterations, warmup, entityCount: count };
}

export function run(config) {
  divider("Hierarchy Benchmark (Phase 33)");

  divider("  Transform propagation");
  for (const count of [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    propagate + dirty (${count} wide)`, () => {
      const w = createHierarchyWorld();
      const root = setupEntity(w);
      for (let i = 1; i < count; i++) {
        const c = setupEntity(w);
        w.attach(c, root);
      }
      w.set(root, Transform, { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });
      w.update(0);
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Deep chain propagation");
  for (const depth of [10, 50, 200].filter(d => d <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, depth);
    const r = benchmark(`    deep chain (depth=${depth})`, () => {
      const w = createHierarchyWorld();
      const root = buildChain(w, depth);
      w.set(root, Transform, { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });
      w.update(0);
    }, opts);
    printResult(r, { depth });
  }

  divider("  Mixed hierarchy (deep + wide)");
  {
    const depth = 25;
    const branch = 4;
    const total = depth * branch;
    const opts = benchOpts(config, total);
    const r = benchmark(`    propagate mixed (${total} entities, depth=${depth}, branch=${branch})`, () => {
      const w = createHierarchyWorld();
      buildWideTree(w, depth, branch);
      w.update(0);
    }, opts);
    printResult(r, { entityCount: total, depth, branch });
  }

  divider("  Attach (small chain)");
  for (const count of [10, 100].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const measured = count;
    const r = benchmark(`    attach chain (${count})`, () => {
      const w = createHierarchyWorld();
      const root = setupEntity(w);
      let prev = root;
      for (let i = 1; i < count; i++) {
        const e = setupEntity(w);
        w.attach(e, prev);
        prev = e;
      }
    }, opts);
    printResult(r, { entityCount: measured });
  }

  divider("  Dirty propagation (no-op update)");
  for (const count of [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    update with no dirty entities (${count})`, () => {
      const w = createHierarchyWorld();
      const root = setupEntity(w);
      for (let i = 1; i < count; i++) {
        const c = setupEntity(w);
        w.attach(c, root);
      }
      w.update(0);
      w.update(0);
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Detach (small chain)");
  for (const count of [10, 100].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    detach chain (${count})`, () => {
      const w = createHierarchyWorld();
      const eids = [];
      const root = setupEntity(w);
      eids.push(root);
      let prev = root;
      for (let i = 1; i < count; i++) {
        const e = setupEntity(w);
        w.attach(e, prev);
        eids.push(e);
        prev = e;
      }
      for (let i = count - 1; i >= 0; i--) {
        w.detach(eids[i]);
      }
    }, opts);
    printResult(r, { entityCount: count });
  }
}
