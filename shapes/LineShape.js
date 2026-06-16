import { EmitterShape } from "./EmitterShape.js";

export class LineShape extends EmitterShape {
  constructor(x1, y1, x2, y2) {
    super();
    this._x1 = x1;
    this._y1 = y1;
    this._dx = x2 - x1;
    this._dy = y2 - y1;
  }

  sample(particle) {
    const t = Math.random();
    particle.x = this._x1 + this._dx * t + this.x;
    particle.y = this._y1 + this._dy * t + this.y;
  }
}
