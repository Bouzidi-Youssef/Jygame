const SNAPSHOT_FIELDS = [
  "x", "y", "vx", "vy", "life", "maxLife", "ageRatio",
  "rotation", "rotationSpeed",
  "size", "alpha", "depth",
  "r", "g", "b",
];

export class ParticleSnapshot {
  static fromBackend(backend) {
    const storage = backend._storage;
    const active = storage.activeParticles;
    const snapshots = [];
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      const entry = { id: storage.getSortOrder(i) };
      for (const field of SNAPSHOT_FIELDS) {
        entry[field] = storage.getFieldValue(i, field);
      }
      snapshots.push(entry);
    }
    return snapshots;
  }

  static equal(a, b, epsilon = 1e-4) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const pa = a[i];
      const pb = b[i];
      if (pa.id !== pb.id) return false;
      for (const field of SNAPSHOT_FIELDS) {
        const va = pa[field];
        const vb = pb[field];
        if (Math.abs(va - vb) > epsilon) return false;
      }
    }
    return true;
  }

  static diff(a, b) {
    const result = [];
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const pa = a[i];
      const pb = b[i];
      if (!pa || !pb) {
        result.push({ index: i, exists: !!pa, expected: pa, actual: pb });
        continue;
      }
      for (const field of SNAPSHOT_FIELDS) {
        const va = pa[field];
        const vb = pb[field];
        if (Math.abs(va - vb) > 1e-4) {
          result.push({ index: i, field, expected: va, actual: vb, diff: va - vb });
        }
      }
    }
    return result;
  }

  static fields() {
    return SNAPSHOT_FIELDS;
  }
}
