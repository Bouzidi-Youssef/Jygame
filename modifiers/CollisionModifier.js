export class CollisionModifier {
  constructor({ provider, frequency = 1, priority, onParticleCollision } = {}) {
    if (frequency !== undefined && (!Number.isInteger(frequency) || frequency < 1)) {
      throw new Error("CollisionModifier: frequency must be a positive integer");
    }

    this._provider = provider || null;
    this._frequency = frequency;
    this._frameCounter = 0;
    this._onParticleCollision = onParticleCollision || null;
    this._frameCollisions = 0;

    this.enabled = true;
    this.priority = priority;
    this.collisionCount = 0;
    this.lastFrameCollisions = 0;
  }

  beginFrame() {
    this._frameCounter++;
  }

  update(p, dt, ctx) {
    if (!p.collides) return;
    if (this._frameCounter % this._frequency !== 0) return;

    const provider = this._provider || (ctx.system && ctx.system._collisionProvider);
    if (!provider) return;

    const hit = provider.queryCircle(p.x, p.y, p.radius, p.collisionLayer);
    if (!hit) return;

    this.collisionCount++;
    this._frameCollisions++;
    this._resolve(p, hit);
    if (p.onCollision) p.onCollision(p, hit);
    if (this._onParticleCollision) this._onParticleCollision(p, hit);
  }

  endFrame() {
    this.lastFrameCollisions = this._frameCollisions;
    this._frameCollisions = 0;
  }

  _resolve(p, hit) {
    switch (p.collisionResponse) {
      case "bounce": this._bounce(p, hit); break;
      case "slide": this._slide(p, hit); break;
      case "stop": this._stop(p, hit); break;
      case "kill": this._kill(p, hit); break;
      default: break;
    }
  }

  _bounce(p, hit) {
    const dot = p.vx * hit.normalX + p.vy * hit.normalY;
    if (dot >= 0) return;
    p.vx -= 2 * dot * hit.normalX;
    p.vy -= 2 * dot * hit.normalY;
    p.vx *= p.restitution;
    p.vy *= p.restitution;
    p.x += hit.normalX * hit.penetration;
    p.y += hit.normalY * hit.penetration;
  }

  _slide(p, hit) {
    const dot = p.vx * hit.normalX + p.vy * hit.normalY;
    if (dot >= 0) return;
    p.vx -= dot * hit.normalX;
    p.vy -= dot * hit.normalY;
    p.x += hit.normalX * hit.penetration;
    p.y += hit.normalY * hit.penetration;
  }

  _stop(p, hit) {
    p.vx = 0;
    p.vy = 0;
    p.x += hit.normalX * hit.penetration;
    p.y += hit.normalY * hit.penetration;
  }

  _kill(p, hit) {
    p.life = 0;
  }

  clone() {
    return new CollisionModifier({
      provider: this._provider,
      frequency: this._frequency,
      priority: this.priority,
      onParticleCollision: this._onParticleCollision,
    });
  }

  toJSON() {
    throw new Error("CollisionModifier.toJSON is not supported (provider is external)");
  }
}
