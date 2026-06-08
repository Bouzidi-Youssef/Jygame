export class Group {
  constructor() {
    this._sprites = [];
  }

  add(sprite) {
    if (this._sprites.includes(sprite)) return;
    this._sprites.push(sprite);
    sprite.groups.push(this);
  }

  remove(sprite) {
    const idx = this._sprites.indexOf(sprite);
    if (idx === -1) return;
    this._sprites.splice(idx, 1);
    const gidx = sprite.groups.indexOf(this);
    if (gidx !== -1) sprite.groups.splice(gidx, 1);
  }

  has(sprite) {
    return this._sprites.includes(sprite);
  }

  clear() {
    for (const sprite of this._sprites) {
      const gidx = sprite.groups.indexOf(this);
      if (gidx !== -1) sprite.groups.splice(gidx, 1);
    }
    this._sprites = [];
  }

  get length() {
    return this._sprites.length;
  }

  update(dt) {
    for (const sprite of this._sprites) {
      sprite.update(dt);
    }
  }

  render(ctx, viewport) {
    if (viewport) {
      const vLeft = viewport.x;
      const vRight = viewport.x + viewport.w;
      const vTop = viewport.y;
      const vBottom = viewport.y + viewport.h;

      for (const sprite of this._sprites) {
        if (!sprite.visible) continue;
        if (sprite.angle !== 0 || sprite.scale.x !== 1 || sprite.scale.y !== 1) {
          const cx = sprite.rect.centerx;
          const cy = sprite.rect.centery;
          const hw = sprite.rect.w / 2 * sprite.scale.x;
          const hh = sprite.rect.h / 2 * sprite.scale.y;
          const r = Math.sqrt(hw * hw + hh * hh);
          if ((cx - r) >= vRight || (cx + r) <= vLeft ||
              (cy - r) >= vBottom || (cy + r) <= vTop) continue;
        } else {
          if (sprite.rect.x >= vRight ||
              sprite.rect.x + sprite.rect.w <= vLeft ||
              sprite.rect.y >= vBottom ||
              sprite.rect.y + sprite.rect.h <= vTop) continue;
        }
        sprite.render(ctx);
      }
    } else {
      for (const sprite of this._sprites) {
        if (!sprite.visible) continue;
        sprite.render(ctx);
      }
    }
  }

  collideRect(rect, out) {
    const hits = out || [];
    for (const sprite of this._sprites) {
      if (!sprite.visible) continue;
      if (sprite.rect.collides(rect)) {
        hits.push(sprite);
      }
    }
    return hits;
  }

  collidePoint(point, out) {
    const hits = out || [];
    for (const sprite of this._sprites) {
      if (!sprite.visible) continue;
      if (sprite.rect.contains(point)) {
        hits.push(sprite);
      }
    }
    return hits;
  }

  collideGroup(other, out) {
    const pairs = out || [];
    for (const sa of this._sprites) {
      if (!sa.visible) continue;
      for (const sb of other._sprites) {
        if (!sb.visible) continue;
        if (sa.rect.collides(sb.rect)) {
          pairs.push([sa, sb]);
        }
      }
    }
    return pairs;
  }

  collideSprite(sprite, out) {
    const hits = out || [];
    if (!sprite.visible) return hits;
    for (const s of this._sprites) {
      if (!s.visible) continue;
      if (s.rect.collides(sprite.rect)) {
        hits.push(s);
      }
    }
    return hits;
  }

  forEach(fn) {
    this._sprites.forEach(fn);
  }

  filter(fn) {
    return this._sprites.filter(fn);
  }

  map(fn) {
    return this._sprites.map(fn);
  }
}
