import { computeForce } from "./forceUtils.js";

export const OrbitOperator = {
  type: "orbit",

  execute(descriptor, view, i, dt, state, uniforms) {
    const tx = descriptor.x != null ? descriptor.x : 0;
    const ty = descriptor.y != null ? descriptor.y : 0;
    const strength = descriptor.strength || 0;
    const falloff = descriptor.falloff || "none";
    const minDist = descriptor.minDistance != null ? descriptor.minDistance : 10;
    const radius = descriptor.radius;
    const stiffness = descriptor.stiffness != null ? descriptor.stiffness : 2;
    const clockwise = descriptor.direction === "clockwise";

    const { nx, ny, dist, force } = computeForce(view.x(i), view.y(i), tx, ty, strength, falloff, minDist);

    if (dist === 0) {
      if (radius != null) {
        view.setVy(i, view.vy(i) - radius * stiffness * dt);
      }
      return;
    }

    const tnx = clockwise ? ny : -ny;
    const tny = clockwise ? -nx : nx;

    view.setVx(i, view.vx(i) + tnx * force * dt);
    view.setVy(i, view.vy(i) + tny * force * dt);

    if (radius != null) {
      const error = radius - dist;
      const correction = error * stiffness;
      view.setVx(i, view.vx(i) + nx * correction * dt);
      view.setVy(i, view.vy(i) + ny * correction * dt);
    }
  },
};
