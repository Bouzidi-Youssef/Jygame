import { ParticleSystem } from "./ParticleSystem.js";
import { ParticleEmitter } from "./ParticleEmitter.js";

export class ParticleEffect {
  constructor({ asset, x = 0, y = 0, renderer, backend } = {}) {
    this._asset = asset;
    this._destroyed = false;
    this._autoDestroy = false;
    this._finished = false;
    this._onFinishCallback = null;

    const system = new ParticleSystem({
      renderParticle: asset._renderParticle || undefined,
      renderer: renderer ?? asset._renderer ?? undefined,
      backend: backend ?? asset._backend ?? undefined,
    });

    if (asset._modifierStack) {
      this._modifierStack = asset._modifierStack.clone();
      system.addModifier(this._modifierStack);
    } else {
      this._modifierStack = null;
    }

    if (asset._capacity > 0) {
      system.warmup(asset._capacity);
    }

    this._system = system;

    const emitterConfig = {
      system,
      shape: asset._shape,
      ...asset._emitterConfig,
    };

    if (asset._initializer) {
      emitterConfig.initializer = emitterConfig.initializer || asset._initializer;
    }

    this._emitter = new ParticleEmitter(emitterConfig);
    this._emitter.setPosition(x, y);
  }

  get active() {
    return !this._destroyed && !this._finished;
  }

  get finished() {
    return this._finished;
  }

  get system() {
    return this._system;
  }

  get asset() {
    return this._asset;
  }

  get emitter() {
    return this._emitter;
  }

  play() {
    if (this._destroyed) return;
    if (this._finished) this._finished = false;
    this._emitter.start();
  }

  stop() {
    if (this._destroyed) return;
    this._emitter.stop();
  }

  pause() {
    if (this._destroyed) return;
    this._emitter.pause();
  }

  resume() {
    if (this._destroyed) return;
    this._emitter.resume();
  }

  emit(count) {
    if (this._destroyed || this._finished) return;
    this._emitter.emit(count);
  }

  update(dt) {
    if (this._destroyed || this._finished) return;
    this._emitter.update(dt);
    this._system.update(dt);
    if (this._autoDestroy && this._system.activeCount === 0) {
      this._finished = true;
      if (this._onFinishCallback) this._onFinishCallback(this);
    }
  }

  render(ctx) {
    if (this._destroyed || this._finished) return;
    this._system.render(ctx);
  }

  destroyWhenFinished(callback) {
    this._autoDestroy = true;
    this._onFinishCallback = callback || null;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._finished = true;
    this._emitter.destroy();
    this._system.destroy();
    this._modifierStack = null;
  }
}
