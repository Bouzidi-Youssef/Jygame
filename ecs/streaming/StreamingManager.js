import { StreamingCell } from "./StreamingCell.js";

export class StreamingManager {
  constructor(world) {
    this._world = world;
    this._cells = new Map();
    this._entityToCell = new Map();

    this._onDestroyed = (entity) => this._onEntityDestroyed(entity);
    world.onEntityDestroyed(this._onDestroyed);
  }

  createCell(name) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(
        `StreamingManager.createCell failed: cell name must be a non-empty string, got ${typeof name}.`
      );
    }

    if (this._cells.has(name)) {
      throw new Error(
        `StreamingManager.createCell failed: cell "${name}" already exists.`
      );
    }

    const cell = new StreamingCell(name, this);
    this._cells.set(name, cell);
    return cell;
  }

  getCell(name) {
    return this._cells.get(name) || null;
  }

  hasCell(name) {
    return this._cells.has(name);
  }

  destroyCell(name) {
    const cell = this._cells.get(name);
    if (!cell) {
      throw new Error(
        `StreamingManager.destroyCell failed: cell "${name}" not found.`
      );
    }

    if (cell._loaded) {
      this.unload(name);
    }

    this._cells.delete(name);
  }

  load(name) {
    const cell = this._cells.get(name);
    if (!cell) {
      throw new Error(
        `StreamingManager.load failed: cell "${name}" not found.`
      );
    }

    cell._loaded = true;
  }

  unload(name) {
    const cell = this._cells.get(name);
    if (!cell) {
      throw new Error(
        `StreamingManager.unload failed: cell "${name}" not found.`
      );
    }

    if (!cell._loaded) return;

    const entities = [...cell._entityIds];
    cell._entityIds.clear();
    for (let i = 0; i < entities.length; i++) {
      this._entityToCell.delete(entities[i]);
      this._world.destroyEntity(entities[i]);
    }

    cell._loaded = false;
  }

  loadAll() {
    for (const cell of this._cells.values()) {
      cell._loaded = true;
    }
  }

  unloadAll() {
    const names = [...this._cells.keys()];
    for (let i = 0; i < names.length; i++) {
      this.unload(names[i]);
    }
  }

  loadedCells() {
    const result = [];
    for (const cell of this._cells.values()) {
      if (cell._loaded) {
        result.push(cell);
      }
    }
    return result;
  }

  get cellCount() {
    return this._cells.size;
  }

  _onEntityDestroyed(entity) {
    const cell = this._entityToCell.get(entity);
    if (cell !== undefined) {
      cell._entityIds.delete(entity);
      this._entityToCell.delete(entity);
    }
  }
}
