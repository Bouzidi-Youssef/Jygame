import { TrailBuffer } from "./TrailBuffer.js";

export class TrailManager {
  constructor() {
    this._buffers = new Map();
  }

  get(entityId) {
    return this._buffers.get(entityId) || null;
  }

  getOrCreate(entityId, maxPoints) {
    let buf = this._buffers.get(entityId);
    if (!buf) {
      buf = new TrailBuffer(maxPoints);
      this._buffers.set(entityId, buf);
    } else if (buf.capacity !== maxPoints) {
      buf.resize(maxPoints);
    }
    return buf;
  }

  remove(entityId) {
    this._buffers.delete(entityId);
  }

  has(entityId) {
    return this._buffers.has(entityId);
  }

  clear() {
    this._buffers.clear();
  }

  get size() {
    return this._buffers.size;
  }

  forEach(fn) {
    for (const [entityId, buf] of this._buffers) {
      fn(entityId, buf);
    }
  }
}
