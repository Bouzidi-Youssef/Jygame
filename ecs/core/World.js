import { ComponentSignature } from "./ComponentSignature.js";
import { ComponentRegistry } from "./ComponentRegistry.js";
import { EntityManager } from "./EntityManager.js";
import { ArchetypeSystem } from "./ArchetypeSystem.js";
import { QueryEngine } from "./QueryEngine.js";
import { QueryView } from "./QueryView.js";
import { SystemScheduler } from "./SystemScheduler.js";
import { Events } from "../events/Events.js";
import { Prefab } from "../prefab/Prefab.js";
import { Serializer } from "../serialization/Serializer.js";
import { Transform } from "../components/Transform.js";
import { HierarchyGraph } from "../hierarchy/HierarchyGraph.js";
import { StreamingManager } from "../streaming/StreamingManager.js";

export class World {
  constructor(options = {}) {
    const parsed = {};

    if (options.initialCapacity !== undefined) {
      parsed.initialCapacity = options.initialCapacity;
    }
    if (options.maxEntities !== undefined) {
      parsed.maxEntities = options.maxEntities;
    }

    parsed.initialTableCapacity = options.initialTableCapacity ?? 64;

    if (typeof parsed.initialTableCapacity !== 'number' || !Number.isInteger(parsed.initialTableCapacity) || parsed.initialTableCapacity < 1) {
      throw new RangeError(
        `World constructor failed: initialTableCapacity must be a positive integer, got ${parsed.initialTableCapacity}.`
      );
    }

    this._registry = new ComponentRegistry();
    this._entityManager = new EntityManager(parsed);
    this._archetypeSystem = new ArchetypeSystem(
      this._registry,
      this._entityManager,
      { initialTableCapacity: parsed.initialTableCapacity }
    );
    this._queryEngine = new QueryEngine(this._archetypeSystem);
    this._scheduler = new SystemScheduler(this._queryEngine, this._registry);
    this._scheduler.world = this;

    this._archetypeSystem.onArchetypeCreated = (archetype) => {
      this._queryEngine.onArchetypeCreated(archetype);
    };

    this._viewCache = new Map();
    this._queryViewCache = new WeakMap();
    this._resources = new Map();
    this._events = new Events();
    this._prefabs = new Map();
    this._hierarchy = null;
    this._onComponentSet = null;
    this._transformId = null;
    this._entityDestroyedCallbacks = [];
  }

  get registry() {
    return this._registry;
  }

  get entityManager() {
    return this._entityManager;
  }

  get archetypeSystem() {
    return this._archetypeSystem;
  }

  get queryEngine() {
    return this._queryEngine;
  }

  get scheduler() {
    return this._scheduler;
  }

  get events() {
    return this._events;
  }

  get hierarchy() {
    return this._hierarchy;
  }

  initHierarchy() {
    if (this._hierarchy) return this._hierarchy;
    this._hierarchy = new HierarchyGraph(this);
    this.setResource(HierarchyGraph, this._hierarchy);
    this._transformId = this._registry.getId(Transform);
    this._onComponentSet = (entity, componentId) => {
      if (componentId === this._transformId && this._hierarchy) {
        this._hierarchy.markDirtyRecursive(entity);
      }
    };
    return this._hierarchy;
  }

  onEntityDestroyed(callback) {
    this._entityDestroyedCallbacks.push(callback);
  }

  offEntityDestroyed(callback) {
    const idx = this._entityDestroyedCallbacks.indexOf(callback);
    if (idx !== -1) {
      this._entityDestroyedCallbacks.splice(idx, 1);
    }
  }

  registerEvent(eventClass, options = {}) {
    this._events.register(eventClass, options);
  }

  createPrefab(name) {
    if (this._prefabs.has(name)) {
      throw new Error(
        `World.createPrefab failed: prefab "${name}" already exists.`
      );
    }
    const prefab = new Prefab(name);
    this._prefabs.set(name, prefab);
    return prefab;
  }

  instantiate(name, overrides = null) {
    const prefab = this._prefabs.get(name);
    if (!prefab) {
      throw new Error(
        `World.instantiate failed: prefab "${name}" not found.`
      );
    }
    return prefab.instantiate(this, overrides);
  }

  serialize() {
    return Serializer.serialize(this);
  }

  deserialize(json) {
    return Serializer.deserialize(this, json);
  }

  setResource(key, value) {
    if (key === null || key === undefined) {
      throw new TypeError(
        `World.setResource failed: resource key cannot be null or undefined.`
      );
    }
    this._resources.set(key, value);
  }

  getResource(key) {
    return this._resources.get(key);
  }

  removeResource(key) {
    this._resources.delete(key);
  }

  hasResource(key) {
    return this._resources.has(key);
  }

  clearResources() {
    this._resources.clear();
  }

  register(...args) {
    return this._registry.register(...args);
  }

  createEntity() {
    this._registry.lock();

    const entity = this._entityManager.create();
    const emptySig = new ComponentSignature([]);
    const emptyTable = this._archetypeSystem.getTable(emptySig);
    const row = emptyTable.allocate();
    emptyTable.setEntity(row, entity);
    this._entityManager.setLocation(entity, 1, row);

    return entity;
  }

  destroyEntity(entity) {
    if (!this._entityManager.isAlive(entity)) {
      return;
    }

    if (this._hierarchy) {
      this._hierarchy.onEntityDestroyed(entity);
    }

    const cbs = this._entityDestroyedCallbacks;
    for (let i = 0; i < cbs.length; i++) {
      cbs[i](entity);
    }

    const archetypeId = this._entityManager.getArchetype(entity);
    const row = this._entityManager.getRow(entity);
    const table = this._archetypeSystem.getTableById(archetypeId);

    this._clearEntityCache(entity);

    const result = table.removeRow(row);
    if (result.moved) {
      this._entityManager.setLocation(result.entity, archetypeId, row);
    }

    this._entityManager.destroy(entity);
  }

  isAlive(entity) {
    return this._entityManager.isAlive(entity);
  }

  addComponent(entity, component) {
    const componentId = this._resolveComponentId(component, 'addComponent');

    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.addComponent failed: entity ${entity} is not alive.`
      );
    }

    const currentSig = this._archetypeSystem.entitySignature(entity);
    if (!currentSig) {
      throw new Error(
        `World.addComponent failed: entity ${entity} has no signature.`
      );
    }

    if (currentSig.contains(componentId)) {
      return;
    }

    const newSig = currentSig.add(componentId);

    this._clearEntityCache(entity);
    this._archetypeSystem.moveEntity(entity, newSig);

    const table = this._archetypeSystem.entityTable(entity);
    const row = this._entityManager.getRow(entity);
    const schema = this._registry.getSchemaById(componentId);
    if (schema) {
      const fieldNames = Object.keys(schema);
      for (let fi = 0; fi < fieldNames.length; fi++) {
        const fieldName = fieldNames[fi];
        const col = table.getColumn(componentId, fieldName);
        if (col) {
          col[row] = 0;
        }
      }
    }
  }

  removeComponent(entity, component) {
    const componentId = this._resolveComponentId(component, 'removeComponent');

    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.removeComponent failed: entity ${entity} is not alive.`
      );
    }

    const currentSig = this._archetypeSystem.entitySignature(entity);
    if (!currentSig) {
      throw new Error(
        `World.removeComponent failed: entity ${entity} has no signature.`
      );
    }

    if (!currentSig.contains(componentId)) {
      return;
    }

    const newSig = currentSig.remove(componentId);

    this._clearEntityCache(entity);
    this._archetypeSystem.moveEntity(entity, newSig);
  }

  hasComponent(entity, component) {
    const componentId = this._resolveComponentId(component, 'hasComponent');

    if (!this._entityManager.isAlive(entity)) {
      return false;
    }

    const sig = this._archetypeSystem.entitySignature(entity);
    if (!sig) return false;

    return sig.contains(componentId);
  }

  getComponent(entity, component) {
    const componentId = this._resolveComponentId(component, 'getComponent');

    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.getComponent failed: entity ${entity} is not alive.`
      );
    }

    const sig = this._archetypeSystem.entitySignature(entity);
    if (!sig || !sig.contains(componentId)) {
      throw new Error(
        `World.getComponent failed: entity ${entity} does not have the requested component.`
      );
    }

    const cacheKey = `${entity}:${componentId}`;
    let view = this._viewCache.get(cacheKey);
    if (!view) {
      const table = this._archetypeSystem.entityTable(entity);
      const row = this._entityManager.getRow(entity);
      const schema = this._registry.getSchemaById(componentId);
      view = this._createComponentView(componentId, schema, table, row);
      this._viewCache.set(cacheKey, view);
    }
    return view;
  }

  setComponent(entity, component, values) {
    const componentId = this._resolveComponentId(component, 'setComponent');

    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.setComponent failed: entity ${entity} is not alive.`
      );
    }

    const sig = this._archetypeSystem.entitySignature(entity);
    if (!sig || !sig.contains(componentId)) {
      throw new Error(
        `World.setComponent failed: entity ${entity} does not have the requested component.`
      );
    }

    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      throw new TypeError(
        `World.setComponent failed: values must be a plain object, got ${typeof values}.`
      );
    }

    const table = this._archetypeSystem.entityTable(entity);
    const row = this._entityManager.getRow(entity);
    const schema = this._registry.getSchemaById(componentId);

    for (const fieldName of Object.keys(values)) {
      if (!schema || !(fieldName in schema)) {
        throw new Error(
          `World.setComponent failed: unknown field "${fieldName}".`
        );
      }
      const col = table.getColumn(componentId, fieldName);
      if (col) {
        col[row] = values[fieldName];
      }
    }

    if (this._onComponentSet) {
      this._onComponentSet(entity, componentId);
    }
  }

  add(entity, component) {
    return this.addComponent(entity, component);
  }

  remove(entity, component) {
    return this.removeComponent(entity, component);
  }

  has(entity, component) {
    return this.hasComponent(entity, component);
  }

  get(entity, component) {
    return this.getComponent(entity, component);
  }

  set(entity, component, values) {
    return this.setComponent(entity, component, values);
  }

  clear(entity) {
    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.clear failed: entity ${entity} is not alive.`
      );
    }

    const currentSig = this._archetypeSystem.entitySignature(entity);
    if (!currentSig || currentSig.size === 0) return;

    const emptySig = new ComponentSignature([]);
    this._clearEntityCache(entity);
    this._archetypeSystem.moveEntity(entity, emptySig);
  }

  addMany(entity, ...components) {
    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.addMany failed: entity ${entity} is not alive.`
      );
    }

    if (components.length === 0) return;

    const currentSig = this._archetypeSystem.entitySignature(entity);
    if (!currentSig) {
      throw new Error(
        `World.addMany failed: entity ${entity} has no signature.`
      );
    }

    const cur = currentSig.components;
    const curLen = cur.length;
    const newIds = [];

    for (let i = 0; i < components.length; i++) {
      const id = this._resolveComponentId(components[i], 'addMany');
      if (!currentSig.contains(id)) {
        newIds.push(id);
      }
    }

    if (newIds.length === 0) return;

    newIds.sort((a, b) => a - b);
    let uniqLen = 1;
    for (let i = 1; i < newIds.length; i++) {
      if (newIds[i] !== newIds[i - 1]) newIds[uniqLen++] = newIds[i];
    }
    newIds.length = uniqLen;

    const result = new Array(curLen + newIds.length);
    let ci = 0, ni = 0, ri = 0;
    while (ci < curLen && ni < newIds.length) {
      if (cur[ci] < newIds[ni]) result[ri++] = cur[ci++];
      else if (cur[ci] > newIds[ni]) result[ri++] = newIds[ni++];
      else { result[ri++] = cur[ci++]; ni++; }
    }
    while (ci < curLen) result[ri++] = cur[ci++];
    while (ni < newIds.length) result[ri++] = newIds[ni++];
    result.length = ri;

    const newSig = new ComponentSignature(result);
    this._clearEntityCache(entity);
    this._archetypeSystem.moveEntity(entity, newSig);
  }

  removeMany(entity, ...components) {
    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.removeMany failed: entity ${entity} is not alive.`
      );
    }

    if (components.length === 0) return;

    const currentSig = this._archetypeSystem.entitySignature(entity);
    if (!currentSig) {
      throw new Error(
        `World.removeMany failed: entity ${entity} has no signature.`
      );
    }

    if (currentSig.size === 0) return;

    const removeIds = new Array(components.length);
    for (let i = 0; i < components.length; i++) {
      removeIds[i] = this._resolveComponentId(components[i], 'removeMany');
    }
    removeIds.sort((a, b) => a - b);

    const comps = currentSig.components;
    const keep = new Array(comps.length);
    let ci = 0, rmi = 0, ki = 0;
    while (ci < comps.length && rmi < removeIds.length) {
      if (comps[ci] < removeIds[rmi]) keep[ki++] = comps[ci++];
      else if (comps[ci] > removeIds[rmi]) rmi++;
      else { ci++; rmi++; }
    }
    while (ci < comps.length) keep[ki++] = comps[ci++];
    keep.length = ki;

    if (keep.length === comps.length) return;

    const newSig = new ComponentSignature(keep);
    this._clearEntityCache(entity);
    this._archetypeSystem.moveEntity(entity, newSig);
  }

  clone(entity) {
    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `World.clone failed: entity ${entity} is not alive.`
      );
    }

    const sig = this._archetypeSystem.entitySignature(entity);
    if (!sig) {
      throw new Error(
        `World.clone failed: entity ${entity} has no signature.`
      );
    }

    const sourceTable = this._archetypeSystem.entityTable(entity);
    const sourceRow = this._entityManager.getRow(entity);

    const cloneId = this.createEntity();

    if (sig.size === 0) return cloneId;

    this._clearEntityCache(cloneId);

    const emptyLoc = this._entityManager.getLocation(cloneId);

    const targetArch = this._archetypeSystem.createArchetype(sig);
    const targetTable = targetArch.table;
    const targetRow = targetTable.allocate();

    targetTable.setEntity(targetRow, cloneId);
    this._entityManager.setLocation(cloneId, targetArch.id, targetRow);

    const emptyTable = this._archetypeSystem.getArchetypeById(emptyLoc.archetype).table;
    const removed = emptyTable.removeRow(emptyLoc.row);
    if (removed.moved) {
      this._entityManager.setLocation(removed.entity, emptyLoc.archetype, emptyLoc.row);
    }

    const componentIds = sig.components;
    for (let ci = 0; ci < componentIds.length; ci++) {
      const cid = componentIds[ci];
      const schema = this._registry.getSchemaById(cid);
      if (!schema) continue;
      const fieldNames = Object.keys(schema);
      for (let fi = 0; fi < fieldNames.length; fi++) {
        const srcCol = sourceTable.getColumn(cid, fieldNames[fi]);
        const tgtCol = targetTable.getColumn(cid, fieldNames[fi]);
        if (srcCol && tgtCol) {
          tgtCol[targetRow] = srcCol[sourceRow];
        }
      }
    }

    return cloneId;
  }

  entity() {
    return new (this._getEntityBuilder())(this);
  }

  _getEntityBuilder() {
    if (!this._entityBuilderClass) {
      this._entityBuilderClass = class EntityBuilder {
        constructor(world) {
          this._world = world;
          this._components = [];
          this._values = [];
        }

        with(component, values) {
          const world = this._world;
          const id = world._resolveComponentId(component, 'entity().with()');
          if (!this._components.some(e => e.id === id)) {
            this._components.push({ cls: component, id, values: values || null });
          }
          return this;
        }

        create() {
          const world = this._world;
          const entity = world.createEntity();
          if (this._components.length === 0) return entity;

          const ids = this._components.map(e => e.id).sort((a, b) => a - b);
          const newSig = new ComponentSignature(ids);

          world._clearEntityCache(entity);
          world._archetypeSystem.moveEntity(entity, newSig);

          for (let i = 0; i < this._components.length; i++) {
            const { cls, values } = this._components[i];
            if (values) {
              world.set(entity, cls, values);
            }
          }

          return entity;
        }
      };
    }
    return this._entityBuilderClass;
  }

  addSystem(system) {
    this._scheduler.add(system);
  }

  removeSystem(system) {
    this._scheduler.remove(system);
  }

  clearSystems() {
    this._scheduler.clear();
  }

  update(dt) {
    this._scheduler.update(dt);
    this._events.clear();
  }

  query(query) {
    let view = this._queryViewCache.get(query);
    if (!view) {
      view = new QueryView(this._queryEngine, query);
      this._queryViewCache.set(query, view);
    }
    return view;
  }

  attach(child, parent) {
    if (!this._hierarchy) {
      throw new Error(
        "World.attach failed: hierarchy not initialized. Call world.initHierarchy() first."
      );
    }
    this._hierarchy.attach(child, parent);
  }

  detach(child) {
    if (!this._hierarchy) return;
    this._hierarchy.detach(child);
  }

  parentOf(entity) {
    if (!this._hierarchy) return null;
    return this._hierarchy.parentOf(entity);
  }

  childrenOf(entity) {
    if (!this._hierarchy) return null;
    return this._hierarchy.childrenOf(entity);
  }

  isDescendant(descendant, ancestor) {
    if (!this._hierarchy) return null;
    return this._hierarchy.isDescendant(descendant, ancestor);
  }

  rootOf(entity) {
    if (!this._hierarchy) return null;
    return this._hierarchy.rootOf(entity);
  }

  get streaming() {
    return this.getResource(StreamingManager);
  }

  createStreamingCell(name) {
    const sm = this.streaming;
    if (!sm) {
      throw new Error(
        "World.createStreamingCell failed: StreamingManager is not registered as a resource."
      );
    }
    return sm.createCell(name);
  }

  loadCell(name) {
    const sm = this.streaming;
    if (!sm) {
      throw new Error(
        "World.loadCell failed: StreamingManager is not registered as a resource."
      );
    }
    sm.load(name);
  }

  unloadCell(name) {
    const sm = this.streaming;
    if (!sm) {
      throw new Error(
        "World.unloadCell failed: StreamingManager is not registered as a resource."
      );
    }
    sm.unload(name);
  }

  _resolveComponentId(component, operation) {
    if (typeof component !== 'function' && typeof component !== 'string') {
      throw new TypeError(
        `World.${operation} failed: component must be a component class or string name, ` +
        `got ${typeof component}.`
      );
    }
    const id = this._registry.getId(component);
    if (id === null) {
      throw new Error(
        `World.${operation} failed: component "${component}" is not registered. ` +
        `Register components before creating entities.`
      );
    }
    return id;
  }

  _createComponentView(componentId, schema, table, row) {
    const self = this;
    const view = {};
    const fieldNames = Object.keys(schema);
    const entityId = table.entityIds ? table.entityIds[row] : null;
    for (let fi = 0; fi < fieldNames.length; fi++) {
      const fieldName = fieldNames[fi];
      const col = table.getColumn(componentId, fieldName);
      Object.defineProperty(view, fieldName, {
        get() { return col[row]; },
        set(v) {
          col[row] = v;
          if (self._onComponentSet) {
            self._onComponentSet(entityId, componentId);
          }
        },
        enumerable: true,
        configurable: true,
      });
    }
    return view;
  }

  _clearEntityCache(entity) {
    const prefix = `${entity}:`;
    for (const key of this._viewCache.keys()) {
      if (key.startsWith(prefix)) {
        this._viewCache.delete(key);
      }
    }
  }
}
