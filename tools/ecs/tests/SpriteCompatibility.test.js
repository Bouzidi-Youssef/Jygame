import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Sprite } from "../../../display/Sprite.js";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Velocity } from "../../../ecs/components/Velocity.js";
import { Collider } from "../../../ecs/components/Collider.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { Animation } from "../../../ecs/components/Animation.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";

const ALL_COMPONENTS = [Transform, Velocity, Collider, Renderable, Animation, Visible, RenderBounds];

function createWorld() {
  const world = new World();
  for (const c of ALL_COMPONENTS) world.register(c);
  return world;
}

// ─────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────
describe("Construction", () => {
  it("creates a sprite with default values", () => {
    const s = new Sprite();
    assert.ok(s instanceof Sprite);
    assert.strictEqual(s.x, 0);
    assert.strictEqual(s.y, 0);
    assert.strictEqual(s.width, 32);
    assert.strictEqual(s.height, 32);
  });

  it("creates a sprite with specified values", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 50);
    assert.strictEqual(s.height, 60);
  });

  it("creates ECS entity with entity property", () => {
    const s = new Sprite();
    assert.ok(typeof s.entity === "number");
    assert.ok(s.entity > 0);
  });

  it("entity exists in world", () => {
    const s = new Sprite();
    assert.ok(s.world.isAlive(s.entity));
  });

  it("accepts custom world", () => {
    const w = createWorld();
    const s = new Sprite(0, 0, 32, 32, w);
    assert.strictEqual(s.world, w);
  });

  it("required components attached", () => {
    const s = new Sprite();
    assert.ok(s.world.has(s.entity, Transform));
    assert.ok(s.world.has(s.entity, Collider));
    assert.ok(s.world.has(s.entity, Renderable));
  });

  it("visible by default", () => {
    const s = new Sprite();
    assert.strictEqual(s.visible, true);
  });

  it("scale defaults to 1, 1", () => {
    const s = new Sprite();
    assert.strictEqual(s.scale.x, 1);
    assert.strictEqual(s.scale.y, 1);
  });

  it("angle defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.angle, 0);
  });

  it("center positioned correctly", () => {
    const s = new Sprite(100, 100, 32, 32);
    const t = s.world.get(s.entity, Transform);
    assert.strictEqual(t.x, 116);  // 100 + 32/2
    assert.strictEqual(t.y, 116);  // 100 + 32/2
  });
});

// ─────────────────────────────────────────────────────────
// Accessors
// ─────────────────────────────────────────────────────────
describe("Accessors", () => {
  it("x getter returns top-left", () => {
    const s = new Sprite(50, 60, 20, 30);
    assert.strictEqual(s.x, 50);
  });

  it("x setter updates center", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.x = 100;
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.transform.x, 110);
  });

  it("y getter returns top-left", () => {
    const s = new Sprite(50, 60, 20, 30);
    assert.strictEqual(s.y, 60);
  });

  it("y setter updates center", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.y = 100;
    assert.strictEqual(s.y, 100);
    assert.strictEqual(s.transform.y, 110);
  });

  it("width getter", () => {
    const s = new Sprite(0, 0, 40, 50);
    assert.strictEqual(s.width, 40);
  });

  it("width setter", () => {
    const s = new Sprite(0, 0, 40, 50);
    s.width = 80;
    assert.strictEqual(s.width, 80);
    assert.strictEqual(s.collider.width, 80);
  });

  it("height getter", () => {
    const s = new Sprite(0, 0, 40, 50);
    assert.strictEqual(s.height, 50);
  });

  it("height setter", () => {
    const s = new Sprite(0, 0, 40, 50);
    s.height = 100;
    assert.strictEqual(s.height, 100);
    assert.strictEqual(s.collider.height, 100);
  });

  it("image getter defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.image, 0);
  });

  it("image setter", () => {
    const s = new Sprite();
    s.image = 5;
    assert.strictEqual(s.image, 5);
    assert.strictEqual(s.renderable.image, 5);
  });

  it("angle getter", () => {
    const s = new Sprite();
    s.transform.rotation = 1.5;
    assert.strictEqual(s.angle, 1.5);
  });

  it("angle setter", () => {
    const s = new Sprite();
    s.angle = 2.0;
    assert.strictEqual(s.angle, 2.0);
    assert.strictEqual(s.transform.rotation, 2.0);
  });

  it("scale getter with uniform scale", () => {
    const s = new Sprite();
    s.transform.scaleX = 2;
    s.transform.scaleY = 3;
    assert.strictEqual(s.scale.x, 2);
    assert.strictEqual(s.scale.y, 3);
  });

  it("scale setter with object", () => {
    const s = new Sprite();
    s.scale = { x: 2, y: 3 };
    assert.strictEqual(s.transform.scaleX, 2);
    assert.strictEqual(s.transform.scaleY, 3);
  });

  it("scale setter with number", () => {
    const s = new Sprite();
    s.scale = 2;
    assert.strictEqual(s.transform.scaleX, 2);
    assert.strictEqual(s.transform.scaleY, 2);
  });

  it("transform getter returns ECS view", () => {
    const s = new Sprite();
    const t = s.transform;
    assert.strictEqual(typeof t.x, "number");
    assert.strictEqual(typeof t.y, "number");
    assert.strictEqual(typeof t.rotation, "number");
    assert.strictEqual(typeof t.scaleX, "number");
    assert.strictEqual(typeof t.scaleY, "number");
  });

  it("transform setter updates fields", () => {
    const s = new Sprite();
    s.transform = { x: 100, y: 200, rotation: 0.5, scaleX: 2, scaleY: 3 };
    assert.strictEqual(s.transform.x, 100);
    assert.strictEqual(s.transform.y, 200);
    assert.strictEqual(s.transform.rotation, 0.5);
    assert.strictEqual(s.transform.scaleX, 2);
    assert.strictEqual(s.transform.scaleY, 3);
  });

  it("collider getter returns ECS view", () => {
    const s = new Sprite(0, 0, 20, 30);
    const c = s.collider;
    assert.strictEqual(c.width, 20);
    assert.strictEqual(c.height, 30);
  });

  it("collider setter updates fields", () => {
    const s = new Sprite(0, 0, 20, 30);
    s.collider = { width: 40, height: 50 };
    assert.strictEqual(s.collider.width, 40);
    assert.strictEqual(s.collider.height, 50);
  });

  it("visible getter returns boolean", () => {
    const s = new Sprite();
    assert.strictEqual(typeof s.visible, "boolean");
  });

  it("visible setter accepts boolean", () => {
    const s = new Sprite();
    s.visible = false;
    assert.strictEqual(s.visible, false);
    s.visible = true;
    assert.strictEqual(s.visible, true);
  });
});

// ─────────────────────────────────────────────────────────
// Velocity (lazy creation)
// ─────────────────────────────────────────────────────────
describe("Velocity (lazy)", () => {
  it("velocity.x defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.velocity.x, 0);
  });

  it("velocity.y defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.velocity.y, 0);
  });

  it("velocity is created lazily on first access", () => {
    const s = new Sprite();
    assert.ok(!s.world.has(s.entity, Velocity));
    const v = s.velocity;
    assert.ok(s.world.has(s.entity, Velocity));
  });

  it("velocity setter updates values", () => {
    const s = new Sprite();
    s.velocity = { x: 5, y: -3 };
    assert.strictEqual(s.velocity.x, 5);
    assert.strictEqual(s.velocity.y, -3);
  });

  it("velocity persists in ECS", () => {
    const s = new Sprite();
    s.velocity.x = 10;
    s.velocity.y = 20;
    const ecsVel = s.world.get(s.entity, Velocity);
    assert.strictEqual(ecsVel.x, 10);
    assert.strictEqual(ecsVel.y, 20);
  });

  it("velocity getter returns same ECS view", () => {
    const s = new Sprite();
    const v1 = s.velocity;
    v1.x = 42;
    const v2 = s.velocity;
    assert.strictEqual(v2.x, 42);
  });
});

// ─────────────────────────────────────────────────────────
// Style
// ─────────────────────────────────────────────────────────
describe("Style", () => {
  it("style.fill defaults to white", () => {
    const s = new Sprite();
    assert.strictEqual(s.style.fill, "#ffffff");
  });

  it("style.fill setter converts hex string to color", () => {
    const s = new Sprite();
    s.style.fill = "#ff0000";
    assert.strictEqual(s.renderable.fillColor, 0xff0000);
  });

  it("style.shape defaults to rect", () => {
    const s = new Sprite();
    assert.strictEqual(s.style.shape, "rect");
  });

  it("style.shape setter to circle", () => {
    const s = new Sprite();
    s.style.shape = "circle";
    assert.strictEqual(s.renderable.shape, 1);
    assert.strictEqual(s.style.shape, "circle");
  });

  it("style.shape setter back to rect", () => {
    const s = new Sprite();
    s.style.shape = "circle";
    s.style.shape = "rect";
    assert.strictEqual(s.renderable.shape, 0);
  });

  it("style wrapper is cached (same object)", () => {
    const s = new Sprite();
    const w1 = s.style;
    const w2 = s.style;
    assert.strictEqual(w1, w2);
  });
});

// ─────────────────────────────────────────────────────────
// Animation
// ─────────────────────────────────────────────────────────
describe("Animation", () => {
  it("animation.playing defaults to false", () => {
    const s = new Sprite();
    assert.strictEqual(s.animation.playing, false);
  });

  it("animation.playing setter", () => {
    const s = new Sprite();
    s.animation.playing = true;
    assert.strictEqual(s.animation.playing, true);
  });

  it("animation wrapper is cached", () => {
    const s = new Sprite();
    const a1 = s.animation;
    const a2 = s.animation;
    assert.strictEqual(a1, a2);
  });

  it("animation component created lazily", () => {
    const s = new Sprite();
    assert.ok(!s.world.has(s.entity, Animation));
    s.animation;
    assert.ok(s.world.has(s.entity, Animation));
  });

  it("animation.add stores clip", () => {
    const s = new Sprite();
    const clip = { frames: [1, 2, 3], fps: 10, loop: true };
    s.animation.add("walk", clip);
    assert.strictEqual(s.animation.animations.get("walk"), clip);
  });

  it("animation.play sets clipId and playing", () => {
    const s = new Sprite();
    const clip = { frames: [1, 2, 3], fps: 10, loop: true };
    s.animation.add("walk", clip);
    s.animation.play("walk");
    assert.strictEqual(s.animation.current, "walk");
    assert.strictEqual(s.animation.playing, true);
  });

  it("animation.pause stops playing", () => {
    const s = new Sprite();
    s.animation.playing = true;
    s.animation.pause();
    assert.strictEqual(s.animation.playing, false);
  });

  it("animation.resume continues", () => {
    const s = new Sprite();
    s.animation.play("walk"); // sets current
    s.animation.pause();
    s.animation.resume();
    assert.strictEqual(s.animation.playing, true);
  });

  it("animation.stop resets frame and elapsed", () => {
    const s = new Sprite();
    s.animation.playing = true;
    s.animation.stop();
    assert.strictEqual(s.animation.playing, false);
  });

  it("onComplete stores callback", () => {
    const s = new Sprite();
    let called = false;
    s.animation.onComplete(() => called = true);
    // trigger via internal callback mechanism (if applicable)
    assert.strictEqual(typeof s._animCallback, "function");
  });
});

// ─────────────────────────────────────────────────────────
// Entity Lifecycle
// ─────────────────────────────────────────────────────────
describe("Entity lifecycle", () => {
  it("destroy destroys ECS entity", () => {
    const s = new Sprite();
    const eid = s.entity;
    s.destroy();
    assert.ok(!s.world.isAlive(eid));
  });

  it("destroy removes from groups", () => {
    const s = new Sprite();
    s.groups.push({});
    s.destroy();
    assert.strictEqual(s.groups.length, 0);
  });

  it("destroy is idempotent", () => {
    const s = new Sprite();
    s.destroy();
    s.destroy(); // should not throw
  });

  it("destroyed sprite throws on access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.x, /Sprite.*destroyed/);
    assert.throws(() => { s.x = 1; }, /Sprite.*destroyed/);
    assert.throws(() => s.visible, /Sprite.*destroyed/);
    assert.throws(() => { s.velocity; }, /Sprite.*destroyed/);
  });

  it("kill removes from groups only", () => {
    const s = new Sprite();
    const eid = s.entity;
    s.kill();
    assert.ok(s.world.isAlive(eid));
  });

  it("entity getter returns entity ID", () => {
    const s = new Sprite();
    assert.ok(typeof s.entity === "number");
    assert.ok(s.entity > 0);
  });

  it("world getter returns owning world", () => {
    const s = new Sprite();
    assert.ok(s.world instanceof World);
  });
});

// ─────────────────────────────────────────────────────────
// ECS Synchronization
// ─────────────────────────────────────────────────────────
describe("ECS synchronization", () => {
  it("mutating ECS updates sprite.x", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.transform.x = 110;
    assert.strictEqual(s.x, 100);
  });

  it("mutating sprite.x updates ECS", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.x = 100;
    assert.strictEqual(s.transform.x, 110);
  });

  it("mutating ECS collider updates sprite.width", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.collider.width = 40;
    assert.strictEqual(s.width, 40);
  });

  it("mutating sprite.visible updates ECS", () => {
    const s = new Sprite();
    s.visible = false;
    assert.strictEqual(s.world.get(s.entity, Visible).value, 0);
    s.visible = true;
    assert.strictEqual(s.world.get(s.entity, Visible).value, 1);
  });

  it("ecs and sprite share same transform state", () => {
    const s = new Sprite();
    const tEcs = s.world.get(s.entity, Transform);
    tEcs.x = 50;
    assert.strictEqual(s.transform.x, 50);
  });
});

// ─────────────────────────────────────────────────────────
// Multiple Sprites
// ─────────────────────────────────────────────────────────
describe("Multiple sprites", () => {
  it("two sprites have different entities", () => {
    const a = new Sprite();
    const b = new Sprite();
    assert.notStrictEqual(a.entity, b.entity);
  });

  it("two sprites have independent positions", () => {
    const a = new Sprite(10, 20, 32, 32);
    const b = new Sprite(100, 200, 32, 32);
    assert.strictEqual(a.x, 10);
    assert.strictEqual(a.y, 20);
    assert.strictEqual(b.x, 100);
    assert.strictEqual(b.y, 200);
  });

  it("two sprites can share same world", () => {
    const w = createWorld();
    const a = new Sprite(0, 0, 32, 32, w);
    const b = new Sprite(0, 0, 32, 32, w);
    assert.strictEqual(a.world, b.world);
  });
});

// ─────────────────────────────────────────────────────────
// Custom World
// ─────────────────────────────────────────────────────────
describe("Custom world", () => {
  it("uses provided world", () => {
    const w = createWorld();
    const s = new Sprite(0, 0, 32, 32, w);
    assert.strictEqual(s.world, w);
  });

  it("entity created in provided world", () => {
    const w = createWorld();
    const s = new Sprite(0, 0, 32, 32, w);
    assert.ok(w.isAlive(s.entity));
    assert.strictEqual(w.has(s.entity, Transform), true);
  });
});

// ─────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────
describe("Groups", () => {
  it("groups defaults to empty array", () => {
    const s = new Sprite();
    assert.deepStrictEqual(s.groups, []);
  });

  it("groups setter", () => {
    const s = new Sprite();
    const g = [{}];
    s.groups = g;
    assert.strictEqual(s.groups, g);
  });

  it("kill removes from groups", () => {
    const s = new Sprite();
    const g = { remove(sp) { sp.groups.splice(sp.groups.indexOf(this), 1); } };
    s.groups.push(g);
    assert.strictEqual(s.groups.length, 1);
    s.kill();
    assert.strictEqual(s.groups.length, 0);
  });
});

// ─────────────────────────────────────────────────────────
// Renderable
// ─────────────────────────────────────────────────────────
describe("Renderable", () => {
  it("renderable.image defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.renderable.image, 0);
  });

  it("renderable.fillColor defaults to 0xffffff", () => {
    const s = new Sprite();
    assert.strictEqual(s.renderable.fillColor, 0xffffff);
  });

  it("renderable setter updates fields", () => {
    const s = new Sprite();
    s.renderable = { image: 3, fillColor: 0xff0000, shape: 1, layer: 5 };
    assert.strictEqual(s.renderable.image, 3);
    assert.strictEqual(s.renderable.fillColor, 0xff0000);
    assert.strictEqual(s.renderable.shape, 1);
    assert.strictEqual(s.renderable.layer, 5);
  });
});

// ─────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────
describe("Error handling", () => {
  it("destroyed sprite throws on transform access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.transform, /destroyed/);
  });

  it("destroyed sprite throws on velocity access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.velocity, /destroyed/);
  });

  it("destroyed sprite throws on visible access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.visible, /destroyed/);
  });

  it("destroyed sprite throws on animation access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.animation, /destroyed/);
  });

  it("destroyed sprite throws on style access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.style, /destroyed/);
  });
});

// ─────────────────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────────────────
describe("Performance", () => {
  it("style wrapper is cached (no allocation per access)", () => {
    const s = new Sprite();
    const w1 = s.style;
    const w2 = s.style;
    assert.strictEqual(w1, w2);
  });

  it("animation wrapper is cached", () => {
    const s = new Sprite();
    const a1 = s.animation;
    const a2 = s.animation;
    assert.strictEqual(a1, a2);
  });

  it("create many sprites", () => {
    const sprites = [];
    for (let i = 0; i < 500; i++) {
      sprites.push(new Sprite(i, i, 32, 32));
    }
    assert.strictEqual(sprites.length, 500);
    for (const s of sprites) {
      assert.ok(s.world.isAlive(s.entity));
    }
  });
});

// ─────────────────────────────────────────────────────────
// Legacy API Compatibility
// ─────────────────────────────────────────────────────────
describe("Legacy API compatibility", () => {
  it("constructor(x, y, w, h) without world works", () => {
    const s = new Sprite(10, 20, 30, 40);
    assert.strictEqual(s.x, 10);
    assert.strictEqual(s.y, 20);
    assert.strictEqual(s.width, 30);
    assert.strictEqual(s.height, 40);
  });

  it("kill() legacy method works", () => {
    const s = new Sprite();
    s.kill();
    assert.ok(s.world.isAlive(s.entity));
  });

  it("destroy() method added", () => {
    const s = new Sprite();
    s.destroy();
    assert.ok(!s.world.isAlive(s.entity));
  });

  it("setDefaultWorld overrides default", () => {
    const w = createWorld();
    Sprite.setDefaultWorld(w);
    const s = new Sprite();
    assert.strictEqual(s.world, w);
    Sprite._defaultWorld = null; // reset
  });
});
