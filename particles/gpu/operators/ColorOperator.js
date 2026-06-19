export const ColorOperator = {
  type: "color",

  onEmit(descriptor, view, i, state) {
    state.segment = 0;
  },

  execute(descriptor, view, i, dt, state, uniforms) {
    const steps = descriptor.stops;
    let seg = state.segment;

    if (steps) {
      while (seg < steps.length - 2 && view.ageRatio(i) >= steps[seg + 1][0]) {
        seg++;
      }
      state.segment = seg;

      if (seg >= steps.length - 1) {
        const last = steps[steps.length - 1];
        view.setR(i, last[1]);
        view.setG(i, last[2]);
        view.setB(i, last[3]);
        return;
      }

      const a = steps[seg];
      const b = steps[seg + 1];
      const segT = b[0] > a[0]
        ? (view.ageRatio(i) - a[0]) / (b[0] - a[0])
        : 0;
      view.setR(i, a[1] + (b[1] - a[1]) * segT);
      view.setG(i, a[2] + (b[2] - a[2]) * segT);
      view.setB(i, a[3] + (b[3] - a[3]) * segT);
    } else {
      const fromHex = descriptor.from || "#ffffff";
      const toHex = descriptor.to || "#000000";
      const fr = parseInt(fromHex.slice(1, 3), 16);
      const fg = parseInt(fromHex.slice(3, 5), 16);
      const fb = parseInt(fromHex.slice(5, 7), 16);
      const tr = parseInt(toHex.slice(1, 3), 16);
      const tg = parseInt(toHex.slice(3, 5), 16);
      const tb = parseInt(toHex.slice(5, 7), 16);
      view.setR(i, fr + (tr - fr) * view.ageRatio(i));
      view.setG(i, fg + (tg - fg) * view.ageRatio(i));
      view.setB(i, fb + (tb - fb) * view.ageRatio(i));
    }
  },
};
