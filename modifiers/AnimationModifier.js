import { KeyframeTrack } from "./KeyframeTrack.js";

/*
 * CONFLICT BEHAVIOR
 *
 * AnimationModifier does not blend with other modifiers.
 * If multiple modifiers write the same particle property,
 * priority order determines the final value — the modifier
 * executed last wins.
 *
 * For example, ScaleModifier and AnimationModifier both
 * writing to "size" will not accumulate or average. Use
 * mutually exclusive priority ranges or toggle enabled
 * to switch between them.
 *
 * ROTATION INTERACTION
 *
 * Animate rotationSpeed when you want rotational motion.
 * The ParticleSystem integrates rotationSpeed every frame:
 *   rotation += rotationSpeed * dt
 *
 * Animate rotation when you want direct timeline control
 * (interpolation mode with RotationModifier or keyframes
 * with AnimationModifier).
 *
 * Using both simultaneously on the same particle may
 * produce overriding behavior depending on priority.
 */

const VALID_PROPERTIES = new Set([
  "size", "alpha", "rotation", "rotationSpeed",
  "vx", "vy", "ax", "ay",
  "originX", "originY", "width", "height"
]);

let _nextId = 0;

export class AnimationModifier {
  constructor({ property, keyframes, easing = "linear", priority } = {}) {
    if (!property || !VALID_PROPERTIES.has(property)) {
      throw new Error(
        "AnimationModifier property must be one of: " +
        Array.from(VALID_PROPERTIES).join(", ")
      );
    }

    this._id = _nextId++;
    this._track = new KeyframeTrack(keyframes, easing);
    this._property = property;
    this.enabled = true;
    this.priority = priority;
  }

  onEmit(particle) {
    if (!particle.__jygameAnimSegments) {
      particle.__jygameAnimSegments = [];
    }
    particle.__jygameAnimSegments[this._id] = 0;
    particle[this._property] = this._track.evaluate(0, 0);
  }

  update(particle) {
    const t = particle.__jygameAnimSegments;
    if (!t) return;
    let seg = t[this._id];
    if (seg === undefined) return;
    seg = this._track.advance(particle.ageRatio, seg);
    t[this._id] = seg;
    particle[this._property] = this._track.evaluate(particle.ageRatio, seg);
  }
}

