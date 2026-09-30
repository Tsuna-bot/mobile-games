// Hero growth: every hero levels up on their own (experience from their runs), learns
// three spells along the way (cast with the buttons during a run), raises their ranks
// with gold and runes, and picks a class once experienced enough.

export const MAX_HERO_LEVEL = 50;
/** Hero level at which each of the three spells is learnt. */
export const SPELL_UNLOCK = [1, 4, 8];
/** Hero level at which a class can be chosen. */
export const CLASS_LEVEL = 12;
export const MAX_SPELL_RANK = 5;
/** Gems to switch class once chosen. */
export const CLASS_SWITCH_GEMS = 50;

/** Hero experience to go from `level` to `level + 1`. */
export function heroXpNeeded(level) {
  return Math.round(150 * 1.13 ** (level - 1));
}

/** What each hero level gives (on top of the hero's own passive). */
export function heroLevelStats(level) {
  const n = Math.max(0, level - 1);
  return { damageMul: n * 0.02, hpMul: n * 0.02 };
}

/** Rank `rank` → `rank + 1`: gold and runes, and the hero level needed. */
export function spellUpgradeCost(slot, rank) {
  return {
    coins: [0, 400, 1100, 2600, 5200][rank] ?? Infinity,
    runes: [0, 3, 7, 12, 20][rank] ?? Infinity,
    level: SPELL_UNLOCK[slot] + rank * 3,
  };
}

/** Power and cooldown multipliers of a spell rank (rank 1 = base). */
export function rankPower(rank) {
  return 1 + (rank - 1) * 0.3;
}
export function rankCooldown(rank) {
  return 1 - (rank - 1) * 0.06;
}

/**
 * Spells. `type` picks the effect in the simulation; `cd` = seconds between casts;
 * `damage` = share of the hero's attack (× rank power). `text(rank)` describes it.
 */
export const SPELLS = {
  // Aren, archer
  arrowRain: {
    id: 'arrowRain', name: 'Pluie de flèches', icon: 'rain', color: '#ffd070', type: 'rain', cd: 9,
    params: { count: 5, radius: 1.3, damage: 3.2, delay: 0.55 },
    text: (r) => `Des flèches s’abattent sur ${5 + Math.floor((r - 1) / 2)} ennemis : ${pct(3.2 * rankPower(r))} de l’attaque autour de chacun.`,
  },
  piercingShot: {
    id: 'piercingShot', name: 'Flèche du vent', icon: 'gale', color: '#8ff0ff', type: 'pierce', cd: 7,
    params: { damage: 6, width: 0.55 },
    text: (r) => `Une énorme flèche qui traverse tout sur sa ligne : ${pct(6 * rankPower(r))} de l’attaque.`,
  },
  hawkEye: {
    id: 'hawkEye', name: 'Œil du faucon', icon: 'hawk', color: '#ffb050', type: 'buff', cd: 16,
    params: { duration: 6, rateMul: 1.6, crit: 0.25 },
    text: (r) => `Pendant ${6 + r - 1} s : cadence +${Math.round(60 * rankPower(r))} %, critique +25 %.`,
  },
  // Kaze, assassin
  shadowStep: {
    id: 'shadowStep', name: 'Pas de l’ombre', icon: 'dash', color: '#b890ff', type: 'dash', cd: 5,
    params: { distance: 3.4, damage: 2.4, invulnerable: 0.6 },
    text: (r) => `Bond éclair dans la direction du joystick, intouchable : ${pct(2.4 * rankPower(r))} de l’attaque aux ennemis traversés.`,
  },
  shadowStrike: {
    id: 'shadowStrike', name: 'Frappe de l’ombre', icon: 'shadowgarb', color: '#b070ff', type: 'shadow', cd: 8,
    params: { chain: 3, execute: 0.25, damage: 4 },
    text: (r) => `Kaze disparaît et frappe dans le dos jusqu’à ${3 + Math.floor((r - 1) / 2)} ennemis : achève ceux sous ${Math.round((0.25 + 0.03 * (r - 1)) * 100)} % de vie, ${pct(4 * rankPower(r))} de l’attaque aux autres. Intouchable pendant le saut.`,
  },
  deathMark: {
    id: 'deathMark', name: 'Marque mortelle', icon: 'skull', color: '#ff6a9a', type: 'execute', cd: 14,
    params: { damage: 9 },
    text: (r) => `Frappe l’ennemi le plus robuste : ${pct(9 * rankPower(r))} de l’attaque, toujours critique.`,
  },
  // Kael, ranger
  fanVolley: {
    id: 'fanVolley', name: 'Salve circulaire', icon: 'fan', color: '#a0ff8a', type: 'fan', cd: 7,
    params: { count: 14, damage: 1.2 },
    text: (r) => `${14 + (r - 1) * 2} flèches tout autour de toi, ${pct(1.2 * rankPower(r))} de l’attaque chacune.`,
  },
  thorns: {
    id: 'thorns', name: 'Ronces', icon: 'thorns', color: '#7ae05a', type: 'rain', cd: 10,
    params: { count: 3, radius: 1.7, damage: 2.2, delay: 0.35, slow: true, poison: true },
    text: (r) => `Des ronces jaillissent sous 3 ennemis : ${pct(2.2 * rankPower(r))} de l’attaque, ralentit et empoisonne.`,
  },
  wildInstinct: {
    id: 'wildInstinct', name: 'Instinct sauvage', icon: 'paw', color: '#ffe070', type: 'buff', cd: 18,
    params: { duration: 7, damageMul: 1.4, speedMul: 1.3 },
    text: (r) => `Pendant ${7 + r - 1} s : dégâts +${Math.round(40 * rankPower(r))} %, vitesse +30 %.`,
  },
  // Ilian, mage
  frostNova: {
    id: 'frostNova', name: 'Nova de givre', icon: 'snowflake', color: '#8fe0ff', type: 'nova', cd: 10,
    params: { radius: 3, damage: 2.5, freeze: 1.6 },
    text: (r) => `Une onde glacée : ${pct(2.5 * rankPower(r))} de l’attaque et gèle les ennemis proches ${(1.6 + (r - 1) * 0.2).toFixed(1)} s.`,
  },
  meteor: {
    id: 'meteor', name: 'Météore', icon: 'meteor', color: '#ff8a3a', type: 'rain', cd: 12,
    params: { count: 1, radius: 2.4, damage: 9, delay: 0.8, burn: true, big: true },
    text: (r) => `Un météore s’écrase sur l’ennemi le plus proche : ${pct(9 * rankPower(r))} de l’attaque autour, et brûle.`,
  },
  chainLightning: {
    id: 'chainLightning', name: 'Chaîne d’éclairs', icon: 'bolt', color: '#c9a0ff', type: 'chain', cd: 8,
    params: { jumps: 6, damage: 3 },
    text: (r) => `La foudre saute sur ${6 + (r - 1)} ennemis : ${pct(3 * rankPower(r))} de l’attaque à chacun.`,
  },
  // Bran, knight
  quake: {
    id: 'quake', name: 'Frappe sismique', icon: 'quake', color: '#ffc070', type: 'nova', cd: 9,
    params: { radius: 2.8, damage: 3, stun: 1.1, push: 1.4 },
    text: (r) => `Frappe le sol : ${pct(3 * rankPower(r))} de l’attaque, repousse et étourdit.`,
  },
  holyBulwark: {
    id: 'holyBulwark', name: 'Rempart sacré', icon: 'shield', color: '#fff0a0', type: 'guard', cd: 18,
    params: { heal: 0.2, invulnerable: 2.5 },
    text: (r) => `Intouchable ${(2.5 + (r - 1) * 0.3).toFixed(1)} s et rend ${Math.round(20 * rankPower(r))} % de ta vie.`,
  },
  lionCharge: {
    id: 'lionCharge', name: 'Charge du lion', icon: 'charge', color: '#ff7a5a', type: 'dash', cd: 7,
    params: { distance: 4.2, damage: 3.6, invulnerable: 0.5, stun: 0.8 },
    text: (r) => `Charge dans la direction du joystick : ${pct(3.6 * rankPower(r))} de l’attaque et étourdit.`,
  },
};

/** Class spells: the fourth button, learnt with the class, ranked with the class. */
export const CLASS_SPELLS = {
  deadlyShot: {
    id: 'deadlyShot', name: 'Tir fatal', icon: 'crit', color: '#ffe070', type: 'pierce', cd: 11,
    params: { damage: 11, width: 0.7 },
    text: (r) => `Une flèche dorée qui traverse tout : ${pct(11 * rankPower(r))} de l’attaque.`,
  },
  deluge: {
    id: 'deluge', name: 'Déluge', icon: 'rain', color: '#8fd8ff', type: 'rain', cd: 13,
    params: { count: 9, radius: 1.1, damage: 2.4, delay: 0.5, spread: true },
    text: (r) => `Une averse de flèches sur 9 ennemis (même un seul, plusieurs fois) : ${pct(2.4 * rankPower(r))} de l’attaque par impact.`,
  },
  kunaiFan: {
    id: 'kunaiFan', name: 'Éventail de kunaïs', icon: 'fan', color: '#c8a0ff', type: 'fan', cd: 6,
    params: { count: 16, damage: 1.4, kunai: true },
    text: (r) => `${16 + (r - 1) * 2} kunaïs tout autour de toi, ${pct(1.4 * rankPower(r))} de l’attaque chacun.`,
  },
  reaperScythe: {
    id: 'reaperScythe', name: 'Faux du bourreau', icon: 'skull', color: '#ff5a8a', type: 'nova', cd: 11,
    params: { radius: 2.9, damage: 4.5, stun: 0.6 },
    text: (r) => `Un grand arc de faux autour de toi : ${pct(4.5 * rankPower(r))} de l’attaque, étourdit.`,
  },
  seekers: {
    id: 'seekers', name: 'Flèches chercheuses', icon: 'hawk', color: '#b8ff8a', type: 'fan', cd: 8,
    params: { count: 10, damage: 1.8, homing: 6 },
    text: (r) => `${10 + (r - 1) * 2} flèches qui poursuivent les ennemis, ${pct(1.8 * rankPower(r))} de l’attaque chacune.`,
  },
  grove: {
    id: 'grove', name: 'Sève sacrée', icon: 'heal', color: '#7ae05a', type: 'guard', cd: 20,
    params: { heal: 0.3, invulnerable: 1.5 },
    text: (r) => `Rend ${Math.round(30 * rankPower(r))} % de ta vie, intouchable ${(1.5 + (r - 1) * 0.3).toFixed(1)} s.`,
  },
  fireRain: {
    id: 'fireRain', name: 'Pluie de feu', icon: 'meteor', color: '#ff7a3a', type: 'rain', cd: 12,
    params: { count: 5, radius: 1.5, damage: 3.2, delay: 0.6, burn: true },
    text: (r) => `Des boules de feu sur 5 ennemis : ${pct(3.2 * rankPower(r))} de l’attaque et brûlure.`,
  },
  blizzard: {
    id: 'blizzard', name: 'Blizzard', icon: 'snowflake', color: '#bfefff', type: 'rain', cd: 12,
    params: { count: 7, radius: 1.6, damage: 1.8, delay: 0.4, slow: true, freeze: 1.2 },
    text: (r) => `Une tempête de neige sur 7 ennemis : ${pct(1.8 * rankPower(r))} de l’attaque, ralentit et gèle.`,
  },
  judgement: {
    id: 'judgement', name: 'Jugement', icon: 'crown', color: '#fff0a0', type: 'nova', cd: 13,
    params: { radius: 3.4, damage: 3.5, stun: 1.4 },
    text: (r) => `La lumière frappe autour de toi : ${pct(3.5 * rankPower(r))} de l’attaque, étourdit longtemps.`,
  },
  whirlwind: {
    id: 'whirlwind', name: 'Tourbillon', icon: 'storm', color: '#ff8a5a', type: 'nova', cd: 8,
    params: { radius: 2.5, damage: 4.2, push: 1.2 },
    text: (r) => `Bran tournoie avec sa lame : ${pct(4.2 * rankPower(r))} de l’attaque, repousse.`,
  },
};
Object.assign(SPELLS, CLASS_SPELLS);

/** Class ranks: 1 when chosen, up to 5. Stats and the class spell grow with the rank. */
export const MAX_CLASS_RANK = 5;
export function classUpgradeCost(rank) {
  return {
    coins: [0, 1500, 3500, 7000, 12000][rank] ?? Infinity,
    runes: [0, 8, 15, 25, 40][rank] ?? Infinity,
    level: CLASS_LEVEL + rank * 4,
  };
}
/** Multiplier of the class stats at `rank`. */
export function classRankScale(rank) {
  return 1 + (rank - 1) * 0.25;
}

/**
 * The equipment and pets each hero handles best. Every item suits at least one hero;
 * each recommended piece worn gives a bonus that depends on its slot (see below).
 */
export const RECOMMENDED = {
  archer: ['bow', 'longbow', 'leather', 'falcon', 'wolf', 'rage', 'owl'],
  assassin: ['shuriken', 'blades', 'shadowgarb', 'serpent', 'wolf', 'fang', 'bat'],
  ranger: ['crossbow', 'longbow', 'leather', 'serpent', 'falcon', 'fortune', 'owl'],
  mage: ['staff', 'tome', 'robe', 'falcon', 'bear', 'fortune', 'frostling', 'salamander'],
  knight: ['crossbow', 'bow', 'mail', 'bear', 'life', 'rage', 'salamander'],
};
/** Weapon bonus (kept for the texts). */
export const RECOMMENDED_BONUS = 0.12;
/** Bonus of a recommended piece, by slot kind (pets: their power ×). */
export const RECOMMENDED_BONUSES = {
  weapon: { stats: { damageMul: 0.12 }, text: '+12 % d’attaque' },
  armor: { stats: { hpMul: 0.1 }, text: '+10 % de vie' },
  ring: { stats: { damageMul: 0.05 }, text: '+5 % d’attaque' },
  amulet: { stats: { damageMul: 0.04, hpMul: 0.04 }, text: '+4 % d’attaque et de vie' },
  pet: { power: 1.25, text: '+25 % de puissance du familier' },
};

/** Whether `base` (item or pet) suits `heroId`. */
export function isRecommended(heroId, base) {
  return Boolean(RECOMMENDED[heroId]?.includes(base));
}

function pct(v) {
  return `${Math.round(v * 100)} %`;
}

/** Each hero's three spells, in unlock order. */
export const HERO_SPELLS = {
  archer: ['arrowRain', 'piercingShot', 'hawkEye'],
  assassin: ['shadowStep', 'shadowStrike', 'deathMark'],
  ranger: ['fanVolley', 'thorns', 'wildInstinct'],
  mage: ['frostNova', 'meteor', 'chainLightning'],
  knight: ['quake', 'holyBulwark', 'lionCharge'],
};

/**
 * Classes: two per hero, chosen at CLASS_LEVEL. Stats in the Run gear format, and one
 * spell made stronger (`spell`: its power × `power`, cooldown × `cd`).
 */
export const CLASSES = {
  archer: [
    { id: 'sniper', classSpell: 'deadlyShot', name: 'Tireur d’élite', icon: 'crit', text: 'Critique +10 %, dégâts critiques +50 %. Flèche du vent +50 %.', stats: { crit: 0.1, critDamage: 0.5 }, spell: 'piercingShot', power: 1.5, cd: 1 },
    { id: 'volleyer', classSpell: 'deluge', name: 'Maître des volées', icon: 'multishot', text: '+1 flèche frontale. Pluie de flèches +40 % et plus fréquente.', stats: { front: 1 }, spell: 'arrowRain', power: 1.4, cd: 0.8 },
  ],
  assassin: [
    { id: 'phantom', classSpell: 'kunaiFan', name: 'Lame fantôme', icon: 'dodge', text: 'Esquive +8 %, vitesse +8 %. Pas de l’ombre deux fois plus souvent.', stats: { dodge: 0.08, speedMul: 0.08 }, spell: 'shadowStep', power: 1.2, cd: 0.5 },
    { id: 'reaper', classSpell: 'reaperScythe', name: 'Bourreau', icon: 'skull', text: 'Dégâts aux boss +25 %, attaque +10 %. Marque mortelle +50 %.', stats: { bossDamage: 0.25, damageMul: 0.1 }, spell: 'deathMark', power: 1.5, cd: 1 },
  ],
  ranger: [
    { id: 'tracker', classSpell: 'seekers', name: 'Traqueur', icon: 'swift', text: 'Vitesse +10 %, esquive +5 %, cadence +8 %. Salve circulaire +40 %.', stats: { speedMul: 0.1, dodge: 0.05, rateMul: 0.08 }, spell: 'fanVolley', power: 1.4, cd: 0.85 },
    { id: 'druid', classSpell: 'grove', name: 'Druide', icon: 'poison', text: 'Tes flèches empoisonnent. Ronces +50 %.', stats: { poison: 1 }, spell: 'thorns', power: 1.5, cd: 0.85 },
  ],
  mage: [
    { id: 'pyromancer', classSpell: 'fireRain', name: 'Pyromancien', icon: 'fire', text: 'Tes coups enflamment. Météore +50 %.', stats: { burn: 1 }, spell: 'meteor', power: 1.5, cd: 0.85 },
    { id: 'cryomancer', classSpell: 'blizzard', name: 'Cryomancien', icon: 'ice', text: 'Tes coups ralentissent. Nova de givre +40 %, plus fréquente.', stats: { frost: 1 }, spell: 'frostNova', power: 1.4, cd: 0.75 },
  ],
  knight: [
    { id: 'paladin', classSpell: 'judgement', name: 'Paladin', icon: 'heal', text: 'Vie +20 %, soin par salle +3 %. Rempart sacré plus fréquent.', stats: { hpMul: 0.2, healOnRoom: 0.03 }, spell: 'holyBulwark', power: 1.3, cd: 0.7 },
    { id: 'berserker', classSpell: 'whirlwind', name: 'Berserker', icon: 'rage', text: 'Attaque +12 %, +35 % sous 40 % de vie. Charge du lion +50 %.', stats: { damageMul: 0.12, fury: 0.35 }, spell: 'lionCharge', power: 1.5, cd: 1 },
  ],
};

export function classOf(heroId, classId) {
  return CLASSES[heroId]?.find((c) => c.id === classId) ?? null;
}
