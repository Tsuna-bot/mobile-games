// Kingdom content beyond the basics: blessings chosen at dawn, day events, treasures
// found in ruins and the market's trades. Plain data plus small helpers.

/**
 * Blessings: after each night held, pick one of three. They stack up to `max`.
 * `mods` are added into the Kingdom modifiers (see realmModifiers in realm.js).
 */
export const BLESSINGS = [
  { id: 'sharp', icon: '⚔️', name: 'Lames aiguisées', text: 'Dégâts des tours +8 %', max: 5, mods: { damage: 0.08 } },
  { id: 'eagle', icon: '🦅', name: 'Œil de faucon', text: 'Portée des tours +6 %', max: 3, mods: { range: 0.06 } },
  { id: 'swift', icon: '👟', name: 'Pas légers', text: 'Ouvriers 12 % plus rapides', max: 3, mods: { workerSpeed: 0.12 } },
  { id: 'harvest', icon: '🌿', name: 'Récoltes abondantes', text: 'Récolte 12 % plus rapide', max: 3, mods: { harvestSpeed: 0.12 } },
  { id: 'mason', icon: '🧱', name: 'Bâtisseurs', text: 'Chantiers 20 % plus rapides', max: 3, mods: { buildSpeed: 0.2 } },
  { id: 'stone', icon: '🪨', name: 'Pierre dure', text: 'Murs et bâtiments +25 % de vie', max: 3, mods: { hp: 0.25 } },
  { id: 'bounty', icon: '💰', name: 'Butin', text: '+1 or par ovni abattu', max: 3, mods: { bounty: 1 } },
  { id: 'dawn', icon: '🌅', name: 'Aube dorée', text: '+25 or à chaque aube', max: 3, mods: { dawnGold: 25 } },
  { id: 'recruit', icon: '🧑‍🌾', name: 'Nouvelles recrues', text: '+1 ouvrier', max: 4, mods: { workers: 1 } },
  { id: 'fortress', icon: '🏰', name: 'Forteresse', text: 'Château +20 points de vie', max: 3, mods: { castleHp: 20 } },
  { id: 'mana', icon: '🔮', name: 'Source de mana', text: 'Recharge des sorts −8 %', max: 3, mods: { spellCooldown: 0.08 } },
  { id: 'hero', icon: '🛡️', name: 'Bras du chevalier', text: 'Chevalier : +20 % de dégâts et de vie', max: 3, mods: { hero: 0.2 } },
  { id: 'frost', icon: '🧊', name: 'Nuits glacées', text: 'Les ovnis avancent 6 % moins vite', max: 3, mods: { enemySlow: 0.06 } },
  { id: 'granary', icon: '🌾', name: 'Grenier plein', text: 'Stockage +20 %', max: 3, mods: { storage: 0.2 } },
  { id: 'salvage', icon: '♻️', name: 'Récupération', text: 'Démolir rend 80 % au lieu de 50 %', max: 1, mods: { salvage: 1 } },
  { id: 'feast', icon: '🍗', name: 'Banquet', text: 'Les fermes produisent 30 % de plus', max: 3, mods: { food: 0.3 } },
];

/** Day events (one day in two or so). */
export const EVENTS = {
  merchant: { id: 'merchant', icon: '🧳', name: 'Marchand ambulant', text: 'Il propose de bons échanges jusqu’à la nuit.' },
  meteor: { id: 'meteor', icon: '☄️', name: 'Pluie de météores', text: 'Les cristaux repoussent d’un coup et une cargaison tombe du ciel.' },
  eclipse: { id: 'eclipse', icon: '🌑', name: 'Éclipse', text: 'La nuit tombera une minute plus tôt… mais l’aube paiera 50 % d’or en plus.' },
  festival: { id: 'festival', icon: '🎉', name: 'Fête au village', text: 'Ouvriers et chantiers 30 % plus rapides aujourd’hui.' },
  caravan: { id: 'caravan', icon: '🐫', name: 'Caravane', text: 'Des réfugiés arrivent avec des provisions.' },
};
export const EVENT_ORDER = ['merchant', 'meteor', 'eclipse', 'festival', 'caravan'];
export const EVENT_CHANCE = 0.6;

/** Market trades (permanent building) and the merchant's better ones. */
export const MARKET_TRADES = [
  { give: { wood: 40 }, get: { stone: 20 } },
  { give: { stone: 40 }, get: { wood: 30 } },
  { give: { food: 30 }, get: { gold: 25 } },
  { give: { crystal: 15 }, get: { gold: 45 } },
  { give: { gold: 90 }, get: { crystal: 15 } },
];
export const MERCHANT_TRADES = [
  { give: { wood: 40 }, get: { stone: 35 } },
  { give: { stone: 30 }, get: { crystal: 12 } },
  { give: { gold: 60 }, get: { crystal: 18 } },
  { give: { crystal: 12 }, get: { gold: 70 } },
  { give: { wood: 30, stone: 30 }, get: { food: 40 } },
];

/** What a looted ruin can hold (weights). */
export const TREASURES = [
  { weight: 40, kind: 'resources' },
  { weight: 25, kind: 'gold' },
  { weight: 15, kind: 'gems' },
  { weight: 12, kind: 'blessing' },
  { weight: 8, kind: 'relic' },
];

/** Sealing a portal: price and how many nights it stays shut. */
export const SEAL = { nights: 2, cost: (sealedBefore) => ({ crystal: 30 + 15 * sealedBefore, gold: 80 + 20 * sealedBefore }) };

/** Sum of the blessing bonuses. */
export function blessingMods(blessings) {
  const out = {};
  for (const [id, count] of Object.entries(blessings ?? {})) {
    const blessing = BLESSINGS.find((b) => b.id === id);
    if (!blessing) continue;
    for (const [key, value] of Object.entries(blessing.mods)) out[key] = (out[key] ?? 0) + value * count;
  }
  return out;
}

/** Three different blessings still below their cap, from a random source. */
export function rollBlessings(blessings, random = Math.random) {
  const pool = BLESSINGS.filter((b) => (blessings[b.id] ?? 0) < b.max);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0].id);
  return out;
}
