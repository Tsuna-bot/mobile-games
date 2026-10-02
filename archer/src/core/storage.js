// Save in localStorage: currencies, progress, settings (and later gear, talents, pets).

import { WON } from '../data/chapters.js';

// The game's first name: kept so existing saves still load.
export const STORAGE_KEY = 'sagittaire/v1';

export function defaultSave() {
  return {
    // 2: chapters of 25 rooms (version 1 saved a won chapter as room 11).
    version: 2,
    coins: 0,
    gems: 0,
    unlocked: 0, // highest chapter index unlocked
    chapter: 0, // chapter shown in the menu
    best: {}, // chapter id -> best room reached (WON = cleared)
    runs: 0,
    kills: 0,
    tutorial: true,
    settings: { sound: true, music: true, haptics: true, quality: 'auto' },
  };
}

const isCount = (v, max = 1e12) => Number.isFinite(v) && v >= 0 && v <= max;

export function loadSave() {
  const save = defaultSave();
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!data || typeof data !== 'object') return save;
    for (const key of ['coins', 'gems', 'unlocked', 'chapter', 'runs', 'kills']) if (isCount(Number(data[key]))) save[key] = Number(data[key]);
    const tenRooms = !(Number(data.version) >= 2);
    for (const [id, room] of Object.entries(data.best ?? {})) {
      if (isCount(Number(room), 99)) save.best[id] = tenRooms && Number(room) > 10 ? WON : Number(room);
    }
    if (typeof data.tutorial === 'boolean') save.tutorial = data.tutorial;
    const s = data.settings ?? {};
    for (const key of ['sound', 'music', 'haptics']) if (typeof s[key] === 'boolean') save.settings[key] = s[key];
    if (['auto', 'low', 'medium', 'high', 'ultra'].includes(s.quality)) save.settings.quality = s.quality;
    // Progression fields (checked and repaired by ensureProfile).
    for (const key of ['talents', 'heroes', 'inventory', 'equipped', 'nextUid', 'freeChestAt', 'talentRolls', 'gifts', 'account', 'tree', 'stats', 'achievements', 'endless', 'daily', 'heroData', 'runes']) if (data[key] !== undefined) save[key] = data[key];
    if (typeof data.mode === 'string') save.mode = data.mode;
  } catch {
    // Corrupt save: start fresh rather than crash.
  }
  return save;
}

export function writeSave(save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked (private mode): the game still plays.
  }
}
