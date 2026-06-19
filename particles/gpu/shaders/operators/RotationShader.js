import { uid } from "../wgslUtils.js";

export const RotationShader = {
  type: "rotation",

  emit(descriptor) {
    if (descriptor.mode === "interpolate") {
      const from = descriptor.from || 0;
      const to = descriptor.to || 0;
      return `  rotation[index] = ${from} + (${to} - ${from}) * ageRatio[index];\n`;
    }
    return "";
  },
};
