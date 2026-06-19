import { ModifierCompiler } from "../gpu/ModifierCompiler.js";
import { GpuPassExecutor } from "../gpu/GpuPassExecutor.js";
import { GpuUniformLayout } from "../gpu/GpuUniformLayout.js";
import { SimulationBufferView } from "../gpu/SimulationBufferView.js";
import { SoAParticleStorage } from "../storage/SoAParticleStorage.js";
import { ObjectParticleStorage } from "../storage/ObjectParticleStorage.js";
import { SoAParticleAccessor } from "../accessors/SoAParticleAccessor.js";
import { ObjectParticleAccessor } from "../accessors/ObjectParticleAccessor.js";
import { GpuParticleRenderer } from "../renderers/GpuParticleRenderer.js";
import { ParticleRenderCommandBuffer } from "../renderdata/ParticleRenderCommandBuffer.js";
import { ParticleRenderData } from "../renderdata/ParticleRenderData.js";

const SORT_MODES = new Set([
  "none", "age", "reverseAge", "size", "reverseSize",
  "depth", "reverseDepth", "custom",
]);

export class GpuParticleBackend {
  constructor({ renderer, system, storage } = {}) {
    this._system = system;
    this._storage = storage || new ObjectParticleStorage();
    this._useSoA = this._storage instanceof SoAParticleStorage;
    this._accessor = this._useSoA
      ? new SoAParticleAccessor(this._storage, 0)
      : new ObjectParticleAccessor();
    this._renderer = renderer || new GpuParticleRenderer({});
    this._compiler = new ModifierCompiler();
    this._executor = new GpuPassExecutor();
    this._uniforms = new GpuUniformLayout();
    this._modifiers = [];
    this._isDirty = true;
    this._program = null;
    this._isUpdating = false;
    this._pendingRemove = null;
    this._pendingAdd = null;
    this._sortMode = "none";
    this._sortFunction = null;
    this.sortEveryFrame = false;
    this._sortDirty = false;
    this._sortedIndices = null;
    this._sortCounter = 0;
    this._commandBuffer = new ParticleRenderCommandBuffer();
    this._activeSlots = [];
  }

  _rebuildProgram() {
    if (!this._isDirty) return;
    const descriptors = [];
    for (const entry of this._modifiers) {
      const mod = entry.modifier;
      if (typeof mod.toDescriptor === "function") {
        descriptors.push(mod.toDescriptor());
      }
    }
    this._program = descriptors.length > 0
      ? this._compiler.compile(descriptors)
      : null;
    this._isDirty = false;
  }

  addModifier(modifier, priority) {
    if (priority === undefined) priority = modifier.priority ?? 0;
    this._modifiers.push({ modifier, priority });
    this._modifiers.sort((a, b) => a.priority - b.priority);
    this._isDirty = true;
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
        this._isDirty = true;
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
    this._isDirty = true;
  }

  _flushPendingRemovals() {
    if (!this._pendingRemove) return;
    const pending = this._pendingRemove;
    this._pendingRemove = null;
    for (let i = 0; i < pending.length; i++) {
      this.removeModifier(pending[i]);
    }
  }

  _markSortDirty() {
    this._sortDirty = true;
  }

  _ensureSortIndices(minSize) {
    if (!this._sortedIndices || this._sortedIndices.length < minSize) {
      this._sortedIndices = new Array(minSize);
    }
  }

  _getComparator() {
    const storage = this._storage;
    switch (this._sortMode) {
      case "age":
        return (a, b) => {
          const d = storage.getFieldValue(b, "ageRatio") - storage.getFieldValue(a, "ageRatio");
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "reverseAge":
        return (a, b) => {
          const d = storage.getFieldValue(a, "ageRatio") - storage.getFieldValue(b, "ageRatio");
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "size":
        return (a, b) => {
          const va = storage.getFieldValue(a, "size");
          const vb = storage.getFieldValue(b, "size");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.size must be finite, got ${va} and ${vb}`
            );
          }
          const d = va - vb;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "reverseSize":
        return (a, b) => {
          const va = storage.getFieldValue(a, "size");
          const vb = storage.getFieldValue(b, "size");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.size must be finite, got ${va} and ${vb}`
            );
          }
          const d = vb - va;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "depth":
        return (a, b) => {
          const va = storage.getFieldValue(a, "depth");
          const vb = storage.getFieldValue(b, "depth");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.depth must be finite, got ${va} and ${vb}`
            );
          }
          const d = va - vb;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "reverseDepth":
        return (a, b) => {
          const va = storage.getFieldValue(a, "depth");
          const vb = storage.getFieldValue(b, "depth");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.depth must be finite, got ${va} and ${vb}`
            );
          }
          const d = vb - va;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "custom":
        return (a, b) => {
          const pa = storage.resolveParticle(a);
          const pb = storage.resolveParticle(b);
          const d = this._sortFunction(pa, pb);
          if (typeof d !== "number" || !Number.isFinite(d)) {
            throw new Error(
              `ParticleSystem custom sortFunction returned invalid value ${d}. Must return a finite number.`
            );
          }
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      default:
        return null;
    }
  }

  _sortParticles() {
    if (this.sortEveryFrame) {
      this._sortDirty = true;
    }
    if (!this._sortDirty) return;
    const count = this.activeCount;
    this._ensureSortIndices(count);
    const buf = this._sortedIndices;
    for (let i = 0; i < count; i++) {
      buf[i] = i;
    }
    if (count > 1) {
      const cmp = this._getComparator();
      if (cmp) {
        const savedLen = buf.length;
        buf.length = count;
        buf.sort(cmp);
        buf.length = savedLen;
      }
    }
    this._sortDirty = false;
  }

  _buildRenderData(indices, count) {
    return new ParticleRenderData(this._storage, indices, count);
  }

  _refreshSlotIndices() {
    const accessors = this._storage.activeParticles;
    const count = accessors.length;
    for (let i = 0; i < count; i++) {
      this._activeSlots[i] = accessors[i]._i;
    }
    this._activeSlots.length = count;
  }

  get sortMode() {
    return this._sortMode;
  }

  set sortMode(value) {
    if (!SORT_MODES.has(value)) {
      throw new Error(
        `ParticleSystem.sortMode: unknown mode "${value}". ` +
        `Valid modes: ${Array.from(SORT_MODES).join(", ")}`
      );
    }
    if (value === this._sortMode) return;
    this._sortMode = value;
    this._sortDirty = true;
    if (value !== "custom") {
      this._sortFunction = null;
    }
  }

  set sortFunction(value) {
    if (this._sortMode === "custom" && typeof value !== "function") {
      throw new Error(
        "ParticleSystem.sortFunction: must be a function when sortMode is \"custom\""
      );
    }
    this._sortFunction = value;
    this._sortDirty = true;
  }

  get sortedParticleCount() {
    return this._sortMode !== "none" ? this.activeCount : 0;
  }

  setCollisionProvider(provider) {
    this._collisionProvider = provider;
  }

  destroy() {
    this.clear();
    this.clearModifiers();
    this._renderer.destroy();
    this._renderer = null;
    this._executor.releaseAll();
    this._sortedIndices = null;
    this._sortFunction = null;
    this._storage = null;
    this._accessor = null;
    this._program = null;
    this._compiler = null;
    this._executor = null;
  }

  emit(count, initializer, emitter) {
    this._rebuildProgram();
    const acc = this._accessor;
    const program = this._program;
    const executor = this._executor;
    const passes = program
      ? [program.integrationPass, program.forcePass, program.visualPass]
      : [];

    for (let i = 0; i < count; i++) {
      const p = this._storage.acquire();
      p.__jygameSortOrder = this._sortCounter++;
      acc.wrap(p);
      if (initializer) initializer(p, i, emitter);

      const view = this._useSoA ? this._getOrCreateView() : null;
      const slot = p._i;

      for (let d = 0; d < passes.length; d++) {
        for (let m = 0; m < passes[d].length; m++) {
          executor.runOnEmit(passes[d][m], view, slot, p);
        }
      }
    }
    if (this._sortMode !== "none") this._markSortDirty();
  }

  emitOne(initializer) {
    this._rebuildProgram();
    const p = this._storage.acquire();
    p.__jygameSortOrder = this._sortCounter++;
    const acc = this._accessor;
    acc.wrap(p);
    if (initializer) initializer(p, 0);

    const program = this._program;
    const executor = this._executor;
    if (program) {
      const view = this._useSoA ? this._getOrCreateView() : null;
      const slot = p._i;
      const passes = [program.integrationPass, program.forcePass, program.visualPass];
      for (let d = 0; d < passes.length; d++) {
        for (let m = 0; m < passes[d].length; m++) {
          executor.runOnEmit(passes[d][m], view, slot, p);
        }
      }
    }

    if (this._sortMode !== "none") this._markSortDirty();
    return p;
  }

  _getOrCreateView() {
    if (!this._view) {
      this._view = new SimulationBufferView(this._storage);
    }
    return this._view;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    this._rebuildProgram();
    this._isUpdating = true;

    const storage = this._storage;
    const accessors = storage.activeParticles;
    const program = this._program;
    const executor = this._executor;

    executor.updateTime(dt);
    const uniforms = { dt, elapsedTime: executor._elapsedTime };

    if (program) {
      executor.beginFrame(program.integrationPass, dt, uniforms);
      executor.beginFrame(program.forcePass, dt, uniforms);
      executor.beginFrame(program.visualPass, dt, uniforms);
    }

    if (this._useSoA) {
      this._updateSoA(dt, storage, accessors, program, executor, uniforms);
    } else {
      this._updateObject(dt, storage, accessors, program, executor);
    }

    if (this._sortMode !== "none") {
      this._markSortDirty();
    }

    this._isUpdating = false;
    this._flushPendingRemovals();
  }

  _updateSoA(dt, storage, accessors, program, executor, uniforms) {
    const view = this._getOrCreateView();
    const count = accessors.length;
    this._refreshSlotIndices();

    for (let i = 0; i < count; i++) {
      view.integrate(this._activeSlots[i], dt);
    }

    if (program) {
      if (program.integrationPass.length > 0) {
        executor.runPass(program.integrationPass, view, dt, uniforms, this._activeSlots, count);
      }
      if (program.forcePass.length > 0) {
        executor.runPass(program.forcePass, view, dt, uniforms, this._activeSlots, count);
      }
      if (program.visualPass.length > 0) {
        executor.runPass(program.visualPass, view, dt, uniforms, this._activeSlots, count);
      }
    }

    let remaining = count;
    let idx = 0;
    while (idx < remaining) {
      const slot = this._activeSlots[idx];
      if (view.life(slot) <= 0) {
        executor.releaseStateById(view.id(slot));
        storage.release(accessors[idx]);
        remaining--;
        this._activeSlots.length = remaining;
        for (let j = idx; j < remaining; j++) {
          this._activeSlots[j] = accessors[j]._i;
        }
      } else {
        idx++;
      }
    }
  }

  _updateObject(dt, storage, active, program, executor) {
    const view = null;
    const count = active.length;
    const acc = this._accessor;

    for (let i = 0; i < count; i++) {
      storage.integrateParticle(active[i], dt);
    }

    if (program) {
      if (program.integrationPass.length > 0) {
        executor.runPassObject(program.integrationPass, acc, dt, active);
      }
      if (program.forcePass.length > 0) {
        executor.runPassObject(program.forcePass, acc, dt, active);
      }
      if (program.visualPass.length > 0) {
        executor.runPassObject(program.visualPass, acc, dt, active);
      }
    }

    let i = 0;
    while (i < active.length) {
      acc.wrap(active[i]);
      if (acc.life <= 0) {
        executor.releaseState(active[i]);
        storage.release(active[i]);
      } else {
        i++;
      }
    }
  }

  render(ctx) {
    const count = this.activeCount;
    if (count === 0) return;

    let renderData;
    if (this._sortMode === "none") {
      renderData = this._buildRenderData(null, count);
    } else {
      this._sortParticles();
      renderData = this._buildRenderData(this._sortedIndices, count);
    }

    const buf = this._commandBuffer;
    buf.clear();
    renderData.fillCommandBuffer(buf);
    this._renderer.render(buf, ctx);
  }

  clear() {
    this._storage.clear();
    this._executor.releaseAll();
  }

  warmup(count) {
    this._storage.warmup(count);
  }

  get particles() {
    return this._storage.activeParticles;
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
