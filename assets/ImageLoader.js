const _cache = new Map();

export const ImageLoader = {
  load(path) {
    if (_cache.has(path)) return Promise.resolve(_cache.get(path));

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        _cache.set(path, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
      img.src = path;
    });
  },

  loadAll(map) {
    const entries = Object.entries(map);
    return Promise.all(
      entries.map(([key, path]) =>
        this.load(path).then((img) => {
          _cache.set(key, img);
          return [key, img];
        })
      )
    ).then((results) => Object.fromEntries(results));
  },

  get(key) {
    return _cache.get(key) || null;
  },

  has(key) {
    return _cache.has(key);
  },
};
