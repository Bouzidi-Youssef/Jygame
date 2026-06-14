const MODES = ["once", "loop", "pingpong", "random"];

export class AnimatedSpriteModifier {
  constructor({ frames, mode = "once", loops = 1, reverse = false, randomStart = false, animationDuration, onAnimationStart, onAnimationLoop, onAnimationComplete, onFrameChange, priority } = {}) {
    if (!frames || frames.length === 0) throw new Error("AnimatedSpriteModifier requires at least one frame");
    if (!MODES.includes(mode)) throw new Error("AnimatedSpriteModifier mode must be one of: " + MODES.join(", "));
    if (loops < 1) throw new Error("AnimatedSpriteModifier loops must be >= 1");
    if (animationDuration != null && animationDuration <= 0) throw new Error("AnimatedSpriteModifier animationDuration must be > 0");

    this.enabled = true;
    this.priority = priority;
    this._frames = frames;
    this._count = frames.length;
    this._mode = mode;
    this._loops = loops;
    this._reverse = reverse;
    this._randomStart = randomStart;
    this._animationDuration = animationDuration;

    this._hasCallbacks = !!(onAnimationStart || onAnimationLoop || onAnimationComplete || onFrameChange);
    this._onAnimationStart = onAnimationStart;
    this._onAnimationLoop = onAnimationLoop;
    this._onAnimationComplete = onAnimationComplete;
    this._onFrameChange = onFrameChange;

    this._cumulative = null;
    this._totalDuration = 0;
    let hasDuration = false;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].duration != null) { hasDuration = true; break; }
    }
    if (hasDuration) {
      this._cumulative = new Array(frames.length);
      let acc = 0;
      for (let i = 0; i < frames.length; i++) {
        acc += frames[i].duration || 0;
        this._cumulative[i] = acc;
      }
      this._totalDuration = acc;
    }
  }

  _applyFrame(particle, frame) {
    particle.frameX = frame.x;
    particle.frameY = frame.y;
    particle.frameWidth = frame.width;
    particle.frameHeight = frame.height;
  }

  _binarySearch(needle) {
    const c = this._cumulative;
    let lo = 0, hi = this._count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (c[mid] <= needle + 1e-10) lo = mid + 1;
      else hi = mid;
    }
    return needle < c[lo] ? lo : this._count - 1;
  }

  _getFrameIndex(t, offset) {
    const n = this._count;
    const mode = this._mode;
    const reverse = this._reverse;
    const loops = this._loops;

    let raw;

    if (mode === "random") {
      raw = (Math.random() * n) | 0;
    } else if (this._cumulative) {
      raw = this._binarySearch(t * this._totalDuration);
    } else if (mode === "loop") {
      raw = ((t * n * loops) | 0) % n;
    } else if (mode === "pingpong") {
      const total = n > 1 ? n * 2 - 2 : 1;
      const pos = (t * total * loops) | 0;
      const mod = pos % total;
      raw = mod < n ? mod : total - mod;
    } else {
      raw = Math.min(n - 1, (t * n) | 0);
    }

    let index = (raw + offset) % n;
    if (reverse) index = n - 1 - index;
    return index;
  }

  onEmit(particle) {
    particle.__jygameAnimOffset = this._randomStart
      ? (Math.random() * this._count) | 0
      : 0;

    particle.__jygameAnimPrevFrame = -1;
    particle.__jygameAnimLoopCount = 0;

    this._applyFrame(particle, this._frames[particle.__jygameAnimOffset]);
  }

  update(particle) {
    const t = this._animationDuration != null
      ? Math.min(1, particle.ageRatio * particle.maxLife / this._animationDuration)
      : particle.ageRatio;

    const idx = this._getFrameIndex(t, particle.__jygameAnimOffset || 0);
    this._applyFrame(particle, this._frames[idx]);

    if (this._hasCallbacks) {
      const prev = particle.__jygameAnimPrevFrame;
      if (prev < 0) {
        this._onAnimationStart?.(particle);
      } else if (idx !== prev) {
        this._onFrameChange?.(particle, idx);
      }

      if (this._mode !== "once") {
        const cycles = (t * this._loops) | 0;
        if (cycles > particle.__jygameAnimLoopCount) {
          particle.__jygameAnimLoopCount = cycles;
          this._onAnimationLoop?.(particle, cycles);
        }
      } else if (idx === this._count - 1 && prev !== idx) {
        this._onAnimationComplete?.(particle);
      }

      particle.__jygameAnimPrevFrame = idx;
    }
  }
}
