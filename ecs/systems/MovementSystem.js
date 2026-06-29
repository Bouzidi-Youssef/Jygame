import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Velocity } from "../components/Velocity.js";

export class MovementSystem extends System {
  static query = { all: [Transform, Velocity] };
  static priority = 0;

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    const vid = this._compiled.componentIds.get(Velocity);
    if (tid === undefined || vid === undefined) return;

    const tables = ctx.tables();
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const count = table.count;
      if (count === 0) continue;

      const tx = table.getColumn(tid, "x");
      const ty = table.getColumn(tid, "y");
      const vx = table.getColumn(vid, "x");
      const vy = table.getColumn(vid, "y");
      if (!tx || !ty || !vx || !vy) continue;

      for (let r = 0; r < count; r++) {
        tx[r] += vx[r] * dt;
        ty[r] += vy[r] * dt;
      }
    }
  }
}
