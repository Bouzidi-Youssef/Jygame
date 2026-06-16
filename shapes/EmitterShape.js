export class EmitterShape {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  sample(particle) {
    throw new Error("EmitterShape.sample() must be implemented");
  }
}
