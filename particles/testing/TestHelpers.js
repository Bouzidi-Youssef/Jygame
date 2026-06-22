import { SoAParticleStorage } from "../storage/SoAParticleStorage.js";
import { CpuParticleBackend } from "../backends/CpuParticleBackend.js";
import { GpuParticleBackend } from "../backends/GpuParticleBackend.js";

// Mock renderer that works in Node.js (no WebGL/WebGPU dependency)
export class MockRenderer {
  constructor() {}
  render() {}
  destroy() {}
  get _renderParticle() { return null; }
  set _renderParticle(v) {}
}

// Mock GpuParticleRenderer for environments without WebGL
export class MockGpuParticleRenderer {
  constructor() {}
  render() {}
  destroy() {}
  get _renderParticle() { return null; }
  set _renderParticle(v) {}
}

export function activeCount(backend) {
  return backend._storage.activeCount;
}

export function createCpuBackend(storage) {
  return new CpuParticleBackend({
    storage,
    renderer: new MockRenderer(),
  });
}

export function createOpBackend(storage) {
  return new GpuParticleBackend({
    storage,
    mode: "operator",
    renderer: new MockGpuParticleRenderer(),
  });
}

export function createStorage(capacity = 200) {
  return new SoAParticleStorage({ maxSize: capacity, initialSize: capacity });
}

export function fixedParticle(p) {
  p.x = 50;
  p.y = 100;
  p.vx = 30;
  p.vy = -20;
  p.life = 3;
  p.maxLife = 3;
  p.ageRatio = 0;
  p.size = 20;
  p.alpha = 1;
  p.rotation = 0;
  p.rotationSpeed = 0.5;
  p.depth = 0;
  p.r = 255;
  p.g = 128;
  p.b = 0;
}

export function stepBackend(backend, steps = 5) {
  for (let i = 0; i < steps; i++) {
    backend.update(1 / 60);
  }
}
