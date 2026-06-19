import { uid } from "../wgslUtils.js";

export const OrbitShader = {
  type: "orbit",

  emit(descriptor) {
    const tx = descriptor.x != null ? descriptor.x : 0;
    const ty = descriptor.y != null ? descriptor.y : 0;
    const strength = descriptor.strength || 0;
    const falloff = descriptor.falloff || "none";
    const minDist = descriptor.minDistance != null ? descriptor.minDistance : 10;
    const radius = descriptor.radius;
    const stiffness = descriptor.stiffness != null ? descriptor.stiffness : 2;
    const clockwise = descriptor.direction === "clockwise";

    const n = uid();
    let code = `
  let dx${n} = ${tx} - x[index];
  let dy${n} = ${ty} - y[index];
  let distSq${n} = dx * dx + dy * dy;
  let dist${n} = sqrt(distSq);
  if (dist > 0.0) {
    let clamped${n} = max(dist, ${minDist});
    let nx${n} = dx / dist;
    let ny${n} = dy / dist;
    var f${n} = ${strength};
    ${falloff === "inverse" ? "f = f / clamped;" : ""}
    ${falloff === "inverseSquared" ? "f = f / (clamped * clamped);" : ""}
    let tnx${n} = ${clockwise ? "ny" : "-ny"};
    let tny${n} = ${clockwise ? "-nx" : "nx"};
    vx[index] = vx[index] + tnx * f * uniforms.dt;
    vy[index] = vy[index] + tny * f * uniforms.dt;
`;
    if (radius != null) {
      code += `    let error${n} = ${radius} - dist;
    let correction${n} = error * ${stiffness};
    vx[index] = vx[index] + nx * correction * uniforms.dt;
    vy[index] = vy[index] + ny * correction * uniforms.dt;
`;
    }
    code += "  } else {\n";
    if (radius != null) {
      code += `    vy[index] = vy[index] - ${radius} * ${stiffness} * uniforms.dt;\n`;
    }
    code += "  }\n";

    return code;
  },
};
