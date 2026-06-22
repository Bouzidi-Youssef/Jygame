import { TestRunner } from "../../testing/TestRunner.js";
import { createCpuBackend, createOpBackend, createStorage, activeCount } from "../../testing/TestHelpers.js";

export const runner = new TestRunner();
const DT = 1 / 60;

function emitOne(backend, life) {
  backend.emitOne((p) => {
    p.x = 100; p.y = 100;
    p.vx = 10; p.vy = -5;
    p.life = life;
    p.maxLife = life;
    p.size = 16;
    p.alpha = 1;
  });
}

runner.describe("Lifecycle parity", () => {
  runner.it("short-lived particles die at the same frame", () => {
    const cpu = createCpuBackend(createStorage(50));
    const op = createOpBackend(createStorage(50));
    emitOne(cpu, 2);
    emitOne(op, 2);

    for (let f = 0; f < 10; f++) {
      cpu.update(DT);
      op.update(DT);
      const cpuCount = activeCount(cpu);
      const opCount = activeCount(op);
      if (cpuCount !== opCount) {
        throw new Error(`Frame ${f}: CPU active=${cpuCount}, Operator active=${opCount}`);
      }
    }
  });

  runner.it("mixed lifetimes remain in sync", () => {
    const cpu = createCpuBackend(createStorage(50));
    const op = createOpBackend(createStorage(50));
    emitOne(cpu, 1);
    emitOne(cpu, 3);
    emitOne(cpu, 5);
    emitOne(op, 1);
    emitOne(op, 3);
    emitOne(op, 5);

    for (let f = 0; f < 10; f++) {
      cpu.update(DT);
      op.update(DT);
      if (activeCount(cpu) !== activeCount(op)) {
        throw new Error(`Frame ${f}: mixed lifetime count mismatch`);
      }
    }
  });

  runner.it("emit after death reuses slots", () => {
    const cpu = createCpuBackend(createStorage(10));
    const op = createOpBackend(createStorage(10));
    emitOne(cpu, 1);
    emitOne(op, 1);

    for (let f = 0; f < 10; f++) {
      cpu.update(DT);
      op.update(DT);
      if (activeCount(cpu) > 0) {
        emitOne(cpu, 1);
      }
      if (activeCount(op) > 0) {
        emitOne(op, 1);
      }
      if (activeCount(cpu) !== activeCount(op)) {
        throw new Error(`Frame ${f}: slot-reuse count mismatch`);
      }
    }
  });
});
