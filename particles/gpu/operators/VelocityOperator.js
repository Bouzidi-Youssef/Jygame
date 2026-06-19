export const VelocityOperator = {
  type: "velocity",

  beginFrame(descriptor, dt) {
    return { dragFactor: Math.exp(-(descriptor.drag || 0) * dt) };
  },

  execute(descriptor, view, i, dt, state, uniforms) {
    const factor = (uniforms && uniforms.dragFactor != null) ? uniforms.dragFactor : Math.exp(-(descriptor.drag || 0) * dt);
    if (descriptor.affectX !== false) view.setVx(i, view.vx(i) * factor);
    if (descriptor.affectY !== false) view.setVy(i, view.vy(i) * factor);
  },
};
