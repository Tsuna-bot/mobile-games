import { ENEMIES } from './enemies.js';

/**
 * Builds wave number `w` (1-based) of a level: a time-sorted list of spawns and
 * an HP multiplier. Composition ramps up: scouts, then runners, armored tanks,
 * and a mothership every fifth wave and on the final wave. Works for any `w`,
 * which is what endless mode relies on.
 */
export function makeWave(level, levelIndex, w, { heroic = false, swarm = 1 } = {}) {
  const spawns = [];
  // A swarm (daily rule) brings more, weaker UFOs.
  const add = (type, count, interval, delay) => {
    const n = type === 'boss' ? count : Math.round(count * swarm);
    for (let i = 0; i < n; i++) spawns.push({ time: delay + (i * interval) / swarm, type });
  };
  const last = !level.endless && w === level.waves;
  const tier = Math.min(levelIndex, 4);

  // Variants (shield, splitter, healer) take the place of some scouts on later maps;
  // `level.roster` can bring them in earlier.
  const roster = level.roster ?? [];
  const has = (type, fromLevel) => roster.includes(type) || levelIndex >= fromLevel;
  const variants = [];
  // Each variant replaces scouts worth about the same total HP (`weight`).
  if (has('shield', 2) && w >= 4) variants.push(['shield', Math.round(1 + (w - 4) * 0.4), 1.6, 5, 2.4]);
  if (has('healer', 4) && w >= 8) variants.push(['healer', Math.round(1 + (w - 8) * 0.2), 3.5, 8, 2.8]);
  if (has('splitter', 4) && w >= 7) variants.push(['splitter', Math.round(1 + (w - 7) * 0.3), 2.4, 9, 3.6]);
  const replaced = variants.reduce((sum, v) => sum + v[1] * v[4], 0);
  add('scout', Math.max(2, Math.round(5 + w * 1.1 - replaced)), Math.max(0.5, 1.05 - w * 0.03), 0);
  for (const [type, count, interval, delay] of variants) add(type, count, interval, delay);
  if (w >= 3) add('runner', Math.round(2 + w * 0.8), 0.55, 4);
  if (w >= Math.max(2, 5 - tier)) add('tank', Math.round(1 + (w - 2) * 0.4), Math.max(1.4, 2.4 - w * 0.03), 7);
  if (w % 5 === 0 || last) add('boss', last && level.waves >= 12 ? 2 : Math.max(1, Math.floor(w / 15) + 1), 8, 11);
  if (w >= 8) add('runner', Math.round(w * 0.6), 0.45, 15);
  spawns.sort((a, b) => a.time - b.time);
  let growth = 1 + 0.15 * (w - 1) + 0.012 * (w - 1) ** 2;
  // Endless mode keeps accelerating so every run ends eventually.
  if (level.endless && w > 12) growth *= 1 + (w - 12) * 0.07;
  const hpMultiplier = (level.hpScale * growth * (heroic ? 1.3 : 1)) / Math.sqrt(swarm) / (swarm > 1 ? 1.15 : 1);
  const reward = spawns.reduce((sum, s) => sum + ENEMIES[s.type].reward, 0);
  return { number: w, spawns, hpMultiplier, reward };
}

export function buildWaves(level, levelIndex, options) {
  return Array.from({ length: level.waves }, (_, i) => makeWave(level, levelIndex, i + 1, options));
}
