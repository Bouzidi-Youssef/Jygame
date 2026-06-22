const FIELD_NAMES = [
  "x", "y", "vx", "vy", "ax", "ay",
  "life", "maxLife", "ageRatio",
  "rotation", "rotationSpeed",
  "size", "alpha", "depth",
  "r", "g", "b",
  "alive",
  "seed",
  "segment",
];

const FIELD_SET = new Set(FIELD_NAMES);

function wgslType(name) {
  if (name === "r" || name === "g" || name === "b" || name === "alive" || name === "segment") return "u32";
  return "f32";
}

const BASE_INTEGRATION_WGSL = `
  // base physics integration
  vx[index] = vx[index] + ax[index] * uniforms.dt;
  vy[index] = vy[index] + ay[index] * uniforms.dt;
  x[index] = x[index] + vx[index] * uniforms.dt;
  y[index] = y[index] + vy[index] * uniforms.dt;
  rotation[index] = rotation[index] + rotationSpeed[index] * uniforms.dt;
  life[index] = life[index] - uniforms.dt;
  if (maxLife[index] > 0.0) {
    ageRatio[index] = clamp(1.0 - life[index] / maxLife[index], 0.0, 1.0);
  } else {
    ageRatio[index] = 0.0;
  }
  if (life[index] <= 0.0) {
    alive[index] = 0u;
  }

`;

export function toWebGpuWgsl(wgsl) {
  let result = "struct Particle {\n";
  for (const name of FIELD_NAMES) {
    const type = wgslType(name);
    result += `  ${name}: ${type},\n`;
  }
  result += "}\n\n";

  result += "struct ParticleBuffer {\n";
  result += "  data: array<Particle>,\n";
  result += "}\n\n";

  result += "struct SimUniforms {\n";
  result += "  dt: f32,\n";
  result += "  elapsedTime: f32,\n";
  result += "  particleCount: u32,\n";
  result += "}\n\n";

  result += "@group(0) @binding(0) var<storage, read_write> particles : ParticleBuffer;\n";
  result += "@group(0) @binding(1) var<uniform> uniforms : SimUniforms;\n\n";

  const computePos = wgsl.indexOf("@compute");
  if (computePos === -1) return result;

  const beforeCompute = wgsl.slice(0, computePos);
  const lastBindingEnd = beforeCompute.lastIndexOf("SimUniforms;");
  if (lastBindingEnd !== -1) {
    const afterBindings = beforeCompute.slice(lastBindingEnd + "SimUniforms;".length);
    const trimmed = afterBindings.trim();
    if (trimmed) {
      result += trimmed + "\n\n";
    }
  }

  const body = wgsl.slice(computePos);

  let transformedBody = body.replace(
    /\/\/ === \w+ pass ===/,
    `${BASE_INTEGRATION_WGSL}  $&`,
  );

  transformedBody = transformedBody.replace(
    /particles\.(\w+)\[(\w+)\]/g,
    (_, field, idx) => {
      if (FIELD_SET.has(field)) {
        return `particles.data[${idx}].${field}`;
      }
      return `particles.${field}[${idx}]`;
    },
  );

  transformedBody = transformedBody.replace(
    /(\w+)\[(\w+)\]/g,
    (match, field, idx) => {
      if (FIELD_SET.has(field)) {
        return `particles.data[${idx}].${field}`;
      }
      return match;
    },
  );

  result += transformedBody;
  return result;
}
