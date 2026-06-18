import { EmitterShape } from "./EmitterShape.js";

export class PathShape extends EmitterShape {
  constructor(points, options) {
    super();

    if (!Array.isArray(points) || points.length < 2) {
      throw new Error("PathShape requires at least 2 points");
    }

    const segs = [];
    const cumLen = [];
    let total = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];

      if (!Array.isArray(p0) || !Array.isArray(p1) ||
          p0.length !== 2 || p1.length !== 2 ||
          !Number.isFinite(p0[0]) || !Number.isFinite(p0[1]) ||
          !Number.isFinite(p1[0]) || !Number.isFinite(p1[1])) {
        throw new Error("PathShape each point must be [x, y] with finite coordinates");
      }

      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        const angle = Math.atan2(dy, dx);
        segs.push(dx, dy, p0[0], p0[1], angle);
        total += len;
        cumLen.push(total);
      }
    }

    if (segs.length === 0) {
      throw new Error("PathShape all segments have zero length");
    }

    this._segData = new Float64Array(segs);
    this._cumLen = new Float64Array(cumLen);
    this._totalLen = total;
    this._pathPoints = points;

    if (options?.direction !== undefined) {
      this._setDirection(
        ["along", "reverse", "perpendicular"],
        options.direction,
        options.speed,
        options.spread
      );
    }
  }

  sample(particle) {
    const d = Math.random() * this._totalLen;
    let lo = 0;
    let hi = this._cumLen.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._cumLen[mid] < d) lo = mid + 1;
      else hi = mid;
    }

    const off = lo * 5;
    const dx = this._segData[off];
    const dy = this._segData[off + 1];
    const x1 = this._segData[off + 2];
    const y1 = this._segData[off + 3];
    const segAngle = this._segData[off + 4];

    const prevLen = lo > 0 ? this._cumLen[lo - 1] : 0;
    const t = (d - prevLen) / (this._cumLen[lo] - prevLen);

    particle.x = x1 + dx * t + this._x;
    particle.y = y1 + dy * t + this._y;

    if (this._direction) {
      let velAngle;
      switch (this._direction) {
        case "along":
          velAngle = segAngle;
          break;
        case "reverse":
          velAngle = segAngle + Math.PI;
          break;
        case "perpendicular":
          velAngle = segAngle - Math.PI / 2;
          break;
      }
      this._writeVelocity(particle, velAngle);
    }
  }

  toJSON() {
    const obj = { type: "PathShape", points: this._pathPoints };
    if (this._direction) {
      obj.direction = this._direction;
      obj.speed = this._speedMin === this._speedMax ? this._speedMin : [this._speedMin, this._speedMax];
      if (this._spread) obj.spread = this._spread;
    }
    return obj;
  }

  static fromJSON(data) {
    return new PathShape(data.points, data);
  }
}
