export const Collision = {
  rectRect(a, b) {
    return a.collides(b);
  },

  circleCircle(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const r = a.radius + b.radius;
    return dx * dx + dy * dy <= r * r;
  },

  pointInRect(point, rect) {
    return rect.contains(point);
  },

  rectCircle(rect, circle) {
    const cx = circle.x;
    const cy = circle.y;
    const r = circle.radius;
    const nearX = Math.max(rect.left, Math.min(cx, rect.right));
    const nearY = Math.max(rect.top, Math.min(cy, rect.bottom));
    const dx = cx - nearX;
    const dy = cy - nearY;
    return dx * dx + dy * dy <= r * r;
  },

  groupRect(group, rect) {
    const hits = [];
    for (const sprite of group._sprites) {
      if (sprite.visible && Collision.rectRect(sprite.rect, rect)) {
        hits.push(sprite);
      }
    }
    return hits;
  },

  groupGroup(a, b) {
    const pairs = [];
    for (const sa of a._sprites) {
      if (!sa.visible) continue;
      for (const sb of b._sprites) {
        if (!sb.visible) continue;
        if (Collision.rectRect(sa.rect, sb.rect)) {
          pairs.push([sa, sb]);
        }
      }
    }
    return pairs;
  },
};
