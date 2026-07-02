import { World } from "../core/World.js";

import {
  Transform, Velocity, Collider, Renderable, RenderBounds,
  Animation, Visible, Trail,
  EnemyTag, PlayerTag, ProjectileTag, StaticTag,
} from "../components/index.js";

import {
  MovementSystem, AnimationSystem, CollisionSystem, RenderSystem, TrailSystem,
} from "../systems/index.js";

import { RenderQueue } from "../render/RenderQueue.js";
import { AnimationClipRegistry } from "../animation/AnimationClipRegistry.js";
import { TrailManager } from "../trails/TrailManager.js";
import { SpatialHash } from "../../collision/SpatialHash.js";

const _ECS_COMPONENTS = [
  Transform, Velocity, Collider,
  Renderable, RenderBounds,
  Animation, Visible, Trail,
  EnemyTag, PlayerTag, ProjectileTag, StaticTag,
];

const _ECS_SYSTEMS = [
  MovementSystem, AnimationSystem, CollisionSystem, RenderSystem, TrailSystem,
];

export class DefaultWorldBuilder {
  static createDefault() {
    const world = new World();

    for (let i = 0; i < _ECS_COMPONENTS.length; i++) {
      world.register(_ECS_COMPONENTS[i]);
    }

    world.setResource(SpatialHash, new SpatialHash());
    world.setResource(TrailManager, new TrailManager());
    world.setResource(RenderQueue, new RenderQueue());
    world.setResource(AnimationClipRegistry, new AnimationClipRegistry());

    for (let i = 0; i < _ECS_SYSTEMS.length; i++) {
      world.addSystem(new _ECS_SYSTEMS[i]());
    }

    return world;
  }
}
