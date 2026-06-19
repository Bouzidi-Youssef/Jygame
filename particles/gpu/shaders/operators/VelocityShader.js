import { uid } from "../wgslUtils.js";

export const VelocityShader = {
  type: "velocity",

  emit(descriptor) {
    const drag = descriptor.drag || 0;
    const affectX = descriptor.affectX !== false;
    const affectY = descriptor.affectY !== false;
    const n = uid();
    let body = `  let dragFactor${n} = exp(-${drag} * uniforms.dt);\n`;
    const df = `dragFactor${n}`;
    if (affectX) body += `  vx[index] = vx[index] * ${df};\n`;
    if (affectY) body += `  vy[index] = vy[index] * ${df};\n`;
    return body;
  },
};
