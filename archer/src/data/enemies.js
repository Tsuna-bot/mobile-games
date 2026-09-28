// Monsters. `ai` picks the behaviour in sim/enemies.js; `touch` is contact damage,
// `shot` projectile damage. KayKit characters (CC0) scaled, tinted, with a weapon.

export const ENEMIES = {
  zombie: {
    id: 'zombie', name: 'Squelette', model: 'skeleton_minion', ai: 'chase',
    hp: 190, speed: 1.15, radius: 0.34, touch: 55, xp: 6, coins: 2, scale: 1,
    blurb: 'Lent mais têtu : il te fonce dessus.',
  },
  skeleton: {
    id: 'skeleton', name: 'Squelette archer', model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', ai: 'shooter',
    hp: 150, speed: 1.3, radius: 0.32, touch: 45, shot: 75, shotSpeed: 6.5, cooldown: 2.3, aim: 0.7, xp: 7, coins: 2, scale: 1,
    blurb: 'Vise, puis tire une flèche en ligne droite.',
  },
  orc: {
    id: 'orc', name: 'Guerrier squelette', model: 'skeleton_warrior', attach: 'sword_1handed', aimClip: 'Taunt', ai: 'charger',
    hp: 300, speed: 1.2, radius: 0.4, touch: 95, dash: 9, cooldown: 2.8, aim: 0.8, xp: 9, coins: 3, scale: 1.15,
    blurb: 'Il se prépare… et charge en ligne droite.',
  },
  ghost: {
    id: 'ghost', name: 'Fantôme', model: 'q_ghost', height: 1.05, ai: 'float',
    hp: 130, speed: 1.5, radius: 0.3, touch: 45, xp: 6, coins: 2, scale: 1, flying: true,
    blurb: 'Traverse les obstacles et flotte vers toi.',
  },
  vampire: {
    id: 'vampire', name: 'Mage de sang', model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Shoot', tint: 0xff9a9a, ai: 'spread',
    hp: 260, speed: 1.1, radius: 0.34, touch: 55, shot: 70, shotSpeed: 5, cooldown: 2.6, aim: 0.5, spread: 3, xp: 10, coins: 3, scale: 1,
    blurb: 'Tire trois orbes de sang en éventail et se téléporte.',
  },
  keeper: {
    id: 'keeper', name: 'Nécromancien', model: 'mage', show: ['Spellbook_open'], aimClip: 'Spellcast_Summon', tint: 0x9a8aff, ai: 'ring',
    hp: 280, speed: 0.8, radius: 0.34, touch: 50, shot: 60, shotSpeed: 3.6, cooldown: 3.4, aim: 0.8, ring: 8, xp: 11, coins: 4, scale: 1,
    blurb: 'Lance un cercle d’orbes lentes tout autour de lui.',
  },
  bomber: {
    id: 'bomber', name: 'Bandit grenadier', model: 'rogue', show: ['Throwable'], aimClip: 'Throw', tint: 0xffc080, ai: 'bomber',
    hp: 200, speed: 1.2, radius: 0.32, touch: 45, shot: 110, cooldown: 2.8, aim: 0.3, blast: 1.1, fuse: 1.1, xp: 9, coins: 3, scale: 1,
    blurb: 'Lance des bombes : sors du cercle rouge !',
  },
  wisp: {
    id: 'wisp', name: 'Feu follet', model: 'q_hywirl', height: 0.6, ai: 'float',
    hp: 60, speed: 2.5, radius: 0.22, touch: 35, xp: 3, coins: 1, scale: 0.6, flying: true,
    blurb: 'Petit, rapide, toujours en bande.',
  },

  blob: {
    id: 'blob', name: 'Blob', model: 'q_greenblob', height: 0.9, ai: 'chase', split: 'blobling',
    hp: 230, speed: 1.05, radius: 0.38, touch: 55, xp: 7, coins: 2, scale: 1.1,
    blurb: 'Se divise en deux petits blobs quand il meurt.',
  },
  blobling: {
    id: 'blobling', name: 'Petit blob', model: 'q_greenblob', height: 0.5, ai: 'chase',
    hp: 70, speed: 1.9, radius: 0.24, touch: 35, xp: 2, coins: 1, scale: 0.6,
    blurb: 'Petit et rapide.',
  },

  // Bosses: bigger, several attack patterns, a health bar at the top of the screen.
  ogre: {
    id: 'ogre', name: 'Roi Champignon', model: 'q_mushroomking', height: 3, ai: 'bossOgre', boss: true,
    hp: 4200, speed: 1.1, radius: 0.9, touch: 110, shot: 90, shotSpeed: 6, dash: 8, blast: 1.8, xp: 60, coins: 40, scale: 2.5,
    blurb: 'Charge, frappe le sol et projette des rochers.',
  },
  skeletonKing: {
    id: 'skeletonKing', name: 'Roi squelette', model: 'skeleton_warrior', attach: 'axe_2handed', aimClip: 'Spellcast_Summon', ai: 'bossKing', boss: true,
    hp: 6200, speed: 0.9, radius: 0.85, touch: 110, shot: 90, shotSpeed: 5, xp: 80, coins: 60, scale: 2.5, tint: 0xfff0b0,
    blurb: 'Spirales d’os, cercles de projectiles et squelettes invoqués.',
  },
  count: {
    id: 'count', name: 'Dragon spectral', model: 'q_dragon', height: 3, hover: true, ai: 'bossCount', boss: true,
    hp: 7000, speed: 1.2, radius: 0.8, touch: 120, shot: 80, shotSpeed: 5.5, xp: 100, coins: 80, scale: 2.4,
    blurb: 'Se téléporte, lâche des chauves-souris et des éventails de flammes.',
  },
  crystal: {
    id: 'crystal', name: 'Gardien de cristal', model: 'q_alien', height: 3, tint: 0x9ff0ff, ai: 'bossKing', boss: true, summon: 'blob',
    hp: 5600, speed: 0.9, radius: 0.85, touch: 110, shot: 85, shotSpeed: 5, xp: 110, coins: 90, scale: 2.5,
    blurb: 'Spirales d’éclats, cercles de cristaux et blobs invoqués.',
  },
  yeti: {
    id: 'yeti', name: 'Yéti ancestral', model: 'q_yeti', height: 3.1, ai: 'bossOgre', boss: true,
    hp: 5200, speed: 1.2, radius: 0.95, touch: 120, shot: 90, shotSpeed: 6, dash: 9, blast: 2, xp: 120, coins: 100, scale: 2.6,
    blurb: 'Charges foudroyantes, frappe au sol et blocs de glace.',
  },
  tyrant: {
    id: 'tyrant', name: 'Tyran des marais', model: 'q_dino', height: 3, tint: 0xb8ff9a, ai: 'bossKing', boss: true, summon: 'blob',
    hp: 5800, speed: 1, radius: 0.9, touch: 120, shot: 85, shotSpeed: 5.2, xp: 130, coins: 110, scale: 2.5,
    blurb: 'Crache des spirales de venin et fait naître des blobs.',
  },
  demonLord: {
    id: 'demonLord', name: 'Seigneur démon', model: 'q_demon', height: 3.1, ai: 'bossCount', boss: true, summon: 'wisp',
    hp: 6000, speed: 1.2, radius: 0.85, touch: 125, shot: 85, shotSpeed: 5.8, xp: 140, coins: 120, scale: 2.5,
    blurb: 'Se téléporte, lance des éventails de flammes et des diablotins.',
  },
  shadowMaster: {
    id: 'shadowMaster', name: 'Maître de l’ombre', model: 'q_ninja', height: 3, tint: 0xc8b0ff, ai: 'bossFinal', boss: true, summon: 'skeleton', dash: 10, blast: 2,
    hp: 6600, speed: 1.25, radius: 0.85, touch: 130, shot: 85, shotSpeed: 5.6, xp: 160, coins: 150, scale: 2.5,
    blurb: 'Le dernier gardien : il maîtrise les attaques de tous les autres.',
  },
};
