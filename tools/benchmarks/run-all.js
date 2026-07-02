import { divider, startCollecting, stopCollecting, getResults, setBenchmarkSource } from "./runner.js";
import { setCsvExport, writeCsv } from "./runner.js";
import { saveSnapshot, loadSnapshot, compareResults, printComparison, listSnapshots } from "./snapshot.js";

const DEFAULTS = {
  iterations: 100,
  warmup: 20,
  maxEntities: 100000,
  benchmarks: ["movement", "collision", "render", "trail", "world", "query", "memory", "allocation"],  // add "scenes"/"streaming" manually or use --scenes/--streaming
  csv: "",
  snapshot: "",
  compare: "",
  regressionThreshold: 10,
  list: false,
};

const config = { ...DEFAULTS };

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith("--iterations=")) config.iterations = parseInt(arg.split("=")[1], 10);
  else if (arg.startsWith("--warmup=")) config.warmup = parseInt(arg.split("=")[1], 10);
  else if (arg.startsWith("--max-entities=")) config.maxEntities = parseInt(arg.split("=")[1], 10);
  else if (arg.startsWith("--csv=")) config.csv = arg.split("=")[1];
  else if (arg.startsWith("--snapshot=")) config.snapshot = arg.split("=")[1];
  else if (arg.startsWith("--compare=")) config.compare = arg.split("=")[1];
  else if (arg.startsWith("--regression=")) config.regressionThreshold = parseFloat(arg.split("=")[1]);
  else if (arg === "--list-snapshots") config.list = true;
  else if (arg === "--movement") config.benchmarks = ["movement"];
  else if (arg === "--collision") config.benchmarks = ["collision"];
  else if (arg === "--render") config.benchmarks = ["render"];
  else if (arg === "--trail") config.benchmarks = ["trail"];
  else if (arg === "--world") config.benchmarks = ["world"];
  else if (arg === "--query") config.benchmarks = ["query"];
  else if (arg === "--memory") config.benchmarks = ["memory"];
  else if (arg === "--allocation") config.benchmarks = ["allocation"];
  else if (arg === "--deep") config.benchmarks = ["deep"];
  else if (arg === "--full-frame") config.benchmarks = ["full-frame"];
  else if (arg === "--mixed-archetype") config.benchmarks = ["mixed-archetype"];
  else if (arg === "--spatial-density") config.benchmarks = ["spatial-density"];
  else if (arg === "--camera-cull") config.benchmarks = ["camera-cull"];
  else if (arg === "--stability") config.benchmarks = ["stability"];
  else if (arg === "--entity-churn") config.benchmarks = ["entity-churn"];
  else if (arg === "--events") config.benchmarks = ["events"];
  else if (arg === "--prefab") config.benchmarks = ["prefab"];
  else if (arg === "--serialization") config.benchmarks = ["serialization"];
  else if (arg === "--scenes") config.benchmarks = ["scenes"];
  else if (arg === "--hierarchy") config.benchmarks = ["hierarchy"];
  else if (arg === "--streaming") config.benchmarks = ["streaming"];
  else if (arg === "--phase26") config.benchmarks = ["full-frame", "mixed-archetype", "spatial-density", "camera-cull", "entity-churn"];
  else if (arg === "--phase28") config.benchmarks = ["events"];
  else if (arg === "--phase29") config.benchmarks = ["prefab"];
  else if (arg === "--phase30") config.benchmarks = ["serialization"];
  else if (arg === "--phase31") config.benchmarks = ["scenes"];
  else if (arg === "--phase33") config.benchmarks = ["streaming"];
  else if (arg === "--new") config.benchmarks = ["full-frame", "mixed-archetype", "spatial-density", "camera-cull", "stability", "entity-churn"];
  else if (arg === "--all") config.benchmarks = [
    "movement", "collision", "render", "trail", "world", "query", "memory", "allocation", "deep",
    "full-frame", "mixed-archetype", "spatial-density", "camera-cull", "stability", "entity-churn",
    "events", "prefab", "serialization", "scenes", "hierarchy", "streaming",
  ];
}

if (config.list) {
  const snaps = listSnapshots();
  if (snaps.length === 0) {
    console.log("No snapshots found.");
  } else {
    console.log("Available snapshots:");
    for (const s of snaps) {
      console.log(`  ${s.file}  (${s.date})  ${s.results} results  node ${s.node}`);
    }
  }
  process.exit(0);
}

if (config.csv) {
  setCsvExport(config.csv);
}

console.log("Jygame Benchmark Suite — Phase 26");
console.log(`Config: iterations=${config.iterations}, warmup=${config.warmup}, maxEntities=${config.maxEntities}`);
console.log(`Benchmarks: ${config.benchmarks.join(", ")}`);
if (config.csv) console.log(`CSV export: ${config.csv}`);
if (config.snapshot) console.log(`Snapshot: ${config.snapshot}`);
if (config.compare) console.log(`Compare: ${config.compare}`);
console.log("");

startCollecting();

for (const name of config.benchmarks) {
  setBenchmarkSource(name);
  const mod = await import(`./${name}.js`);
  mod.run(config);
}
setBenchmarkSource(null);

const results = stopCollecting();

if (config.csv) {
  writeCsv();
  console.log(`Wrote CSV to ${config.csv}`);
}

if (config.snapshot) {
  const filePath = saveSnapshot(results, config.snapshot);
  console.log(`\nSaved snapshot to ${filePath} (${results.length} results).`);
}

if (config.compare) {
  try {
    const baseline = loadSnapshot(config.compare);
    const diffs = compareResults(results, baseline, config.regressionThreshold);
    const summary = printComparison(diffs, config.regressionThreshold);

    if (summary.regressions > 0 && !config.snapshot) {
      console.log(`\n  To update the baseline: run with --snapshot=${config.compare}`);
    }
  } catch (err) {
    console.error(`\n  Error loading snapshot '${config.compare}': ${err.message}`);
    if (!config.snapshot) {
      console.log(`\n  Hint: run with --snapshot=${config.compare} to create it.`);
    }
  }
}

divider();
console.log("All benchmarks complete.");
console.log("");
