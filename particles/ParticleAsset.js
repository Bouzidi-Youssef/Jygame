import { ModifierStack } from "../modifiers/ModifierStack.js";
import { ModifierRegistry } from "../modifiers/ModifierRegistry.js";
import { ShapeRegistry } from "../shapes/ShapeRegistry.js";
import { ParticleEffect } from "./ParticleEffect.js";

const _assetVersion = 1;

export class ParticleAsset {
  constructor({
    capacity = 256,
    modifiers,
    modifierStack,
    shape,
    emitter = {},
    initializer,
    renderParticle,
    renderer,
    backend,
    displayName,
    description,
  } = {}) {
    this._capacity = capacity;
    this._emitterConfig = { ...emitter };
    this._displayName = displayName || "";
    this._description = description || "";
    this._initializer = initializer || null;
    this._renderParticle = renderParticle || null;
    this._renderer = renderer || null;
    this._backend = backend || null;
    this._shape = shape || null;

    if (modifierStack) {
      if (!(modifierStack instanceof ModifierStack)) {
        throw new Error("ParticleAsset: modifierStack must be a ModifierStack instance");
      }
      this._modifierStack = modifierStack;
    } else if (modifiers && modifiers.length > 0) {
      this._modifierStack = new ModifierStack(modifiers);
    } else {
      this._modifierStack = null;
    }
  }

  spawn(options = {}) {
    return new ParticleEffect({
      asset: this,
      x: options.x ?? 0,
      y: options.y ?? 0,
      renderer: options.renderer ?? this._renderer,
      backend: options.backend ?? this._backend,
    });
  }

  burst(options = {}) {
    const count = options.count ?? 1;
    const fx = this.spawn(options);
    fx.emit(count);
    fx.destroyWhenFinished();
    return fx;
  }

  variant(overrides = {}) {
    return new ParticleAsset({
      capacity: overrides.capacity ?? this._capacity,
      shape: overrides.shape ?? this._shape,
      modifierStack: overrides.modifierStack ?? (overrides.modifiers ? undefined : this._modifierStack),
      modifiers: overrides.modifiers,
      emitter: { ...this._emitterConfig, ...overrides.emitter },
      initializer: overrides.initializer ?? this._initializer,
      renderParticle: overrides.renderParticle ?? this._renderParticle,
      renderer: overrides.renderer ?? this._renderer,
      backend: overrides.backend ?? this._backend,
      displayName: overrides.displayName ?? this._displayName,
      description: overrides.description ?? this._description,
    });
  }

  get displayName() { return this._displayName; }
  set displayName(v) { this._displayName = v; }

  get description() { return this._description; }
  set description(v) { this._description = v; }

  toJSON() {
    const obj = { type: "ParticleAsset", version: _assetVersion, capacity: this._capacity };
    if (this._modifierStack) {
      obj.modifierStack = this._modifierStack.toJSON();
    }
    if (this._shape) {
      obj.shape = this._shape.toJSON();
    }
    if (this._displayName) obj.displayName = this._displayName;
    if (this._description) obj.description = this._description;
    if (this._initializer) {
      throw new Error("ParticleAsset.toJSON(): assets with custom initializer functions cannot be serialized");
    }
    if (this._renderParticle) {
      throw new Error("ParticleAsset.toJSON(): assets with custom renderParticle functions cannot be serialized");
    }
    if (this._renderer) {
      throw new Error("ParticleAsset.toJSON(): assets with custom renderer instances cannot be serialized");
    }
    if (this._backend) {
      throw new Error("ParticleAsset.toJSON(): assets with custom backend instances cannot be serialized");
    }
    if (Object.keys(this._emitterConfig).length > 0) {
      obj.emitter = { ...this._emitterConfig };
    }
    return obj;
  }

  static fromJSON(data) {
    const opts = {};
    if (data.capacity !== undefined) opts.capacity = data.capacity;
    if (data.displayName) opts.displayName = data.displayName;
    if (data.description) opts.description = data.description;
    if (data.modifierStack) {
      opts.modifierStack = ModifierRegistry.create(data.modifierStack);
    }
    if (data.shape) {
      opts.shape = ShapeRegistry.create(data.shape);
    }
    if (data.emitter) {
      opts.emitter = data.emitter;
    }
    return new ParticleAsset(opts);
  }
}
