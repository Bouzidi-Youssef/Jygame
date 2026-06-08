export class RenderSystem {
  render(ctx, entities, viewport) {
    for (const entity of entities) {
      this.renderOne(ctx, entity, viewport);
    }
  }

  renderOne(ctx, entity, viewport) {
    if (!entity.visible) return;

    const tx = entity.transform.x;
    const ty = entity.transform.y;
    const cw = entity.collider.width;
    const ch = entity.collider.height;

    if (viewport) {
      const vL = viewport.x;
      const vR = viewport.x + viewport.w;
      const vT = viewport.y;
      const vB = viewport.y + viewport.h;

      if (entity.transform.rotation !== 0 ||
          entity.transform.scale.x !== 1 ||
          entity.transform.scale.y !== 1) {
        const hw = cw / 2 * entity.transform.scale.x;
        const hh = ch / 2 * entity.transform.scale.y;
        const r = Math.sqrt(hw * hw + hh * hh);
        if ((tx - r) >= vR || (tx + r) <= vL ||
            (ty - r) >= vB || (ty + r) <= vT) return;
      } else {
        const l = tx - cw / 2;
        const r = tx + cw / 2;
        const t = ty - ch / 2;
        const b = ty + ch / 2;
        if (l >= vR || r <= vL || t >= vB || b <= vT) return;
      }
    }

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(entity.transform.rotation);
    ctx.scale(entity.transform.scale.x, entity.transform.scale.y);
    entity.renderable.draw(ctx, cw, ch);
    ctx.restore();
  }
}

export const renderSystem = new RenderSystem();
