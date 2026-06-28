import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ComponentSignature } from "../../../ecs/core/ComponentSignature.js";

describe("ComponentSignature", () => {
  // ─── Construction ──────────────────────────────────────────

  describe("construction", () => {
    it("creates an empty signature", () => {
      const s = new ComponentSignature([]);
      assert.strictEqual(s.size, 0);
      assert.deepStrictEqual(s.components, []);
      assert.strictEqual(s.key, "");
    });

    it("creates a signature with a single component", () => {
      const s = new ComponentSignature([5]);
      assert.strictEqual(s.size, 1);
      assert.deepStrictEqual(s.components, [5]);
    });

    it("creates a signature with multiple components", () => {
      const s = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(s.size, 3);
      assert.deepStrictEqual(s.components, [1, 2, 3]);
    });

    it("sorts components in ascending order", () => {
      const s = new ComponentSignature([7, 2, 5]);
      assert.deepStrictEqual(s.components, [2, 5, 7]);
    });

    it("removes duplicates", () => {
      const s = new ComponentSignature([3, 1, 3, 2, 1]);
      assert.strictEqual(s.size, 3);
      assert.deepStrictEqual(s.components, [1, 2, 3]);
    });

    it("accepts no arguments (defaults to empty)", () => {
      const s = new ComponentSignature();
      assert.strictEqual(s.size, 0);
      assert.strictEqual(s.key, "");
    });
  });

  // ─── Validation ────────────────────────────────────────────

  describe("validation", () => {
    it("rejects non-array argument", () => {
      assert.throws(
        () => new ComponentSignature("bad"),
        TypeError
      );
    });

    it("rejects NaN", () => {
      assert.throws(
        () => new ComponentSignature([NaN]),
        TypeError
      );
    });

    it("rejects floating point numbers", () => {
      assert.throws(
        () => new ComponentSignature([1.5]),
        TypeError
      );
    });

    it("rejects negative component IDs", () => {
      assert.throws(
        () => new ComponentSignature([-1]),
        RangeError
      );
    });

    it("rejects zero as component ID", () => {
      assert.throws(
        () => new ComponentSignature([0]),
        RangeError
      );
    });

    it("rejects IDs above maximum (65535)", () => {
      assert.throws(
        () => new ComponentSignature([65536]),
        RangeError
      );
    });

    it("rejects arrays containing at least one invalid value among valid ones", () => {
      assert.throws(
        () => new ComponentSignature([1, 2, -3, 4]),
        RangeError
      );
    });

    it("rejects non-number values like strings", () => {
      assert.throws(
        () => new ComponentSignature(["1"]),
        TypeError
      );
    });
  });

  // ─── Immutability ──────────────────────────────────────────

  describe("immutability", () => {
    it("the signature instance is frozen", () => {
      const s = new ComponentSignature([1, 2]);
      assert.ok(Object.isFrozen(s));
    });

    it("cannot add new properties", () => {
      const s = new ComponentSignature([1]);
      assert.throws(() => { s.x = 1; }, TypeError);
    });

    it("components getter returns a fresh copy", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const c1 = s.components;
      const c2 = s.components;
      assert.notStrictEqual(c1, c2);
      assert.deepStrictEqual(c1, c2);
    });

    it("add() returns a new instance", () => {
      const s = new ComponentSignature([1, 2]);
      const result = s.add(3);
      assert.notStrictEqual(result, s);
      assert.strictEqual(s.size, 2);
      assert.strictEqual(result.size, 3);
    });

    it("remove() returns a new instance", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const result = s.remove(2);
      assert.notStrictEqual(result, s);
      assert.strictEqual(s.size, 3);
      assert.strictEqual(result.size, 2);
    });
  });

  // ─── Key ───────────────────────────────────────────────────

  describe("key", () => {
    it("is empty string for empty signature", () => {
      const s = new ComponentSignature([]);
      assert.strictEqual(s.key, "");
    });

    it("joins component IDs with commas", () => {
      const s = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(s.key, "1,2,3");
    });

    it("is deterministic regardless of input order", () => {
      const a = new ComponentSignature([3, 1, 2]);
      const b = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.key, b.key);
    });

    it("is deterministic regardless of duplicate entries", () => {
      const a = new ComponentSignature([1, 1, 2, 3, 3]);
      const b = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.key, b.key);
    });

    it("identical signatures always produce identical keys", () => {
      const a = new ComponentSignature([5, 12, 7]);
      const b = new ComponentSignature([5, 12, 7]);
      assert.strictEqual(a.key, b.key);
      assert.strictEqual(a.key, "5,7,12");
    });
  });

  // ─── equals ────────────────────────────────────────────────

  describe("equals", () => {
    it("returns true for identical signatures", () => {
      const a = new ComponentSignature([1, 2, 3]);
      const b = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.equals(b), true);
    });

    it("returns true for signatures with same components in different order", () => {
      const a = new ComponentSignature([3, 1, 2]);
      const b = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.equals(b), true);
    });

    it("returns true for signatures with duplicates removed", () => {
      const a = new ComponentSignature([1, 1, 2, 3]);
      const b = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.equals(b), true);
    });

    it("returns false for signatures with different component sets", () => {
      const a = new ComponentSignature([1, 2, 3]);
      const b = new ComponentSignature([1, 2, 4]);
      assert.strictEqual(a.equals(b), false);
    });

    it("returns false for signatures of different sizes", () => {
      const a = new ComponentSignature([1, 2, 3]);
      const b = new ComponentSignature([1, 2]);
      assert.strictEqual(a.equals(b), false);
    });

    it("returns true when comparing same instance", () => {
      const s = new ComponentSignature([1, 2]);
      assert.strictEqual(s.equals(s), true);
    });

    it("returns false for non-ComponentSignature argument", () => {
      const s = new ComponentSignature([1, 2]);
      assert.strictEqual(s.equals(null), false);
      assert.strictEqual(s.equals(undefined), false);
      assert.strictEqual(s.equals([1, 2]), false);
    });

    it("two empty signatures are equal", () => {
      const a = new ComponentSignature([]);
      const b = new ComponentSignature([]);
      assert.strictEqual(a.equals(b), true);
    });
  });

  // ─── contains ──────────────────────────────────────────────

  describe("contains", () => {
    it("returns true when component is present", () => {
      const s = new ComponentSignature([1, 5, 12]);
      assert.strictEqual(s.contains(5), true);
    });

    it("returns false when component is absent", () => {
      const s = new ComponentSignature([1, 5, 12]);
      assert.strictEqual(s.contains(3), false);
    });

    it("returns false for empty signature", () => {
      const s = new ComponentSignature([]);
      assert.strictEqual(s.contains(1), false);
    });

    it("returns true for first and last elements (binary search boundaries)", () => {
      const s = new ComponentSignature([2, 4, 6, 8, 10]);
      assert.strictEqual(s.contains(2), true);
      assert.strictEqual(s.contains(10), true);
    });

    it("throws TypeError for NaN", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.contains(NaN), TypeError);
    });

    it("throws TypeError for floating point", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.contains(1.5), TypeError);
    });

    it("throws RangeError for negative ID", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.contains(-1), RangeError);
    });

    it("throws RangeError for zero", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.contains(0), RangeError);
    });

    it("throws RangeError for exceeding MAX_COMPONENT_ID", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.contains(65536), RangeError);
    });
  });

  // ─── containsAll ───────────────────────────────────────────

  describe("containsAll", () => {
    it("returns true when all components are present", () => {
      const s = new ComponentSignature([1, 2, 3, 4, 5]);
      const sub = new ComponentSignature([2, 4]);
      assert.strictEqual(s.containsAll(sub), true);
    });

    it("returns false when some components are missing", () => {
      const s = new ComponentSignature([1, 2, 5]);
      const sub = new ComponentSignature([2, 3]);
      assert.strictEqual(s.containsAll(sub), false);
    });

    it("returns true when the subset is empty", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const empty = new ComponentSignature([]);
      assert.strictEqual(s.containsAll(empty), true);
    });

    it("returns true for identical signatures", () => {
      const a = new ComponentSignature([1, 2, 3]);
      const b = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.containsAll(b), true);
    });

    it("returns false when this is empty but other is not", () => {
      const s = new ComponentSignature([]);
      const other = new ComponentSignature([1]);
      assert.strictEqual(s.containsAll(other), false);
    });

    it("returns false when subset is larger than superset", () => {
      const a = new ComponentSignature([1, 2]);
      const b = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.containsAll(b), false);
    });

    it("returns true for proper superset (disjoint check)", () => {
      const s = new ComponentSignature([1, 2, 3, 10, 20]);
      const sub = new ComponentSignature([3, 10]);
      assert.strictEqual(s.containsAll(sub), true);
    });

    it("throws TypeError for non-ComponentSignature argument", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.containsAll([1, 2]), TypeError);
    });
  });

  // ─── containsAny ───────────────────────────────────────────

  describe("containsAny", () => {
    it("returns true when at least one component is present", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const other = new ComponentSignature([3, 5, 7]);
      assert.strictEqual(s.containsAny(other), true);
    });

    it("returns false when no components intersect", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const other = new ComponentSignature([4, 5, 6]);
      assert.strictEqual(s.containsAny(other), false);
    });

    it("returns false when this is empty", () => {
      const s = new ComponentSignature([]);
      const other = new ComponentSignature([1, 2]);
      assert.strictEqual(s.containsAny(other), false);
    });

    it("returns false when other is empty", () => {
      const s = new ComponentSignature([1, 2]);
      const other = new ComponentSignature([]);
      assert.strictEqual(s.containsAny(other), false);
    });

    it("returns true when both are identical", () => {
      const a = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(a.containsAny(a), true);
    });

    it("returns true on first element match", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const other = new ComponentSignature([1, 10, 20]);
      assert.strictEqual(s.containsAny(other), true);
    });

    it("throws TypeError for non-ComponentSignature argument", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.containsAny([1, 2]), TypeError);
    });
  });

  // ─── add ───────────────────────────────────────────────────

  describe("add", () => {
    it("adds a new component in sorted position", () => {
      const s = new ComponentSignature([1, 5]);
      const result = s.add(3);
      assert.deepStrictEqual(result.components, [1, 3, 5]);
    });

    it("adds at the beginning when smaller than all existing", () => {
      const s = new ComponentSignature([5, 10]);
      const result = s.add(1);
      assert.deepStrictEqual(result.components, [1, 5, 10]);
    });

    it("adds at the end when larger than all existing", () => {
      const s = new ComponentSignature([1, 5]);
      const result = s.add(10);
      assert.deepStrictEqual(result.components, [1, 5, 10]);
    });

    it("returns the same instance when component already present", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const result = s.add(2);
      assert.strictEqual(result, s);
    });

    it("adds to an empty signature", () => {
      const s = new ComponentSignature([]);
      const result = s.add(5);
      assert.deepStrictEqual(result.components, [5]);
    });

    it("does not mutate the original signature", () => {
      const s = new ComponentSignature([1, 2]);
      s.add(3);
      assert.deepStrictEqual(s.components, [1, 2]);
    });

    it("throws for invalid component IDs", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.add(NaN), TypeError);
      assert.throws(() => s.add(-1), RangeError);
      assert.throws(() => s.add(0), RangeError);
      assert.throws(() => s.add(65536), RangeError);
    });
  });

  // ─── remove ────────────────────────────────────────────────

  describe("remove", () => {
    it("removes an existing component", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const result = s.remove(2);
      assert.deepStrictEqual(result.components, [1, 3]);
    });

    it("removes the first component", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const result = s.remove(1);
      assert.deepStrictEqual(result.components, [2, 3]);
    });

    it("removes the last component", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const result = s.remove(3);
      assert.deepStrictEqual(result.components, [1, 2]);
    });

    it("returns the same instance when component is absent", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const result = s.remove(5);
      assert.strictEqual(result, s);
    });

    it("does not mutate the original signature", () => {
      const s = new ComponentSignature([1, 2, 3]);
      s.remove(2);
      assert.deepStrictEqual(s.components, [1, 2, 3]);
    });

    it("removes the only component yields empty signature", () => {
      const s = new ComponentSignature([5]);
      const result = s.remove(5);
      assert.strictEqual(result.size, 0);
      assert.deepStrictEqual(result.components, []);
    });

    it("throws for invalid component IDs", () => {
      const s = new ComponentSignature([1, 2]);
      assert.throws(() => s.remove(NaN), TypeError);
      assert.throws(() => s.remove(-1), RangeError);
      assert.throws(() => s.remove(0), RangeError);
      assert.throws(() => s.remove(65536), RangeError);
    });
  });

  // ─── size ──────────────────────────────────────────────────

  describe("size", () => {
    it("returns 0 for empty signature", () => {
      assert.strictEqual(new ComponentSignature([]).size, 0);
    });

    it("returns the number of unique components", () => {
      assert.strictEqual(new ComponentSignature([1, 1, 2, 3, 3]).size, 3);
    });

    it("increases with add", () => {
      const s = new ComponentSignature([1, 2]);
      assert.strictEqual(s.add(3).size, 3);
    });

    it("decreases with remove", () => {
      const s = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(s.remove(2).size, 2);
    });
  });

  // ─── Canonical Ordering ────────────────────────────────────

  describe("canonical ordering", () => {
    it("all permutations produce equal signatures", () => {
      const a = new ComponentSignature([1, 2, 3]);
      const b = new ComponentSignature([3, 1, 2]);
      const c = new ComponentSignature([2, 1, 3]);
      const d = new ComponentSignature([1, 3, 2]);

      assert.strictEqual(a.equals(b), true);
      assert.strictEqual(b.equals(c), true);
      assert.strictEqual(c.equals(d), true);
      assert.strictEqual(a.equals(d), true);
    });

    it("identical keys for all permutations", () => {
      const a = new ComponentSignature([1, 2, 3]);
      const b = new ComponentSignature([3, 1, 2]);
      const c = new ComponentSignature([2, 1, 3]);
      const d = new ComponentSignature([1, 3, 2]);

      assert.strictEqual(a.key, b.key);
      assert.strictEqual(b.key, c.key);
      assert.strictEqual(c.key, d.key);
    });
  });

  // ─── Large Signatures ──────────────────────────────────────

  describe("large signatures", () => {
    it("handles a large number of components", () => {
      const ids = [];
      for (let i = 1; i <= 1000; i++) ids.push(i);
      const s = new ComponentSignature(ids);
      assert.strictEqual(s.size, 1000);
      assert.strictEqual(s.key, ids.join(","));
    });

    it("binary search still works on large signature", () => {
      const ids = [];
      for (let i = 1; i <= 1000; i++) ids.push(i);
      const s = new ComponentSignature(ids);
      assert.strictEqual(s.contains(1), true);
      assert.strictEqual(s.contains(500), true);
      assert.strictEqual(s.contains(1000), true);
      assert.strictEqual(s.contains(1001), false);
    });
  });

  // ─── Deterministic Behavior ─────────────────────────────────

  describe("deterministic behavior", () => {
    it("same input produces identical signatures", () => {
      const a = new ComponentSignature([64, 128, 256]);
      const b = new ComponentSignature([64, 128, 256]);
      assert.strictEqual(a.key, b.key);
      assert.strictEqual(a.size, b.size);
      assert.deepStrictEqual(a.components, b.components);
    });

    it("add-then-remove returns to original", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const added = s.add(5);
      const back = added.remove(5);
      assert.strictEqual(s.equals(back), true);
    });

    it("remove-then-add returns to original", () => {
      const s = new ComponentSignature([1, 2, 3]);
      const removed = s.remove(2);
      const back = removed.add(2);
      assert.strictEqual(s.equals(back), true);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────

  describe("edge cases", () => {
    it("signature with max component ID (65535) is valid", () => {
      const s = new ComponentSignature([65535]);
      assert.strictEqual(s.size, 1);
      assert.strictEqual(s.contains(65535), true);
    });

    it("signature with ID 1 is valid", () => {
      const s = new ComponentSignature([1]);
      assert.strictEqual(s.size, 1);
      assert.strictEqual(s.contains(1), true);
    });

    it("add returns same instance for no-op", () => {
      const s = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(s.add(2), s);
    });

    it("remove returns same instance for no-op", () => {
      const s = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(s.remove(5), s);
    });

    it("toString returns descriptive string", () => {
      const s = new ComponentSignature([1, 2, 3]);
      assert.strictEqual(s.toString(), "ComponentSignature(1,2,3)");
    });

    it("empty signature toString", () => {
      const s = new ComponentSignature([]);
      assert.strictEqual(s.toString(), "ComponentSignature()");
    });
  });
});
