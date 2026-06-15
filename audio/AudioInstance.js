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

  _applyVolume() {
    const soundVol = this._overrideSoundVolume !== null ? this._overrideSoundVolume : this._sound._volume;
    const groupVol = this._overrideGroup !== null
      ? this._sound._getVolumeForGroup(this._overrideGroup)
      : this._sound._getGroupVolume();
    this._audio.volume = this._volume * soundVol * groupVol * this._sound._getMasterVolume();
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
