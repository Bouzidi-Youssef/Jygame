import { ParticleBufferLayout } from "./ParticleBufferLayout.js";
import { wgslType } from "./shaders/wgslUtils.js";

export class GpuBufferLayout {
  constructor() {
    this._bindings = [];
    this._fields = [];
    this._frozen = false;
  }

  addField(name, binding) {
    if (this._frozen) throw new Error("GpuBufferLayout is frozen");
    if (!ParticleBufferLayout.isValidField(name)) {
      throw new Error(`Unknown field: "${name}"`);
    }
    this._fields.push({ name, binding });
    return this;
  }

  addAllFields(binding) {
    for (const name of ParticleBufferLayout.FIELD_NAMES) {
      this.addField(name, binding);
    }
    return this;
  }

  freeze() {
    this._frozen = true;
    return this;
  }

  get bindings() {
    return this._bindings;
  }

  get fields() {
    return this._fields;
  }

  toWGSLStruct() {
    let code = "struct ParticleData {\n";
    for (const { name, binding } of this._fields) {
      const type = wgslType(name);
      const arrayType = type === "u32" ? "array<u32>" : "array<f32>";
      code += `  ${name}: ${arrayType},\n`;
    }
    code += "}\n\n";
    return code;
  }

  toBindingsWGSL() {
    let code = "";
    const usedBindings = new Set();
    for (const { name, binding } of this._fields) {
      if (!usedBindings.has(binding)) {
        usedBindings.add(binding);
        code += `@group(0) @binding(${binding}) var<storage, read_write> particles : ParticleData;\n`;
      }
    }
    return code;
  }

  toJSON() {
    return {
      fields: this._fields,
      bindings: [...new Set(this._fields.map(f => f.binding))],
    };
  }
}
