import { Input } from "../input/Input.js";
import { Scene as EcsScene } from "../ecs/scene/Scene.js";
import { DefaultWorldBuilder } from "../ecs/bootstrap/DefaultWorldBuilder.js";
import { CanvasContext } from "../ecs/render/CanvasContext.js";
import { Camera } from "../camera/Camera.js";
import { Sprite } from "../display/Sprite.js";

export class Scene extends EcsScene {
  constructor() {
    super();
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
    this._prevDefaultWorld = null;
  }

  _createWorld() {
    return DefaultWorldBuilder.createDefault();
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

    this.world;

    if (this._game) {
      this._world.setResource(CanvasContext, this._game.ctx);

      const cam = new Camera(0, 0, this._game.width, this._game.height);
      this._world.setResource(Camera, cam);
    }

    this._prevDefaultWorld = Sprite._defaultWorld;
    Sprite._defaultWorld = this._world;
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

    if (Sprite._defaultWorld === this._world) {
      Sprite._defaultWorld = this._prevDefaultWorld;
    }

    if (this._world) {
      this._world.clearSystems();
      this._world.clearResources();
      this._world = null;
    }
  }

  pause() {}
  resume() {}
  update(dt) {}
  interpolate(alpha) {}
  render(ctx) {}
  renderUI() {}

  pushScene(scene) {
    if (this._game) this._game.pushScene(scene);
  }

  popScene() {
    if (this._game) this._game.popScene();
  }

  replaceScene(scene) {
    if (this._game) this._game.replaceScene(scene);
  }

  switchScene(scene) {
    if (this._game) this._game.switchScene(scene);
  }

  transitionTo(scene) {
    this.switchScene(scene);
  }
}
