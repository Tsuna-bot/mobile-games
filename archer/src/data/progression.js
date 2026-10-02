// Long-term progression: account level, the talent tree, daily missions, achievements,
// and the two extra ways to play (Heroic chapters, Endless mode).

/** Account experience needed to go from `level` to `level + 1`. */
export function accountXpNeeded(level) {
  return Math.round(120 * 1.16 ** (level - 1));
}

export const MAX_ACCOUNT_LEVEL = 60;

/** Rewards for reaching `level` (one talent point each, plus gems and gold). */
export function levelReward(level) {
  return { points: 1, gems: 10 + Math.floor(level / 5) * 5, coins: 200 + level * 40 };
}

/** Account experience earned by a run. */
export function runAccountXp({ rooms, kills, won, chapterIndex = 0, mode = 'normal' }) {
  let xp = rooms * 10 + kills;
  if (won) xp += 80 + chapterIndex * 25;
  if (mode === 'heroic') xp *= 1.5;
  return Math.round(xp);
}

// ------------------------------------------------------------ talent tree

/**
 * Three branches of five tiers. A tier opens once enough points are spent in its
 * branch (`TIER_NEEDS`). Account levels give the points; resetting is free.
 */
export const BRANCHES = [
  { id: 'war', name: 'Guerre', color: '#ff8a5a' },
  { id: 'guard', name: 'Garde', color: '#6ab4ff' },
  { id: 'fortune', name: 'Fortune', color: '#ffd05a' },
];

export const TIER_NEEDS = [0, 2, 4, 7, 10];

export const TREE = [
  { id: 'precision', branch: 'war', tier: 1, icon: 'crit', name: 'Précision', max: 3, text: (n) => `Critique +${n * 2} %`, stats: (n) => ({ crit: n * 0.02 }) },
  { id: 'might', branch: 'war', tier: 2, icon: 'attack', name: 'Puissance', max: 3, text: (n) => `Attaque +${n * 4} %`, stats: (n) => ({ damageMul: n * 0.04 }) },
  { id: 'giant', branch: 'war', tier: 3, icon: 'strength', name: 'Tueur de géants', max: 3, text: (n) => `Dégâts aux boss +${n * 8} %`, stats: (n) => ({ bossDamage: n * 0.08 }) },
  { id: 'tempo', branch: 'war', tier: 4, icon: 'speed', name: 'Tempo', max: 3, text: (n) => `Cadence +${n * 4} %`, stats: (n) => ({ rateMul: n * 0.04 }) },
  { id: 'master', branch: 'war', tier: 5, icon: 'multishot', name: 'Maître d’armes', max: 1, text: () => 'Une capacité de départ en plus', stats: () => ({ startAbilities: 1 }) },

  { id: 'toughness', branch: 'guard', tier: 1, icon: 'vitality', name: 'Robustesse', max: 3, text: (n) => `Vie +${n * 5} %`, stats: (n) => ({ hpMul: n * 0.05 }) },
  { id: 'plating', branch: 'guard', tier: 2, icon: 'guard', name: 'Carapace', max: 3, text: (n) => `Dégâts subis −${n * 2} %`, stats: (n) => ({ armor: n * 0.02 }) },
  { id: 'second', branch: 'guard', tier: 3, icon: 'heal', name: 'Second souffle', max: 1, text: () => 'Tu revis avec 80 % de ta vie', stats: () => ({ reviveShare: 0.8 }) },
  { id: 'mending', branch: 'guard', tier: 4, icon: 'recovery', name: 'Régénération', max: 3, text: (n) => `Soin par salle +${n * 2} %`, stats: (n) => ({ healOnRoom: n * 0.02 }) },
  { id: 'aegis', branch: 'guard', tier: 5, icon: 'shield', name: 'Égide', max: 1, text: () => 'Bouclier divin dès le départ (un coup bloqué toutes les 10 s)', stats: () => ({ shield: 10 }) },

  { id: 'greed', branch: 'fortune', tier: 1, icon: 'looting', name: 'Avidité', max: 3, text: (n) => `Or +${n * 6} %`, stats: (n) => ({ coinMul: n * 0.06 }) },
  { id: 'stride', branch: 'fortune', tier: 2, icon: 'swift', name: 'Foulée', max: 3, text: (n) => `Vitesse +${n * 3} %`, stats: (n) => ({ speedMul: n * 0.03 }) },
  { id: 'wisdom', branch: 'fortune', tier: 3, icon: 'upgrade', name: 'Sagesse', max: 3, text: (n) => `Expérience +${n * 8} %`, stats: (n) => ({ xpMul: n * 0.08 }) },
  { id: 'magnet', branch: 'fortune', tier: 4, icon: 'gold-bag', name: 'Aimant', max: 2, text: (n) => `Rayon de ramassage +${n * 35} %`, stats: (n) => ({ magnet: n * 0.35 }) },
  { id: 'angel', branch: 'fortune', tier: 5, icon: 'life', name: 'Ange gardien', max: 1, text: () => 'Un ange de plus après la salle 21', stats: () => ({ extraAngel: 1 }) },
];

export const TREE_BY_ID = Object.fromEntries(TREE.map((node) => [node.id, node]));

// ------------------------------------------------------------ daily missions

/**
 * Daily missions: three a day, picked from this pool (`needs`: only offered once that
 * part of the game is open). `stat` is the counter they follow during the day.
 */
export const MISSIONS = [
  { id: 'kills', stat: 'kills', goal: 120, text: 'Vaincre 120 monstres', reward: { gems: 15 } },
  { id: 'rooms', stat: 'rooms', goal: 15, text: 'Nettoyer 15 salles', reward: { coins: 500 } },
  { id: 'win', stat: 'wins', goal: 1, text: 'Gagner un chapitre', reward: { gems: 20 } },
  { id: 'elites', stat: 'elites', goal: 4, text: 'Vaincre 4 monstres d’élite', reward: { gems: 15 } },
  { id: 'boss', stat: 'bosses', goal: 1, text: 'Vaincre un boss', reward: { coins: 600 } },
  { id: 'upgrade', stat: 'upgrades', goal: 3, text: 'Améliorer un objet 3 fois', reward: { coins: 400 } },
  { id: 'chest', stat: 'chests', goal: 1, text: 'Ouvrir un coffre', reward: { gems: 10 } },
  { id: 'abilities', stat: 'abilities', goal: 15, text: 'Choisir 15 capacités', reward: { coins: 400 } },
  { id: 'runs', stat: 'runs', goal: 3, text: 'Jouer 3 parties', reward: { gems: 10 } },
  { id: 'endless', stat: 'endlessRooms', goal: 10, text: 'Nettoyer 10 salles en mode Infini', reward: { gems: 20 }, needs: 'endless' },
  { id: 'spells', stat: 'spells', goal: 20, text: 'Lancer 20 sorts', reward: { gems: 15 } },
  { id: 'loot', stat: 'loot', goal: 3, text: 'Trouver 3 objets en partie', reward: { coins: 600 } },
  { id: 'runes', stat: 'runes', goal: 5, text: 'Récolter 5 runes', reward: { gems: 15 } },
  { id: 'heroic', stat: 'heroicRooms', goal: 5, text: 'Nettoyer 5 salles en Héroïque', reward: { gems: 20 }, needs: 'heroic' },
  { id: 'daily', stat: 'dailyWins', goal: 1, text: 'Gagner le défi du jour', reward: { gems: 25 }, needs: 'daily' },
  { id: 'survival', stat: 'survivalSeconds', goal: 150, text: 'Tenir 2 min 30 en Survie', reward: { coins: 700 }, needs: 'survival' },
  { id: 'rush', stat: 'rushBosses', goal: 4, text: 'Vaincre 4 boss en Ruée des boss', reward: { gems: 20 }, needs: 'bossrush' },
  { id: 'curses', stat: 'curses', goal: 2, text: 'Accepter 2 malédictions dans la Tour', reward: { gems: 20 }, needs: 'tower' },
];

export const MISSIONS_PER_DAY = 3;
/** Bonus once the three missions of the day are claimed: a golden chest. */
export const DAILY_BONUS = { chest: 'gold' };

// ------------------------------------------------------------ achievements

/** Achievements with tiers: `goals[i]` unlocks `gems[i]`. */
export const ACHIEVEMENTS = [
  { id: 'slayer', icon: 'attack', name: 'Fléau des monstres', stat: 'kills', goals: [100, 1000, 5000, 20000], gems: [20, 50, 100, 200], text: (g) => `Vaincre ${g} monstres` },
  { id: 'explorer', icon: 'front', name: 'Explorateur', stat: 'rooms', goals: [25, 200, 1000, 3000], gems: [20, 50, 100, 200], text: (g) => `Nettoyer ${g} salles` },
  { id: 'conqueror', icon: 'crown', name: 'Conquérant', stat: 'chaptersWon', goals: [1, 3, 5, 8, 12, 18, 24, 30], gems: [30, 60, 100, 200, 300, 500, 700, 1000], text: (g) => `Gagner ${g} chapitre${g > 1 ? 's' : ''} différent${g > 1 ? 's' : ''}` },
  { id: 'bossHunter', icon: 'strength', name: 'Tueur de boss', stat: 'bosses', goals: [3, 20, 100], gems: [30, 60, 150], text: (g) => `Vaincre ${g} boss` },
  { id: 'eliteHunter', icon: 'elite', name: 'Chasseur d’élites', stat: 'elites', goals: [10, 100, 500], gems: [20, 50, 120], text: (g) => `Vaincre ${g} monstres d’élite` },
  { id: 'endless', icon: 'infinity', name: 'Sans fin', stat: 'endlessBest', goals: [10, 25, 50], gems: [30, 80, 200], text: (g) => `Atteindre la salle ${g} en mode Infini` },
  { id: 'heroic', icon: 'heroic', name: 'Héroïque', stat: 'heroicWon', goals: [1, 4, 8, 18, 30], gems: [50, 100, 250, 600, 1000], text: (g) => `Gagner ${g} chapitre${g > 1 ? 's' : ''} en Héroïque` },
  { id: 'streak', icon: 'calendar', name: 'Fidèle au poste', stat: 'dailyStreak', goals: [2, 5, 10, 30], gems: [30, 80, 160, 400], text: (g) => `Gagner le défi du jour ${g} jours de suite` },
  { id: 'survivor', icon: 'quake', name: 'Survivant', stat: 'survivalWins', goals: [1, 5, 20], gems: [40, 90, 200], text: (g) => `Tenir les 4 minutes de la Survie ${g} fois` },
  { id: 'rush', icon: 'skull', name: 'Ruée sanglante', stat: 'bossRushBest', goals: [5, 12, 20, 30], gems: [30, 70, 150, 300], text: (g) => `Vaincre ${g} boss d’affilée en Ruée des boss` },
  { id: 'tower', icon: 'crown', name: 'Grimpeur maudit', stat: 'towerBest', goals: [10, 20, 35, 50], gems: [30, 80, 160, 350], text: (g) => `Atteindre l’étage ${g} de la Tour maudite` },
  { id: 'collector', icon: 'trophy', name: 'Collectionneur', stat: 'legendaries', goals: [1, 3, 10], gems: [50, 100, 200], text: (g) => `Obtenir ${g} objet${g > 1 ? 's' : ''} légendaire${g > 1 ? 's' : ''}` },
  { id: 'smith', icon: 'upgrade', name: 'Forgeron', stat: 'upgrades', goals: [10, 100, 500], gems: [20, 50, 100], text: (g) => `Améliorer des objets ${g} fois` },
  { id: 'awakened', icon: 'star', name: 'Éveil', stat: 'awakenings', goals: [1, 5, 15], gems: [40, 80, 150], text: (g) => `Éveiller des objets ${g} fois` },
  { id: 'veteran', icon: 'level', name: 'Vétéran', stat: 'level', goals: [5, 15, 30, 50], gems: [20, 50, 100, 200], text: (g) => `Atteindre le niveau de compte ${g}` },
  { id: 'arcanist', icon: 'spells', name: 'Arcaniste', stat: 'spells', goals: [50, 500, 3000], gems: [20, 60, 150], text: (g) => `Lancer ${g} sorts` },
  { id: 'looter', icon: 'loot', name: 'Pilleur', stat: 'loot', goals: [5, 50, 250], gems: [20, 60, 150], text: (g) => `Trouver ${g} objets en partie` },
  { id: 'mentor', icon: 'classes', name: 'Mentor', stat: 'heroLevel', goals: [5, 12, 25, 50], gems: [20, 50, 120, 300], text: (g) => `Amener un héros au niveau ${g}` },
  { id: 'company', icon: 'heroes', name: 'Compagnie', stat: 'heroes', goals: [3, 5], gems: [30, 60], text: (g) => `Recruter ${g} héros` },
];

// ------------------------------------------------------------ modes

/** Heroic: the same chapters, much harder, with more elites and better loot. */
export const HEROIC = { health: 3, damage: 1.6, elites: 0.2, gems: 2, xp: 1.5 };

/**
 * Endless: rooms follow each other with no end; a boss every 5 rooms, an angel after
 * each boss, the landscape changes after each boss. Opens after the first chapter.
 */
export const ENDLESS = {
  bossEvery: 5,
  health: (roomIndex) => 1.3 * 1.11 ** roomIndex,
  // Monster damage grows a little faster than in the chapters (health ** 0.62).
  damage: 0.62,
  elites: (roomIndex) => Math.min(0.3, 0.05 + roomIndex * 0.006),
  bosses: ['ogre', 'skeletonKing', 'count', 'crystal', 'yeti', 'tyrant', 'demonLord', 'shadowMaster', 'sandKing', 'kitsune', 'brigand', 'leviathan', 'skyDragon', 'warlord', 'stormKnight', 'voidEye', 'pharaoh', 'archon',
    'tideLord', 'elderShroom', 'puglinChief', 'frostWyrm', 'jadeBlade', 'lich', 'magmaColossus', 'sporeQueen', 'beastKing', 'fairyQueen', 'starWyrm', 'aetherLord'],
  // Monsters by how early they can appear.
  pool: [['zombie', 0], ['skeleton', 0], ['wisp', 1], ['orc', 2], ['ghost', 3], ['blob', 4], ['keeper', 6], ['vampire', 7], ['bomber', 8]],
  gemsPerBoss: 5,
};

/** Normal chapters: monsters become elite from the second chapter on. */
export function eliteChance(chapterIndex) {
  return chapterIndex >= 1 ? Math.min(0.1, 0.04 + chapterIndex * 0.01) : 0;
}

/** Special rooms: a treasure room or a challenge room, now and then. */
export const SPECIAL_ROOMS = { treasure: 0.12, challenge: 0.1 };
