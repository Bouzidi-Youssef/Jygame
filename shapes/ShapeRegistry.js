import { CircleShape } from "./CircleShape.js";
import { RingShape } from "./RingShape.js";
import { RectangleShape } from "./RectangleShape.js";
import { LineShape } from "./LineShape.js";
import { ConeShape } from "./ConeShape.js";
import { PolygonShape } from "./PolygonShape.js";
import { PathShape } from "./PathShape.js";
import { SplineShape } from "./SplineShape.js";

const _registry = new Map();
const _builtinNames = new Set();

const _builtins = [
  ["CircleShape", CircleShape],
  ["RingShape", RingShape],
  ["RectangleShape", RectangleShape],
  ["LineShape", LineShape],
  ["ConeShape", ConeShape],
  ["PolygonShape", PolygonShape],
  ["PathShape", PathShape],
  ["SplineShape", SplineShape],
];

for (const [name, ctor] of _builtins) {
  _registry.set(name, ctor);
  _builtinNames.add(name);
}

export class ShapeRegistry {
  static register(name, ctor) {
    if (typeof name !== "string" || !name) {
      throw new Error("ShapeRegistry.register(): name must be a non-empty string");
    }
    if (typeof ctor !== "function") {
      throw new Error("ShapeRegistry.register(): constructor must be a function");
    }
    if (_registry.has(name)) {
      throw new Error(`ShapeRegistry.register(): "${name}" is already registered`);
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
      throw new Error(`ShapeRegistry: Unknown shape type "${name}"`);
    }
    return _registry.get(name);
  }

  static create(data) {
    if (!data || typeof data !== "object") {
      throw new Error("ShapeRegistry.create(): data must be a non-null object");
    }
    const ctor = _registry.get(data.type);
    if (!ctor) {
      throw new Error(`ShapeRegistry: Unknown shape type "${data.type}"`);
    }
    if (typeof ctor.fromJSON !== "function") {
      throw new Error(`ShapeRegistry: Shape "${data.type}" does not implement fromJSON()`);
    }
    return ctor.fromJSON(data);
  }

  static clear() {
    for (const name of _registry.keys()) {
      if (!_builtinNames.has(name)) _registry.delete(name);
    }
  }
}
