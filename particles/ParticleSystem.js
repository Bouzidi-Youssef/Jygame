import { CpuParticleBackend } from "./backends/CpuParticleBackend.js";

export class ParticleSystem {
  constructor({ renderParticle, renderer, backend } = {}) {
    this._backend = backend || new CpuParticleBackend({ renderParticle, renderer, system: this });
  }

  // ---- Modifiers ----

  addModifier(modifier, priority) {
    this._backend.addModifier(modifier, priority);
  }

  removeModifier(modifier) {
    this._backend.removeModifier(modifier);
  }

  clearModifiers() {
    this._backend.clearModifiers();
  }

  // ---- Lifecycle ----

  emit(count, initializer, emitter) {
    return this._backend.emit(count, initializer, emitter);
  }

  emitOne(initializer) {
    return this._backend.emitOne(initializer);
  }

  update(dt) {
    this._backend.update(dt);
  }

  render(ctx) {
    this._backend.render(ctx);
  }

  clear() {
    this._backend.clear();
  }

  destroy() {
    this._backend.destroy();
  }

  warmup(count) {
    this._backend.warmup(count);
  }

  // ---- Collision ----

  setCollisionProvider(provider) {
    this._backend.setCollisionProvider(provider);
  }

  // ---- Sorting ----

  get sortMode() {
    return this._backend.sortMode;
  }

  set sortMode(value) {
    this._backend.sortMode = value;
  }

  get sortFunction() {
    return this._backend.sortFunction;
  }

  set sortFunction(value) {
    this._backend.sortFunction = value;
  }

  get sortEveryFrame() {
    return this._backend.sortEveryFrame;
  }

  set sortEveryFrame(value) {
    this._backend.sortEveryFrame = value;
  }

  get sortedParticleCount() {
    return this._backend.sortedParticleCount;
  }

  _markSortDirty() {
    this._backend._markSortDirty();
  }

  // ---- Statistics ----

  get activeCount() {
    return this._backend.activeCount;
  }

  get freeCount() {
    return this._backend.freeCount;
  }

  get capacity() {
    return this._backend.capacity;
  }

  get peakActive() {
    return this._backend.peakActive;
  }

  get peakCapacity() {
    return this._backend.peakCapacity;
  }

  get peakFree() {
    return this._backend.peakFree;
  }

  get totalCreated() {
    return this._backend.totalCreated;
  }

  get isEmpty() {
    return this._backend.isEmpty;
  }

  get hasParticles() {
    return this._backend.hasParticles;
  }

  get particles() {
    return this._backend.particles;
  }

  get modifierCount() {
    return this._backend.modifierCount;
  }

  // ---- Internal access (for tests / external inspection) ----

  get _renderParticle() {
    return this._backend._renderParticle;
  }

  set _renderParticle(value) {
    this._backend._renderParticle = value;
  }

  get _sortDirty() {
    return this._backend._sortDirty;
  }

  set _sortDirty(value) {
    this._backend._sortDirty = value;
  }

  get _sortFunction() {
    return this._backend._sortFunction;
  }

  set _sortFunction(value) {
    this._backend._sortFunction = value;
  }

  get _sortedParticles() {
    return this._backend._sortedParticles;
  }

  get _collisionProvider() {
    return this._backend._collisionProvider;
  }

  set _collisionProvider(value) {
    this._backend._collisionProvider = value;
  }
}
