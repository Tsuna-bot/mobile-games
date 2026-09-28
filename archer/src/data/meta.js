// Talents, pets, heroes and chests (the progression between runs).

/** Talents: gold buys a random level-up among them (like the original). */
export const TALENTS = [
  { id: 'strength', icon: '💪', name: 'Force', text: (n) => `Attaque +${n * 6}`, max: 20, stats: (n) => ({ damage: n * 6 }) },
  { id: 'vigor', icon: '❤️', name: 'Vigueur', text: (n) => `Vie +${n * 45}`, max: 20, stats: (n) => ({ hp: n * 45 }) },
  { id: 'agility', icon: '⚡', name: 'Agilité', text: (n) => `Cadence +${n * 2} %`, max: 15, stats: (n) => ({ rateMul: n * 0.02 }) },
  { id: 'recovery', icon: '🌿', name: 'Récupération', text: (n) => `Soin par salle +${n} %`, max: 10, stats: (n) => ({ healOnRoom: n * 0.01 }) },
  { id: 'guard', icon: '🛡️', name: 'Garde', text: (n) => `Dégâts subis −${n * 1.5} %`, max: 12, stats: (n) => ({ armor: n * 0.015 }) },
  { id: 'looting', icon: '🪙', name: 'Pillage', text: (n) => `Or +${n * 5} %`, max: 12, stats: (n) => ({ coinMul: n * 0.05 }) },
  { id: 'luck', icon: '🍀', name: 'Chance', text: (n) => `Critique +${n} %`, max: 12, stats: (n) => ({ crit: n * 0.01 }) },
  { id: 'swift', icon: '👟', name: 'Célérité', text: (n) => `Vitesse +${n * 2} %`, max: 8, stats: (n) => ({ speedMul: n * 0.02 }) },
];

/** Gold for the next talent roll (n = rolls already made). */
export function talentCost(n) {
  return Math.round(80 * 1.16 ** n);
}

/**
 * Pets fly next to the hero and shoot on their own. `rate` = seconds between shots,
 * `damage` = share of the hero's attack, `element` added to their hits.
 */
export const PETS = {
  bat: { id: 'bat', name: 'Chauve-souris', icon: '🦇', color: 0x9a7aff, text: 'Petits tirs très rapides.', rate: 0.55, damage: 0.18 },
  owl: { id: 'owl', name: 'Chouette', icon: '🦉', color: 0xffe08a, text: 'Tirs puissants et précis.', rate: 1.3, damage: 0.55 },
  frostling: { id: 'frostling', name: 'Esprit du givre', icon: '❄️', color: 0x8fe0ff, text: 'Ses tirs ralentissent.', rate: 0.9, damage: 0.28, element: 'ice' },
  salamander: { id: 'salamander', name: 'Salamandre', icon: '🦎', color: 0xff8a3a, text: 'Ses tirs enflamment.', rate: 0.9, damage: 0.28, element: 'fire' },
};

/** Pet damage multiplier at rarity/level (same growth as items). */
export function petPower(rarityMul, level) {
  return rarityMul * (1 + 0.08 * (level - 1));
}

/** Heroes: model, cape colour, passive, price in gems. */
export const HEROES = {
  archer: { id: 'archer', name: 'Lyra', role: 'Archère', model: 'characters/character-female-b', cape: 0x3fa9ff, price: 0, text: 'Équilibrée. Critique +5 %.', stats: { crit: 0.05 } },
  ranger: { id: 'ranger', name: 'Kael', role: 'Rôdeur', model: 'characters/character-male-c', cape: 0x5fe06a, price: 250, text: 'Vitesse +12 %, esquive +6 %.', stats: { speedMul: 0.12, dodge: 0.06 } },
  mage: { id: 'mage', name: 'Iris', role: 'Mage', model: 'characters/character-female-d', cape: 0xc070ff, price: 450, text: 'Flèches de foudre dès le départ.', stats: { bolt: 1 } },
  knight: { id: 'knight', name: 'Bran', role: 'Chevalier', model: 'characters/character-male-e', cape: 0xff5a4a, price: 700, text: 'Vie +30 %, dégâts subis −10 %.', stats: { hpMul: 0.3, armor: 0.1 } },
};

export const HERO_ORDER = ['archer', 'ranger', 'mage', 'knight'];

/** Chest odds by rarity index [common, rare, epic, legendary]. */
export const CHESTS = {
  free: { id: 'free', name: 'Coffre en bois', icon: '📦', odds: [0.8, 0.2, 0, 0], cooldownHours: 4 },
  gold: { id: 'gold', name: 'Coffre doré', icon: '🎁', odds: [0, 0.72, 0.24, 0.04], gems: 80 },
  hero: { id: 'hero', name: 'Coffre du familier', icon: '🥚', odds: [0.2, 0.55, 0.2, 0.05], gems: 120, pet: true },
};
