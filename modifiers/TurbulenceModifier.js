export class TurbulenceModifier {
  constructor({ strength = 50, frequency = 1, priority } = {}) {
    if (!Number.isFinite(strength) || strength < 0) {
      throw new Error("TurbulenceModifier strength must be a non-negative finite number");
    }
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new Error("TurbulenceModifier frequency must be a finite number > 0");
    }
    this._strength = strength;
    this._frequency = frequency;
    this._time = 0;
    this.enabled = true;
    this.priority = priority;
  }

  onEmit(particle) {
    particle.__jygameTurbulenceSeed = Math.random() * 100000;
  }

  beginFrame(dt) {
    this._time += dt * this._frequency;
  }

  update(particle, dt) {
    const seed = particle.__jygameTurbulenceSeed;
    const t = this._time;
    particle.vx += Math.sin(seed + t) * this._strength * dt;
    particle.vy += Math.cos(seed + t * 1.31) * this._strength * dt;
  }
}
