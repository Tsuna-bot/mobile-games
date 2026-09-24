// Kingdom mode: an open map around the castle. Workers gather wood, stone and
// crystal by day; the player builds houses, walls and towers; UFOs attack from
// portals every night. Everything here is plain data plus small pure helpers.

import { ENEMIES } from './enemies.js';
import { TOWERS } from './towers.js';

export const RESOURCES = ['wood', 'stone', 'crystal', 'gold'];

export const RESOURCE_INFO = {
  wood: { name: 'Bois', icon: '🪵' },
  stone: { name: 'Pierre', icon: '🪨' },
  crystal: { name: 'Cristal', icon: '💎' },
  gold: { name: 'Or', icon: '🪙' },
};

export const REALM = {
  size: 33,
  seedRange: 1e9,
  // Night 1 starts after the first day, then every day lasts `dayLength` seconds.
  firstDayLength: 210,
  dayLength: 150,
  // Gold per second of daylight skipped when calling the night early.
  earlyNightBonus: 0.5,
  dawnGold: (night) => 20 + night * 6,
  dawnGems: (night) => 2 + (night % 5 === 0 ? 10 : 0),
  start: { wood: 70, stone: 30, crystal: 0, gold: 60 },
  startWorkers: 3,
  castleHp: 60,
  // Castle damage per point of an enemy's `leak`.
  leakDamage: 2,
  // When the castle falls: share of the stock the raiders carry away.
  fallLoss: 0.4,
  baseStorage: 250,
  // Extra cost for enemies to path through a wall or building instead of walking around.
  breakCost: 12,
  worker: { speed: 1.4, harvestTime: 3, carry: 5, perNode: 2 },
  nodes: {
    tree: { resource: 'wood', amount: 40, regrowDays: 2 },
    rock: { resource: 'stone', amount: 50, regrowDays: 3 },
    crystal: { resource: 'crystal', amount: 35, regrowDays: 4 },
  },
  // Share of the normal gathering rate earned while away (daytime saves only), capped.
  offlineRate: 0.5,
  offlineCap: 3 * 3600,
};

/**
 * Buildings. `levels[i].cost` is the cost to reach that level (index 0 = build).
 * `hp` is before the Masonry research.
 */
export const BUILDINGS = {
  house: {
    id: 'house',
    name: 'Maison',
    blurb: 'Loge des ouvriers en plus.',
    icon: '🏠',
    levels: [
      { cost: { wood: 30 }, hp: 140, workers: 2 },
      { cost: { wood: 40, stone: 25 }, hp: 220, workers: 4 },
      { cost: { wood: 60, stone: 50, crystal: 10 }, hp: 320, workers: 6 },
    ],
  },
  depot: {
    id: 'depot',
    name: 'Entrepôt',
    blurb: 'Les ouvriers y déposent leur récolte. Augmente le stockage.',
    icon: '📦',
    levels: [
      { cost: { wood: 45, stone: 15 }, hp: 180, storage: 200 },
      { cost: { wood: 50, stone: 45 }, hp: 280, storage: 450 },
    ],
  },
  wall: {
    id: 'wall',
    name: 'Palissade',
    blurb: 'Bloque les ovnis : ils la contournent ou doivent la casser.',
    icon: '🧱',
    levels: [
      { cost: { wood: 6 }, hp: 180, name: 'Palissade' },
      { cost: { stone: 10 }, hp: 520, name: 'Muraille' },
    ],
  },
  academy: {
    id: 'academy',
    name: 'Académie',
    blurb: 'Débloque la recherche : nouvelles tours, sorts et bonus.',
    icon: '📜',
    unique: true,
    levels: [{ cost: { wood: 80, stone: 50 }, hp: 400 }],
  },
};

export const BUILDING_ORDER = ['wall', 'house', 'depot', 'academy'];

// Share of each resource in a tower's build cost, and the scale from its gold cost.
const TOWER_MIX = {
  ballista: { wood: 0.7, stone: 0.3 },
  cannon: { wood: 0.35, stone: 0.65 },
  turret: { wood: 0.55, stone: 0.45 },
  catapult: { wood: 0.55, stone: 0.45 },
  frost: { stone: 0.55, crystal: 0.45 },
  tesla: { stone: 0.45, crystal: 0.55 },
  sniper: { wood: 0.5, stone: 0.3, crystal: 0.2 },
  goldmine: { stone: 0.6, crystal: 0.4 },
  flame: { wood: 0.35, stone: 0.45, crystal: 0.2 },
  mortar: { wood: 0.25, stone: 0.75 },
  laser: { stone: 0.35, crystal: 0.65 },
  poison: { wood: 0.55, crystal: 0.45 },
};
const BUILD_SCALE = 0.4;
const UPGRADE_MIX = { stone: 0.45, crystal: 0.25, gold: 0.3 };
const UPGRADE_SCALE = 0.55;

function scaleMix(total, mix) {
  const cost = {};
  for (const [resource, share] of Object.entries(mix)) {
    const amount = Math.round((total * share) / 5) * 5;
    if (amount > 0) cost[resource] = amount;
  }
  return cost;
}

/** Resource cost of building (level 0) or upgrading to `level` a tower in the Kingdom. */
export function towerCost(id, level = 0, costFactor = 1) {
  const def = TOWERS[id];
  if (level === 0) return scaleMix(def.cost * BUILD_SCALE, TOWER_MIX[id] ?? { wood: 0.5, stone: 0.5 });
  return scaleMix(def.levels[level].upgrade * UPGRADE_SCALE * costFactor, UPGRADE_MIX);
}

// Each tower already standing makes the next one pricier; same for extra houses and depots.
export const TOWER_COST_GROWTH = 0.12;
export const BUILDING_COST_GROWTH = 0.3;

export function scaleCost(cost, factor) {
  const out = {};
  for (const [resource, amount] of Object.entries(cost)) out[resource] = Math.round((amount * factor) / 5) * 5 || amount;
  return out;
}

/** Hit points of a tower in the Kingdom (enemies smash towers that block them). */
export function towerHp(level) {
  return 160 + level * 110;
}

/**
 * Research tree, bought at the Academy. `costs[i]` buys level i + 1.
 * `unlock` entries make a tower or spell available; the rest are bonuses.
 */
export const RESEARCH = [
  // Economy
  { id: 'tools', group: 'Économie', icon: '🪓', name: 'Outils affûtés', effect: (l) => `Récolte ${15 * l} % plus rapide`, costs: [{ gold: 40 }, { gold: 90, crystal: 10 }, { gold: 160, crystal: 25 }] },
  { id: 'bags', group: 'Économie', icon: '🎒', name: 'Sacoches', effect: (l) => `+${2 * l} ressources par voyage`, costs: [{ gold: 35 }, { gold: 80, crystal: 8 }, { gold: 140, crystal: 20 }] },
  { id: 'boots', group: 'Économie', icon: '🥾', name: 'Bottes de marche', effect: (l) => `Ouvriers ${15 * l} % plus rapides`, costs: [{ gold: 50 }, { gold: 120, crystal: 15 }] },
  { id: 'granary', group: 'Économie', icon: '🏚️', name: 'Greniers', effect: (l) => `Stockage +${40 * l} %`, costs: [{ gold: 60, wood: 40 }, { gold: 140, wood: 80, crystal: 15 }] },
  // Defense
  { id: 'ballistics', group: 'Défense', icon: '🎯', name: 'Balistique', effect: (l) => `Dégâts des tours +${10 * l} %`, costs: [{ gold: 60, crystal: 5 }, { gold: 110, crystal: 15 }, { gold: 170, crystal: 30 }, { gold: 250, crystal: 50 }, { gold: 350, crystal: 80 }] },
  { id: 'optics', group: 'Défense', icon: '🔭', name: 'Optique', effect: (l) => `Portée des tours +${7 * l} %`, costs: [{ gold: 80, crystal: 10 }, { gold: 160, crystal: 25 }, { gold: 280, crystal: 50 }] },
  { id: 'masonry', group: 'Défense', icon: '⛏️', name: 'Maçonnerie', effect: (l) => `Murs, tours et bâtiments +${40 * l} % de vie`, costs: [{ gold: 50, stone: 40 }, { gold: 110, stone: 80 }, { gold: 200, stone: 140, crystal: 20 }] },
  { id: 'engineering', group: 'Défense', icon: '⚙️', name: 'Ingénierie', effect: (l) => `Améliorations des tours −${12 * l} %`, costs: [{ gold: 90, crystal: 10 }, { gold: 200, crystal: 35 }] },
  { id: 'bastion', group: 'Défense', icon: '🏰', name: 'Remparts', effect: (l) => `Château +${20 * l} points de vie`, costs: [{ gold: 70, stone: 60 }, { gold: 150, stone: 120 }, { gold: 260, stone: 200, crystal: 30 }] },
  // Magic
  { id: 'arcana', group: 'Magie', icon: '✨', name: 'Arcanes', effect: (l) => `Sorts +${20 * l} % de puissance`, costs: [{ gold: 70, crystal: 15 }, { gold: 140, crystal: 30 }, { gold: 230, crystal: 55 }, { gold: 340, crystal: 90 }] },
  { id: 'focus', group: 'Magie', icon: '⏳', name: 'Concentration', effect: (l) => `Recharge des sorts −${10 * l} %`, costs: [{ gold: 80, crystal: 15 }, { gold: 170, crystal: 35 }, { gold: 290, crystal: 60 }] },
  { id: 'spell-blizzard', group: 'Magie', icon: '❄️', name: 'Sort : Blizzard', unlock: { spell: 'blizzard' }, costs: [{ gold: 70, crystal: 15 }] },
  { id: 'spell-lightning', group: 'Magie', icon: '⚡', name: 'Sort : Foudre', unlock: { spell: 'lightning' }, costs: [{ gold: 90, crystal: 20 }] },
  { id: 'spell-repair', group: 'Magie', icon: '💚', name: 'Sort : Réparation', unlock: { spell: 'repair' }, costs: [{ gold: 100, crystal: 25 }] },
  { id: 'spell-goldrain', group: 'Magie', icon: '🪙', name: 'Sort : Pluie d’or', unlock: { spell: 'goldrain' }, costs: [{ gold: 120, crystal: 30 }] },
  { id: 'spell-quake', group: 'Magie', icon: '🌋', name: 'Sort : Séisme', unlock: { spell: 'quake' }, costs: [{ gold: 150, crystal: 45 }] },
  // Arsenal
  { id: 'tower-cannon', group: 'Arsenal', unlock: { tower: 'cannon' }, costs: [{ gold: 40 }] },
  { id: 'tower-turret', group: 'Arsenal', unlock: { tower: 'turret' }, costs: [{ gold: 50 }] },
  { id: 'tower-frost', group: 'Arsenal', unlock: { tower: 'frost' }, costs: [{ gold: 60, crystal: 10 }] },
  { id: 'tower-poison', group: 'Arsenal', unlock: { tower: 'poison' }, costs: [{ gold: 80, crystal: 15 }] },
  { id: 'tower-catapult', group: 'Arsenal', unlock: { tower: 'catapult' }, costs: [{ gold: 90, crystal: 15 }] },
  { id: 'tower-flame', group: 'Arsenal', unlock: { tower: 'flame' }, costs: [{ gold: 100, crystal: 20 }] },
  { id: 'tower-goldmine', group: 'Arsenal', unlock: { tower: 'goldmine' }, costs: [{ gold: 110, crystal: 25 }] },
  { id: 'tower-tesla', group: 'Arsenal', unlock: { tower: 'tesla' }, costs: [{ gold: 140, crystal: 40 }] },
  { id: 'tower-sniper', group: 'Arsenal', unlock: { tower: 'sniper' }, costs: [{ gold: 160, crystal: 40 }] },
  { id: 'tower-laser', group: 'Arsenal', unlock: { tower: 'laser' }, costs: [{ gold: 180, crystal: 60 }] },
  { id: 'tower-mortar', group: 'Arsenal', unlock: { tower: 'mortar' }, costs: [{ gold: 200, crystal: 60 }] },
];

for (const item of RESEARCH) {
  if (item.unlock?.tower) {
    item.name = TOWERS[item.unlock.tower].name;
    item.icon = '🗼';
    item.effect = () => TOWERS[item.unlock.tower].blurb;
  }
  if (item.unlock?.spell) item.effect = () => 'Nouveau sort dans la barre des sorts';
}

export const RESEARCH_GROUPS = ['Économie', 'Défense', 'Magie', 'Arsenal'];
export const REALM_STARTER_TOWERS = ['ballista'];
export const REALM_STARTER_SPELLS = ['meteor'];

/** Combat and economy multipliers from the researched levels. */
export function realmModifiers(research) {
  const r = (id) => research[id] ?? 0;
  return {
    damage: 1 + 0.1 * r('ballistics'),
    range: 1 + 0.07 * r('optics'),
    upgradeCost: 1 - 0.12 * r('engineering'),
    spellCooldown: 1 - 0.1 * r('focus'),
    spellPower: 1 + 0.2 * r('arcana'),
    startGold: 0,
    lives: 0,
    harvest: 1 / (1 + 0.15 * r('tools')),
    carry: 2 * r('bags'),
    workerSpeed: 1 + 0.15 * r('boots'),
    storage: 1 + 0.4 * r('granary'),
    hp: 1 + 0.4 * r('masonry'),
    castleHp: 20 * r('bastion'),
  };
}

export function unlockedTowers(research) {
  return [...REALM_STARTER_TOWERS, ...RESEARCH.filter((item) => item.unlock?.tower && research[item.id]).map((item) => item.unlock.tower)];
}

export function unlockedSpells(research) {
  return [...REALM_STARTER_SPELLS, ...RESEARCH.filter((item) => item.unlock?.spell && research[item.id]).map((item) => item.unlock.spell)];
}

/**
 * Night `n` (1-based): spawns spread across the open portals, time-sorted.
 * Nights grow in size and toughness; demolishers show up from night 3 to break walls.
 */
export function makeNight(n, portalCount) {
  const spawns = [];
  let portal = 0;
  const add = (type, count, interval, delay) => {
    for (let i = 0; i < count; i++) {
      spawns.push({ time: delay + i * interval, type, portal: portal % portalCount });
      portal++;
    }
  };
  add('scout', Math.round(6 + n * 2), Math.max(0.3, 1 - n * 0.03), 0);
  if (n >= 2) add('runner', Math.round(2 + n * 1.1), 0.5, 5);
  if (n >= 3) add('tank', Math.round(1 + (n - 2) * 0.6), Math.max(1.2, 2.2 - n * 0.04), 8);
  if (n >= 3) add('siege', Math.round(1 + (n - 3) * 0.35), 3, 12);
  if (n % 5 === 0) add('boss', Math.max(1, Math.floor(n / 10) + 1), 7, 14);
  if (n >= 7) add('runner', Math.round(n * 0.7), 0.4, 18);
  spawns.sort((a, b) => a.time - b.time);
  const hpMultiplier = 0.85 * (1 + 0.16 * (n - 1) + 0.014 * (n - 1) ** 2);
  const counts = {};
  for (const s of spawns) counts[s.type] = (counts[s.type] ?? 0) + 1;
  return { number: n, spawns, hpMultiplier, counts, reward: spawns.reduce((sum, s) => sum + ENEMIES[s.type].reward, 0) };
}

/** Portals open over the nights: 1 at first, up to 4. */
export function portalsOpen(night) {
  return night >= 12 ? 4 : night >= 7 ? 3 : night >= 3 ? 2 : 1;
}
