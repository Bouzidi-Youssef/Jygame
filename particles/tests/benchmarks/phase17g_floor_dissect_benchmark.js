// Phase 17G — Upload Floor Dissection
//
// Determines whether the remaining upload cost is:
//   A) True memory bandwidth floor, or
//   B) Hidden software overhead
//
// Tests:
//   A — ReadOnly:          read 20 fields into volatile sink (no Float32Array write)
//   B — WriteOnly:         write synthetic values to Float32Array (no storage reads)
//   C — ReadWrite:         fillUploadBuffer (production path, read + write)
//   D — PhysIdxCost:       just idx = active[i]._i (no field reads/writes)
//   E — SequentialReadWrite: fillUploadBuffer with idx = i (no indirection)
//   F — SoABandwidthCeil:  pure dst[i] = src[i] for arrays of production size
//   G — writeBufferIsolation: device.queue.writeBuffer() alone at various sizes

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";

const WARMUP = 5;
const SAMPLES = 30;
const STRIDE = ParticleBufferLayout.STRIDE; // 20

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
    p.r = (Math.random() * 255) | 0;
    p.g = (Math.random() * 255) | 0;
    p.b = (Math.random() * 255) | 0;
  }
}

function replenish(storage, target, lifeMin, lifeMax) {
  const need = target - storage.activeCount;
  if (need > 0) {
    const batch = Math.min(need, 1000);
    fill(storage, batch, lifeMin, lifeMax);
  }
}

function stepChurn(storage, dt, lifeMin, lifeMax, target) {
  for (const acc of storage.activeParticles) acc.life -= dt;
  let di = 0;
  const accs = storage.activeParticles;
  while (di < accs.length) {
    if (storage.getFieldValue(di, "life") <= 0) storage.release(accs[di]);
    else di++;
  }
  replenish(storage, target, lifeMin, lifeMax);
}

// ─── Test A: ReadOnly ───────────────────────────────────────
// Read all 20 fields from storage into volatile accumulator.
// No Float32Array write. Measures raw typed-array read throughput.
function measureReadOnly(storage) {
  const accs = storage.activeParticles;
  const count = accs.length;
  const { _x, _y, _vx, _vy, _ax, _ay, _life, _maxLife, _ageRatio,
          _rotation, _rotationSpeed, _size, _alpha, _depth,
          _r, _g, _b, _alive, _seed, _segment } = storage;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const idx = accs[i]._i;
    sink ^= (_x[idx] * 1000) | 0;
    sink ^= (_y[idx] * 1000) | 0;
    sink ^= (_vx[idx] * 1000) | 0;
    sink ^= (_vy[idx] * 1000) | 0;
    sink ^= (_ax[idx] * 1000) | 0;
    sink ^= (_ay[idx] * 1000) | 0;
    sink ^= (_life[idx] * 1000) | 0;
    sink ^= (_maxLife[idx] * 1000) | 0;
    sink ^= (_ageRatio[idx] * 1000) | 0;
    sink ^= (_rotation[idx] * 1000) | 0;
    sink ^= (_rotationSpeed[idx] * 1000) | 0;
    sink ^= (_size[idx] * 1000) | 0;
    sink ^= (_alpha[idx] * 1000) | 0;
    sink ^= (_depth[idx] * 1000) | 0;
    sink ^= (_r[idx] * 1000) | 0;
    sink ^= (_g[idx] * 1000) | 0;
    sink ^= (_b[idx] * 1000) | 0;
    sink ^= (_alive[idx] * 1000) | 0;
    sink ^= (_seed[idx] * 1000) | 0;
    sink ^= (_segment[idx] * 1000) | 0;
  }
  const t1 = performance.now();
  return { time: t1 - t0, sink };
}

// ─── Test B: WriteOnly ──────────────────────────────────────
// Write pre-loaded synthetic values into a Float32Array.
// No storage reads. Measures raw Float32Array write throughput.
function measureWriteOnly(count) {
  const floatCount = STRIDE * count;
  const src = new Float32Array(floatCount);
  const dst = new Float32Array(floatCount);
  for (let i = 0; i < floatCount; i++) src[i] = Math.random() * 500;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const base = i * STRIDE;
    dst[base]     = src[base];
    dst[base + 1] = src[base + 1];
    dst[base + 2] = src[base + 2];
    dst[base + 3] = src[base + 3];
    dst[base + 4] = src[base + 4];
    dst[base + 5] = src[base + 5];
    dst[base + 6] = src[base + 6];
    dst[base + 7] = src[base + 7];
    dst[base + 8] = src[base + 8];
    dst[base + 9] = src[base + 9];
    dst[base + 10] = src[base + 10];
    dst[base + 11] = src[base + 11];
    dst[base + 12] = src[base + 12];
    dst[base + 13] = src[base + 13];
    dst[base + 14] = src[base + 14];
    dst[base + 15] = src[base + 15];
    dst[base + 16] = src[base + 16];
    dst[base + 17] = src[base + 17];
    dst[base + 18] = src[base + 18];
    dst[base + 19] = src[base + 19];
  }
  const t1 = performance.now();
  sink ^= (dst[0] * 1000) | 0; // prevent DCE
  return { time: t1 - t0, sink };
}

// ─── Test C: ReadWrite (production fillUploadBuffer) ────────
function measureReadWrite(storage) {
  const count = storage.activeCount;
  const data = new Float32Array(STRIDE * storage.capacity);
  const t0 = performance.now();
  storage.fillUploadBuffer(data, count, 0);
  const t1 = performance.now();
  const sink = data.length > 0 ? (data[0] * 1000) | 0 : 0;
  return { time: t1 - t0, sink };
}

// ─── Test D: Physical Index Cost ────────────────────────────
// Just idx = active[i]._i — no field reads, no writes
function measurePhysIdxCost(storage) {
  const accs = storage.activeParticles;
  const count = accs.length;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const idx = accs[i]._i;
    sink ^= idx;
  }
  const t1 = performance.now();
  return { time: t1 - t0, sink };
}

// ─── Test E: SequentialReadWrite ────────────────────────────
// Like fillUploadBuffer but idx = i (sequential, no indirection)
function measureSeqReadWrite(storage) {
  const count = storage.activeCount;
  const data = new Float32Array(STRIDE * storage.capacity);
  const { _x, _y, _vx, _vy, _ax, _ay, _life, _maxLife, _ageRatio,
          _rotation, _rotationSpeed, _size, _alpha, _depth,
          _r, _g, _b, _alive, _seed, _segment } = storage;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const base = i * STRIDE;
    data[base]      = _x[i];
    data[base + 1]  = _y[i];
    data[base + 2]  = _vx[i];
    data[base + 3]  = _vy[i];
    data[base + 4]  = _ax[i];
    data[base + 5]  = _ay[i];
    data[base + 6]  = _life[i];
    data[base + 7]  = _maxLife[i];
    data[base + 8]  = _ageRatio[i];
    data[base + 9]  = _rotation[i];
    data[base + 10] = _rotationSpeed[i];
    data[base + 11] = _size[i];
    data[base + 12] = _alpha[i];
    data[base + 13] = _depth[i];
    data[base + 14] = _r[i];
    data[base + 15] = _g[i];
    data[base + 16] = _b[i];
    data[base + 17] = _alive[i];
    data[base + 18] = _seed[i];
    data[base + 19] = _segment[i];
  }
  const t1 = performance.now();
  const sink = data.length > 0 ? (data[0] * 1000) | 0 : 0;
  return { time: t1 - t0, sink };
}

// ─── Test F: SoA Bandwidth Ceiling ──────────────────────────
// Pure dst[i] = src[i] for arrays of production size.
// This is the theoretical max memory throughput for reading
// 20 source arrays and writing 1 destination array of 20× width.
function measureBandwidthCeiling(count) {
  // Simulate 20 field reads + 20 float writes per particle
  // Read from 20 separate arrays, write to 1 interleaved array
  const srcArrays = [];
  for (let f = 0; f < STRIDE; f++) {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) arr[i] = Math.random() * 500;
    srcArrays.push(arr);
  }
  const dst = new Float32Array(STRIDE * count);

  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const base = i * STRIDE;
    for (let f = 0; f < STRIDE; f++) {
      dst[base + f] = srcArrays[f][i];
    }
  }
  const t1 = performance.now();

  const sink = dst.length > 0 ? (dst[0] * 1000) | 0 : 0;
  const bytesPerParticle = STRIDE * 4 * 2; // read + write: 20 fields × 4 bytes × 2
  const bytesTotal = count * bytesPerParticle;
  const bw = bytesTotal / (t1 - t0) / 1e6; // GB/s
  return { time: t1 - t0, bw, sink };
}

// ─── Test G: writeBuffer Isolation ──────────────────────────
function measureWriteBuffer(byteSize, gpuBuffer) {
  const device = WebGpuDeviceManager.device();
  const data = new Float32Array(byteSize / 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 500;
  const t0 = performance.now();
  device.queue.writeBuffer(gpuBuffer, 0, data.buffer, 0, byteSize);
  const t1 = performance.now();
  return t1 - t0;
}

// ─── Test Runner ─────────────────────────────────────────────

async function measureAll(count) {
  const lo = 3, hi = 8; // low churn only
  const storage = makeStorage(count + 100);
  fill(storage, count, lo, hi);

  const dev = WebGpuDeviceManager.device();
  const gpuBuffer = dev.createBuffer({
    size: STRIDE * storage.capacity * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    stepChurn(storage, 1/60, lo, hi, count);
  }

  let sumA = 0, sumB = 0, sumC = 0, sumD = 0, sumE = 0, sumF = 0;
  let sumG = 0;
  let nA = 0, nB = 0, nC = 0, nD = 0, nE = 0, nF = 0, nG = 0;
  let bwSum = 0;

  for (let s = 0; s < SAMPLES; s++) {
    stepChurn(storage, 1/60, lo, hi, count);
    const pc = storage.activeCount;
    if (pc === 0) { fill(storage, count, lo, hi); continue; }

    const a = measureReadOnly(storage);
    sumA += a.time; nA++;

    const b = measureWriteOnly(pc);
    sumB += b.time; nB++;

    const c = measureReadWrite(storage);
    sumC += c.time; nC++;

    const d = measurePhysIdxCost(storage);
    sumD += d.time; nD++;

    const e = measureSeqReadWrite(storage);
    sumE += e.time; nE++;

    const f = measureBandwidthCeiling(pc);
    sumF += f.time; nF++;
    bwSum += f.bw;

    const byteSize = STRIDE * storage.capacity * 4;
    const g = measureWriteBuffer(byteSize, gpuBuffer);
    sumG += g; nG++;
  }

  gpuBuffer.destroy();
  storage.destroy();

  const r = (sum, n) => n > 0 ? sum / n : 0;

  return {
    count,
    readOnly: r(sumA, nA),
    writeOnly: r(sumB, nB),
    readWrite: r(sumC, nC),
    physIdxCost: r(sumD, nD),
    seqReadWrite: r(sumE, nE),
    bwCeiling: r(sumF, nF),
    bwEstimate: r(bwSum, nF),
    writeBufferOnly: r(sumG, nG),
  };
}

// ─── Main ────────────────────────────────────────────────────

export async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [10000, 50000, 100000, 250000];

  if (typeof navigator === "undefined" || !navigator.gpu) {
    console.log("WebGPU not available");
    return;
  }

  await WebGpuDeviceManager.initialize();

  console.log("Phase 17G — Upload Floor Dissection\n");
  console.log("Determines whether remaining cost is memory bandwidth floor or hidden overhead\n");

  const results = {};

  for (const count of testCounts) {
    console.log(`── ${count.toLocaleString()} particles (low churn) ──\n`);
    const m = await measureAll(count);
    results[count] = m;

    console.log(`  A ReadOnly:           ${m.readOnly.toFixed(3)}ms  (read 20 fields into sink)`);
    console.log(`  B WriteOnly:          ${m.writeOnly.toFixed(3)}ms  (write 20 floats to F32A)`);
    console.log(`  C ReadWrite (prod):   ${m.readWrite.toFixed(3)}ms  (fillUploadBuffer)`);
    console.log(`  D PhysIdxCost:        ${m.physIdxCost.toFixed(3)}ms  (active[i]._i only)`);
    console.log(`  E SeqReadWrite:       ${m.seqReadWrite.toFixed(3)}ms  (idx = i, no indirection)`);
    console.log(`  F BandwidthCeiling:   ${m.bwCeiling.toFixed(3)}ms  (${m.bwEstimate.toFixed(2)} GB/s)`);
    console.log(`  G writeBufferOnly:    ${m.writeBufferOnly.toFixed(3)}ms`);
    console.log("");
  }

  // Summary tables
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("ABSOLUTE TIMING (ms)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | A-ReadOnly | B-WriteOnly | C-ReadWrite | D-PhysIdx | E-SeqRW | F-BWCeiling | G-writeBuffer");
  console.log("─────────┼────────────┼─────────────┼─────────────┼───────────┼─────────┼─────────────┼──────────────");
  for (const count of testCounts) {
    const m = results[count];
    console.log(
      String(count).padStart(7) + " | " +
      m.readOnly.toFixed(3).padStart(10) + " | " +
      m.writeOnly.toFixed(3).padStart(11) + " | " +
      m.readWrite.toFixed(3).padStart(11) + " | " +
      m.physIdxCost.toFixed(3).padStart(9) + " | " +
      m.seqReadWrite.toFixed(3).padStart(7) + " | " +
      m.bwCeiling.toFixed(3).padStart(11) + " | " +
      m.writeBufferOnly.toFixed(3).padStart(12)
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("OVERHEAD ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | A+B vs C (overhead) | C-E (indirection) | F-G (ceil-writeBuf)");
  console.log("─────────┼─────────────────────┼───────────────────┼─────────────────────");
  for (const count of testCounts) {
    const m = results[count];
    const overhead = m.readWrite - (m.readOnly + m.writeOnly);
    const indirection = m.readWrite - m.seqReadWrite;
    const ceilMinusWrite = m.bwCeiling - m.writeBufferOnly;
    console.log(
      String(count).padStart(7) + " | " +
      overhead.toFixed(3).padStart(19) + " | " +
      indirection.toFixed(3).padStart(17) + " | " +
      ceilMinusWrite.toFixed(3).padStart(19)
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("PER-PARTICLE COST (µs)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | ReadOnly | WriteOnly | ReadWrite | SeqRW | BWCeil");
  console.log("─────────┼──────────┼───────────┼───────────┼───────┼────────");
  for (const count of testCounts) {
    const m = results[count];
    console.log(
      String(count).padStart(7) + " | " +
      (m.readOnly / count * 1000).toFixed(3).padStart(8) + " | " +
      (m.writeOnly / count * 1000).toFixed(3).padStart(9) + " | " +
      (m.readWrite / count * 1000).toFixed(3).padStart(9) + " | " +
      (m.seqReadWrite / count * 1000).toFixed(3).padStart(5) + " | " +
      (m.bwCeiling / count * 1000).toFixed(3).padStart(6)
    );
  }

  // Memory bandwidth table
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("MEMORY BANDWIDTH ESTIMATE (GB/s)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | BWCeiling (GB/s) | Data Read+Write (MB) | Time (ms)");
  console.log("─────────┼──────────────────┼──────────────────────┼───────────");
  for (const count of testCounts) {
    const m = results[count];
    const dataMb = count * STRIDE * 4 * 2 / 1e6; // read + write in MB
    console.log(
      String(count).padStart(7) + " | " +
      m.bwEstimate.toFixed(2).padStart(14) + "  | " +
      dataMb.toFixed(2).padStart(20) + "  | " +
      m.bwCeiling.toFixed(3).padStart(9)
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("VERDICT");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  for (const count of testCounts) {
    const m = results[count];
    const overhead = m.readWrite - (m.readOnly + m.writeOnly);
    const overheadPct = overhead / m.readWrite * 100;
    const indirection = m.readWrite - m.seqReadWrite;
    const indirectionPct = indirection / m.readWrite * 100;
    const isBwBound = overhead < m.readWrite * 0.15 && indirection < m.readWrite * 0.10;

    console.log(`${count}:`);
    console.log(`  ReadWrite: ${m.readWrite.toFixed(3)}ms`);
    console.log(`  ReadOnly+WriteOnly: ${(m.readOnly + m.writeOnly).toFixed(3)}ms`);
    console.log(`  Overhead (C - (A+B)): ${overhead.toFixed(3)}ms (${overheadPct.toFixed(1)}% of C)`);
    console.log(`  Indirection (C - E): ${indirection.toFixed(3)}ms (${indirectionPct.toFixed(1)}% of C)`);
    console.log(`  PhysIdxCost (D): ${m.physIdxCost.toFixed(3)}ms`);
    console.log(`  Bandwidth ceiling (F): ${m.bwCeiling.toFixed(3)}ms at ${m.bwEstimate.toFixed(1)} GB/s`);
    console.log(`  writeBuffer (G): ${m.writeBufferOnly.toFixed(3)}ms`);
    console.log(`  → ${isBwBound ? "MEMORY BANDWIDTH BOUND" : "HIDDEN OVERHEAD EXISTS"}`);
    console.log("");
  }

  return results;
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Run in a browser with WebGPU support.");
  runBenchmark().catch(console.error);
}
