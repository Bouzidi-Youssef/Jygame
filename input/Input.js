const _pressed = {};
const _justPressed = {};
const _justReleased = {};

const KEY_MAP = {
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
};

let _swipeListeners = [];
let _tapListeners = [];
let _trackingTouch = false;
let _touchStartX = 0;
let _touchStartY = 0;
let _touchStartTime = 0;
const MIN_SWIPE = 30;
const TAP_TIMEOUT = 300;

function handleKeyDown(e) {
  const mapped = KEY_MAP[e.key];
  if (mapped) {
    if (!_pressed[mapped]) _justPressed[mapped] = true;
    _pressed[mapped] = true;
    if (["UP", "DOWN", "LEFT", "RIGHT", "SPACE"].includes(mapped)) {
      e.preventDefault();
    }
  }
}

function handleKeyUp(e) {
  const mapped = KEY_MAP[e.key];
  if (mapped) {
    if (_pressed[mapped]) _justReleased[mapped] = true;
    _pressed[mapped] = false;
  }
}

function handleTouchStart(e) {
  _trackingTouch = true;
  const t = e.touches[0];
  _touchStartX = t.clientX;
  _touchStartY = t.clientY;
  _touchStartTime = Date.now();
  e.preventDefault();
}

function handleTouchMove(e) {
  if (!_trackingTouch) return;
  e.preventDefault();
}

function handleTouchEnd(e) {
  if (!_trackingTouch) return;
  _trackingTouch = false;

  const t = e.changedTouches[0];
  const deltaX = t.clientX - _touchStartX;
  const deltaY = t.clientY - _touchStartY;
  const absDx = Math.abs(deltaX);
  const absDy = Math.abs(deltaY);
  const elapsed = Date.now() - _touchStartTime;

  if (absDx < MIN_SWIPE && absDy < MIN_SWIPE && elapsed < TAP_TIMEOUT) {
    for (const cb of _tapListeners) {
      cb({ x: t.clientX, y: t.clientY });
    }
    return;
  }

  if (absDx < MIN_SWIPE && absDy < MIN_SWIPE) return;

  let dir;
  if (absDx > absDy) {
    dir = deltaX > 0 ? "RIGHT" : "LEFT";
  } else {
    dir = deltaY > 0 ? "DOWN" : "UP";
  }

  for (const cb of _swipeListeners) {
    cb(dir);
  }
}

export const Input = {
  buffer: [],

  init(target) {
    const el = target || document;
    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("keyup", handleKeyUp);
    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
  },

  destroy(target) {
    const el = target || document;
    el.removeEventListener("keydown", handleKeyDown);
    el.removeEventListener("keyup", handleKeyUp);
    el.removeEventListener("touchstart", handleTouchStart);
    el.removeEventListener("touchmove", handleTouchMove);
    el.removeEventListener("touchend", handleTouchEnd);
    _swipeListeners = [];
    _tapListeners = [];
    this.buffer = [];
  },

  updateFrame() {
    for (const key in _justPressed) delete _justPressed[key];
    for (const key in _justReleased) delete _justReleased[key];
  },

  clearJustPressed() {
    for (const key in _justPressed) delete _justPressed[key];
  },

  isDown(key) {
    return !!_pressed[key];
  },

  justPressed(key) {
    return !!_justPressed[key];
  },

  justReleased(key) {
    return !!_justReleased[key];
  },

  consumeBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer.shift();
  },

  peekBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer[0];
  },

  onSwipe(cb) {
    _swipeListeners.push(cb);
    return () => {
      _swipeListeners = _swipeListeners.filter(l => l !== cb);
    };
  },

  onTap(cb) {
    _tapListeners.push(cb);
    return () => {
      _tapListeners = _tapListeners.filter(l => l !== cb);
    };
  },

  removeSwipe(cb) {
    _swipeListeners = _swipeListeners.filter(l => l !== cb);
  },

  removeTap(cb) {
    _tapListeners = _tapListeners.filter(l => l !== cb);
  },
};
