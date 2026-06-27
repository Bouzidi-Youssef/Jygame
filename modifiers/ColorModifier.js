const _parseHex = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const _toStop = ([pos, hex]) => {
  if (pos < 0 || pos > 1) throw new Error("ColorModifier stop position must be between 0 and 1");
  const [r, g, b] = _parseHex(hex);
  return { pos, r, g, b };
};

export class ColorModifier {
  static get capabilities() {
    return {
      gpuCompatible: true,
      requiresState: true,
      spawnsParticles: false,
      requiresCollision: false,
      pass: "visual",
    };
  }

  constructor({ from, to, stops, priority } = {}) {
    this.enabled = true;
    this.priority = priority;
    this._fromArg = from;
    this._toArg = to;
    this._stopsArg = stops;
    if (stops) {
      if (stops.length < 2) throw new Error("ColorModifier requires at least 2 color stops");
      this._stops = stops.map(_toStop).sort((a, b) => a.pos - b.pos);
    } else {
      const [fr, fg, fb] = _parseHex(from || "#ffffff");
      const [tr, tg, tb] = _parseHex(to || "#000000");
      this._stops = [
        { pos: 0, r: fr, g: fg, b: fb },
        { pos: 1, r: tr, g: tg, b: tb },
      ];
    }
    this._count = this._stops.length;
  }

  update(acc, dt, ctx) {
    const state = ctx.stateStore.ensure(acc, this, () => ({ segment: 0 }));
    const stops = this._stops;
    let seg = state.segment;
    while (seg < this._count - 2 && acc.ageRatio >= stops[seg + 1].pos) {
      seg++;
    }
    state.segment = seg;

    if (seg >= this._count - 1) {
      acc.r = stops[this._count - 1].r;
      acc.g = stops[this._count - 1].g;
      acc.b = stops[this._count - 1].b;
      return;
    }

    const a = stops[seg];
    const b = stops[seg + 1];
    const segT = b.pos > a.pos
      ? (acc.ageRatio - a.pos) / (b.pos - a.pos)
      : 0;

    acc.r = a.r + (b.r - a.r) * segT;
    acc.g = a.g + (b.g - a.g) * segT;
    acc.b = a.b + (b.b - a.b) * segT;
  }

  toDescriptor() {
    const d = { type: "color" };
    if (this._stopsArg) {
      d.stops = this._stops.map(s => [s.pos, s.r, s.g, s.b]);
    } else {
      d.from = `#${this._stops[0].r.toString(16).padStart(2, "0")}${this._stops[0].g.toString(16).padStart(2, "0")}${this._stops[0].b.toString(16).padStart(2, "0")}`;
      d.to = `#${this._stops[1].r.toString(16).padStart(2, "0")}${this._stops[1].g.toString(16).padStart(2, "0")}${this._stops[1].b.toString(16).padStart(2, "0")}`;
    }
    return d;
  }

  toJSON() {
    const obj = { type: "ColorModifier" };
    if (this._stopsArg) {
      obj.stops = this._stops.map(s => [
        s.pos,
        `#${s.r.toString(16).padStart(2, "0")}${s.g.toString(16).padStart(2, "0")}${s.b.toString(16).padStart(2, "0")}`
      ]);
    } else {
      obj.from = this._fromArg || "#ffffff";
      obj.to = this._toArg || "#000000";
    }
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new ColorModifier(data);
  }
}
