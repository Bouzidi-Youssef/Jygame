// Phase 16Z Benchmark Suite — Operator vs Compute+Readback vs Compute+GPU
// Requires browser with WebGPU support for compute modes.
// Operator mode benchmark runs in Node.js.
//
// Usage (browser):
//   import { runBenchmark } from './phase16z_benchmark.js';
//   const results = await runBenchmark({ counts: [1000, 10000] });
//
//   Pass a WebGL2 renderer for compute+readback mode:
//   import { GpuParticleRenderer } from '../../renderers/GpuParticleRenderer.js';
//   const gl = document.createElement('canvas').getContext('webgl2');
//   const renderer = new GpuParticleRenderer({ gl });
//   const results = await runBenchmark({ renderer });
//
// Usage (Node.js, operator only):
//   import { runBenchmark } from './phase16z_benchmark.js';
//   const results = await runBenchmark();

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { CpuParticleBackend } from "../../backends/CpuParticleBackend.js";
import { GpuParticleBackend } from "../../backends/GpuParticleBackend.js";
import { FadeModifier } from "../../../modifiers/FadeModifier.js";
import { ScaleModifier } from "../../../modifiers/ScaleModifier.js";
import { VelocityModifier } from "../../../modifiers/VelocityModifier.js";
import { AttractionModifier } from "../../../modifiers/AttractionModifier.js";
import { TurbulenceModifier } from "../../../modifiers/TurbulenceModifier.js";

const DT = 1 / 60;
const MEASURE_FRAMES = 60;
const WARMUP_FRAMES = 10;

function makeStorage(capacity) {
  return new SoAParticleStorage({ maxSize: capacity, initialSize: capacity });
}

const EMPTY_RENDERER = { render() {}, destroy() {} };

function makeModifiers() {
  return [
    new FadeModifier({ mode: "out", easing: "quadOut" }),
    new ScaleModifier({ from: 1, to: 0.5, easing: "linear" }),
    new VelocityModifier({ drag: 0.3 }),
    new AttractionModifier({ x: 160, y: 120, strength: 20 }),
  ];
}

function emitParticles(backend, count) {
  backend.emit(count, (p) => {
    p.x = Math.random() * 400;
    p.y = Math.random() * 300;
    p.vx = (Math.random() - 0.5) * 100;
    p.vy = (Math.random() - 0.5) * 100;
    p.life = 2 + Math.random() * 3;
    p.maxLife = p.life;
    p.size = 16 + Math.random() * 16;
    p.alpha = 1;
    p.r = 128 + Math.floor(Math.random() * 128);
    p.g = 128 + Math.floor(Math.random() * 128);
    p.b = 128 + Math.floor(Math.random() * 128);
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

function operatorBenchmark(count, opts) {
  const storage = makeStorage(count + 100);
  const backend = new CpuParticleBackend({
    storage,
    renderer: opts.renderer || EMPTY_RENDERER,
  });
  const mods = makeModifiers();
  for (const m of mods) backend.addModifier(m);
  emitParticles(backend, count);
  return { backend, mods };
}

function computeReadbackBenchmark(count, opts) {
  const storage = makeStorage(count + 100);
  const backend = new GpuParticleBackend({
    storage,
    mode: "compute",
    renderer: opts.renderer || EMPTY_RENDERER,
    canvas: opts.canvas || null,
    renderValidationMode: true,
  });
  const mods = makeModifiers();
  for (const m of mods) backend.addModifier(m);
  emitParticles(backend, count);
  return { backend, mods };
}

function computeGpuRenderBenchmark(count, opts) {
  const storage = makeStorage(count + 100);
  const backend = new GpuParticleBackend({
    storage,
    mode: "compute",
    renderer: opts.renderer || EMPTY_RENDERER,
    canvas: opts.canvas || null,
    renderValidationMode: false,
  });
  const mods = makeModifiers();
  for (const m of mods) backend.addModifier(m);
  emitParticles(backend, count);
  return { backend, mods };
}

export async function runBenchmark({ counts = null, renderer, canvas } = {}) {
  const testCounts = counts || [1000, 10000, 50000, 100000, 250000];
  const hasWebGpu = typeof navigator !== "undefined" && navigator.gpu != null;
  const opts = { renderer, canvas };

  const results = {
    operator: {},
    computeReadback: {},
    computeGpuRender: {},
  };

  for (const count of testCounts) {
    console.log(`\n--- Benchmark: ${count} particles ---`);

    // Operator (always available)
    {
      const { backend, mods } = operatorBenchmark(count, opts);
      const metrics = await measureBackend(backend, MEASURE_FRAMES);
      results.operator[count] = metrics;
      console.log(`  Operator: update=${metrics.update.avg.toFixed(2)}ms render=${metrics.render.avg.toFixed(2)}ms total=${metrics.total.avg.toFixed(2)}ms`);
      for (const m of mods) backend.removeModifier(m);
      backend._renderer = EMPTY_RENDERER; // prevent shared renderer destroy
      backend.destroy();
    }

    // Compute + Readback (WebGPU required)
    if (hasWebGpu && renderer) {
      try {
        const { backend, mods } = computeReadbackBenchmark(count, opts);
        await backend._ensureWebGpu();
        const metrics = await measureBackend(backend, MEASURE_FRAMES);
        results.computeReadback[count] = metrics;
        console.log(`  Compute+Readback: update=${metrics.update.avg.toFixed(2)}ms render=${metrics.render.avg.toFixed(2)}ms total=${metrics.total.avg.toFixed(2)}ms`);
        for (const m of mods) backend.removeModifier(m);
        backend._renderer = EMPTY_RENDERER;
        backend.destroy();
      } catch (e) {
        console.log(`  Compute+Readback: SKIPPED (${e.message})`);
      }
    } else if (hasWebGpu && !renderer) {
      console.log(`  Compute+Readback: SKIPPED (no WebGL renderer provided)`);
    }

    // Compute + GPU Render (WebGPU + canvas required)
    if (hasWebGpu && renderer) {
      try {
        const { backend, mods } = computeGpuRenderBenchmark(count, opts);
        await backend._ensureWebGpu();
        const metrics = await measureBackend(backend, MEASURE_FRAMES);
        results.computeGpuRender[count] = metrics;
        console.log(`  Compute+GPU: update=${metrics.update.avg.toFixed(2)}ms render=${metrics.render.avg.toFixed(2)}ms total=${metrics.total.avg.toFixed(2)}ms`);
        for (const m of mods) backend.removeModifier(m);
        backend._renderer = EMPTY_RENDERER;
        backend.destroy();
      } catch (e) {
        console.log(`  Compute+GPU: SKIPPED (${e.message})`);
      }
    } else if (hasWebGpu && !renderer) {
      console.log(`  Compute+GPU: SKIPPED (no WebGL renderer provided)`);
    }
  }

  return results;
}

function formatTable(results) {
  const counts = Object.keys(results.operator).map(Number).sort((a, b) => a - b);
  const rows = [["Count", "Mode", "Update(ms)", "Render(ms)", "Total(ms)"]];
  for (const c of counts) {
    for (const [mode, data] of Object.entries(results)) {
      if (data[c]) {
        rows.push([String(c), mode, data[c].update.avg.toFixed(2), data[c].render.avg.toFixed(2), data[c].total.avg.toFixed(2)]);
      }
    }
  }
  return rows.map(r => r.join("\t")).join("\n");
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Phase 16Z Benchmark Suite");
  console.log("Run in a browser with WebGPU support for full results.");
  console.log("Node.js: operator-only benchmark.\n");

  runBenchmark().then((results) => {
    console.log("\n=== Results ===");
    console.log(formatTable(results));
  }).catch(console.error);
}
