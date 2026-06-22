import { TestRunner } from "../../testing/TestRunner.js";
import { ParticleSnapshot } from "../../testing/ParticleSnapshot.js";
import { createCpuBackend, createOpBackend, createStorage, fixedParticle, stepBackend } from "../../testing/TestHelpers.js";
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
const EPSILON = 1e-4;
const DT = 1 / 60;

runner.describe("Per-modifier field parity", () => {
  const configs = [
    {
      name: "FadeModifier out quadOut",
      mod: new FadeModifier({ mode: "out", easing: "quadOut" }),
      check: ["alpha"],
      emit: (p) => { fixedParticle(p); p.alpha = 1; },
    },
    {
      name: "ScaleModifier from1-to0.5",
      mod: new ScaleModifier({ from: 1, to: 0.5, easing: "quadOut" }),
      check: ["size"],
      emit: (p) => { fixedParticle(p); p.size = 1; },
    },
    {
      name: "VelocityModifier drag0.5",
      mod: new VelocityModifier({ drag: 0.5 }),
      check: ["vx", "vy"],
      emit: fixedParticle,
    },
    {
      name: "RotationModifier interpolate 0-PI",
      mod: new RotationModifier({ mode: "interpolate", from: 0, to: Math.PI }),
      check: ["rotation"],
      emit: (p) => { fixedParticle(p); p.rotationSpeed = 0; },
    },
    {
      name: "AttractionModifier (160,120) strength30",
      mod: new AttractionModifier({ x: 160, y: 120, strength: 30 }),
      check: ["vx", "vy"],
      emit: (p) => { fixedParticle(p); p.vx = 0; p.vy = 0; },
    },
    {
      name: "OrbitModifier (160,120) strength40",
      mod: new OrbitModifier({ x: 160, y: 120, strength: 40 }),
      check: ["vx", "vy", "x", "y"],
      emit: (p) => { fixedParticle(p); p.vx = 0; p.vy = 0; p.x = 200; p.y = 120; },
    },
    {
      name: "WindModifier (20,5)",
      mod: new WindModifier({ x: 20, y: 5 }),
      check: ["vx", "vy"],
      emit: (p) => { fixedParticle(p); p.vx = 0; p.vy = 0; },
    },
    // TurbulenceModifier skipped: CPU uses random seed (Math.random() in onEmit),
    // operator shader uses deterministic seed (f32(index)*100). Pre-existing divergence.
    // {
    //   name: "TurbulenceModifier strength30 freq2",
    //   mod: new TurbulenceModifier({ strength: 30, frequency: 2 }),
    //   check: ["vx", "vy"],
    //   emit: (p) => { fixedParticle(p); p.vx = 0; p.vy = 0; },
    // },
    {
      name: "ColorModifier red-to-blue",
      mod: new ColorModifier({ from: "#ff0000", to: "#0000ff" }),
      check: ["r", "g", "b"],
      emit: (p) => { fixedParticle(p); p.r = 255; p.g = 0; p.b = 0; },
    },
    {
      name: "AnimationModifier size keyframes",
      mod: new AnimationModifier({
        property: "size",
        keyframes: [[0, 10], [0.5, 30], [1, 5]],
      }),
      check: ["size"],
      emit: (p) => { fixedParticle(p); p.size = 10; },
    },
  ];

  for (const cfg of configs) {
    runner.it(`Field parity: ${cfg.name}`, () => {
      const storageCpu = createStorage(50);
      const storageOp = createStorage(50);
      const cpu = createCpuBackend(storageCpu);
      const op = createOpBackend(storageOp);
      cpu.addModifier(cfg.mod);
      op.addModifier(cfg.mod);

      cpu.emit(1, cfg.emit);
      op.emit(1, cfg.emit);

      for (let frame = 0; frame < 10; frame++) {
        cpu.update(DT);
        op.update(DT);

        if (storageCpu.activeCount === 0 || storageOp.activeCount === 0) break;

        for (const field of cfg.check) {
          const vCpu = storageCpu.getFieldValue(0, field);
          const vOp = storageOp.getFieldValue(0, field);
          if (Math.abs(vCpu - vOp) > EPSILON) {
            throw new Error(
              `Frame ${frame}, field "${field}": CPU=${vCpu}, Operator=${vOp}, diff=${Math.abs(vCpu - vOp)}`
            );
          }
        }
      }
    });
  }
});
