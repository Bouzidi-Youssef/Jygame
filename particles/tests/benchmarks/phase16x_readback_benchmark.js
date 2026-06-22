// Readback cost benchmark
//
// Measures independent stages of compute dispatch:
//   Upload      — writeBuffer for particle data
//   Dispatch    — compute shader execution
//   Readback    — copy + mapAsync + read
//   DeathSweep  — CPU loop over active particles
//
// Run in a browser with WebGPU support.
// Usage:
//   import { runBenchmark } from "./phase16x_readback_benchmark.js";
//   await runBenchmark();

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { GpuParticleBackend } from "../../backends/GpuParticleBackend.js";
import { FadeModifier } from "../../../modifiers/FadeModifier.js";
import { VelocityModifier } from "../../../modifiers/VelocityModifier.js";
import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";
import { GpuComputeDispatcher } from "../../gpu/webgpu/GpuComputeDispatcher.js";
import { WgslGenerator } from "../../gpu/WgslGenerator.js";
import { ModifierCompiler } from "../../gpu/ModifierCompiler.js";

const DT = 1 / 60;

function createStorage(capacity) {
  return new SoAParticleStorage({ maxSize: capacity, initialSize: capacity });
}

function emitAll(backend, count) {
  const batchSize = Math.min(count, 1000);
  let emitted = 0;
  while (emitted < count) {
    const remaining = count - emitted;
    const n = Math.min(batchSize, remaining);
    backend.emit(n, (p) => {
      p.x = Math.random() * 500;
      p.y = Math.random() * 500;
      p.vx = (Math.random() - 0.5) * 100;
      p.vy = (Math.random() - 0.5) * 100;
      p.life = 5 + Math.random() * 5;
      p.maxLife = 5 + Math.random() * 5;
      p.size = 10 + Math.random() * 20;
      p.alpha = 1;
    });
    emitted += n;
  }
}

export async function runBenchmark({ renderer } = {}) {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    console.log("WebGPU not available — skipping benchmark");
    return;
  }

  await WebGpuDeviceManager.initialize();
  console.log("WebGPU initialized");

  const counts = [100, 1000, 10000, 50000];
  const samples = 5;

  for (const count of counts) {
    console.log(`\n--- ${count} particles ---`);

    const storage = createStorage(count);
    const backend = new GpuParticleBackend({ storage, mode: "operator", renderer });
    backend.addModifier(new FadeModifier({ mode: "out", easing: "linear" }));
    backend.addModifier(new VelocityModifier({ drag: 0.3 }));
    backend._rebuildProgram();

    // Set up compute dispatcher directly for measurement
    const compiler = new ModifierCompiler();
    const descriptors = [];
    for (const entry of backend._modifiers) {
      descriptors.push(entry.modifier.toDescriptor());
    }
    const programDesc = compiler.compile(descriptors);
    const gen = new WgslGenerator();
    const gpuProgram = gen.generate(programDesc);

    const dispatcher = new GpuComputeDispatcher();
    dispatcher.setProgram(gpuProgram);

    emitAll(backend, count);
    backend.update(DT); // warm up

    let totalUpload = 0;
    let totalDispatch = 0;
    let totalReadback = 0;
    let totalDeathSweep = 0;

    for (let s = 0; s < samples; s++) {
      // Upload
      const t0 = performance.now();
      dispatcher.ensureParticleBuffer(Math.max(1024, storage.capacity));
      dispatcher._particleBuffer.upload(storage);
      const t1 = performance.now();
      totalUpload += t1 - t0;

      // Uniform write + dispatch
      const uniforms = { dt: DT, elapsedTime: DT * (s + 1), particleCount: count };
      dispatcher._uniformBuffer.write(uniforms);

      const workgroupSize = 64;
      const dispatchCount = Math.ceil(count / workgroupSize);
      const cmdEncoder = WebGpuDeviceManager.device().createCommandEncoder();
      const pass = cmdEncoder.beginComputePass();
      pass.setPipeline(dispatcher._pipeline);
      pass.setBindGroup(0, dispatcher._pipelineCache.getBindGroup(
        dispatcher._bindGroupLayout,
        dispatcher._particleBuffer,
        dispatcher._uniformBuffer,
      ));
      pass.dispatchWorkgroups(dispatchCount);
      pass.end();
      const t2 = performance.now();

      // Submit + readback
      const readbackEncoder = WebGpuDeviceManager.device().createCommandEncoder();
      readbackEncoder.copyBufferToBuffer(
        dispatcher._particleBuffer.buffer, 0,
        dispatcher._particleBuffer._stagingBuffer, 0,
        dispatcher._particleBuffer.byteSize,
      );
      WebGpuDeviceManager.queue().submit([cmdEncoder.finish(), readbackEncoder.finish()]);
      const t3 = performance.now();

      await dispatcher._particleBuffer._stagingBuffer.mapAsync(GPUMapMode.READ);
      const mapped = new Float32Array(dispatcher._particleBuffer._stagingBuffer.getMappedRange());
      const active = storage.activeParticles;
      const ac = active.length;

      for (let i = 0; i < ac; i++) {
        for (let f = 0; f < 17; f++) {
          const val = mapped[i * 17 + f];
          // In real use, we'd call storage.setFieldValue — skip for benchmark
        }
      }
      dispatcher._particleBuffer._stagingBuffer.unmap();
      const t4 = performance.now();
      totalReadback += t4 - t3;
      totalDispatch += t3 - t1;

      // Death sweep
      let di = 0;
      const accessors = storage.activeParticles;
      while (di < accessors.length) {
        if (storage.getFieldValue(di, "life") <= 0) {
          storage.release(accessors[di]);
        } else {
          di++;
        }
      }
      const t5 = performance.now();
      totalDeathSweep += t5 - t4;
    }

    console.log(`  Upload:      ${(totalUpload / samples).toFixed(3)} ms`);
    console.log(`  Dispatch:    ${(totalDispatch / samples).toFixed(3)} ms`);
    console.log(`  Readback:    ${(totalReadback / samples).toFixed(3)} ms`);
    console.log(`  DeathSweep:  ${(totalDeathSweep / samples).toFixed(3)} ms`);
    console.log(`  Total:       ${((totalUpload + totalDispatch + totalReadback + totalDeathSweep) / samples).toFixed(3)} ms`);

    dispatcher.destroy();
    backend.destroy();
  }

  console.log("\nBenchmark complete.");
}
