import { EmitterShape } from "./EmitterShape.js";

const SAMPLES_PER_SEG = 256;

export class SplineShape extends EmitterShape {
  constructor(points, options) {
    super();

    if (!Array.isArray(points) || points.length < 4) {
      throw new Error("SplineShape requires at least 4 points");
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!Array.isArray(p) || p.length !== 2 ||
          !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        throw new Error("SplineShape each point must be [x, y] with finite coordinates");
      }
    }

    const n = points.length;
    const pts = new Float64Array((n + 2) * 2);
    pts[0] = points[0][0];
    pts[1] = points[0][1];
    for (let i = 0; i < n; i++) {
      pts[(i + 1) * 2] = points[i][0];
      pts[(i + 1) * 2 + 1] = points[i][1];
    }
    pts[(n + 1) * 2] = points[n - 1][0];
    pts[(n + 1) * 2 + 1] = points[n - 1][1];

    const numSegs = (n + 2) - 3;
    const totalSamples = numSegs * SAMPLES_PER_SEG + 1;

    const tableX = new Float64Array(totalSamples);
    const tableY = new Float64Array(totalSamples);
    const tableAngle = new Float64Array(totalSamples);
    const tableCum = new Float64Array(totalSamples);

    let idx = 0;
    let running = 0;
    let prevX = 0;
    let prevY = 0;

    for (let s = 0; s < numSegs; s++) {
      const p0x = pts[s * 2];
      const p0y = pts[s * 2 + 1];
      const p1x = pts[(s + 1) * 2];
      const p1y = pts[(s + 1) * 2 + 1];
      const p2x = pts[(s + 2) * 2];
      const p2y = pts[(s + 2) * 2 + 1];
      const p3x = pts[(s + 3) * 2];
      const p3y = pts[(s + 3) * 2 + 1];

      const c0x = p1x;
      const c0y = p1y;
      const c1x = (-p0x + p2x) * 0.5;
      const c1y = (-p0y + p2y) * 0.5;
      const c2x = (2 * p0x - 5 * p1x + 4 * p2x - p3x) * 0.5;
      const c2y = (2 * p0y - 5 * p1y + 4 * p2y - p3y) * 0.5;
      const c3x = (-p0x + 3 * p1x - 3 * p2x + p3x) * 0.5;
      const c3y = (-p0y + 3 * p1y - 3 * p2y + p3y) * 0.5;

      const startI = s === 0 ? 0 : 1;
      for (let i = startI; i <= SAMPLES_PER_SEG; i++) {
        const t = i / SAMPLES_PER_SEG;
        const t2 = t * t;
        const t3 = t2 * t;

        const x = c0x + c1x * t + c2x * t2 + c3x * t3;
        const y = c0y + c1y * t + c2y * t2 + c3y * t3;

        const dotx = c1x + 2 * c2x * t + 3 * c3x * t2;
        const doty = c1y + 2 * c2y * t + 3 * c3y * t2;

        tableX[idx] = x;
        tableY[idx] = y;
        tableAngle[idx] = Math.atan2(doty, dotx);

        if (idx > 0) {
          const dx = x - prevX;
          const dy = y - prevY;
          running += Math.sqrt(dx * dx + dy * dy);
        }
        tableCum[idx] = running;

        prevX = x;
        prevY = y;
        idx++;
      }
    }

    this._totalLen = running;
    this._tableX = tableX;
    this._tableY = tableY;
    this._tableAngle = tableAngle;
    this._tableCum = tableCum;
    this._tableLen = totalSamples;

    if (options?.direction !== undefined) {
      this._setDirection(
        ["tangent", "reverse", "normal"],
        options.direction,
        options.speed,
        options.spread
      );
    }
  }

  sample(particle) {
    const d = Math.random() * this._totalLen;
    let lo = 0;
    let hi = this._tableLen - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._tableCum[mid] < d) lo = mid + 1;
      else hi = mid;
    }

    const prev = lo > 0 ? lo - 1 : 0;
    const prevLen = this._tableCum[prev];
    const segLen = this._tableCum[lo] - prevLen;
    const t = segLen > 0 ? (d - prevLen) / segLen : 0;

    const x0 = this._tableX[prev];
    const y0 = this._tableY[prev];
    const x1 = this._tableX[lo];
    const y1 = this._tableY[lo];
    particle.x = x0 + (x1 - x0) * t + this._x;
    particle.y = y0 + (y1 - y0) * t + this._y;

    if (this._direction) {
      const baseAngle = this._tableAngle[prev];
      let velAngle;
      switch (this._direction) {
        case "tangent":
          velAngle = baseAngle;
          break;
        case "reverse":
          velAngle = baseAngle + Math.PI;
          break;
        case "normal":
          velAngle = baseAngle + Math.PI / 2;
          break;
      }
      this._writeVelocity(particle, velAngle);
    }
  }
}
