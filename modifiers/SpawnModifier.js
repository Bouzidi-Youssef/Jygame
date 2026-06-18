export class SpawnModifier {
  static _nextId = 0;

  constructor({
    mode,
    every,
    count = 1,
    initializer,
    offsetX = 0,
    offsetY = 0,
    maxPerFrame = Infinity,
    priority
  } = {}) {
    this._id = SpawnModifier._nextId++;

    if (mode !== "interval" && mode !== "death") {
      throw new Error('SpawnModifier mode must be "interval" or "death"');
    }
    this._mode = mode;

    if (mode === "interval") {
      if (!Number.isFinite(every) || every <= 0) {
        throw new Error("SpawnModifier every must be a finite number > 0 for interval mode");
      }
      this._every = every;
    }

    if (!Number.isFinite(count) || count < 1) {
      throw new Error("SpawnModifier count must be >= 1");
    }
    this._count = count;

    if (typeof initializer !== "function") {
      throw new Error("SpawnModifier requires an initializer function");
    }
    this._initializer = initializer;

    if (!Number.isFinite(offsetX)) throw new Error("SpawnModifier offsetX must be a finite number");
    if (!Number.isFinite(offsetY)) throw new Error("SpawnModifier offsetY must be a finite number");
    this._offsetX = offsetX;
    this._offsetY = offsetY;

    if (!Number.isFinite(maxPerFrame) || maxPerFrame < 0) {
      throw new Error("SpawnModifier maxPerFrame must be >= 0");
    }
    this._maxPerFrame = maxPerFrame;

    this._spawnedThisFrame = 0;
    this.spawnedCount = 0;
    this.enabled = true;
    this.priority = priority;
  }

  _ensureState(particle) {
    if (!particle.__spawnStates) particle.__spawnStates = {};
    let state = particle.__spawnStates[this._id];
    if (!state) {
      state = { timer: 0 };
      particle.__spawnStates[this._id] = state;
    }
    return state;
  }

  beginFrame() {
    this._spawnedThisFrame = 0;
  }

  onEmit(particle) {
    if (this._mode === "interval") {
      this._ensureState(particle).timer = 0;
    }
  }

  update(particle, dt, ctx) {
    if (this._mode !== "interval") return;

    const state = this._ensureState(particle);
    state.timer += dt;

    if (state.timer < this._every) return;

    const system = ctx.system;
    let remaining = Math.floor(state.timer / this._every);
    state.timer -= remaining * this._every;

    const limit = this._maxPerFrame;
    while (remaining > 0 && this._spawnedThisFrame < limit) {
      this._spawn(particle, system);
      remaining--;
    }
  }

  onDeath(particle, ctx) {
    if (this._mode !== "death") return;

    const system = ctx.system;
    const limit = this._maxPerFrame;
    let spawned = 0;

    while (spawned < this._count && this._spawnedThisFrame < limit) {
      this._spawn(particle, system);
      spawned++;
    }
  }

  _spawn(source, system) {
    const child = system.emitOne(null);
    child.x = source.x + this._offsetX;
    child.y = source.y + this._offsetY;
    this._initializer(child, source);
    if (child.maxLife <= 0) {
      child.maxLife = 1;
      child.life = 1;
    }
    this._spawnedThisFrame++;
    this.spawnedCount++;
  }
}
