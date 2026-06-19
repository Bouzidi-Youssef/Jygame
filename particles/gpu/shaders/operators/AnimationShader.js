import { uid } from "../wgslUtils.js";

export const AnimationShader = {
  type: "animation",

  emit(descriptor) {
    const kfs = descriptor.keyframes;
    const prop = descriptor.property;
    if (!kfs || kfs.length < 2) return "";
    const n = uid();

    let code = `  let age${n} = ageRatio[index];\n`;
    code += `  var seg${n} = 0u;\n`;
    for (let i = 0; i < kfs.length - 1; i++) {
      code += `  if (age${n} >= ${kfs[i + 1][0]}) { seg${n} = ${i + 1}u; }\n`;
    }

    code += `  if (seg${n} >= ${kfs.length - 1}u) {\n`;
    code += `    particles.${prop}[index] = ${kfs[kfs.length - 1][1]};\n`;
    code += "  } else {\n";

    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i];
      const b = kfs[i + 1];
      const segLen = b[0] - a[0];
      code += `  if (seg${n} == ${i}u) {\n`;
      code += `    let segT${n}_${i} = ${segLen > 0 ? `(age${n} - ${a[0]}) / ${segLen}` : "0.0"};\n`;

      const easing = descriptor.easing;
      let easedExpr = `segT${n}_${i}`;
      if (easing === "quadIn") easedExpr = `segT${n}_${i} * segT${n}_${i}`;
      else if (easing === "quadOut") easedExpr = `segT${n}_${i} * (2.0 - segT${n}_${i})`;
      else if (easing === "quadInOut") easedExpr = `select(1.0 - 2.0 * (1.0 - segT${n}_${i}) * (1.0 - segT${n}_${i}), 2.0 * segT${n}_${i} * segT${n}_${i}, segT${n}_${i} < 0.5)`;

      code += `    let eased${n}_${i} = ${easedExpr};\n`;
      code += `    particles.${prop}[index] = ${a[1]} + (${b[1]} - ${a[1]}) * eased${n}_${i};\n`;
      code += "  }\n";
    }

    code += "  }\n";
    return code;
  },
};
