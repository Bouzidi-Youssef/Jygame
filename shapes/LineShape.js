import { EmitterShape } from "./EmitterShape.js";

export class LineShape extends EmitterShape {
  constructor(x1, y1, x2, y2, options) {
    super();

    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      throw new Error("LineShape coordinates must be finite numbers");
    }

    this._x1 = x1;
    this._y1 = y1;
    this._dx = x2 - x1;
    this._dy = y2 - y1;
    this._baseAngle = Math.atan2(this._dy, this._dx);

    if (options?.direction !== undefined) {
      this._setDirection(
        ["along", "reverse", "perpendicular", "perpendicularReverse"],
        options.direction,
        options.speed,
        options.spread
      );
    }
  }

  sample(particle) {
    const t = Math.random();
    particle.x = this._x1 + this._dx * t + this._x;
    particle.y = this._y1 + this._dy * t + this._y;

    if (this._direction) {
      let velAngle;
      switch (this._direction) {
        case "along":
          velAngle = this._baseAngle;
          break;
        case "reverse":
          velAngle = this._baseAngle + Math.PI;
          break;
        case "perpendicular":
          velAngle = this._baseAngle - Math.PI / 2;
          break;
        case "perpendicularReverse":
          velAngle = this._baseAngle + Math.PI / 2;
          break;
      }
      this._writeVelocity(particle, velAngle);
    }
  }

  toJSON() {
    const x2 = this._x1 + this._dx;
    const y2 = this._y1 + this._dy;
    const obj = { type: "LineShape", x1: this._x1, y1: this._y1, x2, y2 };
    if (this._direction) {
      obj.direction = this._direction;
      obj.speed = this._speedMin === this._speedMax ? this._speedMin : [this._speedMin, this._speedMax];
      if (this._spread) obj.spread = this._spread;
    }
    return obj;
  }

  static fromJSON(data) {
    return new LineShape(data.x1, data.y1, data.x2, data.y2, data);
  }
}
