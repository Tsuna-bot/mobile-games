// The extra ways to play beyond the chapters: the Daily challenge, the Boss rush,
// Survival and the Tower of curses; and the mutations (curses and blessings) that bend
// the rules of a run. Pure data and pure functions (testable in Node).

import { seededRandom } from '../core/random.js';

/**
 * Mutations. Each changes some numbers of the run (see Run.applyMutations):
 * monsters `health`, `power` (damage), `tempo` (how fast they move and attack),
 * `count` (how many per room), `elites` (extra elite chance); the hero `hp`,
 * `damage`, `rate`, `speed`, `heal` (hearts and room heals; 0 = none),
 * `lifeOnKill`; `coins`, `xp`, `abilities` (extra picks at the start).
 * `reward` multiplies the gems won by the mode (curses pay, blessings cost).
 */
export const MUTATIONS = {
  giants: { id: 'giants', kind: 'curse', icon: 'strength', name: 'Colosses', text: 'Les monstres ont 60 % de vie en plus.', health: 1.6, reward: 1.3 },
  frenzy: { id: 'frenzy', kind: 'curse', icon: 'haste', name: 'Frénésie', text: 'Les monstres bougent et attaquent 25 % plus vite.', tempo: 1.25, reward: 1.3 },
  hordes: { id: 'hordes', kind: 'curse', icon: 'multishot', name: 'Hordes', text: '50 % de monstres en plus dans chaque salle.', count: 1.5, reward: 1.3 },
  elites: { id: 'elites', kind: 'curse', icon: 'elite', name: 'Élite', text: 'Un monstre sur trois de plus est une élite.', elites: 0.3, reward: 1.25 },
  brutes: { id: 'brutes', kind: 'curse', icon: 'skull', name: 'Brutes', text: 'Les monstres frappent 40 % plus fort.', power: 1.4, reward: 1.3 },
  glass: { id: 'glass', kind: 'curse', icon: 'vitality', name: 'Cœur de verre', text: 'Moitié moins de vie, mais 50 % de dégâts en plus.', hp: 0.5, damage: 1.5, reward: 1.35 },
  drought: { id: 'drought', kind: 'curse', icon: 'heal', name: 'Sécheresse', text: 'Plus aucun cœur ni soin entre les salles.', heal: 0, reward: 1.3 },
  fortune: { id: 'fortune', kind: 'blessing', icon: 'fortune', name: 'Fortune', text: 'Deux fois plus d’or.', coins: 2 },
  arsenal: { id: 'arsenal', kind: 'blessing', icon: 'upgrade', name: 'Arsenal', text: 'Deux capacités de plus au départ.', abilities: 2 },
  vampire: { id: 'vampire', kind: 'blessing', icon: 'bloodthirst', name: 'Vampire', text: 'Chaque monstre abattu rend 2 % de vie.', lifeOnKill: 0.02 },
  wisdom: { id: 'wisdom', kind: 'blessing', icon: 'level', name: 'Sagesse', text: '50 % d’expérience en plus.', xp: 1.5 },
  swift: { id: 'swift', kind: 'blessing', icon: 'swift', name: 'Célérité', text: 'Tu cours et tu tires 20 % plus vite.', speed: 1.2, rate: 1.2 },
};

export const CURSES = Object.values(MUTATIONS).filter((m) => m.kind === 'curse').map((m) => m.id);
export const BLESSINGS = Object.values(MUTATIONS).filter((m) => m.kind === 'blessing').map((m) => m.id);

/** Gem multiplier of a set of mutations (curses raise it). */
export function rewardMul(ids) {
  return ids.reduce((mul, id) => mul * (MUTATIONS[id]?.reward ?? 1), 1);
}

/**
 * The modes shown in the mode picker. `opens`: chapter index that must be won first.
 * `chapter` modes are played on the shown chapter (Normal, Heroic); the others pick
 * their own landscapes and strength from the player's progress.
 */
export const MODES = {
  normal: { id: 'normal', icon: 'play', name: 'Aventure', text: 'Les 30 chapitres, salle après salle.', opens: -1, chapter: true },
  heroic: { id: 'heroic', icon: 'heroic', name: 'Héroïque', text: 'Les chapitres gagnés, bien plus durs, meilleur butin.', opens: 0, chapter: true },
  daily: { id: 'daily', icon: 'calendar', name: 'Défi du jour', text: 'Une partie courte avec 3 mutations, la même toute la journée. Gagne chaque jour pour faire grimper ta série !', opens: 0 },
  survival: { id: 'survival', icon: 'quake', name: 'Survie', text: 'Tiens 4 minutes face à des vagues sans fin. Deux boss en chemin.', opens: 0 },
  bossrush: { id: 'bossrush', icon: 'skull', name: 'Ruée des boss', text: 'Tous les boss que tu as battus, l’un après l’autre. Un ange entre chaque.', opens: 2 },
  tower: { id: 'tower', icon: 'crown', name: 'Tour maudite', text: 'Des étages sans fin. Après chaque boss, choisis une malédiction : plus dur, mais plus de gemmes.', opens: 4 },
  endless: { id: 'endless', icon: 'infinity', name: 'Infini', text: 'Des salles sans fin, un boss toutes les 5 salles.', opens: 0 },
};

export const MODE_ORDER = ['normal', 'heroic', 'daily', 'survival', 'bossrush', 'tower', 'endless'];

// ------------------------------------------------------------ daily challenge

/** Rooms of the daily challenge (the last one holds the boss). */
export const DAILY_ROOMS = 13;
export const DAILY_ANGELS = [5, 9];
/** Monsters a little weaker than in the chapters: the two curses already bite. */
export const DAILY_HEALTH = 0.75;

/** A number for the day (local date), the seed of its challenge. */
export function daySeed(day) {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * The challenge of `day` ("2026-10-02") for a player who opened chapters 0..`unlocked`:
 * a landscape and its monsters (one of the opened chapters), two curses and a blessing.
 * The strength follows the furthest chapter opened, so it stays a challenge.
 */
export function dailyChallenge(day, unlocked) {
  const random = seededRandom(daySeed(day));
  const pick = (list) => list.splice(Math.floor(random() * list.length), 1)[0];
  const curses = [...CURSES];
  const blessings = [...BLESSINGS];
  return {
    day,
    seed: daySeed(day) ^ 0x5bd1e995,
    chapterIndex: Math.floor(random() * (unlocked + 1)),
    mutations: [pick(curses), pick(curses), pick(blessings)],
  };
}

/** Gems for winning the daily challenge, growing with the streak of days in a row. */
export function dailyReward(streak) {
  return 25 + Math.min(6, Math.max(0, streak - 1)) * 10;
}

/** Days between two day keys ("2026-10-01" -> "2026-10-02" = 1). */
export function daysBetween(a, b) {
  const t = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86400000);
}

// ------------------------------------------------------------ survival

/**
 * Survival: one open arena, monsters pour in from the edges. `duration` seconds to
 * hold; `bosses`: when a boss joins (seconds). Waves grow denser and tougher with time.
 */
export const SURVIVAL = {
  duration: 240,
  bosses: [110, 215],
  // Bosses come with this share of their usual health (the waves keep coming).
  bossHealth: 0.55,
  // Seconds between two waves (start -> end of the timer) and monsters per wave.
  every: [6, 3.2],
  size: [2, 5],
  // Monster health over the run (x the strength of the furthest chapter opened).
  health: (t) => 0.4 + 0.6 * (t / 240),
  maxAlive: 16,
  // Monsters by the wave from which they can come; mostly melee (shooters pile up fast).
  pool: [['zombie', 0], ['zombie', 0], ['wisp', 1], ['orc', 2], ['ghost', 3], ['skeleton', 4], ['blob', 5], ['orc', 6], ['vampire', 9], ['keeper', 14], ['bomber', 18]],
  gems: 40,
};

// ------------------------------------------------------------ boss rush

/** Boss rush: each boss a little tougher than the last. */
export const BOSS_RUSH = {
  health: (i) => 0.8 + i * 0.07,
  heal: 0.3,
  gemsPerBoss: 4,
};

// ------------------------------------------------------------ tower of curses

/** Tower: a boss every 5 floors, then a curse to pick (one of two). */
export const TOWER = {
  bossEvery: 5,
  gemsPerBoss: 6,
};
