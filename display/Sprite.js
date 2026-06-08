import { Vec2 } from "../math/Vec2.js";
import { Transform } from "../components/Transform.js";
import { Collider } from "../components/Collider.js";
import { Renderable } from "../components/Renderable.js";
import { movementSystem } from "../systems/MovementSystem.js";
import { renderSystem } from "../systems/RenderSystem.js";

export class Sprite {
  constructor(x, y, w, h) {
    this.transform = new Transform(x + w / 2, y + h / 2);
    this.collider = new Collider(w, h);
    this.velocity = new Vec2(0, 0);
    this.visible = true;
    this.groups = [];
    this.renderable = new Renderable();
  }

  get x() { return this.transform.x - this.collider.width / 2; }
  set x(v) { this.transform.x = v + this.collider.width / 2; }
  get y() { return this.transform.y - this.collider.height / 2; }
  set y(v) { this.transform.y = v + this.collider.height / 2; }
  get width() { return this.collider.width; }
  set width(v) { this.collider.width = v; }
  get height() { return this.collider.height; }
  set height(v) { this.collider.height = v; }

  get image() { return this.renderable.image; }
  set image(v) { this.renderable.image = v; }
  get style() { return this.renderable.style; }
  set style(v) { this.renderable.style = v; }

  get angle() { return this.transform.rotation; }
  set angle(v) { this.transform.rotation = v; }
  get scale() { return this.transform.scale; }
  set scale(v) { this.transform.scale = v; }

  update(dt) {
    movementSystem.updateOne(this, dt);
  }

  render(ctx) {
    renderSystem.renderOne(ctx, this);
  }

  kill() {
    for (const group of this.groups) {
      group.remove(this);
    }
    this.groups = [];
  }
}
