export class AudioDefinition {
  constructor(config) {
    if (!config || !config.source) {
      throw new Error("AudioDefinition requires a source");
    }

    this.source = config.source;
    this.group = config.group || "master";
    this.volume = config.volume ?? 1;
    this.loop = config.loop ?? false;
    this.maxInstances = config.maxInstances ?? Infinity;
    this.spatial = config.spatial ?? false;
    this.minDistance = config.minDistance ?? 32;
    this.maxDistance = config.maxDistance ?? 512;
    this.attenuation = config.attenuation ?? "linear";

    if (this.volume < 0 || this.volume > 1) {
      throw new Error("AudioDefinition volume must be between 0 and 1");
    }
    if (this.maxInstances !== Infinity && (typeof this.maxInstances !== "number" || this.maxInstances <= 0)) {
      throw new Error("AudioDefinition maxInstances must be positive or Infinity");
    }
    if (this.minDistance < 0) {
      throw new Error("AudioDefinition minDistance must be >= 0");
    }
    if (this.maxDistance < 0) {
      throw new Error("AudioDefinition maxDistance must be >= 0");
    }
  }
}
