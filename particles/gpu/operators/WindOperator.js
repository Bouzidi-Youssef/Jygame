export const WindOperator = {
  type: "wind",

  beginFrame(descriptor, dt) {
    return {
      frameVX: (descriptor.x || 0) * dt,
      frameVY: (descriptor.y || 0) * dt,
    };
  },

  execute(descriptor, view, i, dt, state, uniforms) {
    const fvx = (uniforms && uniforms.frameVX != null) ? uniforms.frameVX : (descriptor.x || 0) * dt;
    const fvy = (uniforms && uniforms.frameVY != null) ? uniforms.frameVY : (descriptor.y || 0) * dt;
    view.setVx(i, view.vx(i) + fvx);
    view.setVy(i, view.vy(i) + fvy);
  },
};
