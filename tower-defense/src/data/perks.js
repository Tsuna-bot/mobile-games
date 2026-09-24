// Permanent upgrades bought with the stars earned in levels. Each rank costs
// `costs[rank]` stars; `apply` folds a rank count into the simulation modifiers.

export const DEFAULT_MODIFIERS = Object.freeze({
  damage: 1,
  range: 1,
  startGold: 0,
  lives: 0,
  spellCooldown: 1,
  spellPower: 1,
  upgradeCost: 1,
});

export const PERKS = [
  {
    id: 'arsenal',
    name: 'Arsenal',
    icon: '⚔️',
    effect: (rank) => `+${rank * 8} % de dégâts des tours`,
    costs: [1, 2, 3],
    apply: (mods, rank) => { mods.damage += rank * 0.08; },
  },
  {
    id: 'treasury',
    name: 'Trésor royal',
    icon: '💰',
    effect: (rank) => `+${rank * 35} or au départ`,
    costs: [1, 2, 3],
    apply: (mods, rank) => { mods.startGold += rank * 35; },
  },
  {
    id: 'optics',
    name: 'Longue-vue',
    icon: '🔭',
    effect: (rank) => `+${rank * 7} % de portée`,
    costs: [2, 3],
    apply: (mods, rank) => { mods.range += rank * 0.07; },
  },
  {
    id: 'engineering',
    name: 'Ingénierie',
    icon: '🛠️',
    effect: (rank) => `−${rank * 10} % sur les améliorations`,
    costs: [1, 2, 3],
    apply: (mods, rank) => { mods.upgradeCost -= rank * 0.1; },
  },
  {
    id: 'arcana',
    name: 'Arcanes',
    icon: '🔮',
    effect: (rank) => `Sorts : −${rank * 12} % de recharge, +${rank * 15} % de puissance`,
    costs: [1, 2, 3],
    apply: (mods, rank) => {
      mods.spellCooldown -= rank * 0.12;
      mods.spellPower += rank * 0.15;
    },
  },
  {
    id: 'ramparts',
    name: 'Remparts',
    icon: '🏰',
    effect: (rank) => `+${rank * 3} vies au château`,
    costs: [1, 2],
    apply: (mods, rank) => { mods.lives += rank * 3; },
  },
];

export function buildModifiers(ranks = {}) {
  const mods = { ...DEFAULT_MODIFIERS };
  for (const perk of PERKS) {
    const rank = Math.min(ranks[perk.id] ?? 0, perk.costs.length);
    if (rank > 0) perk.apply(mods, rank);
  }
  return mods;
}

export function spentStars(ranks = {}) {
  let total = 0;
  for (const perk of PERKS) {
    const rank = Math.min(ranks[perk.id] ?? 0, perk.costs.length);
    for (let i = 0; i < rank; i++) total += perk.costs[i];
  }
  return total;
}

export const MAX_PERK_STARS = PERKS.reduce((sum, perk) => sum + perk.costs.reduce((a, b) => a + b, 0), 0);
