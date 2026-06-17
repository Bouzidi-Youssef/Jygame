export class TrailModifier {
  constructor({
    mode = "distance",
    every,
    initializer,
    inheritVelocity = false,
    maxPerFrame = Infinity,
    maxDistance = Infinity,
    priority
  } = {}) {
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

  beginFrame() {
    this._spawnedThisFrame = 0;
  }

  onEmit(particle) {
    particle.__jygameTrailX = particle.x;
    particle.__jygameTrailY = particle.y;
    particle.__jygameTrailTimer = 0;
  }

  update(particle, dt, ctx) {
    const system = ctx.system;
    const prevX = particle.__jygameTrailX;
    const prevY = particle.__jygameTrailY;
    const curX = particle.x;
    const curY = particle.y;
    const dx = curX - prevX;
    const dy = curY - prevY;

    particle.__jygameTrailX = curX;
    particle.__jygameTrailY = curY;

    if (this._mode === "interval") {
      particle.__jygameTrailTimer += dt;
      while (particle.__jygameTrailTimer >= this._every && this._spawnedThisFrame < this._maxPerFrame) {
        particle.__jygameTrailTimer -= this._every;
        this._spawn(particle, curX, curY, system);
      }
    } else {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      if (dist > this._maxDistance) {
        particle.__jygameTrailTimer = 0;
        return;
      }

      particle.__jygameTrailTimer += dist;

      while (particle.__jygameTrailTimer >= this._every && this._spawnedThisFrame < this._maxPerFrame) {
        particle.__jygameTrailTimer -= this._every;
        const t = (dist - particle.__jygameTrailTimer) / dist;
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
}
