const DEGENERATE = 0;

export class Trail {
  constructor({
    maxPoints = 64,
    spacing = 4,
    lifetime,
    maxDistance = Infinity,
    mode = "line",
    width = 4,
    color = "#ffffff",
    alpha = 1,
    startColor,
    endColor,
    widthCurve,
    alphaCurve
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

    this.width = width;
    this.color = color;
    this.alpha = alpha;

    this._startRGB = null;
    this._endRGB = null;
    if (startColor && endColor) {
      this._startRGB = this._parseHex(startColor);
      this._endRGB = this._parseHex(endColor);
    }

    this._widthCurve = widthCurve || (() => 1);
    this._alphaCurve = alphaCurve || (() => 1);

    this._points = new Float64Array(maxPoints * 2);
    this._timestamps = this._lifetime ? new Float64Array(maxPoints) : null;
    this._count = 0;
    this._writePos = 0;

    this._followTarget = null;
    this._lastX = 0;
    this._lastY = 0;
    this._accumulated = 0;
  }

  follow(target) {
    this._followTarget = target;
    const pos = this._resolvePosition(target);
    this._lastX = pos[0];
    this._lastY = pos[1];
    this._accumulated = 0;
    this.addPoint(this._lastX, this._lastY);
    return this;
  }

  addPoint(x, y) {
    const pos = this._writePos;
    this._points[pos * 2] = x;
    this._points[pos * 2 + 1] = y;
    if (this._timestamps) {
      this._timestamps[pos] = performance.now() / 1000;
    }
    this._writePos = (pos + 1) % this._maxPoints;
    if (this._count < this._maxPoints) this._count++;
  }

  update(dt) {
    if (this._timestamps) {
      const now = performance.now() / 1000;
      while (this._count > 0) {
        const oldestIdx = this._getIndex(0);
        if (now - this._timestamps[oldestIdx] > this._lifetime) {
          this._count--;
        } else {
          break;
        }
      }
    }

    if (!this._followTarget) return;

    const pos = this._resolvePosition(this._followTarget);
    const tx = pos[0];
    const ty = pos[1];
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

    if (this._mode === "ribbon") {
      this._renderRibbon(ctx);
    } else {
      this._renderLine(ctx);
    }
  }

  _renderLine(ctx) {
    const count = this._count;
    const alpha = this.alpha;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width;
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

    ctx.globalAlpha = alpha;
    ctx.stroke();
  }

  _renderRibbon(ctx) {
    const count = this._count;
    if (count < 2) return;

    ctx.fillStyle = this.color;
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
      if (len < DEGENERATE) continue;

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

    ctx.globalAlpha = this.alpha;
    ctx.fill();
  }

  _calcWidth(t) {
    return this.width * this._widthCurve(t);
  }

  _parseHex(hex) {
    const val = parseInt(hex.replace("#", ""), 16);
    return {
      r: (val >> 16) & 255,
      g: (val >> 8) & 255,
      b: val & 255
    };
  }

  _resolvePosition(target) {
    if (target.x != null) return target;
    if (target.transform) return target.transform;
    return { x: 0, y: 0 };
  }

  _getIndex(i) {
    return (this._writePos - this._count + i + this._maxPoints) % this._maxPoints;
  }
}
