export const RotationOperator = {
  type: "rotation",

  onEmit(descriptor, view, i, state) {
    if (descriptor.randomStart) {
      view.setRotation(i, Math.random() * Math.PI * 2);
    }
    if (descriptor.mode === "velocity") {
      view.setRotationSpeed(i, descriptor.speed);
    }
  },

  execute(descriptor, view, i, dt, state, uniforms) {
    if (descriptor.mode === "interpolate") {
      const from = descriptor.from || 0;
      const to = descriptor.to || 0;
      view.setRotation(i, from + (to - from) * view.ageRatio(i));
    }
  },
};
