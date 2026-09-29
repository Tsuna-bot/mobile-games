// Global tuning. Distances in world units (1 = one floor tile), times in seconds.

export const CONFIG = {
  step: 1 / 60,
  arena: { width: 9, height: 15 },
  player: {
    radius: 0.32,
    speed: 3.3,
    hp: 750,
    damage: 85,
    rate: 1.25, // shots per second
    arrowSpeed: 13,
    // Time standing still before the first shot (Archero: stop to shoot).
    aimDelay: 0.12,
    invulnerable: 0.75,
    crit: 0.05,
    critDamage: 2,
  },
  xp: { base: 26, growth: 1.22 },
  // Global difficulty: monster damage and health multipliers.
  difficulty: { damage: 0.8, health: 0.85, roomGrowth: 0.05 },
  pickupRadius: 1.4,
  // Close, tilted view that follows the hero (`halfWidth`: half the width seen at the
  // hero's depth on a portrait phone); the menu frames the hero from up close.
  camera: { fov: 45, pitchDeg: 47, halfWidth: 4.2, maxHalfWidth: 6, follow: 0.3, menu: { distance: 5.5, pitchDeg: 12, lookY: 0.3 } },
  quality: {
    lowFps: 55,
    goodFps: 58.5,
    minPixelRatio: 1.25,
    minFps: 50,
    warmup: 2,
  },
};
