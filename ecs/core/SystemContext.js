class ResourceAccess {
  constructor() {
    this._map = null;
  }

  _bind(map) {
    this._map = map;
  }

  get(key) {
    return this._map ? this._map.get(key) : undefined;
  }

  has(key) {
    return this._map ? this._map.has(key) : false;
  }
}

export class SystemContext {
  constructor(world, system) {
    this._world = world;
    this._system = system;
    this._tables = [];
    this._entityCount = 0;
    this._deltaTime = 0;
    this._columnCache = new Map();
    this._resources = new ResourceAccess();
  }

  get world() {
    return this._world;
  }

  get deltaTime() {
    return this._deltaTime;
  }

  get resources() {
    return this._resources;
  }

  get entityCount() {
    return this._entityCount;
  }

  tables() {
    return this._tables;
  }

  [Symbol.iterator]() {
    let index = 0;
    const tables = this._tables;
    return {
      next() {
        if (index >= tables.length) return { done: true, value: undefined };
        return { done: false, value: tables[index++] };
      },
    };
  }

  entities() {
    const tables = this._tables;
    const result = [];
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const ids = table.entityIds;
      for (let r = 0; r < table.count; r++) {
        result.push(ids[r]);
      }
    }
    return result;
  }

  rows() {
    const tables = this._tables;
    const result = [];
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      for (let r = 0; r < table.count; r++) {
        result.push({ table, row: r });
      }
    }
    return result;
  }

  column(componentClass, fieldName) {
    if (!this._system._compiled) {
      throw new Error(
        `SystemContext.column failed: component "${componentClass.name}" ` +
        `was not compiled into this system's query. Add it to the static query definition.`
      );
    }
    const id = this._system._compiled.componentIds.get(componentClass);
    if (id === undefined) {
      throw new Error(
        `SystemContext.column failed: component "${componentClass.name}" ` +
        `was not compiled into this system's query. Add it to the static query definition.`
      );
    }
    if (this._tables.length !== 1) {
      if (this._tables.length === 0) {
        return null;
      }
      throw new Error(
        `SystemContext.column failed: query matched ${this._tables.length} tables (archetypes). ` +
        `ctx.column() requires exactly one table. Use ctx.tables() + table.getColumn() ` +
        `when queries span multiple archetypes.`
      );
    }
    const key = `${id}:${fieldName}`;
    let col = this._columnCache.get(key);
    if (col === undefined) {
      col = this._tables[0].getColumn(id, fieldName);
      this._columnCache.set(key, col);
    }
    return col;
  }

  get(entity, componentClass) {
    return this._world.getComponent(entity, componentClass);
  }

  has(entity, componentClass) {
    return this._world.hasComponent(entity, componentClass);
  }

  forEach(callback) {
    const tables = this._tables;
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      for (let r = 0; r < table.count; r++) {
        callback(table, r);
      }
    }
  }

  _refresh(dt) {
    this._deltaTime = dt;
    this._columnCache.clear();
    const query = this._system.query;
    if (query) {
      this._tables = this._world.queryEngine.getTables(query);
      let count = 0;
      for (let i = 0; i < this._tables.length; i++) {
        count += this._tables[i].count;
      }
      this._entityCount = count;
    } else {
      this._tables = [];
      this._entityCount = 0;
    }
    this._resources._bind(this._world._resources);
  }
}
