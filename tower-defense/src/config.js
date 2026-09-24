// Global tuning. Per-tower, per-enemy and per-level data live in src/data/.

export const CONFIG = {
  loop: {
    fixedStep: 1 / 60,
    maxFrameDelta: 0.1,
    maxSubSteps: 8,
  },

  economy: {
    startLives: 20,
    sellRefund: 0.7,
    // Gold per second of countdown skipped when calling the next wave early.
    earlyCallBonusPerSecond: 1,
    waveClearBonusBase: 15,
    waveClearBonusPerWave: 3,
    // Extra gold (plus the wave number) when no enemy got through.
    perfectWaveBonus: 8,
    // Gold per kill beyond the second when several enemies die at once.
    multiKillBonus: 3,
  },

  waves: {
    // Pause between the end of a wave's spawning and the automatic start of the next one.
    countdown: 16,
  },

  combat: {
    // Armor removes flat damage per hit but a hit always deals at least this share.
    minDamageShare: 0.2,
    splashEdgeDamage: 0.5,
    projectileHitRadius: 0.18,
  },

  stars: {
    // Lives lost allowed for 3 and 2 stars.
    maxLostForThree: 2,
    maxLostForTwo: 10,
  },

  world: {
    tileTop: 0.2,
    enemyHover: 0.55,
    enemyScale: 0.62,
  },

  camera: {
    fov: 32,
    pitchDeg: 58,
    minZoom: 0.55,
    // Screen space reserved for the HUD (CSS pixels) when framing the map.
    hudTop: 70,
    hudBottom: 104,
  },

  input: {
    tapMaxMove: 10,
    tapMaxTime: 0.45,
  },

  quality: {
    minFps: 42,
    sampleWindow: 3,
    warmup: 2,
  },

  haptics: {
    tap: 8,
    build: 18,
    leak: [40, 30, 60],
    victory: [30, 40, 30, 40, 80],
  },
};
