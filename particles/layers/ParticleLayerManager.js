import { ParticleLayer } from "./ParticleLayer.js";

export class ParticleLayerManager {
  constructor() {
    this._layers = new Map();
    this._sortedLayers = [];
    this._dirty = false;
    this._destroyed = false;
  }

  create(name, { order = 0 } = {}) {
    if (this._destroyed) return null;
    if (this._layers.has(name)) {
      throw new Error(`ParticleLayerManager: layer "${name}" already exists`);
    }

    const layer = new ParticleLayer(name, { order }, () => {
      this._markDirty();
    });

    this._layers.set(name, layer);
    this._sortedLayers.push(layer);
    this._markDirty();
    return layer;
  }

  get(name) {
    return this._layers.get(name);
  }

  has(name) {
    return this._layers.has(name);
  }

  remove(name) {
    if (this._destroyed) return;
    const layer = this._layers.get(name);
    if (!layer) return;
    this._layers.delete(name);
    this._markDirty();
  }

  clear() {
    if (this._destroyed) return;
    this._layers.clear();
    this._sortedLayers.length = 0;
    this._dirty = false;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const layer of this._layers.values()) {
      layer.destroy();
    }
    this._layers.clear();
    this._sortedLayers.length = 0;
    this._dirty = false;
  }

  get layers() {
    if (this._dirty) this._rebuildOrder();
    // Return a shallow copy to prevent mutation of the internal array
    return this._sortedLayers.slice();
  }

  get layerCount() {
    return this._layers.size;
  }

  get particleCount() {
    let count = 0;
    const layers = this._dirty ? this._rebuildOrderAndReturn() : this._sortedLayers;
    for (let i = 0; i < layers.length; i++) {
      count += layers[i].particleCount;
    }
    return count;
  }

  get systemCount() {
    let count = 0;
    const layers = this._dirty ? this._rebuildOrderAndReturn() : this._sortedLayers;
    for (let i = 0; i < layers.length; i++) {
      count += layers[i].systemCount;
    }
    return count;
  }

  _markDirty() {
    this._dirty = true;
  }

  _rebuildOrder() {
    this._sortedLayers.length = 0;
    for (const layer of this._layers.values()) {
      this._sortedLayers.push(layer);
    }
    this._sortedLayers.sort((a, b) => a.order - b.order);
    this._dirty = false;
  }

  _rebuildOrderAndReturn() {
    this._rebuildOrder();
    return this._sortedLayers;
  }

  update(dt) {
    if (this._destroyed) return;
    if (this._dirty) this._rebuildOrder();
    const layers = this._sortedLayers;
    for (let i = 0; i < layers.length; i++) {
      layers[i].update(dt);
    }
  }

  render(ctx) {
    if (this._destroyed) return;
    if (this._dirty) this._rebuildOrder();
    const layers = this._sortedLayers;
    for (let i = 0; i < layers.length; i++) {
      layers[i].render(ctx);
    }
  }
}
