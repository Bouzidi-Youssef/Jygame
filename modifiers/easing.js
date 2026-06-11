export const EASINGS = {
  linear: t => t,
  quadIn: t => t * t,
  quadOut: t => t * (2 - t),
  quadInOut: t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t),
};
