export class Collider {
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
  }

  static checkAABB(aTransform, aCollider, bTransform, bCollider) {
    const aL = aTransform.x - aCollider.width / 2;
    const aR = aTransform.x + aCollider.width / 2;
    const aT = aTransform.y - aCollider.height / 2;
    const aB = aTransform.y + aCollider.height / 2;

    const bL = bTransform.x - bCollider.width / 2;
    const bR = bTransform.x + bCollider.width / 2;
    const bT = bTransform.y - bCollider.height / 2;
    const bB = bTransform.y + bCollider.height / 2;

    return aL < bR && aR > bL && aT < bB && aB > bT;
  }

  static checkRect(transform, collider, rect) {
    const l = transform.x - collider.width / 2;
    const r = transform.x + collider.width / 2;
    const t = transform.y - collider.height / 2;
    const b = transform.y + collider.height / 2;

    return l < rect.right && r > rect.left && t < rect.bottom && b > rect.top;
  }

  static containsPoint(transform, collider, point) {
    const l = transform.x - collider.width / 2;
    const r = transform.x + collider.width / 2;
    const t = transform.y - collider.height / 2;
    const b = transform.y + collider.height / 2;

    return point.x >= l && point.x <= r && point.y >= t && point.y <= b;
  }

  static getAABB(transform, collider, out) {
    out.left = transform.x - collider.width / 2;
    out.right = transform.x + collider.width / 2;
    out.top = transform.y - collider.height / 2;
    out.bottom = transform.y + collider.height / 2;
  }
}
