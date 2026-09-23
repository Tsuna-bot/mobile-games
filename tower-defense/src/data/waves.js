import { ENEMIES } from './enemies.js';

/**
 * Builds the wave list for a level. Each wave is a time-sorted list of spawns
 * plus an HP multiplier. Composition ramps up: scouts first, then runners,
 * armored tanks, and a mothership every fifth wave and on the final wave.
 */
export function buildWaves(level, levelIndex) {
  const waves = [];
  for (let w = 1; w <= level.waves; w++) {
    const spawns = [];
    const add = (type, count, interval, delay) => {
      for (let i = 0; i < count; i++) spawns.push({ time: delay + i * interval, type });
    };
    const last = w === level.waves;

    add('scout', Math.round(5 + w * 1.1), Math.max(0.6, 1.05 - w * 0.03), 0);
    if (w >= 3) add('runner', Math.round(2 + w * 0.8), 0.55, 4);
    if (w >= Math.max(2, 5 - levelIndex)) add('tank', Math.round(1 + (w - 2) * 0.4), 2.4, 7);
    if (w % 5 === 0 || last) add('boss', last && level.waves >= 12 ? 2 : 1, 8, 11);
    if (w >= 8) add('runner', Math.round(w * 0.6), 0.45, 15);

    spawns.sort((a, b) => a.time - b.time);
    const hpMultiplier = level.hpScale * (1 + 0.15 * (w - 1) + 0.012 * (w - 1) ** 2);
    const reward = spawns.reduce((sum, s) => sum + ENEMIES[s.type].reward, 0);
    waves.push({ number: w, spawns, hpMultiplier, reward });
  }
  return waves;
}
