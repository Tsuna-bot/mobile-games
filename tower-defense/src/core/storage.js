import { PERKS } from '../data/perks.js';

const STORAGE_KEY = 'bastion/v1';

export const QUALITY_SETTINGS = ['auto', 'high', 'medium', 'low'];

function defaults() {
  return {
    levels: {},
    perks: {},
    survival: { bestWave: 0, stars: 0 },
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Persistence is optional.
  }
}

/** Stars earned so far: level stars, heroic crowns and survival milestones. */
export function earnedStars(save) {
  let total = save.survival.stars;
  for (const record of Object.values(save.levels)) total += record.stars + (record.crown ? 1 : 0);
  return total;
}
