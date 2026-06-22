import { WebGpuDeviceManager } from "./WebGpuDeviceManager.js";

// WGSL struct SimUniforms { dt: f32, elapsedTime: f32, particleCount: u32 }
// Aligned to 16 bytes (vec4<f32> equivalent)
const UNIFORM_SIZE = 16; // 3 fields padded to 16 bytes

export class GpuUniformBuffer {
  constructor() {
    this._device = WebGpuDeviceManager.device();
    this._buffer = this._device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "GpuUniformBuffer",
    });
    this._data = new Float32Array(4);
  }

  write(uniforms) {
    this._data[0] = uniforms.dt;
    this._data[1] = uniforms.elapsedTime;
    // particleCount is u32 but stored as f32 in the buffer — WGSL reads it as u32
    this._data[2] = uniforms.particleCount;
    this._device.queue.writeBuffer(this._buffer, 0, this._data.buffer, 0, UNIFORM_SIZE);
  }

  get buffer() { return this._buffer; }
  get size() { return UNIFORM_SIZE; }

  destroy() {
    if (this._buffer) { this._buffer.destroy(); this._buffer = null; }
  }
}
