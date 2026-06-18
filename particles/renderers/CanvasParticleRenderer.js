import { ParticleRenderer } from "./ParticleRenderer.js";

export class CanvasParticleRenderer extends ParticleRenderer {
  render(data, ctx) {
    ctx.save();

    const count = data.count;

    if (count === 0) {
      ctx.restore();
      return;
    }

    for (let i = 0; i < count; i++) {
      const p = data.getParticle(i);
      ctx.globalAlpha = p.alpha;
      if (this._renderParticle) {
        this._renderParticle(ctx, p);
      } else if (p.texture) {
        const w = p.width > 0 ? p.width : p.size;
        const h = p.height > 0 ? p.height : p.size;
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.rotation) ctx.rotate(p.rotation);
        if (p.frameWidth > 0 && p.frameHeight > 0) {
          ctx.drawImage(p.texture, p.frameX, p.frameY, p.frameWidth, p.frameHeight, -w * p.originX, -h * p.originY, w, h);
        } else {
          ctx.drawImage(p.texture, -w * p.originX, -h * p.originY, w, h);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = `rgb(${p.r | 0},${p.g | 0},${p.b | 0})`;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      }
    }

    ctx.restore();
  }
}
