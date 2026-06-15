import { LoadingTask } from "../core/LoadingTask.js";

const _loaded = new Set();

export const FontLoader = {
  async load(family, path) {
    if (_loaded.has(family)) return;

    const font = new FontFace(family, `url(${path})`);
    await font.load();
    document.fonts.add(font);
    _loaded.add(family);
  },

  loadAll(map) {
    const entries = Object.entries(map);
    const task = new LoadingTask();
    task.expect(entries.length);

    for (const [family, path] of entries) {
      this.load(family, path).then(() => {
        task.done();
      }).catch((err) => task.fail(err));
    }

    return task;
  },

  isLoaded(family) {
    return _loaded.has(family);
  },

  unload(family) {
    return _loaded.delete(family);
  },

  clear() {
    _loaded.clear();
  },
};
