import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ComponentRegistry } from "../../../ecs/core/ComponentRegistry.js";

describe("ComponentRegistry", () => {
  // ─── Registration ──────────────────────────────────────────────

  describe("register (class form)", () => {
    it("registers a class component with static schema", () => {
      const reg = new ComponentRegistry();

      class Transform {
        static schema = { x: "f32", y: "f32", rotation: "f32" };
      }

      reg.register(Transform);

      assert.ok(reg.has(Transform));
      assert.strictEqual(reg.getId(Transform), 64);
    });

    it("registers a class component without schema as tag", () => {
      const reg = new ComponentRegistry();

      class Tag {}

      reg.register(Tag);

      assert.ok(reg.has(Tag));
      assert.deepStrictEqual(reg.getSchema(Tag), {});
    });

    it("returns metadata", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }

      const meta = reg.register(A);

      assert.ok(meta !== undefined);
      assert.strictEqual(meta.id, 64);
      assert.strictEqual(meta.name, "A");
      assert.strictEqual(meta.component, A);
      assert.deepStrictEqual(meta.schema, { v: "f32" });
      assert.ok(Object.isFrozen(meta));
    });
  });

  describe("register (string form)", () => {
    it("registers a component by name and schema", () => {
      const reg = new ComponentRegistry();

      reg.register("Transform", { x: "f32", y: "f32" });

      assert.ok(reg.has("Transform"));
      assert.strictEqual(reg.getId("Transform"), 64);
    });

    it("returns metadata", () => {
      const reg = new ComponentRegistry();

      const meta = reg.register("A", { v: "f32" });

      assert.ok(meta !== undefined);
      assert.strictEqual(meta.name, "A");
      assert.strictEqual(meta.component, null);
    });
  });

  describe("register invalid arguments", () => {
    it("rejects non-class, non-string first argument", () => {
      const reg = new ComponentRegistry();

      assert.throws(
        () => reg.register(42),
        TypeError
      );
    });

    it("rejects anonymous class", () => {
      const reg = new ComponentRegistry();

      assert.throws(
        () => reg.register(class {}),
        TypeError
      );
    });

    it("rejects non-object schema", () => {
      const reg = new ComponentRegistry();

      assert.throws(
        () => reg.register("A", "not-a-schema"),
        TypeError
      );
    });

    it("rejects schema with exotic prototype", () => {
      const reg = new ComponentRegistry();
      const exoticSchema = Object.create(null);
      exoticSchema.x = "f32";

      assert.throws(
        () => reg.register("A", exoticSchema),
        TypeError
      );
    });

    it("rejects array schema", () => {
      const reg = new ComponentRegistry();

      assert.throws(
        () => reg.register("A", ["x", "f32"]),
        TypeError
      );
    });

    it("rejects class instance as schema", () => {
      const reg = new ComponentRegistry();

      class NotAPlainObject {}
      const instance = new NotAPlainObject();
      instance.x = "f32";

      assert.throws(
        () => reg.register("A", instance),
        TypeError
      );
    });
  });

  // ─── IDs ───────────────────────────────────────────────────────

  describe("IDs", () => {
    it("user components start at 64", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }
      class B {
        static schema = { v: "f32" };
      }

      reg.register(A);
      reg.register(B);

      assert.strictEqual(reg.getId(A), 64);
      assert.strictEqual(reg.getId(B), 65);
    });

    it("are deterministic", () => {
      const r1 = new ComponentRegistry();
      const r2 = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }
      class B {
        static schema = { v: "f32" };
      }

      r1.register(A);
      r1.register(B);
      r2.register(A);
      r2.register(B);

      assert.strictEqual(r1.getId(A), r2.getId(A));
      assert.strictEqual(r1.getId(B), r2.getId(B));
    });

    it("accepts reserved IDs in range 1–63", () => {
      const reg = new ComponentRegistry();

      class Transform {
        static schema = { x: "f32", y: "f32" };
      }

      reg.register(Transform, { reservedId: 1 });

      assert.strictEqual(reg.getId(Transform), 1);
    });

    it("rejects reserved ID outside range 1–63", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }

      assert.throws(
        () => reg.register(A, { reservedId: 0 }),
        RangeError
      );
      assert.throws(
        () => reg.register(A, { reservedId: 64 }),
        RangeError
      );
    });

    it("rejects reserved ID conflict", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }
      class B {
        static schema = { v: "f32" };
      }

      reg.register(A, { reservedId: 1 });

      assert.throws(
        () => reg.register(B, { reservedId: 1 }),
        /already in use/i
      );
    });

    it("exhausted ID pool throws", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }

      reg._nextId = 65536;

      assert.throws(
        () => reg.register(A),
        RangeError
      );
    });
  });

  // ─── Validation ────────────────────────────────────────────────

  describe("field validation", () => {
    it("rejects invalid field names", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { "x-position": "f32" };
      }

      assert.throws(
        () => reg.register(A),
        /invalid field name "x-position"/i
      );
    });

    it("rejects invalid field types", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "float64" };
      }

      assert.throws(
        () => reg.register(A),
        /invalid field type "float64"/i
      );
    });

    it("resolves type aliases", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "float", label: "uint" };
      }

      reg.register(A);

      const schema = reg.getSchema(A);
      assert.strictEqual(schema.x, "f32");
      assert.strictEqual(schema.label, "u32");
    });

    it("rejects non-string field types", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: 42 };
      }

      assert.throws(
        () => reg.register(A),
        TypeError
      );
    });

    it("allows empty schema (tag component)", () => {
      const reg = new ComponentRegistry();

      class Tag {}

      reg.register(Tag);

      assert.deepStrictEqual(reg.getSchema(Tag), {});
    });
  });

  // ─── Locking ───────────────────────────────────────────────────

  describe("locking", () => {
    it("register works before lock", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }

      reg.register(A);
      assert.ok(reg.has(A));
    });

    it("register fails after lock", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }

      reg.lock();

      assert.throws(
        () => reg.register(A),
        /registry is locked/i
      );
    });

    it("isLocked returns correct state", () => {
      const reg = new ComponentRegistry();

      assert.strictEqual(reg.isLocked(), false);

      reg.lock();

      assert.strictEqual(reg.isLocked(), true);
    });
  });

  // ─── Duplicates ────────────────────────────────────────────────

  describe("duplicate handling", () => {
    it("rejects duplicate component class", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }

      reg.register(A);

      assert.throws(
        () => reg.register(A),
        /already registered/i
      );
    });

    it("rejects duplicate name via string form", () => {
      const reg = new ComponentRegistry();

      reg.register("Transform", { x: "f32" });

      assert.throws(
        () => reg.register("Transform", { y: "f32" }),
        /already registered/i
      );
    });

    it("rejects name collision between class and string form", () => {
      const reg = new ComponentRegistry();

      class Transform {
        static schema = { x: "f32" };
      }

      reg.register(Transform);

      assert.throws(
        () => reg.register("Transform", { y: "f32" }),
        /already registered/i
      );
    });
  });

  // ─── Schema Immutability ───────────────────────────────────────

  describe("schema immutability", () => {
    it("freezes the schema after registration", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      reg.register(A);

      const schema = reg.getSchema(A);
      assert.ok(Object.isFrozen(schema));
    });

    it("prevents mutations to internal schema", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      reg.register(A);

      const meta = reg.getMetadata(A);

      assert.throws(() => {
        meta.schema.x = "u32";
      }, /Cannot assign to read only property/);
    });

    it("does not freeze the class static schema", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      reg.register(A);

      assert.ok(Object.isFrozen(A.schema) === false);
    });
  });

  // ─── Lookup Methods ────────────────────────────────────────────

  describe("getMetadata", () => {
    it("returns full metadata for registered component", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      reg.register(A);

      const meta = reg.getMetadata(A);

      assert.ok(meta !== null);
      assert.strictEqual(meta.id, 64);
      assert.strictEqual(meta.name, "A");
      assert.strictEqual(meta.component, A);
      assert.deepStrictEqual(meta.schema, { x: "f32" });
    });

    it("returns frozen metadata", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      reg.register(A);

      const meta = reg.getMetadata(A);

      assert.ok(Object.isFrozen(meta));
    });

    it("returns null for unregistered component", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      assert.strictEqual(reg.getMetadata(A), null);
      assert.strictEqual(reg.getMetadata("Unregistered"), null);
    });

    it("sets component to null for string-registered components", () => {
      const reg = new ComponentRegistry();

      reg.register("A", { x: "f32" });

      const meta = reg.getMetadata("A");

      assert.strictEqual(meta.component, null);
    });
  });

  describe("getSchema", () => {
    it("returns schema for registered component", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32", y: "f64" };
      }

      reg.register(A);

      assert.deepStrictEqual(reg.getSchema(A), { x: "f32", y: "f64" });
    });

    it("returns null for unregistered component", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      assert.strictEqual(reg.getSchema(A), null);
    });
  });

  describe("getId", () => {
    it("returns id for class lookup", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      reg.register(A);

      assert.strictEqual(reg.getId(A), 64);
    });

    it("returns id for string lookup", () => {
      const reg = new ComponentRegistry();

      reg.register("A", { x: "f32" });

      assert.strictEqual(reg.getId("A"), 64);
    });

    it("returns null for unregistered component", () => {
      const reg = new ComponentRegistry();

      assert.strictEqual(reg.getId("Unregistered"), null);
      assert.strictEqual(
        reg.getId(
          class {
            static schema = { x: "f32" };
          }
        ),
        null
      );
    });
  });

  describe("has", () => {
    it("returns true for registered class", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { v: "f32" };
      }

      reg.register(A);

      assert.strictEqual(reg.has(A), true);
    });

    it("returns true for registered name", () => {
      const reg = new ComponentRegistry();

      reg.register("A", { v: "f32" });

      assert.strictEqual(reg.has("A"), true);
    });

    it("returns false for unregistered", () => {
      const reg = new ComponentRegistry();

      assert.strictEqual(reg.has("Unregistered"), false);
    });
  });

  // ─── destroy() ─────────────────────────────────────────────────

  describe("destroy", () => {
    it("clears all state", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }
      class B {
        static schema = { v: "f32" };
      }

      reg.register(A);
      reg.register(B);
      reg.lock();

      assert.strictEqual(reg.componentCount, 2);
      assert.strictEqual(reg.isLocked(), true);

      reg.destroy();

      assert.strictEqual(reg.componentCount, 0);
      assert.strictEqual(reg.isLocked(), false);
      assert.strictEqual(reg.has(A), false);
      assert.strictEqual(reg.has(B), false);
    });

    it("allows new registration after destroy", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }

      reg.register(A);
      reg.destroy();

      class B {
        static schema = { v: "f32" };
      }

      const meta = reg.register(B);

      assert.strictEqual(meta.id, 64);
      assert.strictEqual(reg.has(B), true);
    });
  });

  describe("componentCount", () => {
    it("returns the number of registered components", () => {
      const reg = new ComponentRegistry();

      class A {
        static schema = { x: "f32" };
      }
      class B {
        static schema = { y: "f32" };
      }

      assert.strictEqual(reg.componentCount, 0);

      reg.register(A);
      assert.strictEqual(reg.componentCount, 1);

      reg.register(B);
      assert.strictEqual(reg.componentCount, 2);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────

  describe("edge cases", () => {
    it("allows tag component (empty schema)", () => {
      const reg = new ComponentRegistry();

      class Health {}

      reg.register(Health);

      assert.strictEqual(reg.getId(Health), 64);
      assert.deepStrictEqual(reg.getSchema(Health), {});
    });

    it("allows string-registered tag component", () => {
      const reg = new ComponentRegistry();

      reg.register("Tag", {});

      assert.strictEqual(reg.getId("Tag"), 64);
      assert.deepStrictEqual(reg.getSchema("Tag"), {});
    });

    it("handles class form with options (no schema override)", () => {
      const reg = new ComponentRegistry();

      class Transform {
        static schema = { x: "f32" };
      }

      reg.register(Transform, { reservedId: 1 });

      assert.strictEqual(reg.getId(Transform), 1);
      assert.deepStrictEqual(reg.getSchema(Transform), { x: "f32" });
    });
  });
});
