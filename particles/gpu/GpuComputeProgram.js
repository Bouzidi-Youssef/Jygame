export class GpuComputeProgram {
  constructor({ shaderSource, bindings, workgroupSize = 64, passes } = {}) {
    this.shaderSource = shaderSource || "";
    this.bindings = bindings || [];
    this.workgroupSize = workgroupSize;
    this.passes = passes || [];
    Object.freeze(this);
  }

  get passCount() {
    return this.passes.length;
  }

  toJSON() {
    return {
      shaderSource: this.shaderSource,
      bindings: this.bindings,
      workgroupSize: this.workgroupSize,
      passes: this.passes,
    };
  }
}
