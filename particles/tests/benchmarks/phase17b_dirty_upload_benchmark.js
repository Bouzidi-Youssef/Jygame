// Phase 17B — Dirty-Region Upload Benchmark
//
// Measures bandwidth savings of dirty-region upload vs full upload
// at various churn rates (percentage of particles modified per frame).
//
// Metrics:
//   Full upload bytes per frame (STRIDE * count * 4)
//   Dirty upload bytes per frame (dirtyRange * STRIDE * 4)
//   Savings ratio (1 - dirtyBytes / fullBytes)
//
// Run in browser with WebGPU for complete results.
// Node.js: storage-level benchmarks only.

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { GpuParticleBuffer } from "../../gpu/webgpu/GpuParticleBuffer.js";
import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";

const STRIDE = ParticleBufferLayout.STRIDE;
const FLOAT_BYTES = 4;
const FRAMES = 100;

function makeStorage(capacity) {
  return new SoAParticleStorage({ maxSize: capacity, initialSize: capacity });
}

function fillStorage(storage, count) {
  for (let i = 0; i < count; i++) {
    const p = storage.acquire();
    p.x = Math.random() * 500;
    p.y = Math.random() * 500;
    p.vx = (Math.random() - 0.5) * 100;
    p.vy = (Math.random() - 0.5) * 100;
    p.life = 10;
    p.maxLife = 10;
    p.size = 16;
    p.alpha = 1;
  }
}

async function measureDirtySavings(storage, churnRate) {
  const count = storage.activeCount;
  const fullBytes = STRIDE * count * FLOAT_BYTES;

  // Simulate dirty updates
  for (let f = 0; f < FRAMES; f++) {
    storage.clearDirty();

    // Modify churnRate fraction of particles
    const toModify = Math.max(1, Math.floor(count * churnRate));
    for (let i = 0; i < toModify; i++) {
      const idx = Math.floor(Math.random() * count);
      storage.setFieldValue(idx, "x", Math.random() * 500);
    }

    const minIdx = storage.dirtyMin;
    const maxIdx = storage.dirtyMax;
    // NOTE: In practice, this would be called:
    //   gpuBuffer.uploadDirty(storage);
    // Here we just measure the range.
  }

  // Compute average dirty range
  let totalDirtyParticles = 0;
  for (let f = 0; f < FRAMES; f++) {
    storage.clearDirty();

    const toModify = Math.max(1, Math.floor(count * churnRate));
    for (let i = 0; i < toModify; i++) {
      const idx = Math.floor(Math.random() * count);
      storage.setFieldValue(idx, "x", Math.random() * 500);
    }

    const rangeLen = storage.dirtyMax - storage.dirtyMin + 1;
    totalDirtyParticles += rangeLen;
  }

  const avgDirtyRange = totalDirtyParticles / FRAMES;
  const dirtyBytes = avgDirtyRange * STRIDE * FLOAT_BYTES;
  const savingsRatio = 1 - (count > 0 ? dirtyBytes / fullBytes : 0);

  return {
    fullBytes,
    dirtyBytes,
    savingsRatio,
    avgDirtyRange,
    churnRate,
  };
}

export async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [1000, 10000, 50000, 100000, 250000];
  const churnRates = [0, 0.001, 0.01, 0.05, 0.25, 1.0];
  const hasWebGpu = typeof navigator !== "undefined" && navigator.gpu != null;

  if (hasWebGpu) {
    await WebGpuDeviceManager.initialize();
  }

  const results = {};

  for (const count of testCounts) {
    console.log(`\n--- Dirty Upload Benchmark: ${count} particles ---`);
    results[count] = {};

    for (const churn of churnRates) {
      const storage = makeStorage(count + 100);
      fillStorage(storage, count);

      const metrics = await measureDirtySavings(storage, churn);
      results[count][churn] = metrics;

      const pct = (churn * 100).toFixed(1);
      const saved = (metrics.savingsRatio * 100).toFixed(1);
      console.log(`  Churn ${pct.padStart(5)}%: full=${(metrics.fullBytes / 1024).toFixed(0)}KB dirty=${(metrics.dirtyBytes / 1024).toFixed(0)}KB saved=${saved}% range=${metrics.avgDirtyRange.toFixed(0)} particles`);

      storage.destroy();
    }
  }

  return { counts: testCounts, churnRates, results };
}

function formatTable(results) {
  const { counts, churnRates, results: data } = results;
  const rows = [];
  const header = ["Count"];
  for (const c of churnRates) {
    header.push(`${(c * 100).toFixed(1)}% churn`);
  }
  rows.push(header);

  for (const count of counts) {
    const row = [String(count)];
    for (const churn of churnRates) {
      const m = data[count][churn];
      row.push(`${(m.savingsRatio * 100).toFixed(1)}%`);
    }
    rows.push(row);
  }
  return rows.map(r => r.join("\t")).join("\n");
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Phase 17B — Dirty-Region Upload Benchmark");
  console.log("Run in a browser with WebGPU support for GPU-side measurements.\n");

  runBenchmark().then((results) => {
    console.log("\n=== Savings Summary ===");
    console.log("Values show bandwidth saved vs full upload:\n");
    console.log(formatTable(results));
  }).catch(console.error);
}
