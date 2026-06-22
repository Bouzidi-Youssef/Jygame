import { TestRunner } from "../../testing/TestRunner.js";
import { WgslGenerator } from "../../gpu/WgslGenerator.js";
import { ModifierCompiler } from "../../gpu/ModifierCompiler.js";
import { toWebGpuWgsl } from "../../gpu/webgpu/WebGpuWgslConverter.js";

const runner = new TestRunner();
const compiler = new ModifierCompiler();
const generator = new WgslGenerator();

function compileDescriptors(descriptors) {
  const program = compiler.compile(descriptors);
  return generator.generate(program);
}

runner.describe("WGSL struct declaration", () => {
  const gpuProgram = compileDescriptors([
    { type: "fade", mode: "out", easing: "linear" },
  ]);
  const wgsl = gpuProgram.shaderSource;

  runner.it("contains ParticleData struct", () => {
    runner.assert(wgsl.includes("struct ParticleData"), "Missing ParticleData struct");
  });

  runner.it("contains SimUniforms struct", () => {
    runner.assert(wgsl.includes("struct SimUniforms"), "Missing SimUniforms struct");
  });

  runner.it("contains binding declarations", () => {
    runner.assert(wgsl.includes("@group(0) @binding(0)"), "Missing binding 0");
    runner.assert(wgsl.includes("@group(0) @binding(1)"), "Missing binding 1");
    runner.assert(wgsl.includes("var<storage, read_write>"), "Missing storage binding");
    runner.assert(wgsl.includes("var<uniform>"), "Missing uniform binding");
  });

  runner.it("contains workgroup size", () => {
    runner.assert(wgsl.includes("@compute @workgroup_size(64)"), "Missing or wrong workgroup size");
  });

  runner.it("contains particleCount guard", () => {
    runner.assert(wgsl.includes("particleCount"), "Missing particleCount guard");
  });
});

runner.describe("WGSL base integration", () => {
  runner.it("WebGPU converted WGSL contains life decrement", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
    ]);
    const computeWgsl = toWebGpuWgsl(gpuProgram.shaderSource);

    runner.assert(computeWgsl.includes("life[index]") || computeWgsl.includes(".life"), "Missing life reference in compute WGSL");
    runner.assert(computeWgsl.includes("ageRatio"), "Missing ageRatio in compute WGSL");
    runner.assert(computeWgsl.includes("base physics integration"), "Missing base physics comment");
  });

  runner.it("base integration appears exactly once", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
      { type: "velocity", drag: 0.5 },
      { type: "force", x: 100, y: 200, strength: 50 },
    ]);
    const computeWgsl = toWebGpuWgsl(gpuProgram.shaderSource);
    const baseCount = computeWgsl.match(/base physics integration/g);

    runner.assert(baseCount.length === 1, "Base integration should appear exactly once");
    runner.assert(computeWgsl.includes(".life"), ".life field access should appear in converted WGSL");
  });
});

runner.describe("WGSL per-operator output", () => {
  const opTypes = ["fade", "scale", "velocity", "rotation", "force", "attraction",
    "orbit", "wind", "turbulence", "color", "animation"];

  for (const type of opTypes) {
    runner.it(`${type}: generates valid WGSL output`, () => {
      const desc = { type };
      if (type === "fade") Object.assign(desc, { mode: "out", easing: "linear" });
      if (type === "scale") Object.assign(desc, { from: 1, to: 0.5, easing: "linear" });
      if (type === "velocity") Object.assign(desc, { drag: 0.5 });
      if (type === "rotation") Object.assign(desc, { mode: "interpolate", from: 0, to: 3.14 });
      if (type === "force") Object.assign(desc, { x: 100, y: 200, strength: 50 });
      if (type === "attraction") Object.assign(desc, { x: 160, y: 120, strength: 30 });
      if (type === "orbit") Object.assign(desc, { x: 160, y: 120, strength: 40 });
      if (type === "wind") Object.assign(desc, { x: 20, y: 5 });
      if (type === "turbulence") Object.assign(desc, { strength: 30, frequency: 2 });
      if (type === "color") Object.assign(desc, { from: "#ff0000", to: "#0000ff" });
      if (type === "animation") {
        Object.assign(desc, {
          property: "size",
          keyframes: [[0, 10], [0.5, 30], [1, 5]],
        });
      }

      const gpuProgram = compileDescriptors([desc]);
      const wgsl = gpuProgram.shaderSource;

      runner.assert(wgsl.length > 100, `${type}: WGSL too short`);
      runner.assert(wgsl.includes("fn main"), `${type}: missing main function`);

      const passes = gpuProgram.passes;
      runner.assert(passes.length > 0, `${type}: no passes generated`);
    });
  }
});

runner.describe("WGSL pass classification", () => {
  runner.it("single fade produces visual pass only", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
    ]);
    runner.assert(gpuProgram.passes.includes("visual"), "Missing visual pass");
    runner.assert(!gpuProgram.passes.includes("integration"), "Should not have integration pass");
    runner.assert(!gpuProgram.passes.includes("force"), "Should not have force pass");
  });

  runner.it("velocity produces integration pass", () => {
    const gpuProgram = compileDescriptors([
      { type: "velocity", drag: 0.5 },
    ]);
    runner.assert(gpuProgram.passes.includes("integration"), "Missing integration pass");
  });

  runner.it("force produces force pass", () => {
    const gpuProgram = compileDescriptors([
      { type: "force", x: 100, y: 200, strength: 50 },
    ]);
    runner.assert(gpuProgram.passes.includes("force"), "Missing force pass");
  });

  runner.it("all three passes with mixed modifiers", () => {
    const gpuProgram = compileDescriptors([
      { type: "velocity", drag: 0.5 },
      { type: "force", x: 100, y: 200, strength: 50 },
      { type: "fade", mode: "out", easing: "linear" },
    ]);
    runner.assert(gpuProgram.passes.includes("integration"), "Missing integration");
    runner.assert(gpuProgram.passes.includes("force"), "Missing force");
    runner.assert(gpuProgram.passes.includes("visual"), "Missing visual");
    runner.assertEqual(gpuProgram.passes.length, 3, "Should have exactly 3 passes");
  });
});

runner.describe("WebGPU WGSL converter", () => {
  runner.it("converts struct declaration correctly", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
    ]);
    const computeWgsl = toWebGpuWgsl(gpuProgram.shaderSource);

    runner.assert(computeWgsl.includes("struct Particle {"), "Missing Particle struct");
    runner.assert(computeWgsl.includes("struct ParticleBuffer {"), "Missing ParticleBuffer struct");
    runner.assert(computeWgsl.includes("data: array<Particle>"), "Missing array<Particle>");
    runner.assert(!computeWgsl.includes("x: array<f32>"), "Should not have old array<f32> fields");
  });

  runner.it("converts field access pattern", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
    ]);
    const computeWgsl = toWebGpuWgsl(gpuProgram.shaderSource);

    // Field accesses should use particles.data[index].field
    runner.assert(computeWgsl.includes("particles.data["), "Missing particles.data[] access");
    runner.assert(!computeWgsl.includes("alpha[index]"), "Should not have old alpha[index] access");
  });

  runner.it("injects base integration code", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
    ]);
    const computeWgsl = toWebGpuWgsl(gpuProgram.shaderSource);

    runner.assert(computeWgsl.includes("base physics integration"), "Missing base physics comment");
    runner.assert(computeWgsl.includes(".life"), "Missing .life field access");
    runner.assert(computeWgsl.includes("ageRatio"), "Missing ageRatio reference");
  });

  runner.it("handles AnimationShader particles.field pattern", () => {
    const gpuProgram = compileDescriptors([
      {
        type: "animation",
        property: "size",
        keyframes: [[0, 10], [0.5, 30], [1, 5]],
      },
    ]);
    const computeWgsl = toWebGpuWgsl(gpuProgram.shaderSource);

    // The AnimationShader uses "particles.size[index]" which should become "particles.data[index].size"
    runner.assert(computeWgsl.includes("particles.data["), "Missing particles.data[] after conversion");
    runner.assert(!computeWgsl.includes("particles.size["), "Should not have old particles.size[] pattern");
  });
});

runner.describe("WGSL no duplicates", () => {
  runner.it("no duplicate uniform declarations", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
      { type: "velocity", drag: 0.5 },
    ]);
    const wgsl = gpuProgram.shaderSource;
    const uniformMatches = wgsl.match(/struct SimUniforms/g);
    runner.assertEqual(uniformMatches.length, 1, "SimUniforms defined more than once");
  });

  runner.it("no duplicate binding declarations", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
      { type: "velocity", drag: 0.5 },
    ]);
    const wgsl = gpuProgram.shaderSource;
    const binding0 = wgsl.match(/@group\(0\) @binding\(0\)/g);
    const binding1 = wgsl.match(/@group\(0\) @binding\(1\)/g);
    runner.assertEqual(binding0.length, 1, "Binding 0 appears more than once");
    runner.assertEqual(binding1.length, 1, "Binding 1 appears more than once");
  });

  runner.it("no duplicate struct definitions", () => {
    const gpuProgram = compileDescriptors([
      { type: "fade", mode: "out", easing: "linear" },
      { type: "scale", from: 1, to: 0.5, easing: "linear" },
      { type: "velocity", drag: 0.5 },
    ]);
    const wgsl = gpuProgram.shaderSource;
    const structMatches = wgsl.match(/struct ParticleData/g);
    runner.assertEqual(structMatches.length, 1, "ParticleData defined more than once");
  });
});

export { runner };

if (import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  runner.run().then(() => process.exit(runner.summary() ? 0 : 1));
}
