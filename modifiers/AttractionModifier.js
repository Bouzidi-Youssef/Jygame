import { ForceModifier } from "./ForceModifier.js";

export class AttractionModifier extends ForceModifier {
  update(particle, dt) {
    this._computeForce(particle);
    particle.vx += this._tmpNX * this._tmpForce * dt;
    particle.vy += this._tmpNY * this._tmpForce * dt;
  }
}
