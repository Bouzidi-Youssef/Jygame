import { uid } from "../wgslUtils.js";

export const ScaleShader = {
  type: "scale",

  emit(descriptor) {
    const n = uid();
    const easing = descriptor.easing || "linear";
    let body;
    if (descriptor.mode === "in-out") {
      const min = descriptor.min != null ? descriptor.min : 0;
      const max = descriptor.max != null ? descriptor.max : 1;
      body = `size[index] = max(0.0, select(${min} + (${max} - ${min}) * (1.0 - t${n}) * 2.0, ${min} + (${max} - ${min}) * t${n} * 2.0, t${n} < 0.5));`;
    } else {
      const from = descriptor.from != null ? descriptor.from : 1;
      const to = descriptor.to != null ? descriptor.to : 0;
      body = `size[index] = max(0.0, ${from} + (${to} - ${from}) * t${n});`;
    }
    return `  let t${n} = ease_${easing}(ageRatio[index]);\n  ${body}\n`;
  },

  usesEasing() { return true; },
};
