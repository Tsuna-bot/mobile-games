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
  bladeStorm: {
    id: 'bladeStorm', name: 'Tempête de lames', icon: 'storm', color: '#d890ff', type: 'nova', cd: 9,
    params: { radius: 2.6, damage: 3.5, poison: true },
    text: (r) => `Un tourbillon de lames autour de toi : ${pct(3.5 * rankPower(r))} de l’attaque et du poison.`,
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

function pct(v) {
  return `${Math.round(v * 100)} %`;
}

/** Each hero's three spells, in unlock order. */
export const HERO_SPELLS = {
  archer: ['arrowRain', 'piercingShot', 'hawkEye'],
  assassin: ['shadowStep', 'bladeStorm', 'deathMark'],
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
    { id: 'sniper', name: 'Tireur d’élite', icon: 'crit', text: 'Critique +10 %, dégâts critiques +50 %. Flèche du vent +50 %.', stats: { crit: 0.1, critDamage: 0.5 }, spell: 'piercingShot', power: 1.5, cd: 1 },
    { id: 'volleyer', name: 'Maître des volées', icon: 'multishot', text: '+1 flèche frontale. Pluie de flèches +40 % et plus fréquente.', stats: { front: 1 }, spell: 'arrowRain', power: 1.4, cd: 0.8 },
  ],
  assassin: [
    { id: 'phantom', name: 'Lame fantôme', icon: 'dodge', text: 'Esquive +8 %, vitesse +8 %. Pas de l’ombre deux fois plus souvent.', stats: { dodge: 0.08, speedMul: 0.08 }, spell: 'shadowStep', power: 1.2, cd: 0.5 },
    { id: 'reaper', name: 'Bourreau', icon: 'skull', text: 'Dégâts aux boss +25 %, attaque +10 %. Marque mortelle +50 %.', stats: { bossDamage: 0.25, damageMul: 0.1 }, spell: 'deathMark', power: 1.5, cd: 1 },
  ],
  ranger: [
    { id: 'tracker', name: 'Traqueur', icon: 'swift', text: 'Vitesse +10 %, esquive +5 %, cadence +8 %. Salve circulaire +40 %.', stats: { speedMul: 0.1, dodge: 0.05, rateMul: 0.08 }, spell: 'fanVolley', power: 1.4, cd: 0.85 },
    { id: 'druid', name: 'Druide', icon: 'poison', text: 'Tes flèches empoisonnent. Ronces +50 %.', stats: { poison: 1 }, spell: 'thorns', power: 1.5, cd: 0.85 },
  ],
  mage: [
    { id: 'pyromancer', name: 'Pyromancien', icon: 'fire', text: 'Tes coups enflamment. Météore +50 %.', stats: { burn: 1 }, spell: 'meteor', power: 1.5, cd: 0.85 },
    { id: 'cryomancer', name: 'Cryomancien', icon: 'ice', text: 'Tes coups ralentissent. Nova de givre +40 %, plus fréquente.', stats: { frost: 1 }, spell: 'frostNova', power: 1.4, cd: 0.75 },
  ],
  knight: [
    { id: 'paladin', name: 'Paladin', icon: 'heal', text: 'Vie +20 %, soin par salle +3 %. Rempart sacré plus fréquent.', stats: { hpMul: 0.2, healOnRoom: 0.03 }, spell: 'holyBulwark', power: 1.3, cd: 0.7 },
    { id: 'berserker', name: 'Berserker', icon: 'rage', text: 'Attaque +12 %, +35 % sous 40 % de vie. Charge du lion +50 %.', stats: { damageMul: 0.12, fury: 0.35 }, spell: 'lionCharge', power: 1.5, cd: 1 },
  ],
};

export function classOf(heroId, classId) {
  return CLASSES[heroId]?.find((c) => c.id === classId) ?? null;
}
