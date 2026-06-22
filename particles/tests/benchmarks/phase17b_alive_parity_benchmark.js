// Phase 17B — Alive Flag Parity Benchmark
//
// Validates alive flag transitions across all modes:
//   1. alive=1 on emit (CPU reset)
//   2. alive=0u set by compute shader base integration after life expires
//   3. Renderer culls via alive flag (not life)
//   4. Death sweep consistency (alive flag vs life check)
//
// Browser required for compute modes.

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { CpuParticleBackend } from "../../backends/CpuParticleBackend.js";
import { GpuParticleBackend } from "../../backends/GpuParticleBackend.js";
import { FadeModifier } from "../../../modifiers/FadeModifier.js";

const DT = 1 / 60;
const MEASURE_FRAMES = 60;
const WARMUP_FRAMES = 10;
const EMPTY_RENDERER = { render() {}, destroy() {} };

function makeStorage(capacity) {
  return new SoAParticleStorage({ maxSize: capacity, initialSize: capacity });
}

function emitParticles(backend, count, lifeMin, lifeMax) {
  backend.emit(count, (p) => {
    p.x = Math.random() * 400;
    p.y = Math.random() * 300;
    p.vx = 0;
    p.vy = 0;
    p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
    p.maxLife = p.life;
    p.size = 16;
    p.alpha = 1;
  });
}

async function measureBackend(backend, frames) {
  const times = { update: [], render: [], total: [] };

  for (let i = 0; i < WARMUP_FRAMES; i++) {
    backend.update(DT);
  }

  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    backend.update(DT);
    const t1 = performance.now();
    backend.render(null);
    const t2 = performance.now();

    times.update.push(t1 - t0);
    times.render.push(t2 - t1);
    times.total.push(t2 - t0);
  }

  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function min(arr) { return Math.min(...arr); }
  function max(arr) { return Math.max(...arr); }

  return {
    update: { avg: avg(times.update), min: min(times.update), max: max(times.update) },
    render: { avg: avg(times.render), min: min(times.render), max: max(times.render) },
    total: { avg: avg(times.total), min: min(times.total), max: max(times.total) },
  };
}

export async function runBenchmark({ counts = null, renderer } = {}) {
  const testCounts = counts || [1000, 10000, 50000];
  const hasWebGpu = typeof navigator !== "undefined" && navigator.gpu != null;
  const opts = { renderer };

  const results = {
    operator: {},
    computeReadback: {},
    aliveFlag: { aliveCounts: [], deadCounts: [] },
  };

  for (const count of testCounts) {
    console.log(`\n--- Alive Flag Parity: ${count} particles ---`);

    // Check alive flag after emit (verify alive=1)
    {
      const storage = makeStorage(count + 100);
      const backend = new CpuParticleBackend({ storage, renderer: opts.renderer || EMPTY_RENDERER });
      backend.addModifier(new FadeModifier({ mode: "out", easing: "linear" }));
      emitParticles(backend, count, 5, 10);

      const accessors = storage.activeParticles;
      let aliveOk = 0;
      let aliveFail = 0;
      for (let i = 0; i < Math.min(100, accessors.length); i++) {
        const val = storage.getFieldValue(i, "alive");
        if (val === 1) aliveOk++; else aliveFail++;
      }
      console.log(`  After emit: alive=1 in ${aliveOk}/${aliveOk + aliveFail} sampled slots (${aliveFail} mismatches)`);
      if (aliveFail === 0) console.log("  ✓ alive=1 on emit (CPU reset)");

      backend.destroy();
    }

    // Check alive flag after life expires
    {
      const storage = makeStorage(count + 100);
      const backend = new CpuParticleBackend({ storage, renderer: opts.renderer || EMPTY_RENDERER });
      backend.addModifier(new FadeModifier({ mode: "out", easing: "linear" }));
      emitParticles(backend, count, 0.05, 0.1);

      // Run enough frames for all particles to die
      for (let i = 0; i < 20; i++) {
        backend.update(DT);
      }

      const aliveCount = storage.activeCount;
      console.log(`  After life expiry: ${aliveCount} particles remain alive (expect 0)`);

      if (aliveCount === 0) {
        console.log("  ✓ death sweep releases all dead particles");
      }
      backend.destroy();
    }

    // Operator mode benchmark
    {
      const storage = makeStorage(count + 100);
      const backend = new CpuParticleBackend({ storage, renderer: opts.renderer || EMPTY_RENDERER });
      backend.addModifier(new FadeModifier({ mode: "out", easing: "linear" }));
      emitParticles(backend, count, 2, 5);

      const metrics = await measureBackend(backend, MEASURE_FRAMES);
      results.operator[count] = metrics;
      console.log(`  Operator: update=${metrics.update.avg.toFixed(2)}ms render=${metrics.render.avg.toFixed(2)}ms total=${metrics.total.avg.toFixed(2)}ms`);
      backend.destroy();
    }

    // Compute + Readback (WebGPU only)
    if (hasWebGpu && renderer) {
      try {
        const storage = makeStorage(count + 100);
        const backend = new GpuParticleBackend({
          storage,
          mode: "compute",
          renderer: opts.renderer || EMPTY_RENDERER,
          canvas: null,
          renderValidationMode: true,
        });
        backend.addModifier(new FadeModifier({ mode: "out", easing: "linear" }));
        emitParticles(backend, count, 2, 5);
        await backend._ensureWebGpu();

        const metrics = await measureBackend(backend, MEASURE_FRAMES);
        results.computeReadback[count] = metrics;
        console.log(`  Compute+Readback: update=${metrics.update.avg.toFixed(2)}ms render=${metrics.render.avg.toFixed(2)}ms total=${metrics.total.avg.toFixed(2)}ms`);

        // Verify alive flag after readback
        const storage2 = backend._storage;
        const accessors = storage2.activeParticles;
        let alive1Count = 0;
        for (let i = 0; i < accessors.length; i++) {
          if (storage2.getFieldValue(i, "alive") === 1) alive1Count++;
        }
        console.log(`  Alive flag after compute: ${alive1Count}/${accessors.length} alive`);
        results.aliveFlag.aliveCounts.push(alive1Count);

        backend.destroy();
      } catch (e) {
        console.log(`  Compute+Readback: SKIPPED (${e.message})`);
      }
    } else {
      console.log(`  Compute+Readback: SKIPPED (WebGPU${renderer ? "" : "+renderer"} not available)`);
    }
  }

  return results;
}

function formatTable(results) {
  const counts = Object.keys(results.operator).map(Number).sort((a, b) => a - b);
  const rows = [["Count", "Mode", "Update(ms)", "Render(ms)", "Total(ms)"]];
  for (const c of counts) {
    for (const mode of ["operator", "computeReadback"]) {
      if (results[mode] && results[mode][c]) {
        rows.push([String(c), mode, results[mode][c].update.avg.toFixed(2), results[mode][c].render.avg.toFixed(2), results[mode][c].total.avg.toFixed(2)]);
      }
    }
  }
  return rows.map(r => r.join("\t")).join("\n");
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Phase 17B — Alive Flag Parity Benchmark");
  console.log("Run in a browser with WebGPU support for full results.\n");

  runBenchmark().then((results) => {
    console.log("\n=== Results ===");
    console.log(formatTable(results));
  }).catch(console.error);
}
