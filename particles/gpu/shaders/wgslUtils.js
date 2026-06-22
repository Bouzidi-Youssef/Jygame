let _uid = 0;

export function uid() { return _uid++; }
export function resetUid() { _uid = 0; }

export function wgslType(fieldName) {
  if (fieldName === "r" || fieldName === "g" || fieldName === "b" || fieldName === "alive" || fieldName === "segment") return "u32";
  return "f32";
}

export function easingFunctions(desired) {
  const set = new Set(desired);
  let code = "";

  if (set.has("linear") || set.size === 0) {
    code += "fn ease_linear(t: f32) -> f32 { return t; }\n";
  }
  if (set.has("quadIn")) {
    code += "fn ease_quadIn(t: f32) -> f32 { return t * t; }\n";
  }
  if (set.has("quadOut")) {
    code += "fn ease_quadOut(t: f32) -> f32 { return t * (2.0 - t); }\n";
  }
  if (set.has("quadInOut")) {
    code += "fn ease_quadInOut(t: f32) -> f32 { return select(1.0 - 2.0 * (1.0 - t) * (1.0 - t), 2.0 * t * t, t < 0.5); }\n";
  }
  if (set.has("easeIn")) {
    code += "fn ease_easeIn(t: f32) -> f32 { return t * t; }\n";
  }
  if (set.has("easeOut")) {
    code += "fn ease_easeOut(t: f32) -> f32 { return t * (2.0 - t); }\n";
  }
  if (set.has("easeInOut")) {
    code += "fn ease_easeInOut(t: f32) -> f32 { return select(1.0 - 2.0 * (1.0 - t) * (1.0 - t), 2.0 * t * t, t < 0.5); }\n";
  }

  return code;
}
