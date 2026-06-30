import { Sprite } from "./Sprite.js";
import { SpatialHash } from "../collision/SpatialHash.js";

function checkAABB(ax, ay, aw, ah, bx, by, bw, bh) {
  const aL = ax - aw / 2, aR = ax + aw / 2;
  const aT = ay - ah / 2, aB = ay + ah / 2;
  const bL = bx - bw / 2, bR = bx + bw / 2;
  const bT = by - bh / 2, bB = by + bh / 2;
  return aL < bR && aR > bL && aT < bB && aB > bT;
}

function checkRect(ax, ay, aw, ah, rect) {
  const l = ax - aw / 2, r = ax + aw / 2;
  const t = ay - ah / 2, b = ay + ah / 2;
  return l < rect.right && r > rect.left && t < rect.bottom && b > rect.top;
}

function containsPoint(ax, ay, aw, ah, point) {
  const l = ax - aw / 2, r = ax + aw / 2;
  const t = ay - ah / 2, b = ay + ah / 2;
  return point.x >= l && point.x <= r && point.y >= t && point.y <= b;
}

export class Group {
  static query(world, queryDef) {
    const ids = {};
    for (const key of ["all", "any", "none"]) {
      if (queryDef[key]) {
        ids[key] = queryDef[key].map(cls => world.registry.getId(cls));
      }
    }
    const compiled = world.queryEngine.createQuery(ids);
    const view = world.query(compiled);
    const group = new Group(world);
    group._queryView = view;
    return group;
  }

  constructor(world) {
    this._world = world || Sprite._ensureDefaultWorld();
    this._sprites = [];
    this._entityIds = new Set();
    this._queryView = null;
    this._spriteCache = new Map();
    this._spatialHash = null;
  }

  get _isQuery() {
    return this._queryView !== null;
  }

  [Symbol.iterator]() {
    if (this._isQuery) {
      return this._queryIterator();
    }
    return this._sprites[Symbol.iterator]();
  }

  *_queryIterator() {
    for (const entityId of this._queryView.entities()) {
      const sprite = this._getOrWrap(entityId);
      if (sprite) yield sprite;
    }
  }

  add(sprite) {
    if (this._isQuery) {
      throw new Error(
        "Group.add failed: cannot add to a query-backed group (read-only)."
      );
    }
    const entityId = sprite.entity != null ? sprite.entity : sprite;
    if (this._entityIds.has(entityId)) return;
    this._sprites.push(sprite);
    this._entityIds.add(entityId);
    const g = sprite.groups;
    if (g && Array.isArray(g) && !g.includes(this)) {
      g.push(this);
    }
  }

  remove(sprite) {
    if (this._isQuery) {
      throw new Error(
        "Group.remove failed: cannot remove from a query-backed group (read-only)."
      );
    }
    const entityId = sprite.entity != null ? sprite.entity : sprite;
    if (!this._entityIds.has(entityId)) return;
    const idx = this._sprites.indexOf(sprite);
    if (idx !== -1) this._sprites.splice(idx, 1);
    this._entityIds.delete(entityId);
    const g = sprite.groups;
    if (g && Array.isArray(g)) {
      const gidx = g.indexOf(this);
      if (gidx !== -1) g.splice(gidx, 1);
    }
  }

  has(sprite) {
    const entityId = sprite.entity != null ? sprite.entity : sprite;
    if (this._isQuery) {
      for (const id of this._queryView.entities()) {
        if (id === entityId) return true;
      }
      return false;
    }
    return this._entityIds.has(entityId);
  }

  clear() {
    if (this._isQuery) {
      throw new Error(
        "Group.clear failed: cannot clear a query-backed group (read-only)."
      );
    }
    const g = this._sprites;
    for (let i = 0; i < g.length; i++) {
      const sprite = g[i];
      const groups = sprite.groups;
      if (groups && Array.isArray(groups)) {
        const gidx = groups.indexOf(this);
        if (gidx !== -1) groups.splice(gidx, 1);
      }
    }
    this._sprites.length = 0;
    this._entityIds.clear();
  }

  get size() {
    if (this._isQuery) {
      let count = 0;
      for (const _ of this._queryView.entities()) count++;
      return count;
    }
    return this._sprites.length;
  }

  get length() {
    return this.size;
  }

  get children() {
    if (this._isQuery) {
      const result = [];
      for (const entityId of this._queryView.entities()) {
        const s = this._getOrWrap(entityId);
        if (s) result.push(s);
      }
      return result;
    }
    return [...this._sprites];
  }

  get first() {
    const s = this.size;
    if (s === 0) return null;
    if (this._isQuery) {
      let idx = 0;
      for (const entityId of this._queryView.entities()) {
        if (idx === 0) return this._getOrWrap(entityId);
        idx++;
      }
      return null;
    }
    return this._sprites[0] || null;
  }

  get last() {
    const s = this.size;
    if (s === 0) return null;
    if (this._isQuery) {
      let last = null;
      for (const entityId of this._queryView.entities()) {
        last = this._getOrWrap(entityId);
      }
      return last;
    }
    return this._sprites[s - 1] || null;
  }

  forEach(fn) {
    if (this._isQuery) {
      let i = 0;
      for (const entityId of this._queryView.entities()) {
        const s = this._getOrWrap(entityId);
        if (s) fn(s, i++);
      }
      return;
    }
    this._sprites.forEach(fn);
  }

  map(fn) {
    const results = [];
    this.forEach((s, i) => results.push(fn(s, i)));
    return results;
  }

  filter(fn) {
    const results = [];
    this.forEach((s, i) => {
      if (fn(s, i)) results.push(s);
    });
    return results;
  }

  find(fn) {
    if (this._isQuery) {
      let i = 0;
      for (const entityId of this._queryView.entities()) {
        const s = this._getOrWrap(entityId);
        if (s && fn(s, i++)) return s;
      }
      return undefined;
    }
    return this._sprites.find(fn);
  }

  some(fn) {
    if (this._isQuery) {
      let i = 0;
      for (const entityId of this._queryView.entities()) {
        const s = this._getOrWrap(entityId);
        if (s && fn(s, i++)) return true;
      }
      return false;
    }
    return this._sprites.some(fn);
  }

  every(fn) {
    if (this._isQuery) {
      let i = 0;
      for (const entityId of this._queryView.entities()) {
        const s = this._getOrWrap(entityId);
        if (s && !fn(s, i++)) return false;
      }
      return true;
    }
    return this._sprites.every(fn);
  }

  useSpatialHash(cellSize = 64) {
    this._spatialHash = new SpatialHash(cellSize);
    return this;
  }

  _buildHash() {
    const h = this._spatialHash;
    h.clear();
    const items = this._getRawItems();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.visible) continue;
      h.insert(item.entity, item.transform.x, item.transform.y, item.collider.width, item.collider.height);
    }
  }

  _resolveIds(ids, out) {
    for (let i = 0; i < ids.length; i++) {
      const s = this._getOrWrap(ids[i]);
      if (s) out.push(s);
    }
  }

  collideRect(rect, out) {
    const hits = out || [];
    hits.length = 0;
    if (this._spatialHash) {
      this._buildHash();
      this._resolveIds(this._spatialHash.queryRect(rect, []), hits);
      return hits;
    }
    this.forEach(s => {
      if (!s.visible) return;
      const t = s.transform;
      const c = s.collider;
      if (checkRect(t.x, t.y, c.width, c.height, rect)) {
        hits.push(s);
      }
    });
    return hits;
  }

  collidePoint(point, out) {
    const hits = out || [];
    hits.length = 0;
    if (this._spatialHash) {
      this._buildHash();
      this._resolveIds(this._spatialHash.queryPoint(point, []), hits);
      return hits;
    }
    this.forEach(s => {
      if (!s.visible) return;
      const t = s.transform;
      const c = s.collider;
      if (containsPoint(t.x, t.y, c.width, c.height, point)) {
        hits.push(s);
      }
    });
    return hits;
  }

  collideCircle(cx, cy, radius, out) {
    const hits = out || [];
    hits.length = 0;
    if (this._spatialHash) {
      this._buildHash();
      this._resolveIds(this._spatialHash.queryCircle(cx, cy, radius, []), hits);
      return hits;
    }
    const r2 = radius * radius;
    this.forEach(s => {
      if (!s.visible) return;
      const t = s.transform;
      const c = s.collider;
      const cx2 = t.x, cy2 = t.y;
      const dx = cx - cx2, dy = cy - cy2;
      const halfW = c.width / 2, halfH = c.height / 2;
      const closestX = Math.max(cx2 - halfW, Math.min(cx, cx2 + halfW));
      const closestY = Math.max(cy2 - halfH, Math.min(cy, cy2 + halfH));
      const ddx = cx - closestX, ddy = cy - closestY;
      if (ddx * ddx + ddy * ddy <= r2) {
        hits.push(s);
      }
    });
    return hits;
  }

  collideGroup(other, cbOrOut) {
    const isCallback = typeof cbOrOut === "function";
    const pairs = isCallback ? null : (cbOrOut || []);
    if (pairs) pairs.length = 0;

    this.forEach(a => {
      if (!a.visible) return;
      const ta = a.transform;
      const ca = a.collider;
      other.forEach(b => {
        if (!b.visible) return;
        if (a.entity != null && b.entity != null && a.entity === b.entity) return;
        const tb = b.transform;
        const cb = b.collider;
        if (checkAABB(ta.x, ta.y, ca.width, ca.height, tb.x, tb.y, cb.width, cb.height)) {
          if (isCallback) cbOrOut(a, b);
          else pairs.push([a, b]);
        }
      });
    });
    return pairs;
  }

  collideSprite(sprite, out) {
    const hits = out || [];
    hits.length = 0;
    if (!sprite.visible) return hits;
    const tA = sprite.transform;
    const cA = sprite.collider;

    if (this._spatialHash) {
      this._buildHash();
      this._resolveIds(this._spatialHash.queryAABB(tA.x, tA.y, cA.width, cA.height, []), hits);
      return hits;
    }

    this.forEach(s => {
      if (!s.visible) return;
      const tB = s.transform;
      const cB = s.collider;
      if (checkAABB(tA.x, tA.y, cA.width, cA.height, tB.x, tB.y, cB.width, cB.height)) {
        hits.push(s);
      }
    });
    return hits;
  }

  raycast(ox, oy, dx, dy, maxDist, out) {
    const hits = out || [];
    hits.length = 0;
    if (this._spatialHash) {
      this._buildHash();
      this._resolveIds(this._spatialHash.raycast(ox, oy, dx, dy, maxDist, []), hits);
      return hits;
    }
    return hits;
  }

  dispose() {
    this.clear();
  }

  _getOrWrap(entityId) {
    if (!this._world.isAlive(entityId)) {
      this._spriteCache.delete(entityId);
      return null;
    }
    let sprite = this._spriteCache.get(entityId);
    if (!sprite) {
      sprite = Sprite._wrap(this._world, entityId);
      this._spriteCache.set(entityId, sprite);
    }
    return sprite;
  }

  _getRawItems() {
    if (this._isQuery) {
      const items = [];
      for (const id of this._queryView.entities()) {
        const t = this._world.get(id, Transform);
        const c = this._world.get(id, Collider);
        const v = this._world.get(id, Visible);
        items.push({
          entity: id,
          transform: t,
          collider: c,
          get visible() { return !!v.value; },
        });
      }
      return items;
    }
    return this._sprites;
  }
}
