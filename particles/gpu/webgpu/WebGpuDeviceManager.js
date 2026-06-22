export class WebGpuDeviceManager {
  static _adapter = null;
  static _device = null;

  static async initialize() {
    if (this._device) return;
    if (!navigator.gpu) {
      throw new Error("WebGPU not available — navigator.gpu is undefined");
    }
    this._adapter = await navigator.gpu.requestAdapter();
    if (!this._adapter) {
      throw new Error("WebGPU not available — no adapter found");
    }
    const limits = this._adapter.limits;
    this._device = await this._adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
      },
    });
  }

  static device() {
    if (!this._device) {
      throw new Error("WebGPU not initialized — call WebGpuDeviceManager.initialize() first");
    }
    return this._device;
  }

  static adapter() {
    return this._adapter;
  }

  static queue() {
    return this.device().queue;
  }

  static isAvailable() {
    return typeof navigator !== "undefined" && navigator.gpu != null;
  }

  static destroy() {
    if (this._device) {
      this._device.destroy();
      this._device = null;
    }
    this._adapter = null;
  }
}
