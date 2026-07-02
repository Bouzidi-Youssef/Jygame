import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { WorldTransform } from "../components/WorldTransform.js";
import { Parent } from "../components/Parent.js";
import { HierarchyGraph } from "./HierarchyGraph.js";

const _PWT = { x: 0, y: 0, rotation: 0, scaleX: 0, scaleY: 0 };

export class HierarchySystem extends System {
  static query = { all: [Transform, WorldTransform] };
  static priority = -10;

  _copyToWorld(table, row, tid, wtid) {
    const tx = table.getColumn(tid, "x");
    const ty = table.getColumn(tid, "y");
    const trot = table.getColumn(tid, "rotation");
    const tsx = table.getColumn(tid, "scaleX");
    const tsy = table.getColumn(tid, "scaleY");
    const wtx = table.getColumn(wtid, "x");
    const wty = table.getColumn(wtid, "y");
    const wtrot = table.getColumn(wtid, "rotation");
    const wtsx = table.getColumn(wtid, "scaleX");
    const wtsy = table.getColumn(wtid, "scaleY");

    wtx[row] = tx[row];
    wty[row] = ty[row];
    wtrot[row] = trot[row];
    wtsx[row] = tsx[row];
    wtsy[row] = tsy[row];
  }

  _readWT(table, row, wtid, out) {
    out.x = table.getColumn(wtid, "x")[row];
    out.y = table.getColumn(wtid, "y")[row];
    out.rotation = table.getColumn(wtid, "rotation")[row];
    out.scaleX = table.getColumn(wtid, "scaleX")[row];
    out.scaleY = table.getColumn(wtid, "scaleY")[row];
  }

  _computeChild(table, row, tid, wtid, pwt) {
    const tx = table.getColumn(tid, "x");
    const ty = table.getColumn(tid, "y");
    const trot = table.getColumn(tid, "rotation");
    const tsx = table.getColumn(tid, "scaleX");
    const tsy = table.getColumn(tid, "scaleY");
    const wtx = table.getColumn(wtid, "x");
    const wty = table.getColumn(wtid, "y");
    const wtrot = table.getColumn(wtid, "rotation");
    const wtsx = table.getColumn(wtid, "scaleX");
    const wtsy = table.getColumn(wtid, "scaleY");

    const pCosR = Math.cos(pwt.rotation);
    const pSinR = Math.sin(pwt.rotation);
    wtx[row] = pwt.x + tx[row] * pwt.scaleX * pCosR - ty[row] * pwt.scaleY * pSinR;
    wty[row] = pwt.y + tx[row] * pwt.scaleX * pSinR + ty[row] * pwt.scaleY * pCosR;
    wtrot[row] = pwt.rotation + trot[row];
    wtsx[row] = pwt.scaleX * tsx[row];
    wtsy[row] = pwt.scaleY * tsy[row];
  }

  update(ctx, dt) {
    const hierarchy = ctx.resources.get(HierarchyGraph);
    if (!hierarchy) return;

    const dirty = hierarchy._dirty;
    if (dirty.size === 0) return;

    const tid = this._compiled.componentIds.get(Transform);
    const wtid = this._compiled.componentIds.get(WorldTransform);
    if (tid === undefined || wtid === undefined) return;

    const world = ctx.world;
    const em = world._entityManager;
    const arch = world._archetypeSystem;
    const pid = world._registry.getId(Parent);

    const pending = [...dirty];

    for (let pi = 0; pi < pending.length; pi++) {
      const seed = pending[pi];
      if (!dirty.has(seed)) continue;

      const seedSig = arch.entitySignature(seed);
      if (!seedSig) continue;

      const seedHasParent = pid !== null && seedSig.contains(pid);
      if (seedHasParent) {
        const pv = world.get(seed, Parent);
        if (dirty.has(pv.entity)) continue;
      }

      const queue = [seed];
      for (let qi = 0; qi < queue.length; qi++) {
        const eid = queue[qi];
        if (!dirty.has(eid)) continue;

        const table = arch.entityTable(eid);
        const row = em.getRow(eid);
        const sig = arch.entitySignature(eid);
        if (!sig) continue;

        const hasParent = pid !== null && sig.contains(pid);

        if (hasParent) {
          const pv = world.get(eid, Parent);
          const pt = arch.entityTable(pv.entity);
          const pr = em.getRow(pv.entity);
          this._readWT(pt, pr, wtid, _PWT);
          this._computeChild(table, row, tid, wtid, _PWT);
        } else {
          this._copyToWorld(table, row, tid, wtid);
        }

        dirty.delete(eid);

        const children = hierarchy._children.get(eid);
        if (children) {
          for (let ci = 0; ci < children.length; ci++) {
            if (dirty.has(children[ci])) {
              queue.push(children[ci]);
            }
          }
        }
      }
    }
  }
}
