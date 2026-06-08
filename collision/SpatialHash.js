import { Collider } from "../components/Collider.js";

export class SpatialHash {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  rebuild(sprites) {
    this.cells.clear();
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      if (!s.visible) continue;
      s.__shId = i;
      this._insert(s);
    }
  }

  _insert(sprite) {
    const cx = sprite.transform.x;
    const cy = sprite.transform.y;
    const hw = sprite.collider.width / 2;
    const hh = sprite.collider.height / 2;
    const left = Math.floor((cx - hw) / this.cellSize);
    const right = Math.floor((cx + hw) / this.cellSize);
    const top = Math.floor((cy - hh) / this.cellSize);
    const bottom = Math.floor((cy + hh) / this.cellSize);

    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const key = `${x}:${y}`;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(sprite);
      }
    }
  }

  collideGroup(other, out) {
    const pairs = out || [];
    const seen = new Set();

    for (const [key, aList] of this.cells) {
      const bList = other.cells.get(key);
      if (!bList) continue;

      for (const sa of aList) {
        for (const sb of bList) {
          const ka = sa.__shId;
          const kb = sb.__shId;
          const seenKey = ka < kb ? (ka << 16) | kb : (kb << 16) | ka;
          if (seen.has(seenKey)) continue;
          seen.add(seenKey);
          if (Collider.checkAABB(sa.transform, sa.collider, sb.transform, sb.collider)) {
            pairs.push([sa, sb]);
          }
        }
      }
    }
    return pairs;
  }

  collideRect(rect, out) {
    const hits = out || [];
    const seen = new Set();

    const left = Math.floor(rect.left / this.cellSize);
    const right = Math.floor(rect.right / this.cellSize);
    const top = Math.floor(rect.top / this.cellSize);
    const bottom = Math.floor(rect.bottom / this.cellSize);

    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const cell = this.cells.get(`${x}:${y}`);
        if (!cell) continue;
        for (const sprite of cell) {
          if (seen.has(sprite.__shId)) continue;
          seen.add(sprite.__shId);
          if (Collider.checkRect(sprite.transform, sprite.collider, rect)) {
            hits.push(sprite);
          }
        }
      }
    }
    return hits;
  }

  collidePoint(point, out) {
    const hits = out || [];
    const key = `${Math.floor(point.x / this.cellSize)}:${Math.floor(point.y / this.cellSize)}`;
    const cell = this.cells.get(key);
    if (!cell) return hits;
    for (const sprite of cell) {
      if (Collider.containsPoint(sprite.transform, sprite.collider, point)) {
        hits.push(sprite);
      }
    }
    return hits;
  }

  collideSprite(sprite, out) {
    const hits = out || [];
    const sx = sprite.transform.x;
    const sy = sprite.transform.y;
    const shw = sprite.collider.width / 2;
    const shh = sprite.collider.height / 2;

    const left = Math.floor((sx - shw) / this.cellSize);
    const right = Math.floor((sx + shw) / this.cellSize);
    const top = Math.floor((sy - shh) / this.cellSize);
    const bottom = Math.floor((sy + shh) / this.cellSize);

    const seen = new Set();

    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const cell = this.cells.get(`${x}:${y}`);
        if (!cell) continue;
        for (const s of cell) {
          if (s.__shId === sprite.__shId) continue;
          if (seen.has(s.__shId)) continue;
          seen.add(s.__shId);
          if (Collider.checkAABB(s.transform, s.collider, sprite.transform, sprite.collider)) {
            hits.push(s);
          }
        }
      }
    }
    return hits;
  }
}
