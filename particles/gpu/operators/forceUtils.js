export function computeForce(px, py, tx, ty, strength, falloff, minDistance) {
  const dx = tx - px;
  const dy = ty - py;

  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { nx: 0, ny: 0, dist: 0, force: 0 };
  }

  const distSq = dx * dx + dy * dy;
  if (distSq === 0 || !Number.isFinite(distSq)) {
    return { nx: 0, ny: 0, dist: 0, force: 0 };
  }

  const dist = Math.sqrt(distSq);
  const clamped = Math.max(dist, minDistance);
  const nx = dx / dist;
  const ny = dy / dist;

  let f = strength;
  if (falloff === "inverse") f /= clamped;
  else if (falloff === "inverseSquared") f /= (clamped * clamped);

  return { nx, ny, dist, force: f };
}
