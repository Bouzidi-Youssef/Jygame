export class TrailModifier {
  static _nextId = 0;

  constructor({
    mode = "distance",
    every,
    initializer,
    inheritVelocity = false,
    maxPerFrame = Infinity,
    maxDistance = Infinity,
    priority
  } = {}) {
    this._id = TrailModifier._nextId++;

    if (mode !== "distance" && mode !== "interval") {
      throw new Error('TrailModifier mode must be "distance" or "interval"');
    }
    this._mode = mode;

    if (!Number.isFinite(every) || every <= 0) {
      throw new Error("TrailModifier every must be a finite number > 0");
    }
    this._every = every;

    if (typeof initializer !== "function") {
      throw new Error("TrailModifier requires an initializer function");
    }
    this._initializer = initializer;

    this._inheritVelocity = !!inheritVelocity;

    if (!Number.isFinite(maxPerFrame) || maxPerFrame < 0) {
      throw new Error("TrailModifier maxPerFrame must be >= 0");
    }
    this._maxPerFrame = maxPerFrame;

    if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
      throw new Error("TrailModifier maxDistance must be a finite number > 0");
    }
    this._maxDistance = maxDistance;

    this._spawnedThisFrame = 0;
    this.spawnedCount = 0;
    this.enabled = true;
    this.priority = priority;
  }

  _ensureState(particle) {
    if (!particle.__trailStates) particle.__trailStates = {};
    let state = particle.__trailStates[this._id];
    if (!state) {
      state = { x: 0, y: 0, timer: 0 };
      particle.__trailStates[this._id] = state;
    }
    return state;
  }

  beginFrame() {
    this._spawnedThisFrame = 0;
  }

  onEmit(particle) {
    const state = this._ensureState(particle);
    state.x = particle.x;
    state.y = particle.y;
    state.timer = 0;
  }

  update(particle, dt, ctx) {
    const state = this._ensureState(particle);
    const system = ctx.system;
    const prevX = state.x;
    const prevY = state.y;
    const curX = particle.x;
    const curY = particle.y;
    const dx = curX - prevX;
    const dy = curY - prevY;

    state.x = curX;
    state.y = curY;

    if (this._mode === "interval") {
      state.timer += dt;
      while (state.timer >= this._every && this._spawnedThisFrame < this._maxPerFrame) {
        state.timer -= this._every;
        this._spawn(particle, curX, curY, system);
      }
    } else {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      if (dist > this._maxDistance) {
        state.timer = 0;
        return;
      }

      state.timer += dist;

      while (state.timer >= this._every && this._spawnedThisFrame < this._maxPerFrame) {
        state.timer -= this._every;
        const t = (dist - state.timer) / dist;
        const sx = prevX + dx * t;
        const sy = prevY + dy * t;
        this._spawn(particle, sx, sy, system);
      }
    }
  }

  _spawn(source, sx, sy, system) {
    const child = system.emitOne(null);
    child.x = sx;
    child.y = sy;
    if (this._inheritVelocity) {
      child.vx = source.vx;
      child.vy = source.vy;
    }
    this._initializer(child, source);
    this._spawnedThisFrame++;
    this.spawnedCount++;
  }

  destroy() {
    this._initializer = null;
  }
}
