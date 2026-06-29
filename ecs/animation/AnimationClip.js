export class AnimationClip {
  constructor({ frames, fps, loop = true } = {}) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new TypeError(
        `AnimationClip constructor failed: frames must be a non-empty array, got ${JSON.stringify(frames)}.`
      );
    }
    if (typeof fps !== "number" || !Number.isFinite(fps) || fps <= 0) {
      throw new TypeError(
        `AnimationClip constructor failed: fps must be a positive finite number, got ${fps}.`
      );
    }
    if (typeof loop !== "boolean") {
      throw new TypeError(
        `AnimationClip constructor failed: loop must be a boolean, got ${typeof loop}.`
      );
    }
    this._frames = Object.freeze(frames.slice());
    this._fps = fps;
    this._loop = loop;
    Object.freeze(this);
  }

  get frames() {
    return this._frames;
  }

  get fps() {
    return this._fps;
  }

  get loop() {
    return this._loop;
  }

  get frameCount() {
    return this._frames.length;
  }

  get frameDuration() {
    return 1 / this._fps;
  }

  get duration() {
    return this.frameCount / this._fps;
  }
}
