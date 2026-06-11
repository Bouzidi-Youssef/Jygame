export class VelocityModifier {
  constructor({ drag = 0, affectX = true, affectY = true } = {}) {
    this._drag = Math.max(0, drag);
    this._affectX = affectX;
    this._affectY = affectY;
    this._factor = 1;
  }

  prepare(dt) {
    this._factor = Math.exp(-this._drag * dt);
  }

  update(particle, dt) {
    if (this._affectX) particle.vx *= this._factor;
    if (this._affectY) particle.vy *= this._factor;
  }
}
