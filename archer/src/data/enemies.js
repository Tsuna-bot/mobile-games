// Monsters. `ai` picks the behaviour in sim/enemies.js; `touch` is contact damage,
// `shot` projectile damage. Kenney characters (CC0) scaled and tinted.

export const ENEMIES = {
  zombie: {
    id: 'zombie', name: 'Zombie', model: 'graveyard/character-zombie', ai: 'chase',
    hp: 190, speed: 1.15, radius: 0.34, touch: 55, xp: 6, coins: 2, scale: 1,
    blurb: 'Lent mais têtu : il te fonce dessus.',
  },
  skeleton: {
    id: 'skeleton', name: 'Squelette archer', model: 'graveyard/character-skeleton', ai: 'shooter',
    hp: 150, speed: 1.3, radius: 0.32, touch: 45, shot: 75, shotSpeed: 6.5, cooldown: 2.3, aim: 0.7, xp: 7, coins: 2, scale: 1,
    blurb: 'Vise, puis tire une flèche en ligne droite.',
  },
  orc: {
    id: 'orc', name: 'Orc chargeur', model: 'dungeon/character-orc', ai: 'charger',
    hp: 300, speed: 1.2, radius: 0.4, touch: 95, dash: 9, cooldown: 2.8, aim: 0.8, xp: 9, coins: 3, scale: 1.15,
    blurb: 'Il se prépare… et charge en ligne droite.',
  },
  ghost: {
    id: 'ghost', name: 'Fantôme', model: 'graveyard/character-ghost', ai: 'float',
    hp: 130, speed: 1.5, radius: 0.3, touch: 45, xp: 6, coins: 2, scale: 1, flying: true,
    blurb: 'Traverse les obstacles et flotte vers toi.',
  },
  vampire: {
    id: 'vampire', name: 'Vampire', model: 'graveyard/character-vampire', ai: 'spread',
    hp: 260, speed: 1.1, radius: 0.34, touch: 55, shot: 70, shotSpeed: 5, cooldown: 2.6, aim: 0.5, spread: 3, xp: 10, coins: 3, scale: 1,
    blurb: 'Tire trois orbes de sang en éventail et se téléporte.',
  },
  keeper: {
    id: 'keeper', name: 'Nécromancien', model: 'graveyard/character-keeper', ai: 'ring',
    hp: 280, speed: 0.8, radius: 0.34, touch: 50, shot: 60, shotSpeed: 3.6, cooldown: 3.4, aim: 0.8, ring: 8, xp: 11, coins: 4, scale: 1,
    blurb: 'Lance un cercle d’orbes lentes tout autour de lui.',
  },
  bomber: {
    id: 'bomber', name: 'Bandit grenadier', model: 'dungeon/character-human', ai: 'bomber',
    hp: 200, speed: 1.2, radius: 0.32, touch: 45, shot: 110, cooldown: 2.8, aim: 0.3, blast: 1.1, fuse: 1.1, xp: 9, coins: 3, scale: 1,
    blurb: 'Lance des bombes : sors du cercle rouge !',
  },
  wisp: {
    id: 'wisp', name: 'Feu follet', model: 'graveyard/character-ghost', ai: 'float',
    hp: 60, speed: 2.5, radius: 0.22, touch: 35, xp: 3, coins: 1, scale: 0.6, flying: true, tint: 0x9dd8ff,
    blurb: 'Petit, rapide, toujours en bande.',
  },

  // Bosses: bigger, several attack patterns, a health bar at the top of the screen.
  ogre: {
    id: 'ogre', name: 'Ogre des bois', model: 'dungeon/character-orc', ai: 'bossOgre', boss: true,
    hp: 4200, speed: 1.1, radius: 0.9, touch: 110, shot: 90, shotSpeed: 6, dash: 8, blast: 1.8, xp: 60, coins: 40, scale: 2.5, tint: 0xa8d060,
    blurb: 'Charge, frappe le sol et projette des rochers.',
  },
  skeletonKing: {
    id: 'skeletonKing', name: 'Roi squelette', model: 'graveyard/character-skeleton', ai: 'bossKing', boss: true,
    hp: 6200, speed: 0.9, radius: 0.85, touch: 110, shot: 90, shotSpeed: 5, xp: 80, coins: 60, scale: 2.5, tint: 0xfff0b0,
    blurb: 'Spirales d’os, cercles de projectiles et squelettes invoqués.',
  },
  count: {
    id: 'count', name: 'Comte vampire', model: 'graveyard/character-vampire', ai: 'bossCount', boss: true,
    hp: 8600, speed: 1.2, radius: 0.8, touch: 120, shot: 95, shotSpeed: 5.5, xp: 100, coins: 80, scale: 2.4, tint: 0xd06080,
    blurb: 'Se téléporte, lâche des chauves-souris et des éventails de sang.',
  },
};
