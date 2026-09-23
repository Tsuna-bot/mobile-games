// Tower catalogue. Ranges and splash radii are in tiles, rates in seconds between shots.
// `pieces` lists the Kenney models stacked for each level (bottom to top).

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
};

/** Height of the stacked body for a tower level (weapon sits on top). */
export function stackHeight(def, level) {
  return def.pieces[level].reduce((sum, piece) => sum + PIECE_HEIGHT[piece], 0);
}

export const TOWER_ORDER = ['ballista', 'cannon', 'turret', 'catapult', 'frost'];

/** Total gold invested in a tower up to (and including) `level`. */
export function investedGold(def, level) {
  let total = def.cost;
  for (let i = 1; i <= level; i++) total += def.levels[i].upgrade;
  return total;
}
