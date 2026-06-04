export class Scene {
  constructor() {
    this.dom = null;
    this.root = document.createElement("div");
  }
  enter() {}
  exit() {}
  pause() {}
  resume() {}
  update(dt) {}
  render(ctx) {}
  renderUI() {}

  transitionTo(scene) {
    if (this.game) this.game.switchScene(scene);
  }
}
