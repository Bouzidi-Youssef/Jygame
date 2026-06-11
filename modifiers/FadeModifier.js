export class FadeModifier {
  constructor({ mode = "out" } = {}) {
    this._mode = mode;
  }

  update(particle, dt) {
    let alpha;
    if (this._mode === "in") {
      alpha = particle.ageRatio;
    } else if (this._mode === "in-out") {
      alpha = particle.ageRatio < 0.5
        ? particle.ageRatio * 2
        : (1 - particle.ageRatio) * 2;
    } else {
      alpha = 1 - particle.ageRatio;
    }
    particle.alpha = Math.max(0, Math.min(1, alpha));
  }
}
