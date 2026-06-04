export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  magnitude() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const m = this.magnitude();
    if (m === 0) return this;
    this.x /= m;
    this.y /= m;
    return this;
  }

  angle() {
    return Math.atan2(this.y, this.x);
  }

  setAngle(a) {
    const m = this.magnitude();
    this.x = Math.cos(a) * m;
    this.y = Math.sin(a) * m;
    return this;
  }

  rotate(a) {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const rx = this.x * cos - this.y * sin;
    const ry = this.x * sin + this.y * cos;
    this.x = rx;
    this.y = ry;
    return this;
  }

  perpendicular() {
    const tx = this.x;
    this.x = -this.y;
    this.y = tx;
    return this;
  }

  dist(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  clone() {
    return new Vec2(this.x, this.y);
  }

  static fromAngle(angle, length = 1) {
    return new Vec2(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  static lerp(a, b, t) {
    return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
}
