export class LoadingTask {
  constructor(resultFn) {
    this._total = 0;
    this._loaded = 0;
    this._listeners = [];
    this._resultFn = resultFn || null;
    this._failed = false;

    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  get progress() { return this._total > 0 ? this._loaded / this._total : 1; }
  get loaded() { return this._loaded; }
  get total() { return this._total; }

  get promise() { return this._promise; }

  expect(n) {
    this._total += n;
  }

  done() {
    if (this._failed) return;
    this._loaded++;
    this._notify();
    if (this._loaded >= this._total) {
      this._resolve(this._resultFn ? this._resultFn() : undefined);
    }
  }

  fail(err) {
    if (this._failed) return;
    this._failed = true;
    this._reject(err);
  }

  then(onfulfilled, onrejected) {
    return this._promise.then(onfulfilled, onrejected);
  }

  onProgress(cb) {
    this._listeners.push(cb);
    return () => {
      this._listeners = this._listeners.filter(l => l !== cb);
    };
  }

  _notify() {
    for (const cb of this._listeners) cb(this._loaded, this._total);
  }
}
