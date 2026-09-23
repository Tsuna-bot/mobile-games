const STORAGE_KEY = 'bastion/v1';

export const QUALITY_SETTINGS = ['auto', 'high', 'medium', 'low'];

function defaults() {
  return {
    levels: {},
    tutorialDone: false,
    settings: { sound: true, music: true, haptics: true, quality: 'auto' },
  };
}

/** Reads the save, keeping only well-formed values. */
export function loadSave() {
  const save = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return save;
    const data = JSON.parse(raw);
    if (data.levels && typeof data.levels === 'object') {
      for (const [id, record] of Object.entries(data.levels)) {
        const stars = Number(record?.stars);
        if (Number.isInteger(stars) && stars >= 0 && stars <= 3) save.levels[id] = { stars };
      }
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Persistence is optional.
  }
}
