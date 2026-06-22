// WASM SIMD Death Sweep Benchmark — v2 (combined compaction)
//
// Compares four paths across particle counts and death rates:
//
//   Path                        | Decrement | Death detect | Compaction
//   ─────────────────────────────┼───────────┼──────────────┼────────────
//   JS full                     | JS scalar | JS scalar    | JS scalar
//   WASM kernel + JS compact    | WASM SIMD | WASM SIMD    | JS scalar
//   WASM full (deathSweepFull)  | WASM SIMD | WASM SIMD    | WASM scalar
//
// All paths operate on identical data and include data-copy overhead
// (life/active arrays are restored from pre-generated samples each iteration).

const SAMPLES = 30;
const WARMUP  = 10;
const DT      = 1 / 60;

// WASM memory layout (byte offsets)
const MAX_CAPACITY =  524288;
const LIFE_OFF     =  0;
const ACTIVE_OFF   =  MAX_CAPACITY * 4;
const DEATH_OFF    =  ACTIVE_OFF + MAX_CAPACITY * 4;  // byte flags (kernel output)
const DEATH_OUT_OFF=  DEATH_OFF  + MAX_CAPACITY;       // int32 array (full output)
const MEM_TOTAL    =  DEATH_OUT_OFF + MAX_CAPACITY * 4;
const MEM_PAGES    =  Math.ceil(MEM_TOTAL / 65536);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JS Implementations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function jsFull(life, active, count, dt) {
  let w = 0, d = 0;
  for (let i = 0; i < count; i++) {
    const s = active[i];
    life[s] -= dt;
    if (life[s] > 0) { active[w++] = s; } else { d++; }
  }
  return { newCount: w, deaths: d };
}

function jsCompact(active, deathFlags, count) {
  let w = 0, d = 0;
  for (let i = 0; i < count; i++) {
    if (deathFlags[i] === 0) { active[w++] = active[i]; } else { d++; }
  }
  return { newCount: w, deaths: d };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Data generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeSamples(count, deathFrac, n) {
  const lives = [], actives = [];
  for (let s = 0; s < n; s++) {
    const l = new Float32Array(count);
    const a = new Int32Array(count);
    for (let i = 0; i < count; i++) { a[i] = i; l[i] = 1 + Math.random() * 5; }
    const kill = Math.floor(count * deathFrac);
    for (let k = 0; k < kill; k++) {
      l[a[Math.floor(Math.random() * count)]] = 0.001;
    }
    lives.push(l); actives.push(a);
  }
  return { lives, actives };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Benchmark runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runBenchmark({ counts = null } = {}) {
  const testCounts     = counts || [10000, 50000, 100000, 250000, 500000];
  const deathFractions = [0.1, 0.5, 0.9];

  // ── Load WASM ──
  const url  = new URL("./death_sweep_simd.wasm", import.meta.url);
  const wasm = await (await fetch(url)).arrayBuffer();
  const memory = new WebAssembly.Memory({ initial: MEM_PAGES, maximum: MEM_PAGES });
  const { instance } = await WebAssembly.instantiate(wasm, { env: { memory } });
  const { deathSweepKernel, deathSweepFull } = instance.exports;

  // JS views into WASM linear memory
  const lifeWasm    = new Float32Array(memory.buffer, LIFE_OFF,     MAX_CAPACITY);
  const activeWasm  = new Int32Array(memory.buffer,   ACTIVE_OFF,   MAX_CAPACITY);
  const deathFlags  = new Uint8Array(memory.buffer,   DEATH_OFF,    MAX_CAPACITY);
  const deathOut    = new Int32Array(memory.buffer,   DEATH_OUT_OFF, MAX_CAPACITY);

  const hdr = "WASM SIMD Death Sweep Benchmark — v2 (combined compaction)";
  console.log("╔" + "═".repeat(hdr.length + 2) + "╗");
  console.log("║ " + hdr + " ║");
  console.log("╚" + "═".repeat(hdr.length + 2) + "╝\n");
  console.log(`Pages: ${MEM_PAGES}  Memory: ${(MEM_TOTAL / 1024 / 1024).toFixed(1)} MB\n`);

  for (const count of testCounts) {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  ${count.toLocaleString()} particles`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    for (const df of deathFractions) {
      const pct = Math.round(df * 100);
      const N   = SAMPLES + WARMUP;
      const { lives, actives } = makeSamples(count, df, N);

      console.log(`  ── ${pct}% Death Rate ──\n`);

      // ── JS full (reference) ──
      let t0 = performance.now();
      for (let s = WARMUP; s < N; s++) jsFull(lives[s], actives[s], count, DT);
      const jsFull_ms = (performance.now() - t0) / SAMPLES;

      // ── WASM kernel + JS compact (two-step) ──
      t0 = performance.now();
      for (let s = WARMUP; s < N; s++) {
        lifeWasm.set(lives[s]); activeWasm.set(actives[s]);
        deathSweepKernel(LIFE_OFF, ACTIVE_OFF, DEATH_OFF, count, DT);
        jsCompact(activeWasm, deathFlags, count);
      }
      const twoStep_ms = (performance.now() - t0) / SAMPLES;

      // ── WASM deathSweepFull (combined) ──
      t0 = performance.now();
      for (let s = WARMUP; s < N; s++) {
        lifeWasm.set(lives[s]); activeWasm.set(actives[s]);
        deathSweepFull(LIFE_OFF, ACTIVE_OFF, count, DT, DEATH_OUT_OFF);
      }
      const full_ms = (performance.now() - t0) / SAMPLES;

      // ── Report ──
      const vsJS    = jsFull_ms / twoStep_ms;
      const vsJS2   = jsFull_ms / full_ms;
      const combinedVsTwoStep = twoStep_ms / full_ms;

      console.log(
        `  JS full (ref):      ${jsFull_ms.toFixed(4).padStart(9)} ms`);
      console.log(
        `  WASM kernel+compact ${twoStep_ms.toFixed(4).padStart(9)} ms` +
        `   ${vsJS.toFixed(2).padStart(5)}× vs JS`);
      console.log(
        `  WASM full (combo)   ${full_ms.toFixed(4).padStart(9)} ms` +
        `   ${vsJS2.toFixed(2).padStart(5)}× vs JS` +
        `   ${combinedVsTwoStep.toFixed(2).padStart(5)}× vs 2-step`);

      // Breakdown
      const saved = twoStep_ms - full_ms;
      const pctSav = (saved / twoStep_ms * 100);
      console.log(`    (2-step minus combo: ${saved.toFixed(3)} ms = ${pctSav.toFixed(1)}% of 2-step)`);
      console.log("");
    }
  }

  console.log("═══ Summary ═══\n");
  console.log("Speedup vs JS full (higher = better at WASM):");
  console.log("  1.0× = same as JS; >1 = WASM faster; <1 = JS faster");
}

export { runBenchmark };
