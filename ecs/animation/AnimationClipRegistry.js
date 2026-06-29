export class AnimationClipRegistry {
  constructor() {
    this._nameToClip = new Map();
    this._idToClip = new Map();
    this._nameToId = new Map();
    this._nextId = 1;
  }

  register(name, clip) {
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError(
        `AnimationClipRegistry.register failed: name must be a non-empty string, got ${JSON.stringify(name)}.`
      );
    }
    if (this._nameToClip.has(name)) {
      throw new Error(
        `AnimationClipRegistry.register failed: clip "${name}" is already registered.`
      );
    }
    const id = this._nextId++;
    this._nameToClip.set(name, clip);
    this._nameToId.set(name, id);
    this._idToClip.set(id, clip);
    return id;
  }

  get(name) {
    return this._nameToClip.get(name) ?? null;
  }

  getById(id) {
    return this._idToClip.get(id) ?? null;
  }

  getId(name) {
    return this._nameToId.get(name) ?? null;
  }

  has(name) {
    return this._nameToClip.has(name);
  }

  remove(name) {
    const id = this._nameToId.get(name);
    if (id === undefined) return false;
    this._nameToClip.delete(name);
    this._nameToId.delete(name);
    this._idToClip.delete(id);
    return true;
  }

  clear() {
    this._nameToClip.clear();
    this._idToClip.clear();
    this._nameToId.clear();
    this._nextId = 1;
  }

  get count() {
    return this._nameToClip.size;
  }
}
