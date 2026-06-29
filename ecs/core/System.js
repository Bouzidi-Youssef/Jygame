export class System {
  constructor() {
    this.enabled = true;
    this._priority = this.constructor.priority ?? 0;
    this._compiled = null;
  }

  get priority() {
    return this._priority;
  }

  get query() {
    return this._compiled ? this._compiled.query : null;
  }

  onAdded(world) {}

  onRemoved(world) {}

  update(world, dt) {
    throw new Error(
      `System "${this.constructor.name}" must override the update() method.`
    );
  }
}
