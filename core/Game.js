import { Clock } from "../time/Clock.js";
import { Input, InputContext } from "../input/Input.js";

export class Game {
  constructor({ parent, width, height, fps = 60, maxTicks = 5, autoPause = true, scaleToFit = null }) {
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
    this.clock = new Clock(fps, maxTicks);
    this._sceneStack = [];
    this._running = false;
    this._paused = false;
    this._lastTime = 0;
    this._rafId = null;
    this._pausedByVisibility = false;
    this.fps = 60;

    this.input = new InputContext();
    this.input.init(container);
    Input.setDefault(this.input);

    this._visibilityHandler = null;
    if (autoPause) {
      this._visibilityHandler = () => {
        if (document.hidden) {
          if (!this._paused) {
            this._pausedByVisibility = true;
            this.pause();
          }
        } else {
          if (this._paused && this._pausedByVisibility) {
            this._pausedByVisibility = false;
            this.resume();
          }
        }
      };
      document.addEventListener("visibilitychange", this._visibilityHandler);
    }

    if (scaleToFit) {
      const vp = scaleToFit === true
        ? { width, height, padding: 0, element: undefined }
        : scaleToFit;
      const vpW = vp.width ?? width;
      const vpH = vp.height ?? height;
      const pad = vp.padding ?? 0;
      const target = typeof vp.element === "string"
        ? document.querySelector(vp.element) || document.documentElement
        : vp.element || document.documentElement;
      this._viewport = { width: vpW, height: vpH, padding: pad, target };
      this._applyViewport();
      this._resizeObserver = new ResizeObserver(() => this._applyViewport());
      this._resizeObserver.observe(document.documentElement);
      this._resizeHandler = () => this._applyViewport();
      window.addEventListener("resize", this._resizeHandler);
    }
  }

  _applyViewport() {
    const { target } = this._viewport;
    const doc = document.documentElement;
    const style = getComputedStyle(doc);
    const cssScale = style.getPropertyValue("--jygame-scale").trim();
    if (cssScale) {
      const s = parseFloat(cssScale);
      const mv = style.getPropertyValue("--jygame-margin-v").trim();
      target.style.transform = `scale(${s})`;
      target.style.marginTop = mv;
      target.style.marginBottom = mv;
      doc.style.removeProperty("--jygame-scale");
      doc.style.removeProperty("--jygame-margin-v");
      return;
    }
    const { width: vpW, height: vpH, padding: pad } = this._viewport;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const availW = vw - pad * 2;
    const availH = vh - pad * 2;
    const scale = Math.min(1, availW / vpW, availH / vpH);
    const visualH = vpH * scale;
    const marginV = ((vpH - visualH) / 2) * -1;
    target.style.transform = `scale(${scale})`;
    target.style.marginTop = marginV + "px";
    target.style.marginBottom = marginV + "px";
  }

  get isPaused() {
    return this._paused;
  }

  get scene() {
    return this._sceneStack[this._sceneStack.length - 1] || null;
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this.scene?.pause?.();
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._pausedByVisibility = false;
    this.clock.reset();
    this._lastTime = performance.now();
    this.scene?.resume?.();
  }

  togglePause() {
    this._paused ? this.resume() : this.pause();
  }

  run(scene) {
    this._sceneStack = [scene];
    scene.game = this;
    scene.dom = scene.root;
    this.domLayer.append(scene.root);
    this.clock.reset();
    scene.enter();
    this._applyUI(scene);
    this._running = true;
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  pushScene(scene) {
    const top = this.peekScene();
    if (top) {
      top.pause();
      top.covered();
    }
    this._sceneStack.push(scene);
    scene.game = this;
    scene.dom = scene.root;
    this.domLayer.append(scene.root);
    scene.enter();
    this._applyUI(scene);
  }

  popScene() {
    if (this._sceneStack.length <= 1) {
      throw new Error("Cannot pop the last scene");
    }
    const top = this._sceneStack.pop();
    top.exit();
    top.root.remove();
    const below = this.peekScene();
    below.uncovered();
    below.resume();
    this._applyUI(below);
  }

  peekScene() {
    return this._sceneStack[this._sceneStack.length - 1] || null;
  }

  switchScene(scene) {
    this._paused = false;
    this._pausedByVisibility = false;
    for (const s of this._sceneStack) {
      s.exit();
      s.root.remove();
    }
    this._sceneStack = [scene];
    this.input.updateFrame();
    scene.game = this;
    scene.dom = scene.root;
    this.domLayer.append(scene.root);
    this.clock.reset();
    this._lastTime = performance.now();
    scene.enter();
    this._applyUI(scene);
  }

  refreshUI() {
    const top = this.peekScene();
    if (top) this._applyUI(top);
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

  _updateScenes(dt) {
    const stack = this._sceneStack;
    let start = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].blocksUpdateBelow()) { start = i; break; }
    }
    for (let i = start; i < stack.length; i++) {
      stack[i].update(dt);
    }
  }

  _interpolateScenes(alpha) {
    const stack = this._sceneStack;
    let start = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].blocksUpdateBelow()) { start = i; break; }
    }
    for (let i = start; i < stack.length; i++) {
      stack[i].interpolate?.(alpha);
    }
  }

  _renderScenes(ctx) {
    const stack = this._sceneStack;
    let start = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].blocksRenderBelow()) { start = i; break; }
    }
    for (let i = start; i < stack.length; i++) {
      stack[i].render(ctx);
    }
  }

  _loop(time) {
    if (!this._running) return;

    if (this._paused) {
      this._rafId = requestAnimationFrame((t) => this._loop(t));
      return;
    }

    const realDt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    const ticks = this.clock.tick(realDt);

    if (ticks > 0) {
      this._updateScenes(this.clock.fixedDt);
      this.input.clearJustPressed();
      for (let i = 1; i < ticks; i++) {
        this._updateScenes(this.clock.fixedDt);
      }
    }

    this.input.updateFrame();

    this._interpolateScenes(this.clock.alpha);

    this.fps += ((1 / Math.max(realDt, 0.001)) - this.fps) * 0.05;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this._renderScenes(this.ctx);

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  destroy() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._visibilityHandler) {
      document.removeEventListener("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }
    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    for (const s of this._sceneStack) {
      s.exit();
      s.root.remove();
    }
    this._sceneStack = [];
    this.input.destroy();
  }
}
