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

    this.texture = null;

    this.originX = 0.5;
    this.originY = 0.5;

    this.width = 0;
    this.height = 0;

    this.frameX = 0;
    this.frameY = 0;
    this.frameWidth = 0;
    this.frameHeight = 0;

    this.userData = null;

    this.depth = 0;
    this.ageRatio = 0;
    this.collides = false;
    this.radius = 1;
    this.collisionResponse = "bounce";
    this.restitution = 1;
    this.collisionLayer = "default";
    this.onCollision = null;
    this.__jygameAnimOffset = 0;
    this.__jygameAnimPrevFrame = -1;
    this.__jygameAnimLoopCount = 0;
    this.__jygameColorSegment = 0;
    this.__jygameAnimSegments = null;
    this.__turbulenceStates = null;
    this.__spawnStates = null;
    this.__trailStates = null;
  }

  setFrame(x, y, width, height) {
    this.frameX = x;
    this.frameY = y;
    this.frameWidth = width;
    this.frameHeight = height;
    return this;
  }

  clearFrame() {
    this.frameX = 0;
    this.frameY = 0;
    this.frameWidth = 0;
    this.frameHeight = 0;
    return this;
  }

  get lifeRatio() {
    return this.maxLife > 0
      ? this.life / this.maxLife
      : 0;
  }
}
