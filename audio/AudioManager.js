import { Sound } from "./Sound.js";
import { AudioGroup } from "./AudioGroup.js";
import { AudioDefinition } from "./AudioDefinition.js";
import { AudioLoader } from "../loaders/AudioLoader.js";

export class AudioManager {
  constructor() {
    this._sounds = new Map();
    this._definitions = new Map();
    this._soundsByDefinition = new Map();
    this._groups = new Map();
    this._masterVolume = 1;
    this._masterMuted = false;
    this._currentMusic = null;

    this._createGroup("master");
    this._createGroup("music");
    this._createGroup("sfx");
    this._createGroup("ui");
    this._createGroup("ambient");
  }

  get _effectiveMasterVolume() {
    return this._masterMuted ? 0 : this._masterVolume;
  }

  _createGroup(name) {
    const group = new AudioGroup(name, this);
    this._groups.set(name, group);
    return group;
  }

  group(name) {
    if (!this._groups.has(name)) {
      this._createGroup(name);
    }
    return this._groups.get(name);
  }

  _onGroupVolumeChange(name) {
    for (const sound of this._sounds.values()) {
      if (sound._groupName === name) sound._updateAllVolumes();
    }
    for (const sound of this._soundsByDefinition.values()) {
      if (sound._groupName === name) sound._updateAllVolumes();
    }
  }

  _notifyAllSoundsVolumeChange() {
    for (const sound of this._sounds.values()) {
      sound._updateAllVolumes();
    }
    for (const sound of this._soundsByDefinition.values()) {
      sound._updateAllVolumes();
    }
  }

  _iterateAllSounds(fn) {
    for (const sound of this._sounds.values()) fn(sound);
    for (const sound of this._soundsByDefinition.values()) fn(sound);
  }

  add(key, asset) {
    if (!key) throw new Error("AudioManager.add() requires a non-empty key");
    if (!asset) throw new Error("AudioManager.add() requires an audio asset");
    if (this._sounds.has(key)) throw new Error("Sound '" + key + "' already exists");

    const sound = new Sound(asset, this);
    this._sounds.set(key, sound);
    return sound;
  }

  get(key) { return this._sounds.get(key); }
  has(key) { return this._sounds.has(key); }

  remove(key) {
    const sound = this._sounds.get(key);
    if (sound) {
      sound.destroy();
      this._sounds.delete(key);
    }
  }

  define(name, config) {
    if (!name || typeof name !== "string") {
      throw new Error("AudioManager.define() requires a non-empty name");
    }
    if (this._definitions.has(name)) {
      throw new Error("Audio definition '" + name + "' already exists");
    }

    const def = new AudioDefinition(config);
    this._definitions.set(name, def);
  }

  undefine(name) {
    if (!this._definitions.has(name)) return;
    this._definitions.delete(name);
    const sound = this._soundsByDefinition.get(name);
    if (sound) {
      sound.destroy();
      this._soundsByDefinition.delete(name);
    }
  }

  hasDefinition(name) {
    return this._definitions.has(name);
  }

  getDefinition(name) {
    return this._definitions.get(name) || null;
  }

  play(name, options = {}) {
    const def = this._definitions.get(name);
    if (!def) throw new Error("Audio definition '" + name + "' not found");

    let sound = this._soundsByDefinition.get(name);
    if (!sound) {
      const asset = AudioLoader.get(def.source);
      if (!asset) throw new Error("Asset '" + def.source + "' not loaded. Use AudioLoader to load it first.");

      sound = new Sound(asset, this, { maxInstances: def.maxInstances === Infinity ? undefined : def.maxInstances });
      sound.volume = def.volume;
      sound.group = def.group;
      this._soundsByDefinition.set(name, sound);
    }

    const instance = sound.play();
    if (!instance) return null;

    if (options.volume !== undefined) {
      instance._overrideSoundVolume = Math.max(0, Math.min(1, options.volume));
    }
    if (options.loop !== undefined) instance.loop = options.loop;
    if (options.group !== undefined) {
      instance._overrideGroup = options.group;
    }
    if (options.volume !== undefined || options.group !== undefined) {
      instance._applyVolume();
    }

    return instance;
  }

  clear() {
    if (this._currentMusic) {
      this._currentMusic._stopAll();
      this._currentMusic = null;
    }
    for (const sound of this._sounds.values()) sound.destroy();
    this._sounds.clear();
    for (const sound of this._soundsByDefinition.values()) sound.destroy();
    this._soundsByDefinition.clear();
  }

  destroy() {
    this.clear();
    this._definitions.clear();
    for (const group of this._groups.values()) group._manager = null;
    this._groups.clear();
  }

  pauseAll() {
    this._iterateAllSounds(s => s._pauseAll());
  }

  resumeAll() {
    this._iterateAllSounds(s => s._resumeAll());
  }

  stopAll() {
    this._iterateAllSounds(s => s._stopAll());
  }

  mute() {
    this._masterMuted = true;
    this._notifyAllSoundsVolumeChange();
  }

  unmute() {
    this._masterMuted = false;
    this._notifyAllSoundsVolumeChange();
  }

  get masterVolume() { return this._masterVolume; }
  set masterVolume(value) {
    this._masterVolume = Math.max(0, Math.min(1, value));
    this._notifyAllSoundsVolumeChange();
  }

  playMusic(key) {
    const sound = this._sounds.get(key);
    if (!sound) throw new Error("Sound '" + key + "' not found");

    if (this._currentMusic) {
      this._currentMusic._stopAll();
    }

    this._currentMusic = sound;
    const instance = sound.play();
    if (instance) instance.loop = true;
    return instance;
  }

  stopMusic() {
    if (this._currentMusic) {
      this._currentMusic._stopAll();
      this._currentMusic = null;
    }
  }

  pauseMusic() {
    if (this._currentMusic) this._currentMusic._pauseAll();
  }

  resumeMusic() {
    if (this._currentMusic) this._currentMusic._resumeAll();
  }
}
