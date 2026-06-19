import { GpuBufferLayout } from "./GpuBufferLayout.js";
import { GpuComputeProgram } from "./GpuComputeProgram.js";
import { getShaderOperator } from "./shaders/operators/index.js";
import { easingFunctions, resetUid } from "./shaders/wgslUtils.js";

export class WgslGenerator {
  generate(programDescriptor) {
    resetUid();

    const passes = [
      { name: "integration", descriptors: programDescriptor.integrationPass },
      { name: "force", descriptors: programDescriptor.forcePass },
      { name: "visual", descriptors: programDescriptor.visualPass },
    ].filter(p => p.descriptors.length > 0);

    const allDescriptors = [];
    for (const pass of passes) {
      for (const desc of pass.descriptors) {
        allDescriptors.push(desc);
      }
    }

    const bufferLayout = new GpuBufferLayout();
    bufferLayout.addAllFields(0).freeze();

    const usedEasings = new Set();
    for (const desc of allDescriptors) {
      if (desc.easing) usedEasings.add(desc.easing);
    }

    let source = "";

    source += bufferLayout.toWGSLStruct();

    source += "struct SimUniforms {\n";
    source += "  dt: f32,\n";
    source += "  elapsedTime: f32,\n";
    source += "  particleCount: u32,\n";
    source += "}\n\n";

    source += "@group(0) @binding(0) var<storage, read_write> particles : ParticleData;\n";
    source += "@group(0) @binding(1) var<uniform> uniforms : SimUniforms;\n\n";

    source += easingFunctions([...usedEasings]);
    source += "\n";

    source += "@compute @workgroup_size(64)\n";
    source += "fn main(@builtin(global_invocation_id) id: vec3<u32>) {\n";
    source += "  let index = id.x;\n";
    source += "  if (index >= uniforms.particleCount) { return; }\n\n";

    for (const pass of passes) {
      source += `  // === ${pass.name} pass ===\n`;
      for (const desc of pass.descriptors) {
        const shaderOp = getShaderOperator(desc.type);
        source += shaderOp.emit(desc);
        source += "\n";
      }
    }

    source += "}\n";

    const bindings = bufferLayout.toJSON().bindings;

    return new GpuComputeProgram({
      shaderSource: source,
      bindings,
      workgroupSize: 64,
      passes: passes.map(p => p.name),
    });
  }
}
