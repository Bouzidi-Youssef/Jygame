const MAX_EMIT_PER_FRAME = 1000;
const DEFAULT_FOLLOW_GETTER = t => t.transform;

export class ParticleEmitter {
  constructor({ system, rate = 0, initializer } = {}) {
    if (!system) throw new Error("ParticleEmitter requires a `system` (ParticleSystem)");
    this._system = system;
    this._rate = rate;
    this._initializer = initializer;
    this._accumulator = 0;
    this._emittedCount = 0;
    this._active = false;
    this._paused = false;
    this._target = null;
    this._followGetter = null;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.velocityInheritance = 1;

    this._emitWrapper = (p, i, emitter) => {
      p.x = this.x + this.offsetX;
      p.y = this.y + this.offsetY;
      p.vx = this.vx * this.velocityInheritance;
      p.vy = this.vy * this.velocityInheritance;
      if (this._initializer) this._initializer(p, i, emitter);
    };
  }

  get active() {
    return this._active;
  }

  get emittedCount() {
    return this._emittedCount;
  }

  get isFollowing() {
    return this._target !== null;
  }

  get isPaused() {
    return this._paused;
  }

  get enabled() {
    return this._active;
  }

  set enabled(value) {
    this._active = value;
  }

  get rate() {
    return this._rate;
  }

  set rate(value) {
    this._rate = Math.max(0, value);
  }

  get initializer() {
    return this._initializer;
  }

  set initializer(fn) {
    this._initializer = fn;
  }

  start() {
    this._active = true;
  }

  stop() {
    this._active = false;
  }

  toggle() {
    this._active = !this._active;
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  restart() {
    this.reset();
    this.start();
  }

  emit(count) {
    this._system.emit(count, this._emitWrapper, this);
    this._emittedCount += count;
  }

  emitOne() {
    this.emit(1);
  }

  burst(count) {
    this.emit(count);
  }

  follow(target, getter) {
    if (!target) throw new Error("ParticleEmitter.follow() requires a target");
    if (getter !== undefined && typeof getter !== "function") {
      throw new Error("ParticleEmitter.follow() getter must be a function");
    }
    this._target = target;
    this._followGetter = getter || DEFAULT_FOLLOW_GETTER;
  }

  clearFollow() {
    this._target = null;
    this._followGetter = null;
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
  }

  setVelocity(vx, vy) {
    this.vx = vx;
    this.vy = vy;
  }

  update(dt) {
    if (!this._active || this._paused) return;
    if (this._target) {
      const pos = this._followGetter(this._target);
      this.x = pos.x;
      this.y = pos.y;
    }
    this._accumulator += this._rate * dt;
    const count = Math.min(Math.floor(this._accumulator), MAX_EMIT_PER_FRAME);
    if (count > 0) {
      this.emit(count);
      this._accumulator -= count;
    }
  }

  reset() {
    this._accumulator = 0;
    this._emittedCount = 0;
  }

  destroy() {
    this.stop();
    this.reset();
    this._paused = false;
    this._target = null;
    this._followGetter = null;
    this._initializer = null;
  }
}
