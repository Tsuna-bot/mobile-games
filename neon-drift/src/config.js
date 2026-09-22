// Every gameplay and tuning constant lives here so balancing never requires touching logic.

export const CONFIG = {
  loop: {
    fixedStep: 1 / 120,
    maxFrameDelta: 0.1,
    maxSubSteps: 12,
  },

  road: {
    halfWidth: 4.5,
    cellCount: 5,
    cellWidth: 1.8,
    length: 320,
    textureTile: 6,
  },

  player: {
    radius: 0.5,
    hitboxScale: 0.8,
    maxX: 4.0,
    hoverHeight: 0.62,
    // Road widths travelled for a drag spanning the reference width (see Input).
    dragRange: 1.25,
    keyboardSpeed: 15,
    followSharpness: 24,
    maxTilt: 0.6,
  },

  speed: {
    menu: 14,
    start: 24,
    max: 56,
    // Time constant of the exponential ramp: ~63% of max speed after this many seconds.
    rampSeconds: 60,
    acceleration: 2.5,
  },

  track: {
    firstRowAhead: 80,
    spawnAhead: 175,
    despawnBehind: 14,
    spacingStart: 36,
    spacingMin: 19,
    spacingJitter: 0.1,
    riseStart: 172,
    riseEnd: 128,
    breatherEvery: 14,
    breatherLength: 62,
    breatherShards: 7,
  },

  blocks: {
    width: 1.7,
    height: 1.5,
    depth: 1.1,
    edgeGlow: 3.2,
  },

  shards: {
    value: 25,
    maxCombo: 8,
    pickupRadius: 1.05,
    perSegment: 3,
    segmentChance: 0.6,
    hoverHeight: 0.8,
  },

  nearMiss: {
    threshold: 0.5,
    bonus: 50,
    timeScale: 0.4,
    duration: 0.22,
  },

  death: {
    timeScale: 0.15,
    duration: 1.15,
  },

  score: {
    perUnit: 0.5,
  },

  tutorial: {
    moveToComplete: 3,
    maxDuration: 7,
  },

  camera: {
    fov: 66,
    speedFovBoost: 8,
    visibleHalfWidth: 5.4,
    minDistance: 7.5,
    maxDistance: 14,
    elevationDeg: 22,
    lookAhead: 12,
    followFactor: 0.45,
  },

  quality: {
    // Auto mode drops one level when the average FPS stays below this value.
    minFps: 45,
    sampleWindow: 3,
    warmup: 2,
  },

  colors: {
    skyTop: 0x07021a,
    skyHorizon: 0x3a0f5c,
    horizonGlow: 0xff3d8b,
    fog: 0x2a0b45,
    sunTop: 0xffe45e,
    sunBottom: 0xff2bd6,
    grid: 0xb62cff,
    road: 0x0d0a1f,
    roadLine: 0x3ad7ff,
    rail: 0x21e6ff,
    pylon: 0xff2bd6,
    mountain: 0x14062b,
    mountainLine: 0x8a2cff,
    wall: 0xff2bd6,
    pillar: 0x21e6ff,
    slider: 0xffa21f,
    shard: 0x9dffef,
    player: 0x21e6ff,
    playerAccent: 0xff2bd6,
  },

  haptics: {
    shard: 8,
    nearMiss: 18,
    crash: [70, 40, 120],
    ui: 6,
  },
};
