// Tower catalogue. Ranges and splash radii are in tiles, rates in seconds between shots.
// `pieces` lists the Kenney models stacked for each level (bottom to top).
// Towers with `shopPrice` must be bought in the shop (gems) before they can be built.

export const TARGETING = ['first', 'last', 'strong', 'close'];

export const TARGETING_LABELS = {
  first: 'Premier',
  last: 'Dernier',
  strong: 'Plus fort',
  close: 'Plus proche',
};

export const TOWERS = {
  ballista: {
    id: 'ballista',
    name: 'Baliste',
    blurb: 'Tir rapide et précis sur une seule cible.',
    cost: 70,
    weapon: 'weapon-ballista',
    projectile: 'arrow',
    pieces: [
      ['tower-square-bottom-a'],
      ['tower-square-bottom-a', 'tower-square-middle-a'],
      ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a'],
    ],
    levels: [
      { damage: 22, range: 2.6, rate: 0.8, projectileSpeed: 14 },
      { upgrade: 65, damage: 40, range: 2.85, rate: 0.7, projectileSpeed: 15 },
      { upgrade: 120, damage: 74, range: 3.1, rate: 0.6, projectileSpeed: 16 },
    ],
  },
  cannon: {
    id: 'cannon',
    name: 'Canon',
    blurb: 'Boulets explosifs : dégâts de zone.',
    cost: 110,
    weapon: 'weapon-cannon',
    projectile: 'cannonball',
    pieces: [
      ['tower-round-bottom-b'],
      ['tower-round-bottom-b', 'tower-round-middle-b'],
      ['tower-round-bottom-b', 'tower-round-middle-b', 'tower-round-top-b'],
    ],
    levels: [
      { damage: 32, splash: 0.95, range: 2.35, rate: 1.6, projectileSpeed: 8 },
      { upgrade: 95, damage: 56, splash: 1.05, range: 2.55, rate: 1.5, projectileSpeed: 8.5 },
      { upgrade: 165, damage: 100, splash: 1.2, range: 2.75, rate: 1.4, projectileSpeed: 9 },
    ],
  },
  turret: {
    id: 'turret',
    name: 'Mitrailleuse',
    blurb: 'Rafales très rapides, faible contre les blindés.',
    cost: 90,
    weapon: 'weapon-turret',
    projectile: 'bullet',
    pieces: [
      ['tower-square-bottom-c'],
      ['tower-square-bottom-c', 'tower-square-middle-c'],
      ['tower-square-bottom-c', 'tower-square-middle-c', 'tower-square-top-c'],
    ],
    levels: [
      { damage: 7, range: 2.1, rate: 0.2, projectileSpeed: 20 },
      { upgrade: 85, damage: 11, range: 2.3, rate: 0.17, projectileSpeed: 22 },
      { upgrade: 145, damage: 17, range: 2.5, rate: 0.14, projectileSpeed: 24 },
    ],
  },
  catapult: {
    id: 'catapult',
    name: 'Catapulte',
    blurb: 'Très longue portée, énormes dégâts de zone, lente.',
    cost: 140,
    weapon: 'weapon-catapult',
    projectile: 'boulder',
    pieces: [
      ['tower-round-bottom-c'],
      ['tower-round-bottom-c', 'tower-round-middle-c'],
      ['tower-round-bottom-c', 'tower-round-middle-c', 'tower-round-top-c'],
    ],
    levels: [
      { damage: 62, splash: 1.3, range: 3.6, rate: 2.8, flightTime: 1.05 },
      { upgrade: 125, damage: 108, splash: 1.4, range: 3.9, rate: 2.6, flightTime: 1.05 },
      { upgrade: 205, damage: 185, splash: 1.55, range: 4.2, rate: 2.4, flightTime: 1.05 },
    ],
  },
  frost: {
    id: 'frost',
    name: 'Givre',
    blurb: 'Onde glacée qui ralentit tous les ennemis proches.',
    cost: 80,
    weapon: 'tower-round-crystals',
    weaponTint: 0x8fdcff,
    projectile: null,
    pieces: [
      ['tower-round-bottom-a'],
      ['tower-round-bottom-a', 'tower-round-middle-a'],
      ['tower-round-bottom-a', 'tower-round-middle-a', 'tower-round-top-a'],
    ],
    levels: [
      { damage: 4, range: 1.8, rate: 1.2, slow: 0.35, slowDuration: 1.4 },
      { upgrade: 70, damage: 7, range: 2.0, rate: 1.1, slow: 0.45, slowDuration: 1.5 },
      { upgrade: 120, damage: 12, range: 2.3, rate: 1.0, slow: 0.55, slowDuration: 1.6 },
    ],
  },
  tesla: {
    id: 'tesla',
    name: 'Tesla',
    blurb: 'Arc électrique qui rebondit d’un ovni à l’autre.',
    cost: 125,
    shopPrice: 150,
    weapon: 'tower-round-crystals',
    weaponTint: 0xfff07a,
    weaponScale: [0.8, 0.95, 1.1],
    projectile: null,
    pieces: [['tower-round-build-a'], ['tower-round-build-b'], ['tower-round-build-c']],
    levels: [
      { damage: 22, range: 2.2, rate: 1.1, chains: 3 },
      { upgrade: 100, damage: 38, range: 2.4, rate: 1.0, chains: 4 },
      { upgrade: 170, damage: 62, range: 2.6, rate: 0.9, chains: 5 },
    ],
  },
  sniper: {
    id: 'sniper',
    name: 'Arbalète lourde',
    blurb: 'Portée immense, carreaux qui percent l’armure. Parfaite contre blindés et boss.',
    cost: 150,
    shopPrice: 200,
    weapon: 'weapon-ballista',
    weaponScale: [1.25, 1.3, 1.35],
    projectile: 'arrow',
    pieces: [
      ['tower-square-bottom-b'],
      ['tower-square-bottom-b', 'tower-square-middle-b'],
      ['tower-square-bottom-b', 'tower-square-middle-b', 'tower-square-top-b'],
    ],
    levels: [
      { damage: 75, range: 4.2, rate: 2.2, projectileSpeed: 22, armorPierce: true },
      { upgrade: 130, damage: 130, range: 4.6, rate: 2.0, projectileSpeed: 24, armorPierce: true },
      { upgrade: 220, damage: 225, range: 5.0, rate: 1.8, projectileSpeed: 26, armorPierce: true },
    ],
  },
  goldmine: {
    id: 'goldmine',
    name: 'Mine d’or',
    blurb: 'Ne tire pas : rapporte de l’or au début de chaque vague.',
    cost: 120,
    shopPrice: 120,
    weapon: 'detail-crystal-large',
    weaponTint: 0xffc93c,
    weaponScale: [0.55, 0.65, 0.75],
    projectile: null,
    pieces: [['tower-square-build-a'], ['tower-square-build-b'], ['tower-square-build-c']],
    levels: [
      { income: 16, range: 0, rate: 0 },
      { upgrade: 110, income: 30, range: 0, rate: 0 },
      { upgrade: 170, income: 50, range: 0, rate: 0 },
    ],
  },
  flame: {
    id: 'flame',
    name: 'Lance-flammes',
    blurb: 'Crache du feu sur un groupe : les ovnis brûlent, même blindés.',
    cost: 100,
    shopPrice: 160,
    weapon: 'weapon-turret',
    weaponTint: 0xff7a30,
    projectile: null,
    pieces: [
      ['tower-round-bottom-b'],
      ['tower-round-bottom-b', 'tower-round-middle-b'],
      ['tower-round-bottom-b', 'tower-round-middle-b', 'tower-round-top-b'],
    ],
    levels: [
      { damage: 4, splash: 0.7, range: 1.7, rate: 0.32, burn: 7, burnTime: 2 },
      { upgrade: 90, damage: 6, splash: 0.8, range: 1.85, rate: 0.3, burn: 12, burnTime: 2.2 },
      { upgrade: 160, damage: 10, splash: 0.9, range: 2.0, rate: 0.28, burn: 20, burnTime: 2.4 },
    ],
  },
  mortar: {
    id: 'mortar',
    name: 'Mortier',
    blurb: 'Obus lents à très longue portée : énormes dégâts de zone.',
    cost: 160,
    shopPrice: 220,
    weapon: 'weapon-cannon',
    weaponScale: [1.15, 1.25, 1.35],
    projectile: 'shell',
    pieces: [['tower-square-build-d'], ['tower-square-build-e'], ['tower-square-build-f']],
    levels: [
      { damage: 85, splash: 1.5, range: 4.6, rate: 3.4, flightTime: 1.4 },
      { upgrade: 140, damage: 145, splash: 1.65, range: 5.0, rate: 3.1, flightTime: 1.4 },
      { upgrade: 230, damage: 245, splash: 1.8, range: 5.4, rate: 2.8, flightTime: 1.4 },
    ],
  },
  laser: {
    id: 'laser',
    name: 'Prisme',
    blurb: 'Rayon continu qui chauffe : plus il reste sur une cible, plus il fait mal.',
    cost: 150,
    shopPrice: 200,
    weapon: 'tower-round-crystals',
    weaponTint: 0xff5ad8,
    weaponScale: [0.85, 1, 1.1],
    projectile: null,
    pieces: [
      ['tower-round-bottom-a'],
      ['tower-round-bottom-a', 'tower-round-middle-a'],
      ['tower-round-bottom-a', 'tower-round-middle-a', 'tower-round-top-a'],
    ],
    levels: [
      { damage: 3.2, range: 2.6, rate: 0.1, beam: true, ramp: 0.1, maxRamp: 3.5, armorPierce: true },
      { upgrade: 120, damage: 5.4, range: 2.9, rate: 0.1, beam: true, ramp: 0.11, maxRamp: 3.8, armorPierce: true },
      { upgrade: 200, damage: 8.5, range: 3.2, rate: 0.1, beam: true, ramp: 0.12, maxRamp: 4.2, armorPierce: true },
    ],
  },
  poison: {
    id: 'poison',
    name: 'Tour d’acide',
    blurb: 'Fioles toxiques : un nuage empoisonne les ovnis et ignore l’armure.',
    cost: 90,
    shopPrice: 140,
    weapon: 'weapon-cannon',
    weaponTint: 0x8dff4a,
    weaponScale: [0.8, 0.85, 0.9],
    projectile: 'poison',
    pieces: [
      ['tower-square-bottom-a'],
      ['tower-square-bottom-a', 'tower-square-middle-c'],
      ['tower-square-bottom-a', 'tower-square-middle-c', 'tower-square-top-a'],
    ],
    levels: [
      { damage: 8, splash: 1.0, range: 2.4, rate: 1.3, projectileSpeed: 7, poison: 12, poisonTime: 3 },
      { upgrade: 80, damage: 12, splash: 1.1, range: 2.6, rate: 1.2, projectileSpeed: 7.5, poison: 21, poisonTime: 3.2 },
      { upgrade: 140, damage: 18, splash: 1.2, range: 2.8, rate: 1.1, projectileSpeed: 8, poison: 34, poisonTime: 3.5 },
    ],
  },
};

// Height of each stackable piece (from the model bounding boxes), used to place
// the weapon on top of the stack and to fire projectiles from the right height.
export const PIECE_HEIGHT = {
  'tower-square-bottom-a': 0.5,
  'tower-square-middle-a': 0.5,
  'tower-square-top-a': 0.5,
  'tower-square-bottom-c': 0.5,
  'tower-square-middle-c': 0.5,
  'tower-square-top-c': 0.5,
  'tower-round-bottom-a': 0.6,
  'tower-round-middle-a': 0.6,
  'tower-round-top-a': 0.5,
  'tower-round-bottom-b': 0.6,
  'tower-round-middle-b': 0.6,
  'tower-round-top-b': 0.5,
  'tower-round-bottom-c': 0.6,
  'tower-round-middle-c': 0.6,
  'tower-round-top-c': 0.5,
  'tower-square-bottom-b': 0.5,
  'tower-square-middle-b': 0.5,
  'tower-square-top-b': 0.5,
  'tower-round-build-a': 1,
  'tower-round-build-b': 1,
  'tower-round-build-c': 1,
  'tower-square-build-a': 1,
  'tower-square-build-b': 1,
  'tower-square-build-c': 1,
  'tower-square-build-d': 1.45,
  'tower-square-build-e': 1.45,
  'tower-square-build-f': 1.45,
};

/** Height of the stacked body for a tower level (weapon sits on top). */
export function stackHeight(def, level) {
  return def.pieces[level].reduce((sum, piece) => sum + PIECE_HEIGHT[piece], 0);
}

export const TOWER_ORDER = ['ballista', 'cannon', 'turret', 'catapult', 'frost', 'tesla', 'sniper', 'goldmine', 'flame', 'poison', 'laser', 'mortar'];
export const STARTER_TOWERS = ['ballista', 'cannon', 'turret', 'catapult', 'frost'];

/** Total gold invested in a tower up to (and including) `level`. */
export function investedGold(def, level) {
  let total = def.cost;
  for (let i = 1; i <= level; i++) total += def.levels[i].upgrade;
  return total;
}
