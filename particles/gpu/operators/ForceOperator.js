import { computeForce } from "./forceUtils.js";

export const ForceOperator = {
  type: "force",

  execute(descriptor, view, i, dt, state, uniforms) {
    const tx = descriptor.x != null ? descriptor.x : 0;
    const ty = descriptor.y != null ? descriptor.y : 0;
    const strength = descriptor.strength || 0;
    const falloff = descriptor.falloff || "none";
    const minDist = descriptor.minDistance != null ? descriptor.minDistance : 10;

    const { nx, ny, force } = computeForce(view.x(i), view.y(i), tx, ty, strength, falloff, minDist);
    view.setVx(i, view.vx(i) + nx * force * dt);
    view.setVy(i, view.vy(i) + ny * force * dt);
  },
};
