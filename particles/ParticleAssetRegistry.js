import { ParticleAsset } from "./ParticleAsset.js";

const _registry = new Map();

export class ParticleAssetRegistry {
  static define(name, asset) {
    if (typeof name !== "string" || !name) {
      throw new Error("ParticleAssetRegistry.define(): name must be a non-empty string");
    }
    if (!(asset instanceof ParticleAsset)) {
      throw new Error("ParticleAssetRegistry.define(): asset must be a ParticleAsset instance");
    }
    if (_registry.has(name)) {
      throw new Error(`ParticleAssetRegistry.define(): "${name}" is already defined`);
    }
    _registry.set(name, asset);
  }

  static get(name) {
    if (!_registry.has(name)) {
      throw new Error(`ParticleAssetRegistry: Unknown asset "${name}"`);
    }
    return _registry.get(name);
  }

  static spawn(name, options = {}) {
    const asset = this.get(name);
    return asset.spawn(options);
  }

  static remove(name) {
    _registry.delete(name);
  }

  static has(name) {
    return _registry.has(name);
  }

  static clear() {
    _registry.clear();
  }
}
