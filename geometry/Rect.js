export class Rect {
  constructor(x = 0, y = 0, w = 0, h = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  get left() { return this.x; }
  set left(v) { this.x = v; }
  get right() { return this.x + this.w; }
  set right(v) { this.x = v - this.w; }
  get top() { return this.y; }
  set top(v) { this.y = v; }
  get bottom() { return this.y + this.h; }
  set bottom(v) { this.y = v - this.h; }

  get centerx() { return this.x + this.w / 2; }
  set centerx(v) { this.x = v - this.w / 2; }
  get centery() { return this.y + this.h / 2; }
  set centery(v) { this.y = v - this.h / 2; }

  get topleft()     { return { x: this.x, y: this.y }; }
  set topleft(p)    { this.x = p.x; this.y = p.y; }
  get topright()    { return { x: this.right, y: this.y }; }
  set topright(p)   { this.right = p.x; this.y = p.y; }
  get bottomleft()  { return { x: this.x, y: this.bottom }; }
  set bottomleft(p) { this.x = p.x; this.bottom = p.y; }
  get bottomright() { return { x: this.right, y: this.bottom }; }
  set bottomright(p){ this.right = p.x; this.bottom = p.y; }

  get midtop()    { return { x: this.centerx, y: this.y }; }
  set midtop(p)   { this.centerx = p.x; this.y = p.y; }
  get midleft()   { return { x: this.x, y: this.centery }; }
  set midleft(p)  { this.x = p.x; this.centery = p.y; }
  get midbottom() { return { x: this.centerx, y: this.bottom }; }
  set midbottom(p){ this.centerx = p.x; this.bottom = p.y; }
  get midright()  { return { x: this.right, y: this.centery }; }
  set midright(p) { this.right = p.x; this.centery = p.y; }

  get center()    { return { x: this.centerx, y: this.centery }; }
  set center(p)   { this.centerx = p.x; this.centery = p.y; }

  collides(other) {
    return (
      this.left < other.right &&
      this.right > other.left &&
      this.top < other.bottom &&
      this.bottom > other.top
    );
  }

  contains(point) {
    return (
      point.x >= this.left &&
      point.x <= this.right &&
      point.y >= this.top &&
      point.y <= this.bottom
    );
  }

  overlap(other) {
    const l = Math.max(this.left, other.left);
    const r = Math.min(this.right, other.right);
    const t = Math.max(this.top, other.top);
    const b = Math.min(this.bottom, other.bottom);
    if (l >= r || t >= b) return null;
    return new Rect(l, t, r - l, b - t);
  }

  clamp(outer) {
    if (this.left < outer.left) this.left = outer.left;
    if (this.right > outer.right) this.right = outer.right;
    if (this.top < outer.top) this.top = outer.top;
    if (this.bottom > outer.bottom) this.bottom = outer.bottom;
    return this;
  }

  inset(n) {
    this.x += n;
    this.y += n;
    this.w -= n * 2;
    this.h -= n * 2;
    return this;
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
    return this;
  }

  copy() {
    return new Rect(this.x, this.y, this.w, this.h);
  }
}
