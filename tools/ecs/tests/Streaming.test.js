import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, StreamingCell, StreamingManager } from "../../../ecs/index.js";

function createWorld() {
  const w = new World();
  return w;
}

function createStreamingWorld() {
  const w = createWorld();
  w.setResource(StreamingManager, new StreamingManager(w));
  return w;
}

describe("StreamingCell", () => {
  it("creates with name", () => {
    const w = createStreamingWorld();
    const cell = w.streaming.createCell("Village");
    assert.strictEqual(cell.name, "Village");
    assert.strictEqual(cell.loaded, false);
    assert.strictEqual(cell.entityCount, 0);
  });

  it("addEntity registers entity ownership", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    assert.strictEqual(cell.entityCount, 1);
    assert.ok(cell.contains(e));
  });

  it("addEntity with dead entity throws", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    w.destroyEntity(e);
    assert.throws(() => cell.addEntity(e));
  });

  it("addEntity with invalid entity ID throws", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    assert.throws(() => cell.addEntity(99999));
  });

  it("addEntity to multiple cells throws", () => {
    const w = createStreamingWorld();
    const a = w.createStreamingCell("A");
    const b = w.createStreamingCell("B");
    const e = w.createEntity();
    a.addEntity(e);
    assert.throws(() => b.addEntity(e));
  });

  it("addEntity same cell twice is safe", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    cell.addEntity(e);
    assert.strictEqual(cell.entityCount, 1);
  });

  it("removeEntity removes ownership", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    cell.removeEntity(e);
    assert.strictEqual(cell.entityCount, 0);
    assert.ok(!cell.contains(e));
  });

  it("removeEntity non-member is safe", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.removeEntity(e);
    assert.strictEqual(cell.entityCount, 0);
  });

  it("clear removes all entities", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    cell.addEntity(e1);
    cell.addEntity(e2);
    cell.clear();
    assert.strictEqual(cell.entityCount, 0);
    assert.ok(!cell.contains(e1));
    assert.ok(!cell.contains(e2));
  });

  it("contains returns correct membership", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    assert.ok(!cell.contains(e));
    cell.addEntity(e);
    assert.ok(cell.contains(e));
    cell.removeEntity(e);
    assert.ok(!cell.contains(e));
  });

  it("entities property exposes owned entity IDs", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    const ids = [...cell.entities];
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0], e);
  });
});

describe("StreamingManager", () => {
  it("createCell stores cell by name", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    const cell = sm.createCell("Village");
    assert.strictEqual(sm.getCell("Village"), cell);
    assert.ok(sm.hasCell("Village"));
  });

  it("createCell duplicate name throws", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("Village");
    assert.throws(() => sm.createCell("Village"));
  });

  it("createCell empty name throws", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    assert.throws(() => sm.createCell(""));
  });

  it("getCell returns null for unknown", () => {
    const w = createStreamingWorld();
    assert.strictEqual(w.streaming.getCell("Nope"), null);
  });

  it("hasCell returns false for unknown", () => {
    const w = createStreamingWorld();
    assert.ok(!w.streaming.hasCell("Nope"));
  });

  it("destroyCell removes cell", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("Village");
    sm.destroyCell("Village");
    assert.ok(!sm.hasCell("Village"));
  });

  it("destroyCell unknown throws", () => {
    const w = createStreamingWorld();
    assert.throws(() => w.streaming.destroyCell("Nope"));
  });

  it("destroyCell on loaded cell unloads first", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    const cell = sm.createCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    sm.load("Village");
    assert.ok(cell.loaded);
    sm.destroyCell("Village");
    assert.ok(!sm.hasCell("Village"));
    assert.ok(!w.isAlive(e));
  });

  it("load marks cell as loaded", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("Village");
    sm.load("Village");
    assert.ok(sm.getCell("Village").loaded);
  });

  it("load unknown throws", () => {
    const w = createStreamingWorld();
    assert.throws(() => w.streaming.load("Nope"));
  });

  it("load twice is idempotent", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("Village");
    sm.load("Village");
    sm.load("Village");
    assert.ok(sm.getCell("Village").loaded);
  });

  it("unload destroys entities", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    const cell = sm.createCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    sm.load("Village");
    sm.unload("Village");
    assert.ok(!cell.loaded);
    assert.ok(!w.isAlive(e));
    assert.strictEqual(cell.entityCount, 0);
  });

  it("unload unknown throws", () => {
    const w = createStreamingWorld();
    assert.throws(() => w.streaming.unload("Nope"));
  });

  it("unload on unloaded cell is safe", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("Village");
    sm.unload("Village");
    assert.ok(!sm.getCell("Village").loaded);
  });

  it("loadAll loads all cells", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("A");
    sm.createCell("B");
    sm.loadAll();
    assert.ok(sm.getCell("A").loaded);
    assert.ok(sm.getCell("B").loaded);
  });

  it("unloadAll unloads all cells", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("A");
    sm.createCell("B");
    sm.loadAll();
    sm.unloadAll();
    assert.ok(!sm.getCell("A").loaded);
    assert.ok(!sm.getCell("B").loaded);
  });

  it("unloadAll destroys entities", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    const a = sm.createCell("A");
    const b = sm.createCell("B");
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    a.addEntity(e1);
    b.addEntity(e2);
    sm.loadAll();
    sm.unloadAll();
    assert.ok(!w.isAlive(e1));
    assert.ok(!w.isAlive(e2));
  });

  it("loadedCells returns only loaded cells", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    sm.createCell("A");
    sm.createCell("B");
    sm.createCell("C");
    sm.load("A");
    sm.load("C");
    const loaded = sm.loadedCells();
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].name, "A");
    assert.strictEqual(loaded[1].name, "C");
  });

  it("cellCount returns number of cells", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    assert.strictEqual(sm.cellCount, 0);
    sm.createCell("A");
    assert.strictEqual(sm.cellCount, 1);
    sm.createCell("B");
    assert.strictEqual(sm.cellCount, 2);
    sm.destroyCell("A");
    assert.strictEqual(sm.cellCount, 1);
  });

  it("multiple cells do not interfere", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    const a = sm.createCell("A");
    const b = sm.createCell("B");
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    a.addEntity(e1);
    b.addEntity(e2);
    assert.strictEqual(a.entityCount, 1);
    assert.strictEqual(b.entityCount, 1);
    assert.ok(a.contains(e1));
    assert.ok(!a.contains(e2));
    assert.ok(b.contains(e2));
    assert.ok(!b.contains(e1));
  });
});

describe("StreamingManager — entity destruction cleanup", () => {
  it("destroyed entity removed from cell", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    w.destroyEntity(e);
    assert.strictEqual(cell.entityCount, 0);
    assert.ok(!cell.contains(e));
  });

  it("destroyed entity freed for reassignment to another cell", () => {
    const w = createStreamingWorld();
    const a = w.createStreamingCell("A");
    const b = w.createStreamingCell("B");
    const e = w.createEntity();
    a.addEntity(e);
    w.destroyEntity(e);
    const e2 = w.createEntity();
    b.addEntity(e2);
    assert.strictEqual(a.entityCount, 0);
    assert.strictEqual(b.entityCount, 1);
  });

  it("multiple destroyed entities cleaned up", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const entities = [];
    for (let i = 0; i < 10; i++) {
      const e = w.createEntity();
      cell.addEntity(e);
      entities.push(e);
    }
    for (let i = 0; i < entities.length; i++) {
      w.destroyEntity(entities[i]);
    }
    assert.strictEqual(cell.entityCount, 0);
  });
});

describe("World convenience methods", () => {
  it("streaming getter returns StreamingManager", () => {
    const w = createStreamingWorld();
    assert.ok(w.streaming instanceof StreamingManager);
  });

  it("streaming getter returns null without resource", () => {
    const w = createWorld();
    assert.strictEqual(w.streaming, undefined);
  });

  it("createStreamingCell delegates to manager", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    assert.ok(cell instanceof StreamingCell);
    assert.strictEqual(cell.name, "Village");
  });

  it("loadCell delegates to manager", () => {
    const w = createStreamingWorld();
    w.createStreamingCell("Village");
    w.loadCell("Village");
    assert.ok(w.streaming.getCell("Village").loaded);
  });

  it("unloadCell delegates to manager", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    w.loadCell("Village");
    w.unloadCell("Village");
    assert.ok(!cell.loaded);
    assert.ok(!w.isAlive(e));
  });

  it("createStreamingCell without resource throws", () => {
    const w = createWorld();
    assert.throws(() => w.createStreamingCell("Village"));
  });

  it("loadCell without resource throws", () => {
    const w = createWorld();
    assert.throws(() => w.loadCell("Village"));
  });

  it("unloadCell without resource throws", () => {
    const w = createWorld();
    assert.throws(() => w.unloadCell("Village"));
  });
});

describe("Streaming — edge cases", () => {
  it("repeated load/unload cycle is deterministic", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    const cell = sm.createCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    for (let i = 0; i < 5; i++) {
      sm.load("Village");
      sm.unload("Village");
    }
    assert.ok(!cell.loaded);
    assert.strictEqual(cell.entityCount, 0);
  });

  it("load preserves entities", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    w.loadCell("Village");
    assert.ok(w.isAlive(e));
    assert.ok(cell.contains(e));
    assert.strictEqual(cell.entityCount, 1);
  });

  it("clear does not destroy entities", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    cell.clear();
    assert.ok(w.isAlive(e));
    assert.strictEqual(cell.entityCount, 0);
  });

  it("entities can be added to unloaded cell then loaded", () => {
    const w = createStreamingWorld();
    const cell = w.createStreamingCell("Village");
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    cell.addEntity(e1);
    cell.addEntity(e2);
    w.loadCell("Village");
    assert.ok(cell.loaded);
    assert.strictEqual(cell.entityCount, 2);
    assert.ok(cell.contains(e1));
    assert.ok(cell.contains(e2));
  });

  it("loaded state is false after destroyCell", () => {
    const w = createStreamingWorld();
    const sm = w.streaming;
    const cell = sm.createCell("Village");
    const e = w.createEntity();
    cell.addEntity(e);
    sm.load("Village");
    sm.destroyCell("Village");
    assert.ok(!sm.hasCell("Village"));
  });

  it("world without streaming manager works normally", () => {
    const w = createWorld();
    const e = w.createEntity();
    w.destroyEntity(e);
    assert.ok(!w.isAlive(e));
  });
});