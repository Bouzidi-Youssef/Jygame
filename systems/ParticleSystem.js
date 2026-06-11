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
  p.__jygameColorSegment = 0;
};

export class ParticleSystem {
  constructor({ renderParticle } = {}) {
    this._renderParticle = renderParticle;
    this._pool = new ActivePool({
      create: () => new Particle(),
      reset: _resetParticle,
    });
    this._modifiers = [];
  }

  addModifier(modifier) {
    this._modifiers.push(modifier);
  }

  removeModifier(modifier) {
    const idx = this._modifiers.indexOf(modifier);
    if (idx !== -1) {
      const last = this._modifiers.pop();
      if (idx < this._modifiers.length) {
        this._modifiers[idx] = last;
      }
    }
  }

  clearModifiers() {
    this._modifiers.length = 0;
  }

  emit(count, initializer, emitter) {
    const modifiers = this._modifiers;
    const modCount = modifiers.length;
    for (let i = 0; i < count; i++) {
      const p = this._pool.acquire();
      if (initializer) initializer(p, i, emitter);
      for (let m = 0; m < modCount; m++) {
        modifiers[m].onEmit?.(p);
      }
    }
  }

  emitOne(initializer) {
    const p = this._pool.acquire();
    if (initializer) initializer(p, 0);
    const modifiers = this._modifiers;
    for (let m = 0; m < modifiers.length; m++) {
      modifiers[m].onEmit?.(p);
    }
    return p;
  }

  update(dt) {
    const active = this._pool.activeObjects;
    const pool = this._pool;
    const modifiers = this._modifiers;
    const modCount = modifiers.length;
    const hasModifiers = modCount > 0;

    if (hasModifiers) {
      for (let m = 0; m < modCount; m++) {
        modifiers[m].prepare?.(dt);
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

      if (hasModifiers) {
        for (let m = 0; m < modCount; m++) {
          modifiers[m].update?.(p, dt);
        }
      }

      if (p.life <= 0) {
        if (hasModifiers) {
          for (let m = 0; m < modCount; m++) {
            modifiers[m].onDeath?.(p);
          }
        }
        pool.release(p);
      }
    }
  }

  render(ctx) {
    const active = this._pool.activeObjects;
    ctx.save();
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      ctx.globalAlpha = p.alpha;
      if (this._renderParticle) {
        this._renderParticle(ctx, p);
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
}
