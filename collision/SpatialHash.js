export class SpatialHash {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this._queryStamp = 0;
  }

  clear() {
    this.cells.clear();
    this._queryStamp = 0;
  }

  insert(id, cx, cy, w, h) {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const l = cx - hw;
    const r = cx + hw;
    const t = cy - hh;
    const b = cy + hh;
    const left = Math.floor(l / this.cellSize);
    const right = Math.floor(r / this.cellSize);
    const top = Math.floor(t / this.cellSize);
    const bottom = Math.floor(b / this.cellSize);
    const entry = { id, l, r, t, b, _qs: 0 };
    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const key = `${x}:${y}`;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(entry);
      }
    }
  }

  _eachCell(left, right, top, bottom, fn) {
    this._queryStamp++;
    const qs = this._queryStamp;
    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const cell = this.cells.get(`${x}:${y}`);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (e._qs === qs) continue;
          e._qs = qs;
          fn(e);
        }
      }
    }
  }

  queryRect(rect, out = []) {
    const left = Math.floor(rect.left / this.cellSize);
    const right = Math.floor(rect.right / this.cellSize);
    const top = Math.floor(rect.top / this.cellSize);
    const bottom = Math.floor(rect.bottom / this.cellSize);
    this._eachCell(left, right, top, bottom, e => {
      if (e.l < rect.right && e.r > rect.left && e.t < rect.bottom && e.b > rect.top) {
        out.push(e.id);
      }
    });
    return out;
  }

  queryPoint(point, out = []) {
    const key = `${Math.floor(point.x / this.cellSize)}:${Math.floor(point.y / this.cellSize)}`;
    const cell = this.cells.get(key);
    if (!cell) return out;
    for (let i = 0; i < cell.length; i++) {
      const e = cell[i];
      if (point.x >= e.l && point.x <= e.r && point.y >= e.t && point.y <= e.b) {
        out.push(e.id);
      }
    }
    return out;
  }

  queryCircle(cx, cy, radius, out = []) {
    const r2 = radius * radius;
    const left = Math.floor((cx - radius) / this.cellSize);
    const right = Math.floor((cx + radius) / this.cellSize);
    const top = Math.floor((cy - radius) / this.cellSize);
    const bottom = Math.floor((cy + radius) / this.cellSize);
    this._eachCell(left, right, top, bottom, e => {
      const closestX = Math.max(e.l, Math.min(cx, e.r));
      const closestY = Math.max(e.t, Math.min(cy, e.b));
      const dx = cx - closestX;
      const dy = cy - closestY;
      if (dx * dx + dy * dy <= r2) {
        out.push(e.id);
      }
    });
    return out;
  }

  queryAABB(cx, cy, w, h, out = []) {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const al = cx - hw;
    const ar = cx + hw;
    const at = cy - hh;
    const ab = cy + hh;
    const left = Math.floor(al / this.cellSize);
    const right = Math.floor(ar / this.cellSize);
    const top = Math.floor(at / this.cellSize);
    const bottom = Math.floor(ab / this.cellSize);
    this._eachCell(left, right, top, bottom, e => {
      if (e.l < ar && e.r > al && e.t < ab && e.b > at) {
        out.push(e.id);
      }
    });
    return out;
  }

  raycast(ox, oy, dx, dy, maxDist, out = []) {
    this._queryStamp++;
    const qs = this._queryStamp;
    const step = this.cellSize;
    const invDx = dx !== 0 ? 1 / dx : Infinity;
    const invDy = dy !== 0 ? 1 / dy : Infinity;
    let cx = Math.floor(ox / this.cellSize);
    let cy = Math.floor(oy / this.cellSize);
    const endX = Math.floor((ox + dx * maxDist) / this.cellSize);
    const endY = Math.floor((oy + dy * maxDist) / this.cellSize);
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;
    let tMaxX = dx !== 0 ? ((cx + (sx > 0 ? 1 : 0)) * this.cellSize - ox) * invDx : Infinity;
    let tMaxY = dy !== 0 ? ((cy + (sy > 0 ? 1 : 0)) * this.cellSize - oy) * invDy : Infinity;
    const tDeltaX = dx !== 0 ? step * invDx * sx : Infinity;
    const tDeltaY = dy !== 0 ? step * invDy * sy : Infinity;
    const rayEndX = ox + dx * maxDist;
    const rayEndY = oy + dy * maxDist;
    const minX = Math.min(ox, rayEndX);
    const maxX = Math.max(ox, rayEndX);
    const minY = Math.min(oy, rayEndY);
    const maxY = Math.max(oy, rayEndY);
    while (true) {
      const key = `${cx}:${cy}`;
      const cell = this.cells.get(key);
      if (cell) {
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (e._qs === qs) continue;
          e._qs = qs;
          if (e.l < maxX && e.r > minX && e.t < maxY && e.b > minY) {
            out.push(e.id);
          }
        }
      }
      if (cx === endX && cy === endY) break;
      if (tMaxX < tMaxY) {
        cx += sx;
        tMaxX += tDeltaX;
      } else {
        cy += sy;
        tMaxY += tDeltaY;
      }
    }
    return out;
  }
}
