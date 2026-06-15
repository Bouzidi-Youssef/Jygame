import { computeAttenuation, ATTENUATION_LINEAR, ATTENUATION_QUADRATIC, ATTENUATION_INVERSE } from "./AudioManager.js";

export class AudioInstance {
  constructor(playback, sound) {
    this._playback = playback;
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

    this._onEnded = () => {
      if (this._destroyed) return;
      this._sound._returnInstance(this);
    };

    this._playback.onEnded(this._onEnded);
  }

  get volume() { return this._destroyed ? 0 : this._volume; }
  set volume(value) {
    if (this._destroyed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._applyVolume();
  }

  get loop() { return this._destroyed ? false : this._playback.loop; }
  set loop(value) { if (!this._destroyed) this._playback.loop = value; }

  get muted() { return this._destroyed ? true : this._playback.muted; }
  set muted(value) { if (!this._destroyed) this._playback.muted = value; }

  get currentTime() { return this._destroyed ? 0 : this._playback.currentTime; }
  set currentTime(value) { if (!this._destroyed) this._playback.currentTime = Math.max(0, value); }

  get duration() { return this._destroyed ? 0 : this._playback.duration; }
  get paused() { return this._destroyed ? true : this._playback.paused; }
  get ended() { return this._destroyed ? false : this._playback.ended; }

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

  _checkNotDestroyed() {
    if (this._destroyed) throw new Error("Cannot use destroyed AudioInstance");
  }

  play() {
    this._checkNotDestroyed();
    this._applyVolume();
    return this._playback.play();
  }

  pause() {
    this._checkNotDestroyed();
    this._playback.pause();
  }

  stop() {
    this._checkNotDestroyed();
    this._playback.stop();
  }

  restart() {
    this._checkNotDestroyed();
    this._playback.stop();
    this._applyVolume();
    return this._playback.play();
  }

  _computeSpatialVolume() {
    if (!this._spatial || !this._sound || !this._sound._manager) return 1;
    const listener = this._sound._manager._listener;
    if (!listener) return 1;

    const dx = this._x - listener.x;
    const dy = this._y - listener.y;
    const distSq = dx * dx + dy * dy;

    if (distSq >= this._maxDistance * this._maxDistance) return 0;
    if (distSq <= this._minDistance * this._minDistance) return 1;

    const dist = Math.sqrt(distSq);
    const model = this._sound._attenuation || this._sound._manager._attenuation || ATTENUATION_LINEAR;
    return computeAttenuation(dist, this._minDistance, this._maxDistance, model, this._sound._manager._inverseRolloff);
  }

  _applyVolume() {
    const spatialVol = this._computeSpatialVolume();
    const soundVol = this._overrideSoundVolume !== null ? this._overrideSoundVolume : this._sound._volume;
    const groupVol = this._overrideGroup !== null
      ? this._sound._getVolumeForGroup(this._overrideGroup)
      : this._sound._getGroupVolume();
    this._playback.volume = this._volume * spatialVol * soundVol * groupVol * this._sound._getMasterVolume();
  }

  _reset() {
    this._playback.pause();
    this._playback.currentTime = 0;
    this._playback.loop = false;
    this._playback.muted = false;
    this._volume = 1;
    this._pausedByManager = false;
    this._overrideSoundVolume = null;
    this._overrideGroup = null;
    this._x = 0;
    this._y = 0;
    this._spatial = false;
    this._minDistance = 32;
    this._maxDistance = 512;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._playback.onEnded(null);
    this._playback.destroy();
    this._playback = null;
    this._sound = null;
  }
}
