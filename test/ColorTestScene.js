import { Game, Scene, Color, Colors } from "../jygame.js";

const FAMILIES = Object.keys(Colors).filter(k => !k.endsWith("Shades"));

class ColorTestScene extends Scene {
  enter() {
    this.root.className = "color-browser";
  }

  renderUI() {
    let html = `<h1>Jygame Colors</h1>
<p class="sub">${Object.keys(Color).length} named colors &middot; colorhunt.co &middot; color.pizza</p>`;

    for (const fam of FAMILIES) {
      const shades = Colors[fam + "Shades"];
      const names = Object.keys(shades);
      const count = names.length;

      html += `<div class="family">
<div class="family-header">
  <div class="swatch" style="background:${Colors[fam]}"></div>
  <h2>${fam}</h2>
  <span class="count">${count}</span>
</div>
<div class="grid">`;

      for (const name of names) {
        const hex = shades[name];
        html += `<div class="card">
  <div class="swatch" style="background:${hex}"></div>
  <div class="info">
    <div class="name" title="${name}">${name}</div>
    <div class="hex">${hex}</div>
  </div>
</div>`;
      }

      html += `</div></div>`;
    }

    return html;
  }
}

const game = new Game({
  parent: "#app",
  width: 1000,
  height: 600,
  fps: 60,
});

game.run(new ColorTestScene());
