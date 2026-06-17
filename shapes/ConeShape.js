import { EmitterShape } from "./EmitterShape.js";

export class ConeShape extends EmitterShape {
  constructor({ radius, angle, direction = 0, speed, spread } = {}) {
    super();

    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("ConeShape radius must be a finite number > 0");
    }

    if (!Number.isFinite(angle) || angle <= 0 || angle > Math.PI * 2) {
      throw new Error("ConeShape angle must be a finite number in (0, 2\u03c0]");
    }

    if (!Number.isFinite(direction)) {
      throw new Error("ConeShape direction must be a finite number");
    }

    this._radius = radius;
    this._angle = angle;
    this._coneDirection = direction;
    this._halfAngle = angle * 0.5;

    if (speed !== undefined) {
      if (Array.isArray(speed)) {
        if (speed.length !== 2) {
          throw new Error("ConeShape speed range must be [min, max]");
        }
        const [min, max] = speed;
        if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || max < min) {
          throw new Error("ConeShape speed range [min, max] must be finite numbers > 0 with max >= min");
        }
        this._speedMin = min;
        this._speedMax = max;
      } else {
        if (!Number.isFinite(speed) || speed <= 0) {
          throw new Error("ConeShape speed must be a finite number > 0");
        }
        this._speedMin = speed;
        this._speedMax = speed;
      }

      if (spread !== undefined) {
        if (!Number.isFinite(spread) || spread < 0) {
          throw new Error("ConeShape spread must be a non-negative finite number");
        }
        this._spread = spread;
      } else {
        this._spread = 0;
      }
    }
  }

  sample(particle) {
    const spawnAngle = this._coneDirection + (Math.random() - 0.5) * this._angle;
    const r = Math.sqrt(Math.random()) * this._radius;
    particle.x = Math.cos(spawnAngle) * r + this._x;
    particle.y = Math.sin(spawnAngle) * r + this._y;

    if (this._speedMin > 0) {
      this._writeVelocity(particle, spawnAngle);
    }
  }
}
