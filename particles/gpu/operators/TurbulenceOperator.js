export const TurbulenceOperator = {
  type: "turbulence",

  onEmit(descriptor, view, i, state) {
    state.seed = Math.random() * 100000;
  },

  execute(descriptor, view, i, dt, state, uniforms) {
    const seed = state.seed;
    const t = (uniforms && uniforms.time != null) ? uniforms.time : 0;
    const freq = descriptor.frequency || 1;
    const strength = descriptor.strength || 50;
    view.setVx(i, view.vx(i) + Math.sin(seed + t * freq) * strength * dt);
    view.setVy(i, view.vy(i) + Math.cos(seed + t * 1.31 * freq) * strength * dt);
  },
};
