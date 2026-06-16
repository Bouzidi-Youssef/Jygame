import { EASINGS } from "./easing.js";

export class KeyframeTrack {
  constructor(keyframes, easing = "linear") {
    if (!Array.isArray(keyframes) || keyframes.length < 2) {
      throw new Error("KeyframeTrack requires at least 2 keyframes");
    }

    const positions = [];
    const values = [];
    let prevPos = -1;

    for (let i = 0; i < keyframes.length; i++) {
      const kf = keyframes[i];
      if (!Array.isArray(kf) || kf.length < 2) {
        throw new Error(`KeyframeTrack keyframe at index ${i} must be [position, value]`);
      }
      const pos = kf[0];
      const val = kf[1];
      if (typeof pos !== "number" || pos < 0 || pos > 1) {
        throw new Error(`KeyframeTrack keyframe at index ${i} has invalid position ${pos}. Must be a number in [0, 1].`);
      }
      if (typeof val !== "number" || !isFinite(val)) {
        throw new Error(`KeyframeTrack keyframe at index ${i} has invalid value. Must be a finite number.`);
      }
      if (pos <= prevPos) {
        throw new Error("KeyframeTrack keyframe positions must be strictly increasing");
      }
      positions.push(pos);
      values.push(val);
      prevPos = pos;
    }

    this._positions = positions;
    this._values = values;
    this._count = keyframes.length;
    this._ease = EASINGS[easing] || EASINGS.linear;
  }

  advance(age, seg) {
    const pos = this._positions;
    while (seg < this._count - 2 && age >= pos[seg + 1]) {
      seg++;
    }
    return seg;
  }

  evaluate(age, seg) {
    const pos = this._positions;
    const vals = this._values;

    if (seg >= this._count - 1) return vals[this._count - 1];
    if (age <= pos[seg]) return vals[seg];

    const segLen = pos[seg + 1] - pos[seg];
    const t = segLen > 0 ? (age - pos[seg]) / segLen : 0;
    const eased = this._ease(t);

    return vals[seg] + (vals[seg + 1] - vals[seg]) * eased;
  }
}
