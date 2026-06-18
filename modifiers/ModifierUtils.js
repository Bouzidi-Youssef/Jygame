export const hasLifecycleMethods = mod =>
  typeof mod.beginFrame === 'function' ||
  typeof mod.update === 'function' ||
  typeof mod.onEmit === 'function' ||
  typeof mod.onDeath === 'function' ||
  typeof mod.endFrame === 'function';
