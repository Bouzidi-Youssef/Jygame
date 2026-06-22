import { WebGpuDeviceManager } from "./WebGpuDeviceManager.js";
import { GpuComputePipelineCache } from "./GpuComputePipelineCache.js";
import { GpuParticleBuffer } from "./GpuParticleBuffer.js";
import { GpuAliveFlagManager } from "./GpuAliveFlagManager.js";
import { GpuUniformBuffer } from "./GpuUniformBuffer.js";
import { toWebGpuWgsl } from "./WebGpuWgslConverter.js";

export class GpuComputeDispatcher {
  constructor({ gpuPersistentUpload = false } = {}) {
    this._device = WebGpuDeviceManager.device();
    this._pipelineCache = new GpuComputePipelineCache();
    this._particleBuffer = null;
    this._aliveManager = null;
    this._uniformBuffer = new GpuUniformBuffer();
    this._program = null;
    this._wgslSource = null;
    this._gpuPersistentUpload = gpuPersistentUpload;
    this._bufferSeeded = false;
  }

  setProgram(program) {
    const rawWgsl = program.shaderSource;
    const converted = toWebGpuWgsl(rawWgsl);
    this._wgslSource = converted;

    this._program = Object.assign(Object.create(Object.getPrototypeOf(program)), program);
    this._program.shaderSource = converted;
    this._program.hash = rawWgsl;

    const module = this._pipelineCache.getShaderModule(this._program);
    const bindGroupLayout = this._pipelineCache.getBindGroupLayout(this._program);
    const pipeline = this._pipelineCache.getPipeline(this._program, bindGroupLayout);
    this._pipeline = pipeline;
    this._bindGroupLayout = bindGroupLayout;
  }

  ensureParticleBuffer(capacity) {
    if (!this._particleBuffer) {
      this._particleBuffer = new GpuParticleBuffer(capacity);
      if (this._gpuPersistentUpload) this._bufferSeeded = false;
    } else if (capacity > this._particleBuffer.capacity) {
      // Replace entire buffer object to avoid destroy-while-in-flight races
      this._particleBuffer = new GpuParticleBuffer(capacity);
      if (this._gpuPersistentUpload) this._bufferSeeded = false;
      this._computeBindGroup = null;
    }
  }

  ensureAliveBuffer(capacity) {
    if (!this._aliveManager) {
      this._aliveManager = new GpuAliveFlagManager(capacity);
    } else if (capacity > this._aliveManager.capacity) {
      this._aliveManager.resize(capacity);
    }
  }

  _seedBuffer(storage) {
    if (!this._gpuPersistentUpload || this._bufferSeeded) return;
    this._particleBuffer.uploadFromStorage(storage);
    this._bufferSeeded = true;
  }

  _submitCompute(count) {
    const workgroupSize = 64;
    const dispatchCount = Math.ceil(count / workgroupSize);
    const commandEncoder = this._device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._computeBindGroup);
    pass.dispatchWorkgroups(dispatchCount);
    pass.end();

    if (this._aliveManager) {
      this._aliveManager.ensureReady(this._particleBuffer.buffer);
      const alivePass = commandEncoder.beginComputePass();
      alivePass.setPipeline(this._aliveManager.pipeline);
      alivePass.setBindGroup(0, this._aliveManager.bindGroup);
      alivePass.dispatchWorkgroups(Math.ceil(this._aliveManager.capacity / 256));
      alivePass.end();

      commandEncoder.copyBufferToBuffer(
        this._aliveManager.aliveBuffer, 0,
        this._aliveManager.stagingBuffer, 0,
        this._aliveManager.capacity * 4,
      );
    }

    this._device.queue.submit([commandEncoder.finish()]);
  }

  _ensureComputeBindGroup() {
    if (this._computeBindGroup) return;
    this._computeBindGroup = this._pipelineCache.getBindGroup(
      this._bindGroupLayout,
      this._particleBuffer,
      this._uniformBuffer,
    );
  }

  dispatchOnly(storage, uniforms) {
    const count = storage.activeCount;
    if (count === 0) return 0;

    this.ensureParticleBuffer(Math.max(1024, storage.capacity));

    if (this._gpuPersistentUpload) {
      this._seedBuffer(storage);
    } else {
      this._particleBuffer.upload(storage);
    }
    this._uniformBuffer.write({ ...uniforms, particleCount: count });

    this._ensureComputeBindGroup();
    this._submitCompute(count);

    return count;
  }

  // Queue asynchronous alive flag readback. Returns Promise<Uint8Array>.
  readAliveFlags() {
    if (!this._aliveManager) return Promise.resolve(new Uint8Array(0));
    return this._aliveManager.readAliveFlags();
  }

  async dispatch(storage, uniforms) {
    if (this._pendingDispatch) {
      await this._pendingDispatch;
    }

    const count = storage.activeCount;
    if (count === 0) return 0;

    this.ensureParticleBuffer(Math.max(1024, storage.capacity));

    if (this._gpuPersistentUpload) {
      this._seedBuffer(storage);
    } else {
      this._particleBuffer.upload(storage);
    }
    this._uniformBuffer.write({ ...uniforms, particleCount: count });

    this._ensureComputeBindGroup();
    this._submitCompute(count);

    this._pendingDispatch = this._particleBuffer.download(storage);
    try {
      await this._pendingDispatch;
      return count;
    } finally {
      this._pendingDispatch = null;
    }
  }

  writeSlot(slotIndex, storage) {
    if (!this._particleBuffer) return;
    this._particleBuffer.writeSlot(slotIndex, storage);
  }

  writeSlots(slotIndices, storage) {
    if (!this._particleBuffer || slotIndices.length === 0) return;
    this._particleBuffer.writeSlots(slotIndices, storage);
  }

  get gpuBuffer() {
    return this._particleBuffer ? this._particleBuffer.buffer : null;
  }

  get uniformBuffer() {
    return this._uniformBuffer;
  }

  get persistentUpload() { return this._gpuPersistentUpload; }

  get particleBuffer() { return this._particleBuffer; }

  releaseState(particle) {
  }

  releaseStateById(id) {
  }

  releaseAll() {
  }

  destroy() {
    if (this._particleBuffer) {
      this._particleBuffer.destroy();
      this._particleBuffer = null;
    }
    if (this._aliveManager) {
      this._aliveManager.destroy();
      this._aliveManager = null;
    }
    if (this._uniformBuffer) {
      this._uniformBuffer.destroy();
      this._uniformBuffer = null;
    }
    this._pipelineCache.destroy();
    this._pipeline = null;
    this._bindGroupLayout = null;
    this._computeBindGroup = null;
    this._program = null;
  }
}
