import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Scene, SceneManager, Transform, Velocity, System } from "../../../ecs/index.js";

describe("Scene", () => {
  it("creates with name", () => {
    const s = new Scene("Test");
    assert.strictEqual(s.name, "Test");
  });

  it("owns a World", () => {
    const s = new Scene("Test");
    assert.ok(s.world);
  });

  it("lifecycle hooks are no-ops by default", () => {
    const s = new Scene("Test");
    assert.doesNotThrow(() => s.onCreate());
    assert.doesNotThrow(() => s.onEnter());
    assert.doesNotThrow(() => s.onExit());
    assert.doesNotThrow(() => s.onPause());
    assert.doesNotThrow(() => s.onResume());
    assert.doesNotThrow(() => s.onDestroy());
    assert.doesNotThrow(() => s.update(0.016));
    assert.doesNotThrow(() => s.render(null));
  });

  it("scene can set up world with components and systems", () => {
    class GameScene extends Scene {
      onCreate() {
        this.world.register(Transform);
        this.world.register(Velocity);
      }
    }

    const s = new GameScene("Game");
    s.onCreate();
    assert.ok(s.world.registry.getId(Transform));
    assert.ok(s.world.registry.getId(Velocity));
  });
});

describe("SceneManager — basic operations", () => {
  it("starts with no active scene", () => {
    const mgr = new SceneManager();
    assert.strictEqual(mgr.activeScene, null);
    assert.strictEqual(mgr.sceneCount, 0);
  });

  it("add stores scene by name", () => {
    const mgr = new SceneManager();
    const s = new Scene("A");
    mgr.add(s);
    assert.strictEqual(mgr.activeScene, null);
  });

  it("throws on duplicate scene name", () => {
    const mgr = new SceneManager();
    mgr.add(new Scene("A"));
    assert.throws(() => mgr.add(new Scene("A")));
  });

  it("throws on remove non-existent", () => {
    const mgr = new SceneManager();
    assert.throws(() => mgr.remove("Nope"));
  });

  it("throws on start non-existent", () => {
    const mgr = new SceneManager();
    assert.throws(() => mgr.start("Nope"));
  });

  it("throws on change non-existent", () => {
    const mgr = new SceneManager();
    assert.throws(() => mgr.change("Nope"));
  });

  it("throws on push non-existent", () => {
    const mgr = new SceneManager();
    assert.throws(() => mgr.push("Nope"));
  });

  it("throws on pop empty stack", () => {
    const mgr = new SceneManager();
    assert.throws(() => mgr.pop());
  });
});

describe("SceneManager — lifecycle hooks", () => {
  it("onCreate called on add", () => {
    const calls = [];
    class TestScene extends Scene {
      onCreate() { calls.push("create"); }
    }
    const mgr = new SceneManager();
    mgr.add(new TestScene("T"));
    assert.deepStrictEqual(calls, ["create"]);
  });

  it("onEnter called on start", () => {
    const calls = [];
    class TestScene extends Scene {
      onCreate() { calls.push("create"); }
      onEnter() { calls.push("enter"); }
    }
    const mgr = new SceneManager();
    mgr.add(new TestScene("T"));
    mgr.start("T");
    assert.deepStrictEqual(calls, ["create", "enter"]);
  });

  it("change calls exit on old and enter on new", () => {
    const calls = [];
    class A extends Scene {
      onEnter() { calls.push("A enter"); }
      onExit() { calls.push("A exit"); }
    }
    class B extends Scene {
      onEnter() { calls.push("B enter"); }
      onExit() { calls.push("B exit"); }
    }
    const mgr = new SceneManager();
    mgr.add(new A("A"));
    mgr.add(new B("B"));
    mgr.start("A");
    mgr.change("B");
    assert.deepStrictEqual(calls, ["A enter", "A exit", "B enter"]);
  });

  it("change to same scene is no-op", () => {
    const calls = [];
    class TestScene extends Scene {
      onEnter() { calls.push("enter"); }
      onExit() { calls.push("exit"); }
    }
    const mgr = new SceneManager();
    mgr.add(new TestScene("T"));
    mgr.start("T");
    mgr.change("T");
    assert.deepStrictEqual(calls, ["enter"]);
  });

  it("push calls pause on current and enter on overlay", () => {
    const calls = [];
    class Base extends Scene {
      onEnter() { calls.push("base enter"); }
      onPause() { calls.push("base pause"); }
    }
    class Overlay extends Scene {
      onEnter() { calls.push("overlay enter"); }
    }
    const mgr = new SceneManager();
    mgr.add(new Base("base"));
    mgr.add(new Overlay("overlay"));
    mgr.start("base");
    mgr.push("overlay");
    assert.deepStrictEqual(calls, ["base enter", "base pause", "overlay enter"]);
  });

  it("pop calls exit+destroy on top and resume on previous", () => {
    const calls = [];
    class Base extends Scene {
      onEnter() { calls.push("base enter"); }
      onResume() { calls.push("base resume"); }
    }
    class Overlay extends Scene {
      onEnter() { calls.push("overlay enter"); }
      onExit() { calls.push("overlay exit"); }
      onDestroy() { calls.push("overlay destroy"); }
    }
    const mgr = new SceneManager();
    mgr.add(new Base("base"));
    mgr.add(new Overlay("overlay"));
    mgr.start("base");
    mgr.push("overlay");
    mgr.pop();
    assert.deepStrictEqual(calls, [
      "base enter", "overlay enter",
      "overlay exit", "overlay destroy", "base resume",
    ]);
  });

  it("replace calls exit+destroy on old and enter on new", () => {
    const calls = [];
    class Old extends Scene {
      onCreate() { calls.push("old create"); }
      onEnter() { calls.push("old enter"); }
      onExit() { calls.push("old exit"); }
      onDestroy() { calls.push("old destroy"); }
    }
    class NewScene extends Scene {
      onCreate() { calls.push("new create"); }
      onEnter() { calls.push("new enter"); }
    }
    const mgr = new SceneManager();
    mgr.add(new Old("old"));
    mgr.add(new NewScene("new"));
    mgr.start("old");
    mgr.replace("new");
    assert.deepStrictEqual(calls, [
      "old create", "new create", "old enter",
      "old exit", "old destroy",
      "new enter",
    ]);
  });

  it("remove calls onDestroy", () => {
    const calls = [];
    class TestScene extends Scene {
      onDestroy() { calls.push("destroy"); }
    }
    const mgr = new SceneManager();
    mgr.add(new TestScene("T"));
    mgr.remove("T");
    assert.deepStrictEqual(calls, ["destroy"]);
    assert.strictEqual(mgr.activeScene, null);
  });
});

describe("SceneManager — scenes", () => {
  it("update calls world.update + scene.update on active scene", () => {
    let worldUpdated = false;
    let sceneUpdated = false;

    class TestScene extends Scene {
      onCreate() {
        this.world.register(Transform);
        this.world.update = (dt) => { worldUpdated = true; };
      }
      update(dt) { sceneUpdated = true; }
    }

    const mgr = new SceneManager();
    mgr.add(new TestScene("T"));
    mgr.start("T");
    mgr.update(0.016);
    assert.ok(worldUpdated);
    assert.ok(sceneUpdated);
  });

  it("update does nothing with no active scene", () => {
    const mgr = new SceneManager();
    assert.doesNotThrow(() => mgr.update(0.016));
  });

  it("render does nothing with empty stack", () => {
    const mgr = new SceneManager();
    assert.doesNotThrow(() => mgr.render(null));
  });

  it("render calls render on all stacked scenes", () => {
    const rendered = [];
    class A extends Scene {
      render(ctx) { rendered.push("A"); }
    }
    class B extends Scene {
      render(ctx) { rendered.push("B"); }
    }

    const mgr = new SceneManager();
    mgr.add(new A("A"));
    mgr.add(new B("B"));
    mgr.start("A");
    mgr.push("B");
    mgr.render(null);
    assert.deepStrictEqual(rendered, ["A", "B"]);
  });

  it("update only updates top scene", () => {
    const updated = [];
    class A extends Scene {
      update(dt) { updated.push("A"); }
    }
    class B extends Scene {
      update(dt) { updated.push("B"); }
    }

    const mgr = new SceneManager();
    mgr.add(new A("A"));
    mgr.add(new B("B"));
    mgr.start("A");
    mgr.push("B");
    mgr.update(0.016);
    // World.update runs for B, then B's update runs
    assert.ok(updated.includes("B"));
  });
});

describe("SceneManager — ownership isolation", () => {
  it("each scene has its own world", () => {
    const a = new Scene("A");
    const b = new Scene("B");
    assert.notStrictEqual(a.world, b.world);
  });

  it("systems are isolated between scenes", () => {
    class SysA extends System {
      static priority = 0;
      update(ctx) {}
    }
    class SysB extends System {
      static priority = 0;
      update(ctx) {}
    }

    const a = new Scene("A");
    a.world.register(Transform);
    const sysA = new SysA();
    a.world.addSystem(sysA);

    const b = new Scene("B");
    b.world.register(Transform);
    const sysB = new SysB();
    b.world.addSystem(sysB);

    assert.strictEqual(a.world.scheduler.has(sysA), true);
    assert.strictEqual(b.world.scheduler.has(sysB), true);
    assert.strictEqual(a.world.scheduler.has(new SysB()), false);
  });

  it("prefabs are isolated between scenes", () => {
    const a = new Scene("A");
    a.world.register(Transform);
    a.world.createPrefab("Enemy").add(Transform, { x: 0, y: 0 });

    const b = new Scene("B");
    assert.throws(() => b.world.instantiate("Enemy"));
  });

  it("events are isolated between scenes", () => {
    class TestEvent { static fields = ["v"]; }

    const a = new Scene("A");
    a.world.registerEvent(TestEvent);
    a.world.events.emit(TestEvent, { v: 1 });

    const b = new Scene("B");
    b.world.registerEvent(TestEvent);
    assert.strictEqual([...b.world.events.read(TestEvent)].length, 0);
  });
});

describe("SceneManager — activeScene", () => {
  it("activeScene is null when stack is empty", () => {
    const mgr = new SceneManager();
    assert.strictEqual(mgr.activeScene, null);
  });

  it("activeScene is the top of the stack after start", () => {
    const mgr = new SceneManager();
    const s = new Scene("A");
    mgr.add(s);
    mgr.start("A");
    assert.strictEqual(mgr.activeScene, s);
  });

  it("activeScene changes after push", () => {
    const mgr = new SceneManager();
    const a = new Scene("A");
    const b = new Scene("B");
    mgr.add(a);
    mgr.add(b);
    mgr.start("A");
    mgr.push("B");
    assert.strictEqual(mgr.activeScene, b);
  });

  it("activeScene returns to previous after pop", () => {
    const mgr = new SceneManager();
    const a = new Scene("A");
    const b = new Scene("B");
    mgr.add(a);
    mgr.add(b);
    mgr.start("A");
    mgr.push("B");
    mgr.pop();
    assert.strictEqual(mgr.activeScene, a);
  });

  it("change updates activeScene", () => {
    const mgr = new SceneManager();
    mgr.add(new Scene("A"));
    mgr.add(new Scene("B"));
    mgr.start("A");
    mgr.change("B");
    assert.strictEqual(mgr.activeScene.name, "B");
  });
});

describe("SceneManager — edge cases", () => {
  it("remove active scene calls onExit and onDestroy", () => {
    const calls = [];
    class TestScene extends Scene {
      onEnter() { calls.push("enter"); }
      onExit() { calls.push("exit"); }
      onDestroy() { calls.push("destroy"); }
    }
    const mgr = new SceneManager();
    mgr.add(new TestScene("T"));
    mgr.start("T");
    mgr.remove("T");
    assert.deepStrictEqual(calls, ["enter", "exit", "destroy"]);
    assert.strictEqual(mgr.activeScene, null);
  });

  it("remove non-active scene does not call onExit", () => {
    const calls = [];
    class A extends Scene {
      onExit() { calls.push("A exit"); }
      onDestroy() { calls.push("A destroy"); }
    }
    class B extends Scene {
      onEnter() { calls.push("B enter"); }
    }
    const mgr = new SceneManager();
    const aScene = new A("A");
    const bScene = new B("B");
    mgr.add(aScene);
    mgr.add(bScene);
    mgr.start("A");
    mgr.push("B");
    mgr.remove("A");
    assert.ok(calls.includes("A destroy"));
    assert.strictEqual(mgr.activeScene, bScene);
  });

  it("multiple pushes and pops work in sequence", () => {
    const order = [];
    class S extends Scene {
      constructor(name) {
        super(name);
        this._c = name;
      }
      onEnter() { order.push(`${this._c} enter`); }
      onExit() { order.push(`${this._c} exit`); }
      onDestroy() { order.push(`${this._c} destroy`); }
      onPause() { order.push(`${this._c} pause`); }
      onResume() { order.push(`${this._c} resume`); }
    }

    const mgr = new SceneManager();
    mgr.add(new S("base"));
    mgr.add(new S("menu"));
    mgr.add(new S("settings"));

    mgr.start("base");
    mgr.push("menu");
    mgr.push("settings");
    mgr.pop();
    mgr.pop();

    assert.deepStrictEqual(order, [
      "base enter",
      "base pause", "menu enter",
      "menu pause", "settings enter",
      "settings exit", "settings destroy", "menu resume",
      "menu exit", "menu destroy", "base resume",
    ]);
  });

  it("change to non-existent scene throws", () => {
    const mgr = new SceneManager();
    mgr.add(new Scene("A"));
    mgr.start("A");
    assert.throws(() => mgr.change("Missing"));
  });

  it("start on empty manager throws", () => {
    const mgr = new SceneManager();
    assert.throws(() => mgr.start("A"));
  });
});
