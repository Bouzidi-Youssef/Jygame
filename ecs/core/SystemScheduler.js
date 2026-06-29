import { ComponentSignature } from "./ComponentSignature.js";
import { System } from "./System.js";
import { SystemContext } from "./SystemContext.js";

export class SystemScheduler {
  constructor(queryEngine, componentRegistry) {
    if (!queryEngine || typeof queryEngine.createQuery !== 'function') {
      throw new TypeError(
        'SystemScheduler constructor failed: queryEngine must be a valid QueryEngine instance.'
      );
    }

    if (!componentRegistry || typeof componentRegistry.getId !== 'function') {
      throw new TypeError(
        'SystemScheduler constructor failed: componentRegistry must be a valid ComponentRegistry instance.'
      );
    }

    this._queryEngine = queryEngine;
    this._componentRegistry = componentRegistry;
    this._systems = [];
    this._sortedSystems = [];
    this._needsSort = false;
    this._insideUpdate = false;
    this._world = null;
  }

  get systemCount() {
    return this._systems.length;
  }

  get world() {
    return this._world;
  }

  set world(w) {
    this._world = w;
    for (let i = 0; i < this._systems.length; i++) {
      const ctx = this._systems[i]._ctx;
      ctx._world = w;
      ctx._resources._bind(w ? w._resources : null);
    }
  }

  add(system) {
    if (this._insideUpdate) {
      throw new Error(
        'SystemScheduler.add failed: cannot add systems during update().'
      );
    }

    if (!(system instanceof System)) {
      throw new TypeError(
        'SystemScheduler.add failed: system must be a System instance.'
      );
    }

    if (this.has(system)) {
      throw new Error(
        'SystemScheduler.add failed: system is already registered.'
      );
    }

    this._compileQuery(system);

    if (!system._ctx) {
      system._ctx = new SystemContext(this._world, system);
    } else {
      system._ctx._world = this._world;
      system._ctx._resources._bind(this._world ? this._world._resources : null);
    }

    this._systems.push(system);
    this._needsSort = true;

    if (this._world) {
      system.onAdded(this._world);
    }
  }

  remove(system) {
    if (this._insideUpdate) {
      throw new Error(
        'SystemScheduler.remove failed: cannot remove systems during update().'
      );
    }

    const index = this._systems.indexOf(system);
    if (index === -1) {
      throw new Error(
        'SystemScheduler.remove failed: system is not registered.'
      );
    }

    this._systems.splice(index, 1);
    this._needsSort = true;

    if (this._world) {
      system.onRemoved(this._world);
    }
  }

  has(system) {
    return this._systems.indexOf(system) !== -1;
  }

  clear() {
    if (this._insideUpdate) {
      throw new Error(
        'SystemScheduler.clear failed: cannot clear systems during update().'
      );
    }

    if (this._world) {
      for (let i = 0; i < this._systems.length; i++) {
        this._systems[i].onRemoved(this._world);
      }
    }

    this._systems.length = 0;
    this._sortedSystems.length = 0;
    this._needsSort = false;
  }

  update(dt) {
    if (this._insideUpdate) {
      throw new Error(
        'SystemScheduler.update failed: recursive update() is not allowed.'
      );
    }

    if (!this._world) {
      throw new Error(
        'SystemScheduler.update failed: world reference is not set.'
      );
    }

    this._insideUpdate = true;
    try {
      if (this._needsSort) {
        this._sortSystems();
      }

      const systems = this._sortedSystems;
      for (let i = 0; i < systems.length; i++) {
        const system = systems[i];
        if (!system.enabled) continue;
        system._ctx._refresh(dt);
        system.update(system._ctx, dt);
      }
    } finally {
      this._insideUpdate = false;
    }
  }

  _compileQuery(system) {
    const queryDef = system.constructor.query;
    if (!queryDef) return;

    const resolved = {};
    const componentIds = new Map();
    if (queryDef.all) {
      resolved.all = queryDef.all.map(c => {
        const id = this._resolveComponent(c);
        componentIds.set(c, id);
        return id;
      });
    }
    if (queryDef.any) {
      resolved.any = queryDef.any.map(c => {
        const id = this._resolveComponent(c);
        componentIds.set(c, id);
        return id;
      });
    }
    if (queryDef.none) {
      resolved.none = queryDef.none.map(c => {
        const id = this._resolveComponent(c);
        componentIds.set(c, id);
        return id;
      });
    }

    system._compiled = Object.freeze({
      query: this._queryEngine.createQuery(resolved),
      componentIds,
      priority: system.priority,
    });
  }

  _resolveComponent(component) {
    if (typeof component === 'number') return component;

    const id = this._componentRegistry.getId(component);
    if (id === null) {
      const name = typeof component === 'function' ? component.name : String(component);
      throw new Error(
        `SystemScheduler query compilation failed: component "${name}" is not registered.`
      );
    }
    return id;
  }

  _sortSystems() {
    this._sortedSystems = [...this._systems].sort((a, b) => a.priority - b.priority);
    this._needsSort = false;
  }
}
