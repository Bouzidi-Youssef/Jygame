const DEFAULT_KEY_MAP = Object.freeze({
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  w: "UP",
  W: "UP",
  s: "DOWN",
  S: "DOWN",
  a: "LEFT",
  A: "LEFT",
  d: "RIGHT",
  D: "RIGHT",
  " ": "SPACE",
  Escape: "ESCAPE",
  Enter: "ENTER",
});

export class InputContext {
  constructor(options = {}) {
    this._pressed = new Map();
    this._justPressed = new Map();
    this._justReleased = new Map();
    this._pointers = new Map();
    this._pointerX = 0;
    this._pointerY = 0;
    this._target = null;
    this._swipeListeners = [];
    this._tapListeners = [];
    this._keyMap = { ...DEFAULT_KEY_MAP };
    this.buffer = [];

    this.swipeThreshold = options.swipeThreshold ?? 30;
    this.tapTimeout = options.tapTimeout ?? 300;

    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundKeyUp = this._handleKeyUp.bind(this);
    this._boundPointerDown = this._handlePointerDown.bind(this);
    this._boundPointerMove = this._handlePointerMove.bind(this);
    this._boundPointerUp = this._handlePointerUp.bind(this);
    this._boundPointerCancel = this._handlePointerCancel.bind(this);
  }

  get x() { return this._pointerX; }
  get y() { return this._pointerY; }
  get isPointerDown() { return this._pointers.size > 0; }
  get pointerCount() { return this._pointers.size; }

  init(target) {
    const el = target || document;
    this._target = el;
    document.addEventListener("keydown", this._boundKeyDown);
    document.addEventListener("keyup", this._boundKeyUp);
    el.addEventListener("pointerdown", this._boundPointerDown, { passive: false });
    el.addEventListener("pointermove", this._boundPointerMove, { passive: false });
    el.addEventListener("pointerup", this._boundPointerUp, { passive: false });
    el.addEventListener("pointercancel", this._boundPointerCancel, { passive: false });
    el.style.touchAction = "none";
  }

  destroy() {
    const el = this._target;
    if (!el) return;
    document.removeEventListener("keydown", this._boundKeyDown);
    document.removeEventListener("keyup", this._boundKeyUp);
    el.removeEventListener("pointerdown", this._boundPointerDown);
    el.removeEventListener("pointermove", this._boundPointerMove);
    el.removeEventListener("pointerup", this._boundPointerUp);
    el.removeEventListener("pointercancel", this._boundPointerCancel);
    el.style.touchAction = "";
    this._pointers.clear();
    this._pressed.clear();
    this._justPressed.clear();
    this._justReleased.clear();
    this._swipeListeners = [];
    this._tapListeners = [];
    this._target = null;
    this.buffer = [];
  }

  updateFrame() {
    this._justPressed.clear();
    this._justReleased.clear();
  }

  clearJustPressed() {
    this._justPressed.clear();
  }

  mapKey(rawKey, alias) {
    this._keyMap[rawKey] = alias;
  }

  unmapKey(rawKey) {
    delete this._keyMap[rawKey];
  }

  setKeyMap(map) {
    this._keyMap = { ...map };
  }

  resetKeyMap() {
    this._keyMap = { ...DEFAULT_KEY_MAP };
  }

  getKeyMap() {
    return { ...this._keyMap };
  }

  isDown(key) {
    return !!this._pressed.get(key);
  }

  justPressed(key) {
    return !!this._justPressed.get(key);
  }

  justReleased(key) {
    return !!this._justReleased.get(key);
  }

  consumeBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer.shift();
  }

  peekBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer[0];
  }

  getPointer(id) {
    return this._pointers.get(id) || null;
  }

  getPointers() {
    return [...this._pointers.values()];
  }

  forEachPointer(fn) {
    for (const p of this._pointers.values()) fn(p);
  }

  onSwipe(cb) {
    this._swipeListeners.push(cb);
    return () => {
      this._swipeListeners = this._swipeListeners.filter(l => l !== cb);
    };
  }

  onTap(cb) {
    this._tapListeners.push(cb);
    return () => {
      this._tapListeners = this._tapListeners.filter(l => l !== cb);
    };
  }

  removeSwipe(cb) {
    this._swipeListeners = this._swipeListeners.filter(l => l !== cb);
  }

  removeTap(cb) {
    this._tapListeners = this._tapListeners.filter(l => l !== cb);
  }

  _handleKeyDown(e) {
    const raw = e.key;
    if (!this._pressed.get(raw)) this._justPressed.set(raw, true);
    this._pressed.set(raw, true);

    const alias = this._keyMap[raw];
    if (alias) {
      if (!this._pressed.get(alias)) this._justPressed.set(alias, true);
      this._pressed.set(alias, true);
    }

    if (raw.startsWith("Arrow") || raw === " ") {
      e.preventDefault();
    }
  }

  _handleKeyUp(e) {
    const raw = e.key;
    if (this._pressed.get(raw)) this._justReleased.set(raw, true);
    this._pressed.set(raw, false);

    const alias = this._keyMap[raw];
    if (alias) {
      if (this._pressed.get(alias)) this._justReleased.set(alias, true);
      this._pressed.set(alias, false);
    }
  }

  _handlePointerDown(e) {
    this._pointers.set(e.pointerId, {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      pointerType: e.pointerType,
      isDown: true,
    });
    this._pointerX = e.clientX;
    this._pointerY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  _handlePointerMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    this._pointerX = e.clientX;
    this._pointerY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  _handlePointerUp(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p || !p.isDown) return;
    p.x = e.clientX;
    p.y = e.clientY;
    p.isDown = false;

    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const elapsed = performance.now() - p.startTime;

    if (absDx < this.swipeThreshold && absDy < this.swipeThreshold && elapsed < this.tapTimeout) {
      for (const cb of this._tapListeners) {
        cb({ x: p.x, y: p.y, pointerId: p.id });
      }
    } else if (absDx >= this.swipeThreshold || absDy >= this.swipeThreshold) {
      const dir = absDx > absDy
        ? (dx > 0 ? "RIGHT" : "LEFT")
        : (dy > 0 ? "DOWN" : "UP");
      for (const cb of this._swipeListeners) cb(dir);
    }

    this._pointers.delete(e.pointerId);
    if (e.cancelable) e.preventDefault();
  }

  _handlePointerCancel(e) {
    this._pointers.delete(e.pointerId);
  }
}
