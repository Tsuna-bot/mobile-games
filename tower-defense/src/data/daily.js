// Daily challenge: every day, one map from the campaign with two special rules.
// Beating it once a day pays gems. Same challenge for everyone on the same date.

import { LEVELS } from './levels.js';

export const DAILY_RULES = [
  { id: 'fast', name: 'Ovnis pressés', text: 'Les ovnis vont 25 % plus vite.', apply: { speed: 1.25 } },
  { id: 'armored', name: 'Carapaces', text: 'Tous les ovnis ont 4 d’armure en plus.', apply: { armor: 4 } },
  { id: 'poor', name: 'Disette', text: '40 % d’or en moins au départ.', apply: { startGold: 0.6 } },
  { id: 'nospells', name: 'Sans magie', text: 'Aucun sort pendant la partie.', apply: { noSpells: true } },
  { id: 'splash', name: 'Artillerie', text: 'Seulement des tours de zone.', apply: { towers: ['cannon', 'catapult', 'frost', 'flame', 'poison', 'mortar'] } },
  { id: 'shields', name: 'Boucliers pour tous', text: 'Chaque ovni porte un bouclier.', apply: { shieldAll: 0.35 } },
  { id: 'glass', name: 'Château de verre', text: 'Seulement 8 vies.', apply: { lives: 8 } },
  { id: 'swarm', name: 'Nuée', text: '60 % d’ovnis en plus, mais plus fragiles.', apply: { swarm: 1.6 } },
  { id: 'rich', name: 'Trésor', text: 'Chaque ovni rapporte 50 % d’or en plus.', apply: { reward: 1.5 } },
  { id: 'hero', name: 'Héros en forme', text: 'Le chevalier commence au niveau 4.', apply: { heroLevel: 4 } },
];

export const DAILY_WAVES = 12;
export const DAILY_GEMS = 15;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar day number (changes at midnight on the player's clock). */
export function dayNumber(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

/** Today's challenge: { day, levelIndex, def, rules, options } */
export function dailyChallenge(date = new Date()) {
  const day = dayNumber(date);
  const random = seeded(day * 2654435761);
  const levelIndex = Math.floor(random() * LEVELS.length);
  const pool = [...DAILY_RULES];
  const rules = [];
  while (rules.length < 2) rules.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  const base = LEVELS[levelIndex];
  const options = Object.assign({}, ...rules.map((r) => r.apply));
  const def = { ...base, id: 'daily', name: 'Défi du jour', subtitle: rules.map((r) => r.name).join(' · '), waves: DAILY_WAVES, hpScale: base.hpScale * 0.92, daily: true, mapName: base.name };
  return { day, levelIndex, def, rules, options };
}
