export class RotationModifier {
  constructor({ speed, from, to, randomStart = false, priority } = {}) {
    if (speed !== undefined) {
      this._mode = "velocity";
      this._speed = speed;
    } else if (from !== undefined && to !== undefined) {
      this._mode = "interpolate";
      this._from = from;
      this._to = to;
      this._diff = to - from;
    } else {
      throw new Error(
        "RotationModifier requires either `speed` (velocity mode) or `from` + `to` (interpolation mode)"
      );
    }

    this.enabled = true;
    this.priority = priority;
    this._randomStart = randomStart;
  }

  onEmit(particle) {
    if (this._randomStart) {
      particle.rotation = Math.random() * Math.PI * 2;
    }

    if (this._mode === "velocity") {
      particle.rotationSpeed = this._speed;
    }
  }

  update(particle, dt) {
    if (this._mode === "interpolate") {
      particle.rotation = this._from + this._diff * particle.ageRatio;
    }
  }
}
