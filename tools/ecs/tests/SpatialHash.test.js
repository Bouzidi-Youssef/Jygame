import { describe, it } from "node:test";
import * as assert from "node:assert";
import { SpatialHash } from "../../../collision/SpatialHash.js";

describe("SpatialHash (pure index)", () => {
  // ─── Construction ────────────────────────────────────
  describe("construction", () => {
    it("creates with default cell size", () => {
      const h = new SpatialHash();
      assert.strictEqual(h.cellSize, 64);
    });

    it("creates with custom cell size", () => {
      const h = new SpatialHash(32);
      assert.strictEqual(h.cellSize, 32);
    });

    it("starts empty", () => {
      const h = new SpatialHash();
      assert.strictEqual(h.cells.size, 0);
    });

    it("queryStamp starts at 0", () => {
      const h = new SpatialHash();
      assert.strictEqual(h._queryStamp, 0);
    });
  });

  // ─── Insertion ───────────────────────────────────────
  describe("insertion", () => {
    it("inserts a primitive entry", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      assert.ok(h.cells.size > 0);
    });

    it("stores entry with correct id", () => {
      const h = new SpatialHash(64);
      h.insert(42, 0, 0, 32, 32);
      const found = h.queryRect({ left: -20, right: 20, top: -20, bottom: 20 });
      assert.strictEqual(found[0], 42);
    });

    it("inserts multiple entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.insert(2, 100, 100, 32, 32);
      const found = h.queryRect({ left: -50, right: 50, top: -50, bottom: 50 });
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0], 1);
    });

    it("inserts entries at same position", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.insert(2, 0, 0, 32, 32);
      const found = h.queryRect({ left: -20, right: 20, top: -20, bottom: 20 });
      assert.strictEqual(found.length, 2);
      assert.ok(found.includes(1));
      assert.ok(found.includes(2));
    });

    it("inserts zero-size entry", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 0, 0);
      const found = h.queryPoint({ x: 0, y: 0 });
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0], 1);
    });

    it("inserts entry spanning multiple cells", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 200, 200);
      const left = h.queryRect({ left: -150, right: -50, top: -50, bottom: 50 });
      const right = h.queryRect({ left: 50, right: 150, top: -50, bottom: 50 });
      assert.ok(left.length > 0);
      assert.ok(right.length > 0);
    });

    it("entry pre-computes left/right/top/bottom", () => {
      const h = new SpatialHash(64);
      h.insert(1, 10, 20, 16, 24);
      for (const cell of h.cells.values()) {
        for (const e of cell) {
          assert.strictEqual(e.l, 2);
          assert.strictEqual(e.r, 18);
          assert.strictEqual(e.t, 8);
          assert.strictEqual(e.b, 32);
          assert.strictEqual(e.id, 1);
        }
      }
    });
  });

  // ─── Clear ───────────────────────────────────────────
  describe("clear", () => {
    it("removes all entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.clear();
      assert.strictEqual(h.cells.size, 0);
    });

    it("resets query stamp", () => {
      const h = new SpatialHash(64);
      h.queryRect({ left: -10, right: 10, top: -10, bottom: 10 });
      assert.ok(h._queryStamp > 0);
      h.clear();
      assert.strictEqual(h._queryStamp, 0);
    });

    it("allows re-insertion after clear", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.clear();
      h.insert(2, 0, 0, 32, 32);
      const found = h.queryRect({ left: -20, right: 20, top: -20, bottom: 20 });
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0], 2);
    });
  });

  // ─── queryRect ───────────────────────────────────────
  describe("queryRect", () => {
    it("finds overlapping entry", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryRect({ left: -20, right: 20, top: -20, bottom: 20 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], 1);
    });

    it("returns empty for non-overlapping rect", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryRect({ left: 100, right: 200, top: 100, bottom: 200 });
      assert.strictEqual(hits.length, 0);
    });

    it("touching edges counts as hit", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryRect({ left: -16, right: 0, top: -16, bottom: 0 });
      assert.strictEqual(hits.length, 1);
    });

    it("finds multiple overlapping entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.insert(2, 10, 10, 32, 32);
      h.insert(3, 500, 500, 32, 32);
      const hits = h.queryRect({ left: -20, right: 30, top: -20, bottom: 30 });
      assert.strictEqual(hits.length, 2);
      assert.ok(hits.includes(1));
      assert.ok(hits.includes(2));
    });

    it("large rect matches everything", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.insert(2, 500, 500, 32, 32);
      h.insert(3, -300, -300, 32, 32);
      const hits = h.queryRect({ left: -1000, right: 1000, top: -1000, bottom: 1000 });
      assert.strictEqual(hits.length, 3);
    });
  });

  // ─── queryPoint ──────────────────────────────────────
  describe("queryPoint", () => {
    it("returns hit for point inside entry", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryPoint({ x: 0, y: 0 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], 1);
    });

    it("returns empty for point outside", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryPoint({ x: 100, y: 100 });
      assert.strictEqual(hits.length, 0);
    });

    it("boundary point is inside", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      assert.strictEqual(h.queryPoint({ x: -16, y: -16 }).length, 1);
      assert.strictEqual(h.queryPoint({ x: 16, y: -16 }).length, 1);
      assert.strictEqual(h.queryPoint({ x: -16, y: 16 }).length, 1);
      assert.strictEqual(h.queryPoint({ x: 16, y: 16 }).length, 1);
    });
  });

  // ─── queryCircle ─────────────────────────────────────
  describe("queryCircle", () => {
    it("returns hit for circle overlapping entry", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryCircle(0, 0, 10);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], 1);
    });

    it("returns empty for far circle", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryCircle(100, 100, 10);
      assert.strictEqual(hits.length, 0);
    });

    it("tangent circle touches entry edge", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryCircle(16, 0, 5);
      assert.strictEqual(hits.length, 1);
    });

    it("returns multiple hits", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.insert(2, 10, 10, 32, 32);
      const hits = h.queryCircle(0, 0, 30);
      assert.strictEqual(hits.length, 2);
    });
  });

  // ─── queryAABB ───────────────────────────────────────
  describe("queryAABB", () => {
    it("returns hit for overlapping AABB", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryAABB(0, 0, 32, 32);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], 1);
    });

    it("returns empty for non-overlapping AABB", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const hits = h.queryAABB(100, 100, 32, 32);
      assert.strictEqual(hits.length, 0);
    });
  });

  // ─── Raycast ─────────────────────────────────────────
  describe("raycast", () => {
    it("returns hit for entity along ray", () => {
      const h = new SpatialHash(64);
      h.insert(1, 50, 0, 32, 32);
      const hits = h.raycast(0, 0, 1, 0, 100);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], 1);
    });

    it("returns empty when ray misses", () => {
      const h = new SpatialHash(64);
      h.insert(1, 50, 50, 32, 32);
      const hits = h.raycast(0, 0, 1, 0, 100);
      assert.strictEqual(hits.length, 0);
    });

    it("returns multiple hits along ray path", () => {
      const h = new SpatialHash(64);
      h.insert(1, 30, 0, 32, 32);
      h.insert(2, 60, 0, 32, 32);
      const hits = h.raycast(0, 0, 1, 0, 100);
      assert.strictEqual(hits.length, 2);
    });

    it("short ray does not reach", () => {
      const h = new SpatialHash(64);
      h.insert(1, 50, 0, 32, 32);
      const hits = h.raycast(0, 0, 1, 0, 10);
      assert.strictEqual(hits.length, 0);
    });

    it("raycast in negative direction", () => {
      const h = new SpatialHash(64);
      h.insert(1, -50, 0, 32, 32);
      const hits = h.raycast(0, 0, -1, 0, 100);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], 1);
    });
  });

  // ─── Empty Hash ──────────────────────────────────────
  describe("empty hash", () => {
    it("queryRect returns empty", () => {
      const h = new SpatialHash(64);
      assert.deepStrictEqual(h.queryRect({ left: -10, right: 10, top: -10, bottom: 10 }), []);
    });

    it("queryPoint returns empty", () => {
      const h = new SpatialHash(64);
      assert.deepStrictEqual(h.queryPoint({ x: 0, y: 0 }), []);
    });

    it("queryCircle returns empty", () => {
      const h = new SpatialHash(64);
      assert.deepStrictEqual(h.queryCircle(0, 0, 10), []);
    });

    it("queryAABB returns empty", () => {
      const h = new SpatialHash(64);
      assert.deepStrictEqual(h.queryAABB(0, 0, 32, 32), []);
    });

    it("raycast returns empty", () => {
      const h = new SpatialHash(64);
      assert.deepStrictEqual(h.raycast(0, 0, 1, 0, 100), []);
    });
  });

  // ─── Reused Output Arrays ────────────────────────────
  describe("reused output arrays", () => {
    it("queryRect accepts caller-provided array", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const out = [];
      const result = h.queryRect({ left: -20, right: 20, top: -20, bottom: 20 }, out);
      assert.strictEqual(result, out);
      assert.strictEqual(out.length, 1);
    });

    it("queryPoint accepts caller-provided array", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const out = [];
      const result = h.queryPoint({ x: 0, y: 0 }, out);
      assert.strictEqual(result, out);
      assert.strictEqual(out.length, 1);
    });

    it("queryCircle accepts caller-provided array", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const out = [];
      const result = h.queryCircle(0, 0, 10, out);
      assert.strictEqual(result, out);
    });

    it("queryAABB accepts caller-provided array", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const out = [];
      const result = h.queryAABB(0, 0, 32, 32, out);
      assert.strictEqual(result, out);
    });

    it("raycast accepts caller-provided array", () => {
      const h = new SpatialHash(64);
      h.insert(1, 50, 0, 32, 32);
      const out = [];
      const result = h.raycast(0, 0, 1, 0, 100, out);
      assert.strictEqual(result, out);
    });

    it("appends to caller-provided array", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const out = [99, 98, 97];
      const result = h.queryRect({ left: -20, right: 20, top: -20, bottom: 20 }, out);
      assert.strictEqual(result, out);
      assert.strictEqual(out.length, 4);
      assert.strictEqual(out[3], 1);
    });
  });

  // ─── Query Stamping ──────────────────────────────────
  describe("query stamping", () => {
    it("deduplicates entries spanning multiple cells", () => {
      const h = new SpatialHash(10);
      h.insert(1, 0, 0, 40, 40);
      const hits = h.queryRect({ left: -30, right: 30, top: -30, bottom: 30 });
      assert.strictEqual(hits.length, 1);
    });

    it("deduplicates across multiple queries", () => {
      const h = new SpatialHash(10);
      h.insert(1, 0, 0, 40, 40);
      const first = h.queryRect({ left: -30, right: 30, top: -30, bottom: 30 });
      assert.strictEqual(first.length, 1);
      const second = h.queryRect({ left: -30, right: 30, top: -30, bottom: 30 });
      assert.strictEqual(second.length, 1);
    });

    it("stamp increments after each query", () => {
      const h = new SpatialHash(64);
      const s0 = h._queryStamp;
      h.queryRect({ left: -10, right: 10, top: -10, bottom: 10 });
      assert.strictEqual(h._queryStamp, s0 + 1);
      h.queryCircle(0, 0, 10);
      assert.strictEqual(h._queryStamp, s0 + 2);
    });
  });

  // ─── Negative Coordinates ────────────────────────────
  describe("negative coordinates", () => {
    it("inserts at negative position", () => {
      const h = new SpatialHash(64);
      h.insert(1, -50, -50, 32, 32);
      const hits = h.queryRect({ left: -70, right: -30, top: -70, bottom: -30 });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0], 1);
    });

    it("point query at negative position works", () => {
      const h = new SpatialHash(64);
      h.insert(1, -50, -50, 32, 32);
      const hits = h.queryPoint({ x: -50, y: -50 });
      assert.strictEqual(hits.length, 1);
    });

    it("circle query at negative position works", () => {
      const h = new SpatialHash(64);
      h.insert(1, -50, -50, 32, 32);
      const hits = h.queryCircle(-50, -50, 10);
      assert.strictEqual(hits.length, 1);
    });
  });

  // ─── Boundary Conditions ─────────────────────────────
  describe("boundary conditions", () => {
    it("entry exactly at cell boundary", () => {
      const h = new SpatialHash(64);
      const edge = 32;
      h.insert(1, edge, edge, 0, 0);
      const hits = h.queryPoint({ x: edge, y: edge });
      assert.strictEqual(hits.length, 1);
    });

    it("entry spanning origin", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 200, 200);
      const hits = h.queryRect({ left: -10, right: 10, top: -10, bottom: 10 });
      assert.strictEqual(hits.length, 1);
    });

    it("query rect at origin", () => {
      const h = new SpatialHash(64);
      h.insert(1, 50, 50, 32, 32);
      const hits = h.queryRect({ left: 0, right: 0, top: 0, bottom: 0 });
      assert.strictEqual(hits.length, 0);
    });
  });

  // ─── Multiple Cells ──────────────────────────────────
  describe("multiple occupied cells", () => {
    it("entries in different cells all found by large query", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      h.insert(2, 200, 200, 32, 32);
      h.insert(3, -200, -200, 32, 32);
      const hits = h.queryRect({ left: -300, right: 300, top: -300, bottom: 300 });
      assert.strictEqual(hits.length, 3);
    });

    it("entries in adjacent cells found by spanning query", () => {
      const h = new SpatialHash(64);
      h.insert(1, 30, 30, 32, 32);
      h.insert(2, 90, 90, 32, 32);
      const hits = h.queryRect({ left: 0, right: 120, top: 0, bottom: 120 });
      assert.strictEqual(hits.length, 2);
    });
  });

  // ─── No Sprite / ECS / Entity References ─────────────
  describe("no external references", () => {
    it("stores only primitive data in entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 10, 20, 16, 24);
      for (const cell of h.cells.values()) {
        for (const e of cell) {
          assert.strictEqual(typeof e.id, "number");
          assert.strictEqual(typeof e.l, "number");
          assert.strictEqual(typeof e.r, "number");
          assert.strictEqual(typeof e.t, "number");
          assert.strictEqual(typeof e.b, "number");
          assert.strictEqual(typeof e._qs, "number");
          assert.strictEqual(Object.keys(e).length, 6);
        }
      }
    });

    it("has no visible property on entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      for (const cell of h.cells.values()) {
        for (const e of cell) {
          assert.strictEqual(e.visible, undefined);
        }
      }
    });

    it("has no transform property on entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      for (const cell of h.cells.values()) {
        for (const e of cell) {
          assert.strictEqual(e.transform, undefined);
        }
      }
    });

    it("has no collider property on entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      for (const cell of h.cells.values()) {
        for (const e of cell) {
          assert.strictEqual(e.collider, undefined);
        }
      }
    });

    it("has no __shId or __shStamp on entries", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      for (const cell of h.cells.values()) {
        for (const e of cell) {
          assert.strictEqual(e.__shId, undefined);
          assert.strictEqual(e.__shStamp, undefined);
        }
      }
    });
  });

  // ─── No Legacy Methods ───────────────────────────────
  describe("no legacy methods", () => {
    it("has no rebuild method", () => {
      const h = new SpatialHash(64);
      assert.strictEqual(typeof h.rebuild, "undefined");
    });

    it("has no collideRect method", () => {
      const h = new SpatialHash(64);
      assert.strictEqual(typeof h.collideRect, "undefined");
    });

    it("has no collidePoint method", () => {
      const h = new SpatialHash(64);
      assert.strictEqual(typeof h.collidePoint, "undefined");
    });

    it("has no collideSprite method", () => {
      const h = new SpatialHash(64);
      assert.strictEqual(typeof h.collideSprite, "undefined");
    });

    it("has no collideGroup method", () => {
      const h = new SpatialHash(64);
      assert.strictEqual(typeof h.collideGroup, "undefined");
    });

    it("has no _insert method", () => {
      const h = new SpatialHash(64);
      assert.strictEqual(typeof h._insert, "undefined");
    });

    it("has no _seen Set", () => {
      const h = new SpatialHash(64);
      assert.strictEqual(h._seen, undefined);
    });
  });

  // ─── Performance ─────────────────────────────────────
  describe("performance", () => {
    it("handles 1000 entries", () => {
      const h = new SpatialHash(64);
      for (let i = 0; i < 1000; i++) {
        h.insert(i, (i % 100) * 30, Math.floor(i / 100) * 30, 10, 10);
      }
      const hits = h.queryRect({ left: -10, right: 10, top: -10, bottom: 10 });
      assert.ok(hits.length >= 1);
    });

    it("no per-query object allocation by queryRect", () => {
      const h = new SpatialHash(64);
      h.insert(1, 0, 0, 32, 32);
      const keysBefore = Object.keys(h);
      h.queryRect({ left: -20, right: 20, top: -20, bottom: 20 });
      const keysAfter = Object.keys(h);
      assert.deepStrictEqual(keysAfter, keysBefore);
    });
  });
});
