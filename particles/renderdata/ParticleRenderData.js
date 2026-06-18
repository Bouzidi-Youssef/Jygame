export class ParticleRenderData {
  constructor() {
    if (new.target === ParticleRenderData) {
      throw new Error("ParticleRenderData is abstract — extend it");
    }
  }

  get count() {
    return 0;
  }

  getParticle(index) {
    throw new Error("ParticleRenderData#getParticle must be implemented by subclass");
  }

  destroy() {}
}
