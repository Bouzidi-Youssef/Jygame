import { FadeShader } from "./FadeShader.js";
import { ScaleShader } from "./ScaleShader.js";
import { VelocityShader } from "./VelocityShader.js";
import { RotationShader } from "./RotationShader.js";
import { ForceShader } from "./ForceShader.js";
import { AttractionShader } from "./AttractionShader.js";
import { OrbitShader } from "./OrbitShader.js";
import { WindShader } from "./WindShader.js";
import { TurbulenceShader } from "./TurbulenceShader.js";
import { ColorShader } from "./ColorShader.js";
import { AnimationShader } from "./AnimationShader.js";

const SHADER_MAP = new Map();

const SHADERS = [
  FadeShader, ScaleShader, VelocityShader, RotationShader,
  ForceShader, AttractionShader, OrbitShader, WindShader,
  TurbulenceShader, ColorShader, AnimationShader,
];

for (const s of SHADERS) {
  SHADER_MAP.set(s.type, s);
}

export function getShaderOperator(type) {
  const op = SHADER_MAP.get(type);
  if (!op) throw new Error(`Unknown shader operator type: "${type}"`);
  return op;
}

export { SHADERS, SHADER_MAP };
