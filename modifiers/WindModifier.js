export class WindModifier {
  constructor({ x = 0, y = 0, priority } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("WindModifier x and y must be finite numbers");
    }
    this._windX = x;
    this._windY = y;
    this._frameVX = 0;
    this._frameVY = 0;
    this.enabled = true;
    this.priority = priority;
  }

  beginFrame(dt) {
    this._frameVX = this._windX * dt;
    this._frameVY = this._windY * dt;
  }

  update(particle) {
    particle.vx += this._frameVX;
    particle.vy += this._frameVY;
  }
}
