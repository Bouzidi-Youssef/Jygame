# jygame

A lightweight 2D game framework for the browser.

```js
import { Game, Scene, Sprite, Input } from "jygame";

class MyScene extends Scene {
  constructor() {
    super();
    this.player = new Sprite(100, 100, 32, 32);
    this.player.style.fill = "#ff6600";
  }

  update(dt) {
    this.player.velocity.x = 0;
    this.player.velocity.y = 0;
    if (Input.isDown("RIGHT")) this.player.velocity.x = 200;
    if (Input.isDown("LEFT")) this.player.velocity.x = -200;
    if (Input.isDown("UP")) this.player.velocity.y = -200;
    if (Input.isDown("DOWN")) this.player.velocity.y = 200;
    this.player.update(dt);
  }

  render(ctx) {
    this.player.render(ctx);
  }
}

const game = new Game({ parent: document.body, width: 800, height: 600 });
game.run(new MyScene());
```

## Install

```sh
npm install jygame
```

## Documentation

Full API reference, guides, and examples: [jygame-documentation.vercel.app](https://jygame-documentation.vercel.app/)

## API

| Import | Description |
|---|---|
| `Game` | Main game loop with fixed timestep, canvas setup, UI layer, and scene management |
| `Scene` | Lifecycle hooks (`enter`, `exit`, `pause`, `resume`, `update`, `render`, `renderUI`) plus auto-cleaned event helpers (`on`, `onSwipe`, `onTap`, `cleanup`) |
| `Sprite` | Drawable with position, velocity, angle, scale, images, and shape styles |
| `Group` | Collection of sprites with batch update/render/collision methods |
| `Vec2` | 2D vector with add, sub, scale, dot, normalize, rotate, lerp |
| `Rect` | AABB rectangle with collision, containment, overlap, and anchor helpers |
| `Clock` | Fixed-timestep accumulator for deterministic updates |
| `Timer` | Countdown timer with optional looping |
| `Input` | Keyboard (`isDown`, `justPressed`, `justReleased`) and touch (swipe/tap) input handling |
| `Collision` | AABB, circle, point-rect, rect-circle, and group collision detection |
| `State` | Observable state container with subscribe/unsubscribe |
| `Storage` | `localStorage` wrapper with JSON serialization |
| `Color`, `Colors` | Color class with parsing, manipulation, and a palette of named colors |
| `ImageLoader` | Image preloading with in-memory cache |
| `FontLoader` | FontFace loading for custom web fonts |

## License

GNU General Public License v3.0
