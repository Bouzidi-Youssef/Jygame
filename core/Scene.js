import { Input } from "../input/Input.js";

// Scenes are single-use objects.
// Once exited, they must not be re-entered or re-mounted.
// Create a new scene instance instead.

export class Scene {
  constructor() {
    this.dom = null;
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.inset = "0";
    this._cleanups = [];
    this._entered = false;
    this._exited = false;
    this._game = null;
    this.blocksUpdateBelow = true;
    this.blocksRenderBelow = false;
  }

  on(target, event, handler) {
    target.addEventListener(event, handler);
    this._cleanups.push(() => target.removeEventListener(event, handler));
  }

  onSwipe(cb) {
    this._cleanups.push(Input.onSwipe(cb));
  }

  onTap(cb) {
    this._cleanups.push(Input.onTap(cb));
  }

  cleanup(fn) {
    this._cleanups.push(fn);
  }

  enter() {
    if (this._entered) {
      throw new Error("Scene.enter() called more than once");
    }
    this._entered = true;
  }

  exit() {
    if (this._exited) {
      throw new Error("Scene.exit() called more than once");
    }
    this._exited = true;
    for (const fn of this._cleanups) {
      try { fn(); } catch (err) { console.error(err); }
    }
    this._cleanups = [];
  }

  pause() {}
  resume() {}
  update(dt) {}
  interpolate(alpha) {}
  render(ctx) {}
  renderUI() {}

  pushScene(scene) {
    if (this.game) this.game.pushScene(scene);
  }

  popScene() {
    if (this.game) this.game.popScene();
  }

  replaceScene(scene) {
    if (this.game) this.game.replaceScene(scene);
  }

  switchScene(scene) {
    if (this.game) this.game.switchScene(scene);
  }

  transitionTo(scene) {
    this.switchScene(scene);
  }
}
