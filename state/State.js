export class State {
  constructor(initial = {}) {
    this._state = { ...initial };
    this._listeners = [];
  }

  get() {
    return this._state;
  }

  set(partial) {
    this._state = { ...this._state, ...partial };
    this._notify();
  }

  replace(next) {
    this._state = next;
    this._notify();
  }

  reset(initial) {
    this._state = { ...initial };
    this._notify();
  }

  subscribe(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  unsubscribe(fn) {
    this._listeners = this._listeners.filter(l => l !== fn);
  }

  _notify() {
    for (const fn of this._listeners) {
      fn(this._state);
    }
  }
}
