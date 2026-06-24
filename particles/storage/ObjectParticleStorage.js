import { ActivePool } from "../../memory/ActivePool.js";
import { Particle } from "../../display/Particle.js";
import { ParticleStorage } from "./ParticleStorage.js";

let _nextId = 1;

function _resetParticle(p) {
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
  p.alive = 1;
  p.seed = 0;
  p.segment = 0;
  p.color = "#ffffff";
  p.depth = 0;
  p.ageRatio = 0;
  p.collides = false;
  p.radius = 1;
  p.collisionResponse = "bounce";
  p.restitution = 1;
  p.collisionLayer = "default";
  p.onCollision = null;
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
  p.__jygameSortOrder = 0;
  p.__jygameId = 0;
}

export class ObjectParticleStorage extends ParticleStorage {
  constructor({ initialSize, maxSize } = {}) {
    super();
    this._pool = new ActivePool({
      create: () => new Particle(),
      reset: _resetParticle,
      initialSize,
      maxSize,
    });
  }

  acquire() {
    const p = this._pool.acquire();
    p.__jygameId = _nextId++;
    return p;
  }

  release(obj) {
    return this._pool.release(obj);
  }

  clear() {
    this._pool.clearActive();
  }

  warmup(count) {
    this._pool.warmup(count);
  }

  get activeParticles() {
    return this._pool.activeObjects;
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

  get maxCapacity() {
    return this._pool._maxSize;
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

  resolveParticle(sortIndex) {
    return this._pool.activeObjects[sortIndex];
  }

  getFieldValue(sortIndex, fieldName) {
    return this._pool.activeObjects[sortIndex][fieldName];
  }

  setFieldValue(sortIndex, fieldName, value) {
    this._pool.activeObjects[sortIndex][fieldName] = value;
  }

  getSortOrder(sortIndex) {
    return this._pool.activeObjects[sortIndex].__jygameSortOrder;
  }

  integrateParticle(p, dt) {
    p.vx += p.ax * dt;
    p.vy += p.ay * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.rotationSpeed * dt;
    p.life -= dt;
    p.ageRatio = p.maxLife > 0
      ? Math.max(0, Math.min(1, 1 - p.life / p.maxLife))
      : 0;
  }
}
