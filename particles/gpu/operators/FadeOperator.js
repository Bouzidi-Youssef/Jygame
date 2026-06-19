import { EASINGS } from "../../../modifiers/easing.js";

export const FadeOperator = {
  type: "fade",

  execute(descriptor, view, i, dt, state, uniforms) {
    const ease = EASINGS[descriptor.easing] || EASINGS.linear;
    const t = ease(view.ageRatio(i));
    let alpha;
    if (descriptor.mode === "in") {
      alpha = t;
    } else if (descriptor.mode === "in-out") {
      alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
    } else {
      alpha = 1 - t;
    }
    view.setAlpha(i, alpha);
  },
};
