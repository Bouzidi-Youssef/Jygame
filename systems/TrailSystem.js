import { Trail } from "../display/Trail.js";

export class TrailSystem {
  constructor() {
    this._trails = [];
    this._layerDirty = false;
    this._cachedLayerVersion = -1;
  }

  createTrail(options) {
    const trail = new Trail(options);
    this.add(trail);
    return trail;
  }

  add(trail) {
    this._trails.push(trail);
    this._layerDirty = true;
  }

  remove(trail) {
    const idx = this._trails.indexOf(trail);
    if (idx >= 0) {
      const last = this._trails.length - 1;
      this._trails[idx] = this._trails[last];
      this._trails.pop();
    }
  }

  clear() {
    this._trails.length = 0;
  }

  resort() {
    this._trails.sort((a, b) => a.layer - b.layer);
    this._layerDirty = false;
  }

  updateAll(dt) {
    const trails = this._trails;
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].update(dt);
    }
  }

  renderAll(ctx) {
    if (this._layerDirty || Trail._globalLayerVersion !== this._cachedLayerVersion) {
      this.resort();
      this._layerDirty = false;
      this._cachedLayerVersion = Trail._globalLayerVersion;
    }
    const trails = this._trails;
    for (let i = 0; i < trails.length; i++) {
      trails[i].render(ctx);
    }
  }

  destroy() {
    for (let i = 0; i < this._trails.length; i++) {
      this._trails[i].destroy();
    }
    this._trails.length = 0;
    this._layerDirty = false;
    this._cachedLayerVersion = -1;
  }
}
