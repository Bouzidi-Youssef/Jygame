export const WindShader = {
  type: "wind",

  emit(descriptor) {
    const x = descriptor.x || 0;
    const y = descriptor.y || 0;
    return `  vx[index] = vx[index] + ${x} * uniforms.dt;\n  vy[index] = vy[index] + ${y} * uniforms.dt;\n`;
  },
};
