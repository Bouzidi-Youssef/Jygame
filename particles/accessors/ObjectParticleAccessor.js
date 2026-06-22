import { ParticleAccessor } from "./ParticleAccessor.js";

export class ObjectParticleAccessor extends ParticleAccessor {
  constructor() {
    super();
    this._p = null;
  }

  wrap(p) {
    this._p = p;
  }

  get __jygameId() { return this._p.__jygameId; }
  get __jygameSortOrder() { return this._p.__jygameSortOrder; }
  set __jygameSortOrder(v) { this._p.__jygameSortOrder = v; }

  get x() { return this._p.x; } set x(v) { this._p.x = v; }
  get y() { return this._p.y; } set y(v) { this._p.y = v; }
  get vx() { return this._p.vx; } set vx(v) { this._p.vx = v; }
  get vy() { return this._p.vy; } set vy(v) { this._p.vy = v; }
  get ax() { return this._p.ax; } set ax(v) { this._p.ax = v; }
  get ay() { return this._p.ay; } set ay(v) { this._p.ay = v; }
  get life() { return this._p.life; } set life(v) { this._p.life = v; }
  get maxLife() { return this._p.maxLife; } set maxLife(v) { this._p.maxLife = v; }
  get ageRatio() { return this._p.ageRatio; } set ageRatio(v) { this._p.ageRatio = v; }
  get size() { return this._p.size; } set size(v) { this._p.size = v; }
  get rotation() { return this._p.rotation; } set rotation(v) { this._p.rotation = v; }
  get rotationSpeed() { return this._p.rotationSpeed; } set rotationSpeed(v) { this._p.rotationSpeed = v; }
  get alpha() { return this._p.alpha; } set alpha(v) { this._p.alpha = v; }
  get depth() { return this._p.depth; } set depth(v) { this._p.depth = v; }
  get r() { return this._p.r; } set r(v) { this._p.r = v; }
  get g() { return this._p.g; } set g(v) { this._p.g = v; }
  get b() { return this._p.b; } set b(v) { this._p.b = v; }
  get alive() { return this._p.alive; } set alive(v) { this._p.alive = v; }
  get seed() { return this._p.seed; } set seed(v) { this._p.seed = v; }
  get segment() { return this._p.segment; } set segment(v) { this._p.segment = v; }
  get texture() { return this._p.texture; } set texture(v) { this._p.texture = v; }
  get originX() { return this._p.originX; } set originX(v) { this._p.originX = v; }
  get originY() { return this._p.originY; } set originY(v) { this._p.originY = v; }
  get width() { return this._p.width; } set width(v) { this._p.width = v; }
  get height() { return this._p.height; } set height(v) { this._p.height = v; }
  get frameX() { return this._p.frameX; } set frameX(v) { this._p.frameX = v; }
  get frameY() { return this._p.frameY; } set frameY(v) { this._p.frameY = v; }
  get frameWidth() { return this._p.frameWidth; } set frameWidth(v) { this._p.frameWidth = v; }
  get frameHeight() { return this._p.frameHeight; } set frameHeight(v) { this._p.frameHeight = v; }

  get collides() { return this._p.collides; } set collides(v) { this._p.collides = v; }
  get radius() { return this._p.radius; } set radius(v) { this._p.radius = v; }
  get collisionResponse() { return this._p.collisionResponse; } set collisionResponse(v) { this._p.collisionResponse = v; }
  get restitution() { return this._p.restitution; } set restitution(v) { this._p.restitution = v; }
  get collisionLayer() { return this._p.collisionLayer; } set collisionLayer(v) { this._p.collisionLayer = v; }
  get onCollision() { return this._p.onCollision; } set onCollision(v) { this._p.onCollision = v; }
  get color() { return this._p.color; } set color(v) { this._p.color = v; }
  get userData() { return this._p.userData; } set userData(v) { this._p.userData = v; }
}
