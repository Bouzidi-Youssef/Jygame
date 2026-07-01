import { benchmark, printResult, divider, setBenchmarkSource } from "./runner.js";
import { createWorld } from "./helpers.js";
import { Transform, Velocity, Collider, Visible, EnemyTag } from "../../ecs/index.js";

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) {
    iterations = Math.min(config.iterations, 200);
    warmup = Math.min(config.warmup, 20);
  } else if (count <= 1000) {
    iterations = Math.min(config.iterations, 50);
    warmup = Math.min(config.warmup, 10);
  } else {
    iterations = Math.min(config.iterations, 5);
    warmup = Math.min(config.warmup, 3);
  }
  return { iterations, warmup, entityCount: count };
}

export function run(config) {
  divider("Serialization Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const opts = benchOpts(config, count);

    // Build world with entities
    const world = createWorld();
    for (let i = 0; i < count; i++) {
      world.entity()
        .with(Transform, { x: i, y: i * 2, rotation: 0, scaleX: 1, scaleY: 1 })
        .with(Velocity, { x: 1, y: -1 })
        .with(Collider, { width: 32, height: 32 })
        .with(Visible, { value: 1 })
        .with(EnemyTag)
        .create();
    }

    // ── serialize ──
    const rSer = benchmark(`    serialize (n=${count})`, () => {
      world.serialize();
    }, opts);
    printResult(rSer, { entityCount: count });

    // show JSON size
    const jsonSample = world.serialize();
    const sizeKB = (new TextEncoder().encode(jsonSample).length / 1024).toFixed(1);
    console.log(`    JSON size: ${sizeKB} KB`);

    // ── deserialize ──
    const target = createWorld();
    const rDes = benchmark(`    deserialize (n=${count})`, () => {
      target.deserialize(jsonSample);
    }, opts);
    printResult(rDes, { entityCount: count });

    // ── serialize + deserialize (round-trip) ──
    const rRound = benchmark(`    round-trip (n=${count})`, () => {
      const json = world.serialize();
      const w = createWorld();
      w.deserialize(json);
    }, opts);
    printResult(rRound, { entityCount: count });
  }

  // ── throughput: large scale ──
  divider("  Throughput (10,000 entities)");
  {
    const count = 10000;
    const world = createWorld();
    for (let i = 0; i < count; i++) {
      world.entity()
        .with(Transform, { x: i, y: i * 2 })
        .with(Velocity, { x: 1, y: -1 })
        .with(EnemyTag)
        .create();
    }

    const json = world.serialize();
    const sizeKB = (new TextEncoder().encode(json).length / 1024).toFixed(1);
    console.log(`    JSON size: ${sizeKB} KB for ${count} entities`);

    const rSer = benchmark(`    serialize throughput`, () => {
      world.serialize();
    }, { iterations: 10, warmup: 5 });
    printResult(rSer, { entityCount: count });

    const target = createWorld();
    const rDes = benchmark(`    deserialize throughput`, () => {
      target.deserialize(json);
    }, { iterations: 10, warmup: 5 });
    printResult(rDes, { entityCount: count });
  }
}
