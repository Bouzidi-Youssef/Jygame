export const TurbulenceOperator = {
  type: "turbulence",

  onEmit(descriptor, view, i, state) {
    state.seed = Math.random() * 100000;
  },

  execute(descriptor, view, i, dt, state, uniforms) {
    const seed = state.seed;
    const elapsed = (uniforms && uniforms.elapsedTime != null) ? uniforms.elapsedTime : 0;
    const freq = descriptor.frequency || 1;
    const strength = descriptor.strength || 50;
    const t = elapsed * freq;
    view.setVx(i, view.vx(i) + Math.sin(seed + t) * strength * dt);
    view.setVy(i, view.vy(i) + Math.cos(seed + t * 1.31) * strength * dt);
  },
};
