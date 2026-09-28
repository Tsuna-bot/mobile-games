// Equipment: weapon, armour, two rings, an amulet, and a pet. Items have a rarity
// (the level cap and the stat multiplier) and a level (raised with gold).
// Three identical items of the same rarity merge into the next rarity.

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

  // Armours.
  leather: { id: 'leather', slot: 'armor', name: 'Tunique de cuir', icon: 'leather', text: 'Vie et un peu d’esquive.', stats: (k) => ({ hp: 110 * k, dodge: 0.02 + 0.01 * k }) },
  mail: { id: 'mail', slot: 'armor', name: 'Cotte de mailles', icon: 'mail', text: 'Beaucoup de vie, réduit les dégâts.', stats: (k) => ({ hp: 150 * k, armor: 0.03 + 0.012 * k }) },
  robe: { id: 'robe', slot: 'armor', name: 'Robe enchantée', icon: 'robe', text: 'Vie et dégâts contre les boss.', stats: (k) => ({ hp: 90 * k, bossDamage: 0.05 + 0.03 * k }) },

  // Rings.
  wolf: { id: 'wolf', slot: 'ring', name: 'Anneau du loup', icon: 'wolf', text: 'Coups critiques.', stats: (k) => ({ crit: 0.02 + 0.012 * k, critDamage: 0.1 * k }) },
  bear: { id: 'bear', slot: 'ring', name: 'Anneau de l’ours', icon: 'bear', text: 'Vie.', stats: (k) => ({ hp: 70 * k }) },
  serpent: { id: 'serpent', slot: 'ring', name: 'Anneau du serpent', icon: 'serpent', text: 'Esquive et vitesse.', stats: (k) => ({ dodge: 0.02 + 0.008 * k, speedMul: 0.02 + 0.01 * k }) },
  falcon: { id: 'falcon', slot: 'ring', name: 'Anneau du faucon', icon: 'falcon', text: 'Cadence de tir.', stats: (k) => ({ rateMul: 0.04 + 0.025 * k }) },

  // Amulets.
  life: { id: 'life', slot: 'amulet', name: 'Amulette de vie', icon: 'life', text: 'Soigne en entrant dans chaque salle.', stats: (k) => ({ hp: 40 * k, healOnRoom: 0.03 + 0.012 * k }) },
  rage: { id: 'rage', slot: 'amulet', name: 'Amulette de rage', icon: 'rage', text: 'Attaque.', stats: (k) => ({ damage: 12 * k }) },
  fortune: { id: 'fortune', slot: 'amulet', name: 'Amulette de fortune', icon: 'fortune', text: 'Plus d’or ramassé.', stats: (k) => ({ coinMul: 0.1 + 0.08 * k, hp: 25 * k }) },
};

export const BASE_IDS = Object.keys(BASES);

/** Growth per level (1 → cap). */
export function itemK(rarityIndex, level) {
  return RARITIES[rarityIndex].mul * (1 + 0.08 * (level - 1));
}

export function itemStats(item) {
  return BASES[item.base].stats(itemK(item.rarity, item.level));
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
  return lines;
}
