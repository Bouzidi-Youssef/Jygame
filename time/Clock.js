export class Clock {
  constructor(fps = 60) {
    this._fps = fps;
    this._fixedDt = 1 / fps;
    this._maxDelta = 0.2;
    this._accumulator = 0;
  }

  get fps() {
    return this._fps;
  }

  set fps(v) {
    this._fps = v;
    this._fixedDt = 1 / v;
  }

  get fixedDt() {
    return this._fixedDt;
  }

  tick(realDt) {
    this._accumulator += Math.min(realDt, this._maxDelta);
    let count = 0;
    while (this._accumulator >= this._fixedDt) {
      this._accumulator -= this._fixedDt;
      count++;
    }
    return count;
  }

  reset() {
    this._accumulator = 0;
  }
}
