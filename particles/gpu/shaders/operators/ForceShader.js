import { uid } from "../wgslUtils.js";

export const ForceShader = {
  type: "force",

  emit(descriptor) {
    const tx = descriptor.x != null ? descriptor.x : 0;
    const ty = descriptor.y != null ? descriptor.y : 0;
    const strength = descriptor.strength || 0;
    const falloff = descriptor.falloff || "none";
    const minDist = descriptor.minDistance != null ? descriptor.minDistance : 10;
    return `
  let dx${uid()} = ${tx} - x[index];
  let dy${uid()} = ${ty} - y[index];
  let distSq${uid()} = dx * dx + dy * dy;
  let dist${uid()} = sqrt(distSq);
  if (dist > 0.0) {
    let clamped${uid()} = max(dist, ${minDist});
    let nx${uid()} = dx / dist;
    let ny${uid()} = dy / dist;
    var f${uid()} = ${strength};
    ${falloff === "inverse" ? "f = f / clamped;" : ""}
    ${falloff === "inverseSquared" ? "f = f / (clamped * clamped);" : ""}
    vx[index] = vx[index] + nx * f * uniforms.dt;
    vy[index] = vy[index] + ny * f * uniforms.dt;
  }
`;
  },
};
