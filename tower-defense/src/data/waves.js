import { ENEMIES } from './enemies.js';

/**
 * Builds wave number `w` (1-based) of a level: a time-sorted list of spawns and
 * an HP multiplier. Composition ramps up: scouts, then runners, armored tanks,
 * and a mothership every fifth wave and on the final wave. Works for any `w`,
 * which is what endless mode relies on.
 */
export function makeWave(level, levelIndex, w, { heroic = false } = {}) {
  const spawns = [];
  const add = (type, count, interval, delay) => {
    for (let i = 0; i < count; i++) spawns.push({ time: delay + i * interval, type });
  };
  const last = !level.endless && w === level.waves;
  const tier = Math.min(levelIndex, 4);

  add('scout', Math.round(5 + w * 1.1), Math.max(0.5, 1.05 - w * 0.03), 0);
  if (w >= 3) add('runner', Math.round(2 + w * 0.8), 0.55, 4);
  if (w >= Math.max(2, 5 - tier)) add('tank', Math.round(1 + (w - 2) * 0.4), Math.max(1.4, 2.4 - w * 0.03), 7);
  if (w % 5 === 0 || last) add('boss', last && level.waves >= 12 ? 2 : Math.max(1, Math.floor(w / 15) + 1), 8, 11);
  if (w >= 8) add('runner', Math.round(w * 0.6), 0.45, 15);

  spawns.sort((a, b) => a.time - b.time);
  let growth = 1 + 0.15 * (w - 1) + 0.012 * (w - 1) ** 2;
  // Endless mode keeps accelerating so every run ends eventually.
  if (level.endless && w > 12) growth *= 1 + (w - 12) * 0.07;
  const hpMultiplier = level.hpScale * growth * (heroic ? 1.3 : 1);
  const reward = spawns.reduce((sum, s) => sum + ENEMIES[s.type].reward, 0);
  return { number: w, spawns, hpMultiplier, reward };
}

export function buildWaves(level, levelIndex, options) {
  return Array.from({ length: level.waves }, (_, i) => makeWave(level, levelIndex, i + 1, options));
}
