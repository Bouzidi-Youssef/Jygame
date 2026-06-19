import { EASINGS } from "../../../modifiers/easing.js";

export const ScaleOperator = {
  type: "scale",

  execute(descriptor, view, i, dt, state, uniforms) {
    const ease = EASINGS[descriptor.easing] || EASINGS.linear;
    const t = ease(view.ageRatio(i));
    let size;
    if (descriptor.mode === "in-out") {
      const min = descriptor.min != null ? descriptor.min : 0;
      const max = descriptor.max != null ? descriptor.max : 1;
      size = t < 0.5
        ? min + (max - min) * t * 2
        : min + (max - min) * (1 - t) * 2;
    } else {
      const from = descriptor.from != null ? descriptor.from : 1;
      const to = descriptor.to != null ? descriptor.to : 0;
      size = from + (to - from) * t;
    }
    view.setSize(i, Math.max(0, size));
  },
};
