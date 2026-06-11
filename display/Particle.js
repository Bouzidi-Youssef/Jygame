export class Particle {
  constructor() {
    this.x = 0;
    this.y = 0;

    this.vx = 0;
    this.vy = 0;

    this.ax = 0;
    this.ay = 0;

    this.life = 0;
    this.maxLife = 0;

    this.size = 1;

    this.rotation = 0;
    this.rotationSpeed = 0;

    this.alpha = 1;

    this.r = 255;
    this.g = 255;
    this.b = 255;

    this.color = "#ffffff";

    this.ageRatio = 0;
    this.__jygameColorSegment = 0;
  }

  get lifeRatio() {
    return this.maxLife > 0
      ? this.life / this.maxLife
      : 0;
  }
}
