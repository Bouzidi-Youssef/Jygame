import { ActivePool } from "../memory/ActivePool.js";
import { Particle } from "../display/Particle.js";

const _resetParticle = p => {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.ax = 0;
  p.ay = 0;
  p.life = 0;
  p.maxLife = 0;
  p.size = 1;
  p.rotation = 0;
  p.rotationSpeed = 0;
  p.alpha = 1;
  p.r = 255;
  p.g = 255;
  p.b = 255;
  p.color = "#ffffff";
  p.ageRatio = 0;
  p.texture = null;
  p.originX = 0.5;
  p.originY = 0.5;
  p.width = 0;
  p.height = 0;
  p.frameX = 0;
  p.frameY = 0;
  p.frameWidth = 0;
  p.frameHeight = 0;
  p.userData = null;
  p.__jygameAnimOffset = 0;
  p.__jygameAnimPrevFrame = -1;
  p.__jygameAnimLoopCount = 0;
  p.__jygameColorSegment = 0;
  p.__jygameAnimSegments = null;
  p.__turbulenceStates = null;
  p.__spawnStates = null;
  p.__trailStates = null;
};

const _hasLifecycleMethods = mod =>
  typeof mod.beginFrame === 'function' ||
  typeof mod.update === 'function' ||
  typeof mod.onEmit === 'function' ||
  typeof mod.onDeath === 'function' ||
  typeof mod.endFrame === 'function';

const _createEntry = (modifier, priority) => ({ modifier, priority });

export class ParticleSystem {
  constructor({ renderParticle } = {}) {
    this._renderParticle = renderParticle;
    this._pool = new ActivePool({
      create: () => new Particle(),
      reset: _resetParticle,
    });
    this._modifiers = [];
    this._updateModifiers = [];
    this._emitModifiers = [];
    this._deathModifiers = [];
    this._beginFrameModifiers = [];
    this._endFrameModifiers = [];
    this._modifierContext = { system: this, activeParticles: this._pool.activeObjects };
    this._isUpdating = false;
    this._pendingRemove = null;
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
    if (!_hasLifecycleMethods(modifier)) {
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
    this._renderParticle = null;
    this._modifierContext.system = null;
    this._modifierContext.activeParticles = null;
  }

  emit(count, initializer, emitter) {
    const emitMods = this._emitModifiers;
    const emLen = emitMods.length;
    const ctx = this._modifierContext;
    for (let i = 0; i < count; i++) {
      const p = this._pool.acquire();
      if (initializer) initializer(p, i, emitter);
      for (let m = 0; m < emLen; m++) {
        const mod = emitMods[m];
        if (mod.enabled !== false) {
          mod.onEmit(p, ctx);
        }
      }
    }
  }

  emitOne(initializer) {
    const p = this._pool.acquire();
    if (initializer) initializer(p, 0);
    const emitMods = this._emitModifiers;
    const ctx = this._modifierContext;
    for (let m = 0; m < emitMods.length; m++) {
      const mod = emitMods[m];
      if (mod.enabled !== false) {
        mod.onEmit(p, ctx);
      }
    }
    return p;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    this._isUpdating = true;

    const active = this._pool.activeObjects;
    const pool = this._pool;
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

    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];

      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      p.life -= dt;
      p.ageRatio = p.maxLife > 0
        ? Math.max(0, Math.min(1, 1 - p.life / p.maxLife))
        : 0;

      for (let m = 0; m < upLen; m++) {
        const mod = updateMods[m];
        if (mod.enabled !== false) {
          mod.update(p, dt, ctx);
        }
      }

      if (p.life <= 0) {
        for (let m = 0; m < dLen; m++) {
          const mod = deathMods[m];
          if (mod.enabled !== false) {
            mod.onDeath(p, ctx);
          }
        }
        pool.release(p);
      }
    }

    for (let m = 0; m < efLen; m++) {
      const mod = endFrameMods[m];
      if (mod.enabled !== false) {
        mod.endFrame(dt, ctx);
      }
    }

    this._isUpdating = false;
    this._flushPendingRemovals();
  }

  render(ctx) {
    const active = this._pool.activeObjects;
    ctx.save();
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      ctx.globalAlpha = p.alpha;
      if (this._renderParticle) {
        this._renderParticle(ctx, p);
      } else if (p.texture) {
        const w = p.width > 0 ? p.width : p.size;
        const h = p.height > 0 ? p.height : p.size;
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.rotation) ctx.rotate(p.rotation);
        if (p.frameWidth > 0 && p.frameHeight > 0) {
          ctx.drawImage(p.texture, p.frameX, p.frameY, p.frameWidth, p.frameHeight, -w * p.originX, -h * p.originY, w, h);
        } else {
          ctx.drawImage(p.texture, -w * p.originX, -h * p.originY, w, h);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = `rgb(${p.r | 0},${p.g | 0},${p.b | 0})`;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      }
    }
    ctx.restore();
  }

  clear() {
    this._pool.clearActive();
  }

  get particles() {
    return this._pool.activeObjects;
  }

  warmup(count) {
    this._pool.warmup(count);
  }

  get activeCount() {
    return this._pool.activeCount;
  }

  get freeCount() {
    return this._pool.freeCount;
  }

  get capacity() {
    return this._pool.capacity;
  }

  get peakActive() {
    return this._pool.peakActive;
  }

  get peakCapacity() {
    return this._pool.peakCapacity;
  }

  get peakFree() {
    return this._pool.peakFree;
  }

  get totalCreated() {
    return this._pool.totalCreated;
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
