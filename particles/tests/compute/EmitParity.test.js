import { TestRunner } from "../../testing/TestRunner.js";
import { createCpuBackend, createOpBackend, createStorage, stepBackend, activeCount } from "../../testing/TestHelpers.js";

export const runner = new TestRunner();

runner.describe("Emit parity", () => {
  runner.it("emit count matches between CPU and Operator", () => {
    const cpu = createCpuBackend(createStorage());
    const op = createOpBackend(createStorage());
    cpu.emit(10, (p) => { p.life = 5; p.maxLife = 5; });
    op.emit(10, (p) => { p.life = 5; p.maxLife = 5; });
    stepBackend(cpu, 3);
    stepBackend(op, 3);
    if (activeCount(cpu) !== activeCount(op)) {
      throw new Error(`Active count mismatch: CPU=${activeCount(cpu)}, Operator=${activeCount(op)}`);
    }
  });

  runner.it("emitOne returns correct particle state", () => {
    const cpu = createCpuBackend(createStorage());
    const op = createOpBackend(createStorage());
    const pCpu = cpu.emitOne((p) => { p.x = 42; p.y = 99; p.life = 3; p.maxLife = 3; });
    const pOp = op.emitOne((p) => { p.x = 42; p.y = 99; p.life = 3; p.maxLife = 3; });
    if (pCpu.x !== 42 || pOp.y !== 99) throw new Error("CPU emitOne mismatch");
    if (pOp.x !== 42 || pOp.y !== 99) throw new Error("Operator emitOne mismatch");
    stepBackend(cpu, 2);
    stepBackend(op, 2);
    if (activeCount(cpu) !== activeCount(op)) {
      throw new Error("emitOne count mismatch after frames");
    }
  });

  runner.it("multiple emit calls accumulate correctly", () => {
    const cpu = createCpuBackend(createStorage(200));
    const op = createOpBackend(createStorage(200));
    cpu.emit(5, (p) => { p.life = 10; p.maxLife = 10; });
    op.emit(5, (p) => { p.life = 10; p.maxLife = 10; });
    cpu.emit(7, (p) => { p.life = 10; p.maxLife = 10; });
    op.emit(7, (p) => { p.life = 10; p.maxLife = 10; });
    stepBackend(cpu, 2);
    stepBackend(op, 2);
    if (activeCount(cpu) !== activeCount(op)) {
      throw new Error("Multi-emit count mismatch");
    }
  });
});
