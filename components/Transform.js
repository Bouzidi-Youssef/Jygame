import { Vec2 } from "../math/Vec2.js";

export class Transform {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.rotation = 0;
    this.scale = new Vec2(1, 1);
  }
}
