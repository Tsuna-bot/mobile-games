// Long-term progression on the save: account level and experience, the talent tree,
// daily missions, achievements, records of the Heroic and Endless modes.
// Pure functions (no DOM), testable in Node.

import { ALL_CHAPTERS, isWon } from '../data/chapters.js';
import {
  ACHIEVEMENTS, BRANCHES, DAILY_BONUS, MAX_ACCOUNT_LEVEL, MISSIONS, MISSIONS_PER_DAY, TIER_NEEDS, TREE, TREE_BY_ID, accountXpNeeded, levelReward,
} from '../data/progression.js';
import { MODES, dailyChallenge, dailyReward, daysBetween } from '../data/modes.js';

const STAT_KEYS = ['kills', 'rooms', 'wins', 'bosses', 'elites', 'upgrades', 'chests', 'abilities', 'runs', 'legendaries', 'awakenings', 'endlessRooms', 'heroicRooms', 'spells', 'loot', 'runes',
  'dailyWins', 'survivalWins', 'survivalSeconds', 'rushBosses', 'curses'];

/** Fills in the progression fields (new player or older save). */
export function ensureProgress(save) {
  if (!save.stats || typeof save.stats !== 'object') {
    // Players of earlier versions: their past runs count.
    save.stats = { kills: save.kills ?? 0, runs: save.runs ?? 0 };
  }
  for (const key of STAT_KEYS) if (!Number.isFinite(save.stats[key]) || save.stats[key] < 0) save.stats[key] = 0;
  if (!save.account || !Number.isFinite(save.account.level)) {
    save.account = { level: 1, xp: 0 };
    // Earlier versions: some experience for the runs already played (points only, no gifts).
    const past = Math.min(20000, (save.runs ?? 0) * 60 + (save.kills ?? 0));
    if (past) addAccountXp(save, past, { silent: true });
  }
  save.account.level = Math.max(1, Math.min(MAX_ACCOUNT_LEVEL, Math.floor(save.account.level)));
  if (!Number.isFinite(save.account.xp) || save.account.xp < 0) save.account.xp = 0;
  if (!save.tree || typeof save.tree !== 'object') save.tree = {};
  for (const [id, n] of Object.entries(save.tree)) {
    const node = TREE_BY_ID[id];
    if (!node || !Number.isFinite(n) || n <= 0) delete save.tree[id];
    else save.tree[id] = Math.min(node.max, Math.floor(n));
  }
  // More points spent than owned (corrupt save): start the tree over.
  if (treeSpent(save) > treePoints(save)) save.tree = {};
  if (!save.achievements || typeof save.achievements !== 'object') save.achievements = {};
  if (!save.endless || typeof save.endless !== 'object') save.endless = { best: 0 };
  if (!Number.isFinite(save.endless.best)) save.endless.best = 0;
  if (!save.daily || typeof save.daily !== 'object') save.daily = null;
  // Records of the extra modes; the Daily challenge's streak.
  if (!save.modes || typeof save.modes !== 'object') save.modes = {};
  const modes = save.modes;
  for (const id of ['survival', 'bossrush', 'tower']) {
    if (!modes[id] || typeof modes[id] !== 'object') modes[id] = {};
    if (!Number.isFinite(modes[id].best) || modes[id].best < 0) modes[id].best = 0;
  }
  if (!modes.challenge || typeof modes.challenge !== 'object') modes.challenge = {};
  const ch = modes.challenge;
  for (const key of ['streak', 'bestStreak', 'best']) if (!Number.isFinite(ch[key]) || ch[key] < 0) ch[key] = 0;
  for (const key of ['lastWin', 'day']) if (typeof ch[key] !== 'string') ch[key] = '';
  // A chapter won while it was the last one never opened the next: chapters added
  // later stayed locked. Open everything after the chapters already won.
  if (!Number.isFinite(save.unlocked) || save.unlocked < 0) save.unlocked = 0;
  const opened = save.unlocked;
  while (save.unlocked < ALL_CHAPTERS.length - 1 && isWon(save.best?.[ALL_CHAPTERS[save.unlocked].id])) save.unlocked++;
  // The menu shows the newly opened chapter.
  if (save.unlocked > opened) save.chapter = save.unlocked;
  save.unlocked = Math.min(save.unlocked, ALL_CHAPTERS.length - 1);
  return save;
}

// ------------------------------------------------------------ account level

/** Adds account experience; returns the levels gained with their rewards (already given). */
export function addAccountXp(save, amount, { silent = false } = {}) {
  const account = save.account;
  const gained = [];
  account.xp += Math.max(0, Math.round(amount));
  while (account.level < MAX_ACCOUNT_LEVEL && account.xp >= accountXpNeeded(account.level)) {
    account.xp -= accountXpNeeded(account.level);
    account.level++;
    const reward = levelReward(account.level);
    if (!silent) {
      save.gems += reward.gems;
      save.coins += reward.coins;
    }
    gained.push({ level: account.level, ...reward, gems: silent ? 0 : reward.gems, coins: silent ? 0 : reward.coins });
  }
  if (account.level >= MAX_ACCOUNT_LEVEL) account.xp = 0;
  return gained;
}

// ------------------------------------------------------------ talent tree

/** Points earned: one per account level above the first. */
export function treePoints(save) {
  return Math.max(0, (save.account?.level ?? 1) - 1);
}

export function treeSpent(save, branch = null) {
  let n = 0;
  for (const [id, rank] of Object.entries(save.tree ?? {})) {
    const node = TREE_BY_ID[id];
    if (node && (!branch || node.branch === branch)) n += rank;
  }
  return n;
}

export function treeFree(save) {
  return treePoints(save) - treeSpent(save);
}

/** Whether a node's tier is open (enough points in its branch). */
export function nodeOpen(save, node) {
  return treeSpent(save, node.branch) >= TIER_NEEDS[node.tier - 1];
}

export function canLearn(save, id) {
  const node = TREE_BY_ID[id];
  return Boolean(node) && treeFree(save) > 0 && nodeOpen(save, node) && (save.tree[id] ?? 0) < node.max;
}

export function learn(save, id) {
  if (!canLearn(save, id)) return false;
  save.tree[id] = (save.tree[id] ?? 0) + 1;
  return true;
}

/** Free reset: every point comes back. */
export function resetTree(save) {
  if (!treeSpent(save)) return false;
  save.tree = {};
  return true;
}

export { BRANCHES };

// ------------------------------------------------------------ counters, missions, achievements

/** Adds to a counter: lifetime stats (achievements) and today's missions. */
export function track(save, stat, amount = 1) {
  save.stats ??= {};
  save.stats[stat] = (save.stats[stat] ?? 0) + amount;
  const daily = save.daily;
  if (daily?.missions) {
    for (const m of daily.missions) {
      const def = MISSIONS.find((d) => d.id === m.id);
      if (def?.stat === stat && !m.claimed) m.progress = Math.min(def.goal, m.progress + amount);
    }
  }
}

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True once the chapter a mode asks for has been won (Adventure is always open). */
export function modeOpen(save, id) {
  const mode = MODES[id];
  if (!mode) return false;
  return mode.opens < 0 || isWon(save.best?.[ALL_CHAPTERS[mode.opens].id]);
}

/** Today's Daily challenge and where the player stands with it. */
export function dailyState(save, now = Date.now()) {
  const day = dayKey(now);
  const ch = save.modes.challenge;
  const challenge = dailyChallenge(day, save.unlocked);
  const wonToday = ch.lastWin === day;
  // The streak holds while the last win was today or yesterday.
  const alive = ch.lastWin && daysBetween(ch.lastWin, day) <= 1;
  return { day, challenge, wonToday, streak: alive ? ch.streak : 0, best: ch.day === day ? ch.best : 0, reward: dailyReward(wonToday ? ch.streak : (alive ? ch.streak : 0) + 1) };
}

/** Records a Daily challenge run; the first win of the day grows the streak and pays. */
export function recordDaily(save, room, won, now = Date.now()) {
  const day = dayKey(now);
  const ch = save.modes.challenge;
  if (ch.day !== day) {
    ch.day = day;
    ch.best = 0;
  }
  ch.best = Math.max(ch.best, room);
  if (!won || ch.lastWin === day) return { first: false, streak: ch.lastWin === day ? ch.streak : 0, gems: 0 };
  ch.streak = ch.lastWin && daysBetween(ch.lastWin, day) === 1 ? ch.streak + 1 : 1;
  ch.lastWin = day;
  ch.bestStreak = Math.max(ch.bestStreak, ch.streak);
  return { first: true, streak: ch.streak, gems: dailyReward(ch.streak) };
}

export function endlessOpen(save) {
  return isWon(save.best?.[ALL_CHAPTERS[0].id]);
}

export function heroicOpen(save, chapterIndex) {
  const chapter = ALL_CHAPTERS[chapterIndex];
  return Boolean(chapter) && isWon(save.best?.[chapter.id]);
}

/** Today's three missions (new ones every day, picked from the day's date). */
export function ensureDaily(save, now = Date.now()) {
  const day = dayKey(now);
  if (save.daily?.day === day) return save.daily;
  const pool = MISSIONS.filter((m) => !m.needs || modeOpen(save, m.needs));
  // FNV-1a hash of the date, then a well-mixed generator (mulberry32).
  let seed = 2166136261;
  for (const c of day) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const picked = [];
  while (picked.length < MISSIONS_PER_DAY && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  save.daily = { day, missions: picked.map((m) => ({ id: m.id, progress: 0, claimed: false })), bonus: false };
  return save.daily;
}

export function missionDef(id) {
  return MISSIONS.find((m) => m.id === id);
}

/** Claims a finished mission; returns its reward, or null. */
export function claimMission(save, id) {
  const m = save.daily?.missions.find((x) => x.id === id);
  const def = missionDef(id);
  if (!m || !def || m.claimed || m.progress < def.goal) return null;
  m.claimed = true;
  save.gems += def.reward.gems ?? 0;
  save.coins += def.reward.coins ?? 0;
  return def.reward;
}

/** The day's bonus (a golden chest) once the three missions are claimed. */
export function dailyBonusReady(save) {
  const daily = save.daily;
  return Boolean(daily && !daily.bonus && daily.missions.length && daily.missions.every((m) => m.claimed));
}

export function claimDailyBonus(save) {
  if (!dailyBonusReady(save)) return null;
  save.daily.bonus = true;
  return DAILY_BONUS;
}

/** Current value of an achievement's counter. */
export function achievementValue(save, a) {
  switch (a.stat) {
    case 'chaptersWon': return ALL_CHAPTERS.filter((c) => isWon(save.best?.[c.id])).length;
    case 'heroicWon': return ALL_CHAPTERS.filter((c) => isWon(save.best?.[`${c.id}:heroic`])).length;
    case 'endlessBest': return save.endless?.best ?? 0;
    case 'dailyStreak': return save.modes?.challenge?.bestStreak ?? 0;
    case 'bossRushBest': return save.modes?.bossrush?.best ?? 0;
    case 'towerBest': return save.modes?.tower?.best ?? 0;
    case 'level': return save.account?.level ?? 1;
    case 'heroes': return save.heroes?.owned?.length ?? 0;
    case 'heroLevel': return Math.max(1, ...Object.values(save.heroData ?? {}).map((h) => h.level ?? 1));
    default: return save.stats?.[a.stat] ?? 0;
  }
}

/** Tiers already claimed, the next goal and whether it can be claimed. */
export function achievementState(save, a) {
  const claimed = save.achievements?.[a.id] ?? 0;
  const value = achievementValue(save, a);
  const done = claimed >= a.goals.length;
  const goal = done ? a.goals[a.goals.length - 1] : a.goals[claimed];
  return { claimed, value, goal, done, ready: !done && value >= goal, gems: done ? 0 : a.gems[claimed] };
}

export function claimAchievement(save, id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return null;
  const state = achievementState(save, a);
  if (!state.ready) return null;
  save.achievements[id] = state.claimed + 1;
  save.gems += state.gems;
  return { gems: state.gems };
}

/** Something to claim in the quests screen (menu badge). */
export function questsReady(save) {
  return Boolean(save.daily?.missions.some((m) => !m.claimed && m.progress >= (missionDef(m.id)?.goal ?? Infinity)))
    || dailyBonusReady(save)
    || ACHIEVEMENTS.some((a) => achievementState(save, a).ready);
}
