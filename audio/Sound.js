import { AudioInstance } from "./AudioInstance.js";
import { ATTENUATION_LINEAR, ATTENUATION_QUADRATIC, ATTENUATION_INVERSE } from "./AudioManager.js";
import { HtmlAudioBackend } from "./backends/HtmlAudioBackend.js";

export class Sound {
  constructor(asset, manager, options = {}) {
    if (!asset) throw new Error("Sound requires an audio asset");

    this._asset = asset;
    this._manager = manager;
    this._backend = options.backend || (manager && manager._backend) || new HtmlAudioBackend();
    this._freeInstances = [];
    this._activeInstances = [];
    this._volume = 1;
    this._groupName = "master";
    this._destroyed = false;
    this._maxInstances = options.maxInstances ?? Infinity;
    this._overflowPolicy = options.overflowPolicy || "drop-new";
    this._attenuation = null;
  }

  get volume() { return this._destroyed ? 0 : this._volume; }
  set volume(value) {
    if (this._destroyed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._updateAllVolumes();
  }

  get group() { return this._groupName; }
  set group(value) {
    this._groupName = value || "master";
    this._updateAllVolumes();
  }

  get isPlaying() { return this._activeInstances.length > 0; }

  get attenuation() { return this._attenuation; }
  set attenuation(value) {
    if (value !== null && value !== ATTENUATION_LINEAR && value !== ATTENUATION_QUADRATIC && value !== ATTENUATION_INVERSE) {
      throw new Error("Invalid attenuation model: '" + value + "'. Must be 'linear', 'quadratic', 'inverse', or null.");
    }
    this._attenuation = value;
  }

  play(options = {}) {
    this._checkNotDestroyed();

    if (this._activeInstances.length >= this._maxInstances) {
      if (this._overflowPolicy === "drop-new") return null;
    }

    const instance = this._getInstance();
    instance._returned = false;
    this._activeInstances.push(instance);

    if (options.x !== undefined) instance._x = options.x;
    if (options.y !== undefined) instance._y = options.y;
    if (options.minDistance !== undefined) instance._minDistance = options.minDistance;
    if (options.maxDistance !== undefined) instance._maxDistance = options.maxDistance;
    if (options.spatial !== undefined) instance._spatial = options.spatial;
    if (options.x !== undefined || options.y !== undefined) instance._spatial = true;

    instance.restart();
    return instance;
  }

  _getInstance() {
    if (this._freeInstances.length > 0) {
      return this._freeInstances.pop();
    }
    const playback = this._backend.createPlayback(this._asset);
    return new AudioInstance(playback, this);
  }

  _returnInstance(instance) {
    if (instance._returned) return;
    instance._returned = true;
    instance._reset();

    const idx = this._activeInstances.indexOf(instance);
    if (idx !== -1) {
      const last = this._activeInstances.length - 1;
      if (idx !== last) this._activeInstances[idx] = this._activeInstances[last];
      this._activeInstances.pop();
    }

    this._freeInstances.push(instance);
  }

  _updateAllVolumes() {
    for (let i = 0; i < this._activeInstances.length; i++) {
      this._activeInstances[i]._applyVolume();
    }
  }

  _getGroupVolume() {
    return this._getVolumeForGroup(this._groupName);
  }

  _getVolumeForGroup(groupName) {
    if (!this._manager) return 1;
    const group = this._manager._groups.get(groupName);
    return group ? (group._muted ? 0 : group._volume) : 1;
  }

  _getMasterVolume() {
    return this._manager ? this._manager._effectiveMasterVolume : 1;
  }

  _checkNotDestroyed() {
    if (this._destroyed) throw new Error("Cannot use destroyed Sound");
  }

  _pauseAll() {
    for (let i = 0; i < this._activeInstances.length; i++) {
      const inst = this._activeInstances[i];
      if (!inst.paused) {
        inst._pausedByManager = true;
        inst.pause();
      }
    }
  }

  _resumeAll() {
    for (let i = 0; i < this._activeInstances.length; i++) {
      const inst = this._activeInstances[i];
      if (inst._pausedByManager) {
        inst._pausedByManager = false;
        inst._applyVolume();
        inst._playback.play();
      }
    }
  }

  _stopAll() {
    const snapshot = this._activeInstances.slice();
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i].stop();
      this._returnInstance(snapshot[i]);
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopAll();
    for (let i = 0; i < this._freeInstances.length; i++) {
      this._freeInstances[i].destroy();
    }
    this._freeInstances.length = 0;
    this._asset = null;
    this._manager = null;
  }
}
