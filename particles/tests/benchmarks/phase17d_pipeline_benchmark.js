// Phase 17D — Compute Pipeline Bottleneck Attribution
//
// Instruments each stage of the compute pipeline:
//
//   dispatchOnly (production):
//     Upload    — Float32Array fill + device.queue.writeBuffer
//     Dispatch  — command encoding + queue.submit (CPU overhead)
//     RenderEnc — bind group creation + render pass encoding
//     RenderSub — render queue.submit
//
//   readback (validation):
//     Upload     — Float32Array fill + writeBuffer
//     Dispatch   — command encoding + queue.submit (CPU)
//     ReadWait   — mapAsync (implicit GPU completion wait)
//     ReadParse  — read mapped buffer + setFieldValue to storage
//     DeathSweep — scan active + release dead particles
//
// Counts: 10k, 50k, 100k, 250k
// Churn:  low (life 3-8s), medium (life 0.5-3s), high (life 0.05-0.25s)

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";
import { GpuComputeDispatcher } from "../../gpu/webgpu/GpuComputeDispatcher.js";
import { WgslGenerator } from "../../gpu/WgslGenerator.js";
import { ModifierCompiler } from "../../gpu/ModifierCompiler.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";
import { FadeModifier } from "../../../modifiers/FadeModifier.js";
import { VelocityModifier } from "../../../modifiers/VelocityModifier.js";

const DT = 1 / 60;
const WARMUP = 5;
const SAMPLES = 30;
const STRIDE = ParticleBufferLayout.STRIDE; // 20
const LIFE_IDX = 6;
const ALIVE_IDX = 17;
const U32_SET = new Set([14, 15, 16, 17, 19]); // r, g, b, alive, segment

function makeStorage(cap) {
  return new SoAParticleStorage({ maxSize: cap, initialSize: cap });
}

function makeCompiler() {
  const fade = new FadeModifier({ mode: "out", easing: "linear" });
  const vel = new VelocityModifier({ drag: 0.3 });
  const compiler = new ModifierCompiler();
  const desc = [fade.toDescriptor(), vel.toDescriptor()];
  const prog = compiler.compile(desc);
  const gen = new WgslGenerator();
  return gen.generate(prog);
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

async function measureDispatchOnly(count, churn, renderer) {
  const [lo, hi] = churn === "high" ? [0.05, 0.25]
    : churn === "medium" ? [0.5, 3]
    : [3, 8];

  const storage = makeStorage(count + 100);
  fill(storage, count, lo, hi);

  const program = makeCompiler();
  const disp = new GpuComputeDispatcher();
  disp.setProgram(program);

  // warmup
  for (let i = 0; i < WARMUP; i++) {
    disp.dispatchOnly(storage, { dt: DT, elapsedTime: DT * (i + 1) });
    replenish(storage, count, lo, hi);
  }

  let sumUp = 0, sumDisp = 0, sumRenc = 0, n = 0;

  for (let s = 0; s < SAMPLES; s++) {
    replenish(storage, count, lo, hi);
    const pc = storage.activeCount;
    if (pc === 0) { fill(storage, count, lo, hi); continue; }

    const unif = { dt: DT, elapsedTime: DT * (s + WARMUP + 1), particleCount: pc };

    // Upload
    disp.ensureParticleBuffer(Math.max(1024, storage.capacity));
    const t0 = performance.now();
    disp._particleBuffer.upload(storage);
    const t1 = performance.now();

    // Dispatch
    disp._uniformBuffer.write(unif);
    disp._ensureComputeBindGroup();
    const t2 = performance.now();

    const dCount = Math.ceil(pc / 64);
    const dev = WebGpuDeviceManager.device();
    const ce = dev.createCommandEncoder();
    const pass = ce.beginComputePass();
    pass.setPipeline(disp._pipeline);
    pass.setBindGroup(0, disp._computeBindGroup);
    pass.dispatchWorkgroups(dCount);
    pass.end();
    dev.queue.submit([ce.finish()]);
    const t3 = performance.now();

    sumUp += t1 - t0;
    sumDisp += t3 - t2;
    n++;

    // Render (if available)
    if (renderer && renderer._initialized) {
      const t4 = performance.now();
      renderer.setParticleBuffer(disp._particleBuffer.buffer);
      renderer.render(pc, null);
      const t5 = performance.now();
      sumRenc += t5 - t4;
    }
  }

  disp.destroy();
  storage.destroy();
  return { upload: sumUp/n, dispatch: sumDisp/n, renderEnc: sumRenc/n, count, churn };
}

async function measureReadback(count, churn) {
  const [lo, hi] = churn === "high" ? [0.05, 0.25]
    : churn === "medium" ? [0.5, 3]
    : [3, 8];

  const storage = makeStorage(count + 100);
  fill(storage, count, lo, hi);

  const program = makeCompiler();
  const disp = new GpuComputeDispatcher();
  disp.setProgram(program);
  disp.ensureParticleBuffer(Math.max(1024, storage.capacity));
  const pb = disp._particleBuffer;

  // warmup
  for (let i = 0; i < WARMUP; i++) {
    pb.upload(storage);
    disp._uniformBuffer.write({ dt: DT, elapsedTime: DT * (i + 1), particleCount: storage.activeCount });
    disp._ensureComputeBindGroup();
    disp._submitCompute(storage.activeCount);

    // Manual readback + sweep
    const dev = WebGpuDeviceManager.device();
    const ce = dev.createCommandEncoder();
    ce.copyBufferToBuffer(pb.buffer, 0, pb._stagingBuffer, 0, pb.byteSize);
    dev.queue.submit([ce.finish()]);
    await pb._stagingBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new Float32Array(pb._stagingBuffer.getMappedRange());
    const ac = storage.activeCount;
    for (let j = 0; j < ac; j++) {
      storage.setFieldValue(j, "life", mapped[j * STRIDE + LIFE_IDX]);
      storage.setFieldValue(j, "alive", Math.round(mapped[j * STRIDE + ALIVE_IDX]));
    }
    pb._stagingBuffer.unmap();

    let di = 0;
    const accs = storage.activeParticles;
    while (di < accs.length) {
      if (storage.getFieldValue(di, "life") <= 0) storage.release(accs[di]);
      else di++;
    }
    replenish(storage, count, lo, hi);
  }

  let sumUp = 0, sumDisp = 0, sumRwait = 0, sumRparse = 0, sumSwp = 0, n = 0;

  for (let s = 0; s < SAMPLES; s++) {
    replenish(storage, count, lo, hi);
    const pc = storage.activeCount;
    if (pc === 0) { fill(storage, count, lo, hi); continue; }

    const unif = { dt: DT, elapsedTime: DT * (s + WARMUP + 1), particleCount: pc };
    const dev = WebGpuDeviceManager.device();

    // Upload
    const t0 = performance.now();
    pb.upload(storage);
    const t1 = performance.now();

    // Dispatch (encode + submit)
    disp._uniformBuffer.write(unif);
    disp._ensureComputeBindGroup();
    const t2 = performance.now();

    const dCount = Math.ceil(pc / 64);
    const ce1 = dev.createCommandEncoder();
    const pass = ce1.beginComputePass();
    pass.setPipeline(disp._pipeline);
    pass.setBindGroup(0, disp._computeBindGroup);
    pass.dispatchWorkgroups(dCount);
    pass.end();
    const t3 = performance.now();

    // Readback copy encode
    const ce2 = dev.createCommandEncoder();
    ce2.copyBufferToBuffer(pb.buffer, 0, pb._stagingBuffer, 0, pb.byteSize);
    const t4 = performance.now();

    // Submit both
    dev.queue.submit([ce1.finish(), ce2.finish()]);

    // mapAsync wait (GPU completion)
    await pb._stagingBuffer.mapAsync(GPUMapMode.READ);
    const t5 = performance.now();

    // Parse mapped data
    const mapped = new Float32Array(pb._stagingBuffer.getMappedRange());
    const ac = storage.activeCount;
    for (let j = 0; j < ac; j++) {
      const life = mapped[j * STRIDE + LIFE_IDX];
      const alive = Math.round(mapped[j * STRIDE + ALIVE_IDX]);
      storage.setFieldValue(j, "life", life);
      storage.setFieldValue(j, "alive", alive);
    }
    pb._stagingBuffer.unmap();
    const t6 = performance.now();

    // Death sweep
    let di = 0;
    const accs = storage.activeParticles;
    while (di < accs.length) {
      if (storage.getFieldValue(di, "life") <= 0) storage.release(accs[di]);
      else di++;
    }
    const t7 = performance.now();

    sumUp += t1 - t0;
    sumDisp += t3 - t2;
    sumRwait += t5 - t4;
    sumRparse += t6 - t5;
    sumSwp += t7 - t6;
    n++;
  }

  disp.destroy();
  storage.destroy();
  return { upload: sumUp/n, dispatch: sumDisp/n, readWait: sumRwait/n, readParse: sumRparse/n, sweep: sumSwp/n, count, churn };
}

export async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [10000, 50000, 100000, 250000];
  const churns = ["low", "medium", "high"];

  if (typeof navigator === "undefined" || !navigator.gpu) {
    console.log("WebGPU not available");
    return;
  }

  await WebGpuDeviceManager.initialize();
  console.log("Phase 17D — Compute Pipeline Bottleneck Attribution\n");

  let renderer = null;
  try {
    const { WebGpuParticleRenderer } = await import("../../renderers/webgpu/WebGpuParticleRenderer.js");
    const c = document.createElement("canvas");
    c.width = 800; c.height = 600;
    renderer = new WebGpuParticleRenderer({ canvas: c, device: WebGpuDeviceManager.device() });
    await renderer.initialize();
  } catch (e) {
    console.log("Renderer unavailable:", e.message, "(render timing skipped)\n");
  }

  const allDo = {};
  const allRb = {};

  for (const count of testCounts) {
    console.log(`── ${count.toLocaleString()} particles ──\n`);

    for (const churn of churns) {
      console.log(`  ${churn.toUpperCase()} churn:`);

      const doM = await measureDispatchOnly(count, churn, renderer);
      allDo[`${count}_${churn}`] = doM;
      const doTot = doM.upload + doM.dispatch + doM.renderEnc;
      const doPct = (v) => `(${(v/doTot*100).toFixed(1)}%)`;
      console.log(`    dispatchOnly: up=${doM.upload.toFixed(3)}${doPct(doM.upload)}  ` +
        `disp=${doM.dispatch.toFixed(3)}${doPct(doM.dispatch)}` +
        (doM.renderEnc > 0 ? `  renc=${doM.renderEnc.toFixed(3)}${doPct(doM.renderEnc)}` : ``) +
        `  total=${doTot.toFixed(3)}`);

      const rbM = await measureReadback(count, churn);
      allRb[`${count}_${churn}`] = rbM;
      const rbTot = rbM.upload + rbM.dispatch + rbM.readWait + rbM.readParse + rbM.sweep;
      const rbPct = (v) => `(${(v/rbTot*100).toFixed(1)}%)`;
      console.log(`    readback:    up=${rbM.upload.toFixed(3)}${rbPct(rbM.upload)}  ` +
        `disp=${rbM.dispatch.toFixed(3)}${rbPct(rbM.dispatch)}  ` +
        `wait=${rbM.readWait.toFixed(3)}${rbPct(rbM.readWait)}  ` +
        `parse=${rbM.readParse.toFixed(3)}${rbPct(rbM.readParse)}  ` +
        `sweep=${rbM.sweep.toFixed(3)}${rbPct(rbM.sweep)}  ` +
        `total=${rbTot.toFixed(3)}`);
    }
    console.log("");
  }

  if (renderer) renderer.destroy();

  // Summary tables
  console.log("\n═══════════════════════════════════════════════════");
  console.log("dispatchOnly — CPU-side costs only (GPU async)");
  console.log("═══════════════════════════════════════════════════");
  console.log("Count    | Churn   | Upload   | Dispatch | RenderEnc | Total");
  console.log("─────────┼─────────┼──────────┼──────────┼───────────┼────────");
  for (const count of testCounts) {
    for (const churn of churns) {
      const m = allDo[`${count}_${churn}`];
      console.log(
        String(count).padStart(7) + " | " +
        churn.padStart(7) + " | " +
        m.upload.toFixed(3).padStart(8) + " | " +
        m.dispatch.toFixed(3).padStart(8) + " | " +
        (m.renderEnc > 0 ? m.renderEnc.toFixed(3).padStart(9) : "    N/A   ") + " | " +
        (m.upload + m.dispatch + m.renderEnc).toFixed(3).padStart(7)
      );
    }
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("readback — includes GPU completion wait");
  console.log("═══════════════════════════════════════════════════");
  console.log("Count    | Churn   | Upload   | Dispatch | ReadWait | ReadParse| Sweep    | Total");
  console.log("─────────┼─────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────");
  for (const count of testCounts) {
    for (const churn of churns) {
      const m = allRb[`${count}_${churn}`];
      const tot = m.upload + m.dispatch + m.readWait + m.readParse + m.sweep;
      console.log(
        String(count).padStart(7) + " | " +
        churn.padStart(7) + " | " +
        m.upload.toFixed(3).padStart(8) + " | " +
        m.dispatch.toFixed(3).padStart(8) + " | " +
        m.readWait.toFixed(3).padStart(8) + " | " +
        m.readParse.toFixed(3).padStart(8) + " | " +
        m.sweep.toFixed(3).padStart(8) + " | " +
        tot.toFixed(3).padStart(7)
      );
    }
  }

  return { dispatchOnly: allDo, readback: allRb };
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Run in a browser with WebGPU support.");
  runBenchmark().catch(console.error);
}
