const _ZERO = Object.freeze({ x: 0, y: 0 });

export class Trail {
  static _globalLayerVersion = 0;

  constructor({
    maxPoints = 64,
    spacing = 4,
    lifetime,
    maxDistance = Infinity,
    mode = "line",
    width = 4,
    color = "#ffffff",
    alpha = 1,
    widthCurve,
    layer = 0
  } = {}) {
    if (!Number.isFinite(maxPoints) || maxPoints < 2) {
      throw new Error("Trail maxPoints must be >= 2");
    }
    this._maxPoints = maxPoints;

    if (!Number.isFinite(spacing) || spacing <= 0) {
      throw new Error("Trail spacing must be a finite number > 0");
    }
    this._spacing = spacing;

    if (lifetime !== undefined && (!Number.isFinite(lifetime) || lifetime <= 0)) {
      throw new Error("Trail lifetime must be a finite number > 0");
    }
    this._lifetime = lifetime || null;

    if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
      throw new Error("Trail maxDistance must be a finite number > 0");
    }
    this._maxDistance = maxDistance;

    if (mode !== "line" && mode !== "ribbon") {
      throw new Error('Trail mode must be "line" or "ribbon"');
    }
    this._mode = mode;

    if (!Number.isFinite(width) || width < 0) {
      throw new Error("Trail width must be a finite number >= 0");
    }
    this._width = width;

    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      throw new Error("Trail alpha must be between 0 and 1");
    }
    this._alpha = alpha;

    this._color = color;
    this._widthCurve = widthCurve || (() => 1);

    if (!Number.isFinite(layer) || layer < 0 || (layer | 0) !== layer) {
      throw new Error("Trail layer must be a non-negative integer");
    }
    this._layer = layer;

    this._points = new Float64Array(maxPoints * 2);
    this._timestamps = this._lifetime ? new Float64Array(maxPoints) : null;
    this._count = 0;
    this._writePos = 0;
    this._time = 0;

    this._followTarget = null;
    this._lastX = 0;
    this._lastY = 0;
    this._accumulated = 0;
  }

  get width() { return this._width; }
  set width(v) {
    if (!Number.isFinite(v) || v < 0) throw new Error("Trail width must be a finite number >= 0");
    this._width = v;
  }

  get alpha() { return this._alpha; }
  set alpha(v) {
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error("Trail alpha must be between 0 and 1");
    this._alpha = v;
  }

  get color() { return this._color; }
  set color(v) { this._color = v; }

  get layer() { return this._layer; }
  set layer(v) {
    if (!Number.isFinite(v) || v < 0 || (v | 0) !== v) throw new Error("Trail layer must be a non-negative integer");
    Trail._globalLayerVersion++;
    this._layer = v;
  }

  follow(target) {
    this._followTarget = target;
    const pos = this._resolvePosition(target);
    this._lastX = pos.x;
    this._lastY = pos.y;
    this._accumulated = 0;
    this.addPoint(this._lastX, this._lastY);
    return this;
  }

  addPoint(x, y) {
    const pos = this._writePos;
    this._points[pos * 2] = x;
    this._points[pos * 2 + 1] = y;
    if (this._timestamps) {
      this._timestamps[pos] = this._time;
    }
    this._writePos = (pos + 1) % this._maxPoints;
    if (this._count < this._maxPoints) this._count++;
  }

  update(dt) {
    this._time += dt;

    if (this._timestamps) {
      const cutoff = this._time - this._lifetime;
      while (this._count > 0) {
        const oldestIdx = this._getIndex(0);
        if (this._timestamps[oldestIdx] < cutoff) {
          this._count--;
        } else {
          break;
        }
      }
    }

    if (!this._followTarget) return;

    const pos = this._resolvePosition(this._followTarget);
    const tx = pos.x;
    const ty = pos.y;
    const dx = tx - this._lastX;
    const dy = ty - this._lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    if (dist > this._maxDistance) {
      this._lastX = tx;
      this._lastY = ty;
      this._accumulated = 0;
      return;
    }

    this._accumulated += dist;

    while (this._accumulated >= this._spacing) {
      this._accumulated -= this._spacing;
      const t = (dist - this._accumulated) / dist;
      const px = this._lastX + dx * t;
      const py = this._lastY + dy * t;
      this.addPoint(px, py);
    }

    this._lastX = tx;
    this._lastY = ty;
  }

  render(ctx) {
    if (this._count < 2) return;

    ctx.save();
    ctx.globalAlpha = this._alpha;

    if (this._mode === "ribbon") {
      this._renderRibbon(ctx);
    } else {
      this._renderLine(ctx);
    }

    ctx.restore();
  }

  _renderLine(ctx) {
    const count = this._count;

    ctx.strokeStyle = this._color;
    ctx.lineWidth = this._width;
    ctx.beginPath();

    for (let i = 0; i < count; i++) {
      const idx = this._getIndex(i);
      const x = this._points[idx * 2];
      const y = this._points[idx * 2 + 1];
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  _renderRibbon(ctx) {
    const count = this._count;
    if (count < 2) return;

    ctx.fillStyle = this._color;
    ctx.beginPath();

    for (let i = 0; i < count - 1; i++) {
      const idx0 = this._getIndex(i);
      const idx1 = this._getIndex(i + 1);
      const x0 = this._points[idx0 * 2];
      const y0 = this._points[idx0 * 2 + 1];
      const x1 = this._points[idx1 * 2];
      const y1 = this._points[idx1 * 2 + 1];

      const segDx = x1 - x0;
      const segDy = y1 - y0;
      const len = Math.sqrt(segDx * segDx + segDy * segDy);
      if (len < 1e-10) continue;

      const nx = -segDy / len;
      const ny = segDx / len;

      const t0 = i / (count - 1);
      const t1 = (i + 1) / (count - 1);
      const hw0 = this._calcWidth(t0) * 0.5;
      const hw1 = this._calcWidth(t1) * 0.5;

      const l0x = x0 - nx * hw0;
      const l0y = y0 - ny * hw0;
      const r0x = x0 + nx * hw0;
      const r0y = y0 + ny * hw0;
      const l1x = x1 - nx * hw1;
      const l1y = y1 - ny * hw1;
      const r1x = x1 + nx * hw1;
      const r1y = y1 + ny * hw1;

      ctx.moveTo(l0x, l0y);
      ctx.lineTo(l1x, l1y);
      ctx.lineTo(r1x, r1y);
      ctx.lineTo(r0x, r0y);
      ctx.lineTo(l0x, l0y);
    }

    ctx.fill();
  }

  destroy() {
    this._followTarget = null;
    this._points = null;
    this._timestamps = null;
    this._widthCurve = null;
    this._count = 0;
    this._writePos = 0;
    this._time = 0;
    this._accumulated = 0;
  }

  _calcWidth(t) {
    return this._width * this._widthCurve(t);
  }

  _resolvePosition(target) {
    if (target.x != null) return target;
    if (target.transform) return target.transform;
    return _ZERO;
  }

  _getIndex(i) {
    return (this._writePos - this._count + i + this._maxPoints) % this._maxPoints;
  }
}
