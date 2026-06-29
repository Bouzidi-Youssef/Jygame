import { System } from "../core/System.js";
import { Animation } from "../components/Animation.js";
import { Renderable } from "../components/Renderable.js";
import { AnimationClipRegistry } from "../animation/AnimationClipRegistry.js";

export class AnimationSystem extends System {
  static query = { all: [Animation, Renderable] };
  static priority = 1;

  update(ctx, dt) {
    const aid = this._compiled.componentIds.get(Animation);
    const rid = this._compiled.componentIds.get(Renderable);
    if (aid === undefined || rid === undefined) return;

    const registry = ctx.resources.get(AnimationClipRegistry);
    if (!registry) {
      throw new Error(
        "AnimationSystem.update failed: AnimationClipRegistry resource is not set. " +
        "Use world.setResource(AnimationClipRegistry, registry) before updating."
      );
    }

    for (const table of ctx) {
      const count = table.count;
      if (count === 0) continue;

      const clipIdCol = table.getColumn(aid, "clipId");
      const frameIndexCol = table.getColumn(aid, "frameIndex");
      const elapsedCol = table.getColumn(aid, "elapsed");
      const isPlayingCol = table.getColumn(aid, "isPlaying");
      const speedCol = table.getColumn(aid, "speed");
      const imageCol = table.getColumn(rid, "image");
      if (!clipIdCol || !frameIndexCol || !elapsedCol || !isPlayingCol || !speedCol || !imageCol) continue;

      for (let r = 0; r < count; r++) {
        if (!isPlayingCol[r]) continue;

        const clip = registry.getById(clipIdCol[r]);
        if (!clip) continue;

        const frameCount = clip.frameCount;
        if (frameCount === 0) {
          isPlayingCol[r] = 0;
          continue;
        }

        elapsedCol[r] += dt * speedCol[r];

        let frame = Math.floor(elapsedCol[r] / clip.frameDuration);

        if (clip.loop) {
          frame %= clip.frameCount;
        } else if (frame >= clip.frameCount) {
          frame = clip.frameCount - 1;
          isPlayingCol[r] = 0;
        }

        frameIndexCol[r] = frame;
        imageCol[r] = clip.frames[frame];
      }
    }
  }
}
