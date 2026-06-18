import { ModifierRegistry } from "./ModifierRegistry.js";
import { hasLifecycleMethods } from "./ModifierUtils.js";

export class ModifierStack {
  constructor(modifiers = []) {
    this._modifiers = [];
    this.enabled = true;
    this.priority = 0;

    for (const mod of modifiers) {
      this._validate(mod);
      this._modifiers.push(mod);
    }
    this._sort();
  }

  _validate(mod) {
    if (!mod || typeof mod !== 'object') {
      throw new Error("ModifierStack: each modifier must be a non-null object");
    }
    if (!hasLifecycleMethods(mod)) {
      throw new Error("ModifierStack: modifier must implement at least one lifecycle method (beginFrame, update, onEmit, onDeath, or endFrame)");
    }
  }

  _sort() {
    this._modifiers.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  get size() {
    return this._modifiers.length;
  }

  get modifiers() {
    return this._modifiers.slice();
  }

  add(modifier) {
    this._validate(modifier);
    this._modifiers.push(modifier);
    this._sort();
  }

  remove(modifier) {
    const idx = this._modifiers.indexOf(modifier);
    if (idx >= 0) {
      if (typeof modifier.destroy === 'function') modifier.destroy();
      this._modifiers.splice(idx, 1);
    }
  }

  clear() {
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      if (typeof mods[i].destroy === 'function') mods[i].destroy();
    }
    this._modifiers.length = 0;
  }

  has(modifier) {
    return this._modifiers.indexOf(modifier) >= 0;
  }

  contains(modifier) {
    for (const mod of this._modifiers) {
      if (mod === modifier) return true;
      if (mod instanceof ModifierStack && mod.contains(modifier)) return true;
    }
    return false;
  }

  [Symbol.iterator]() {
    return this._modifiers[Symbol.iterator]();
  }

  beginFrame(dt, ctx) {
    if (!this.enabled) return;
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      if (mod.enabled !== false && typeof mod.beginFrame === 'function') {
        mod.beginFrame(dt, ctx);
      }
    }
  }

  update(particle, dt, ctx) {
    if (!this.enabled) return;
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      if (mod.enabled !== false && typeof mod.update === 'function') {
        mod.update(particle, dt, ctx);
      }
    }
  }

  onEmit(particle, ctx) {
    if (!this.enabled) return;
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      if (mod.enabled !== false && typeof mod.onEmit === 'function') {
        mod.onEmit(particle, ctx);
      }
    }
  }

  onDeath(particle, ctx) {
    if (!this.enabled) return;
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      if (mod.enabled !== false && typeof mod.onDeath === 'function') {
        mod.onDeath(particle, ctx);
      }
    }
  }

  endFrame(dt, ctx) {
    if (!this.enabled) return;
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      if (mod.enabled !== false && typeof mod.endFrame === 'function') {
        mod.endFrame(dt, ctx);
      }
    }
  }

  destroy() {
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      if (typeof mods[i].destroy === 'function') {
        mods[i].destroy();
      }
    }
    this._modifiers.length = 0;
  }

  clone() {
    const cloned = [];
    for (let i = 0; i < this._modifiers.length; i++) {
      const mod = this._modifiers[i];
      if (typeof mod.clone === 'function') {
        cloned.push(mod.clone());
      } else {
        throw new Error(
          `ModifierStack.clone(): Modifier ${mod.constructor.name} does not implement clone()`
        );
      }
    }
    return new ModifierStack(cloned);
  }

  toJSON() {
    const children = [];
    for (let i = 0; i < this._modifiers.length; i++) {
      const mod = this._modifiers[i];
      if (typeof mod.toJSON !== "function") {
        throw new Error(
          `ModifierStack.toJSON(): Modifier ${mod.constructor.name} does not implement toJSON()`
        );
      }
      children.push(mod.toJSON());
    }
    const obj = { type: "ModifierStack", modifiers: children };
    if (this.priority !== undefined) obj.priority = this.priority;
    if (this.enabled !== true) obj.enabled = false;
    return obj;
  }

  static fromJSON(data) {
    if (!Array.isArray(data.modifiers)) {
      throw new Error("ModifierStack.fromJSON(): data.modifiers must be an array");
    }
    const children = data.modifiers.map(child => ModifierRegistry.create(child));
    const stack = new ModifierStack(children);
    if (data.priority !== undefined) stack.priority = data.priority;
    if (data.enabled === false) stack.enabled = false;
    return stack;
  }
}

ModifierRegistry.register("ModifierStack", ModifierStack);
