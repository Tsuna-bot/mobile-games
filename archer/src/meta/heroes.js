// Hero growth on the save: level and experience per hero, spell ranks, class, runes.
// Pure functions (no DOM), testable in Node.

import {
  CLASSES, CLASS_LEVEL, CLASS_SWITCH_GEMS, HERO_SPELLS, MAX_CLASS_RANK, MAX_HERO_LEVEL, MAX_SPELL_RANK, SPELLS, SPELL_UNLOCK,
  classOf, classRankScale, classUpgradeCost, heroLevelStats, heroXpNeeded, spellUpgradeCost,
} from '../data/heroes.js';
import { HEROES } from '../data/meta.js';

/** Fills in the hero growth fields (new player or older save). */
export function ensureHeroes(save) {
  if (!save.heroData || typeof save.heroData !== 'object') {
    save.heroData = {};
    // Players of earlier versions: their past runs count for the hero they play.
    const past = Math.min(4000, (save.runs ?? 0) * 90);
    const selected = save.heroes?.selected ?? 'archer';
    if (past && HEROES[selected]) {
      heroState(save, selected);
      addHeroXp(save, selected, past);
    }
  }
  for (const [id, h] of Object.entries(save.heroData)) {
    if (!HEROES[id] || !h || typeof h !== 'object') {
      delete save.heroData[id];
      continue;
    }
    h.level = Math.max(1, Math.min(MAX_HERO_LEVEL, Math.floor(h.level) || 1));
    if (!Number.isFinite(h.xp) || h.xp < 0) h.xp = 0;
    if (!Array.isArray(h.spells)) h.spells = [1, 1, 1];
    h.spells = [0, 1, 2].map((i) => Math.max(1, Math.min(MAX_SPELL_RANK, Math.floor(h.spells[i]) || 1)));
    if (h.cls && !classOf(id, h.cls)) h.cls = null;
    if (!h.clsRanks || typeof h.clsRanks !== 'object') h.clsRanks = {};
    for (const [c, r] of Object.entries(h.clsRanks)) {
      if (!classOf(id, c)) delete h.clsRanks[c];
      else h.clsRanks[c] = Math.max(1, Math.min(MAX_CLASS_RANK, Math.floor(r) || 1));
    }
  }
  if (!Number.isFinite(save.runes) || save.runes < 0) save.runes = 0;
  return save;
}

export function heroState(save, id) {
  save.heroData ??= {};
  save.heroData[id] ??= { level: 1, xp: 0, spells: [1, 1, 1], cls: null, clsRanks: {} };
  save.heroData[id].clsRanks ??= {};
  return save.heroData[id];
}

/** Adds experience to a hero; returns the levels reached (with what they unlock). */
export function addHeroXp(save, id, amount) {
  const h = heroState(save, id);
  const gained = [];
  h.xp += Math.max(0, Math.round(amount));
  while (h.level < MAX_HERO_LEVEL && h.xp >= heroXpNeeded(h.level)) {
    h.xp -= heroXpNeeded(h.level);
    h.level++;
    const spell = SPELL_UNLOCK.indexOf(h.level);
    gained.push({ level: h.level, spell: spell >= 0 ? HERO_SPELLS[id]?.[spell] : null, cls: h.level === CLASS_LEVEL });
  }
  if (h.level >= MAX_HERO_LEVEL) h.xp = 0;
  return gained;
}

/** Rank of a hero's spell (0 while still locked). */
export function spellRank(save, heroId, slot) {
  const h = heroState(save, heroId);
  return h.level >= SPELL_UNLOCK[slot] ? h.spells[slot] : 0;
}

/** Why the next rank cannot be bought (null when it can). */
export function spellUpgradeBlock(save, heroId, slot) {
  const rank = spellRank(save, heroId, slot);
  if (!rank) return 'locked';
  if (rank >= MAX_SPELL_RANK) return 'max';
  const cost = spellUpgradeCost(slot, rank);
  if (heroState(save, heroId).level < cost.level) return 'level';
  if (save.coins < cost.coins) return 'coins';
  if ((save.runes ?? 0) < cost.runes) return 'runes';
  return null;
}

export function upgradeSpell(save, heroId, slot) {
  if (spellUpgradeBlock(save, heroId, slot)) return false;
  const h = heroState(save, heroId);
  const cost = spellUpgradeCost(slot, h.spells[slot]);
  save.coins -= cost.coins;
  save.runes -= cost.runes;
  h.spells[slot]++;
  return true;
}

/** Picks a class (free the first time, gems to switch). */
export function chooseClass(save, heroId, classId) {
  const h = heroState(save, heroId);
  if (h.level < CLASS_LEVEL || !classOf(heroId, classId) || h.cls === classId) return false;
  if (h.cls) {
    if (save.gems < CLASS_SWITCH_GEMS) return false;
    save.gems -= CLASS_SWITCH_GEMS;
  }
  h.cls = classId;
  return true;
}

/** Rank of a class for this hero (1 once chosen). */
export function classRank(save, heroId, classId) {
  return heroState(save, heroId).clsRanks[classId] ?? 1;
}

/** Why the class cannot rank up (null when it can). */
export function classUpgradeBlock(save, heroId) {
  const h = heroState(save, heroId);
  if (!h.cls) return 'none';
  const rank = classRank(save, heroId, h.cls);
  if (rank >= MAX_CLASS_RANK) return 'max';
  const cost = classUpgradeCost(rank);
  if (h.level < cost.level) return 'level';
  if (save.coins < cost.coins) return 'coins';
  if ((save.runes ?? 0) < cost.runes) return 'runes';
  return null;
}

export function upgradeClass(save, heroId) {
  if (classUpgradeBlock(save, heroId)) return false;
  const h = heroState(save, heroId);
  const rank = classRank(save, heroId, h.cls);
  const cost = classUpgradeCost(rank);
  save.coins -= cost.coins;
  save.runes -= cost.runes;
  h.clsRanks[h.cls] = rank + 1;
  return true;
}

/** Class stats at a rank (every number grows 25 % per rank). */
export function classStats(cls, rank) {
  const k = classRankScale(rank);
  return Object.fromEntries(Object.entries(cls.stats).map(([key, v]) => [key, key === 'front' ? v : v * k]));
}

/** What the hero's level, class and spells bring to a run. */
export function heroGear(save, heroId) {
  const h = heroState(save, heroId);
  const cls = h.cls ? classOf(heroId, h.cls) : null;
  const stats = [heroLevelStats(h.level)];
  const clsRank = cls ? classRank(save, heroId, cls.id) : 0;
  if (cls) stats.push(classStats(cls, clsRank));
  const spells = [];
  (HERO_SPELLS[heroId] ?? []).forEach((id, slot) => {
    const rank = spellRank(save, heroId, slot);
    if (!rank || !SPELLS[id]) return;
    const boosted = cls?.spell === id;
    spells.push({ id, rank, slot, power: boosted ? cls.power * (1 + (clsRank - 1) * 0.1) : 1, cdMul: boosted ? cls.cd : 1 });
  });
  // The class spell, ranked with the class.
  if (cls?.classSpell && SPELLS[cls.classSpell]) spells.push({ id: cls.classSpell, rank: clsRank, slot: 3, power: 1, cdMul: 1 });
  return { stats, spells, level: h.level, cls, clsRank };
}

export { CLASSES, CLASS_LEVEL };
