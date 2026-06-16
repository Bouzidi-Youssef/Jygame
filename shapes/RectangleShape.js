import { EmitterShape } from "./EmitterShape.js";

export class RectangleShape extends EmitterShape {
  constructor(width, height) {
    super();
    if (width <= 0 || height <= 0) {
      throw new Error("RectangleShape width and height must be > 0");
    }
    this._width = width;
    this._height = height;
  }

  sample(particle) {
    particle.x = Math.random() * this._width - this._width / 2 + this.x;
    particle.y = Math.random() * this._height - this._height / 2 + this.y;
  }
}
