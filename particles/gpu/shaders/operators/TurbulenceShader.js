import { uid } from "../wgslUtils.js";

export const TurbulenceShader = {
  type: "turbulence",

  emit(descriptor) {
    const strength = descriptor.strength || 50;
    const frequency = descriptor.frequency || 1;
    const n = uid();
    return `
  let seed${n} = f32(index) * 100.0;
  let phase${n} = seed + uniforms.elapsedTime * ${frequency};
  vx[index] = vx[index] + sin(phase) * ${strength} * uniforms.dt;
  vy[index] = vy[index] + cos(phase * 1.31) * ${strength} * uniforms.dt;
`;
  },
};
