import { WebGpuDeviceManager } from "./WebGpuDeviceManager.js";
import { ParticleBufferLayout } from "../ParticleBufferLayout.js";

const STRIDE = ParticleBufferLayout.STRIDE;
const ALIVE_INDEX = ParticleBufferLayout.indexOf("alive");

const EXTRACTION_SHADER = `
@group(0) @binding(0) var<storage, read> particleData : array<f32>;
@group(0) @binding(1) var<storage, read_write> aliveFlags : array<u32>;

const STRIDE = ${STRIDE}u;
const ALIVE_OFFSET = ${ALIVE_INDEX}u;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= arrayLength(&aliveFlags)) { return; }
  let alive = particleData[index * STRIDE + ALIVE_OFFSET];
  aliveFlags[index] = select(0u, 1u, alive > 0.5);
}
`;

export class GpuAliveFlagManager {
  constructor(capacity) {
    this._device = WebGpuDeviceManager.device();
    this._capacity = capacity;
    this._aliveBuffer = null;
    this._stagingBuffer = null;
    this._pipeline = null;
    this._pipelineLayout = null;
    this._bindGroupLayout = null;
    this._bindGroup = null;
    this._boundParticleBuffer = null;
    this._readbackPromise = null;
    this._allocate(capacity);
  }

  _allocate(capacity) {
    const device = this._device;
    const byteSize = capacity * 4;

    const oldAlive = this._aliveBuffer;
    const oldStaging = this._stagingBuffer;

    this._aliveBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: `GpuAlive_${capacity}`,
    });

    this._stagingBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: `GpuAliveStaging_${capacity}`,
    });

    this._capacity = capacity;
    this._bindGroup = null;

    // Defer destruction so in-flight GPU commands complete first
    if (oldAlive || oldStaging) {
      device.queue.onSubmittedWorkDone().then(() => {
        if (oldStaging) {
          try { oldStaging.unmap(); } catch {}
          oldStaging.destroy();
        }
        if (oldAlive) oldAlive.destroy();
      });
    }
  }

  _ensurePipeline() {
    if (this._pipeline) return;
    const device = this._device;

    const shaderModule = device.createShaderModule({ code: EXTRACTION_SHADER });

    this._bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    this._pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._bindGroupLayout],
    });

    this._pipeline = device.createComputePipeline({
      layout: this._pipelineLayout,
      compute: { module: shaderModule, entryPoint: "main" },
    });
  }

  _ensureBindGroup(particleBuffer) {
    if (this._bindGroup && this._boundParticleBuffer === particleBuffer) return;
    this._ensurePipeline();

    this._bindGroup = this._device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: particleBuffer } },
        { binding: 1, resource: { buffer: this._aliveBuffer } },
      ],
    });
    this._boundParticleBuffer = particleBuffer;
  }

  ensureReady(particleBuffer) {
    this._ensurePipeline();
    this._ensureBindGroup(particleBuffer);
  }

  get pipeline() { return this._pipeline; }
  get bindGroup() { return this._bindGroup; }
  get aliveBuffer() { return this._aliveBuffer; }
  get stagingBuffer() { return this._stagingBuffer; }

  extract(particleBuffer) {
    this.ensureReady(particleBuffer);
    const encoder = this._device.createCommandEncoder();

    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.dispatchWorkgroups(Math.ceil(this._capacity / 256));
    pass.end();

    encoder.copyBufferToBuffer(
      this._aliveBuffer, 0,
      this._stagingBuffer, 0,
      this._capacity * 4,
    );

    this._device.queue.submit([encoder.finish()]);
  }

  async readAliveFlags() {
    const chain = async () => {
      await this._stagingBuffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint32Array(this._stagingBuffer.getMappedRange());
      const result = new Uint8Array(mapped.length);
      for (let i = 0; i < mapped.length; i++) {
        result[i] = mapped[i];
      }
      this._stagingBuffer.unmap();
      return result;
    };
    const prev = this._readbackPromise;
    const next = (prev || Promise.resolve()).then(
      () => chain(),
      () => chain(),
    );
    this._readbackPromise = next.then(
      (r) => { if (this._readbackPromise === next) this._readbackPromise = null; return r; },
      () => { if (this._readbackPromise === next) this._readbackPromise = null; return new Uint8Array(this._capacity); },
    );
    return this._readbackPromise;
  }

  resize(newCapacity) {
    if (newCapacity <= this._capacity) return;
    this._allocate(newCapacity);
  }

  destroy() {
    if (this._aliveBuffer) { this._aliveBuffer.destroy(); this._aliveBuffer = null; }
    if (this._stagingBuffer) {
      try { this._stagingBuffer.unmap(); } catch {}
      this._stagingBuffer.destroy();
      this._stagingBuffer = null;
    }
    this._bindGroup = null;
    this._boundParticleBuffer = null;
  }

  get capacity() { return this._capacity; }
  get buffer() { return this._aliveBuffer; }
}
