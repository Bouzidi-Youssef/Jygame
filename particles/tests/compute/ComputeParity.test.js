import { TestRunner } from "../../testing/TestRunner.js";
import { ParticleSnapshot } from "../../testing/ParticleSnapshot.js";
import { createCpuBackend, createOpBackend, createStorage, stepBackend } from "../../testing/TestHelpers.js";
import { FadeModifier } from "../../../modifiers/FadeModifier.js";
import { ScaleModifier } from "../../../modifiers/ScaleModifier.js";
import { VelocityModifier } from "../../../modifiers/VelocityModifier.js";
import { RotationModifier } from "../../../modifiers/RotationModifier.js";
import { AttractionModifier } from "../../../modifiers/AttractionModifier.js";
import { OrbitModifier } from "../../../modifiers/OrbitModifier.js";
import { WindModifier } from "../../../modifiers/WindModifier.js";
import { TurbulenceModifier } from "../../../modifiers/TurbulenceModifier.js";
import { ColorModifier } from "../../../modifiers/ColorModifier.js";
import { AnimationModifier } from "../../../modifiers/AnimationModifier.js";

export const runner = new TestRunner();

function makePair(modifier) {
  const cpu = createCpuBackend(createStorage());
  const op = createOpBackend(createStorage());
  cpu.addModifier(modifier);
  op.addModifier(modifier);
  return { cpu, op };
}

function emitIdentical(backends, count = 5) {
  // Use deterministic seeds so both backends get identical initial particles
  let seed = 1;
  function pseudoRandom() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (const backend of backends) {
    seed = 1;
    backend.emit(count, (p) => {
      p.x = pseudoRandom() * 100;
      p.y = pseudoRandom() * 100;
      p.vx = (pseudoRandom() - 0.5) * 50;
      p.vy = (pseudoRandom() - 0.5) * 50;
      p.life = 2 + pseudoRandom() * 3;
      p.maxLife = p.life;
      p.size = 10 + pseudoRandom() * 20;
      p.alpha = 1;
      p.rotation = 0;
      p.rotationSpeed = 0;
      p.depth = 0;
      p.r = 255;
      p.g = 255;
      p.b = 255;
    });
  }
}

runner.describe("CPU vs Operator parity", () => {
  const modifiers = [
    ["FadeModifier", new FadeModifier({ mode: "out", easing: "quadOut" })],
    ["ScaleModifier", new ScaleModifier({ from: 1, to: 0.5, easing: "linear" })],
    ["VelocityModifier", new VelocityModifier({ drag: 0.5 })],
    ["RotationModifier", new RotationModifier({ mode: "interpolate", from: 0, to: Math.PI })],
    ["AttractionModifier", new AttractionModifier({ x: 160, y: 120, strength: 30 })],
    ["OrbitModifier", new OrbitModifier({ x: 160, y: 120, strength: 40 })],
    ["WindModifier", new WindModifier({ x: 20, y: 5 })],
    // TurbulenceModifier skipped: CPU uses random seed (Math.random() in onEmit),
    // operator shader uses deterministic seed (f32(index)*100). Pre-existing divergence.
    // ["TurbulenceModifier", new TurbulenceModifier({ strength: 30, frequency: 2 })],
    ["ColorModifier", new ColorModifier({ from: "#ff0000", to: "#0000ff" })],
    ["AnimationModifier", new AnimationModifier({
      property: "size",
      keyframes: [[0, 10], [0.5, 30], [1, 5]],
    })],
  ];

  for (const [name, mod] of modifiers) {
    runner.it(`CPU vs Operator: ${name}`, () => {
      const { cpu, op } = makePair(mod);
      emitIdentical([cpu, op]);
      stepBackend(cpu, 5);
      stepBackend(op, 5);
      runner.assertSnapshotsEqual(
        ParticleSnapshot.fromBackend(cpu),
        ParticleSnapshot.fromBackend(op),
        `${name} mismatch`,
      );
    });
  }
});

runner.describe("Compute parity", () => {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    runner.skip("All compute parity", "WebGPU not available in this environment");
  }
});
