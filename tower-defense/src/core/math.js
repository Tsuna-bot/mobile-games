export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent exponential smoothing toward a target. */
export const damp = (current, target, sharpness, dt) => lerp(current, target, 1 - Math.exp(-sharpness * dt));

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export const randRange = (min, max) => min + Math.random() * (max - min);

export const randInt = (min, maxInclusive) => min + Math.floor(Math.random() * (maxInclusive - min + 1));

/** Cheap smooth pseudo-noise in [-1, 1], good enough for camera shake. */
export const wobble = (t) => Math.sin(t) * Math.sin(t * 1.73 + 1.3);
