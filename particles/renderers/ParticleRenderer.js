export class ParticleRenderer {
  constructor({ renderParticle } = {}) {
    if (new.target === ParticleRenderer) {
      throw new Error("ParticleRenderer is abstract — extend it");
    }
    this._renderParticle = renderParticle || null;
  }

  render(data, ctx) {
    throw new Error("ParticleRenderer#render must be implemented by subclass");
  }

  destroy() {
    this._renderParticle = null;
  }
}
