export class GpuUniformLayout {
  constructor({
    dt = 0,
    elapsedTime = 0,
    particleCount = 0,
    custom = {},
  } = {}) {
    this.dt = dt;
    this.elapsedTime = elapsedTime;
    this.particleCount = particleCount;
    this.custom = custom;
  }

  set(key, value) {
    if (key === "custom") {
      Object.assign(this.custom, value);
    } else if (key in this) {
      this[key] = value;
    } else {
      this.custom[key] = value;
    }
  }

  get(key) {
    if (key in this && key !== "custom") return this[key];
    return this.custom[key];
  }

  copy() {
    return new GpuUniformLayout({
      dt: this.dt,
      elapsedTime: this.elapsedTime,
      particleCount: this.particleCount,
      custom: { ...this.custom },
    });
  }

  toObject() {
    return {
      dt: this.dt,
      elapsedTime: this.elapsedTime,
      particleCount: this.particleCount,
      ...this.custom,
    };
  }
}
