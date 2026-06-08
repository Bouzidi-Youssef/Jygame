import { Rect } from "../geometry/Rect.js";
import { Vec2 } from "../math/Vec2.js";
import { Renderable } from "../components/Renderable.js";

export class Sprite {
  constructor(x, y, w, h) {
    this.rect = new Rect(x, y, w, h);
    this.velocity = new Vec2(0, 0);
    this.angle = 0;
    this.scale = new Vec2(1, 1);
    this.visible = true;
    this.groups = [];
    this.renderable = new Renderable();
  }

  get x() { return this.rect.x; }
  set x(v) { this.rect.x = v; }
  get y() { return this.rect.y; }
  set y(v) { this.rect.y = v; }
  get width() { return this.rect.w; }
  set width(v) { this.rect.w = v; }
  get height() { return this.rect.h; }
  set height(v) { this.rect.h = v; }

  get image() { return this.renderable.image; }
  set image(v) { this.renderable.image = v; }
  get style() { return this.renderable.style; }
  set style(v) { this.renderable.style = v; }

  update(dt) {
    this.rect.x += this.velocity.x * dt;
    this.rect.y += this.velocity.y * dt;
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
      this.renderable.draw(ctx, this.rect.w, this.rect.h);
      ctx.restore();
    } else {
      ctx.translate(cx, cy);
      this.renderable.draw(ctx, this.rect.w, this.rect.h);
      ctx.translate(-cx, -cy);
    }
  }

  draw(ctx) {
    this.renderable.draw(ctx, this.rect.w, this.rect.h);
  }

  kill() {
    for (const group of this.groups) {
      group.remove(this);
    }
    this.groups = [];
  }
}
