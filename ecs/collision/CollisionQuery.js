export class CollisionQuery {
  constructor(spatialHash) {
    this._hash = spatialHash;
  }

  queryRect(rect, out) {
    return this._hash.queryRect(rect, out);
  }

  queryPoint(point, out) {
    return this._hash.queryPoint(point, out);
  }

  queryCircle(cx, cy, radius, out) {
    return this._hash.queryCircle(cx, cy, radius, out);
  }

  queryAABB(x, y, w, h, out) {
    return this._hash.queryAABB(x, y, w, h, out);
  }

  raycast(ox, oy, dx, dy, maxDist, out) {
    return this._hash.raycast(ox, oy, dx, dy, maxDist, out);
  }
}
