// Save in localStorage: currencies, progress, settings (and later gear, talents, pets).

export const STORAGE_KEY = 'sagittaire/v1';

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
    gems: 0,
    unlocked: 0, // highest chapter index unlocked
    chapter: 0, // chapter shown in the menu
    best: {}, // chapter id -> best room reached (11 = cleared)
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
    for (const [id, room] of Object.entries(data.best ?? {})) if (isCount(Number(room), 99)) save.best[id] = Number(room);
    if (typeof data.tutorial === 'boolean') save.tutorial = data.tutorial;
    const s = data.settings ?? {};
    for (const key of ['sound', 'music', 'haptics']) if (typeof s[key] === 'boolean') save.settings[key] = s[key];
    if (['auto', 'low', 'medium', 'high', 'ultra'].includes(s.quality)) save.settings.quality = s.quality;
    // Later versions add their own fields; keep whatever they stored.
    for (const key of ['gear', 'talents', 'pets', 'heroes', 'inventory']) if (data[key] !== undefined) save[key] = data[key];
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
