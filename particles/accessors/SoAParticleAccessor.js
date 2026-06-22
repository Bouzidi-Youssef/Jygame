import { ParticleAccessor } from "./ParticleAccessor.js";

export class SoAParticleAccessor extends ParticleAccessor {
  constructor(storage, i) {
    super();
    this._s = storage;
    this._i = i;

    this._texture = null;
    this._originX = 0.5;
    this._originY = 0.5;
    this._width = 0;
    this._height = 0;
    this._frameX = 0;
    this._frameY = 0;
    this._frameWidth = 0;
    this._frameHeight = 0;
    this._collides = false;
    this._radius = 1;
    this._collisionResponse = "bounce";
    this._restitution = 1;
    this._collisionLayer = "default";
    this._onCollision = null;
    this._color = "#ffffff";
    this._userData = null;
    this._sortOrder = 0;
    this._activeIndex = -1;
  }

  get __jygameSortOrder() { return this._sortOrder; }
  set __jygameSortOrder(v) { this._sortOrder = v; }

  wrap(source) {
    if (source instanceof SoAParticleAccessor) {
      this._i = source._i;
      this._texture = source._texture;
      this._originX = source._originX;
      this._originY = source._originY;
      this._width = source._width;
      this._height = source._height;
      this._frameX = source._frameX;
      this._frameY = source._frameY;
      this._frameWidth = source._frameWidth;
      this._frameHeight = source._frameHeight;
      this._collides = source._collides;
      this._radius = source._radius;
      this._collisionResponse = source._collisionResponse;
      this._restitution = source._restitution;
      this._collisionLayer = source._collisionLayer;
      this._onCollision = source._onCollision;
      this._color = source._color;
      this._userData = source._userData;
      this._sortOrder = source._sortOrder;
    }
  }

  reset() {
    this._texture = null;
    this._originX = 0.5;
    this._originY = 0.5;
    this._width = 0;
    this._height = 0;
    this._frameX = 0;
    this._frameY = 0;
    this._frameWidth = 0;
    this._frameHeight = 0;
    this._collides = false;
    this._radius = 1;
    this._collisionResponse = "bounce";
    this._restitution = 1;
    this._collisionLayer = "default";
    this._onCollision = null;
    this._color = "#ffffff";
    this._userData = null;
    this._sortOrder = 0;
    this._activeIndex = -1;
  }

  get __jygameId() { return this._s._id[this._i]; }
  set __jygameId(v) { this._s._id[this._i] = v; }

  get x() { return this._s._x[this._i]; } set x(v) { this._s._x[this._i] = v; }
  get y() { return this._s._y[this._i]; } set y(v) { this._s._y[this._i] = v; }
  get vx() { return this._s._vx[this._i]; } set vx(v) { this._s._vx[this._i] = v; }
  get vy() { return this._s._vy[this._i]; } set vy(v) { this._s._vy[this._i] = v; }
  get ax() { return this._s._ax[this._i]; } set ax(v) { this._s._ax[this._i] = v; }
  get ay() { return this._s._ay[this._i]; } set ay(v) { this._s._ay[this._i] = v; }
  get life() { return this._s._life[this._i]; } set life(v) { this._s._life[this._i] = v; }
  get maxLife() { return this._s._maxLife[this._i]; } set maxLife(v) { this._s._maxLife[this._i] = v; }
  get ageRatio() { return this._s._ageRatio[this._i]; } set ageRatio(v) { this._s._ageRatio[this._i] = v; }
  get size() { return this._s._size[this._i]; } set size(v) { this._s._size[this._i] = v; }
  get rotation() { return this._s._rotation[this._i]; } set rotation(v) { this._s._rotation[this._i] = v; }
  get rotationSpeed() { return this._s._rotationSpeed[this._i]; } set rotationSpeed(v) { this._s._rotationSpeed[this._i] = v; }
  get alpha() { return this._s._alpha[this._i]; } set alpha(v) { this._s._alpha[this._i] = v; }
  get depth() { return this._s._depth[this._i]; } set depth(v) { this._s._depth[this._i] = v; }
  get r() { return this._s._r[this._i]; } set r(v) { this._s._r[this._i] = v; }
  get g() { return this._s._g[this._i]; } set g(v) { this._s._g[this._i] = v; }
  get b() { return this._s._b[this._i]; } set b(v) { this._s._b[this._i] = v; }
  get alive() { return this._s._alive[this._i]; } set alive(v) { this._s._alive[this._i] = v; }
  get seed() { return this._s._seed[this._i]; } set seed(v) { this._s._seed[this._i] = v; }
  get segment() { return this._s._segment[this._i]; } set segment(v) { this._s._segment[this._i] = v; }

  get texture() { return this._texture; } set texture(v) { this._texture = v; }
  get originX() { return this._originX; } set originX(v) { this._originX = v; }
  get originY() { return this._originY; } set originY(v) { this._originY = v; }
  get width() { return this._width; } set width(v) { this._width = v; }
  get height() { return this._height; } set height(v) { this._height = v; }
  get frameX() { return this._frameX; } set frameX(v) { this._frameX = v; }
  get frameY() { return this._frameY; } set frameY(v) { this._frameY = v; }
  get frameWidth() { return this._frameWidth; } set frameWidth(v) { this._frameWidth = v; }
  get frameHeight() { return this._frameHeight; } set frameHeight(v) { this._frameHeight = v; }
  get collides() { return this._collides; } set collides(v) { this._collides = v; }
  get radius() { return this._radius; } set radius(v) { this._radius = v; }
  get collisionResponse() { return this._collisionResponse; } set collisionResponse(v) { this._collisionResponse = v; }
  get restitution() { return this._restitution; } set restitution(v) { this._restitution = v; }
  get collisionLayer() { return this._collisionLayer; } set collisionLayer(v) { this._collisionLayer = v; }
  get onCollision() { return this._onCollision; } set onCollision(v) { this._onCollision = v; }
  get color() { return this._color; } set color(v) { this._color = v; }
  get userData() { return this._userData; } set userData(v) { this._userData = v; }
}
