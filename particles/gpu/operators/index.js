import { FadeOperator } from "./FadeOperator.js";
import { ScaleOperator } from "./ScaleOperator.js";
import { VelocityOperator } from "./VelocityOperator.js";
import { RotationOperator } from "./RotationOperator.js";
import { ForceOperator } from "./ForceOperator.js";
import { AttractionOperator } from "./AttractionOperator.js";
import { OrbitOperator } from "./OrbitOperator.js";
import { WindOperator } from "./WindOperator.js";
import { TurbulenceOperator } from "./TurbulenceOperator.js";
import { ColorOperator } from "./ColorOperator.js";
import { AnimationOperator } from "./AnimationOperator.js";

const OPERATOR_MAP = new Map();

const OPERATORS = [
  FadeOperator, ScaleOperator, VelocityOperator, RotationOperator,
  ForceOperator, AttractionOperator, OrbitOperator, WindOperator,
  TurbulenceOperator, ColorOperator, AnimationOperator,
];

for (const op of OPERATORS) {
  OPERATOR_MAP.set(op.type, op);
}

export function getOperator(type) {
  const op = OPERATOR_MAP.get(type);
  if (!op) throw new Error(`Unknown operator type: "${type}"`);
  return op;
}

export { OPERATORS, OPERATOR_MAP };
