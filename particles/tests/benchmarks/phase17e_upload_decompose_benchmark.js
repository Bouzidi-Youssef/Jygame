// Phase 17E — Upload Decomposition Benchmark
//
// Decomposes the Upload stage into:
//   Extract — read particle data from SoA storage via getFieldValue
//   Pack    — write values into Float32Array
//   Submit  — device.queue.writeBuffer() call
//   Alloc   — new Float32Array allocation
//
// Counts: 10k, 50k, 100k, 250k
// Churn:  low (life 3-8s), medium (life 0.5-3s), high (life 0.05-0.25s)

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";
import { GpuParticleBuffer } from "../../gpu/webgpu/GpuParticleBuffer.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";

const DT = 1 / 60;
const WARMUP = 5;
const SAMPLES = 30;
const STRIDE = ParticleBufferLayout.STRIDE; // 20
const FLOAT_BYTES = 4;
const FIELD_NAMES = ParticleBufferLayout.FIELD_NAMES;

function makeStorage(cap) {
  return new SoAParticleStorage({ maxSize: cap, initialSize: cap });
}

function fill(storage, count, lifeMin, lifeMax) {
  for (let i = 0; i < count; i++) {
    const p = storage.acquire();
    p.x = Math.random() * 500;
    p.y = Math.random() * 500;
    p.vx = (Math.random() - 0.5) * 100;
    p.vy = (Math.random() - 0.5) * 100;
    p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
    p.maxLife = p.life;
    p.size = 16;
    p.alpha = 1;
  }
}

function replenish(storage, target, lifeMin, lifeMax) {
  const need = target - storage.activeCount;
  if (need > 0) {
    const batch = Math.min(need, 1000);
    fill(storage, batch, lifeMin, lifeMax);
  }
}

// Simulate one frame of death + replenish to maintain churn profile
function stepChurn(storage, dt, lifeMin, lifeMax, target) {
  // Decrement life for all active particles (simulate compute shader work)
  for (const acc of storage.activeParticles) {
    acc.life -= dt;
  }
  // Sweep dead
  let di = 0;
  const accs = storage.activeParticles;
  while (di < accs.length) {
    if (storage.getFieldValue(di, "life") <= 0) storage.release(accs[di]);
    else di++;
  }
  // Replenish
  replenish(storage, target, lifeMin, lifeMax);
}

// ─── Stage Measurements ──────────────────────────────────────

// Phase A: Allocation — time new Float32Array only
function measureAlloc(count) {
  const floatCount = STRIDE * count;
  const t0 = performance.now();
  const data = new Float32Array(floatCount);
  const t1 = performance.now();
  return { time: t1 - t0, data };
}

// Phase B: Extract — fillUploadBuffer (direct typed-array reads)
function measureExtract(storage) {
  const count = storage.activeCount;
  const data = new Float32Array(STRIDE * storage.capacity);
  const t0 = performance.now();
  storage.fillUploadBuffer(data, count, 0);
  const t1 = performance.now();
  // Prevent DCE by using a value from data
  const acc = data.length > 0 ? (data[0] * 1000) | 0 : 0;
  return { time: t1 - t0, acc };
}

// Phase C: Pack — Float32Array writes
// Copy from a pre-populated source array to measure write cost
function measurePack(count) {
  const floatCount = STRIDE * count;
  const src = new Float32Array(floatCount);
  const dst = new Float32Array(floatCount);
  // Fill source with realistic values
  for (let i = 0; i < floatCount; i++) {
    src[i] = Math.random() * 500;
  }
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    for (let f = 0; f < STRIDE; f++) {
      dst[i * STRIDE + f] = src[i * STRIDE + f];
    }
  }
  const t1 = performance.now();
  return { time: t1 - t0, dst };
}

// Phase D: Submit — device.queue.writeBuffer in isolation
// Requires a pre-filled Float32Array and a GPU buffer
function measureSubmit(data, gpuBuffer) {
  const floatCount = data.length;
  const byteSize = floatCount * FLOAT_BYTES;
  const device = WebGpuDeviceManager.device();
  const t0 = performance.now();
  device.queue.writeBuffer(gpuBuffer, 0, data.buffer, 0, byteSize);
  const t1 = performance.now();
  return t1 - t0;
}

// Full upload: alloc + extract+pack combined + submit (production path)
async function measureFullUpload(storage, gpuBuffer) {
  const capacity = storage.capacity;
  const floatCount = STRIDE * capacity;

  // Alloc
  const t0 = performance.now();
  const data = new Float32Array(floatCount);
  const t1 = performance.now();

  // Extract + Pack (uses fillUploadBuffer — direct typed-array reads)
  storage.fillUploadBuffer(data, storage.activeCount, 0);
  const t2 = performance.now();

  // Submit
  const byteSize = floatCount * FLOAT_BYTES;
  const device = WebGpuDeviceManager.device();
  device.queue.writeBuffer(gpuBuffer, 0, data.buffer, 0, byteSize);
  const t3 = performance.now();

  return {
    alloc: t1 - t0,
    extractPack: t2 - t1,
    submit: t3 - t2,
    total: t3 - t0,
  };
}

// ─── Test Runner ─────────────────────────────────────────────

async function measureAll(count, churn) {
  const [lo, hi] = churn === "high" ? [0.05, 0.25]
    : churn === "medium" ? [0.5, 3]
    : [3, 8];

  const storage = makeStorage(count + 100);
  fill(storage, count, lo, hi);

  const dev = WebGpuDeviceManager.device();
  const cap = storage.capacity;
  const gpuBuffer = dev.createBuffer({
    size: STRIDE * cap * FLOAT_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  // Warmup with churn simulation
  for (let i = 0; i < WARMUP; i++) {
    stepChurn(storage, DT, lo, hi, count);
  }

  let sumFullAlloc = 0, sumFullEP = 0, sumFullSubmit = 0, sumFullTotal = 0;
  let sumExtract = 0, sumPack = 0, sumSubmit = 0, sumAlloc = 0;
  let nExtract = 0, nPack = 0, nSubmit = 0, nAlloc = 0;
  let nFull = 0;

  for (let s = 0; s < SAMPLES; s++) {
    stepChurn(storage, DT, lo, hi, count);
    const pc = storage.activeCount;
    if (pc === 0) { fill(storage, count, lo, hi); continue; }

    // 1. Full upload (production path)
    const full = await measureFullUpload(storage, gpuBuffer);
    sumFullAlloc += full.alloc;
    sumFullEP += full.extractPack;
    sumFullSubmit += full.submit;
    sumFullTotal += full.total;
    nFull++;

    // 2. Extract only (storage reads)
    const ext = measureExtract(storage);
    sumExtract += ext.time;
    nExtract++;

    // 3. Pack only (Float32Array write)
    const pk = measurePack(pc);
    sumPack += pk.time;
    nPack++;

    // 4. Alloc only
    const al = measureAlloc(storage.capacity);
    sumAlloc += al.time;
    nAlloc++;

    // 5. Submit only (writeBuffer with pre-filled data)
    const subTime = measureSubmit(al.data, gpuBuffer);
    sumSubmit += subTime;
    nSubmit++;
  }

  gpuBuffer.destroy();
  storage.destroy();

  const r = (sum, n) => n > 0 ? sum / n : 0;

  return {
    count,
    churn,
    fullAlloc: r(sumFullAlloc, nFull),
    fullExtractPack: r(sumFullEP, nFull),
    fullSubmit: r(sumFullSubmit, nFull),
    fullTotal: r(sumFullTotal, nFull),
    extractOnly: r(sumExtract, nExtract),
    packOnly: r(sumPack, nPack),
    submitOnly: r(sumSubmit, nSubmit),
    allocOnly: r(sumAlloc, nAlloc),
  };
}

// ─── Main ────────────────────────────────────────────────────

export async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [10000, 50000, 100000, 250000];
  const churns = ["low", "medium", "high"];

  if (typeof navigator === "undefined" || !navigator.gpu) {
    console.log("WebGPU not available");
    return;
  }

  await WebGpuDeviceManager.initialize();

  console.log("Phase 17E — Upload Decomposition Benchmark\n");
  console.log("Decomposes Upload into: Extract (storage reads), Pack (Float32Array writes), Submit (writeBuffer)\n");

  const results = {};

  for (const count of testCounts) {
    console.log(`── ${count.toLocaleString()} particles ──\n`);

    for (const churn of churns) {
      console.log(`  ${churn.toUpperCase()} churn:`);
      const m = await measureAll(count, churn);
      results[`${count}_${churn}`] = m;

      const ft = m.fullTotal;
      const fmt = (v) => `${v.toFixed(3)}ms`;
      const pct = (v) => `(${(v/ft*100).toFixed(1)}%)`;

      console.log(`    Full upload:  ${fmt(m.fullAlloc)}${pct(m.fullAlloc)} alloc  ` +
        `${fmt(m.fullExtractPack)}${pct(m.fullExtractPack)} extract+pack  ` +
        `${fmt(m.fullSubmit)}${pct(m.fullSubmit)} submit  ` +
        `total=${fmt(ft)}`);

      console.log(`    Decomposed:   ${fmt(m.allocOnly)} alloc  ` +
        `${fmt(m.extractOnly)} extract  ${fmt(m.packOnly)} pack  ` +
        `${fmt(m.submitOnly)} submit  ` +
        `total=${fmt(m.allocOnly + m.extractOnly + m.packOnly + m.submitOnly)}`);
    }
    console.log("");
  }

  // Summary tables
  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("FULL UPLOAD (production path — interleaved extract+pack)");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Count    | Churn   | Alloc    | %  | Extract+Pack | %  | Submit   | %  | Total");
  console.log("─────────┼─────────┼──────────┼────┼──────────────┼────┼──────────┼────┼────────");
  for (const count of testCounts) {
    for (const churn of churns) {
      const m = results[`${count}_${churn}`];
      const ft = m.fullTotal;
      console.log(
        String(count).padStart(7) + " | " +
        churn.padStart(7) + " | " +
        m.fullAlloc.toFixed(3).padStart(8) + " | " +
        (m.fullAlloc/ft*100).toFixed(1).padStart(2) + " | " +
        m.fullExtractPack.toFixed(3).padStart(12) + " | " +
        (m.fullExtractPack/ft*100).toFixed(1).padStart(2) + " | " +
        m.fullSubmit.toFixed(3).padStart(8) + " | " +
        (m.fullSubmit/ft*100).toFixed(1).padStart(2) + " | " +
        ft.toFixed(3).padStart(7)
      );
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("DECOMPOSED (extract, pack, submit measured independently)");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Count    | Churn   | Alloc    | Extract  | Pack     | Submit   | Sum");
  console.log("─────────┼─────────┼──────────┼──────────┼──────────┼──────────┼────────");
  for (const count of testCounts) {
    for (const churn of churns) {
      const m = results[`${count}_${churn}`];
      const sum = m.allocOnly + m.extractOnly + m.packOnly + m.submitOnly;
      console.log(
        String(count).padStart(7) + " | " +
        churn.padStart(7) + " | " +
        m.allocOnly.toFixed(3).padStart(8) + " | " +
        m.extractOnly.toFixed(3).padStart(8) + " | " +
        m.packOnly.toFixed(3).padStart(8) + " | " +
        m.submitOnly.toFixed(3).padStart(8) + " | " +
        sum.toFixed(3).padStart(7)
      );
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("DECOMPOSED PERCENTAGE");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Count    | Churn   | Alloc % | Extract % | Pack %  | Submit %");
  console.log("─────────┼─────────┼─────────┼───────────┼─────────┼─────────");
  for (const count of testCounts) {
    for (const churn of churns) {
      const m = results[`${count}_${churn}`];
      const sum = m.allocOnly + m.extractOnly + m.packOnly + m.submitOnly;
      console.log(
        String(count).padStart(7) + " | " +
        churn.padStart(7) + " | " +
        (m.allocOnly/sum*100).toFixed(1).padStart(7) + " | " +
        (m.extractOnly/sum*100).toFixed(1).padStart(9) + " | " +
        (m.packOnly/sum*100).toFixed(1).padStart(7) + " | " +
        (m.submitOnly/sum*100).toFixed(1).padStart(7)
      );
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("PER-PARTICLE COST (µs)");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Count    | Churn   | Extract (µs) | Pack (µs) | Submit (µs) | Total (µs)");
  console.log("─────────┼─────────┼──────────────┼───────────┼─────────────┼────────────");
  for (const count of testCounts) {
    for (const churn of churns) {
      const m = results[`${count}_${churn}`];
      console.log(
        String(count).padStart(7) + " | " +
        churn.padStart(7) + " | " +
        (m.extractOnly / count * 1000).toFixed(3).padStart(12) + " | " +
        (m.packOnly / count * 1000).toFixed(3).padStart(9) + " | " +
        (m.submitOnly / count * 1000).toFixed(3).padStart(11) + " | " +
        ((m.extractOnly + m.packOnly + m.submitOnly) / count * 1000).toFixed(3).padStart(10)
      );
    }
  }

  // Summary finding
  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════════════");
  for (const count of testCounts) {
    for (const churn of churns) {
      const m = results[`${count}_${churn}`];
      const sum = m.allocOnly + m.extractOnly + m.packOnly + m.submitOnly;
      console.log(`${count} ${churn}: ` +
        `alloc=${(m.allocOnly/sum*100).toFixed(1)}%  ` +
        `extract=${(m.extractOnly/sum*100).toFixed(1)}%  ` +
        `pack=${(m.packOnly/sum*100).toFixed(1)}%  ` +
        `submit=${(m.submitOnly/sum*100).toFixed(1)}%  ` +
        `total=${sum.toFixed(3)}ms`);
    }
  }

  return results;
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Run in a browser with WebGPU support.");
  runBenchmark().catch(console.error);
}
