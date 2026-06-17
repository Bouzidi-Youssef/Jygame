export class TurbulenceModifier {
  static _nextId = 0;

  constructor({ strength = 50, frequency = 1, priority } = {}) {
    this._id = TurbulenceModifier._nextId++;

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

  _ensureState(particle) {
    if (!particle.__turbulenceStates) particle.__turbulenceStates = {};
    let state = particle.__turbulenceStates[this._id];
    if (!state) {
      state = { seed: 0 };
      particle.__turbulenceStates[this._id] = state;
    }
    return state;
  }

  onEmit(particle) {
    this._ensureState(particle).seed = Math.random() * 100000;
  }

  beginFrame(dt) {
    this._time += dt * this._frequency;
  }

  update(particle, dt) {
    const seed = this._ensureState(particle).seed;
    const t = this._time;
    particle.vx += Math.sin(seed + t) * this._strength * dt;
    particle.vy += Math.cos(seed + t * 1.31) * this._strength * dt;
  }
}
