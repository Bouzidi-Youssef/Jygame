export class AudioGroup {
  constructor(name, manager) {
    this._name = name;
    this._manager = manager;
    this._volume = 1;
    this._muted = false;
  }

  get volume() { return this._volume; }
  set volume(value) {
    this._volume = Math.max(0, Math.min(1, value));
    this._manager._onGroupVolumeChange(this._name);
  }

  get muted() { return this._muted; }
  set muted(value) {
    this._muted = value;
    this._manager._onGroupVolumeChange(this._name);
  }
}
