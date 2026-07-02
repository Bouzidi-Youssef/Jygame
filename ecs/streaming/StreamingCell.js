export class StreamingCell {
  constructor(name, manager) {
    this._name = name;
    this._manager = manager;
    this._loaded = false;
    this._entityIds = new Set();
  }

  get name() {
    return this._name;
  }

  get loaded() {
    return this._loaded;
  }

  get entityCount() {
    return this._entityIds.size;
  }

  get entities() {
    return this._entityIds;
  }

  addEntity(entity) {
    if (typeof entity !== 'number' || entity < 1 || !this._manager._world.isAlive(entity)) {
      throw new Error(
        `StreamingCell.addEntity failed: entity ${entity} is not a valid living entity ID.`
      );
    }

    const currentOwner = this._manager._entityToCell.get(entity);
    if (currentOwner !== undefined) {
      if (currentOwner !== this) {
        throw new Error(
          `StreamingCell.addEntity failed: entity ${entity} already belongs to cell "${currentOwner._name}".`
        );
      }
      return;
    }

    this._entityIds.add(entity);
    this._manager._entityToCell.set(entity, this);
  }

  removeEntity(entity) {
    if (this._entityIds.has(entity)) {
      this._entityIds.delete(entity);
      this._manager._entityToCell.delete(entity);
    }
  }

  clear() {
    for (const entity of this._entityIds) {
      this._manager._entityToCell.delete(entity);
    }
    this._entityIds.clear();
  }

  contains(entity) {
    return this._entityIds.has(entity);
  }
}
