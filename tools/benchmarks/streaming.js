import { benchmark, printResult, divider } from "./runner.js";
import { World, StreamingManager } from "../../ecs/index.js";

function createStreamingWorld() {
  const w = new World();
  w.setResource(StreamingManager, new StreamingManager(w));
  return w;
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
  divider("Streaming Benchmark (Phase 33)");

  divider("  Create cells");
  for (const count of [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    create ${count} cells`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      for (let i = 0; i < count; i++) {
        sm.createCell(`cell_${i}`);
      }
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Destroy cells");
  for (const count of [100, 1000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    destroy ${count} cells`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      for (let i = 0; i < count; i++) {
        sm.createCell(`cell_${i}`);
      }
      for (let i = 0; i < count; i++) {
        sm.destroyCell(`cell_${i}`);
      }
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Add entities");
  for (const count of [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    add ${count} entities to a cell`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      const cell = sm.createCell("test");
      const entities = new Array(count);
      for (let i = 0; i < count; i++) {
        entities[i] = w.createEntity();
      }
      for (let i = 0; i < count; i++) {
        cell.addEntity(entities[i]);
      }
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Remove entities");
  for (const count of [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    remove ${count} entities from a cell`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      const cell = sm.createCell("test");
      const entities = new Array(count);
      for (let i = 0; i < count; i++) {
        entities[i] = w.createEntity();
        cell.addEntity(entities[i]);
      }
      for (let i = 0; i < count; i++) {
        cell.removeEntity(entities[i]);
      }
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Load empty cell");
  for (const count of [100, 1000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    load ${count} empty cells`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      for (let i = 0; i < count; i++) {
        sm.createCell(`cell_${i}`);
      }
      for (let i = 0; i < count; i++) {
        sm.load(`cell_${i}`);
      }
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Unload empty cell");
  for (const count of [100, 1000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    unload ${count} empty cells`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      for (let i = 0; i < count; i++) {
        sm.createCell(`cell_${i}`);
        sm.load(`cell_${i}`);
      }
      for (let i = 0; i < count; i++) {
        sm.unload(`cell_${i}`);
      }
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Unload entities");
  for (const count of [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    unload cell with ${count} entities`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      const cell = sm.createCell("test");
      for (let i = 0; i < count; i++) {
        cell.addEntity(w.createEntity());
      }
      sm.load("test");
      sm.unload("test");
    }, opts);
    printResult(r, { entityCount: count });
  }

  divider("  Many small cells");
  for (const count of [100, 1000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    ${count} small cells, 10 entities each`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      for (let i = 0; i < count; i++) {
        const cell = sm.createCell(`cell_${i}`);
        for (let j = 0; j < 10; j++) {
          cell.addEntity(w.createEntity());
        }
      }
    }, opts);
    printResult(r, { entityCount: count * 10 });
  }

  divider("  Few large cells");
  for (const count of [1000, 10000].filter(c => c <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, count);
    const r = benchmark(`    cell with ${count} entities`, () => {
      const w = createStreamingWorld();
      const sm = w.streaming;
      const cell = sm.createCell("large");
      for (let i = 0; i < count; i++) {
        cell.addEntity(w.createEntity());
      }
    }, opts);
    printResult(r, { entityCount: count });
  }
}