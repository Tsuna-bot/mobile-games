// Equipment: weapon, armour, two rings, an amulet, and a pet. Items have a rarity
// (the level cap and the stat multiplier) and a level (raised with gold).
// Three identical items of the same rarity merge into the next rarity. Items belong to
// sets (bonuses at 2 and 4 pieces), legendary ones carry a power, and epic or legendary
// items at their maximum level can be awakened (up to 3 stars).

export const RARITIES = [
  { id: 'common', name: 'Commun', color: '#b9c3cf', mul: 1, cap: 10 },
  { id: 'rare', name: 'Rare', color: '#4fb4ff', mul: 1.5, cap: 20 },
  { id: 'epic', name: 'Épique', color: '#c070ff', mul: 2.2, cap: 30 },
  { id: 'legendary', name: 'Légendaire', color: '#ffc93c', mul: 3.2, cap: 40 },
];

export const SLOTS = [
  { id: 'weapon', name: 'Arme', icon: 'slot-weapon' },
  { id: 'armor', name: 'Armure', icon: 'slot-armor' },
  { id: 'ring1', name: 'Anneau', icon: 'slot-ring', kind: 'ring' },
  { id: 'ring2', name: 'Anneau', icon: 'slot-ring', kind: 'ring' },
  { id: 'amulet', name: 'Amulette', icon: 'slot-amulet' },
  { id: 'pet', name: 'Familier', icon: 'slot-pet' },
];

/**
 * Item bases. `stats(k)` = what the item gives, k = rarity multiplier × level growth.
 * Stat keys match Run gear: damage (flat), hp (flat), rateMul, crit, critDamage, dodge,
 * armor, speedMul, bossDamage, healOnRoom, burn, frost, poison, bolt, coinMul.
 */
export const BASES = {
  // Weapons change how you shoot.
  bow: { id: 'bow', slot: 'weapon', name: 'Arc de chasse', icon: 'bow', text: 'Équilibré.', weapon: 'bow', stats: (k) => ({ damage: 20 * k }) },
  crossbow: { id: 'crossbow', slot: 'weapon', name: 'Arbalète', icon: 'crossbow', text: 'Plus lente, carreaux puissants et rapides qui traversent un ennemi.', weapon: 'crossbow', stats: (k) => ({ damage: 34 * k }) },
  staff: { id: 'staff', slot: 'weapon', name: 'Bâton arcanique', icon: 'staff', text: 'Orbes magiques qui suivent leur cible.', weapon: 'staff', stats: (k) => ({ damage: 22 * k }) },
  blades: { id: 'blades', slot: 'weapon', name: 'Lames tournoyantes', icon: 'blades', text: 'Tir très rapide, les lames rebondissent une fois.', weapon: 'blades', stats: (k) => ({ damage: 13 * k }) },
  longbow: { id: 'longbow', slot: 'weapon', name: 'Arc long', icon: 'longbow', text: 'Lent, mais ses flèches traversent tous les ennemis.', weapon: 'longbow', stats: (k) => ({ damage: 30 * k }) },
  shuriken: { id: 'shuriken', slot: 'weapon', name: 'Shurikens', icon: 'shuriken', text: 'Étoiles qui reviennent vers toi : chaque ennemi peut être touché deux fois.', weapon: 'shuriken', stats: (k) => ({ damage: 19 * k }) },
  tome: { id: 'tome', slot: 'weapon', name: 'Grimoire de foudre', icon: 'tome', text: 'Orbes lents qui suivent leur cible ; chaque coup lance un éclair en chaîne.', weapon: 'tome', stats: (k) => ({ damage: 18 * k }) },

  // Armours.
  leather: { id: 'leather', slot: 'armor', name: 'Tunique de cuir', icon: 'leather', text: 'Vie et un peu d’esquive.', stats: (k) => ({ hp: 110 * k, dodge: 0.02 + 0.01 * k }) },
  mail: { id: 'mail', slot: 'armor', name: 'Cotte de mailles', icon: 'mail', text: 'Beaucoup de vie, réduit les dégâts.', stats: (k) => ({ hp: 150 * k, armor: 0.03 + 0.012 * k }) },
  robe: { id: 'robe', slot: 'armor', name: 'Robe enchantée', icon: 'robe', text: 'Vie et dégâts contre les boss.', stats: (k) => ({ hp: 90 * k, bossDamage: 0.05 + 0.03 * k }) },
  shadowgarb: { id: 'shadowgarb', slot: 'armor', name: 'Tenue de l’ombre', icon: 'shadowgarb', text: 'Vie, esquive et vitesse.', stats: (k) => ({ hp: 80 * k, dodge: 0.03 + 0.008 * k, speedMul: 0.02 + 0.008 * k }) },

  // Rings.
  wolf: { id: 'wolf', slot: 'ring', name: 'Anneau du loup', icon: 'wolf', text: 'Coups critiques.', stats: (k) => ({ crit: 0.02 + 0.012 * k, critDamage: 0.1 * k }) },
  bear: { id: 'bear', slot: 'ring', name: 'Anneau de l’ours', icon: 'bear', text: 'Vie.', stats: (k) => ({ hp: 70 * k }) },
  serpent: { id: 'serpent', slot: 'ring', name: 'Anneau du serpent', icon: 'serpent', text: 'Esquive et vitesse.', stats: (k) => ({ dodge: 0.02 + 0.008 * k, speedMul: 0.02 + 0.01 * k }) },
  falcon: { id: 'falcon', slot: 'ring', name: 'Anneau du faucon', icon: 'falcon', text: 'Cadence de tir.', stats: (k) => ({ rateMul: 0.04 + 0.025 * k }) },

  // Amulets.
  life: { id: 'life', slot: 'amulet', name: 'Amulette de vie', icon: 'life', text: 'Soigne en entrant dans chaque salle.', stats: (k) => ({ hp: 40 * k, healOnRoom: 0.03 + 0.012 * k }) },
  rage: { id: 'rage', slot: 'amulet', name: 'Amulette de rage', icon: 'rage', text: 'Attaque.', stats: (k) => ({ damage: 12 * k }) },
  fortune: { id: 'fortune', slot: 'amulet', name: 'Amulette de fortune', icon: 'fortune', text: 'Plus d’or ramassé.', stats: (k) => ({ coinMul: 0.1 + 0.08 * k, hp: 25 * k }) },
  fang: { id: 'fang', slot: 'amulet', name: 'Croc de l’ombre', icon: 'fang', text: 'Dégâts critiques.', stats: (k) => ({ critDamage: 0.08 + 0.1 * k, damage: 5 * k }) },
};

/**
 * Sets: the distinct pieces of a set that are equipped (weapon, armour, ring, amulet)
 * give a bonus at 2 and another at 4.
 */
export const SETS = {
  hunter: {
    id: 'hunter', name: 'Chasseur', color: '#8ad86a', pieces: ['bow', 'longbow', 'leather', 'falcon', 'rage'],
    bonuses: [[2, 'Cadence +8 %', { rateMul: 0.08 }], [4, '+1 flèche frontale', { front: 1 }]],
  },
  bulwark: {
    id: 'bulwark', name: 'Rempart', color: '#7ab4ff', pieces: ['crossbow', 'mail', 'bear', 'life'],
    bonuses: [[2, 'Vie +12 %', { hpMul: 0.12 }], [4, 'Bouclier divin : bloque un coup toutes les 8 s', { shield: 8 }]],
  },
  arcane: {
    id: 'arcane', name: 'Arcane', color: '#c490ff', pieces: ['staff', 'tome', 'robe', 'serpent', 'fortune'],
    bonuses: [[2, 'Attaque +10 %', { damageMul: 0.1 }], [4, 'Un orbe de foudre tourne autour de toi', { orbs: ['bolt'] }]],
  },
  shadow: {
    id: 'shadow', name: 'Ombre', color: '#ff7aa8', pieces: ['blades', 'shuriken', 'shadowgarb', 'wolf', 'fang'],
    bonuses: [[2, 'Critique +6 %', { crit: 0.06 }], [4, 'Les monstres vaincus explosent', { deathBlast: 1 }]],
  },
};

export function setOf(base) {
  return Object.values(SETS).find((set) => set.pieces.includes(base)) ?? null;
}

/** Legendary items carry a unique power (on top of their stats). */
export const LEGENDARY = {
  bow: { name: 'Volée', text: 'Tire une deuxième volée juste après la première.', stats: { multishot: 1 } },
  longbow: { name: 'Perce-ciel', text: 'Dégâts aux boss +35 %.', stats: { bossDamage: 0.35 } },
  crossbow: { name: 'Carreaux explosifs', text: 'Les carreaux explosent à l’impact.', stats: { explosive: 1 } },
  staff: { name: 'Orbes jumeaux', text: 'Deux orbes de plus, en diagonale.', stats: { diagonal: 1 } },
  tome: { name: 'Tempête', text: 'Chaque coup électrise aussi 2 ennemis de plus.', stats: { bolt: 1 } },
  blades: { name: 'Lames fantômes', text: 'Les lames sautent vers un ennemi de plus.', stats: { ricochet: 1 } },
  shuriken: { name: 'Tourbillon', text: 'Les shurikens traversent les ennemis.', stats: { pierce: 1 } },
  leather: { name: 'Pas du vent', text: 'Vitesse +10 %, esquive +5 %.', stats: { speedMul: 0.1, dodge: 0.05 } },
  mail: { name: 'Bastion', text: 'Dégâts subis −10 %.', stats: { armor: 0.1 } },
  robe: { name: 'Sagesse', text: 'Expérience +25 % : plus de capacités par partie.', stats: { xpMul: 0.25 } },
  shadowgarb: { name: 'Voile d’ombre', text: 'Après un coup reçu, intouchable 1 s de plus.', stats: { veil: 1 } },
  wolf: { name: 'Instinct', text: 'Dégâts critiques +40 %.', stats: { critDamage: 0.4 } },
  bear: { name: 'Cœur d’ours', text: 'Vie +15 %.', stats: { hpMul: 0.15 } },
  serpent: { name: 'Venin', text: 'Tes coups empoisonnent.', stats: { poison: 1 } },
  falcon: { name: 'Serres', text: 'Une flèche en diagonale de chaque côté.', stats: { diagonal: 1 } },
  life: { name: 'Renouveau', text: 'Rend 30 % de ta vie en entrant chez le boss.', stats: { bossHeal: 0.3 } },
  rage: { name: 'Furie', text: 'Attaque +35 % quand ta vie est sous 40 %.', stats: { fury: 0.35 } },
  fortune: { name: 'Trésor', text: 'Or +40 % et 5 gemmes de plus par victoire.', stats: { coinMul: 0.4, gemBonus: 5 } },
  fang: { name: 'Morsure', text: 'Chaque monstre vaincu rend 2 % de vie.', stats: { lifeOnKill: 0.02 } },
};

/** Awakening: epic or legendary items at their maximum level gain stars (+15 % stats each). */
export const MAX_STARS = 3;

export function canAwaken(item) {
  return item.rarity >= 2 && item.level >= RARITIES[item.rarity].cap && (item.stars ?? 0) < MAX_STARS;
}

export function awakenCost(item) {
  const n = (item.stars ?? 0) + 1;
  return { gems: 40 * n, coins: 1500 * n };
}

export const BASE_IDS = Object.keys(BASES);

/** Growth per level (1 → cap), and per awakening star. */
export function itemK(rarityIndex, level, stars = 0) {
  return RARITIES[rarityIndex].mul * (1 + 0.08 * (level - 1)) * (1 + 0.15 * stars);
}

export function itemStats(item) {
  return BASES[item.base].stats(itemK(item.rarity, item.level, item.stars ?? 0));
}

/** Gold to go from `level` to `level + 1`. */
export function upgradeCost(item) {
  return Math.round(35 * 1.17 ** (item.level - 1) * (1 + item.rarity * 0.6));
}

/** Readable stat lines. */
export function statLines(stats) {
  const pct = (v) => `${Math.round(v * 100)} %`;
  const lines = [];
  if (stats.damage) lines.push(`Attaque +${Math.round(stats.damage)}`);
  if (stats.hp) lines.push(`Vie +${Math.round(stats.hp)}`);
  if (stats.rateMul) lines.push(`Cadence +${pct(stats.rateMul)}`);
  if (stats.crit) lines.push(`Critique +${pct(stats.crit)}`);
  if (stats.critDamage) lines.push(`Dégâts critiques +${pct(stats.critDamage)}`);
  if (stats.dodge) lines.push(`Esquive +${pct(stats.dodge)}`);
  if (stats.armor) lines.push(`Réduction des dégâts ${pct(stats.armor)}`);
  if (stats.speedMul) lines.push(`Vitesse +${pct(stats.speedMul)}`);
  if (stats.bossDamage) lines.push(`Dégâts aux boss +${pct(stats.bossDamage)}`);
  if (stats.healOnRoom) lines.push(`Soin par salle ${pct(stats.healOnRoom)}`);
  if (stats.coinMul) lines.push(`Or +${pct(stats.coinMul)}`);
  if (stats.lifeOnKill) lines.push(`Vie par monstre vaincu ${pct(stats.lifeOnKill)}`);
  return lines;
}
