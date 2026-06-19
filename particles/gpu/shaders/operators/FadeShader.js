import { uid } from "../wgslUtils.js";

export const FadeShader = {
  type: "fade",

  emit(descriptor) {
    const mode = descriptor.mode || "out";
    const easing = descriptor.easing || "linear";
    const n = uid();
    let body;
    if (mode === "in") {
      body = "alpha[index] = t;";
    } else if (mode === "in-out") {
      body = "alpha[index] = select(1.0 - t * 2.0, t * 2.0, t < 0.5);";
    } else {
      body = "alpha[index] = 1.0 - t;";
    }
    return `  let t${n} = ease_${easing}(ageRatio[index]);\n  ${body}\n`;
  },

  usesEasing() { return true; },
};
