export class ScaleModifier {
  constructor({ from = 1, to = 0 } = {}) {
    this._from = from;
    this._diff = to - from;
  }

  update(particle, dt) {
    particle.size = this._from + this._diff * particle.ageRatio;
  }
}
