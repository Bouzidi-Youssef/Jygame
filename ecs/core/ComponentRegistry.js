const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const CANONICAL_TYPES = new Set([
  'f32', 'f64', 'u8', 'u16', 'u32', 'i8', 'i16', 'i32',
]);

const TYPE_ALIASES = {
  float: 'f32',
  double: 'f64',
  bool: 'u8',
  uint: 'u32',
  int: 'i32',
};

const RESERVED_ID_MIN = 1;
const RESERVED_ID_MAX = 63;
const USER_ID_START = 64;
const MAX_COMPONENT_ID = 65535;

export class ComponentRegistry {
  constructor() {
    this._locked = false;
    this._nextId = USER_ID_START;
    this._componentToId = new Map();
    this._idToMetadata = new Map();
    this._nameToId = new Map();
  }

  register(a, b, c) {
    if (this._locked) {
      throw new Error(
        `ComponentRegistry.register failed: registry is locked. ` +
        `Components must be registered before the World starts.`
      );
    }

    let componentClass = null;
    let name;
    let schema;
    let options;

    if (typeof a === 'function' && a.prototype) {
      componentClass = a;
      name = componentClass.name;
      schema = componentClass.schema;
      options = b;
    } else if (typeof a === 'string') {
      name = a;
      schema = b;
      options = c;
    } else {
      throw new TypeError(
        `ComponentRegistry.register failed: first argument must be a class or a string name, ` +
        `got ${typeof a}.`
      );
    }

    if (!name) {
      throw new TypeError(
        `ComponentRegistry.register failed: component name must be a non-empty string. ` +
        `Anonymous classes must use the string registration form.`
      );
    }

    if (schema === undefined || schema === null) {
      schema = {};
    }

    if (
      typeof schema !== 'object' ||
      Array.isArray(schema) ||
      Object.getPrototypeOf(schema) !== Object.prototype
    ) {
      throw new TypeError(
        `ComponentRegistry.register failed: schema must be a plain object, got ${typeof schema}`
      );
    }

    if (this._nameToId.has(name)) {
      throw new Error(
        `ComponentRegistry.register failed: component "${name}" is already registered with id ${this._nameToId.get(name)}.`
      );
    }

    if (componentClass && this._componentToId.has(componentClass)) {
      throw new Error(
        `ComponentRegistry.register failed: component "${name}" is already registered with id ${this._componentToId.get(componentClass)}.`
      );
    }

    let reservedId;
    if (options) {
      reservedId = options.reservedId;
    }

    if (reservedId !== undefined) {
      if (
        typeof reservedId !== 'number' ||
        !Number.isInteger(reservedId) ||
        reservedId < RESERVED_ID_MIN ||
        reservedId > RESERVED_ID_MAX
      ) {
        throw new RangeError(
          `ComponentRegistry.register failed: reservedId must be an integer between ${RESERVED_ID_MIN} and ${RESERVED_ID_MAX}, ` +
          `got ${reservedId}.`
        );
      }
      if (this._idToMetadata.has(reservedId)) {
        const existingMeta = this._idToMetadata.get(reservedId);
        throw new Error(
          `ComponentRegistry.register failed: reservedId ${reservedId} is already in use by component "${existingMeta.name}".`
        );
      }
    }

    let id;
    if (reservedId !== undefined) {
      id = reservedId;
    } else {
      id = this._nextId;
      this._nextId++;
    }

    if (id > MAX_COMPONENT_ID) {
      throw new RangeError(
        `ComponentRegistry.register failed: component ID pool exhausted ` +
        `(max ${MAX_COMPONENT_ID}).`
      );
    }

    const processedSchema = {};
    const fieldNames = Object.keys(schema);

    for (const fieldName of fieldNames) {
      if (!FIELD_NAME_RE.test(fieldName)) {
        throw new Error(
          `ComponentRegistry.register failed: invalid field name "${fieldName}" in component "${name}". ` +
          `Field names must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`
        );
      }

      let fieldType = schema[fieldName];

      if (typeof fieldType !== 'string') {
        throw new TypeError(
          `ComponentRegistry.register failed: invalid field type for field "${fieldName}" in component "${name}". ` +
          `Field type must be a string, got ${typeof fieldType}.`
        );
      }

      const alias = TYPE_ALIASES[fieldType];
      if (alias) {
        fieldType = alias;
      }

      if (!CANONICAL_TYPES.has(fieldType)) {
        throw new TypeError(
          `ComponentRegistry.register failed: invalid field type "${schema[fieldName]}" for field "${fieldName}" ` +
          `in component "${name}". Allowed types: ${[...CANONICAL_TYPES].join(', ')}.`
        );
      }

      if (Object.prototype.hasOwnProperty.call(processedSchema, fieldName)) {
        throw new Error(
          `ComponentRegistry.register failed: duplicate field name "${fieldName}" in component "${name}".`
        );
      }

      processedSchema[fieldName] = fieldType;
    }

    Object.freeze(processedSchema);

    const metadata = Object.freeze({
      id,
      name,
      component: componentClass,
      schema: processedSchema,
    });

    this._idToMetadata.set(id, metadata);
    this._nameToId.set(name, id);

    if (componentClass) {
      this._componentToId.set(componentClass, id);
    }

    return metadata;
  }

  getId(Component) {
    if (typeof Component === 'function') {
      return this._componentToId.get(Component) ?? null;
    }
    if (typeof Component === 'string') {
      return this._nameToId.get(Component) ?? null;
    }
    return null;
  }

  getSchema(Component) {
    const meta = this.getMetadata(Component);
    return meta ? meta.schema : null;
  }

  getMetadata(Component) {
    const id = this.getId(Component);
    if (id === null) return null;
    return this._idToMetadata.get(id) ?? null;
  }

  has(Component) {
    if (typeof Component === 'function') {
      return this._componentToId.has(Component);
    }
    if (typeof Component === 'string') {
      return this._nameToId.has(Component);
    }
    return false;
  }

  lock() {
    this._locked = true;
  }

  isLocked() {
    return this._locked;
  }

  destroy() {
    this._componentToId.clear();
    this._idToMetadata.clear();
    this._nameToId.clear();
    this._locked = false;
    this._nextId = USER_ID_START;
  }

  get componentCount() {
    return this._idToMetadata.size;
  }
}
