export class AudioInstance {
  constructor(audio, sound) {
    this._audio = audio;
    this._sound = sound;
    this._volume = 1;
    this._destroyed = false;
    this._returned = false;
    this._pausedByManager = false;
    this._overrideSoundVolume = null;
    this._overrideGroup = null;
    this._x = 0;
    this._y = 0;
    this._spatial = false;
    this._minDistance = 32;
    this._maxDistance = 512;
    this._rolloff = "linear";

    this._onEnded = () => {
      if (this._destroyed) return;
      this._sound._returnInstance(this);
    };

    audio.addEventListener("ended", this._onEnded);
  }

  get volume() { return this._destroyed ? 0 : this._volume; }
  set volume(value) {
    if (this._destroyed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._applyVolume();
  }

  get loop() { return this._destroyed ? false : this._audio.loop; }
  set loop(value) { if (!this._destroyed) this._audio.loop = value; }

  get muted() { return this._destroyed ? true : this._audio.muted; }
  set muted(value) { if (!this._destroyed) this._audio.muted = value; }

  get currentTime() { return this._destroyed ? 0 : this._audio.currentTime; }
  set currentTime(value) { if (!this._destroyed) this._audio.currentTime = Math.max(0, value); }

  get duration() { return this._destroyed ? 0 : this._audio.duration; }
  get paused() { return this._destroyed ? true : this._audio.paused; }
  get ended() { return this._destroyed ? false : this._audio.ended; }

  get isPlaying() { return !this.paused && !this.ended; }

  get x() { return this._x; }
  set x(value) {
    if (!this._destroyed) {
      this._x = value;
      if (this._spatial) this._applyVolume();
    }
  }

  get y() { return this._y; }
  set y(value) {
    if (!this._destroyed) {
      this._y = value;
      if (this._spatial) this._applyVolume();
    }
  }

  get spatial() { return this._spatial; }

  get minDistance() { return this._minDistance; }
  set minDistance(value) {
    if (!this._destroyed) {
      this._minDistance = Math.max(0, value);
      if (this._spatial) this._applyVolume();
    }
  }

  get maxDistance() { return this._maxDistance; }
  set maxDistance(value) {
    if (!this._destroyed) {
      this._maxDistance = Math.max(0, value);
      if (this._spatial) this._applyVolume();
    }
  }

  get rolloff() { return this._rolloff; }
  set rolloff(value) {
    if (!this._destroyed) {
      this._rolloff = value || "linear";
    }
  }

  _checkNotDestroyed() {
    if (this._destroyed) throw new Error("Cannot use destroyed AudioInstance");
  }

  play() {
    this._checkNotDestroyed();
    this._applyVolume();
    return this._audio.play().catch(() => {});
  }

  pause() {
    this._checkNotDestroyed();
    this._audio.pause();
  }

  stop() {
    this._checkNotDestroyed();
    this._audio.pause();
    this._audio.currentTime = 0;
  }

  restart() {
    this._checkNotDestroyed();
    this._audio.pause();
    this._audio.currentTime = 0;
    this._applyVolume();
    return this._audio.play().catch(() => {});
  }

  _computeSpatialVolume() {
    if (!this._spatial || !this._sound || !this._sound._manager) return 1;
    const listener = this._sound._manager._listener;
    if (!listener) return 1;

    const dx = this._x - listener.x;
    const dy = this._y - listener.y;
    const distSq = dx * dx + dy * dy;
    const maxSq = this._maxDistance * this._maxDistance;

    if (distSq >= maxSq) return 0;

    const minSq = this._minDistance * this._minDistance;
    if (distSq <= minSq) return 1;

    const dist = Math.sqrt(distSq);

    if (this._rolloff === "linear") {
      const t = (dist - this._minDistance) / (this._maxDistance - this._minDistance);
      return 1 - t;
    }

    return 1;
  }

  _applyVolume() {
    const spatialVol = this._computeSpatialVolume();
    const soundVol = this._overrideSoundVolume !== null ? this._overrideSoundVolume : this._sound._volume;
    const groupVol = this._overrideGroup !== null
      ? this._sound._getVolumeForGroup(this._overrideGroup)
      : this._sound._getGroupVolume();
    this._audio.volume = this._volume * spatialVol * soundVol * groupVol * this._sound._getMasterVolume();
  }

  _reset() {
    this._audio.pause();
    this._audio.currentTime = 0;
    this._audio.loop = false;
    this._audio.muted = false;
    this._volume = 1;
    this._pausedByManager = false;
    this._overrideSoundVolume = null;
    this._overrideGroup = null;
    this._x = 0;
    this._y = 0;
    this._spatial = false;
    this._minDistance = 32;
    this._maxDistance = 512;
    this._rolloff = "linear";
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._audio.removeEventListener("ended", this._onEnded);
    this._audio.pause();
    this._audio = null;
    this._sound = null;
  }
}
