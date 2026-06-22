import { hasLifecycleMethods } from "../../modifiers/ModifierUtils.js";
import { StorageResolver } from "../storage/StorageResolver.js";
import { ModifierStateStore } from "../ModifierStateStore.js";
import { CanvasParticleRenderer } from "../renderers/CanvasParticleRenderer.js";
import { ParticleRenderData } from "../renderdata/ParticleRenderData.js";
import { ParticleRenderCommandBuffer } from "../renderdata/ParticleRenderCommandBuffer.js";
import { ParticleSortManager } from "../ParticleSortManager.js";

const _createEntry = (modifier, priority) => ({ modifier, priority });

export class CpuParticleBackend {
  constructor({ renderParticle, renderer, system, storage } = {}) {
    this._system = system;
    this._storage = storage || StorageResolver.createDefault();
    this._renderer = renderer || new CanvasParticleRenderer({ renderParticle });
    this._stateStore = new ModifierStateStore();
    this._accessor = StorageResolver.createAccessor(this._storage);
    this._modifiers = [];
    this._updateModifiers = [];
    this._emitModifiers = [];
    this._deathModifiers = [];
    this._beginFrameModifiers = [];
    this._endFrameModifiers = [];
    this._modifierContext = { system: this._system, activeParticles: this._storage.activeParticles, stateStore: this._stateStore, accessor: this._accessor };
    this._isUpdating = false;
    this._pendingRemove = null;
    this._sortManager = new ParticleSortManager(this._storage);
    this._collisionProvider = null;
    this._commandBuffer = new ParticleRenderCommandBuffer();
  }

  _flushPendingRemovals() {
    if (!this._pendingRemove) return;
    const pending = this._pendingRemove;
    this._pendingRemove = null;
    for (let i = 0; i < pending.length; i++) {
      this.removeModifier(pending[i]);
    }
  }

  _rebuildCaches() {
    this._beginFrameModifiers.length = 0;
    this._updateModifiers.length = 0;
    this._emitModifiers.length = 0;
    this._deathModifiers.length = 0;
    this._endFrameModifiers.length = 0;
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i].modifier;
      if (typeof mod.beginFrame === 'function') this._beginFrameModifiers.push(mod);
      if (typeof mod.update === 'function') this._updateModifiers.push(mod);
      if (typeof mod.onEmit === 'function') this._emitModifiers.push(mod);
      if (typeof mod.onDeath === 'function') this._deathModifiers.push(mod);
      if (typeof mod.endFrame === 'function') this._endFrameModifiers.push(mod);
    }
  }

  addModifier(modifier, priority) {
    if (!hasLifecycleMethods(modifier)) {
      throw new Error('Modifier must implement at least one lifecycle method (beginFrame, update, onEmit, onDeath, or endFrame)');
    }
    if (priority === undefined) priority = modifier.priority ?? 0;
    const entry = _createEntry(modifier, priority);
    this._modifiers.push(entry);
    this._modifiers.sort((a, b) => a.priority - b.priority);
    this._rebuildCaches();
  }

  removeModifier(modifier) {
    if (this._isUpdating) {
      if (!this._pendingRemove) this._pendingRemove = [];
      this._pendingRemove.push(modifier);
      return;
    }
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      if (mods[i].modifier === modifier) {
        mods[i].modifier.destroy?.();
        mods.splice(i, 1);
        this._rebuildCaches();
        return;
      }
    }
  }

  clearModifiers() {
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      mods[i].modifier.destroy?.();
    }
    this._modifiers.length = 0;
    this._beginFrameModifiers.length = 0;
    this._updateModifiers.length = 0;
    this._emitModifiers.length = 0;
    this._deathModifiers.length = 0;
    this._endFrameModifiers.length = 0;
  }

  destroy() {
    this.clear();
    this.clearModifiers();
    this._renderer.destroy();
    this._renderer = null;
    this._modifierContext.system = null;
    this._modifierContext.activeParticles = null;
    this._sortManager.destroy();
    this._storage = null;
    this._accessor = null;
    this._stateStore = null;
  }

  get _renderParticle() {
    return this._renderer ? this._renderer._renderParticle : null;
  }

  set _renderParticle(value) {
    if (this._renderer) this._renderer._renderParticle = value;
  }

  get sortMode() { return this._sortManager.sortMode; }
  set sortMode(value) { this._sortManager.sortMode = value; }

  get sortFunction() { return this._sortManager.sortFunction; }
  set sortFunction(value) { this._sortManager.sortFunction = value; }

  get sortedParticleCount() { return this._sortManager.sortedParticleCount; }

  get sortEveryFrame() { return this._sortManager.sortEveryFrame; }
  set sortEveryFrame(value) { this._sortManager.sortEveryFrame = value; }

  emit(count, initializer, emitter) {
    const emitMods = this._emitModifiers;
    const emLen = emitMods.length;
    const ctx = this._modifierContext;
    const acc = this._accessor;
    for (let i = 0; i < count; i++) {
      const p = this._storage.acquire();
      p.__jygameSortOrder = this._sortManager.nextSortOrder();
      acc.wrap(p);
      if (initializer) initializer(p, i, emitter);
      p.alive = 1;
      for (let m = 0; m < emLen; m++) {
        const mod = emitMods[m];
        if (mod.enabled !== false) {
          mod.onEmit(acc, ctx);
        }
      }
    }
    if (this._sortManager.sortMode !== "none") this._sortManager.markDirty();
  }

  emitOne(initializer) {
    const p = this._storage.acquire();
    p.__jygameSortOrder = this._sortManager.nextSortOrder();
    const acc = this._accessor;
    acc.wrap(p);
    if (initializer) initializer(p, 0);
    p.alive = 1;
    const emitMods = this._emitModifiers;
    const ctx = this._modifierContext;
    for (let m = 0; m < emitMods.length; m++) {
      const mod = emitMods[m];
      if (mod.enabled !== false) {
        mod.onEmit(acc, ctx);
      }
    }
    if (this._sortManager.sortMode !== "none") this._sortManager.markDirty();
    return p;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    this._isUpdating = true;

    const active = this._storage.activeParticles;
    const ctx = this._modifierContext;
    const beginFrameMods = this._beginFrameModifiers;
    const updateMods = this._updateModifiers;
    const deathMods = this._deathModifiers;
    const endFrameMods = this._endFrameModifiers;
    const bfLen = beginFrameMods.length;
    const upLen = updateMods.length;
    const dLen = deathMods.length;
    const efLen = endFrameMods.length;

    for (let m = 0; m < bfLen; m++) {
      const mod = beginFrameMods[m];
      if (mod.enabled !== false) {
        mod.beginFrame(dt, ctx);
      }
    }

    const acc = this._accessor;
    let i = 0;
    while (i < active.length) {
      // Core physics — storage-native, no accessor overhead
      this._storage.integrateParticle(active[i], dt);

      // Modifiers and death check use the accessor
      acc.wrap(active[i]);

      for (let m = 0; m < upLen; m++) {
        const mod = updateMods[m];
        if (mod.enabled !== false) {
          mod.update(acc, dt, ctx);
        }
      }

      if (acc.life <= 0) {
        for (let m = 0; m < dLen; m++) {
          const mod = deathMods[m];
          if (mod.enabled !== false) {
            mod.onDeath(acc, ctx);
          }
        }
        this._stateStore.release(acc);
        this._storage.release(active[i]);
      } else {
        i++;
      }
    }

    for (let m = 0; m < efLen; m++) {
      const mod = endFrameMods[m];
      if (mod.enabled !== false) {
        mod.endFrame(dt, ctx);
      }
    }

    if (this._sortManager.sortMode !== "none") {
      this._sortManager.markDirty();
    }

    this._isUpdating = false;
    this._flushPendingRemovals();
  }

  _buildRenderData(indices, count) {
    return new ParticleRenderData(this._storage, indices, count);
  }

  render(ctx) {
    const count = this.activeCount;
    if (count === 0) return;

    let renderData;
    if (this._sortManager.sortMode === "none") {
      renderData = this._buildRenderData(null, count);
    } else {
      this._sortManager.sort();
      renderData = this._buildRenderData(this._sortManager.sortedIndices, count);
    }

    const buf = this._commandBuffer;
    buf.clear();
    renderData.fillCommandBuffer(buf);
    this._renderer.render(buf, ctx);
  }

  setCollisionProvider(provider) {
    this._collisionProvider = provider;
  }

  clear() {
    this._storage.clear();
    this._stateStore.releaseAll();
  }

  get particles() {
    return this._storage.activeParticles;
  }

  warmup(count) {
    this._storage.warmup(count);
  }

  get activeCount() {
    return this._storage.activeCount;
  }

  get freeCount() {
    return this._storage.freeCount;
  }

  get capacity() {
    return this._storage.capacity;
  }

  get peakActive() {
    return this._storage.peakActive;
  }

  get peakCapacity() {
    return this._storage.peakCapacity;
  }

  get peakFree() {
    return this._storage.peakFree;
  }

  get totalCreated() {
    return this._storage.totalCreated;
  }

  get isEmpty() {
    return this.activeCount === 0;
  }

  get hasParticles() {
    return this.activeCount > 0;
  }

  get modifierCount() {
    return this._modifiers.length;
  }
}
