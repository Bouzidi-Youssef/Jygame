import { EASINGS } from "./easing.js";

export class ScaleModifier {
  constructor({ mode, from, to, min, max, easing = "linear" } = {}) {
    if (mode === "in-out") {
      this._min = min !== undefined ? min : 0;
      this._max = max !== undefined ? max : 1;
    } else {
      this._from = from !== undefined ? from : 1;
      this._to = to !== undefined ? to : 0;
      this._diff = this._to - this._from;
    }
    this._mode = mode || null;
    this._ease = EASINGS[easing] || EASINGS.linear;
  }

  update(particle, dt) {
    const t = this._ease(particle.ageRatio);
    let size;
    if (this._mode === "in-out") {
      size = t < 0.5
        ? this._min + (this._max - this._min) * t * 2
        : this._min + (this._max - this._min) * (1 - t) * 2;
    } else {
      size = this._from + this._diff * t;
    }
    particle.size = Math.max(0, size);
  }
}
