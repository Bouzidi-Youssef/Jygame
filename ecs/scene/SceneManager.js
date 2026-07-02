/**
 * SceneRegistry — owns loaded scenes (Map wrapper)
 */
const _registry = Symbol("registry");

function addScene(mgr, scene) {
  const map = mgr[_registry];
  if (map.has(scene.name)) {
    throw new Error(
      `SceneManager.add failed: scene "${scene.name}" already exists.`
    );
  }
  map.set(scene.name, scene);
  scene.onCreate();
  scene._created = true;
}

function removeScene(mgr, name) {
  const map = mgr[_registry];
  const scene = map.get(name);
  if (!scene) {
    throw new Error(
      `SceneManager.remove failed: scene "${name}" not found.`
    );
  }

  const stackIdx = mgr._stack.indexOf(scene);
  if (stackIdx !== -1) {
    const wasActive = stackIdx === mgr._stack.length - 1;
    if (wasActive) {
      scene.onExit();
    }
    mgr._stack.splice(stackIdx, 1);
  }

  scene.onDestroy();
  scene._created = false;
  map.delete(name);
}

function findScene(mgr, name) {
  const map = mgr[_registry];
  const scene = map.get(name);
  if (!scene) {
    throw new Error(
      `SceneManager failed: scene "${name}" not found.`
    );
  }
  return scene;
}

/**
 * SceneManager — coordinates registry and stack operations.
 * Preserves all public APIs.
 */
export class SceneManager {
  constructor() {
    this[_registry] = new Map();
    this._stack = [];
  }

  get activeScene() {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
  }

  get sceneCount() {
    return this._stack.length;
  }

  add(scene) {
    addScene(this, scene);
  }

  remove(name) {
    removeScene(this, name);
  }

  start(name) {
    const scene = findScene(this, name);

    if (this._stack.length > 0) {
      const current = this._stack[this._stack.length - 1];
      current.onExit();
    }

    this._stack.push(scene);
    scene.onEnter();
  }

  change(name) {
    const scene = findScene(this, name);

    if (this._stack.length === 0) {
      this._stack.push(scene);
      scene.onEnter();
      return;
    }

    const current = this._stack[this._stack.length - 1];
    if (current === scene) return;

    current.onExit();
    this._stack.pop();

    this._stack.push(scene);
    scene.onEnter();
  }

  replace(name) {
    const scene = findScene(this, name);

    if (this._stack.length === 0) {
      this._stack.push(scene);
      if (!scene._created) {
        scene.onCreate();
        scene._created = true;
      }
      scene.onEnter();
      return;
    }

    const current = this._stack[this._stack.length - 1];
    current.onExit();
    this._stack.pop();

    if (current._created) {
      current.onDestroy();
      current._created = false;
    }

    if (!scene._created) {
      scene.onCreate();
      scene._created = true;
    }
    this._stack.push(scene);
    scene.onEnter();
  }

  push(name) {
    const scene = findScene(this, name);

    if (this._stack.length > 0) {
      const current = this._stack[this._stack.length - 1];
      current.onPause();
    }

    this._stack.push(scene);
    scene.onEnter();
  }

  pop() {
    if (this._stack.length === 0) {
      throw new Error("SceneManager.pop failed: stack is empty.");
    }

    const top = this._stack.pop();
    top.onExit();

    if (top._created) {
      top.onDestroy();
      top._created = false;
    }

    if (this._stack.length > 0) {
      const previous = this._stack[this._stack.length - 1];
      previous.onResume();
    }
  }

  update(dt) {
    const scene = this.activeScene;
    if (!scene) return;

    scene.world.update(dt);
    scene.update(dt);
  }

  render(ctx) {
    if (this._stack.length === 0) return;

    for (let i = 0; i < this._stack.length; i++) {
      this._stack[i].render(ctx);
    }
  }
}
