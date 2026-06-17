export class ForceModifier {
  constructor({ x = 0, y = 0, target, strength, falloff = "none", minDistance = 10, priority } = {}) {
    if (target !== undefined) {
      if (target === null || typeof target !== "object") {
        throw new Error("ForceModifier target must be an object with x, y or transform.x, transform.y");
      }
      this._target = target;
      this._isStaticTarget = false;
    } else {
      this._isStaticTarget = true;
    }

    this._staticX = x;
    this._staticY = y;

    if (!Number.isFinite(strength) || strength <= 0) {
      throw new Error("ForceModifier strength must be a finite number > 0");
    }
    this._strength = strength;

    const valid = ["none", "inverse", "inverseSquared"];
    if (!valid.includes(falloff)) {
      throw new Error("ForceModifier falloff must be one of: " + valid.join(", "));
    }
    this._falloff = falloff;

    if (!Number.isFinite(minDistance) || minDistance <= 0) {
      throw new Error("ForceModifier minDistance must be a finite number > 0");
    }
    this._minDistance = minDistance;

    this.enabled = true;
    this.priority = priority;

    this._tmpDX = 0;
    this._tmpDY = 0;
    this._tmpDist = 0;
    this._tmpNX = 0;
    this._tmpNY = 0;
    this._tmpForce = 0;
  }

  _computeForce(particle) {
    let tx, ty;
    if (this._isStaticTarget) {
      tx = this._staticX;
      ty = this._staticY;
    } else {
      const t = this._target;
      if (t.x != null) { tx = t.x; ty = t.y; }
      else if (t.transform) { tx = t.transform.x; ty = t.transform.y; }
      else { tx = 0; ty = 0; }
    }

    this._tmpDX = tx - particle.x;
    this._tmpDY = ty - particle.y;
    const distSq = this._tmpDX * this._tmpDX + this._tmpDY * this._tmpDY;

    if (distSq === 0) {
      this._tmpDist = 0;
      this._tmpNX = 0;
      this._tmpNY = 0;
      this._tmpForce = 0;
      return;
    }

    this._tmpDist = Math.sqrt(distSq);
    const clamped = Math.max(this._tmpDist, this._minDistance);
    this._tmpNX = this._tmpDX / this._tmpDist;
    this._tmpNY = this._tmpDY / this._tmpDist;

    let f = this._strength;
    if (this._falloff === "inverse") {
      f /= clamped;
    } else if (this._falloff === "inverseSquared") {
      f /= (clamped * clamped);
    }
    this._tmpForce = f;
  }
}
