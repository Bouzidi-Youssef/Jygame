import { describe, it } from "node:test";
import * as assert from "node:assert";
import { EntityManager } from "../../../ecs/core/EntityManager.js";

describe("EntityManager", () => {
  // ─── create ──────────────────────────────────────────────────

  describe("create", () => {
    it("returns entity 1 for the first entity (slot 0 is reserved)", () => {
      const em = new EntityManager();
      const e = em.create();
      assert.strictEqual(e, 1);
    });

    it("returns monotonic increasing IDs", () => {
      const em = new EntityManager();
      const e1 = em.create();
      const e2 = em.create();
      const e3 = em.create();
      assert.strictEqual(e1, 1);
      assert.strictEqual(e2, 2);
      assert.strictEqual(e3, 3);
    });

    it("increments aliveCount", () => {
      const em = new EntityManager();
      assert.strictEqual(em.aliveCount, 0);
      em.create();
      assert.strictEqual(em.aliveCount, 1);
      em.create();
      assert.strictEqual(em.aliveCount, 2);
    });
  });

  // ─── isAlive ─────────────────────────────────────────────────

  describe("isAlive", () => {
    it("returns true for a created entity", () => {
      const em = new EntityManager();
      const e = em.create();
      assert.strictEqual(em.isAlive(e), true);
    });

    it("returns false for entity 0 (null sentinel)", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive(0), false);
    });

    it("returns false for a destroyed entity", () => {
      const em = new EntityManager();
      const e = em.create();
      em.destroy(e);
      assert.strictEqual(em.isAlive(e), false);
    });

    it("returns false for unallocated slots", () => {
      const em = new EntityManager({ initialCapacity: 64 });
      // Slot 100 has never been allocated
      const nonExistent = 100;
      assert.strictEqual(em.isAlive(nonExistent), false);
    });

    it("returns false for NaN", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive(NaN), false);
    });

    it("returns false for negative numbers", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive(-1), false);
    });

    it("returns false for floating point numbers", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive(1.5), false);
    });

    it("returns false for strings", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive("1"), false);
    });

    it("returns false for null", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive(null), false);
    });

    it("returns false for undefined", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive(undefined), false);
    });

    it("returns false for objects", () => {
      const em = new EntityManager();
      assert.strictEqual(em.isAlive({}), false);
    });

    it("never throws", () => {
      const em = new EntityManager();
      em.create();
      assert.doesNotThrow(() => em.isAlive(NaN));
      assert.doesNotThrow(() => em.isAlive(Infinity));
      assert.doesNotThrow(() => em.isAlive(-1));
      assert.doesNotThrow(() => em.isAlive("bad"));
      assert.doesNotThrow(() => em.isAlive(null));
      assert.doesNotThrow(() => em.isAlive(undefined));
      assert.doesNotThrow(() => em.isAlive(0));
      assert.doesNotThrow(() => em.isAlive(99999999));
    });
  });

  // ─── destroy ─────────────────────────────────────────────────

  describe("destroy", () => {
    it("makes the entity no longer alive", () => {
      const em = new EntityManager();
      const e = em.create();
      em.destroy(e);
      assert.strictEqual(em.isAlive(e), false);
    });

    it("decrements aliveCount", () => {
      const em = new EntityManager();
      em.create();
      em.create();
      const e3 = em.create();
      assert.strictEqual(em.aliveCount, 3);
      em.destroy(e3);
      assert.strictEqual(em.aliveCount, 2);
    });

    it("is a no-op for entity 0", () => {
      const em = new EntityManager();
      assert.doesNotThrow(() => em.destroy(0));
    });

    it("is a no-op for already destroyed entity (double destroy)", () => {
      const em = new EntityManager();
      const e = em.create();
      em.destroy(e);
      assert.doesNotThrow(() => em.destroy(e));
      assert.strictEqual(em.isAlive(e), false);
    });

    it("is a no-op for stale entity with wrong generation", () => {
      const em = new EntityManager();
      const e1 = em.create();
      em.destroy(e1);
      // e1 is now stale (gen 0 → gen 1)
      // Creating again reuses slot 1 with gen 1
      const e2 = em.create();
      assert.notStrictEqual(e1, e2);
      // Destroying the stale e1 should be a no-op
      assert.doesNotThrow(() => em.destroy(e1));
      // e2 (the recycled entity) should still be alive
      assert.strictEqual(em.isAlive(e2), true);
    });

    it("is a no-op for out-of-range slot", () => {
      const em = new EntityManager({ initialCapacity: 64 });
      assert.doesNotThrow(() => em.destroy(999999));
    });

    it("is a no-op for NaN", () => {
      const em = new EntityManager();
      assert.doesNotThrow(() => em.destroy(NaN));
    });

    it("is a no-op for negative numbers", () => {
      const em = new EntityManager();
      assert.doesNotThrow(() => em.destroy(-1));
    });

    it("is a no-op for floating point", () => {
      const em = new EntityManager();
      assert.doesNotThrow(() => em.destroy(1.5));
    });

    it("never throws for any input", () => {
      const em = new EntityManager();
      em.create();
      assert.doesNotThrow(() => em.destroy(NaN));
      assert.doesNotThrow(() => em.destroy(Infinity));
      assert.doesNotThrow(() => em.destroy(-1));
      assert.doesNotThrow(() => em.destroy(1.5));
      assert.doesNotThrow(() => em.destroy("bad"));
      assert.doesNotThrow(() => em.destroy(null));
      assert.doesNotThrow(() => em.destroy(undefined));
      assert.doesNotThrow(() => em.destroy(0));
      assert.doesNotThrow(() => em.destroy(99999999));
    });
  });

  // ─── Slot Reuse / Recreate ───────────────────────────────────

  describe("slot reuse", () => {
    it("reuses slots from the free list", () => {
      const em = new EntityManager();
      const e1 = em.create();
      const e2 = em.create();
      const e3 = em.create();
      assert.strictEqual(e1, 1);
      assert.strictEqual(e2, 2);
      assert.strictEqual(e3, 3);

      em.destroy(e2);  // slot 2 goes to free list

      const e4 = em.create();
      // Should reuse slot 2, but with incremented generation
      // gen 0 → gen 1, so id = (1 << 24) | 2 = 16777218
      assert.strictEqual(e4, (1 << 24) | 2);
    });

    it("reuses slots in LIFO order", () => {
      const em = new EntityManager();
      const e1 = em.create();
      const e2 = em.create();
      const e3 = em.create();

      em.destroy(e1);  // free list: [1]
      em.destroy(e3);  // free list: [1, 3]

      const e4 = em.create();  // pops 3
      const e5 = em.create();  // pops 1

      assert.strictEqual(e4, (1 << 24) | 3);
      assert.strictEqual(e5, (1 << 24) | 1);
    });

    it("recycled entity has correct generation", () => {
      const em = new EntityManager();
      const original = em.create();
      em.destroy(original);

      // Original ID is stale
      assert.strictEqual(em.isAlive(original), false);

      const recycled = em.create();
      // Recycled ID has incremented generation
      assert.strictEqual(em.isAlive(recycled), true);
      assert.notStrictEqual(recycled, original);
    });
  });

  // ─── Generation ──────────────────────────────────────────────

  describe("generation", () => {
    it("increments generation on destroy", () => {
      const em = new EntityManager();

      // First create: gen 0, slot 1 → entity 1
      const e1 = em.create();
      assert.strictEqual(e1, 1);

      em.destroy(e1);

      // Recreate: gen 1, slot 1 → entity (1 << 24) | 1 = 16777217
      const e2 = em.create();
      assert.strictEqual(e2, (1 << 24) | 1);
    });

    it("stale entity ID is not alive after recreating the slot", () => {
      const em = new EntityManager();
      const e1 = em.create();
      em.destroy(e1);

      em.create(); // reuses slot 1

      // e1 (gen 0, slot 1) is stale
      assert.strictEqual(em.isAlive(e1), false);
    });

    it("wraps generation at 255", () => {
      const em = new EntityManager();
      const slot = 5;

      em._gen[slot] = 255;
      // Force slot 5 to be allocatable by making free list contain it
      em._freeList[0] = slot;
      em._freeCount = 1;

      const e = em.create();
      assert.strictEqual(e, ((255 << 24) | slot) >>> 0);
      assert.strictEqual(em.isAlive(e), true);

      em.destroy(e);
      // Generation wraps: 255 + 1 = 256 → 0 (Uint8)

      // Recreate should have gen = 0
      em._freeList[0] = slot;
      em._freeCount = 1;
      const e2 = em.create();
      assert.strictEqual(e2, (0 << 24) | slot);
      assert.strictEqual(em.isAlive(e2), true);
      // The previous ID with gen=255 should be stale
      assert.strictEqual(em.isAlive(e), false);
    });

    it("generation wraps through 256 cycles", () => {
      const em = new EntityManager();
      const CYCLES = 257; // one past wrap

      let entity = em.create(); // slot 1

      for (let i = 0; i < CYCLES; i++) {
        em.destroy(entity);
        entity = em.create(); // reuses slot 1 with incremented gen
      }

      // After 257 cycles, gen should be 1 (257 % 256 = 1)
      const expectedGen = CYCLES % 256;
      const expectedId = ((expectedGen << 24) | 1) >>> 0;
      assert.strictEqual(entity, expectedId);

      // All previous generations should be stale
      for (let g = 0; g < expectedGen; g++) {
        const oldId = ((g << 24) | 1) >>> 0;
        assert.strictEqual(em.isAlive(oldId), false);
      }

      // Only the current entity is alive
      assert.strictEqual(em.isAlive(entity), true);
    });
  });

  // ─── setLocation / getLocation ──────────────────────────────

  describe("setLocation", () => {
    it("stores archetype and row for an entity", () => {
      const em = new EntityManager();
      const e = em.create();
      em.setLocation(e, 5, 10);

      const loc = em.getLocation(e);
      assert.deepStrictEqual(loc, { archetype: 5, row: 10 });
    });

    it("overwrites previous location", () => {
      const em = new EntityManager();
      const e = em.create();
      em.setLocation(e, 5, 10);
      em.setLocation(e, 3, 7);

      const loc = em.getLocation(e);
      assert.deepStrictEqual(loc, { archetype: 3, row: 7 });
    });

    it("throws TypeError for NaN entity", () => {
      const em = new EntityManager();
      assert.throws(() => em.setLocation(NaN, 1, 0), TypeError);
    });

    it("throws TypeError for negative entity", () => {
      const em = new EntityManager();
      assert.throws(() => em.setLocation(-1, 1, 0), TypeError);
    });

    it("throws TypeError for floating point entity", () => {
      const em = new EntityManager();
      assert.throws(() => em.setLocation(1.5, 1, 0), TypeError);
    });

    it("throws Error for entity 0", () => {
      const em = new EntityManager();
      assert.throws(() => em.setLocation(0, 1, 0), /null sentinel/i);
    });

    it("throws Error for stale entity", () => {
      const em = new EntityManager();
      const e = em.create();
      em.destroy(e);
      assert.throws(
        () => em.setLocation(e, 1, 0),
        /stale entity|generation mismatch/i
      );
    });

    it("throws Error for out-of-range slot", () => {
      const em = new EntityManager({ initialCapacity: 64 });
      // Slot 100 hasn't been allocated yet, entity = 100, gen = 0
      // But slot 100 < 64, so it's out of range
      assert.throws(
        () => em.setLocation(100, 1, 0),
        /exceeds capacity/i
      );
    });

    it("persists location across slot reuse", () => {
      const em = new EntityManager();
      const e1 = em.create();
      em.setLocation(e1, 5, 10);
      em.destroy(e1);

      // Recreate — should get clean location (archetype=0, row=0)
      const e2 = em.create();
      const loc = em.getLocation(e2);
      assert.strictEqual(loc.archetype, 0);
      assert.strictEqual(loc.row, 0);
    });
  });

  describe("getLocation", () => {
    it("returns null for NaN", () => {
      const em = new EntityManager();
      assert.strictEqual(em.getLocation(NaN), null);
    });

    it("returns null for negative", () => {
      const em = new EntityManager();
      assert.strictEqual(em.getLocation(-1), null);
    });

    it("returns null for entity 0", () => {
      const em = new EntityManager();
      assert.strictEqual(em.getLocation(0), null);
    });

    it("returns null for stale entity", () => {
      const em = new EntityManager();
      const e = em.create();
      em.destroy(e);
      assert.strictEqual(em.getLocation(e), null);
    });

    it("returns null for out-of-range slot", () => {
      const em = new EntityManager({ initialCapacity: 64 });
      assert.strictEqual(em.getLocation(999999), null);
    });

    it("never throws", () => {
      const em = new EntityManager();
      em.create();
      assert.doesNotThrow(() => em.getLocation(NaN));
      assert.doesNotThrow(() => em.getLocation(-1));
      assert.doesNotThrow(() => em.getLocation(1.5));
      assert.doesNotThrow(() => em.getLocation(0));
      assert.doesNotThrow(() => em.getLocation(null));
      assert.doesNotThrow(() => em.getLocation(undefined));
      assert.doesNotThrow(() => em.getLocation("bad"));
    });
  });

  describe("getArchetype / getRow", () => {
    it("return the expected values from setLocation", () => {
      const em = new EntityManager();
      const e = em.create();
      em.setLocation(e, 7, 3);
      assert.strictEqual(em.getArchetype(e), 7);
      assert.strictEqual(em.getRow(e), 3);
    });

    it("return null for stale entities", () => {
      const em = new EntityManager();
      const e = em.create();
      em.destroy(e);
      assert.strictEqual(em.getArchetype(e), null);
      assert.strictEqual(em.getRow(e), null);
    });
  });

  // ─── Capacity Growth ─────────────────────────────────────────

  describe("capacity growth", () => {
    it("starts at the configured initial capacity", () => {
      const em = new EntityManager({ initialCapacity: 64 });
      assert.strictEqual(em.capacity, 64);
    });

    it("doubles capacity when more entities are created", () => {
      const em = new EntityManager({ initialCapacity: 4, maxEntities: 256 });
      const entities = [];
      for (let i = 0; i < 5; i++) {
        entities.push(em.create());
      }
      // Should have grown to 8
      assert.strictEqual(em.capacity, 8);
    });

    it("grows multiple times as needed", () => {
      const em = new EntityManager({ initialCapacity: 4, maxEntities: 256 });
      const entities = [];
      for (let i = 0; i < 20; i++) {
        entities.push(em.create());
      }
      // 4 → 8 → 16 → 32
      assert.strictEqual(em.capacity, 32);
    });

    it("preserves alive entities across growth", () => {
      const em = new EntityManager({ initialCapacity: 4, maxEntities: 256 });
      const entities = [];
      for (let i = 0; i < 4; i++) {
        entities.push(em.create());
        em.setLocation(entities[i], i + 1, i * 10);
      }

      // Trigger growth
      const e5 = em.create();
      em.setLocation(e5, 5, 40);

      // Verify all previous entities are still alive with correct locations
      for (let i = 0; i < 4; i++) {
        assert.strictEqual(em.isAlive(entities[i]), true);
        const loc = em.getLocation(entities[i]);
        assert.strictEqual(loc.archetype, i + 1);
        assert.strictEqual(loc.row, i * 10);
      }

      assert.strictEqual(em.isAlive(e5), true);
      assert.strictEqual(em.getArchetype(e5), 5);
    });

    it("preserves generations across growth", () => {
      const em = new EntityManager({ initialCapacity: 4, maxEntities: 256 });
      const e1 = em.create(); // slot 1
      em.create(); // slot 2
      em.create(); // slot 3
      em.create(); // slot 4
      em.destroy(e1); // gen[1] = 1, free list = [1]

      // Trigger growth (capacity 4 → 8)
      const recycled = em.create(); // reuses slot 1 from free list, gen 1
      assert.strictEqual(recycled, ((1 << 24) | 1) >>> 0);
    });

    it("throws when max entities is reached", () => {
      const em = new EntityManager({ initialCapacity: 4, maxEntities: 8 });
      for (let i = 0; i < 8; i++) em.create();

      assert.throws(
        () => em.create(),
        /maximum entity count/i
      );
    });

    it("respects maxEntities cap on entity count", () => {
      const em = new EntityManager({ initialCapacity: 4, maxEntities: 10 });
      // 4 → 8 → 16 (growth always doubles, maxEntities controls alive count)
      for (let i = 0; i < 10; i++) em.create();

      assert.strictEqual(em.capacity, 16);

      assert.throws(
        () => em.create(),
        /maximum entity count/i
      );
    });
  });

  // ─── Constructor Validation ──────────────────────────────────

  describe("constructor validation", () => {
    it("accepts default options", () => {
      const em = new EntityManager();
      assert.ok(em);
      assert.strictEqual(em.capacity, 64);
    });

    it("rejects initialCapacity < 1", () => {
      assert.throws(
        () => new EntityManager({ initialCapacity: 0 }),
        RangeError
      );
    });

    it("rejects maxEntities < 1", () => {
      assert.throws(
        () => new EntityManager({ maxEntities: 0 }),
        RangeError
      );
    });

    it("rejects maxEntities > 2^24", () => {
      assert.throws(
        () => new EntityManager({ maxEntities: 0x1000001 }),
        RangeError
      );
    });
  });

  // ─── aliveCount ──────────────────────────────────────────────

  describe("aliveCount", () => {
    it("tracks alive entities correctly through create/destroy cycles", () => {
      const em = new EntityManager();

      assert.strictEqual(em.aliveCount, 0);

      const e1 = em.create();
      assert.strictEqual(em.aliveCount, 1);

      const e2 = em.create();
      assert.strictEqual(em.aliveCount, 2);

      em.destroy(e1);
      assert.strictEqual(em.aliveCount, 1);

      em.destroy(e2);
      assert.strictEqual(em.aliveCount, 0);

      // Recreate
      em.create();
      assert.strictEqual(em.aliveCount, 1);
    });

    it("is not affected by no-op destroy on stale entities", () => {
      const em = new EntityManager();
      const e = em.create();
      em.destroy(e);
      assert.strictEqual(em.aliveCount, 0);

      // No-op destroy should not decrement again
      em.destroy(e);
      assert.strictEqual(em.aliveCount, 0);
    });
  });

  // ─── destroy() lifecycle method ──────────────────────────────

  describe("destroy() lifecycle method", () => {
    it("clears all state", () => {
      const em = new EntityManager();
      em.create();
      em.create();
      em.create();
      assert.strictEqual(em.aliveCount, 3);
      assert.strictEqual(em.capacity, 64);

      em.destroy(); // lifecycle clear

      assert.strictEqual(em.aliveCount, 0);
      assert.strictEqual(em.capacity, 64);
    });

    it("allows creation after lifecycle destroy", () => {
      const em = new EntityManager();
      em.create();
      em.destroy(); // lifecycle clear

      const e = em.create();
      assert.strictEqual(e, 1); // fresh start
      assert.strictEqual(em.isAlive(e), true);
      assert.strictEqual(em.aliveCount, 1);
    });

    it("resets nextSlot to 1", () => {
      const em = new EntityManager();
      em.create();
      em.create();
      em.create();
      em.destroy();

      const e = em.create();
      assert.strictEqual(e, 1);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles single entity lifecycle", () => {
      const em = new EntityManager();
      const e = em.create();
      assert.strictEqual(em.aliveCount, 1);
      assert.strictEqual(em.isAlive(e), true);

      em.setLocation(e, 1, 0);
      assert.deepStrictEqual(em.getLocation(e), { archetype: 1, row: 0 });

      em.destroy(e);
      assert.strictEqual(em.aliveCount, 0);
      assert.strictEqual(em.isAlive(e), false);
      assert.strictEqual(em.getLocation(e), null);
    });

    it("handles destroy-recreate cycle for the same slot", () => {
      const em = new EntityManager();
      const ids = [];

      for (let i = 0; i < 10; i++) {
        const e = em.create();
        ids.push(e);
        em.destroy(e);
      }

      // All should have been the same slot (slot 1) with increasing generations
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(ids[i], (i << 24) | 1);
        assert.strictEqual(em.isAlive(ids[i]), false);
      }

      // After recycle
      assert.strictEqual(em.isAlive(((0 << 24) | 1) >>> 0), false);
      assert.strictEqual(em.isAlive(((9 << 24) | 1) >>> 0), false);
    });

    it("multiple slot reuse does not leak metadata", () => {
      const em = new EntityManager();

      const e1 = em.create();
      em.setLocation(e1, 10, 20);
      em.destroy(e1);

      // Recreate — should have fresh metadata
      const e2 = em.create();
      const loc = em.getLocation(e2);
      assert.strictEqual(loc.archetype, 0);
      assert.strictEqual(loc.row, 0);
    });

    it("slot 0 metadata remains all zeros", () => {
      const em = new EntityManager();
      assert.strictEqual(em._archetype[0], 0);
      assert.strictEqual(em._row[0], 0);
      assert.strictEqual(em._gen[0], 0);
    });

    it("Maps are not used internally", () => {
      const em = new EntityManager();
      // Verify the key internal data structures are typed arrays
      assert.ok(em._archetype instanceof Uint32Array);
      assert.ok(em._row instanceof Uint32Array);
      assert.ok(em._gen instanceof Uint8Array);
      assert.ok(em._freeList instanceof Uint32Array);
    });
  });
});
