import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Trail } from "../components/Trail.js";
import { Visible } from "../components/Visible.js";
import { TrailManager } from "../trails/TrailManager.js";
import { CanvasContext } from "../render/CanvasContext.js";
import { Camera } from "../../camera/Camera.js";

export class TrailSystem extends System {
  static query = { all: [Transform, Trail, Visible] };
  static priority = 4;

  constructor() {
    super();
    this._prevSet = new Set();
    this._currSet = new Set();
  }

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    const tlid = this._compiled.componentIds.get(Trail);
    const vid = this._compiled.componentIds.get(Visible);
    if (tid === undefined || tlid === undefined || vid === undefined) return;

    const manager = ctx.resources.get(TrailManager);
    if (!manager) {
      throw new Error(
        "TrailSystem.update failed: TrailManager resource is not set. " +
        "Use world.setResource(TrailManager, manager) before updating."
      );
    }

    const canvas = ctx.resources.get(CanvasContext);
    if (!canvas) {
      throw new Error(
        "TrailSystem.update failed: CanvasContext resource is not set. " +
        "Use world.setResource(CanvasContext, ctx) before updating."
      );
    }

    const camera = ctx.resources.get(Camera);

    this._currSet.clear();

    for (const table of ctx) {
      const count = table.count;
      if (count === 0) continue;

      const tx = table.getColumn(tid, "x");
      const ty = table.getColumn(tid, "y");
      const enabledCol = table.getColumn(tlid, "enabled");
      const maxPointsCol = table.getColumn(tlid, "maxPoints");
      const spacingCol = table.getColumn(tlid, "spacing");
      const visibleCol = table.getColumn(vid, "value");
      const entities = table.entityIds;
      if (!tx || !ty || !enabledCol || !maxPointsCol || !spacingCol || !visibleCol || !entities) continue;

      const colorCol = table.getColumn(tlid, "color");
      const widthCol = table.getColumn(tlid, "width");
      const modeCol = table.getColumn(tlid, "mode");

      for (let r = 0; r < count; r++) {
        const eid = entities[r];
        this._currSet.add(eid);

        if (!visibleCol[r] || !enabledCol[r]) continue;

        const maxP = maxPointsCol[r];
        if (maxP < 2) continue;

        const sp = spacingCol[r];
        if (sp <= 0) continue;

        const buffer = manager.getOrCreate(eid, maxP);
        const dx = tx[r] - buffer._lastX;
        const dy = ty[r] - buffer._lastY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) continue;

        buffer._accumulated += dist;
        let spawned = 0;

        while (buffer._accumulated >= sp && spawned < maxP) {
          buffer._accumulated -= sp;
          const t = (dist - buffer._accumulated) / dist;
          buffer.addPoint(buffer._lastX + dx * t, buffer._lastY + dy * t);
          spawned++;
        }

        buffer._lastX = tx[r];
        buffer._lastY = ty[r];
      }
    }

    for (const eid of this._prevSet) {
      if (!this._currSet.has(eid)) {
        manager.remove(eid);
      }
    }

    const tmp = this._prevSet;
    this._prevSet = this._currSet;
    this._currSet = tmp;

    canvas.save();
    if (camera) camera.apply(canvas);

    for (const table of ctx) {
      const count = table.count;
      if (count === 0) continue;

      const enabledCol = table.getColumn(tlid, "enabled");
      const colorCol = table.getColumn(tlid, "color");
      const widthCol = table.getColumn(tlid, "width");
      const modeCol = table.getColumn(tlid, "mode");
      const visibleCol = table.getColumn(vid, "value");
      const entities = table.entityIds;
      if (!enabledCol || !colorCol || !widthCol || !modeCol || !visibleCol || !entities) continue;

      for (let r = 0; r < count; r++) {
        const eid = entities[r];
        if (!visibleCol[r] || !enabledCol[r]) continue;

        const buffer = manager.get(eid);
        if (!buffer || buffer.count < 2) continue;

        const color = colorCol[r];
        const width = widthCol[r];
        const mode = modeCol[r];

        if (mode === 1) {
          this._renderRibbon(canvas, buffer, color, width);
        } else {
          this._renderLine(canvas, buffer, color, width);
        }
      }
    }

    canvas.restore();
  }

  _renderLine(ctx, buffer, color, width) {
    ctx.strokeStyle = "#" + color.toString(16).padStart(6, "0");
    ctx.lineWidth = width;
    ctx.beginPath();
    buffer.forEach((x, y, i) => {
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  _renderRibbon(ctx, buffer, color, width) {
    ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
    const hw = width * 0.5;
    ctx.beginPath();

    let prevX, prevY;
    let first = true;

    buffer.forEach((x, y, i) => {
      if (first) {
        prevX = x;
        prevY = y;
        first = false;
        return;
      }

      const dx = x - prevX;
      const dy = y - prevY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-10) return;

      const nx = -dy / len;
      const ny = dx / len;
      const lx = prevX - nx * hw;
      const ly = prevY - ny * hw;
      const lx1 = x - nx * hw;
      const ly1 = y - ny * hw;
      const rx = prevX + nx * hw;
      const ry = prevY + ny * hw;
      const rx1 = x + nx * hw;
      const ry1 = y + ny * hw;

      ctx.moveTo(lx, ly);
      ctx.lineTo(lx1, ly1);
      ctx.lineTo(rx1, ry1);
      ctx.lineTo(rx, ry);
      ctx.lineTo(lx, ly);

      prevX = x;
      prevY = y;
    });

    ctx.fill();
  }
}
