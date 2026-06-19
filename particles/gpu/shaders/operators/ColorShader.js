import { uid } from "../wgslUtils.js";

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export const ColorShader = {
  type: "color",

  emit(descriptor) {
    const n = uid();
    const steps = descriptor.stops;

    if (steps) {
      let code = `  var seg${n} = 0u;\n`;
      code += `  let age${n} = ageRatio[index];\n`;

      for (let i = 0; i < steps.length - 1; i++) {
        code += `  if (age${n} >= ${steps[i + 1][0]}) { seg${n} = ${i + 1}u; }\n`;
      }

      const last = steps[steps.length - 1];
      const [lr, lg, lb] = hexToRgb(last[1]);
      code += `  if (seg${n} >= ${steps.length - 1}u) {\n`;
      code += `    r[index] = ${lr}u;\n`;
      code += `    g[index] = ${lg}u;\n`;
      code += `    b[index] = ${lb}u;\n`;
      code += "  } else {\n";

      for (let i = 0; i < steps.length - 1; i++) {
        const a = steps[i];
        const b = steps[i + 1];
        const [ar, ag, ab] = hexToRgb(a[1]);
        const [br, bg, bb] = hexToRgb(b[1]);
        const segLen = b[0] - a[0];
        code += `  if (seg${n} == ${i}u) {\n`;
        code += `    let t${n}_${i} = ${segLen > 0 ? `(age${n} - ${a[0]}) / ${segLen}` : "0.0"};\n`;
        code += `    r[index] = u32(${ar} + (${br} - ${ar}) * t${n}_${i});\n`;
        code += `    g[index] = u32(${ag} + (${bg} - ${ag}) * t${n}_${i});\n`;
        code += `    b[index] = u32(${ab} + (${bb} - ${ab}) * t${n}_${i});\n`;
        code += "  }\n";
      }

      code += "  }\n";
      return code;
    }

    const fromHex = descriptor.from || "#ffffff";
    const toHex = descriptor.to || "#000000";
    const [fr, fg, fb] = hexToRgb(fromHex);
    const [tr, tg, tb] = hexToRgb(toHex);

    return `
  let t${n} = ageRatio[index];
  r[index] = u32(${fr} + (${tr} - ${fr}) * t${n});
  g[index] = u32(${fg} + (${tg} - ${fg}) * t${n});
  b[index] = u32(${fb} + (${tb} - ${fb}) * t${n});
`;
  },
};
