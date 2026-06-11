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
  constructor({ from, to, stops } = {}) {
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

  update(particle, dt) {
    const stops = this._stops;
    let seg = particle.__jygameColorSegment;
    while (seg < this._count - 1 && stops[seg + 1].pos < particle.ageRatio) {
      seg++;
    }
    particle.__jygameColorSegment = seg;

    if (seg >= this._count - 1) {
      particle.r = stops[this._count - 1].r;
      particle.g = stops[this._count - 1].g;
      particle.b = stops[this._count - 1].b;
      return;
    }

    const a = stops[seg];
    const b = stops[seg + 1];
    const segT = b.pos > a.pos
      ? (particle.ageRatio - a.pos) / (b.pos - a.pos)
      : 0;

    particle.r = a.r + (b.r - a.r) * segT;
    particle.g = a.g + (b.g - a.g) * segT;
    particle.b = a.b + (b.b - a.b) * segT;
  }
}
