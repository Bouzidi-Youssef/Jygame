import { benchmark, printResult, divider } from "./runner.js";
import { createWorld } from "./helpers.js";
import { Scene, SceneManager, Transform, Velocity, System } from "../../ecs/index.js";

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

class NoopScene extends Scene {
  onCreate() {}
  onEnter() {}
  onExit() {}
  onDestroy() {}
  update(dt) {}
  render(ctx) {}
}

class NoopSystem extends System {
  static priority = 0;
  update(ctx) {}
}

export function run(config) {
  divider("Scene Management Benchmark");

  // ── Scene creation ──
  divider("  Scene creation");
  {
    const rCreate = benchmark("    new Scene (empty)", () => {
      const s = new Scene("S");
      s.onCreate();
      s.onDestroy();
    }, { iterations: 1000, warmup: 100 });
    printResult(rCreate);
  }

  {
    const rCreateWithWorld = benchmark("    Scene with world setup", () => {
      const s = new Scene("S");
      s.world.register(Transform);
      s.world.register(Velocity);
      s.world.addSystem(new NoopSystem());
    }, { iterations: 1000, warmup: 100 });
    printResult(rCreateWithWorld);
  }

  // ── add / start / change ──
  divider("  SceneManager operations");
  {
    const rAdd = benchmark("    add", () => {
      const mgr = new SceneManager();
      for (let i = 0; i < 10; i++) {
        mgr.add(new NoopScene(`S${i}`));
      }
    }, { iterations: 500, warmup: 50 });
    printResult(rAdd);
  }

  {
    const mgr = new SceneManager();
    mgr.add(new Scene("A"));
    const rStart = benchmark("    start", () => {
      mgr.start("A");
      mgr._stack.pop();
    }, { iterations: 500, warmup: 50 });
    printResult(rStart);
  }

  {
    const mgr = new SceneManager();
    mgr.add(new NoopScene("A"));
    mgr.add(new NoopScene("B"));
    mgr.start("A");
    const rChange = benchmark("    change", () => {
      mgr.change("B");
      mgr.change("A");
    }, { iterations: 500, warmup: 50 });
    printResult(rChange);
  }

  // ── push / pop ──
  divider("  Push / Pop");
  {
    const mgr = new SceneManager();
    mgr.add(new NoopScene("A"));
    mgr.add(new NoopScene("B"));
    mgr.start("A");
    const rPushPop = benchmark("    push+pop pair", () => {
      mgr.push("B");
      mgr.pop();
    }, { iterations: 500, warmup: 50 });
    printResult(rPushPop);
  }

  // ── replace ──
  divider("  Replace");
  {
    const mgr = new SceneManager();
    mgr.add(new NoopScene("A"));
    mgr.add(new NoopScene("B"));
    mgr.start("A");
    const rReplace = benchmark("    replace", () => {
      mgr.replace("B");
      mgr.replace("A");
    }, { iterations: 500, warmup: 50 });
    printResult(rReplace);
  }

  // ── update overhead ──
  divider("  Update overhead");
  {
    const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));
    for (const count of counts) {
      const opts = benchOpts(config, count);

      const world = createWorld();
      for (let i = 0; i < count; i++) {
        world.entity()
          .with(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
          .with(Velocity, { x: 1, y: 1 })
          .create();
      }

      const scene = new NoopScene("bench");
      scene.world = world;

      const rUpdate = benchmark(`    update (${count} entities)`, () => {
        scene.world.update(0.016);
      }, opts);
      printResult(rUpdate, { entityCount: count });
    }
  }

  // ── render overhead (empty stack vs stacked) ──
  divider("  Render overhead");
  {
    const rEmpty = benchmark("    render (empty stack)", () => {
      const mgr = new SceneManager();
      mgr.render(null);
    }, { iterations: 1000, warmup: 100 });
    printResult(rEmpty);
  }

  {
    const mgr = new SceneManager();
    mgr.add(new NoopScene("A"));
    mgr.add(new NoopScene("B"));
    mgr.start("A");
    const rRenderStacked = benchmark("    render (2 stacked)", () => {
      mgr.render(null);
    }, { iterations: 1000, warmup: 100 });
    printResult(rRenderStacked);
  }

  // ── lifecycle hook overhead ──
  divider("  Lifecycle hook overhead");
  {
    class HeavyScene extends Scene {
      constructor(name) {
        super(name);
        this._data = new Array(1000).fill(0);
      }
    }
    const rLifecycle = benchmark("    create + destroy (heavy scene)", () => {
      const s = new HeavyScene("H");
      s.onCreate();
      s.onDestroy();
    }, { iterations: 500, warmup: 50 });
    printResult(rLifecycle);
  }

  // ── high-throughput scene switching ──
  divider("  High-throughput switching");
  {
    const N = 1000;
    const mgr = new SceneManager();
    for (let i = 0; i < N; i++) {
      mgr.add(new NoopScene(`S${i}`));
    }
    mgr.start("S0");
    let idx = 0;
    const rSwitch = benchmark(`    change cycling (${N} scenes)`, () => {
      idx = (idx + 1) % N;
      mgr.change(`S${idx}`);
    }, { iterations: 100, warmup: 20 });
    printResult(rSwitch);
  }
}
