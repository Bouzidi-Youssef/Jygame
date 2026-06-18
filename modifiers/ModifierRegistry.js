import { FadeModifier } from "./FadeModifier.js";
import { ScaleModifier } from "./ScaleModifier.js";
import { ColorModifier } from "./ColorModifier.js";
import { RotationModifier } from "./RotationModifier.js";
import { VelocityModifier } from "./VelocityModifier.js";
import { WindModifier } from "./WindModifier.js";
import { TurbulenceModifier } from "./TurbulenceModifier.js";
import { ForceModifier } from "./ForceModifier.js";
import { AttractionModifier } from "./AttractionModifier.js";
import { OrbitModifier } from "./OrbitModifier.js";
import { AnimationModifier } from "./AnimationModifier.js";
import { SpawnModifier } from "./SpawnModifier.js";
import { TrailModifier } from "./TrailModifier.js";
import { AnimatedSpriteModifier } from "./AnimatedSpriteModifier.js";
import { CollisionModifier } from "./CollisionModifier.js";

const _registry = new Map();
const _builtinNames = new Set();

const _builtins = [
  ["FadeModifier", FadeModifier],
  ["ScaleModifier", ScaleModifier],
  ["ColorModifier", ColorModifier],
  ["RotationModifier", RotationModifier],
  ["VelocityModifier", VelocityModifier],
  ["WindModifier", WindModifier],
  ["TurbulenceModifier", TurbulenceModifier],
  ["ForceModifier", ForceModifier],
  ["AttractionModifier", AttractionModifier],
  ["OrbitModifier", OrbitModifier],
  ["AnimationModifier", AnimationModifier],
  ["SpawnModifier", SpawnModifier],
  ["TrailModifier", TrailModifier],
  ["AnimatedSpriteModifier", AnimatedSpriteModifier],
  ["CollisionModifier", CollisionModifier],
];

for (const [name, ctor] of _builtins) {
  _registry.set(name, ctor);
  _builtinNames.add(name);
}

export class ModifierRegistry {
  static register(name, ctor) {
    if (typeof name !== "string" || !name) {
      throw new Error("ModifierRegistry.register(): name must be a non-empty string");
    }
    if (typeof ctor !== "function") {
      throw new Error("ModifierRegistry.register(): constructor must be a function");
    }
    if (_registry.has(name)) {
      throw new Error(`ModifierRegistry.register(): "${name}" is already registered`);
    }
    _registry.set(name, ctor);
  }

  static unregister(name) {
    _registry.delete(name);
  }

  static has(name) {
    return _registry.has(name);
  }

  static get(name) {
    if (!_registry.has(name)) {
      throw new Error(`ModifierRegistry: Unknown modifier type "${name}"`);
    }
    return _registry.get(name);
  }

  static create(data) {
    if (!data || typeof data !== "object") {
      throw new Error("ModifierRegistry.create(): data must be a non-null object");
    }
    const ctor = _registry.get(data.type);
    if (!ctor) {
      throw new Error(`ModifierRegistry: Unknown modifier type "${data.type}"`);
    }
    if (typeof ctor.fromJSON !== "function") {
      throw new Error(`ModifierRegistry: Modifier "${data.type}" does not implement fromJSON()`);
    }
    return ctor.fromJSON(data);
  }

  static clear() {
    for (const name of _registry.keys()) {
      if (!_builtinNames.has(name)) _registry.delete(name);
    }
  }
}
