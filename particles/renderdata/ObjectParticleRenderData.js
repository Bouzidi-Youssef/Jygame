import { ParticleRenderData } from "./ParticleRenderData.js";

export class ObjectParticleRenderData extends ParticleRenderData {
  constructor(source, count) {
    super();
    this._source = source;
    this._count = count;
  }

  get count() {
    return this._count;
  }

  getParticle(index) {
    return this._source[index];
  }
}
