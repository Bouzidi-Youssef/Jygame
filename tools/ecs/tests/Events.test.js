import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, Events, EventChannel, System } from "../../../ecs/index.js";

class TestEvent {
  static fields = ["x", "y"];
}

class OtherEvent {
  static fields = ["id", "label"];
}

class EmptyEvent {
  static fields = [];
}

class NoFieldsEvent {}

function createWorld() {
  const world = new World();
  world.registerEvent(TestEvent);
  world.registerEvent(OtherEvent);
  world.registerEvent(EmptyEvent);
  return world;
}

describe("EventChannel", () => {
  it("constructs with pre-allocated buffer", () => {
    const ch = new EventChannel(16, ["a", "b"]);
    assert.strictEqual(ch.capacity, 16);
    assert.strictEqual(ch.count, 0);
  });

  it("emit stores data in next slot", () => {
    const ch = new EventChannel(16, ["a", "b"]);
    ch.emit({ a: 1, b: 2 });
    assert.strictEqual(ch.count, 1);
    const events = [...ch.read()];
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].a, 1);
    assert.strictEqual(events[0].b, 2);
  });

  it("multiple emit preserves order", () => {
    const ch = new EventChannel(16, ["v"]);
    ch.emit({ v: "first" });
    ch.emit({ v: "second" });
    ch.emit({ v: "third" });
    const events = [...ch.read()];
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].v, "first");
    assert.strictEqual(events[1].v, "second");
    assert.strictEqual(events[2].v, "third");
  });

  it("clear resets count to zero", () => {
    const ch = new EventChannel(16, ["v"]);
    ch.emit({ v: 1 });
    ch.emit({ v: 2 });
    assert.strictEqual(ch.count, 2);
    ch.clear();
    assert.strictEqual(ch.count, 0);
    assert.strictEqual([...ch.read()].length, 0);
  });

  it("reuses buffer slots after clear", () => {
    const ch = new EventChannel(4, ["v"]);
    ch.emit({ v: "a" });
    ch.emit({ v: "b" });
    ch.clear();
    ch.emit({ v: "c" });
    ch.emit({ v: "d" });
    ch.emit({ v: "e" });
    const events = [...ch.read()];
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].v, "c");
    assert.strictEqual(events[1].v, "d");
    assert.strictEqual(events[2].v, "e");
  });

  it("auto-grows when capacity exceeded", () => {
    const ch = new EventChannel(2, ["v"]);
    ch.emit({ v: 1 });
    ch.emit({ v: 2 });
    assert.strictEqual(ch.capacity, 2);
    ch.emit({ v: 3 });
    assert.strictEqual(ch.capacity, 4);
    assert.strictEqual(ch.count, 3);
    const events = [...ch.read()];
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[2].v, 3);
  });

  it("multiple auto-growths", () => {
    const ch = new EventChannel(2, ["v"]);
    for (let i = 0; i < 100; i++) {
      ch.emit({ v: i });
    }
    assert.strictEqual(ch.count, 100);
    assert.ok(ch.capacity >= 100);
    const events = [...ch.read()];
    assert.strictEqual(events.length, 100);
    assert.strictEqual(events[99].v, 99);
  });

  it("does not grow buffer after warmup (capacity sufficient)", () => {
    const ch = new EventChannel(1024, ["v"]);
    ch.emit({ v: 1 });
    ch.clear();

    const capBefore = ch.capacity;
    for (let i = 0; i < 1000; i++) {
      ch.emit({ v: i });
    }
    assert.strictEqual(ch.capacity, capBefore);
  });

  it("multiple readers see same data", () => {
    const ch = new EventChannel(16, ["v"]);
    ch.emit({ v: "a" });
    ch.emit({ v: "b" });

    const reader1 = [...ch.read()];
    const reader2 = [...ch.read()];
    assert.strictEqual(reader1.length, 2);
    assert.strictEqual(reader2.length, 2);
    assert.strictEqual(reader1[0].v, "a");
    assert.strictEqual(reader2[1].v, "b");
  });

  it("empty channel read yields no events", () => {
    const ch = new EventChannel(16, ["v"]);
    assert.strictEqual([...ch.read()].length, 0);
  });

  it("fields are copied by value, not reference", () => {
    const ch = new EventChannel(4, ["obj"]);
    const inner = { key: "val" };
    ch.emit({ obj: inner });
    inner.key = "mutated";
    const events = [...ch.read()];
    assert.strictEqual(events[0].obj.key, "mutated");
  });
});

describe("Events container", () => {
  it("register creates a channel", () => {
    const ev = new Events();
    ev.register(TestEvent);
    ev.emit(TestEvent, { x: 1, y: 2 });
    const events = [...ev.read(TestEvent)];
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].x, 1);
  });

  it("throws on double registration", () => {
    const ev = new Events();
    ev.register(TestEvent);
    assert.throws(() => ev.register(TestEvent));
  });

  it("throws on emit unregistered event", () => {
    const ev = new Events();
    assert.throws(() => ev.emit(TestEvent, {}));
  });

  it("throws on read unregistered event", () => {
    const ev = new Events();
    assert.throws(() => ev.read(TestEvent));
  });

  it("throws on register without fields", () => {
    const ev = new Events();
    assert.throws(() => ev.register(NoFieldsEvent));
  });

  it("clear clears all channels", () => {
    const ev = new Events();
    ev.register(TestEvent);
    ev.register(OtherEvent);
    ev.emit(TestEvent, { x: 1, y: 2 });
    ev.emit(OtherEvent, { id: 42, label: "hi" });
    assert.strictEqual([...ev.read(TestEvent)].length, 1);
    assert.strictEqual([...ev.read(OtherEvent)].length, 1);
    ev.clear();
    assert.strictEqual([...ev.read(TestEvent)].length, 0);
    assert.strictEqual([...ev.read(OtherEvent)].length, 0);
  });

  it("independent channels don't interfere", () => {
    const ev = new Events();
    ev.register(TestEvent);
    ev.register(OtherEvent);
    ev.emit(TestEvent, { x: 10, y: 20 });
    assert.strictEqual([...ev.read(OtherEvent)].length, 0);
    assert.strictEqual([...ev.read(TestEvent)].length, 1);
  });

  it("custom capacity via options", () => {
    const ev = new Events();
    ev.register(TestEvent, { capacity: 4 });
    for (let i = 0; i < 4; i++) {
      ev.emit(TestEvent, { x: i, y: i });
    }
    assert.strictEqual([...ev.read(TestEvent)].length, 4);
  });

  it("custom capacity via static property", () => {
    class CustomCapEvent {
      static fields = ["v"];
      static capacity = 8;
    }
    const ev = new Events();
    ev.register(CustomCapEvent);
    for (let i = 0; i < 8; i++) {
      ev.emit(CustomCapEvent, { v: i });
    }
    assert.strictEqual([...ev.read(CustomCapEvent)].length, 8);
  });
});

describe("World integration", () => {
  it("world.events is available", () => {
    const world = new World();
    assert.ok(world.events);
  });

  it("registerEvent via world", () => {
    const world = new World();
    world.registerEvent(TestEvent);
    world.events.emit(TestEvent, { x: 1, y: 2 });
    assert.strictEqual([...world.events.read(TestEvent)].length, 1);
  });

  it("ctx.events available in systems", () => {
    const world = new World();
    world.registerEvent(TestEvent);

    let ctxEvents = null;
    class TestSystem extends System {
      static priority = 0;
      update(ctx) {
        ctxEvents = ctx.events;
      }
    }

    world.addSystem(new TestSystem());
    world.update(0.016);
    assert.ok(ctxEvents);
    assert.strictEqual(ctxEvents, world.events);
  });

  it("events auto-cleared after world.update", () => {
    const world = new World();
    world.registerEvent(TestEvent);

    class EmitterSystem extends System {
      static priority = 0;
      update(ctx) {
        ctx.events.emit(TestEvent, { x: 1, y: 2 });
      }
    }

    world.addSystem(new EmitterSystem());
    world.update(0.016);
    assert.strictEqual([...world.events.read(TestEvent)].length, 0);
  });

  it("reader system sees events from producer system (same frame)", () => {
    const world = new World();
    world.registerEvent(TestEvent);

    const seen = [];
    class Producer extends System {
      static priority = 0;
      update(ctx) {
        ctx.events.emit(TestEvent, { x: 42, y: 99 });
      }
    }

    class Consumer extends System {
      static priority = 1;
      update(ctx) {
        for (const ev of ctx.events.read(TestEvent)) {
          seen.push({ x: ev.x, y: ev.y });
        }
      }
    }

    world.addSystem(new Producer());
    world.addSystem(new Consumer());
    world.update(0.016);
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].x, 42);
    assert.strictEqual(seen[0].y, 99);
  });

  it("multiple readers see same events", () => {
    const world = new World();
    world.registerEvent(TestEvent);

    const seenA = [];
    const seenB = [];
    class Producer extends System {
      static priority = 0;
      update(ctx) {
        ctx.events.emit(TestEvent, { x: 7, y: 8 });
      }
    }

    class ReaderA extends System {
      static priority = 1;
      update(ctx) {
        for (const ev of ctx.events.read(TestEvent)) {
          seenA.push(ev.x);
        }
      }
    }

    class ReaderB extends System {
      static priority = 2;
      update(ctx) {
        for (const ev of ctx.events.read(TestEvent)) {
          seenB.push(ev.x);
        }
      }
    }

    world.addSystem(new Producer());
    world.addSystem(new ReaderA());
    world.addSystem(new ReaderB());
    world.update(0.016);
    assert.deepStrictEqual(seenA, [7]);
    assert.deepStrictEqual(seenB, [7]);
  });

  it("producer after reader sees nothing (deterministic ordering)", () => {
    const world = new World();
    world.registerEvent(TestEvent);

    const seen = [];
    class Reader extends System {
      static priority = 0;
      update(ctx) {
        for (const ev of ctx.events.read(TestEvent)) {
          seen.push(ev.x);
        }
      }
    }

    class Producer extends System {
      static priority = 1;
      update(ctx) {
        ctx.events.emit(TestEvent, { x: 99, y: 0 });
      }
    }

    world.addSystem(new Reader());
    world.addSystem(new Producer());
    world.update(0.016);
    assert.strictEqual(seen.length, 0);
  });
});

describe("Edge cases", () => {
  it("empty field events", () => {
    const world = new World();
    world.registerEvent(EmptyEvent);
    world.events.emit(EmptyEvent, {});
    assert.strictEqual([...world.events.read(EmptyEvent)].length, 1);
  });

  it("events persist across multiple reads (not consumed)", () => {
    const ch = new EventChannel(8, ["v"]);
    ch.emit({ v: "persist" });
    assert.strictEqual([...ch.read()].length, 1);
    assert.strictEqual([...ch.read()].length, 1);
    assert.strictEqual([...ch.read()].length, 1);
  });

  it("ordering maintained with multiple emitters", () => {
    const ch = new EventChannel(16, ["src", "val"]);
    ch.emit({ src: "A", val: 1 });
    ch.emit({ src: "B", val: 2 });
    ch.emit({ src: "A", val: 3 });
    const events = [...ch.read()];
    assert.strictEqual(events[0].src, "A");
    assert.strictEqual(events[1].src, "B");
    assert.strictEqual(events[2].val, 3);
  });

  it("interleaved emit and read works on same channel", () => {
    const ch = new EventChannel(16, ["v"]);
    ch.emit({ v: 1 });
    ch.emit({ v: 2 });
    const first = [...ch.read()];
    ch.emit({ v: 3 });
    const second = [...ch.read()];
    assert.strictEqual(first.length, 2);
    assert.strictEqual(second.length, 3);
    assert.strictEqual(second[2].v, 3);
  });

  it("Events container can register after world creation", () => {
    const world = new World();
    world.registerEvent(TestEvent, { capacity: 2 });
    world.events.emit(TestEvent, { x: 1, y: 2 });
    world.events.emit(TestEvent, { x: 3, y: 4 });
    assert.strictEqual([...world.events.read(TestEvent)].length, 2);
  });

  it("two independent systems consume same events without coupling", () => {
    const world = new World();
    world.registerEvent(TestEvent);

    const audio = [];
    const ui = [];

    class CollisionSystem extends System {
      static priority = 0;
      update(ctx) {
        ctx.events.emit(TestEvent, { x: 1, y: 2 });
        ctx.events.emit(TestEvent, { x: 3, y: 4 });
      }
    }

    class AudioSystem extends System {
      static priority = 1;
      update(ctx) {
        for (const ev of ctx.events.read(TestEvent)) {
          audio.push(`play_sound_at(${ev.x},${ev.y})`);
        }
      }
    }

    class UISystem extends System {
      static priority = 2;
      update(ctx) {
        for (const ev of ctx.events.read(TestEvent)) {
          ui.push(`show_hit_marker(${ev.x},${ev.y})`);
        }
      }
    }

    world.addSystem(new CollisionSystem());
    world.addSystem(new AudioSystem());
    world.addSystem(new UISystem());

    world.update(0.016);

    assert.strictEqual(audio.length, 2);
    assert.strictEqual(ui.length, 2);
    assert.strictEqual(audio[0], "play_sound_at(1,2)");
    assert.strictEqual(audio[1], "play_sound_at(3,4)");
    assert.strictEqual(ui[0], "show_hit_marker(1,2)");
    assert.strictEqual(ui[1], "show_hit_marker(3,4)");
  });

  it("Events.clear called at end of update", () => {
    const world = new World();
    world.registerEvent(TestEvent);

    class Producer extends System {
      static priority = 0;
      update(ctx) {
        ctx.events.emit(TestEvent, { x: 1, y: 2 });
      }
    }

    world.addSystem(new Producer());
    world.update(0.016);
    assert.strictEqual([...world.events.read(TestEvent)].length, 0);

    world.update(0.016);
    assert.strictEqual([...world.events.read(TestEvent)].length, 0);
  });
});
