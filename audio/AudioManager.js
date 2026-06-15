import { Sound } from "./Sound.js";
import { Music } from "./Music.js";
import { AudioGroup } from "./AudioGroup.js";
import { AudioDefinition } from "./AudioDefinition.js";
import { AudioListener } from "./AudioListener.js";
import { AudioLoader } from "../loaders/AudioLoader.js";
import { HtmlAudioBackend } from "./backends/HtmlAudioBackend.js";

export const ATTENUATION_LINEAR = "linear";
export const ATTENUATION_QUADRATIC = "quadratic";
export const ATTENUATION_INVERSE = "inverse";

export function computeAttenuation(distance, minDistance, maxDistance, model, inverseRolloff) {
  const normalized = distance / maxDistance;
  let factor;
  switch (model) {
    case ATTENUATION_LINEAR:
      factor = 1 - normalized;
      break;
    case ATTENUATION_QUADRATIC:
      factor = 1 - normalized * normalized;
      break;
    case ATTENUATION_INVERSE:
      factor = 1 / (1 + inverseRolloff * normalized);
      break;
    default:
      factor = 1 - normalized;
      break;
  }
  return factor < 0 ? 0 : factor > 1 ? 1 : factor;
}

const VALID_ATTENUATIONS = new Set([ATTENUATION_LINEAR, ATTENUATION_QUADRATIC, ATTENUATION_INVERSE]);

export class AudioManager {
  constructor(options = {}) {
    this._backend = options.backend || new HtmlAudioBackend();
    this._sounds = new Map();
    this._definitions = new Map();
    this._soundsByDefinition = new Map();
    this._groups = new Map();
    this._masterVolume = 1;
    this._masterMuted = false;
    this._currentMusic = null;
    this._listener = new AudioListener();
    this._attenuation = ATTENUATION_LINEAR;
    this._inverseRolloff = 4;
    this._musicCache = new Map();

    this._createGroup("master");
    this._createGroup("music");
    this._createGroup("sfx");
    this._createGroup("ui");
    this._createGroup("ambient");
  }

  get listener() { return this._listener; }

  get attenuation() { return this._attenuation; }
  set attenuation(value) {
    if (!VALID_ATTENUATIONS.has(value)) {
      throw new Error("Invalid attenuation model: '" + value + "'. Must be 'linear', 'quadratic', or 'inverse'.");
    }
    this._attenuation = value;
  }

  get inverseRolloff() { return this._inverseRolloff; }
  set inverseRolloff(value) {
    this._inverseRolloff = Math.max(0, value);
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

  _onGroupVolumeChange() {
    for (const sound of this._sounds.values()) {
      sound._updateAllVolumes();
    }
    for (const sound of this._soundsByDefinition.values()) {
      sound._updateAllVolumes();
    }
    for (const music of this._musicCache.values()) {
      if (music._instance) music._updateVolume();
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

    const sound = new Sound(asset, this, { backend: this._backend });
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

      sound = new Sound(asset, this, { maxInstances: def.maxInstances === Infinity ? undefined : def.maxInstances, backend: this._backend });
      sound.volume = def.volume;
      sound.group = def.group;
      this._soundsByDefinition.set(name, sound);
    }

    const hasPosition = options.x !== undefined || options.y !== undefined;
    const spatialOpts = {};
    if (hasPosition) {
      spatialOpts.spatial = true;
      spatialOpts.x = options.x;
      spatialOpts.y = options.y;
      spatialOpts.minDistance = options.minDistance !== undefined ? options.minDistance : def.minDistance;
      spatialOpts.maxDistance = options.maxDistance !== undefined ? options.maxDistance : def.maxDistance;
    }

    const instance = sound.play(spatialOpts);
    if (!instance) return null;

    if (options.volume !== undefined) {
      instance._overrideSoundVolume = Math.max(0, Math.min(1, options.volume));
    }
    if (options.loop !== undefined) instance.loop = options.loop;
    if (options.group !== undefined) {
      instance._overrideGroup = options.group;
    }
    if (options.volume !== undefined || options.group !== undefined || hasPosition) {
      instance._applyVolume();
    }

    return instance;
  }

  music(key) {
    if (this._musicCache.has(key)) return this._musicCache.get(key);

    let sound = this._sounds.get(key);
    if (!sound) {
      sound = this._soundsByDefinition.get(key);
    }
    if (!sound) {
      const def = this._definitions.get(key);
      if (def) {
        const asset = AudioLoader.get(def.source);
        if (!asset) throw new Error("Asset '" + def.source + "' not loaded. Use AudioLoader to load it first.");
        sound = new Sound(asset, this, { maxInstances: 1, backend: this._backend });
        sound.volume = def.volume;
        sound.group = def.group;
        this._soundsByDefinition.set(key, sound);
      }
    }
    if (!sound) throw new Error("Sound '" + key + "' not found. Use audio.add() or audio.define() first.");

    const music = new Music(sound);
    this._musicCache.set(key, music);
    return music;
  }

  clear() {
    for (const music of this._musicCache.values()) music.destroy();
    this._musicCache.clear();
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
    this._listener = null;
    this._musicCache.clear();
    this._backend.destroy();
    this._backend = null;
  }

  suspend() {
    this._backend.suspend();
  }

  resume() {
    this._backend.resume();
  }

  update(dt) {
    for (const sound of this._sounds.values()) {
      const instances = sound._activeInstances;
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        if (inst._spatial) inst._applyVolume();
      }
    }
    for (const sound of this._soundsByDefinition.values()) {
      const instances = sound._activeInstances;
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        if (inst._spatial) inst._applyVolume();
      }
    }
    if (dt > 0) {
      for (const music of this._musicCache.values()) {
        music.update(dt);
      }
    }
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
