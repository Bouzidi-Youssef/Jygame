import { ParticleSnapshot } from "./ParticleSnapshot.js";

export class TestRunner {
  constructor() {
    this._tests = [];
    this._passed = 0;
    this._failed = 0;
    this._skipped = 0;
    this._currentSuite = "";
  }

  describe(name, fn) {
    this._currentSuite = name;
    fn(this);
  }

  it(name, fn) {
    this._tests.push({ suite: this._currentSuite, name, fn, skip: false });
  }

  skip(name, reason) {
    this._tests.push({ suite: this._currentSuite, name, skip: true, reason });
  }

  async run() {
    for (const test of this._tests) {
      if (test.skip) {
        this._skipped++;
        console.log(`  \u23ED ${test.name} (skipped: ${test.reason})`);
        continue;
      }
      try {
        const result = test.fn();
        if (result && typeof result.then === "function") {
          await result;
        }
        this._passed++;
        console.log(`  \u2713 ${test.name}`);
      } catch (e) {
        this._failed++;
        console.log(`  \u2717 ${test.name}`);
        console.log(`      ${e.message}`);
      }
    }
    return this._failed === 0;
  }

  summary() {
    const total = this._passed + this._failed + this._skipped;
    const color = this._failed === 0 ? "\x1b[32m" : "\x1b[31m";
    console.log(`\n${color}${total} tests: ${this._passed} passed, ${this._failed} failed, ${this._skipped} skipped\x1b[0m`);
    return this._failed === 0;
  }

  assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || "AssertEqual failed"}: expected ${expected}, got ${actual}`);
    }
  }

  assertApprox(actual, expected, epsilon = 1e-4, message) {
    if (typeof actual === "number" && typeof expected === "number") {
      if (Math.abs(actual - expected) > epsilon) {
        throw new Error(`${message || "AssertApprox failed"}: expected ${expected} \u00b1 ${epsilon}, got ${actual} (diff=${Math.abs(actual - expected)})`);
      }
    }
  }

  assertSnapshotsEqual(actual, expected, message) {
    if (!ParticleSnapshot.equal(actual, expected)) {
      const diffs = ParticleSnapshot.diff(actual, expected);
      let msg = message || "Snapshot mismatch";
      if (diffs.length > 0) {
        const d = diffs[0];
        msg += `\n  First diff: index=${d.index}, field=${d.field || "N/A"}, expected=${d.expected}, actual=${d.actual}`;
      }
      throw new Error(msg);
    }
  }
}
