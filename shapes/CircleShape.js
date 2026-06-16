import { EmitterShape } from "./EmitterShape.js";

export class CircleShape extends EmitterShape {
  constructor(radius) {
    super();
    if (radius <= 0) {
      throw new Error("CircleShape radius must be > 0");
    }
    this._radius = radius;
    this._tau = Math.PI * 2;
  }

  sample(particle) {
    const r = Math.sqrt(Math.random()) * this._radius;
    const angle = Math.random() * this._tau;
    particle.x = Math.cos(angle) * r + this.x;
    particle.y = Math.sin(angle) * r + this.y;
  }
}
