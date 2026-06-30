export class TrailBuffer {
  constructor(maxPoints) {
    const cap = Math.max(maxPoints, 2);
    this._points = new Float64Array(cap * 2);
    this._count = 0;
    this._writePos = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._accumulated = 0;
  }

  get count() {
    return this._count;
  }

  get capacity() {
    return this._points.length / 2;
  }

  addPoint(x, y) {
    const idx = this._writePos;
    this._points[idx * 2] = x;
    this._points[idx * 2 + 1] = y;
    this._writePos = (idx + 1) % this.capacity;
    if (this._count < this.capacity) this._count++;
  }

  forEach(fn) {
    for (let i = 0; i < this._count; i++) {
      const idx = this._logicalIndex(i);
      fn(this._points[idx * 2], this._points[idx * 2 + 1], i);
    }
  }

  clear() {
    this._count = 0;
    this._writePos = 0;
    this._accumulated = 0;
  }

  resize(newMax) {
    const n = Math.max(newMax, 2);
    const newPoints = new Float64Array(n * 2);
    const copyCount = Math.min(this._count, n);
    const start = this._count - copyCount;
    for (let i = 0; i < copyCount; i++) {
      const srcIdx = this._logicalIndex(start + i);
      newPoints[i * 2] = this._points[srcIdx * 2];
      newPoints[i * 2 + 1] = this._points[srcIdx * 2 + 1];
    }
    this._points = newPoints;
    this._count = copyCount;
    this._writePos = copyCount % n;
  }

  _logicalIndex(i) {
    return (this._writePos - this._count + i + this.capacity) % this.capacity;
  }
}
