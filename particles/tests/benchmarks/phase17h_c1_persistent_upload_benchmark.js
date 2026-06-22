// Phase 17H-C1 — Persistent Upload Prototype
//
// Validates the core assumption behind GPU-persistent storage:
//   Eliminating full-buffer uploads removes the dominant bottleneck.
//
// Compares:
//   Legacy: fillUploadBuffer + writeBuffer (full active set every frame)
//   Persistent: writeSlot / writeSlots (only newly emitted particles)
//
// Metrics collected:
//   Legacy: upload time (fillUploadBuffer + writeBuffer)
//   Persistent: write time per particle, total per-frame write time
//   Bytes uploaded per frame (both paths)
//   Cost per emitted particle (persistent path)

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";
import { GpuParticleBuffer } from "../../gpu/webgpu/GpuParticleBuffer.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";

const WARMUP = 5;
const SAMPLES = 30;
const STRIDE = ParticleBufferLayout.STRIDE;

// ─── Storage Helpers ───────────────────────────────────────────

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

function fillNewBatch(storage, count) {
  let batch = [];
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
    batch.push(p);
  }
  return batch;
}

// ─── Legacy Path Measurement ───────────────────────────────────

function measureLegacyUpload(gpuBuffer, storage) {
  const count = storage.activeCount;
  const capacity = storage.capacity;
  const floatCount = STRIDE * capacity;

  const t0 = performance.now();

  const data = new Float32Array(floatCount);
  storage.fillUploadBuffer(data, count, 0);
  gpuBuffer._device.queue.writeBuffer(gpuBuffer._buffer, 0, data.buffer, 0, floatCount * 4);

  const t1 = performance.now();

  const bytes = count * STRIDE * 4;
  return { time: t1 - t0, bytes, count };
}

// ─── Persistent Path Measurement ───────────────────────────────

function measurePersistentEmit(gpuBuffer, storage, emitCount) {
  const t0 = performance.now();

  const batch = [];
  for (let i = 0; i < emitCount; i++) {
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
    batch.push(p._i);
  }

  // Time the upload (writeSlots batch or individual writeSlots)
  const uploadT0 = performance.now();

  if (emitCount === 1) {
    gpuBuffer.writeSlot(batch[0], storage);
  } else {
    gpuBuffer.writeSlots(batch, storage);
  }

  const uploadT1 = performance.now();

  const bytes = emitCount * STRIDE * 4;
  return {
    totalTime: uploadT1 - t0,
    uploadTime: uploadT1 - uploadT0,
    initTime: uploadT0 - t0,
    bytes,
    count: emitCount,
  };
}

// ─── Churn Simulation ──────────────────────────────────────────

function killSome(storage, killCount) {
  const active = storage.activeParticles;
  const toKill = Math.min(killCount, active.length);
  for (let i = 0; i < toKill; i++) {
    storage.release(active[active.length - 1]); // kill from end
  }
}

// ─── Benchmark Runner ──────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [10000, 50000, 100000, 250000];
  const churnLevels = [
    { name: "no churn",     emits: 0 },
    { name: "low churn",    emits: 10 },
    { name: "medium churn", emits: 100 },
    { name: "high churn",   emits: 1000 },
  ];

  if (typeof navigator === "undefined" || !navigator.gpu) {
    console.log("WebGPU not available — benchmark requires a browser with WebGPU");
    return;
  }

  await WebGpuDeviceManager.initialize();

  // Determine backend info
  const adapter = await navigator.gpu.requestAdapter();
  const info = adapter.info || {};

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Phase 17H-C1 — Persistent Upload Prototype                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("── Backend Info ──");
  console.log(`  Vendor:       ${info.vendor || "unknown"}`);
  console.log(`  Architecture: ${info.architecture || "unknown"}`);
  console.log(`  Device:       ${info.device || "unknown"}`);
  console.log(`  Max Buffer:   ${adapter.limits?.maxBufferSize || "unknown"}`);
  const isSwiftShader = /swiftshader/i.test(
    (info.vendor || "") + " " + (info.architecture || "") + " " + (info.device || "")
  );
  console.log(`  Backend:      ${isSwiftShader ? "SWIFT SHADER (SOFTWARE)" : "HARDWARE GPU"}`);
  console.log("");

  const allResults = {};

  for (const count of testCounts) {
    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`  ${count.toLocaleString()} particles`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

    const cap = Math.max(1024, Math.pow(2, Math.ceil(Math.log2(count + 100))));
    const storage = makeStorage(cap);
    fill(storage, count);
    const gpuBuffer = new GpuParticleBuffer(cap);

    const results = { legacy: {}, persistent: {} };
    const initCount = storage.activeCount;

    // ── Legacy Path ────────────────────────────────────────────
    console.log("  ── Legacy Upload Path ──\n");
    console.log("    " + "Sample".padStart(6) + " | " + "Upload (ms)".padStart(12) + " | " + "Particles".padStart(12) + " | " + "Bytes".padStart(12));
    console.log("    " + "──────".padStart(6) + "─┼─" + "────────────".padStart(12) + "─┼─" + "────────────".padStart(12) + "─┼─" + "────────────".padStart(12));

    let legacySum = 0;
    let legacySamples = 0;

    for (let s = 0; s < WARMUP + SAMPLES; s++) {
      const m = measureLegacyUpload(gpuBuffer, storage);
      if (s >= WARMUP) {
        legacySum += m.time;
        legacySamples++;
        if (s < WARMUP + 5 || s === WARMUP + SAMPLES - 1) {
          console.log("    " + String(s + 1).padStart(6) + " | " + m.time.toFixed(4).padStart(12) + " | " + String(m.count).padStart(12) + " | " + formatBytes(m.bytes).padStart(12));
        }
      }
    }

    const legacyAvg = legacySum / legacySamples;
    const legacyBytesPerFrame = initCount * STRIDE * 4;
    results.legacy = {
      avgMs: legacyAvg,
      bytesPerFrame: legacyBytesPerFrame,
      particlesPerFrame: initCount,
    };

    // Print per-particle cost for legacy
    const legacyPerParticleUs = (legacyAvg / initCount) * 1000;
    console.log(`\n    Legacy average: ${legacyAvg.toFixed(4)}ms (${legacyPerParticleUs.toFixed(4)}µs/particle, ${formatBytes(legacyBytesPerFrame)}/frame)`);
    console.log("");

    // ── Persistent Path ────────────────────────────────────────
    // Kill some particles to free slots, then measure emit + writeSlot

    // First, do a seed upload (one-time cost for persistent path)
    gpuBuffer.uploadFromStorage(storage);

    console.log("  ── Persistent Upload Path ──\n");

    const churnResults = [];

    for (const churn of churnLevels) {
      const emitN = churn.emits;

      // Free slots by killing from the end
      if (emitN > 0) {
        killSome(storage, emitN);
      }

      console.log(`    [${churn.name}] emits/frame: ${emitN}`);

      let emitSum = 0;
      let uploadSum = 0;
      let initSum = 0;
      let emitSamples = 0;
      let totalBytes = 0;

      for (let s = 0; s < WARMUP + SAMPLES; s++) {
        // Re-kill to maintain steady-state count
        if (emitN > 0 && s > 0) {
          killSome(storage, emitN);
        }

        const m = measurePersistentEmit(gpuBuffer, storage, emitN);
        if (s >= WARMUP) {
          emitSum += m.totalTime;
          uploadSum += m.uploadTime;
          initSum += m.initTime;
          emitSamples++;
          totalBytes += m.bytes;
        }
      }

      const avgEmit = emitSum / emitSamples;
      const avgUpload = uploadSum / emitSamples;
      const avgInit = initSum / emitSamples;
      const avgBytes = totalBytes / emitSamples;
      const perParticleUs = emitN > 0 ? (avgUpload / emitN) * 1000 : 0;

      churnResults.push({
        churn: churn.name,
        emitsPerFrame: emitN,
        totalMs: avgEmit,
        uploadMs: avgUpload,
        initMs: avgInit,
        bytesPerFrame: avgBytes,
        perParticleUs,
      });

      console.log(`      Total emit:     ${avgEmit.toFixed(4)}ms`);
      console.log(`      Upload (write): ${avgUpload.toFixed(4)}ms${emitN > 0 ? ` (${perParticleUs.toFixed(4)}µs/particle)` : ""}`);
      console.log(`      Init (acquire): ${avgInit.toFixed(4)}ms`);
      console.log(`      Bytes:          ${formatBytes(avgBytes)}/frame`);
      console.log("");
    }

    results.persistent = churnResults;

    // ── Comparison Table ───────────────────────────────────────

    console.log(`  ── Comparison (${count.toLocaleString()} particles) ──\n`);
    console.log("    " + "Scenario".padStart(14) + " | " + "Legacy (ms)".padStart(12) + " | " + "Persist (ms)".padStart(12) + " | " + "Savings".padStart(10) + " | " + "Legacy Bytes".padStart(14) + " | " + "Persist Bytes".padStart(14));
    console.log("    " + "──────────────".padStart(14) + "─┼─" + "────────────".padStart(12) + "─┼─" + "────────────".padStart(12) + "─┼─" + "──────────".padStart(10) + "─┼─" + "──────────────".padStart(14) + "─┼─" + "──────────────".padStart(14));

    for (const cr of churnResults) {
      const savings = legacyAvg - cr.uploadMs;
      const savingsPct = (savings / legacyAvg * 100);
      console.log(
        "    " + cr.churn.padStart(14) + " | " +
        legacyAvg.toFixed(4).padStart(12) + " | " +
        cr.uploadMs.toFixed(4).padStart(12) + " | " +
        (savings > 0 ? "-" + Math.abs(savings).toFixed(2).padStart(7) : "+" + Math.abs(savings).toFixed(2).padStart(7)) + "ms" + " | " +
        formatBytes(legacyBytesPerFrame).padStart(14) + " | " +
        formatBytes(cr.bytesPerFrame).padStart(14)
      );
    }
    console.log("");

    allResults[count] = results;

    gpuBuffer.destroy();
    storage.destroy();
  }

  // ── Summary ──────────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("    " + "Count".padStart(7) + " | " + "Legacy Avg (ms)".padStart(15) + " | " + "Per-Particle (µs)".padStart(18) + " | " + "No Churn (ms)".padStart(14) + " | " + "High Churn (ms)".padStart(15) + " | " + "Savings (high churn)");
  console.log("    " + "───────".padStart(7) + "─┼─" + "───────────────".padStart(15) + "─┼─" + "─────────────────".padStart(18) + "─┼─" + "──────────────".padStart(14) + "─┼─" + "───────────────".padStart(15) + "─┼─" + "────────────────────");

  for (const count of testCounts) {
    const r = allResults[count];
    if (!r) continue;
    const legacy = r.legacy;
    const perParticle = (legacy.avgMs / legacy.particlesPerFrame) * 1000;
    const noChurn = r.persistent.find(c => c.churn === "no churn");
    const highChurn = r.persistent.find(c => c.churn === "high churn");
    const savings = legacy.avgMs - (highChurn ? highChurn.uploadMs : 0);

    console.log(
      "    " + String(count).padStart(7) + " | " +
      legacy.avgMs.toFixed(4).padStart(15) + " | " +
      perParticle.toFixed(4).padStart(18) + " | " +
      (noChurn ? noChurn.uploadMs.toFixed(4).padStart(14) : "N/A".padStart(14)) + " | " +
      (highChurn ? highChurn.uploadMs.toFixed(4).padStart(15) : "N/A".padStart(15)) + " | " +
      savings.toFixed(2) + "ms (" + (savings / legacy.avgMs * 100).toFixed(1) + "%)"
    );
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  VERDICT                                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Analyze results
  const maxCount = testCounts[testCounts.length - 1];
  const maxResult = allResults[maxCount];
  if (maxResult) {
    const legacyMs = maxResult.legacy.avgMs;
    const noChurnMs = maxResult.persistent.find(c => c.churn === "no churn")?.uploadMs || 0;
    const highChurnMs = maxResult.persistent.find(c => c.churn === "high churn")?.uploadMs || 0;

    console.log(`  At ${maxCount.toLocaleString()} particles:`);
    console.log(`    Legacy upload:          ${legacyMs.toFixed(2)}ms`);
    console.log(`    Persistent (no churn):  ${noChurnMs.toFixed(4)}ms`);
    console.log(`    Persistent (high churn): ${highChurnMs.toFixed(4)}ms`);

    if (noChurnMs < legacyMs * 0.1) {
      console.log("\n  ✓ GO: Persistent upload provides substantial benefit.");
      console.log("  Upload cost dropped from dominant bottleneck to negligible cost.");
      console.log("  Proceed to Phase 17H-C (lifecycle synchronization).");
    } else {
      console.log("\n  ✗ NO-GO: Upload removal did not materially improve performance.");
      console.log("  Pause GPU-persistent-storage roadmap and reassess.");
    }
  }

  console.log("");

  return allResults;
}

export { runBenchmark };

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark().catch(console.error);
}
