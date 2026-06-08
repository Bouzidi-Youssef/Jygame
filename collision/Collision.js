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
};
