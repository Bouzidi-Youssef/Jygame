export class ParticleLayer {
  constructor(name, { order = 0 } = {}, onOrderChange) {
    if (typeof name !== "string" || !name) {
      throw new Error("ParticleLayer: name must be a non-empty string");
    }
    if (typeof order !== "number" || !Number.isFinite(order)) {
      throw new Error("ParticleLayer: order must be a finite number");
    }

    this._name = name;
    this._order = order;
    this._systems = [];
    this._onOrderChange = onOrderChange || null;

    this._visible = true;
    this._enabled = true;
    this._paused = false;
    this._pausedOriginalEnabled = null;
    this._tags = new Set();
    this._destroyed = false;
  }

  get name() {
    return this._name;
  }

  get order() {
    return this._order;
  }

  set order(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("ParticleLayer.order: must be a finite number");
    }
    if (value === this._order) return;
    this._order = value;
    if (this._onOrderChange) this._onOrderChange();
  }

  get visible() {
    return this._visible;
  }

  set visible(value) {
    this._visible = !!value;
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(value) {
    if (this._paused) return;
    this._enabled = !!value;
  }

  get paused() {
    return this._paused;
  }

  get systemCount() {
    return this._systems.length;
  }

  get particleCount() {
    let count = 0;
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (typeof s.activeCount === "number") {
        count += s.activeCount;
      }
    }
    return count;
  }

  get tags() {
    return this._tags;
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this._pausedOriginalEnabled = this._enabled;
    this._enabled = false;
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    if (this._pausedOriginalEnabled !== null) {
      this._enabled = this._pausedOriginalEnabled;
      this._pausedOriginalEnabled = null;
    }
  }

  add(system) {
    if (this._destroyed) return this;
    if (!system) {
      throw new Error("ParticleLayer.add(): system must be non-null");
    }
    if (this._systems.indexOf(system) >= 0) {
      throw new Error("ParticleLayer.add(): system already added to this layer");
    }
    this._systems.push(system);
    return this;
  }

  remove(system) {
    if (this._destroyed) return;
    const idx = this._systems.indexOf(system);
    if (idx >= 0) {
      this._systems.splice(idx, 1);
    }
  }

  has(system) {
    return this._systems.indexOf(system) >= 0;
  }

  clear() {
    if (this._destroyed) return;
    this._systems.length = 0;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._systems.length = 0;
    this._tags.clear();
    this._paused = false;
    this._pausedOriginalEnabled = null;
    this._onOrderChange = null;
  }

  update(dt) {
    if (this._destroyed || !this._enabled) return;
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (typeof s.update === "function") {
        s.update(dt);
      }
    }
  }

  render(ctx) {
    if (this._destroyed || !this._visible) return;
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (typeof s.render === "function") {
        s.render(ctx);
      }
    }
  }
}
