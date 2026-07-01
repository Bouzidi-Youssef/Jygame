import { benchmark, printResult, divider } from "./runner.js";
import { EventChannel, Events } from "../../ecs/index.js";

class BenchEvent {
  static fields = ["a", "b", "c"];
}

class LargeEvent {
  static fields = ["id", "x", "y", "vx", "vy", "health", "damage", "type", "flags"];
}

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) {
    iterations = Math.min(config.iterations, 200);
    warmup = Math.min(config.warmup, 20);
  } else if (count <= 1000) {
    iterations = Math.min(config.iterations, 50);
    warmup = Math.min(config.warmup, 10);
  } else {
    iterations = Math.min(config.iterations, 5);
    warmup = Math.min(config.warmup, 3);
  }
  return { iterations, warmup, entityCount: count };
}

export function run(config) {
  divider("Events Benchmark");

  const counts = [100, 1000, 10000, 100000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const opts = benchOpts(config, count);

    // ── emit ──
    divider(`  emit — ${count.toLocaleString()}`);
    {
      const ch = new EventChannel(Math.max(count, 16), BenchEvent.fields);
      const data = { a: 1, b: 2, c: 3 };
      const rEmit = benchmark(`    emit`, () => {
        for (let i = 0; i < count; i++) {
          ch.emit(data);
        }
      }, opts);
      printResult(rEmit);
      ch.clear();
    }

    // ── multiple emit (pre-allocated events) ──
    divider(`  emit (LargeEvent, 9 fields) — ${count.toLocaleString()}`);
    {
      const ch = new EventChannel(Math.max(count, 16), LargeEvent.fields);
      const data = { id: 0, x: 1, y: 2, vx: 0.5, vy: -0.5, health: 100, damage: 10, type: 1, flags: 0 };
      const rEmitLarge = benchmark(`    emit (9 fields)`, () => {
        for (let i = 0; i < count; i++) {
          ch.emit(data);
        }
      }, opts);
      printResult(rEmitLarge);
      ch.clear();
    }

    // ── read + iteration ──
    divider(`  read + iterate — ${count.toLocaleString()}`);
    {
      const ch = new EventChannel(Math.max(count, 16), BenchEvent.fields);
      for (let i = 0; i < count; i++) {
        ch.emit({ a: i, b: i * 2, c: i * 3 });
      }

      const rRead = benchmark(`    read + iterate`, () => {
        let sum = 0;
        for (const ev of ch.read()) {
          sum += ev.a + ev.b + ev.c;
        }
      }, opts);

      ch.clear();
      printResult(rRead);
    }

    // ── clear ──
    divider(`  clear — ${count.toLocaleString()}`);
    {
      const ch = new EventChannel(Math.max(count, 16), BenchEvent.fields);
      for (let i = 0; i < count; i++) {
        ch.emit({ a: i, b: i * 2, c: i * 3 });
      }

      const rClear = benchmark(`    clear`, () => {
        ch.clear();
      }, opts);
      printResult(rClear);
    }

    // ── full cycle: emit → read → clear ──
    divider(`  full cycle — ${count.toLocaleString()}`);
    {
      const ch = new EventChannel(Math.max(count, 16), BenchEvent.fields);
      const data = { a: 1, b: 2, c: 3 };

      const rCycle = benchmark(`    emit + read + clear`, () => {
        for (let i = 0; i < count; i++) {
          ch.emit(data);
        }
        let sum = 0;
        for (const ev of ch.read()) {
          sum += ev.a;
        }
        ch.clear();
      }, opts);
      printResult(rCycle);
    }

    // ── Events container: emit + read ──
    divider(`  Events container — ${count.toLocaleString()}`);
    {
      const ev = new Events();
      ev.register(BenchEvent, { capacity: Math.max(count, 16) });
      const data = { a: 1, b: 2, c: 3 };

      const rEvents = benchmark(`    Events container emit + read`, () => {
        for (let i = 0; i < count; i++) {
          ev.emit(BenchEvent, data);
        }
        let sum = 0;
        for (const e of ev.read(BenchEvent)) {
          sum += e.a;
        }
        ev.clear();
      }, opts);
      printResult(rEvents);
    }

    // ── multiple readers ──
    divider(`  multiple readers — ${count.toLocaleString()}`);
    {
      const ch = new EventChannel(Math.max(count, 16), BenchEvent.fields);
      for (let i = 0; i < count; i++) {
        ch.emit({ a: i, b: i * 2, c: 0 });
      }

      const rMulti = benchmark(`    3 readers`, () => {
        let s1 = 0, s2 = 0, s3 = 0;
        for (const ev of ch.read()) s1 += ev.a;
        for (const ev of ch.read()) s2 += ev.b;
        for (const ev of ch.read()) s3 += ev.c;
      }, opts);

      ch.clear();
      printResult(rMulti);
    }
  }

  // ── allocation verification ──
  divider("  Allocation verification");
  {
    const ch = new EventChannel(1024, BenchEvent.fields);
    const data = { a: 1, b: 2, c: 3 };
    const capBefore = ch.capacity;

    const rAlloc = benchmark(`    no buffer growth (1024 cap, 1000 emit)`, () => {
      for (let i = 0; i < 1000; i++) {
        ch.emit(data);
      }
      ch.clear();
    }, { iterations: 10, warmup: 3 });
    printResult(rAlloc);

    if (ch.capacity !== capBefore) {
      console.log("  ⚠ FAIL: buffer grew during warmup phase");
    } else {
      console.log("  ✓ buffer capacity unchanged (zero allocations after warmup)");
    }
  }

  // ── auto-grow ──
  divider("  Auto-grow");
  {
    const ch = new EventChannel(4, BenchEvent.fields);
    const data = { a: 1, b: 2, c: 3 };
    const rGrow = benchmark(`    auto-grow 4 → 128`, () => {
      for (let i = 0; i < 128; i++) {
        ch.emit(data);
      }
      ch.clear();
    }, { iterations: 10, warmup: 3 });
    printResult(rGrow);
  }
}
