export class Music {
  constructor(sound) {
    this._sound = sound;
    this._instance = null;
    this._volume = 1;
    this._fadeVolume = 1;
    this._loop = true;
    this._fadeState = null;
    this._fadeDuration = 0;
    this._fadeTimer = 0;
    this._fadeFrom = 1;
    this._fadeTo = 1;
    this._destroyed = false;
  }

  get volume() { return this._volume; }
  set volume(value) {
    if (this._destroyed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._updateVolume();
  }

  get loop() { return this._loop; }
  set loop(value) {
    this._loop = value;
    if (this._instance) this._instance.loop = value;
  }

  get isPlaying() {
    return !!this._instance && !this._instance.paused && !this._instance.ended;
  }

  get isPaused() {
    return !!this._instance && this._instance.paused && !this._instance.ended;
  }

  play() {
    if (this._destroyed) throw new Error("Cannot use destroyed Music");
    if (this._instance) {
      if (this._instance.paused) {
        this._instance.play();
        this._instance.loop = this._loop;
      }
      return;
    }
    this._instance = this._sound.play();
    if (!this._instance) return;
    this._instance._overrideGroup = "music";
    this._instance._overrideSoundVolume = 1;
    this._instance.loop = this._loop;
    this._updateVolume();
  }

  pause() {
    if (this._instance) this._instance.pause();
  }

  stop() {
    this._cancelFade();
    if (this._instance) {
      this._instance.stop();
      this._sound._returnInstance(this._instance);
      this._instance = null;
    }
  }

  fadeIn(seconds) {
    if (!this._instance) this.play();
    if (!this._instance) return;
    this._fadeVolume = 0;
    this._updateVolume();
    this._fadeState = "fadeIn";
    this._fadeDuration = Math.max(0.001, seconds);
    this._fadeTimer = 0;
    this._fadeFrom = 0;
    this._fadeTo = 1;
  }

  fadeOut(seconds) {
    if (!this._instance) return;
    this._fadeState = "fadeOut";
    this._fadeDuration = Math.max(0.001, seconds);
    this._fadeTimer = 0;
    this._fadeFrom = this._fadeVolume;
    this._fadeTo = 0;
  }

  crossFade(other, seconds) {
    if (this._destroyed || other._destroyed) return;

    if (!other._instance) other.play();
    if (!this._instance) this.play();

    const dur = Math.max(0.001, seconds);

    this._fadeState = "crossFade";
    this._fadeDuration = dur;
    this._fadeTimer = 0;
    this._fadeFrom = this._fadeVolume;
    this._fadeTo = 0;

    other._fadeState = "fadeIn";
    other._fadeDuration = dur;
    other._fadeTimer = 0;
    other._fadeFrom = 0;
    other._fadeTo = 1;
  }

  update(dt) {
    if (this._destroyed || !this._fadeState) return;

    this._fadeTimer += dt;
    const t = Math.min(this._fadeTimer / this._fadeDuration, 1);

    this._fadeVolume = this._fadeFrom + (this._fadeTo - this._fadeFrom) * t;
    this._updateVolume();

    if (t >= 1) this._onFadeComplete();
  }

  _updateVolume() {
    if (!this._instance) return;
    this._instance.volume = this._volume * this._fadeVolume;
  }

  _cancelFade() {
    this._fadeState = null;
    this._fadeDuration = 0;
    this._fadeTimer = 0;
  }

  _onFadeComplete() {
    const wasCrossFade = this._fadeState === "crossFade";
    if (this._fadeState === "fadeOut" || wasCrossFade) {
      this.stop();
    } else if (this._fadeState === "fadeIn") {
      this._fadeVolume = 1;
      this._updateVolume();
    }
    this._cancelFade();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stop();
    this._sound = null;
  }
}
