import { EmitterShape } from "./EmitterShape.js";

export class RingShape extends EmitterShape {
  constructor(param1, param2) {
    super();

    let innerRadius, outerRadius, direction, speed, spread;

    if (typeof param1 === "object" && param1 !== null) {
      innerRadius = param1.innerRadius;
      outerRadius = param1.outerRadius;
      direction = param1.direction;
      speed = param1.speed;
      spread = param1.spread;
    } else {
      innerRadius = param1;
      outerRadius = param2;
    }

    if (!Number.isFinite(innerRadius) || !Number.isFinite(outerRadius) || innerRadius <= 0 || outerRadius <= 0) {
      throw new Error("RingShape radii must be finite numbers > 0");
    }
    if (outerRadius <= innerRadius) {
      throw new Error("RingShape outerRadius must be > innerRadius");
    }

    this._innerRadius = innerRadius;
    this._outerRadius = outerRadius;
    this._innerSq = innerRadius * innerRadius;
    this._areaRange = outerRadius * outerRadius - this._innerSq;
    this._tau = Math.PI * 2;

    if (direction !== undefined) {
      this._setDirection(
        ["outward", "inward", "clockwise", "counterclockwise"],
        direction,
        speed,
        spread
      );
    }
  }

  get innerRadius() {
    return this._innerRadius;
  }

  get outerRadius() {
    return this._outerRadius;
  }

  sample(particle) {
    const spawnAngle = Math.random() * this._tau;
    const r = Math.sqrt(Math.random() * this._areaRange + this._innerSq);
    particle.x = Math.cos(spawnAngle) * r + this._x;
    particle.y = Math.sin(spawnAngle) * r + this._y;

    if (this._direction) {
      this._writeVelocity(particle, this._getRadialDirectionAngle(this._direction, spawnAngle));
    }
  }

  toJSON() {
    const obj = { type: "RingShape", innerRadius: this._innerRadius, outerRadius: this._outerRadius };
    if (this._direction) {
      obj.direction = this._direction;
      obj.speed = this._speedMin === this._speedMax ? this._speedMin : [this._speedMin, this._speedMax];
      if (this._spread) obj.spread = this._spread;
    }
    return obj;
  }

  static fromJSON(data) {
    return new RingShape(data);
  }
}
