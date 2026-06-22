// Phase 17C — Death Queue Benchmark
//
// Measures current CPU death sweep cost vs proposed GPU death queue model.
//
// CPU death sweep:
//   For each particle: read life → if <=0: storage.release (swap-remove + _resetSlot)
//
// GPU death queue (simulated):
//   For each particle: read life → if <=0: record index (simulates queue push)
//   Then process queue entries in batch (simulates CPU sweep from queue)
//
// Metrics:
//   Sweep time         — time to iterate active particles and release dead ones
//   Queue gen time     — time to identify and record dead particle indices
//   Queue consume time — time to release particles listed in queue
//   Full frame cost    — total overhead of each approach

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";
import { FadeModifier } from "../../../modifiers/FadeModifier.js";
import { CpuParticleBackend } from "../../backends/CpuParticleBackend.js";

const DT = 1 / 60;
const WARMUP_FRAMES = 5;
const MEASURE_FRAMES = 30;
const STRIDE = ParticleBufferLayout.STRIDE;
const EMPTY_RENDERER = { render() {}, destroy() {} };

function makeStorage(capacity) {
  return new SoAParticleStorage({ maxSize: capacity, initialSize: capacity });
}

function emitLifetimes(backend, count, strategy) {
  if (strategy === "short") {
    backend.emit(count, (p) => {
      p.x = Math.random() * 500;
      p.y = Math.random() * 500;
      p.vx = 0; p.vy = 0;
      p.life = 0.05 + Math.random() * 0.2;
      p.maxLife = p.life;
      p.size = 16; p.alpha = 1;
    });
  } else if (strategy === "mixed") {
    backend.emit(count, (p) => {
      p.x = Math.random() * 500;
      p.y = Math.random() * 500;
      p.vx = 0; p.vy = 0;
      p.life = 0.1 + Math.random() * 5;
      p.maxLife = p.life;
      p.size = 16; p.alpha = 1;
    });
  } else {
    backend.emit(count, (p) => {
      p.x = Math.random() * 500;
      p.y = Math.random() * 500;
      p.vx = 0; p.vy = 0;
      p.life = 3 + Math.random() * 5;
      p.maxLife = p.life;
      p.size = 16; p.alpha = 1;
    });
  }
}

// CPU death sweep: current implementation pattern (read life → release)
async function measureCpuDeathSweep(count, strategy) {
  const storage = makeStorage(count + 100);
  const backend = new CpuParticleBackend({ storage, renderer: EMPTY_RENDERER });
  backend.addModifier(new FadeModifier({ mode: "out", easing: "linear" }));
  emitLifetimes(backend, count, strategy);

  // Warmup
  for (let i = 0; i < WARMUP_FRAMES; i++) {
    backend.update(DT);
  }

  let totalSweep = 0;
  let totalUpdate = 0;

  for (let f = 0; f < MEASURE_FRAMES; f++) {
    // Measure: physics + modifier update + modifiers
    const t0 = performance.now();

    // Re-emit particles that died (keep count constant)
    const before = storage.activeCount;
    backend.update(DT);
    const died = storage.activeCount;

    const t1 = performance.now();
    totalUpdate += t1 - t0;
  }

  backend.destroy();

  // Average per-frame cost
  const avgUpdate = totalUpdate / MEASURE_FRAMES;

  return { avgUpdate, label: `CPU Sweep ${strategy}` };
}

// GPU death queue model (simulated on CPU):
// Phase 1: scan particles → collect dead indices (queue gen)
// Phase 2: process queue → release each listed particle (queue consume)
async function measureGpuDeathQueue(count, strategy) {
  const storage = makeStorage(count + 100);
  const backend = new CpuParticleBackend({ storage, renderer: EMPTY_RENDERER });
  backend.addModifier(new FadeModifier({ mode: "out", easing: "linear" }));
  emitLifetimes(backend, count, strategy);

  // Warmup
  for (let i = 0; i < WARMUP_FRAMES; i++) {
    backend.update(DT);
  }

  let totalQueueGen = 0;
  let totalQueueConsume = 0;
  let totalQueue = 0;

  for (let f = 0; f < MEASURE_FRAMES; f++) {
    // Re-emit to keep count stable
    const died = storage.activeCount;
    const accessors = storage.activeParticles;
    const queue = [];

    // Phase 1: queue generation (scan + record)
    const t0 = performance.now();
    for (let i = 0; i < accessors.length; i++) {
      const life = storage.getFieldValue(i, "life");
      if (life <= 0) {
        queue.push(i);
      }
    }
    const t1 = performance.now();
    totalQueueGen += t1 - t0;

    // Phase 2: queue consumption (release each)
    const t2 = performance.now();
    for (let q = queue.length - 1; q >= 0; q--) {
      const idx = queue[q];
      const p = accessors[idx];
      storage.release(p);
    }
    const t3 = performance.now();
    totalQueueConsume += t3 - t2;
    totalQueue += t3 - t0;

    // Emit replacements to maintain population
    const toReplace = queue.length;
    if (toReplace > 0) {
      emitLifetimes(backend, toReplace, strategy);
    }
  }

  backend.destroy();

  const avgGen = totalQueueGen / MEASURE_FRAMES;
  const avgConsume = totalQueueConsume / MEASURE_FRAMES;
  const avgTotal = totalQueue / MEASURE_FRAMES;

  return { avgGen, avgConsume, avgTotal, label: `GPU Queue ${strategy}` };
}

export async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [1000, 10000, 50000, 100000, 250000];

  console.log("Phase 17C — Death Queue Benchmark");
  console.log("Comparing CPU death sweep vs simulated GPU death queue\n");

  for (const count of testCounts) {
    console.log(`\n=== ${count} particles ===`);

    // Short lifetimes — high death rate
    {
      const cpu = await measureCpuDeathSweep(count, "short");
      const gpu = await measureGpuDeathQueue(count, "short");
      console.log(`  Short lives (high churn):`);
      console.log(`    CPU sweep:  ${cpu.avgUpdate.toFixed(3)}ms/frame`);
      console.log(`    GPU queue:  gen=${gpu.avgGen.toFixed(3)}ms consume=${gpu.avgConsume.toFixed(3)}ms total=${gpu.avgTotal.toFixed(3)}ms`);
      console.log(`    Ratio:      ${(gpu.avgTotal / cpu.avgUpdate * 100).toFixed(1)}%`);
    }

    // Mixed lifetimes — moderate death rate
    {
      const cpu = await measureCpuDeathSweep(count, "mixed");
      const gpu = await measureGpuDeathQueue(count, "mixed");
      console.log(`  Mixed lives (moderate churn):`);
      console.log(`    CPU sweep:  ${cpu.avgUpdate.toFixed(3)}ms/frame`);
      console.log(`    GPU queue:  gen=${gpu.avgGen.toFixed(3)}ms consume=${gpu.avgConsume.toFixed(3)}ms total=${gpu.avgTotal.toFixed(3)}ms`);
      console.log(`    Ratio:      ${(gpu.avgTotal / cpu.avgUpdate * 100).toFixed(1)}%`);
    }

    // Long lifetimes — low death rate
    {
      const cpu = await measureCpuDeathSweep(count, "long");
      const gpu = await measureGpuDeathQueue(count, "long");
      console.log(`  Long lives (low churn):`);
      console.log(`    CPU sweep:  ${cpu.avgUpdate.toFixed(3)}ms/frame`);
      console.log(`    GPU queue:  gen=${gpu.avgGen.toFixed(3)}ms consume=${gpu.avgConsume.toFixed(3)}ms total=${gpu.avgTotal.toFixed(3)}ms`);
      console.log(`    Ratio:      ${(gpu.avgTotal / cpu.avgUpdate * 100).toFixed(1)}%`);
    }
  }
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  runBenchmark().catch(console.error);
}
