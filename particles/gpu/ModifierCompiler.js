import { GpuProgramDescriptor } from "./GpuProgramDescriptor.js";

const MODIFIER_META = {
  fade:           { pass: "visual",       gpuCompatible: true,  requiresState: false },
  scale:          { pass: "visual",       gpuCompatible: true,  requiresState: false },
  velocity:       { pass: "integration",  gpuCompatible: true,  requiresState: false },
  rotation:       { pass: "integration",  gpuCompatible: true,  requiresState: false },
  force:          { pass: "force",        gpuCompatible: true,  requiresState: false },
  attraction:     { pass: "force",        gpuCompatible: true,  requiresState: false },
  orbit:          { pass: "force",        gpuCompatible: true,  requiresState: false },
  wind:           { pass: "force",        gpuCompatible: true,  requiresState: false },
  turbulence:     { pass: "force",        gpuCompatible: true,  requiresState: true },
  color:          { pass: "visual",       gpuCompatible: true,  requiresState: true },
  animation:      { pass: "visual",       gpuCompatible: true,  requiresState: true },
  animatedSprite: { pass: "visual",       gpuCompatible: false, requiresState: true },
  trail:          { pass: "spawn",        gpuCompatible: false, requiresState: true },
  spawn:          { pass: "spawn",        gpuCompatible: false, requiresState: true },
  collision:      { pass: "collision",    gpuCompatible: false, requiresState: false },
};

const STATE_FIELDS = {
  turbulence:   [{ name: "seed",       type: "float", size: 4 }],
  color:        [{ name: "segment",    type: "int32", size: 4 }],
  animation:    [{ name: "segment",    type: "int32", size: 4 }],
  animatedSprite: [
    { name: "animOffset", type: "int32", size: 4 },
    { name: "prevFrame",  type: "int32", size: 4 },
    { name: "loopCount",  type: "int32", size: 4 },
  ],
};

const PASS_ORDER = ["integration", "force", "visual"];
const GPU_INCOMPATIBLE_REASONS = {
  trail:     "TrailModifier is not GPU compatible (spawns particles, requires CPU path)",
  spawn:     "SpawnModifier is not GPU compatible (spawns particles, requires CPU path)",
  collision: "CollisionModifier is not GPU compatible (requires external collision provider)",
  animatedSprite: "AnimatedSpriteModifier is not GPU compatible (animation callbacks and frame state require CPU path)",
};

export class ModifierCompiler {
  compile(descriptors) {
    if (!Array.isArray(descriptors)) {
      throw new Error("ModifierCompiler.compile(): descriptors must be an array");
    }

    const passes = { integration: [], force: [], visual: [] };

    for (let i = 0; i < descriptors.length; i++) {
      const desc = descriptors[i];
      this._validateDescriptor(desc, i);

      const meta = MODIFIER_META[desc.type];
      passes[meta.pass].push(desc);
    }

    const stateLayout = this._generateStateLayout(descriptors);
    const uniforms = {};

    return new GpuProgramDescriptor({
      integrationPass: passes.integration,
      forcePass: passes.force,
      visualPass: passes.visual,
      stateLayout,
      uniforms,
    });
  }

  _validateDescriptor(desc, index) {
    if (!desc || typeof desc !== "object") {
      throw new Error(
        `ModifierCompiler: descriptor at index ${index} is not a valid object`
      );
    }
    if (!desc.type || typeof desc.type !== "string") {
      throw new Error(
        `ModifierCompiler: descriptor at index ${index} is missing a valid "type" field`
      );
    }

    const meta = MODIFIER_META[desc.type];
    if (!meta) {
      throw new Error(
        `ModifierCompiler: unknown modifier type "${desc.type}" at index ${index}`
      );
    }

    if (!meta.gpuCompatible) {
      const reason = GPU_INCOMPATIBLE_REASONS[desc.type] ||
        `"${desc.type}" is not GPU compatible`;
      throw new Error(`ModifierCompiler: ${reason}`);
    }
  }

  _generateStateLayout(descriptors) {
    const fields = [];
    const seenNames = new Set();
    let offset = 0;

    for (const desc of descriptors) {
      const descFields = STATE_FIELDS[desc.type];
      if (!descFields) continue;

      for (const field of descFields) {
        if (!seenNames.has(field.name)) {
          seenNames.add(field.name);
          fields.push({ name: field.name, type: field.type, offset, size: field.size });
          offset += field.size;
        }
      }
    }

    if (fields.length === 0) return null;

    return {
      fields,
      stride: offset,
    };
  }

  compileFromModifiers(modifiers) {
    const descriptors = [];
    for (const mod of modifiers) {
      if (typeof mod.toDescriptor !== "function") {
        throw new Error(
          `ModifierCompiler: modifier ${mod.constructor ? mod.constructor.name : "unknown"} does not implement toDescriptor()`
        );
      }
      descriptors.push(mod.toDescriptor());
    }
    return this.compile(descriptors);
  }

  static isGpuCompatible(descriptor) {
    const meta = MODIFIER_META[descriptor && descriptor.type];
    return meta ? meta.gpuCompatible : false;
  }

  static getPass(descriptor) {
    const meta = MODIFIER_META[descriptor && descriptor.type];
    return meta ? meta.pass : null;
  }

  static get PASS_ORDER() {
    return PASS_ORDER;
  }
}
