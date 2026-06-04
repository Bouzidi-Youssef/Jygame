const _loaded = new Set();

export const FontLoader = {
  async load(family, path) {
    if (_loaded.has(family)) return;

    const font = new FontFace(family, `url(${path})`);
    await font.load();
    document.fonts.add(font);
    _loaded.add(family);
  },

  async loadAll(map) {
    const entries = Object.entries(map);
    await Promise.all(
      entries.map(([family, path]) => this.load(family, path))
    );
  },

  isLoaded(family) {
    return _loaded.has(family);
  },
};
