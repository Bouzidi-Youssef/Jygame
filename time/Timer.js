export class Timer {
  constructor(duration, { loop = false, autoStart = true } = {}) {
    this._duration = duration;
    this._loop = loop;
    this._elapsed = 0;
    this._running = autoStart;
  }

  get done() {
    return this._running && this._elapsed >= this._duration;
  }

  get progress() {
    return Math.min(this._elapsed / this._duration, 1);
  }

  get remaining() {
    return Math.max(this._duration - this._elapsed, 0);
  }

  get running() {
    return this._running;
  }

  tick(dt) {
    if (!this._running) return;

    this._elapsed += dt;

    if (this._elapsed >= this._duration) {
      if (this._loop) {
        this._elapsed -= this._duration;
      } else {
        this._elapsed = this._duration;
        this._running = false;
      }
      return true;
    }
    return false;
  }

  start() {
    this._running = true;
  }

  stop() {
    this._running = false;
  }

  reset() {
    this._elapsed = 0;
    this._running = true;
  }
}
