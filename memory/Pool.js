export class Pool {
  constructor({ create, reset, initialSize = 0, maxSize = Infinity } = {}) {
    if (typeof create !== "function") {
      throw new Error("Pool requires a `create` factory function");
    }
    this._create = create;
    this._reset = typeof reset === "function" ? reset : () => {};
    this._maxSize = maxSize;
    this._pool = [];
    this._released = new Set();

    if (initialSize > 0) {
      this.grow(initialSize);
    }
  }

  acquire(...args) {
    if (this._pool.length > 0) {
      const obj = this._pool.pop();
      this._released.delete(obj);
      return obj;
    }
    return this._create(...args);
  }

  release(obj) {
    if (this._released.has(obj)) return;
    if (this._pool.length >= this._maxSize) return;
    this._reset(obj);
    this._pool.push(obj);
    this._released.add(obj);
  }

  get size() {
    return this._pool.length;
  }

  grow(n) {
    for (let i = 0; i < n; i++) {
      const obj = this._create();
      this._reset(obj);
      this._pool.push(obj);
      this._released.add(obj);
    }
  }

  drain() {
    this._pool = [];
    this._released.clear();
  }
}
