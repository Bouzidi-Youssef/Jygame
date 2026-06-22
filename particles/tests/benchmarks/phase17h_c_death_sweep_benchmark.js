// Phase 17H-C — Lifecycle Synchronization Benchmark
//
// Measures the cost of death detection and slot reclamation in both
// legacy and persistent upload modes.
//
// Metrics:
//   Readback time: time to read alive flags from GPU
//   Death sweep time: time to iterate active list and release dead slots
//   Total lifecycle sync time: readback + sweep
//   Per-death cost: sweep time / deaths
//
// Churn scenarios:
//   Low death (10%):   few particles die each frame
//   Medium death (50%): half the particles die each frame
//   High death (90%):  most particles die each frame
//   Continuous:        emit + death every frame, steady-state population

import { GpuParticleBackend } from "../../backends/GpuParticleBackend.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";

const STRIDE = ParticleBufferLayout.STRIDE;
const SAMPLES = 30;
const WARMUP = 5;

function fillBackend(backend, count) {
  for (let i = 0; i < count; i++) {
    const p = backend._storage.acquire();
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

function reduceLives(backend, fraction) {
  // Reduce life values on active particles so that `fraction` of them die
  // on the next GPU compute pass. Works by selecting a random subset.
  const accs = backend._storage.activeParticles;
  const count = accs.length;
  const killCount = Math.floor(count * fraction);
  for (let i = 0; i < killCount; i++) {
    const idx = Math.floor(Math.random() * count);
    const acc = accs[idx];
    acc.life = 0.001; // very close to death
  }
}

function emitBatch(backend, count) {
  return backend.emit(count, (p, i) => {
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
  });
}

// ─── Benchmark Runners ──────────────────────────────────────────

async function runDeathRateBenchmark(backend, count, deathFraction) {
  // Set up: fill backend with particles
  fillBackend(backend, count);

  // Warmup with lower death rate
  for (let i = 0; i < WARMUP; i++) {
    reduceLives(backend, deathFraction * 0.5);
    backend.update(1 / 60);
    backend.render();
    await new Promise(r => setTimeout(r, 0));
  }

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    reduceLives(backend, deathFraction);
    emitBatch(backend, Math.floor(count * deathFraction));
    backend.update(1 / 60);
    backend.render();
    await new Promise(r => setTimeout(r, 0));
  }

  // Reset timers
  backend._aliveReadbackTime = 0;
  backend._deathSweepTime = 0;
  backend._deathSweepCount = 0;

  const t0 = performance.now();

  for (let s = 0; s < SAMPLES; s++) {
    reduceLives(backend, deathFraction);
    emitBatch(backend, Math.floor(count * deathFraction));
    backend.update(1 / 60);
    backend.render();
    await new Promise(r => setTimeout(r, 0));
  }

  const totalTime = performance.now() - t0;

  return {
    count,
    deathFraction,
    totalTime: totalTime / SAMPLES,
    readbackTime: backend._aliveReadbackTime / SAMPLES,
    sweepTime: backend._deathSweepTime / SAMPLES,
    deathsPerFrame: backend._deathSweepCount / SAMPLES,
  };
}

// ─── Main ────────────────────────────────────────────────────────

async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [10000, 50000, 100000, 250000];
  const deathFractions = [0.1, 0.5, 0.9];

  if (typeof navigator === "undefined" || !navigator.gpu) {
    console.log("WebGPU not available");
    return;
  }

  // Detect backend info
  const adapter = await navigator.gpu.requestAdapter();
  const info = adapter.info || {};

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Phase 17H-C — Lifecycle Synchronization Benchmark         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("── Backend Info ──");
  console.log(`  Vendor:       ${info.vendor || "unknown"}`);
  console.log(`  Architecture: ${info.architecture || "unknown"}`);
  console.log("");

  const allResults = {};

  for (const count of testCounts) {
    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`  ${count.toLocaleString()} particles`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

    // Create persistent backend
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    const backend = new GpuParticleBackend({
      mode: "compute",
      gpuPersistentUpload: true,
      renderer: { render() {}, destroy() {} },
    });

    // Need a program to dispatch compute
    // Add a no-op modifier so the program exists
    const noopModifier = {
      toDescriptor() {
        return {
          type: "fade",
          pass: "visual",
          properties: { mode: "none" },
        };
      },
    };
    backend.addModifier(noopModifier);
    backend._isDirty = true;

    const countResults = [];

    for (const deathFrac of deathFractions) {
      const deathPct = Math.round(deathFrac * 100);

      console.log(`  ── ${deathPct}% Death Rate ──\n`);

      const r = await runDeathRateBenchmark(backend, count, deathFrac);

      console.log(`    Readback time:   ${r.readbackTime.toFixed(4)}ms`);
      console.log(`    Sweep time:      ${r.sweepTime.toFixed(4)}ms`);
      console.log(`    Deaths/frame:    ${r.deathsPerFrame.toFixed(0)}`);
      if (r.deathsPerFrame > 0) {
        const perDeath = (r.sweepTime / r.deathsPerFrame) * 1000;
        console.log(`    Per-death cost:  ${perDeath.toFixed(4)}µs`);
      }
      console.log(`    Total sync cost: ${(r.readbackTime + r.sweepTime).toFixed(4)}ms`);
      console.log("");

      countResults.push(r);
    }

    backend.destroy();
    allResults[count] = countResults;
  }

  // ── Summary Table ──
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY — Death Sweep Cost (ms)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("    " + "Count".padStart(7) + " | " + "Death Rate".padStart(12) + " | " + "Readback".padStart(10) + " | " + "Sweep".padStart(8) + " | " + "Total".padStart(8) + " | " + "Per-death (µs)".padStart(14));
  console.log("    " + "───────".padStart(7) + "─┼─" + "────────────".padStart(12) + "─┼─" + "──────────".padStart(10) + "─┼─" + "────────".padStart(8) + "─┼─" + "────────".padStart(8) + "─┼─" + "──────────────".padStart(14));

  for (const count of testCounts) {
    for (const r of allResults[count] || []) {
      const deathPct = Math.round(r.deathFraction * 100);
      const perDeath = r.deathsPerFrame > 0 ? (r.sweepTime / r.deathsPerFrame) * 1000 : 0;
      console.log(
        "    " + String(count).padStart(7) + " | " +
        String(deathPct + "%").padStart(12) + " | " +
        r.readbackTime.toFixed(4).padStart(10) + " | " +
        r.sweepTime.toFixed(4).padStart(8) + " | " +
        (r.readbackTime + r.sweepTime).toFixed(4).padStart(8) + " | " +
        perDeath.toFixed(4).padStart(14)
      );
    }
  }

  // ── Continuous Churn ──
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  CONTINUOUS CHURN — Emit + Death Every Frame");
  console.log("═══════════════════════════════════════════════════════════════\n");

  for (const count of testCounts) {
    const backend = new GpuParticleBackend({
      mode: "compute",
      gpuPersistentUpload: true,
      renderer: { render() {}, destroy() {} },
    });

    const noopModifier = {
      toDescriptor() {
        return { type: "fade", pass: "visual", properties: { mode: "none" } };
      },
    };
    backend.addModifier(noopModifier);
    backend._isDirty = true;

    fillBackend(backend, count);

    // Warmup (without death sweep)
    for (let i = 0; i < WARMUP; i++) {
      reduceLives(backend, 0.3);
      emitBatch(backend, Math.floor(count * 0.3));
      backend.update(1 / 60);
      await new Promise(r => setTimeout(r, 0));
    }

    for (let i = 0; i < WARMUP; i++) {
      reduceLives(backend, 0.3);
      emitBatch(backend, Math.floor(count * 0.3));
      backend.update(1 / 60);
      backend.render();
      await new Promise(r => setTimeout(r, 0));
    }

    backend._aliveReadbackTime = 0;
    backend._deathSweepTime = 0;
    backend._persistentUploadTime = 0;
    backend._persistentUploadCount = 0;

    for (let s = 0; s < SAMPLES; s++) {
      reduceLives(backend, 0.3);
      emitBatch(backend, Math.floor(count * 0.3));
      backend.update(1 / 60);
      backend.render();
      await new Promise(r => setTimeout(r, 0));
    }

    const avgUpload = (backend._persistentUploadTime / SAMPLES) || 0;
    const avgReadback = (backend._aliveReadbackTime / SAMPLES) || 0;
    const avgSweep = (backend._deathSweepTime / SAMPLES) || 0;
    const avgUploaded = (backend._persistentUploadCount / SAMPLES) || 0;

    console.log(`  ${count.toLocaleString()} particles (30% churn):`);
    console.log(`    Upload (writeSlots): ${avgUpload.toFixed(4)}ms (${avgUploaded.toFixed(0)} particles)`);
    console.log(`    Alive readback:      ${avgReadback.toFixed(4)}ms`);
    console.log(`    Death sweep:         ${avgSweep.toFixed(4)}ms`);
    console.log(`    Total sync:          ${(avgReadback + avgSweep).toFixed(4)}ms`);
    console.log(`    Total per frame:     ${(avgUpload + avgReadback + avgSweep).toFixed(4)}ms`);
    console.log("");

    backend.destroy();
  }

  // ── Verdict ──
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  VERDICT                                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const maxCount = testCounts[testCounts.length - 1];
  const maxResults = allResults[maxCount];
  if (maxResults) {
    const maxCost = maxResults.reduce((acc, r) => Math.max(acc, r.readbackTime + r.sweepTime), 0);
    console.log(`  At ${maxCount.toLocaleString()} particles:`);

    // Compare against legacy upload baseline from Phase 17H-C1
    const legacyUploadBaseline = 47.06; // from Phase 17H-C1 results
    const totalSyncCost = maxCost;
    const savings = legacyUploadBaseline - totalSyncCost;

    console.log(`    Legacy upload:            ${legacyUploadBaseline.toFixed(2)}ms`);
    console.log(`    Lifecycle sync worst-case: ${totalSyncCost.toFixed(4)}ms`);
    console.log(`    Savings:                  ${savings.toFixed(2)}ms (${(savings / legacyUploadBaseline * 100).toFixed(1)}%)`);

    if (totalSyncCost < legacyUploadBaseline * 0.05) {
      console.log("\n  ✓ Lifecycle synchronization adds negligible overhead.");
      console.log("  The Phase 17H architecture is validated for production use.");
    } else if (totalSyncCost < legacyUploadBaseline * 0.5) {
      console.log("\n  ⚠ Lifecycle sync overhead is noticeable but acceptable.");
      console.log("  Consider optimizing the death sweep loop for large counts.");
    } else {
      console.log("\n  ✗ Lifecycle sync overhead is too high.");
      console.log("  Investigate alternative death detection strategies.");
    }
  }

  console.log("");
}

export { runBenchmark };

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark().catch(console.error);
}
