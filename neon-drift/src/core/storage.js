const STORAGE_KEY = 'neon-drift/v1';

const QUALITY_SETTINGS = ['auto', 'high', 'medium', 'low'];

function defaults() {
  return {
    best: 0,
    tutorialDone: false,
    settings: { sound: true, haptics: true, quality: 'auto' },
  };
}

/** Reads the save, falling back to defaults for anything missing or malformed. */
export function loadSave() {
  const save = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return save;
    const data = JSON.parse(raw);
    if (Number.isFinite(data.best) && data.best > 0) save.best = Math.floor(data.best);
    if (typeof data.tutorialDone === 'boolean') save.tutorialDone = data.tutorialDone;
    const settings = data.settings ?? {};
    if (typeof settings.sound === 'boolean') save.settings.sound = settings.sound;
    if (typeof settings.haptics === 'boolean') save.settings.haptics = settings.haptics;
    if (QUALITY_SETTINGS.includes(settings.quality)) save.settings.quality = settings.quality;
  } catch {
    // Storage blocked (private mode, disabled cookies) or corrupted: play with defaults.
  }
  return save;
}

export function writeSave(save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Persistence is a nice-to-have; the game keeps working without it.
  }
}

export { QUALITY_SETTINGS };
