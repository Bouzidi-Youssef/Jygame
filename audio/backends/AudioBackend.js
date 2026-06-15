export class AudioBackend {
  createPlayback(asset) {
    throw new Error("AudioBackend#createPlayback must be overridden");
  }

  suspend() {}
  resume() {}
  destroy() {}
}
