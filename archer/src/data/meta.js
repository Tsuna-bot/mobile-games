// Talents, pets, heroes and chests (the progression between runs).

/** Talents: gold buys a random level-up among them (like the original). */
export const TALENTS = [
  { id: 'strength', icon: 'strength', name: 'Force', text: (n) => `Attaque +${n * 6}`, max: 20, stats: (n) => ({ damage: n * 6 }) },
  { id: 'vigor', icon: 'vigor', name: 'Vigueur', text: (n) => `Vie +${n * 45}`, max: 20, stats: (n) => ({ hp: n * 45 }) },
  { id: 'agility', icon: 'agility', name: 'Agilité', text: (n) => `Cadence +${n * 2} %`, max: 15, stats: (n) => ({ rateMul: n * 0.02 }) },
  { id: 'recovery', icon: 'recovery', name: 'Récupération', text: (n) => `Soin par salle +${n} %`, max: 10, stats: (n) => ({ healOnRoom: n * 0.01 }) },
  { id: 'guard', icon: 'guard', name: 'Garde', text: (n) => `Dégâts subis −${n * 1.5} %`, max: 12, stats: (n) => ({ armor: n * 0.015 }) },
  { id: 'looting', icon: 'looting', name: 'Pillage', text: (n) => `Or +${n * 5} %`, max: 12, stats: (n) => ({ coinMul: n * 0.05 }) },
  { id: 'luck', icon: 'luck', name: 'Chance', text: (n) => `Critique +${n} %`, max: 12, stats: (n) => ({ crit: n * 0.01 }) },
  { id: 'swift', icon: 'swift', name: 'Célérité', text: (n) => `Vitesse +${n * 2} %`, max: 8, stats: (n) => ({ speedMul: n * 0.02 }) },
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
  bat: { id: 'bat', name: 'Chauve-souris', icon: 'bat', color: 0x9a7aff, text: 'Petits tirs très rapides.', rate: 0.55, damage: 0.18 },
  owl: { id: 'owl', name: 'Chouette', icon: 'owl', color: 0xffe08a, text: 'Tirs puissants et précis.', rate: 1.3, damage: 0.55 },
  frostling: { id: 'frostling', name: 'Esprit du givre', icon: 'frostling', color: 0x8fe0ff, text: 'Ses tirs ralentissent.', rate: 0.9, damage: 0.28, element: 'ice' },
  salamander: { id: 'salamander', name: 'Salamandre', icon: 'salamander', color: 0xff8a3a, text: 'Ses tirs enflamment.', rate: 0.9, damage: 0.28, element: 'fire' },
};

/** Pet damage multiplier at rarity/level (same growth as items). */
export function petPower(rarityMul, level) {
  return rarityMul * (1 + 0.08 * (level - 1));
}

/** Heroes: model, cape colour, passive, price in gems. */
export const HEROES = {
  archer: { id: 'archer', name: 'Aren', role: 'Archer', anime: 'archer', outfit: { cape: 0x2f5a2a, capeLength: 0.7, belt: 0x5a3a22, strap: 0x6a4428, quiver: 0x6a4428, tassets: 0x3a6630 }, animeShoot: 'shoot', weapon3d: 'crossbow_1handed', model: 'rogue_hooded', show: ['1H_Crossbow'], shoot: '1H_Ranged_Shoot', cape: 0x3fa9ff, price: 0, text: 'Équilibrée. Critique +5 %.', stats: { crit: 0.05 } },
  assassin: {
    id: 'assassin', name: 'Kaze', role: 'Assassin', anime: 'assassin', outfit: { scarf: 0x6a3aa8, belt: 0x2a2238, buckle: 0xc0c8e0, tassets: 0x34284e, tassetLength: 0.36 }, animeShoot: 'jab', animeRun: 'sprint', weapon3d: 'sword_1handed', model: 'rogue_hooded', show: ['Knife', 'Knife_Offhand'], shoot: 'Throw', tint: 0x6a5c96, cape: 0xa06bff, price: 0,
    text: 'Très rapide et insaisissable : vitesse +25 %, esquive +5 %.',
    stats: { speedMul: 0.25, dodge: 0.05 },
  },
  ranger: { id: 'ranger', name: 'Kael', role: 'Rôdeur', anime: 'ranger', outfit: { cape: 0x6a4a2a, capeLength: 0.85, capeWidth: 0.46, belt: 0x3a2a1a, strap: 0x4a3420, pauldrons: 0x6a5038, pauldronSide: 'L', tassets: 0x5a4028 }, animeShoot: 'shoot', weapon3d: 'crossbow_1handed', model: 'rogue', show: ['2H_Crossbow'], shoot: '2H_Ranged_Shoot', cape: 0x5fe06a, price: 250, text: 'Vitesse +12 %, esquive +6 %.', stats: { speedMul: 0.12, dodge: 0.06 } },
  mage: { id: 'mage', name: 'Ilian', role: 'Mage', anime: 'mage', outfit: { cape: 0x2c2a6e, capeLength: 1.0, capeWidth: 0.46, belt: 0xd8b050, tassets: 0x34307a, tassetLength: 0.46 }, animeShoot: 'cast', weapon3d: 'staff', model: 'mage', show: ['2H_Staff'], shoot: 'Spellcast_Shoot', cape: 0xc070ff, price: 450, text: 'Flèches de foudre dès le départ.', stats: { bolt: 1 } },
  knight: { id: 'knight', name: 'Bran', role: 'Chevalier', anime: 'knight', outfit: { cape: 0xa82a2a, capeLength: 0.9, capeWidth: 0.44, pauldrons: 0xb8c4d8, metal: true, belt: 0x3a3028, tassets: 0xb8c4d8 }, animeShoot: 'shoot', weapon3d: 'crossbow_1handed', model: 'knight', show: ['Round_Shield'], attach: 'crossbow_1handed', shoot: '1H_Ranged_Shoot', cape: 0xff5a4a, price: 700, text: 'Vie +30 %, dégâts subis −10 %.', stats: { hpMul: 0.3, armor: 0.1 } },
};

export const HERO_ORDER = ['archer', 'assassin', 'ranger', 'mage', 'knight'];
/** Heroes every player owns from the start. */
export const FREE_HEROES = ['archer', 'assassin'];

/** Chest odds by rarity index [common, rare, epic, legendary]. */
export const CHESTS = {
  free: { id: 'free', name: 'Coffre en bois', icon: 'chest-free', odds: [0.8, 0.2, 0, 0], cooldownHours: 4 },
  gold: { id: 'gold', name: 'Coffre doré', icon: 'chest-gold', odds: [0, 0.72, 0.24, 0.04], gems: 80 },
  hero: { id: 'hero', name: 'Coffre du familier', icon: 'chest-pet', odds: [0.2, 0.55, 0.2, 0.05], gems: 120, pet: true },
};
