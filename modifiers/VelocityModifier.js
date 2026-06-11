export class VelocityModifier {
  constructor({ drag = 0 } = {}) {
    this._drag = Math.max(0, drag);
  }

  update(particle, dt) {
    const factor = Math.max(0, 1 - this._drag * dt);
    particle.vx *= factor;
    particle.vy *= factor;
  }
}
