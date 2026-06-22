// Phase 17B — State Residency Benchmark
//
// Measures the cost of CPU-side state maps (GpuPassExecutor) vs
// GPU buffer state fields (seed, segment) for modifiers that
// require per-particle state.
//
// State-requiring modifiers:
//   Turbulence  → seed (f32)
//   Color       → segment (u32)
//   Animation   → segment (u32)
//
// Metrics per mode:
//   emit time   — time to initialize per-particle state
//   update time — time to read/update state each frame
//   memory      — bytes allocated for state storage
//
// Browser required for compute modes (WebGPU).

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { CpuParticleBackend } from "../../backends/CpuParticleBackend.js";
import { GpuParticleBackend } from "../../backends/GpuParticleBackend.js";
import { ModifierCompiler } from "../../gpu/ModifierCompiler.js";
import { TurbulenceModifier } from "../../../modifiers/TurbulenceModifier.js";
import { ColorModifier } from "../../../modifiers/ColorModifier.js";
import { AnimationModifier } from "../../../modifiers/AnimationModifier.js";

const DT = 1 / 60;
const MEASURE_FRAMES = 60;
const WARMUP_FRAMES = 10;
const EMPTY_RENDERER = { render() {}, destroy() {} };

function makeStorage(capacity) {
  return new SoAParticleStorage({ maxSize: capacity, initialSize: capacity });
}

function emitAll(backend, count) {
  backend.emit(count, (p) => {
    p.x = Math.random() * 400;
    p.y = Math.random() * 300;
    p.vx = (Math.random() - 0.5) * 100;
    p.vy = (Math.random() - 0.5) * 100;
    p.life = 5 + Math.random() * 5;
    p.maxLife = p.life;
    p.size = 16;
    p.alpha = 1;
  });
}

function getStateMemoryUsage(backend) {
  if (!backend._executor) return 0;
  let bytes = 0;
  for (const [, byParticle] of backend._executor._stateByDesc) {
    bytes += byParticle.size * 64;
  }
  return bytes;
}

async function measureMode(label, count, modifiers, createBackendFn) {
  console.log(`\n  ${label}:`);

  const { backend } = createBackendFn(count);
  for (const m of modifiers) backend.addModifier(m);

  // Measure emit time
  const t0 = performance.now();
  emitAll(backend, count);
  const t1 = performance.now();
  const emitTime = t1 - t0;

  await backend._ensureWebGpu?.();

  // Warmup
  for (let i = 0; i < WARMUP_FRAMES; i++) {
    backend.update(DT);
  }

  // Measure update time
  let totalUpdate = 0;
  for (let i = 0; i < MEASURE_FRAMES; i++) {
    const t2 = performance.now();
    backend.update(DT);
    const t3 = performance.now();
    totalUpdate += t3 - t2;
  }

  const avgUpdate = totalUpdate / MEASURE_FRAMES;
  const stateMemory = getStateMemoryUsage(backend);

  backend.destroy();

  return {
    emitTime,
    avgUpdate,
    stateMemory,
    label,
  };
}

export async function runBenchmark({ counts = null, renderer } = {}) {
  const testCounts = counts || [1000, 10000, 50000];
  const hasWebGpu = typeof navigator !== "undefined" && navigator.gpu != null;
  const opts = { renderer };

  const stateModifiers = [
    new TurbulenceModifier({ strength: 50 }),
    new ColorModifier({
      stops: [[0, "#ff0000"], [0.5, "#00ff00"], [1, "#0000ff"]],
    }),
  ];

  const results = {};

  for (const count of testCounts) {
    console.log(`\n--- State Residency: ${count} particles ---`);
    results[count] = {};

    // Operator mode — CPU state maps (GpuPassExecutor)
    {
      const r = await measureMode("Operator (CPU maps)", count, stateModifiers, (cnt) => {
        const storage = makeStorage(cnt + 100);
        const backend = new CpuParticleBackend({
          storage,
          renderer: opts.renderer || EMPTY_RENDERER,
        });
        return { backend };
      });
      results[count].operator = r;
      console.log(`    emit=${r.emitTime.toFixed(2)}ms update=${r.avgUpdate.toFixed(3)}ms stateMem=${(r.stateMemory / 1024).toFixed(1)}KB`);
    }

    // Compute readback mode — GPU buffer fields (seed, segment)
    if (hasWebGpu) {
      try {
        const r = await measureMode("Compute+Readback (GPU fields)", count, stateModifiers, (cnt) => {
          const storage = makeStorage(cnt + 100);
          const backend = new GpuParticleBackend({
            storage,
            mode: "compute",
            renderer: opts.renderer || EMPTY_RENDERER,
            canvas: null,
            renderValidationMode: true,
          });
          return { backend };
        });
        results[count].computeReadback = r;
        console.log(`    emit=${r.emitTime.toFixed(2)}ms update=${r.avgUpdate.toFixed(3)}ms stateMem=${(r.stateMemory / 1024).toFixed(1)}KB`);
      } catch (e) {
        console.log(`  Compute+Readback: SKIPPED (${e.message})`);
      }
    } else {
      console.log(`  Compute+Readback: SKIPPED (WebGPU unavailable)`);
    }
  }

  // Examine state layout
  {
    const compiler = new ModifierCompiler();
    const descriptors = stateModifiers.map(m => m.toDescriptor());
    const stateLayout = compiler._generateStateLayout(descriptors);
    console.log(`\nState layout: ${JSON.stringify(stateLayout)}`);

    if (stateLayout) {
      console.log(`  stride=${stateLayout.stride} bytes, fields: ${stateLayout.fields.map(f => f.name).join(", ")}`);
    }
  }

  return results;
}

function formatTable(results) {
  const counts = Object.keys(results).map(Number).sort((a, b) => a - b);
  const rows = [["Count", "Mode", "Emit(ms)", "Update(ms)", "StateMem(KB)"]];
  for (const c of counts) {
    for (const [mode, data] of Object.entries(results[c])) {
      if (data) {
        rows.push([String(c), data.label, data.emitTime.toFixed(2), data.avgUpdate.toFixed(3), (data.stateMemory / 1024).toFixed(1)]);
      }
    }
  }
  return rows.map(r => r.join("\t")).join("\n");
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Phase 17B — State Residency Benchmark");
  console.log("Run in a browser with WebGPU support for compute mode measurements.\n");

  runBenchmark().then((results) => {
    console.log("\n=== Results ===");
    console.log(formatTable(results));
  }).catch(console.error);
}
