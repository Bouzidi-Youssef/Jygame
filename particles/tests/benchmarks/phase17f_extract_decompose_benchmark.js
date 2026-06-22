// Phase 17F-A — Extract Path Attribution
//
// Decomposes Extract into sub-operations to identify the actual bottleneck:
//
//   A — AccessorPath:       storage.getFieldValue(i, fieldName)  (production)
//   B — GetterPath:         active[i].x, .y, ...                (no string lookup)
//   C — DirectIndexPath:    idx = active[i]._i; _x[idx]         (bypass getter)
//   D — PhysicalIndexPath:  idx = physIdx[i];   _x[idx]         (no accessor object)
//   E — RawTypedArrayPath:  _x[i]                                (sequential scan)
//   F — RoundCost:          with/without Math.round on u32 fields
//
// Counts: 10k, 50k, 100k, 250k (low churn only)

import { SoAParticleStorage } from "../../storage/SoAParticleStorage.js";
import { ParticleBufferLayout } from "../../gpu/ParticleBufferLayout.js";

const WARMUP = 5;
const SAMPLES = 30;
const FIELD_NAMES = ParticleBufferLayout.FIELD_NAMES; // 20 fields
const STRIDE = FIELD_NAMES.length;

const U32_FIELDS = new Set(["r","g","b","alive","segment"]);
const U32_INDICES = new Set([14,15,16,17,19]);

function makeStorage(cap) {
  return new SoAParticleStorage({ maxSize: cap, initialSize: cap });
}

function fill(storage, count, lifeMin, lifeMax) {
  for (let i = 0; i < count; i++) {
    const p = storage.acquire();
    p.x = Math.random() * 500;
    p.y = Math.random() * 500;
    p.vx = (Math.random() - 0.5) * 100;
    p.vy = (Math.random() - 0.5) * 100;
    p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
    p.maxLife = p.life;
    p.size = 16;
    p.alpha = 1;
    p.r = (Math.random() * 255) | 0;
    p.g = (Math.random() * 255) | 0;
    p.b = (Math.random() * 255) | 0;
  }
}

function replenish(storage, target, lifeMin, lifeMax) {
  const need = target - storage.activeCount;
  if (need > 0) {
    const batch = Math.min(need, 1000);
    fill(storage, batch, lifeMin, lifeMax);
  }
}

function stepChurn(storage, dt, lifeMin, lifeMax, target) {
  for (const acc of storage.activeParticles) {
    acc.life -= dt;
  }
  let di = 0;
  const accs = storage.activeParticles;
  while (di < accs.length) {
    if (storage.getFieldValue(di, "life") <= 0) storage.release(accs[di]);
    else di++;
  }
  replenish(storage, target, lifeMin, lifeMax);
}

// ─── Path A: AccessorPath ────────────────────────────────────
// Production path: storage.getFieldValue(i, fieldName)
function measureAccessorPath(storage) {
  const count = storage.activeCount;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    for (let f = 0; f < STRIDE; f++) {
      const name = FIELD_NAMES[f];
      let val = storage.getFieldValue(i, name);
      if (U32_FIELDS.has(name)) val = Math.round(val);
      sink ^= ((val * 1000) | 0);
    }
  }
  const t1 = performance.now();
  return { time: t1 - t0, sink };
}

// ─── Path B: GetterPath ──────────────────────────────────────
// Static getter access: active[i].x, active[i].life, etc.
function measureGetterPath(storage) {
  const accs = storage.activeParticles;
  const count = accs.length;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const p = accs[i];
    let v;
    v = p.x;          sink ^= ((v * 1000) | 0);
    v = p.y;          sink ^= ((v * 1000) | 0);
    v = p.vx;         sink ^= ((v * 1000) | 0);
    v = p.vy;         sink ^= ((v * 1000) | 0);
    v = p.ax;         sink ^= ((v * 1000) | 0);
    v = p.ay;         sink ^= ((v * 1000) | 0);
    v = p.life;       sink ^= ((v * 1000) | 0);
    v = p.maxLife;    sink ^= ((v * 1000) | 0);
    v = p.ageRatio;   sink ^= ((v * 1000) | 0);
    v = p.rotation;   sink ^= ((v * 1000) | 0);
    v = p.rotationSpeed; sink ^= ((v * 1000) | 0);
    v = p.size;       sink ^= ((v * 1000) | 0);
    v = p.alpha;      sink ^= ((v * 1000) | 0);
    v = p.depth;      sink ^= ((v * 1000) | 0);
    v = Math.round(p.r);   sink ^= ((v * 1000) | 0);
    v = Math.round(p.g);   sink ^= ((v * 1000) | 0);
    v = Math.round(p.b);   sink ^= ((v * 1000) | 0);
    v = Math.round(p.alive); sink ^= ((v * 1000) | 0);
    v = p.seed;       sink ^= ((v * 1000) | 0);
    v = Math.round(p.segment); sink ^= ((v * 1000) | 0);
  }
  const t1 = performance.now();
  return { time: t1 - t0, sink };
}

// ─── Path C: DirectIndexPath ─────────────────────────────────
// Bypass getter: idx = active[i]._i; _x[idx]
function measureDirectIndexPath(storage) {
  const accs = storage.activeParticles;
  const count = accs.length;
  const _x = storage._x, _y = storage._y, _vx = storage._vx, _vy = storage._vy;
  const _ax = storage._ax, _ay = storage._ay, _life = storage._life;
  const _maxLife = storage._maxLife, _ageRatio = storage._ageRatio;
  const _rotation = storage._rotation, _rotationSpeed = storage._rotationSpeed;
  const _size = storage._size, _alpha = storage._alpha, _depth = storage._depth;
  const _r = storage._r, _g = storage._g, _b = storage._b;
  const _alive = storage._alive, _seed = storage._seed, _segment = storage._segment;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const idx = accs[i]._i;
    let v;
    v = _x[idx];          sink ^= ((v * 1000) | 0);
    v = _y[idx];          sink ^= ((v * 1000) | 0);
    v = _vx[idx];         sink ^= ((v * 1000) | 0);
    v = _vy[idx];         sink ^= ((v * 1000) | 0);
    v = _ax[idx];         sink ^= ((v * 1000) | 0);
    v = _ay[idx];         sink ^= ((v * 1000) | 0);
    v = _life[idx];       sink ^= ((v * 1000) | 0);
    v = _maxLife[idx];    sink ^= ((v * 1000) | 0);
    v = _ageRatio[idx];   sink ^= ((v * 1000) | 0);
    v = _rotation[idx];   sink ^= ((v * 1000) | 0);
    v = _rotationSpeed[idx]; sink ^= ((v * 1000) | 0);
    v = _size[idx];       sink ^= ((v * 1000) | 0);
    v = _alpha[idx];      sink ^= ((v * 1000) | 0);
    v = _depth[idx];      sink ^= ((v * 1000) | 0);
    v = _r[idx];          sink ^= ((v * 1000) | 0);
    v = _g[idx];          sink ^= ((v * 1000) | 0);
    v = _b[idx];          sink ^= ((v * 1000) | 0);
    v = _alive[idx];      sink ^= ((v * 1000) | 0);
    v = _seed[idx];       sink ^= ((v * 1000) | 0);
    v = _segment[idx];    sink ^= ((v * 1000) | 0);
  }
  const t1 = performance.now();
  return { time: t1 - t0, sink };
}

// ─── Path D: PhysicalIndexPath ───────────────────────────────
// Physical index array: physIdx = pre-built; _x[physIdx[i]]
function measurePhysicalIndexPath(storage) {
  const accs = storage.activeParticles;
  const count = accs.length;
  const physIdx = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    physIdx[i] = accs[i]._i;
  }
  const _x = storage._x, _y = storage._y, _vx = storage._vx, _vy = storage._vy;
  const _ax = storage._ax, _ay = storage._ay, _life = storage._life;
  const _maxLife = storage._maxLife, _ageRatio = storage._ageRatio;
  const _rotation = storage._rotation, _rotationSpeed = storage._rotationSpeed;
  const _size = storage._size, _alpha = storage._alpha, _depth = storage._depth;
  const _r = storage._r, _g = storage._g, _b = storage._b;
  const _alive = storage._alive, _seed = storage._seed, _segment = storage._segment;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const idx = physIdx[i];
    let v;
    v = _x[idx];          sink ^= ((v * 1000) | 0);
    v = _y[idx];          sink ^= ((v * 1000) | 0);
    v = _vx[idx];         sink ^= ((v * 1000) | 0);
    v = _vy[idx];         sink ^= ((v * 1000) | 0);
    v = _ax[idx];         sink ^= ((v * 1000) | 0);
    v = _ay[idx];         sink ^= ((v * 1000) | 0);
    v = _life[idx];       sink ^= ((v * 1000) | 0);
    v = _maxLife[idx];    sink ^= ((v * 1000) | 0);
    v = _ageRatio[idx];   sink ^= ((v * 1000) | 0);
    v = _rotation[idx];   sink ^= ((v * 1000) | 0);
    v = _rotationSpeed[idx]; sink ^= ((v * 1000) | 0);
    v = _size[idx];       sink ^= ((v * 1000) | 0);
    v = _alpha[idx];      sink ^= ((v * 1000) | 0);
    v = _depth[idx];      sink ^= ((v * 1000) | 0);
    v = _r[idx];          sink ^= ((v * 1000) | 0);
    v = _g[idx];          sink ^= ((v * 1000) | 0);
    v = _b[idx];          sink ^= ((v * 1000) | 0);
    v = _alive[idx];      sink ^= ((v * 1000) | 0);
    v = _seed[idx];       sink ^= ((v * 1000) | 0);
    v = _segment[idx];    sink ^= ((v * 1000) | 0);
  }
  const t1 = performance.now();
  return { time: t1 - t0, sink };
}

// ─── Path E: RawTypedArrayPath ───────────────────────────────
// Sequential scan: _x[i] (ignores active-to-physical mapping)
function measureRawTypedArrayPath(storage) {
  const count = storage.activeCount;
  const _x = storage._x, _y = storage._y, _vx = storage._vx, _vy = storage._vy;
  const _ax = storage._ax, _ay = storage._ay, _life = storage._life;
  const _maxLife = storage._maxLife, _ageRatio = storage._ageRatio;
  const _rotation = storage._rotation, _rotationSpeed = storage._rotationSpeed;
  const _size = storage._size, _alpha = storage._alpha, _depth = storage._depth;
  const _r = storage._r, _g = storage._g, _b = storage._b;
  const _alive = storage._alive, _seed = storage._seed, _segment = storage._segment;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    let v;
    v = _x[i];        sink ^= ((v * 1000) | 0);
    v = _y[i];        sink ^= ((v * 1000) | 0);
    v = _vx[i];       sink ^= ((v * 1000) | 0);
    v = _vy[i];       sink ^= ((v * 1000) | 0);
    v = _ax[i];       sink ^= ((v * 1000) | 0);
    v = _ay[i];       sink ^= ((v * 1000) | 0);
    v = _life[i];     sink ^= ((v * 1000) | 0);
    v = _maxLife[i];  sink ^= ((v * 1000) | 0);
    v = _ageRatio[i]; sink ^= ((v * 1000) | 0);
    v = _rotation[i]; sink ^= ((v * 1000) | 0);
    v = _rotationSpeed[i]; sink ^= ((v * 1000) | 0);
    v = _size[i];     sink ^= ((v * 1000) | 0);
    v = _alpha[i];    sink ^= ((v * 1000) | 0);
    v = _depth[i];    sink ^= ((v * 1000) | 0);
    v = _r[i];        sink ^= ((v * 1000) | 0);
    v = _g[i];        sink ^= ((v * 1000) | 0);
    v = _b[i];        sink ^= ((v * 1000) | 0);
    v = _alive[i];    sink ^= ((v * 1000) | 0);
    v = _seed[i];     sink ^= ((v * 1000) | 0);
    v = _segment[i];  sink ^= ((v * 1000) | 0);
  }
  const t1 = performance.now();
  return { time: t1 - t0, sink };
}

// ─── Path F: RoundCost ───────────────────────────────────────
// Compare with and without Math.round on u32 fields
function measureRoundCost(storage) {
  const accs = storage.activeParticles;
  const count = accs.length;
  const _r = storage._r, _g = storage._g, _b = storage._b;
  const _alive = storage._alive, _segment = storage._segment;
  let sink = 0;

  // Without round
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const idx = accs[i]._i;
    sink ^= (_r[idx] * 1000) | 0;
    sink ^= (_g[idx] * 1000) | 0;
    sink ^= (_b[idx] * 1000) | 0;
    sink ^= (_alive[idx] * 1000) | 0;
    sink ^= (_segment[idx] * 1000) | 0;
  }
  const t1 = performance.now();
  const withoutRound = t1 - t0;

  // With round (u32 fields need Math.round for Float32Array upload)
  const t2 = performance.now();
  for (let i = 0; i < count; i++) {
    const idx = accs[i]._i;
    sink ^= (Math.round(_r[idx]) * 1000) | 0;
    sink ^= (Math.round(_g[idx]) * 1000) | 0;
    sink ^= (Math.round(_b[idx]) * 1000) | 0;
    sink ^= (Math.round(_alive[idx]) * 1000) | 0;
    sink ^= (Math.round(_segment[idx]) * 1000) | 0;
  }
  const t3 = performance.now();
  const withRound = t3 - t2;

  return { withoutRound, withRound, sink };
}

// ─── Test Runner ─────────────────────────────────────────────

async function measureAll(count) {
  const lo = 3, hi = 8; // low churn only
  const storage = makeStorage(count + 100);
  fill(storage, count, lo, hi);

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    stepChurn(storage, 1/60, lo, hi, count);
  }

  let sumA = 0, sumB = 0, sumC = 0, sumD = 0, sumE = 0;
  let sumF_no = 0, sumF_with = 0;
  let nA = 0, nB = 0, nC = 0, nD = 0, nE = 0, nF = 0;

  for (let s = 0; s < SAMPLES; s++) {
    stepChurn(storage, 1/60, lo, hi, count);
    const pc = storage.activeCount;
    if (pc === 0) { fill(storage, count, lo, hi); continue; }

    // Path A
    const a = measureAccessorPath(storage);
    sumA += a.time; nA++;

    // Path B
    const b = measureGetterPath(storage);
    sumB += b.time; nB++;

    // Path C
    const c = measureDirectIndexPath(storage);
    sumC += c.time; nC++;

    // Path D
    const d = measurePhysicalIndexPath(storage);
    sumD += d.time; nD++;

    // Path E
    const e = measureRawTypedArrayPath(storage);
    sumE += e.time; nE++;

    // Path F
    const f = measureRoundCost(storage);
    sumF_no += f.withoutRound;
    sumF_with += f.withRound;
    nF++;
  }

  storage.destroy();

  const r = (sum, n) => n > 0 ? sum / n : 0;

  return {
    count,
    accessorPath: r(sumA, nA),
    getterPath: r(sumB, nB),
    directIndexPath: r(sumC, nC),
    physicalIndexPath: r(sumD, nD),
    rawTypedArrayPath: r(sumE, nE),
    roundWithout: r(sumF_no, nF),
    roundWith: r(sumF_with, nF),
  };
}

// ─── Main ────────────────────────────────────────────────────

export async function runBenchmark({ counts = null } = {}) {
  const testCounts = counts || [10000, 50000, 100000, 250000];

  console.log("Phase 17F-A — Extract Path Attribution\n");
  console.log("Decomposes Extract into sub-operations to identify bottleneck\n");

  const results = {};

  for (const count of testCounts) {
    console.log(`── ${count.toLocaleString()} particles (low churn) ──\n`);
    const m = await measureAll(count);
    results[count] = m;

    console.log(`  A AccessorPath:        ${m.accessorPath.toFixed(3)}ms  (production: getFieldValue)`);
    console.log(`  B GetterPath:          ${m.getterPath.toFixed(3)}ms  (static getter, no string)`);
    console.log(`  C DirectIndexPath:     ${m.directIndexPath.toFixed(3)}ms  (bypass getter, accessor._i)`);
    console.log(`  D PhysicalIndexPath:   ${m.physicalIndexPath.toFixed(3)}ms  (physIdx array, no accessor)`);
    console.log(`  E RawTypedArrayPath:   ${m.rawTypedArrayPath.toFixed(3)}ms  (sequential _x[i])`);
    console.log(`  F Round w/o:           ${m.roundWithout.toFixed(3)}ms  (5 u32 fields, no round)`);
    console.log(`  F Round with:          ${m.roundWith.toFixed(3)}ms  (5 u32 fields, Math.round)`);
    console.log("");
  }

  // Summary tables
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("ABSOLUTE TIMING (ms)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | A-Accessor | B-Getter  | C-DirectI | D-PhysIdx | E-RawArray | F-roundΔ");
  console.log("─────────┼────────────┼───────────┼───────────┼───────────┼────────────┼──────────");
  for (const count of testCounts) {
    const m = results[count];
    const roundDelta = m.roundWith - m.roundWithout;
    console.log(
      String(count).padStart(7) + " | " +
      m.accessorPath.toFixed(3).padStart(10) + " | " +
      m.getterPath.toFixed(3).padStart(9) + " | " +
      m.directIndexPath.toFixed(3).padStart(9) + " | " +
      m.physicalIndexPath.toFixed(3).padStart(9) + " | " +
      m.rawTypedArrayPath.toFixed(3).padStart(10) + " | " +
      roundDelta.toFixed(3).padStart(8)
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("RELATIVE COST (A = 100%)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | A-Accessor | B-Getter  | C-DirectI | D-PhysIdx | E-RawArray");
  console.log("─────────┼────────────┼───────────┼───────────┼───────────┼────────────");
  for (const count of testCounts) {
    const m = results[count];
    const a = m.accessorPath;
    console.log(
      String(count).padStart(7) + " | " +
      "100.0%".padStart(10) + " | " +
      (m.getterPath / a * 100).toFixed(1).padStart(7) + "%  | " +
      (m.directIndexPath / a * 100).toFixed(1).padStart(7) + "%  | " +
      (m.physicalIndexPath / a * 100).toFixed(1).padStart(7) + "%  | " +
      (m.rawTypedArrayPath / a * 100).toFixed(1).padStart(7) + "%"
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("COST COMPONENT BREAKDOWN");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | StringLook | GetterDisp | AccessorOb | PhysIdxInd | TARRead");
  console.log("─────────┼────────────┼────────────┼────────────┼────────────┼──────────");
  for (const count of testCounts) {
    const m = results[count];
    const a = m.accessorPath;
    const b = m.getterPath;
    const c = m.directIndexPath;
    const d = m.physicalIndexPath;
    const e = m.rawTypedArrayPath;

    // String lookup: A - B
    const stringLookup = a - b;
    // Getter dispatch: B - C
    const getterDisp = b - c;
    // Accessor object access: C - D
    const accessorOb = c - d;
    // Physical index indirection: D - E
    const physIdxInd = d - e;
    // Typed array read baseline: E

    const total = a;
    console.log(
      String(count).padStart(7) + " | " +
      stringLookup.toFixed(3).padStart(10) + " " + (stringLookup/total*100).toFixed(1) + "% | " +
      getterDisp.toFixed(3).padStart(10) + " " + (getterDisp/total*100).toFixed(1) + "% | " +
      accessorOb.toFixed(3).padStart(10) + " " + (accessorOb/total*100).toFixed(1) + "% | " +
      physIdxInd.toFixed(3).padStart(10) + " " + (physIdxInd/total*100).toFixed(1) + "% | " +
      e.toFixed(3).padStart(8) + " " + (e/total*100).toFixed(1) + "%"
    );
  }

  // Round cost breakdown
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("ROUND COST (5 u32 fields per particle)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | Without Round | With Round  | Delta (ms) | Delta (µs/p)");
  console.log("─────────┼───────────────┼─────────────┼────────────┼──────────────");
  for (const count of testCounts) {
    const m = results[count];
    const delta = m.roundWith - m.roundWithout;
    console.log(
      String(count).padStart(7) + " | " +
      m.roundWithout.toFixed(3).padStart(11) + " | " +
      m.roundWith.toFixed(3).padStart(9) + " | " +
      delta.toFixed(3).padStart(10) + " | " +
      (delta / count * 1000).toFixed(3).padStart(12)
    );
  }

  // Per-particle costs
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("PER-PARTICLE COST (µs)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("Count    | Accessor | Getter   | DirectI  | PhysIdx  | RawArray");
  console.log("─────────┼──────────┼──────────┼──────────┼──────────┼──────────");
  for (const count of testCounts) {
    const m = results[count];
    console.log(
      String(count).padStart(7) + " | " +
      (m.accessorPath / count * 1000).toFixed(3).padStart(8) + " | " +
      (m.getterPath / count * 1000).toFixed(3).padStart(8) + " | " +
      (m.directIndexPath / count * 1000).toFixed(3).padStart(8) + " | " +
      (m.physicalIndexPath / count * 1000).toFixed(3).padStart(8) + " | " +
      (m.rawTypedArrayPath / count * 1000).toFixed(3).padStart(8)
    );
  }

  return results;
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}` && process.argv[1] !== "evalmachine.<anonymous>") {
  console.log("Run in a browser with WebGPU support.");
  runBenchmark().catch(console.error);
}
