import { Clock } from "../time/Clock.js";
import { Input } from "../input/Input.js";

export class Game {
  constructor({ parent, width, height, fps = 60 }) {
    const container = typeof parent === "string"
      ? document.querySelector(parent)
      : parent;

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.display = "block";
    container.appendChild(this.canvas);

    this.domLayer = document.createElement("div");
    this.domLayer.className = "jygame-ui";
    this.domLayer.style.position = "absolute";
    this.domLayer.style.top = "0";
    this.domLayer.style.left = "0";
    this.domLayer.style.width = "100%";
    this.domLayer.style.height = "100%";
    container.appendChild(this.domLayer);

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    this.ctx = this.canvas.getContext("2d");
    this.width = width;
    this.height = height;
    this.clock = new Clock(fps);
    this.scene = null;
    this._running = false;
    this._paused = false;
    this._lastTime = 0;
    this._rafId = null;
    this.fps = 60;

    Input.init();
  }

  get isPaused() {
    return this._paused;
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this.scene?.pause?.();
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this.scene?.resume?.();
  }

  togglePause() {
    this._paused ? this.resume() : this.pause();
  }

  run(scene) {
    this.domLayer.append(scene.root);
    scene.dom = scene.root;
    scene.game = this;
    this.scene = scene;
    this.clock.reset();
    scene.enter();
    this._applyUI(scene);
    this._running = true;
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  switchScene(scene) {
    this._paused = false;
    this.scene.exit();
    this.scene.root.remove();
    Input.updateFrame();
    this.domLayer.append(scene.root);
    scene.dom = scene.root;
    scene.game = this;
    this.scene = scene;
    this.clock.reset();
    scene.enter();
    this._applyUI(scene);
  }

  refreshUI() {
    this._applyUI(this.scene);
  }

  patchUI(updates) {
    const root = this.scene?.root;
    if (!root) return;
    for (const [id, content] of Object.entries(updates)) {
      const el = root.querySelector("#" + id);
      if (el && el.textContent !== String(content)) {
        el.textContent = content;
      }
    }
  }

  _applyUI(scene) {
    const html = scene.renderUI();
    if (html !== undefined && html !== null) {
      scene.root.innerHTML = html;
    }
  }

  _loop(time) {
    if (!this._running) return;

    const realDt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    const ticks = this.clock.tick(realDt);

    if (ticks > 0) {
      this.scene.update(this.clock.fixedDt);
      Input.clearJustPressed();
      for (let i = 1; i < ticks; i++) {
        if (this._paused) break;
        this.scene.update(this.clock.fixedDt);
      }
    } else {
      this.scene.update(0);
    }

    Input.updateFrame();

    this.fps += ((1 / Math.max(realDt, 0.001)) - this.fps) * 0.05;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.scene.render(this.ctx);

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  destroy() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.scene.exit();
    Input.destroy();
  }
}
