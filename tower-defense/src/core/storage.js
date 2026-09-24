import { ACHIEVEMENTS, EMPTY_STATS } from '../data/achievements.js';
import { persist } from './cloud.js';
import { PERKS } from '../data/perks.js';
import { SPELLS, STARTER_SPELLS } from '../data/spells.js';
import { STARTER_TOWERS, TOWERS } from '../data/towers.js';

export const STORAGE_KEY = 'bastion/v1';
export const RUN_KEY = 'bastion/run';

export const QUALITY_SETTINGS = ['auto', 'ultra', 'high', 'medium', 'low'];

function defaults() {
  return {
    levels: {},
    perks: {},
    survival: { bestWave: 0, stars: 0 },
    gems: 0,
    owned: { towers: [...STARTER_TOWERS], spells: [...STARTER_SPELLS] },
    achievements: {},
    stats: { ...EMPTY_STATS },
    tutorialDone: false,
    settings: { sound: true, music: true, haptics: true, quality: 'auto' },
  };
}

const isCount = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

/** Reads the save, keeping only well-formed values (older saves stay compatible). */
export function loadSave() {
  const save = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return save;
    const data = JSON.parse(raw);
    if (data.levels && typeof data.levels === 'object') {
      for (const [id, record] of Object.entries(data.levels)) {
        const stars = Number(record?.stars);
        if (isCount(stars, 3)) save.levels[id] = { stars, crown: record?.crown === true };
      }
    }
    if (data.perks && typeof data.perks === 'object') {
      for (const perk of PERKS) {
        const rank = Number(data.perks[perk.id]);
        if (isCount(rank, perk.costs.length)) save.perks[perk.id] = rank;
      }
    }
    if (isCount(Number(data.survival?.bestWave), 10000)) save.survival.bestWave = Number(data.survival.bestWave);
    if (isCount(Number(data.survival?.stars), 3)) save.survival.stars = Number(data.survival.stars);
    if (isCount(Number(data.gems), 1e7)) save.gems = Number(data.gems);
    if (Array.isArray(data.owned?.towers)) {
      save.owned.towers = [...new Set([...STARTER_TOWERS, ...data.owned.towers.filter((id) => TOWERS[id])])];
    }
    if (Array.isArray(data.owned?.spells)) {
      save.owned.spells = [...new Set([...STARTER_SPELLS, ...data.owned.spells.filter((id) => SPELLS[id])])];
    }
    for (const achievement of ACHIEVEMENTS) {
      if (data.achievements?.[achievement.id] === true) save.achievements[achievement.id] = true;
    }
    for (const key of Object.keys(EMPTY_STATS)) {
      const value = Number(data.stats?.[key]);
      if (isCount(value, 1e9)) save.stats[key] = value;
    }
    if (typeof data.tutorialDone === 'boolean') save.tutorialDone = data.tutorialDone;
    const settings = data.settings ?? {};
    for (const key of ['sound', 'music', 'haptics']) {
      if (typeof settings[key] === 'boolean') save.settings[key] = settings[key];
    }
    if (QUALITY_SETTINGS.includes(settings.quality)) save.settings.quality = settings.quality;
  } catch {
    // Storage blocked or corrupted: continue with defaults.
  }
  return save;
}

export function writeSave(save) {
  persist(STORAGE_KEY, JSON.stringify(save));
}

/** The run in progress (resumed after closing the page), or null. */
export function loadRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    const run = raw ? JSON.parse(raw) : null;
    return run && typeof run.levelId === 'string' && run.snapshot?.version === 1 ? run : null;
  } catch {
    return null;
  }
}

export function writeRun(run) {
  persist(RUN_KEY, JSON.stringify(run));
}

export function clearRun() {
  persist(RUN_KEY, null);
}

/** Stars earned so far: level stars, heroic crowns and survival milestones. */
export function earnedStars(save) {
  let total = save.survival.stars;
  for (const record of Object.values(save.levels)) total += record.stars + (record.crown ? 1 : 0);
  return total;
}
