// Global tuning. Distances in world units (1 = one floor tile), times in seconds.

export const CONFIG = {
  step: 1 / 60,
  arena: { width: 9, height: 15 },
  player: {
    radius: 0.32,
    speed: 3.3,
    hp: 600,
    damage: 85,
    rate: 1.25, // shots per second
    arrowSpeed: 13,
    // Time standing still before the first shot (Archero: stop to shoot).
    aimDelay: 0.12,
    invulnerable: 0.55,
    crit: 0.05,
    critDamage: 2,
  },
  xp: { base: 26, growth: 1.22 },
  pickupRadius: 1.4,
  camera: { fov: 40, pitchDeg: 57, distance: 17.5 },
  quality: {
    lowFps: 52,
    goodFps: 57,
    minPixelRatio: 1,
    minFps: 42,
    warmup: 2,
  },
};
