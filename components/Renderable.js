export class Renderable {
  constructor(image = null, style = {}) {
    this.image = image;
    this.style = {
      fill: style.fill ?? "#ffffff",
      shape: style.shape ?? "rect",
    };
    this._pathCache = null;
  }

  draw(ctx, w, h) {
    const hw = w / 2;
    const hh = h / 2;

    if (this.image) {
      ctx.drawImage(this.image, -hw, -hh, w, h);
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
      ctx.fillRect(-hw, -hh, w, h);
    }
  }
}
