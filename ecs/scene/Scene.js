import { World } from "../core/World.js";

export class Scene {
  constructor(name) {
    this._name = name;
    this._created = false;
    this._world = null;
  }

  get name() {
    return this._name;
  }

  get world() {
    if (!this._world) {
      this._world = this._createWorld();
    }
    return this._world;
  }

  set world(value) {
    this._world = value;
  }

  _createWorld() {
    return new World();
  }

  onCreate() {}
  onEnter() {}
  onExit() {}
  onPause() {}
  onResume() {}
  onDestroy() {}

  update(dt) {}
  render(ctx) {}
}
