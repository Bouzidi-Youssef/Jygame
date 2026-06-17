import { Trail } from "../display/Trail.js";

export class TrailSystem {
  constructor() {
    this._trails = [];
  }

  createTrail(options) {
    const trail = new Trail(options);
    this._trails.push(trail);
    return trail;
  }

  add(trail) {
    this._trails.push(trail);
  }

  remove(trail) {
    const idx = this._trails.indexOf(trail);
    if (idx >= 0) {
      this._trails.splice(idx, 1);
    }
  }

  clear() {
    this._trails.length = 0;
  }

  updateAll(dt) {
    const trails = this._trails;
    for (let i = 0; i < trails.length; i++) {
      trails[i].update(dt);
    }
  }

  renderAll(ctx) {
    const trails = this._trails;
    for (let i = 0; i < trails.length; i++) {
      trails[i].render(ctx);
    }
  }
}
