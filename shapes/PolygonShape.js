import { EmitterShape } from "./EmitterShape.js";

function cross2(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= 0 && v >= 0 && u + v <= 1;
}

function signedArea2(ax, ay, bx, by, cx, cy) {
  return cross2(bx - ax, by - ay, cx - ax, cy - ay);
}

function area2(ax, ay, bx, by, cx, cy) {
  return Math.abs(signedArea2(ax, ay, bx, by, cx, cy));
}

function triangulate(verts) {
  const n = verts.length;
  const indices = new Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;

  let totalArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    totalArea += cross2(verts[i][0], verts[i][1], verts[j][0], verts[j][1]);
  }
  const ccw = totalArea >= 0;

  const tris = [];

  const remaining = indices.slice();

  while (remaining.length > 3) {
    let earFound = false;
    for (let i = 0; i < remaining.length && !earFound; i++) {
      const a = remaining[(i - 1 + remaining.length) % remaining.length];
      const b = remaining[i];
      const c = remaining[(i + 1) % remaining.length];

      const ax = verts[a][0], ay = verts[a][1];
      const bx = verts[b][0], by = verts[b][1];
      const cx = verts[c][0], cy = verts[c][1];

      const sa = signedArea2(ax, ay, bx, by, cx, cy);
      if (ccw ? sa <= 0 : sa >= 0) continue;

      let isEar = true;
      for (let j = 0; j < remaining.length; j++) {
        const k = remaining[j];
        if (k === a || k === b || k === c) continue;
        if (pointInTriangle(verts[k][0], verts[k][1], ax, ay, bx, by, cx, cy)) {
          isEar = false;
          break;
        }
      }

      if (isEar) {
        tris.push(a, b, c);
        remaining.splice(i, 1);
        earFound = true;
      }
    }

    if (!earFound) {
      throw new Error("PolygonShape: failed to triangulate — polygon may be self-intersecting");
    }
  }

  tris.push(remaining[0], remaining[1], remaining[2]);
  return tris;
}

export class PolygonShape extends EmitterShape {
  constructor(vertices, options) {
    super();

    if (!Array.isArray(vertices) || vertices.length < 3) {
      throw new Error("PolygonShape requires at least 3 vertices");
    }

    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const v = vertices[i];
      if (!Array.isArray(v) || v.length !== 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) {
        throw new Error("PolygonShape each vertex must be [x, y] with finite coordinates");
      }
      for (let j = i + 1; j < n; j++) {
        if (vertices[j][0] === v[0] && vertices[j][1] === v[1]) {
          throw new Error("PolygonShape duplicate vertex at index " + i);
        }
      }
    }

    this._vertX = new Float64Array(n);
    this._vertY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this._vertX[i] = vertices[i][0];
      this._vertY[i] = vertices[i][1];
    }

    const triIndices = triangulate(vertices);
    const triCount = triIndices.length / 3;

    this._triVerts = new Float64Array(triIndices.length * 2);
    this._triAreas = new Float64Array(triCount);
    this._cumArea = new Float64Array(triCount);

    let running = 0;
    for (let t = 0; t < triCount; t++) {
      const i0 = triIndices[t * 3];
      const i1 = triIndices[t * 3 + 1];
      const i2 = triIndices[t * 3 + 2];

      const ax = this._vertX[i0], ay = this._vertY[i0];
      const bx = this._vertX[i1], by = this._vertY[i1];
      const cx = this._vertX[i2], cy = this._vertY[i2];

      const off = t * 6;
      this._triVerts[off] = ax;
      this._triVerts[off + 1] = ay;
      this._triVerts[off + 2] = bx;
      this._triVerts[off + 3] = by;
      this._triVerts[off + 4] = cx;
      this._triVerts[off + 5] = cy;

      const a = area2(ax, ay, bx, by, cx, cy);
      this._triAreas[t] = a;
      running += a;
      this._cumArea[t] = running;
    }

    this._totalArea = running;

    if (options?.direction !== undefined) {
      this._setDirection(
        ["outward", "inward"],
        options.direction,
        options.speed,
        options.spread
      );
    }
  }

  sample(particle) {
    const t = Math.random() * this._totalArea;
    let lo = 0;
    let hi = this._cumArea.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._cumArea[mid] < t) lo = mid + 1;
      else hi = mid;
    }

    const off = lo * 6;
    const ax = this._triVerts[off];
    const ay = this._triVerts[off + 1];
    const bx = this._triVerts[off + 2];
    const by = this._triVerts[off + 3];
    const cx = this._triVerts[off + 4];
    const cy = this._triVerts[off + 5];

    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }

    const px = ax + u * (bx - ax) + v * (cx - ax) + this._x;
    const py = ay + u * (by - ay) + v * (cy - ay) + this._y;
    particle.x = px;
    particle.y = py;

    if (this._direction) {
      let velAngle;
      switch (this._direction) {
        case "outward":
          velAngle = Math.atan2(py - this._y, px - this._x);
          break;
        case "inward":
          velAngle = Math.atan2(this._y - py, this._x - px);
          break;
      }
      this._writeVelocity(particle, velAngle);
    }
  }
}
