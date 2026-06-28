const SLOT_MASK = 0xFFFFFF;
const GEN_SHIFT = 24;
const NULL_ENTITY = 0;
const INVALID_ARCHETYPE = 0;
const DEFAULT_INITIAL_CAPACITY = 64;
const DEFAULT_MAX_ENTITIES = 1_000_000;
const MAX_SLOTS = 0x1000000;

export class EntityManager {
  constructor(options = {}) {
    const initialCapacity = options.initialCapacity ?? DEFAULT_INITIAL_CAPACITY;
    const maxEntities = options.maxEntities ?? DEFAULT_MAX_ENTITIES;

    if (!Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new RangeError(
        `EntityManager constructor failed: initialCapacity must be a positive integer, got ${initialCapacity}.`
      );
    }
    if (!Number.isInteger(maxEntities) || maxEntities < 1) {
      throw new RangeError(
        `EntityManager constructor failed: maxEntities (${maxEntities}) must be at least 1.`
      );
    }
    if (maxEntities > MAX_SLOTS) {
      throw new RangeError(
        `EntityManager constructor failed: maxEntities (${maxEntities}) exceeds maximum supported slots (${MAX_SLOTS}).`
      );
    }

    this._maxEntities = maxEntities;
    this._capacity = initialCapacity;
    this._aliveCount = 0;
    this._nextSlot = 1;

    this._freeList = new Uint32Array(initialCapacity);
    this._freeCount = 0;

    this._archetype = new Uint32Array(initialCapacity);
    this._row = new Uint32Array(initialCapacity);
    this._gen = new Uint8Array(initialCapacity);
  }

  create() {
    let slot;

    if (this._aliveCount >= this._maxEntities) {
      throw new Error(
        `EntityManager.create failed: maximum entity count (${this._maxEntities}) reached.`
      );
    }

    if (this._freeCount > 0) {
      this._freeCount--;
      slot = this._freeList[this._freeCount];
    } else {
      if (this._nextSlot >= this._capacity) {
        this._grow();
      }
      slot = this._nextSlot;
      this._nextSlot++;
    }

    const gen = this._gen[slot];
    const entity = ((gen << GEN_SHIFT) | slot) >>> 0;
    this._aliveCount++;

    return entity;
  }

  destroy(entity) {
    if (arguments.length === 0) {
      this._freeList = new Uint32Array(DEFAULT_INITIAL_CAPACITY);
      this._freeCount = 0;
      this._archetype = new Uint32Array(DEFAULT_INITIAL_CAPACITY);
      this._row = new Uint32Array(DEFAULT_INITIAL_CAPACITY);
      this._gen = new Uint8Array(DEFAULT_INITIAL_CAPACITY);
      this._capacity = DEFAULT_INITIAL_CAPACITY;
      this._aliveCount = 0;
      this._nextSlot = 1;
      return;
    }

    if (!this._isValidEntityNumber(entity)) return;
    if (entity === NULL_ENTITY) return;

    const slot = entity & SLOT_MASK;
    if (slot === 0) return;
    if (slot >= this._capacity) return;

    const gen = entity >>> GEN_SHIFT;
    if (this._gen[slot] !== gen) return;

    this._aliveCount--;
    this._gen[slot] = gen + 1;
    this._archetype[slot] = INVALID_ARCHETYPE;
    this._row[slot] = 0;

    this._freeList[this._freeCount] = slot;
    this._freeCount++;
  }

  isAlive(entity) {
    if (typeof entity !== 'number' || !Number.isInteger(entity) || entity < 0) {
      return false;
    }

    const slot = entity & SLOT_MASK;
    if (slot === 0) return false;
    if (slot >= this._capacity) return false;

    const gen = entity >>> GEN_SHIFT;
    return this._gen[slot] === gen;
  }

  setLocation(entity, archetypeId, row) {
    this._validateEntity(entity, 'setLocation');

    const slot = entity & SLOT_MASK;
    this._archetype[slot] = archetypeId;
    this._row[slot] = row;
  }

  getLocation(entity) {
    if (typeof entity !== 'number' || !Number.isInteger(entity) || entity < 0) {
      return null;
    }

    const slot = entity & SLOT_MASK;
    if (slot === 0) return null;
    if (slot >= this._capacity) return null;

    const gen = entity >>> GEN_SHIFT;
    if (this._gen[slot] !== gen) return null;

    return { archetype: this._archetype[slot], row: this._row[slot] };
  }

  getArchetype(entity) {
    const loc = this.getLocation(entity);
    return loc ? loc.archetype : null;
  }

  getRow(entity) {
    const loc = this.getLocation(entity);
    return loc ? loc.row : null;
  }

  get aliveCount() {
    return this._aliveCount;
  }

  get capacity() {
    return this._capacity;
  }

  _grow() {
    const newCapacity = this._capacity * 2;

    if (newCapacity > MAX_SLOTS) {
      throw new Error(
        `EntityManager._grow failed: cannot grow beyond maximum slot count (${MAX_SLOTS}).`
      );
    }

    const newArchetype = new Uint32Array(newCapacity);
    const newRow = new Uint32Array(newCapacity);
    const newGen = new Uint8Array(newCapacity);

    newArchetype.set(this._archetype);
    newRow.set(this._row);
    newGen.set(this._gen);

    const newFreeList = new Uint32Array(newCapacity);
    newFreeList.set(this._freeList.subarray(0, this._freeCount));

    this._archetype = newArchetype;
    this._row = newRow;
    this._gen = newGen;
    this._freeList = newFreeList;
    this._capacity = newCapacity;
  }

  _isValidEntityNumber(entity) {
    return typeof entity === 'number' && Number.isInteger(entity) && entity >= 0;
  }

  _validateEntity(entity, operation) {
    if (!this._isValidEntityNumber(entity)) {
      throw new TypeError(
        `EntityManager.${operation} failed: invalid entity ID ${entity}. ` +
        `Entity ID must be a non-negative integer.`
      );
    }

    const slot = entity & SLOT_MASK;
    if (slot === 0) {
      throw new Error(
        `EntityManager.${operation} failed: entity ID 0 is reserved as a null sentinel.`
      );
    }

    if (slot >= this._capacity) {
      throw new Error(
        `EntityManager.${operation} failed: entity ID ${entity} is invalid ` +
        `(slot ${slot} exceeds capacity ${this._capacity}).`
      );
    }

    const gen = entity >>> GEN_SHIFT;
    if (this._gen[slot] !== gen) {
      throw new Error(
        `EntityManager.${operation}(${entity}) failed: stale entity (generation mismatch). ` +
        `Entity was already destroyed. Call isAlive() to check before operating.`
      );
    }
  }
}
