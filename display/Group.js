import { SpatialHash } from "../collision/SpatialHash.js";
import { Collider } from "../components/Collider.js";
import { movementSystem } from "../systems/MovementSystem.js";
import { renderSystem } from "../systems/RenderSystem.js";

export class Group {
  constructor() {
    this._sprites = [];
    this._spatial = null;
    this._spatialDirty = false;
  }

  useSpatialHash(cellSize = 64) {
    this._spatial = new SpatialHash(cellSize);
    this._spatialDirty = true;
    return this;
  }

  add(sprite) {
    if (this._sprites.includes(sprite)) return;
    this._sprites.push(sprite);
    sprite.groups.push(this);
    this._spatialDirty = true;
  }

  remove(sprite) {
    const idx = this._sprites.indexOf(sprite);
    if (idx === -1) return;
    this._sprites.splice(idx, 1);
    const gidx = sprite.groups.indexOf(this);
    if (gidx !== -1) sprite.groups.splice(gidx, 1);
    this._spatialDirty = true;
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
    this._spatialDirty = true;
  }

  get length() {
    return this._sprites.length;
  }

  update(dt) {
    movementSystem.update(this._sprites, dt);
    if (this._spatial) {
      this._spatial.rebuild(this._sprites);
      this._spatialDirty = false;
    }
  }

  render(ctx, viewport) {
    renderSystem.render(ctx, this._sprites, viewport);
  }

  rebuildSpatialHash() {
    if (this._spatial) {
      this._spatial.rebuild(this._sprites);
      this._spatialDirty = false;
    }
  }

  _ensureSpatial() {
    if (this._spatialDirty && this._spatial) {
      this._spatial.rebuild(this._sprites);
      this._spatialDirty = false;
    }
  }

  collideRect(rect, out) {
    const hits = out || [];
    if (this._spatial) {
      this._ensureSpatial();
      return this._spatial.collideRect(rect, hits);
    }
    for (const sprite of this._sprites) {
      if (!sprite.visible) continue;
      if (Collider.checkRect(sprite.transform, sprite.collider, rect)) {
        hits.push(sprite);
      }
    }
    return hits;
  }

  collidePoint(point, out) {
    const hits = out || [];
    if (this._spatial) {
      this._ensureSpatial();
      return this._spatial.collidePoint(point, hits);
    }
    for (const sprite of this._sprites) {
      if (!sprite.visible) continue;
      if (Collider.containsPoint(sprite.transform, sprite.collider, point)) {
        hits.push(sprite);
      }
    }
    return hits;
  }

  collideGroup(other, out) {
    const pairs = out || [];
    if (this._spatial && other._spatial) {
      this._ensureSpatial();
      other._ensureSpatial();
      return this._spatial.collideGroup(other._spatial, pairs);
    }
    for (const sa of this._sprites) {
      if (!sa.visible) continue;
      for (const sb of other._sprites) {
        if (!sb.visible) continue;
        if (Collider.checkAABB(sa.transform, sa.collider, sb.transform, sb.collider)) {
          pairs.push([sa, sb]);
        }
      }
    }
    return pairs;
  }

  collideSprite(sprite, out) {
    const hits = out || [];
    if (!sprite.visible) return hits;
    if (this._spatial) {
      this._ensureSpatial();
      return this._spatial.collideSprite(sprite, hits);
    }
    for (const s of this._sprites) {
      if (!s.visible) continue;
      if (Collider.checkAABB(s.transform, s.collider, sprite.transform, sprite.collider)) {
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
