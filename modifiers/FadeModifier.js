import { EASINGS } from "./easing.js";

export class FadeModifier {
  constructor({ mode = "out", easing = "linear" } = {}) {
    this._mode = mode;
    this._ease = EASINGS[easing] || EASINGS.linear;
  }

  update(particle, dt) {
    const t = this._ease(particle.ageRatio);
    let alpha;
    if (this._mode === "in") {
      alpha = t;
    } else if (this._mode === "in-out") {
      alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
    } else {
      alpha = 1 - t;
    }
    particle.alpha = alpha;
  }
}
