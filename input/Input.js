export { InputContext } from "./InputContext.js";
import { InputContext } from "./InputContext.js";

let _default = new InputContext();

export const Input = {
  buffer: [],

  setDefault(ctx) { _default = ctx; this.buffer = ctx.buffer; },
  getDefault() { return _default; },

  get x() { return _default.x; },
  get y() { return _default.y; },
  get isPointerDown() { return _default.isPointerDown; },
  get pointerCount() { return _default.pointerCount; },

  init(target) { _default.init(target); this.buffer = _default.buffer; },
  destroy() { _default.destroy(); },
  updateFrame() { _default.updateFrame(); },
  clearJustPressed() { _default.clearJustPressed(); },

  mapKey(rawKey, alias) { _default.mapKey(rawKey, alias); },
  unmapKey(rawKey) { _default.unmapKey(rawKey); },
  setKeyMap(map) { _default.setKeyMap(map); },
  resetKeyMap() { _default.resetKeyMap(); },
  getKeyMap() { return _default.getKeyMap(); },

  isDown(key) { return _default.isDown(key); },
  justPressed(key) { return _default.justPressed(key); },
  justReleased(key) { return _default.justReleased(key); },

  consumeBuffer() { return _default.consumeBuffer(); },
  peekBuffer() { return _default.peekBuffer(); },

  getPointer(id) { return _default.getPointer(id); },
  getPointers() { return _default.getPointers(); },
  forEachPointer(fn) { _default.forEachPointer(fn); },

  onSwipe(cb) { return _default.onSwipe(cb); },
  onTap(cb) { return _default.onTap(cb); },
  removeSwipe(cb) { _default.removeSwipe(cb); },
  removeTap(cb) { _default.removeTap(cb); },
};
