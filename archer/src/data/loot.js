// Loot found during a run: monsters now and then drop an item, elites more often,
// bosses always (and better ones). Items found later in the game are rarer and come
// at a higher level. Elites and bosses also drop runes (to raise the spells' ranks).

import { BASES, BASE_IDS, RARITIES } from './gear.js';

/** Chance to drop an item, per source. */
export const DROP_CHANCE = { normal: 0.012, elite: 0.14, boss: 1 };

/** Runes dropped: elites 1, bosses more further in. */
export function runeDrop(source, tier) {
  if (source === 'boss') return 3 + Math.floor(tier / 3);
  if (source === 'elite') return 1;
  return 0;
}

/**
 * Rarity odds [common, rare, epic, legendary] for a source at `tier`
 * (chapter index, or the Endless depth; Heroic adds a few tiers).
 */
export function lootOdds(source, tier) {
  const q = Math.min(1, Math.max(0, tier / 17));
  const w = {
    normal: [0.72 - 0.4 * q, 0.25 + 0.15 * q, 0.03 + 0.2 * q, 0.05 * q],
    elite: [0.42 - 0.35 * q, 0.44 - 0.05 * q, 0.12 + 0.28 * q, 0.02 + 0.12 * q],
    boss: [0.12 - 0.12 * q, 0.52 - 0.22 * q, 0.3 + 0.12 * q, 0.06 + 0.22 * q],
  }[source];
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
}

/** Weapons come up more often (they change how the hero plays). */
const WEIGHTS = BASE_IDS.map((id) => (BASES[id].slot === 'weapon' ? 1.7 : 1));
const TOTAL = WEIGHTS.reduce((a, b) => a + b, 0);

export function rollBase(random) {
  let r = random() * TOTAL;
  for (let i = 0; i < BASE_IDS.length; i++) {
    if (r < WEIGHTS[i]) return BASE_IDS[i];
    r -= WEIGHTS[i];
  }
  return BASE_IDS[0];
}

export function rollLootRarity(odds, random) {
  let r = random();
  for (let i = 0; i < odds.length; i++) {
    if (r < odds[i]) return i;
    r -= odds[i];
  }
  return 0;
}

/** Item level: deeper chapters drop items that are already raised a little. */
export function lootLevel(rarity, tier, random) {
  const level = 1 + Math.floor(tier * 0.8 + random() * 3);
  return Math.max(1, Math.min(RARITIES[rarity].cap, level));
}

/** A full item spec { base, rarity, level } dropped by `source` at `tier`. */
export function rollLoot(source, tier, random) {
  const rarity = rollLootRarity(lootOdds(source, tier), random);
  return { base: rollBase(random), rarity, level: lootLevel(rarity, tier, random) };
}
