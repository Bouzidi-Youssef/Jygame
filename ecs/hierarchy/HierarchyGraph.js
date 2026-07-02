import { WorldTransform } from "../components/WorldTransform.js";
import { Parent } from "../components/Parent.js";
import { Children } from "../components/Children.js";

export class HierarchyGraph {
  constructor(world) {
    this._world = world;
    this._children = new Map();
    this._dirty = new Set();
  }

  get world() {
    return this._world;
  }

  _ensureWorldTransform(entity) {
    if (this._world.isAlive(entity) && !this._world.has(entity, WorldTransform)) {
      this._world.addComponent(entity, WorldTransform);
    }
  }

  attach(child, parent) {
    if (child === parent) {
      throw new Error(
        "HierarchyGraph.attach failed: cannot attach entity to itself."
      );
    }
    if (!this._world.isAlive(child) || !this._world.isAlive(parent)) {
      throw new Error(
        "HierarchyGraph.attach failed: both entities must be alive."
      );
    }
    if (this._isDescendant(parent, child)) {
      throw new Error(
        "HierarchyGraph.attach failed: attaching ancestor to descendant " +
        "would create a cycle."
      );
    }

    const currentParent = this.parentOf(child);
    if (currentParent === parent) return;
    if (currentParent !== null) {
      this._removeFromParent(child, currentParent);
    }

    this._world.addComponent(child, Parent);
    this._world.set(child, Parent, { entity: parent });

    if (!this._children.has(parent)) {
      this._children.set(parent, []);
    }
    this._children.get(parent).push(child);

    if (!this._world.has(parent, Children)) {
      this._world.addComponent(parent, Children);
    }

    this._ensureWorldTransform(child);
    this._markDirtyRecursive(child);
  }

  detach(child) {
    const currentParent = this.parentOf(child);
    if (currentParent === null) return;
    this._removeFromParent(child, currentParent);
    this._markDirtyRecursive(child);
  }

  _removeFromParent(child, parent) {
    this._world.removeComponent(child, Parent);
    const siblings = this._children.get(parent);
    if (siblings) {
      const idx = siblings.indexOf(child);
      if (idx !== -1) siblings.splice(idx, 1);
      if (siblings.length === 0) {
        this._children.delete(parent);
        if (this._world.isAlive(parent)) {
          this._world.removeComponent(parent, Children);
        }
      }
    }
  }

  parentOf(entity) {
    if (!this._world.isAlive(entity)) return null;
    if (!this._world.has(entity, Parent)) return null;
    const p = this._world.get(entity, Parent);
    return p ? p.entity : null;
  }

  childrenOf(entity) {
    if (!this._world.isAlive(entity)) return null;
    const arr = this._children.get(entity);
    return arr ? arr : null;
  }

  isDescendant(descendant, ancestor) {
    if (!this._world.isAlive(descendant) || !this._world.isAlive(ancestor)) return false;
    return this._isDescendant(descendant, ancestor);
  }

  _isDescendant(descendant, ancestor) {
    let current = this.parentOf(descendant);
    while (current !== null) {
      if (current === ancestor) return true;
      current = this.parentOf(current);
    }
    return false;
  }

  rootOf(entity) {
    if (!this._world.isAlive(entity)) return null;
    let current = entity;
    while (true) {
      const p = this.parentOf(current);
      if (p === null) return current;
      current = p;
    }
  }

  onEntityDestroyed(entity) {
    const currentParent = this.parentOf(entity);
    if (currentParent !== null) {
      this._removeFromParent(entity, currentParent);
    }

    const children = this._children.get(entity);
    if (!children) return;

    this._children.delete(entity);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (this._world.isAlive(child)) {
        this._world.removeComponent(child, Parent);
        this._markDirtyRecursive(child);
      }
    }
  }

  markDirty(entity) {
    this._dirty.add(entity);
  }

  markDirtyRecursive(entity) {
    this._markDirtyRecursive(entity);
  }

  _markDirtyRecursive(entity) {
    const stack = [entity];
    while (stack.length > 0) {
      const current = stack.pop();
      if (this._dirty.has(current)) continue;
      this._dirty.add(current);
      const children = this._children.get(current);
      if (children) {
        for (let i = 0; i < children.length; i++) {
          stack.push(children[i]);
        }
      }
    }
  }

  markClean(entity) {
    this._dirty.delete(entity);
  }

  clearDirty() {
    this._dirty.clear();
  }

  get dirtySet() {
    return this._dirty;
  }

  isDirty(entity) {
    return this._dirty.has(entity);
  }
}
