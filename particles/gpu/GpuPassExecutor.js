import { getOperator } from "./operators/index.js";
import { WgslGenerator } from "./WgslGenerator.js";

export class GpuPassExecutor {
  constructor() {
    this._stateByDesc = new Map();
    this._elapsedTime = 0;
  }

  _getMapFor(descriptor) {
    let byParticle = this._stateByDesc.get(descriptor);
    if (!byParticle) {
      byParticle = new Map();
      this._stateByDesc.set(descriptor, byParticle);
    }
    return byParticle;
  }

  _ensureState(descriptor, particleId) {
    const byParticle = this._getMapFor(descriptor);
    let state = byParticle.get(particleId);
    if (!state) {
      state = {};
      byParticle.set(particleId, state);
    }
    return state;
  }

  ensure(particle, modifier, createFn) {
    const byParticle = this._getMapFor(modifier);
    const id = particle.__jygameId;
    let state = byParticle.get(id);
    if (!state) {
      state = createFn ? createFn() : {};
      byParticle.set(id, state);
    }
    return state;
  }

  get(particle, modifier) {
    const byParticle = this._stateByDesc.get(modifier);
    if (!byParticle) return undefined;
    return byParticle.get(particle.__jygameId);
  }

  runOnEmit(descriptor, view, slotIndex, particle) {
    const op = getOperator(descriptor.type);
    if (op.onEmit) {
      const state = this._ensureState(descriptor, view.id(slotIndex));
      op.onEmit(descriptor, view, slotIndex, state);
    }
  }

  runPass(passDescriptors, view, dt, uniforms, slotIndices, count) {
    const descLen = passDescriptors.length;

    for (let d = 0; d < descLen; d++) {
      const desc = passDescriptors[d];
      const op = getOperator(desc.type);

      for (let j = 0; j < count; j++) {
        const slot = slotIndices[j];
        const pid = view.id(slot);
        const state = this._ensureState(desc, pid);
        op.execute(desc, view, slot, dt, state, uniforms);
      }
    }
  }

  runPassObject(passDescriptors, acc, dt, active) {
    const count = active.length;
    const descLen = passDescriptors.length;

    for (let d = 0; d < descLen; d++) {
      const desc = passDescriptors[d];
      const op = getOperator(desc.type);

      for (let j = 0; j < count; j++) {
        const particle = active[j];
        acc.wrap(particle);
        const state = this._ensureState(desc, particle.__jygameId);
        op.execute(desc, acc, j, dt, state, {});
      }
    }
  }

  beginFrame(passDescriptors, dt, uniforms) {
    for (let d = 0; d < passDescriptors.length; d++) {
      const desc = passDescriptors[d];
      const op = getOperator(desc.type);
      if (op.beginFrame) {
        const frameUniforms = op.beginFrame(desc, dt);
        if (frameUniforms) {
          Object.assign(uniforms, frameUniforms);
        }
      }
    }
  }

  updateTime(dt) {
    this._elapsedTime += dt;
  }

  releaseState(particle) {
    const id = particle.__jygameId;
    for (const byParticle of this._stateByDesc.values()) {
      byParticle.delete(id);
    }
  }

  releaseStateById(id) {
    for (const byParticle of this._stateByDesc.values()) {
      byParticle.delete(id);
    }
  }

  compile(programDescriptor) {
    const gen = new WgslGenerator();
    return gen.generate(programDescriptor);
  }

  releaseAll() {
    this._stateByDesc.clear();
    this._elapsedTime = 0;
  }
}
