export const AnimationOperator = {
  type: "animation",

  onEmit(descriptor, view, i, state) {
    state.segment = 0;
    const kfs = descriptor.keyframes;
    if (kfs && kfs.length > 0) {
      view.set(i, descriptor.property, kfs[0][1]);
    }
  },

  execute(descriptor, view, i, dt, state, uniforms) {
    const kfs = descriptor.keyframes;
    if (!kfs || kfs.length < 2) return;

    const age = view.ageRatio(i);
    let seg = state.segment;

    while (seg < kfs.length - 2 && age >= kfs[seg + 1][0]) {
      seg++;
    }
    state.segment = seg;

    if (seg >= kfs.length - 1) {
      view.set(i, descriptor.property, kfs[kfs.length - 1][1]);
      return;
    }

    const a = kfs[seg];
    const b = kfs[seg + 1];
    const segLen = b[0] - a[0];
    const t = segLen > 0 ? (age - a[0]) / segLen : 0;

    const easing = descriptor.easing;
    const eased = easing === "quadIn" ? t * t
      : easing === "quadOut" ? t * (2 - t)
      : easing === "quadInOut" ? (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))
      : t;

    view.set(i, descriptor.property, a[1] + (b[1] - a[1]) * eased);
  },
};
