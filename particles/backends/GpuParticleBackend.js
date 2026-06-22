import { ModifierCompiler } from "../gpu/ModifierCompiler.js";
import { GpuPassExecutor } from "../gpu/GpuPassExecutor.js";
import { GpuUniformLayout } from "../gpu/GpuUniformLayout.js";
import { WgslGenerator } from "../gpu/WgslGenerator.js";
import { SimulationBufferView } from "../gpu/SimulationBufferView.js";
import { StorageResolver } from "../storage/StorageResolver.js";
import { GpuParticleRenderer } from "../renderers/GpuParticleRenderer.js";
import { ParticleRenderCommandBuffer } from "../renderdata/ParticleRenderCommandBuffer.js";
import { ParticleRenderData } from "../renderdata/ParticleRenderData.js";
import { ParticleBufferLayout } from "../gpu/ParticleBufferLayout.js";
import { ParticleSortManager } from "../ParticleSortManager.js";
import { WebGpuDeviceManager } from "../gpu/webgpu/WebGpuDeviceManager.js";
import { GpuComputeDispatcher } from "../gpu/webgpu/GpuComputeDispatcher.js";
import { WebGpuParticleRenderer } from "../renderers/webgpu/WebGpuParticleRenderer.js";
import { ParticleBackendCapabilities } from "../gpu/ParticleBackendCapabilities.js";
import { WASM_BYTES } from "./death_sweep_simd_bytes.js";

const WASM_DEATH_SWEEP_THRESHOLD = 10000;
const MAX_DT = 0.1;

export class GpuParticleBackend {
  constructor({ renderer, system, storage, mode, canvas, renderValidationMode, gpuPersistentUpload } = {}) {
    this._system = system;
    this._mode = mode || "operator";
    this._canvas = canvas || null;
    this._renderValidationMode = renderValidationMode === true;
    this._gpuPersistentUpload = gpuPersistentUpload === true;
    this._storage = storage || StorageResolver.createDefault();
    this._useSoA = StorageResolver.isSoA(this._storage) && this._mode !== "object";
    this._accessor = StorageResolver.createAccessor(this._storage);
    this._renderer = renderer || new GpuParticleRenderer({});
    this._compiler = new ModifierCompiler();
    this._executor = this._mode === "compute" ? null : new GpuPassExecutor();
    this._computeDispatcher = null;
    this._uniforms = new GpuUniformLayout();
    this._modifiers = [];
    this._isDirty = true;
    this._program = null;
    this._gpuProgram = null;
    this._isUpdating = false;
    this._pendingRemove = null;
    this._sortManager = new ParticleSortManager(this._storage);
    this._commandBuffer = new ParticleRenderCommandBuffer();
    this._activeSlots = [];
    this._webgpuInitialized = false;
    this._gpuRenderer = null;
    this._persistentUploadTime = 0;
    this._persistentUploadBytes = 0;
    this._persistentUploadCount = 0;
    this._cachedDeathModifiers = null;
    this._deathSweepTime = 0;
    this._deathSweepCount = 0;
    this._aliveReadbackTime = 0;
    this._computeUpdatePending = false;
    this._wasmAvailable = false;
    this._wasmExports = null;
    this._wasmMemory = null;
    this._wasmLifeView = null;
    this._wasmActiveView = null;
    this._wasmDeathOutView = null;
    this._wasmCapacity = 0;
    this._slotAccArr = [];
    this._slotIdxArr = [];
    this._initWasm();
  }

  _initWasm() {
    try {
      if (typeof WebAssembly === "undefined" || typeof WebAssembly.Module === "undefined") {
        this._wasmAvailable = false;
        return;
      }
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
      const mod = new WebAssembly.Module(WASM_BYTES);
      const inst = new WebAssembly.Instance(mod, { env: { memory } });
      this._wasmExports = inst.exports;
      this._wasmMemory = memory;
      this._wasmLifeView = null;
      this._wasmActiveView = null;
      this._wasmDeathOutView = null;
      this._wasmCapacity = 0;
      this._wasmAvailable = true;
    } catch (e) {
      this._wasmAvailable = false;
    }
  }

  _ensureWasmCapacity(capacity) {
    if (!this._wasmAvailable) return false;
    if (capacity <= this._wasmCapacity) return true;
    const needed = capacity * 12;
    const neededPages = Math.ceil(needed / 65536);
    const currentPages = this._wasmMemory.buffer.byteLength / 65536;
    if (neededPages > currentPages) {
      try {
        this._wasmMemory.grow(neededPages - currentPages);
      } catch (e) {
        return false;
      }
    }
    const b = this._wasmMemory.buffer;
    this._wasmLifeView = new Float32Array(b, 0, capacity);
    this._wasmActiveView = new Int32Array(b, capacity * 4, capacity);
    this._wasmDeathOutView = new Int32Array(b, capacity * 8, capacity);
    this._wasmCapacity = capacity;
    return true;
  }

  get renderValidationMode() { return this._renderValidationMode; }
  set renderValidationMode(v) { this._renderValidationMode = v; }

  async _ensureWebGpu() {
    if (this._webgpuInitialized) return;
    if (!WebGpuDeviceManager.isAvailable()) {
      throw new Error("WebGPU not available — falling back to operator mode");
    }
    await WebGpuDeviceManager.initialize();
    this._computeDispatcher = new GpuComputeDispatcher({ gpuPersistentUpload: this._gpuPersistentUpload });
    this._webgpuInitialized = true;

    if (this._canvas) {
      this._gpuRenderer = new WebGpuParticleRenderer({
        canvas: this._canvas,
      });
      await this._gpuRenderer.initialize();
    }
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
    this._gpuProgram = null;
    if (this._program && this._mode === "compute") {
      const gen = new WgslGenerator();
      this._gpuProgram = gen.generate(this._program);
    }
    this._isDirty = false;
  }

  addModifier(modifier, priority) {
    if (priority === undefined) priority = modifier.priority ?? 0;
    this._modifiers.push({ modifier, priority });
    this._modifiers.sort((a, b) => a.priority - b.priority);
    this._isDirty = true;
    this._cachedDeathModifiers = null;
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
        this._cachedDeathModifiers = null;
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
    this._cachedDeathModifiers = null;
  }

  _flushPendingRemovals() {
    if (!this._pendingRemove) return;
    const pending = this._pendingRemove;
    this._pendingRemove = null;
    for (let i = 0; i < pending.length; i++) {
      this.removeModifier(pending[i]);
    }
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

  get sortMode() { return this._sortManager.sortMode; }
  set sortMode(value) { this._sortManager.sortMode = value; }

  get sortFunction() { return this._sortManager.sortFunction; }
  set sortFunction(value) { this._sortManager.sortFunction = value; }

  get sortedParticleCount() { return this._sortManager.sortedParticleCount; }

  get sortEveryFrame() { return this._sortManager.sortEveryFrame; }
  set sortEveryFrame(value) { this._sortManager.sortEveryFrame = value; }

  setCollisionProvider(provider) {
    this._collisionProvider = provider;
  }

  destroy() {
    this.clear();
    this.clearModifiers();
    this._renderer.destroy();
    this._renderer = null;
    if (this._executor) this._executor.releaseAll();
    if (this._computeDispatcher) this._computeDispatcher.destroy();
    if (this._gpuRenderer) this._gpuRenderer.destroy();
    this._sortManager.destroy();
    this._storage = null;
    this._accessor = null;
    this._program = null;
    this._compiler = null;
    this._executor = null;
    this._computeDispatcher = null;
    this._gpuRenderer = null;
  }

  emit(count, initializer, emitter) {
    this._rebuildProgram();
    const acc = this._accessor;
    const executor = this._executor;
    const usePersistent = this._gpuPersistentUpload && this._mode === "compute";
    const dispatcher = this._computeDispatcher;

    let persistentSlots = usePersistent ? [] : null;

    const t0 = usePersistent ? performance.now() : 0;

    for (let i = 0; i < count; i++) {
      const p = this._storage.acquire();
      p.__jygameSortOrder = this._sortManager.nextSortOrder();
      acc.wrap(p);
      if (initializer) initializer(p, i, emitter);
      p.alive = 1;

      if (usePersistent) {
        persistentSlots.push(p._i);
      }

      if (executor) {
        const program = this._program;
        const passes = program
          ? [program.integrationPass, program.forcePass, program.visualPass]
          : [];
        const view = this._useSoA ? this._getOrCreateView() : null;
        const slot = this._useSoA ? p._i : null;
        for (let d = 0; d < passes.length; d++) {
          for (let m = 0; m < passes[d].length; m++) {
            executor.runOnEmit(passes[d][m], view, slot, p);
          }
        }
      }
    }

    if (usePersistent && dispatcher && persistentSlots.length > 0) {
      dispatcher.ensureParticleBuffer(Math.max(1024, this._storage.capacity));
      if (persistentSlots.length === 1) {
        dispatcher.writeSlot(persistentSlots[0], this._storage);
      } else {
        dispatcher.writeSlots(persistentSlots, this._storage);
      }
      const dt = performance.now() - t0;
      this._persistentUploadTime += dt;
      this._persistentUploadBytes += persistentSlots.length * ParticleBufferLayout.STRIDE * 4;
      this._persistentUploadCount += persistentSlots.length;
    }

    if (this._sortManager.sortMode !== "none") this._sortManager.markDirty();
  }

  emitOne(initializer) {
    this._rebuildProgram();
    const p = this._storage.acquire();
    p.__jygameSortOrder = this._sortManager.nextSortOrder();
    const acc = this._accessor;
    acc.wrap(p);
    if (initializer) initializer(p, 0);
    p.alive = 1;

    const executor = this._executor;
    if (executor) {
      const program = this._program;
      if (program) {
        const view = this._useSoA ? this._getOrCreateView() : null;
        const slot = this._useSoA ? p._i : null;
        const passes = [program.integrationPass, program.forcePass, program.visualPass];
        for (let d = 0; d < passes.length; d++) {
          for (let m = 0; m < passes[d].length; m++) {
            executor.runOnEmit(passes[d][m], view, slot, p);
          }
        }
      }
    }

    if (this._sortManager.sortMode !== "none") this._sortManager.markDirty();
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

    if (this._mode === "compute") {
      this._updateCompute(dt, storage, accessors);
    } else {
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
    }

    if (this._sortManager.sortMode !== "none") {
      this._sortManager.markDirty();
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

  async _updateCompute(dt, storage, accessors) {
    if (this._computeUpdatePending) return;
    this._computeUpdatePending = true;
    const _resetPending = () => { this._computeUpdatePending = false; };
    try {
      if (!this._webgpuInitialized) {
        try {
          await this._ensureWebGpu();
        } catch (e) {
          this._mode = "operator";
          this._executor = new GpuPassExecutor();
          this.update(dt);
          return;
        }
      }

      const dispatcher = this._computeDispatcher;
      const program = this._gpuProgram;
      if (!program) {
        this._isUpdating = false;
        this._flushPendingRemovals();
        return;
      }

      if (!dispatcher._program) {
        dispatcher.setProgram(program);
      }

      const count = accessors.length;
      if (count === 0) {
        this._isUpdating = false;
        this._flushPendingRemovals();
        return;
      }

      this._elapsedTime = (this._elapsedTime || 0) + dt;
      const uniforms = { dt, elapsedTime: this._elapsedTime };

      if ((this._gpuRenderer && !this._renderValidationMode) || this._gpuPersistentUpload) {
        if (this._gpuPersistentUpload) {
          const cap = Math.max(1024, storage.capacity);
          dispatcher.ensureParticleBuffer(cap);
          this._cpuDeathSweep(dt);
          dispatcher.dispatchOnly(storage, uniforms);
        } else {
          dispatcher.dispatchOnly(storage, uniforms);
        }
      } else {
        await dispatcher.dispatch(storage, uniforms);

        let i = 0;
        while (i < accessors.length) {
          const p = accessors[i];
          const life = storage.getFieldValue(i, "life");
          if (life <= 0) {
            storage.release(p);
          } else {
            i++;
          }
        }
      }
    } finally {
      _resetPending();
    }
  }

  _getDeathModifiers() {
    if (this._cachedDeathModifiers) return this._cachedDeathModifiers;
    this._cachedDeathModifiers = this._modifiers
      .map(e => e.modifier)
      .filter(m => typeof m.onDeath === "function");
    return this._cachedDeathModifiers;
  }

  _deathSweep(aliveFlags) {
    if (!this._storage) return;
    const accessors = this._storage.activeParticles;
    const deathMods = this._getDeathModifiers();
    let released = 0;
    const t0 = performance.now();

    let i = accessors.length;
    while (i > 0) {
      i--;
      const acc = accessors[i];
      const slotIdx = acc._i;
      if (aliveFlags[slotIdx] === 0) {
        for (const mod of deathMods) {
          mod.onDeath(acc, null);
        }
        this._storage.release(acc);
        released++;
      }
    }

    this._deathSweepTime += performance.now() - t0;
    this._deathSweepCount += released;
  }

  _cpuDeathSweep(dt) {
    if (!this._storage) return;
    if (this._wasmAvailable) {
      const len = this._storage._activeAccessors?.length || 0;
      if (len >= WASM_DEATH_SWEEP_THRESHOLD) {
        this._cpuDeathSweepWasm(dt);
        return;
      }
    }
    this._cpuDeathSweepJs(dt);
  }

  _cpuDeathSweepJs(dt) {
    if (!this._storage) return;
    const storage = this._storage;
    const active = storage._activeAccessors;
    const lifeArr = storage._life;
    const deathMods = this._getDeathModifiers();
    let released = 0;
    let freeCount = storage._freeCount;
    const freeList = storage._freeList;
    const t0 = performance.now();
    const len = active.length;
    const deathModLen = deathMods.length;

    // Combined pass: decrement life, check death, compact in one sweep
    let writeIdx = 0;
    for (let readIdx = 0; readIdx < len; readIdx++) {
      const acc = active[readIdx];
      const idx = acc._i;
      lifeArr[idx] -= dt;
      if (lifeArr[idx] > 0) {
        if (writeIdx !== readIdx) {
          active[writeIdx] = acc;
          acc._activeIndex = writeIdx;
        }
        writeIdx++;
      } else {
        for (let m = 0; m < deathModLen; m++) {
          deathMods[m].onDeath(acc, null);
        }
        freeList[freeCount] = idx;
        freeCount++;
        acc._activeIndex = -1;
        released++;
      }
    }
    active.length = writeIdx;
    storage._activeCount = writeIdx;
    storage._freeCount = freeCount;

    this._deathSweepTime += performance.now() - t0;
    this._deathSweepCount += released;
  }

  _cpuDeathSweepWasm(dt) {
    const storage = this._storage;
    const active = storage._activeAccessors;
    const lifeArr = storage._life;
    const deathMods = this._getDeathModifiers();
    const deathModLen = deathMods.length;
    const len = active.length;
    const capacity = storage.capacity;

    if (!this._ensureWasmCapacity(capacity)) {
      this._cpuDeathSweepJs(dt);
      return;
    }

    const t0 = performance.now();
    let released = 0;

    const slotAcc = this._slotAccArr;
    const slotIdx = this._slotIdxArr;
    slotIdx.length = len;
    for (let i = 0; i < len; i++) {
      const acc = active[i];
      slotAcc[acc._i] = acc;
      slotIdx[i] = acc._i;
    }

    this._wasmLifeView.set(lifeArr);
    for (let i = 0; i < len; i++) {
      this._wasmActiveView[i] = slotIdx[i];
    }

    const safeDt = Math.min(dt, MAX_DT);
    const newCount = this._wasmExports.deathSweepFull(
      0,
      capacity * 4,
      len,
      safeDt,
      capacity * 8,
      capacity,
    );

    lifeArr.set(this._wasmLifeView);

    const diedCount = len - newCount;
    const freeList = storage._freeList;
    let freeCount = storage._freeCount;
    for (let d = 0; d < diedCount; d++) {
      const slot = this._wasmDeathOutView[d];
      const acc = slotAcc[slot];
      for (let m = 0; m < deathModLen; m++) {
        deathMods[m].onDeath(acc, null);
      }
      freeList[freeCount] = slot;
      freeCount++;
      acc._activeIndex = -1;
      released++;
    }
    storage._freeCount = freeCount;

    for (let i = 0; i < newCount; i++) {
      const slot = this._wasmActiveView[i];
      const acc = slotAcc[slot];
      acc._activeIndex = i;
      active[i] = acc;
    }
    active.length = newCount;
    storage._activeCount = newCount;

    for (let i = 0; i < len; i++) {
      slotAcc[slotIdx[i]] = undefined;
    }

    this._deathSweepTime += performance.now() - t0;
    this._deathSweepCount += released;
  }

  _activeParticleCount() {
    return this._storage.activeCount;
  }

  render(ctx) {
    const count = this._activeParticleCount();
    if (count === 0) return;

    if (this._gpuRenderer && !this._renderValidationMode && this._mode === "compute") {
      // GPU-native render path: read directly from compute buffer
      const buffer = this._computeDispatcher.gpuBuffer;
      if (buffer) {
        this._gpuRenderer.setParticleBuffer(buffer);
        this._gpuRenderer.render(count, null);
      }
      return;
    }

    // Legacy render path: build render data, fill command buffer, render
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

  clear() {
    this._storage.clear();
    if (this._executor) this._executor.releaseAll();
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

  get capabilities() {
    if (this._mode === "compute") {
      return ParticleBackendCapabilities.GPU_FULL;
    }
    return ParticleBackendCapabilities.GPU_RENDER;
  }
}
