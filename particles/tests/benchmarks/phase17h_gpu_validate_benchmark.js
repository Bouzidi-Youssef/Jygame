// Phase 17H-A — Real GPU Validation
//
// Determines whether the Phase 17F/17G upload bottleneck
// is a genuine engine limitation or a SwiftShader artifact.
//
//  1. Detect WebGPU adapter info
//  2. Detect WebGL renderer info
//  3. Re-run key Phase 17G measurements (ReadWrite, writeBuffer)
//  4. Calculate effective throughput (GB/s)
//  5. Compare against Phase 17G (SwiftShader) baseline

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";

const WARMUP = 5;
const SAMPLES = 30;
const STRIDE = ParticleBufferLayout.STRIDE;

// ─── Phase 17G Reference Data (SwiftShader baseline) ────────
const PHASE_17G = {
  10000: { readWrite: 2.503, writeBuffer: 1.760 },
  50000: { readWrite: 10.317, writeBuffer: 6.730 },
  100000: { readWrite: 13.347, writeBuffer: 10.320 },
  250000: { readWrite: 29.340, writeBuffer: 27.137 },
};

// ─── Helpers ─────────────────────────────────────────────────

function makeStorage(cap) {
  return new SoAParticleStorage({ maxSize: cap, initialSize: cap });
}

function fill(storage, count) {
  for (let i = 0; i < count; i++) {
    const p = storage.acquire();
    p.x = Math.random() * 500;
    p.y = Math.random() * 500;
    p.vx = (Math.random() - 0.5) * 100;
    p.vy = (Math.random() - 0.5) * 100;
    p.life = 3 + Math.random() * 5;
    p.maxLife = p.life;
    p.size = 16;
    p.alpha = 1;
    p.r = (Math.random() * 255) | 0;
    p.g = (Math.random() * 255) | 0;
    p.b = (Math.random() * 255) | 0;
  }
}

function replenish(storage, target) {
  const need = target - storage.activeCount;
  if (need > 0) {
    const batch = Math.min(need, 1000);
    fill(storage, batch);
  }
}

function stepChurn(storage, dt, target) {
  for (const acc of storage.activeParticles) acc.life -= dt;
  let di = 0;
  const accs = storage.activeParticles;
  while (di < accs.length) {
    if (storage.getFieldValue(di, "life") <= 0) storage.release(accs[di]);
    else di++;
  }
  replenish(storage, target);
}

// ─── Measurements ────────────────────────────────────────────

function measureReadWrite(storage) {
  const count = storage.activeCount;
  const data = new Float32Array(STRIDE * storage.capacity);
  const t0 = performance.now();
  storage.fillUploadBuffer(data, count, 0);
  const t1 = performance.now();
  const sink = data.length > 0 ? (data[0] * 1000) | 0 : 0; // DCE guard
  return { time: t1 - t0, sink, count };
}

function measureWriteBuffer(storage, gpuBuffer) {
  const device = WebGpuDeviceManager.device();
  const floatCount = STRIDE * storage.capacity;
  const byteSize = floatCount * 4;
  const data = new Float32Array(floatCount);
  storage.fillUploadBuffer(data, storage.activeCount, 0);
  const t0 = performance.now();
  device.queue.writeBuffer(gpuBuffer, 0, data.buffer, 0, byteSize);
  const t1 = performance.now();
  return t1 - t0;
}

// ─── Full Upload (production path) ───────────────────────────

function measureFullUpload(storage, gpuBuffer) {
  const device = WebGpuDeviceManager.device();
  const floatCount = STRIDE * storage.capacity;
  const byteSize = floatCount * 4;
  const data = new Float32Array(floatCount);
  const t0 = performance.now();
  storage.fillUploadBuffer(data, storage.activeCount, 0);
  device.queue.writeBuffer(gpuBuffer, 0, data.buffer, 0, byteSize);
  const t1 = performance.now();
  return { time: t1 - t0, count: storage.activeCount };
}

// ─── Adapter Detection ───────────────────────────────────────

async function detectAdapter() {
  const adapter = await navigator.gpu.requestAdapter();
  const info = adapter.info || {};
  return {
    vendor: info.vendor || "unknown",
    architecture: info.architecture || "unknown",
    device: info.device || "unknown",
    description: info.description || "unknown",
    adapterType: info.adapterType || "unknown",
    // Also capture adapter limits
    maxBufferSize: adapter.limits?.maxBufferSize || "unknown",
  };
}

function detectWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return { vendor: "N/A", renderer: "N/A" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return { vendor: "N/A (extension blocked)", renderer: "N/A (extension blocked)" };
    return {
      vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
    };
  } catch (e) {
    return { vendor: `Error: ${e.message}`, renderer: `Error: ${e.message}` };
  }
}

function detectUserAgent() {
  return navigator.userAgent;
}

// ─── Test Runner ─────────────────────────────────────────────

async function measureAt(count) {
  const storage = makeStorage(count + 100);
  fill(storage, count);

  const dev = WebGpuDeviceManager.device();
  const gpuBuffer = dev.createBuffer({
    size: STRIDE * storage.capacity * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    stepChurn(storage, 1/60, count);
  }

  let sumRW = 0, sumWB = 0, sumFU = 0;
  let nRW = 0, nWB = 0, nFU = 0;

  for (let s = 0; s < SAMPLES; s++) {
    stepChurn(storage, 1/60, count);
    const pc = storage.activeCount;
    if (pc === 0) { fill(storage, count); continue; }

    // ReadWrite
    const rw = measureReadWrite(storage);
    sumRW += rw.time; nRW++;

    // writeBuffer
    const wb = measureWriteBuffer(storage, gpuBuffer);
    sumWB += wb; nWB++;

    // Full upload
    const fu = measureFullUpload(storage, gpuBuffer);
    sumFU += fu.time; nFU++;
  }

  gpuBuffer.destroy();
  storage.destroy();

  const r = (sum, n) => n > 0 ? sum / n : 0;

  return {
    count,
    readWriteMs: r(sumRW, nRW),
    writeBufferMs: r(sumWB, nWB),
    fullUploadMs: r(sumFU, nFU),
  };
}

// ─── Main ────────────────────────────────────────────────────

export async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [10000, 50000, 100000, 250000];

  if (typeof navigator === "undefined" || !navigator.gpu) {
    console.log("WebGPU not available");
    return;
  }

  // ── Step 1: Detect adapter ─────────────────────────────────
  await WebGpuDeviceManager.initialize();
  const adapterInfo = await detectAdapter();
  const webglInfo = detectWebGL();
  const userAgent = detectUserAgent();

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Phase 17H-A — Real GPU Validation             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log("── 1. WebGPU Adapter Info ──");
  console.log(`  Vendor:        ${adapterInfo.vendor}`);
  console.log(`  Architecture:  ${adapterInfo.architecture}`);
  console.log(`  Device:        ${adapterInfo.device}`);
  console.log(`  Description:   ${adapterInfo.description}`);
  console.log(`  Adapter Type:  ${adapterInfo.adapterType}`);
  console.log(`  Max Buffer:    ${adapterInfo.maxBufferSize}`);
  // Determine backend type
  const isSwiftShader = /swiftshader|swiftshader/i.test(
    adapterInfo.vendor + " " + adapterInfo.description +
    " " + adapterInfo.architecture + " " + adapterInfo.device
  );
  const isSoftware = isSwiftShader || /llvmpipe|softpipe|mssoftware/i.test(
    adapterInfo.vendor + " " + adapterInfo.description
  );
  const backendType = isSwiftShader ? "SWIFT SHADER (SOFTWARE)"
    : isSoftware ? "SOFTWARE RENDERER"
    : adapterInfo.architecture === "integrated-gpu" ? "INTEGRATED GPU"
    : adapterInfo.adapterType === "discrete" ? "DEDICATED GPU"
    : "UNKNOWN";
  console.log(`  Detected:      ${backendType}`);
  console.log("");

  console.log("── 2. WebGL Renderer Info ──");
  console.log(`  Vendor:  ${webglInfo.vendor}`);
  console.log(`  Renderer: ${webglInfo.renderer}`);
  const wglIsSwift = /swiftshader|llvmpipe|softpipe/i.test(
    webglInfo.vendor + " " + webglInfo.renderer
  );
  console.log(`  Software: ${wglIsSwift ? "YES" : "NO (likely hardware)"}`);
  console.log("");

  console.log("── 3. User Agent ──");
  console.log(`  ${userAgent}`);
  console.log("");

  // ── Step 4: Re-run measurements ───────────────────────────
  console.log("── 4. Benchmark Results ──\n");

  const results = {};

  for (const count of testCounts) {
    console.log(`  ${count.toLocaleString()} particles (low churn):`);
    const m = await measureAt(count);
    results[count] = m;

    const ref = PHASE_17G[count];
    const rwSpeedup = ref ? ref.readWrite / m.readWriteMs : null;
    const wbSpeedup = ref ? ref.writeBuffer / m.writeBufferMs : null;

    console.log(`    ReadWrite:     ${m.readWriteMs.toFixed(3)}ms` +
      (rwSpeedup ? `  (x${rwSpeedup.toFixed(1)} vs Phase 17G)` : ""));
    console.log(`    writeBuffer:   ${m.writeBufferMs.toFixed(3)}ms` +
      (wbSpeedup ? `  (x${wbSpeedup.toFixed(1)} vs Phase 17G)` : ""));
    console.log(`    Full upload:   ${m.fullUploadMs.toFixed(3)}ms` +
      `  (includes readWrite + writeBuffer + alloc)`);
    console.log("");
  }

  // ── Step 5: Throughput calculations ───────────────────────
  console.log("── 5. Effective Throughput ──\n");
  console.log("Count    | Data (MB) | FullUpload (ms) | Throughput (GB/s)");
  console.log("─────────┼───────────┼─────────────────┼──────────────────");
  for (const count of testCounts) {
    const m = results[count];
    // uploadData = count × STRIDE × 4 bytes (the data actually transferred to GPU)
    // We also count the read from storage for the full picture:
    // Total bytes moved = count × STRIDE × 4 (reads) + count × STRIDE × 4 (writes to F32A) + count × STRIDE × 4 (writeBuffer)
    // = count × STRIDE × 4 × 3 = count × 240 bytes
    // For throughput we report the GPU transfer portion (what writeBuffer moves):
    const dataMb = count * STRIDE * 4 / 1e6;
    const throughput = dataMb / (m.fullUploadMs / 1000) / 1e3; // GB/s
    console.log(
      String(count).padStart(7) + " | " +
      dataMb.toFixed(2).padStart(9) + " | " +
      m.fullUploadMs.toFixed(3).padStart(15) + " | " +
      throughput.toFixed(3).padStart(16)
    );
  }

  // ── Step 6: Direct comparison ─────────────────────────────
  console.log("\n── 6. Direct Comparison vs Phase 17G (SwiftShader) ──\n");
  console.log("Count    | 17G-C ReadWrite | This-RW | Speedup | 17G-G writeBuffer | This-WB | Speedup");
  console.log("─────────┼─────────────────┼─────────┼─────────┼───────────────────┼─────────┼────────");
  for (const count of testCounts) {
    const ref = PHASE_17G[count];
    const m = results[count];
    const rwSpeed = ref ? (ref.readWrite / m.readWriteMs).toFixed(1) : "N/A";
    const wbSpeed = ref ? (ref.writeBuffer / m.writeBufferMs).toFixed(1) : "N/A";
    console.log(
      String(count).padStart(7) + " | " +
      (ref ? ref.readWrite.toFixed(3).padStart(15) : "N/A".padStart(15)) + " | " +
      m.readWriteMs.toFixed(3).padStart(7) + " | " +
      "x" + rwSpeed.padStart(5) + " | " +
      (ref ? ref.writeBuffer.toFixed(3).padStart(17) : "N/A".padStart(17)) + " | " +
      m.writeBufferMs.toFixed(3).padStart(7) + " | " +
      "x" + wbSpeed.padStart(5)
    );
  }

  // ── Verdict ───────────────────────────────────────────────
  console.log("\n── 7. VERDICT ──\n");

  if (isSwiftShader || wglIsSwift) {
    console.log("  Backend: SWIFT SHADER (Software)");
    console.log("");
    console.log("  Outcome A — Software backend confirmed.");
    console.log("  Phase 17G numbers are not representative of real hardware.");
    console.log("  Repeat all upload conclusions on a real GPU backend");
    console.log("  before committing to GPU-persistent architecture.");
    console.log("");
    console.log("  Recommendation: Run these benchmarks on a machine with");
    console.log("  a dedicated or integrated GPU to establish a real baseline.");
  } else {
    console.log("  Backend: HARDWARE GPU (" + backendType + ")");
    console.log("");

    // Check if throughput dramatically exceeds Phase 17G
    const ref250 = PHASE_17G[250000];
    const m250 = results[250000];
    const speedup250 = ref250 ? ref250.fullUploadMs / m250.fullUploadMs : 0;

    if (speedup250 > 15) {
      console.log("  Outcome C — Real GPU dramatically outperforms Phase 17G.");
      console.log(`  250k speedup: ${speedup250.toFixed(1)}x`);
      console.log("  Upload path may already be sufficient on real hardware.");
      console.log("  Re-evaluate whether GPU-persistent storage is necessary.");
    } else {
      console.log("  Outcome B — Real GPU confirmed but throughput still limited.");
      console.log(`  250k speedup: ${speedup250.toFixed(1)}x`);
      console.log("  Phase 17G bottleneck is genuine.");
      console.log("  Proceed to Phase 17H-B (GPU-persistent storage design).");
    }
  }

  return { adapterInfo, webglInfo, results, backendType, isSwiftShader };
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Run in a browser with WebGPU support.");
  runBenchmark().catch(console.error);
}
