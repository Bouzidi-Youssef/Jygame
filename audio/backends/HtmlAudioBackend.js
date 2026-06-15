import { AudioBackend } from "./AudioBackend.js";

class HtmlPlayback {
  constructor(audio) {
    this._audio = audio;
    this._onEnded = null;
    this._handleEnded = () => {
      if (this._onEnded) this._onEnded();
    };
    audio.addEventListener("ended", this._handleEnded);
  }

  play() {
    return this._audio.play().catch(() => {});
  }

  pause() {
    this._audio.pause();
  }

  stop() {
    this._audio.pause();
    this._audio.currentTime = 0;
  }

  get currentTime() { return this._audio.currentTime; }
  set currentTime(value) { this._audio.currentTime = Math.max(0, value); }

  get duration() { return this._audio.duration; }

  get loop() { return this._audio.loop; }
  set loop(value) { this._audio.loop = value; }

  get volume() { return this._audio.volume; }
  set volume(value) { this._audio.volume = value; }

  get muted() { return this._audio.muted; }
  set muted(value) { this._audio.muted = value; }

  get paused() { return this._audio.paused; }

  get ended() { return this._audio.ended; }

  onEnded(callback) {
    this._onEnded = callback;
  }

  destroy() {
    this._onEnded = null;
    this._audio.removeEventListener("ended", this._handleEnded);
    this._audio.pause();
    this._audio = null;
  }
}

export class HtmlAudioBackend extends AudioBackend {
  createPlayback(asset) {
    const clone = asset.cloneNode(true);
    return new HtmlPlayback(clone);
  }
}
