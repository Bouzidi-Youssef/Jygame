import { Rect } from "../geometry/Rect.js";
import { Vec2 } from "../math/Vec2.js";

export class Sprite {
  constructor(x, y, w, h) {
    this.rect = new Rect(x, y, w, h);
    this.position = new Vec2(x, y);
    this.velocity = new Vec2(0, 0);
    this.angle = 0;
    this.scale = new Vec2(1, 1);
    this.visible = true;
    this.groups = [];
    this.image = null;
    this.style = {
      fill: "#ffffff",
      shape: "rect",
    };
    this._pathCache = null;
  }

  get x() { return this.rect.x; }
  set x(v) { this.rect.x = v; }
  get y() { return this.rect.y; }
  set y(v) { this.rect.y = v; }
  get width() { return this.rect.w; }
  set width(v) { this.rect.w = v; }
  get height() { return this.rect.h; }
  set height(v) { this.rect.h = v; }

  update(dt) {
    this.rect.x += this.velocity.x * dt;
    this.rect.y += this.velocity.y * dt;
    this.position.x = this.rect.centerx;
    this.position.y = this.rect.centery;
  }

  render(ctx) {
    if (!this.visible) return;

    const cx = this.rect.centerx;
    const cy = this.rect.centery;

    if (this.angle !== 0 || this.scale.x !== 1 || this.scale.y !== 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.angle);
      ctx.scale(this.scale.x, this.scale.y);
      this.draw(ctx);
      ctx.restore();
    } else {
      ctx.translate(cx, cy);
      this.draw(ctx);
      ctx.translate(-cx, -cy);
    }
  }

  draw(ctx) {
    const hw = this.rect.w / 2;
    const hh = this.rect.h / 2;

    if (this.image) {
      ctx.drawImage(this.image, -hw, -hh, this.rect.w, this.rect.h);
      return;
    }

    const s = this.style;
    if (!s.fill) return;

    if (ctx.fillStyle !== s.fill) ctx.fillStyle = s.fill;

    if (s.shape === "circle") {
      const r = Math.min(hw, hh);
      if (!this._pathCache || this._pathCache.shape !== "circle" || this._pathCache.r !== r) {
        const path = new Path2D();
        path.arc(0, 0, r, 0, Math.PI * 2);
        this._pathCache = { shape: "circle", r, path };
      }
      ctx.fill(this._pathCache.path);
    } else if (s.shape === "ellipse") {
      if (!this._pathCache || this._pathCache.shape !== "ellipse" || this._pathCache.hw !== hw || this._pathCache.hh !== hh) {
        const path = new Path2D();
        path.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        this._pathCache = { shape: "ellipse", hw, hh, path };
      }
      ctx.fill(this._pathCache.path);
    } else {
      ctx.fillRect(-hw, -hh, this.rect.w, this.rect.h);
    }
  }

  kill() {
    for (const group of this.groups) {
      group.remove(this);
    }
    this.groups = [];
  }
}
