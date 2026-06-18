import { EmitterShape } from "./EmitterShape.js";

const RECT_ANGLES = {
  up: -Math.PI / 2,
  down: Math.PI / 2,
  left: Math.PI,
  right: 0
};

export class RectangleShape extends EmitterShape {
  constructor(param1, param2) {
    super();

    let width, height, direction, speed, spread;

    if (typeof param1 === "object" && param1 !== null) {
      width = param1.width;
      height = param1.height;
      direction = param1.direction;
      speed = param1.speed;
      spread = param1.spread;
    } else {
      width = param1;
      height = param2;
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("RectangleShape width and height must be finite numbers > 0");
    }

    this._width = width;
    this._height = height;
    this._halfWidth = width * 0.5;
    this._halfHeight = height * 0.5;

    if (direction !== undefined) {
      this._setDirection(
        ["up", "down", "left", "right"],
        direction,
        speed,
        spread
      );
    }
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  sample(particle) {
    particle.x = Math.random() * this._width - this._halfWidth + this._x;
    particle.y = Math.random() * this._height - this._halfHeight + this._y;

    if (this._direction) {
      this._writeVelocity(particle, RECT_ANGLES[this._direction]);
    }
  }

  toJSON() {
    const obj = { type: "RectangleShape", width: this._width, height: this._height };
    if (this._direction) {
      obj.direction = this._direction;
      obj.speed = this._speedMin === this._speedMax ? this._speedMin : [this._speedMin, this._speedMax];
      if (this._spread) obj.spread = this._spread;
    }
    return obj;
  }

  static fromJSON(data) {
    return new RectangleShape(data);
  }
}
