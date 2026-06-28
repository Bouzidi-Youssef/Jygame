const MAX_COMPONENT_ID = 65535;

function validateComponentId(id, context) {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new TypeError(
      `ComponentSignature.${context} failed: component ID must be an integer, got ${id}.`
    );
  }

  if (Number.isNaN(id)) {
    throw new TypeError(
      `ComponentSignature.${context} failed: component ID must not be NaN.`
    );
  }

  if (id < 0) {
    throw new RangeError(
      `ComponentSignature.${context} failed: component ID must be non-negative, got ${id}.`
    );
  }

  if (id === 0) {
    throw new RangeError(
      `ComponentSignature.${context} failed: component ID 0 is reserved and cannot be used.`
    );
  }

  if (id > MAX_COMPONENT_ID) {
    throw new RangeError(
      `ComponentSignature.${context} failed: component ID ${id} exceeds maximum (${MAX_COMPONENT_ID}).`
    );
  }
}

export class ComponentSignature {
  constructor(componentIds = []) {
    if (!Array.isArray(componentIds)) {
      throw new TypeError(
        `ComponentSignature constructor failed: expected an array of component IDs, got ${typeof componentIds}.`
      );
    }

    const ids = [];

    for (let i = 0; i < componentIds.length; i++) {
      const id = componentIds[i];
      validateComponentId(id, 'constructor');

      if (ids.indexOf(id) === -1) {
        ids.push(id);
      }
    }

    ids.sort((a, b) => a - b);

    this._components = new Uint16Array(ids);
    this._key = ids.join(',');

    this._size = ids.length;

    Object.freeze(this);
  }

  get size() {
    return this._size;
  }

  get components() {
    return Array.from(this._components);
  }

  get key() {
    return this._key;
  }

  equals(other) {
    if (this === other) return true;
    if (!(other instanceof ComponentSignature)) return false;
    return this._key === other._key;
  }

  contains(componentId) {
    validateComponentId(componentId, 'contains');

    const arr = this._components;
    let lo = 0;
    let hi = arr.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const val = arr[mid];
      if (val === componentId) return true;
      if (val < componentId) lo = mid + 1;
      else hi = mid - 1;
    }

    return false;
  }

  containsAll(other) {
    if (!(other instanceof ComponentSignature)) {
      throw new TypeError(
        'ComponentSignature.containsAll failed: argument must be a ComponentSignature.'
      );
    }

    if (other._size === 0) return true;
    if (this._size < other._size) return false;

    const a = this._components;
    const b = other._components;
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++;
        j++;
      } else if (a[i] < b[j]) {
        i++;
      } else {
        return false;
      }
    }

    return j === b.length;
  }

  containsAny(other) {
    if (!(other instanceof ComponentSignature)) {
      throw new TypeError(
        'ComponentSignature.containsAny failed: argument must be a ComponentSignature.'
      );
    }

    if (this._size === 0 || other._size === 0) return false;

    const a = this._components;
    const b = other._components;
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) return true;
      if (a[i] < b[j]) i++;
      else j++;
    }

    return false;
  }

  add(componentId) {
    validateComponentId(componentId, 'add');

    if (this.contains(componentId)) return this;

    const arr = this._components;
    const result = new Array(arr.length + 1);
    let inserted = false;
    let ri = 0;

    for (let i = 0; i < arr.length; i++) {
      if (!inserted && componentId < arr[i]) {
        result[ri++] = componentId;
        inserted = true;
      }
      result[ri++] = arr[i];
    }

    if (!inserted) {
      result[ri] = componentId;
    }

    return new ComponentSignature(result);
  }

  remove(componentId) {
    validateComponentId(componentId, 'remove');

    if (!this.contains(componentId)) return this;

    const arr = this._components;
    const result = [];

    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== componentId) {
        result.push(arr[i]);
      }
    }

    return new ComponentSignature(result);
  }

  toString() {
    return `ComponentSignature(${this._key})`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}
