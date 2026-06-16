import { EmitterShape } from "./EmitterShape.js";

export class RingShape extends EmitterShape {
  constructor(innerRadius, outerRadius) {
    super();
    if (innerRadius <= 0 || outerRadius <= 0) {
      throw new Error("RingShape radii must be > 0");
    }
    if (outerRadius <= innerRadius) {
      throw new Error("RingShape outerRadius must be > innerRadius");
    }
    this._innerSq = innerRadius * innerRadius;
    this._areaRange = outerRadius * outerRadius - this._innerSq;
    this._tau = Math.PI * 2;
  }

  sample(particle) {
    const r = Math.sqrt(Math.random() * this._areaRange + this._innerSq);
    const angle = Math.random() * this._tau;
    particle.x = Math.cos(angle) * r + this.x;
    particle.y = Math.sin(angle) * r + this.y;
  }
}
