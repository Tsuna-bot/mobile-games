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
    id: 'demonLord', name: 'Seigneur démon', model: 'b_imp_red', height: 3.1, ai: 'bossCount', boss: true, summon: 'wisp',
    hp: 6000, speed: 1.2, radius: 0.85, touch: 125, shot: 85, shotSpeed: 5.8, xp: 140, coins: 120, scale: 2.5,
    blurb: 'Se téléporte, lance des éventails de flammes et des diablotins.',
  },
  shadowMaster: {
    id: 'shadowMaster', name: 'Maître de l’ombre', model: 'q_ninja', height: 3, tint: 0xc8b0ff, ai: 'bossFinal', boss: true, summon: 'skeleton', dash: 10, blast: 2,
    hp: 6600, speed: 1.25, radius: 0.85, touch: 130, shot: 85, shotSpeed: 5.6, xp: 160, coins: 150, scale: 2.5,
    blurb: 'Le dernier gardien : il maîtrise les attaques de tous les autres.',
  },

  // Bosses of chapters 9 to 18 (the same attack patterns, new looks and names).
  sandKing: {
    id: 'sandKing', name: 'Scarabée colosse', model: 'q_spiky', height: 2.8, tint: 0xffd890, ai: 'bossOgre', boss: true,
    hp: 5400, speed: 1.15, radius: 0.95, touch: 125, shot: 90, shotSpeed: 6.2, dash: 9, blast: 2, xp: 170, coins: 160, scale: 2.6,
    blurb: 'Charge dans le sable, frappe le sol et crache des rochers.',
  },
  kitsune: {
    id: 'kitsune', name: 'Kitsune céleste', model: 'q_bluedemon', height: 3, tint: 0xffb8e8, ai: 'bossCount', boss: true, summon: 'wisp',
    hp: 6200, speed: 1.3, radius: 0.8, touch: 125, shot: 85, shotSpeed: 6, xp: 180, coins: 170, scale: 2.4,
    blurb: 'Se téléporte entre les cerisiers et lance des éventails de feu-renard.',
  },
  brigand: {
    id: 'brigand', name: 'Chef des brigands', model: 'barbarian', attach: 'axe_2handed', aimClip: 'Spellcast_Summon', ai: 'bossKing', boss: true, summon: 'bomber',
    hp: 6400, speed: 1, radius: 0.85, touch: 130, shot: 90, shotSpeed: 5.4, xp: 190, coins: 180, scale: 2.5,
    blurb: 'Spirales de haches et bandits grenadiers en renfort.',
  },
  leviathan: {
    id: 'leviathan', name: 'Léviathan', model: 'q_squidle', height: 3, hover: true, tint: 0x8affe8, ai: 'bossKing', boss: true, summon: 'blob',
    hp: 6000, speed: 1, radius: 0.9, touch: 130, shot: 88, shotSpeed: 5.4, xp: 200, coins: 190, scale: 2.5,
    blurb: 'Des spirales d’encre et des blobs des profondeurs.',
  },
  skyDragon: {
    id: 'skyDragon', name: 'Dragon céleste', model: 'q_dragon', height: 3.2, hover: true, tint: 0xfff0b0, ai: 'bossCount', boss: true, summon: 'wisp',
    hp: 6800, speed: 1.3, radius: 0.85, touch: 135, shot: 88, shotSpeed: 6.2, xp: 210, coins: 200, scale: 2.5,
    blurb: 'Plonge d’un nuage à l’autre en soufflant des éventails de lumière.',
  },
  warlord: {
    id: 'warlord', name: 'Seigneur orc', model: 'q_orc', height: 3.2, tint: 0xb8ff90, ai: 'bossOgre', boss: true,
    hp: 6000, speed: 1.25, radius: 0.95, touch: 140, shot: 95, shotSpeed: 6.4, dash: 10, blast: 2.1, xp: 220, coins: 210, scale: 2.6,
    blurb: 'Charges brutales, frappes au sol et rochers.',
  },
  stormKnight: {
    id: 'stormKnight', name: 'Chevalier-tempête', model: 'knight', attach: 'sword_1handed', tint: 0xa8c8ff, ai: 'bossFinal', boss: true, summon: 'ghost', dash: 10.5, blast: 2.1,
    hp: 6800, speed: 1.3, radius: 0.85, touch: 140, shot: 90, shotSpeed: 5.8, xp: 230, coins: 220, scale: 2.5,
    blurb: 'La foudre à la main : il enchaîne toutes les attaques.',
  },
  voidEye: {
    id: 'voidEye', name: 'Œil du néant', model: 'q_alien', height: 3.1, tint: 0xc890ff, ai: 'bossKing', boss: true, summon: 'wisp',
    hp: 6600, speed: 0.95, radius: 0.9, touch: 140, shot: 92, shotSpeed: 5.4, xp: 240, coins: 230, scale: 2.5,
    blurb: 'Spirales du néant et essaims de feux follets.',
  },
  pharaoh: {
    id: 'pharaoh', name: 'Pharaon éternel', model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon', tint: 0xffe090, ai: 'bossCount', boss: true, summon: 'skeleton',
    hp: 7000, speed: 1.2, radius: 0.85, touch: 140, shot: 92, shotSpeed: 6, xp: 250, coins: 250, scale: 2.5,
    blurb: 'Se téléporte, lance des éventails dorés et réveille ses archers.',
  },
  archon: {
    id: 'archon', name: 'Archonte déchu', model: 'q_demon', height: 3.3, tint: 0xfff0d8, ai: 'bossFinal', boss: true, summon: 'vampire', dash: 11, blast: 2.3,
    hp: 7600, speed: 1.35, radius: 0.9, touch: 150, shot: 95, shotSpeed: 6.2, xp: 300, coins: 300, scale: 2.6,
    blurb: 'Le maître du trône céleste. Toutes les attaques, plus vite.',
  },

  // Bosses of chapters 19 to 30.
  tideLord: {
    id: 'tideLord', name: 'Seigneur des marées', model: 'q_glub_evolved', height: 3, hover: true, tint: 0x8af0ff, ai: 'bossKing', boss: true, summon: 'blob',
    hp: 7800, speed: 1, radius: 0.9, touch: 150, shot: 96, shotSpeed: 5.6, xp: 310, coins: 310, scale: 2.5,
    blurb: 'Des spirales d’écume et des blobs du lagon.',
  },
  elderShroom: {
    id: 'elderShroom', name: 'Champignon ancestral', model: 'q_mushnub_evolved', height: 3, tint: 0xa8d0ff, ai: 'bossOgre', boss: true,
    hp: 7600, speed: 1.2, radius: 0.95, touch: 155, shot: 98, shotSpeed: 6.4, dash: 10, blast: 2.2, xp: 320, coins: 320, scale: 2.6,
    blurb: 'Charge entre les lucioles, frappe le sol et lance des spores.',
  },
  puglinChief: {
    id: 'puglinChief', name: 'Chef puglin', model: 'b_puglin_red', height: 3, ai: 'bossKing', boss: true, summon: 'bomber',
    hp: 8200, speed: 1.05, radius: 0.9, touch: 155, shot: 98, shotSpeed: 5.8, xp: 330, coins: 330, scale: 2.5,
    blurb: 'Spirales de pierres et grenadiers en renfort.',
  },
  frostWyrm: {
    id: 'frostWyrm', name: 'Wyverne de givre', model: 'q_dragon', height: 3.2, hover: true, tint: 0xb0e8ff, ai: 'bossCount', boss: true, summon: 'ghost',
    hp: 8400, speed: 1.35, radius: 0.85, touch: 160, shot: 98, shotSpeed: 6.4, xp: 340, coins: 340, scale: 2.5,
    blurb: 'Se téléporte dans le blizzard et souffle des éventails de glace.',
  },
  jadeBlade: {
    id: 'jadeBlade', name: 'Lame de jade', model: 'q_ninja', height: 3, tint: 0x9affc8, ai: 'bossFinal', boss: true, summon: 'orc', dash: 11, blast: 2.2,
    hp: 8600, speed: 1.4, radius: 0.85, touch: 160, shot: 96, shotSpeed: 6.2, xp: 350, coins: 350, scale: 2.5,
    blurb: 'Un maître d’armes : il enchaîne toutes les attaques.',
  },
  lich: {
    id: 'lich', name: 'Liche pourpre', model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon', tint: 0xff8aa0, ai: 'bossCount', boss: true, summon: 'zombie',
    hp: 8800, speed: 1.25, radius: 0.85, touch: 165, shot: 100, shotSpeed: 6.2, xp: 360, coins: 360, scale: 2.6,
    blurb: 'Se téléporte entre les cryptes et relève les morts.',
  },
  magmaColossus: {
    id: 'magmaColossus', name: 'Colosse de magma', model: 'q_yeti', height: 3.3, tint: 0xff9a6a, ai: 'bossOgre', boss: true,
    hp: 9000, speed: 1.25, radius: 1, touch: 170, shot: 104, shotSpeed: 6.6, dash: 10.5, blast: 2.4, xp: 370, coins: 370, scale: 2.7,
    blurb: 'Charges brûlantes, frappes au sol et blocs de lave.',
  },
  sporeQueen: {
    id: 'sporeQueen', name: 'Reine des spores', model: 'q_bee_evolved', height: 3, hover: true, tint: 0xf0a8ff, ai: 'bossCount', boss: true, summon: 'wisp',
    hp: 9000, speed: 1.4, radius: 0.85, touch: 165, shot: 100, shotSpeed: 6.6, xp: 380, coins: 380, scale: 2.5,
    blurb: 'Vole d’un champignon à l’autre et lâche des nuées.',
  },
  beastKing: {
    id: 'beastKing', name: 'Roi des bêtes', model: 'q_spiky', height: 3, tint: 0xffc070, ai: 'bossOgre', boss: true,
    hp: 9200, speed: 1.35, radius: 1, touch: 175, shot: 104, shotSpeed: 6.8, dash: 11, blast: 2.4, xp: 390, coins: 390, scale: 2.7,
    blurb: 'Charge à travers les hautes herbes, frappe et projette des rochers.',
  },
  fairyQueen: {
    id: 'fairyQueen', name: 'Reine des fées', model: 'q_wizard', height: 3, tint: 0xffb0f0, ai: 'bossKing', boss: true, summon: 'ghost',
    hp: 9400, speed: 1.1, radius: 0.85, touch: 170, shot: 102, shotSpeed: 6, xp: 400, coins: 400, scale: 2.5,
    blurb: 'Spirales de pétales et esprits de la clairière.',
  },
  starWyrm: {
    id: 'starWyrm', name: 'Wyrm astral', model: 'q_dragon_small', height: 3, hover: true, tint: 0xb0c8ff, ai: 'bossCount', boss: true, summon: 'wisp',
    hp: 9600, speed: 1.45, radius: 0.85, touch: 175, shot: 104, shotSpeed: 6.8, xp: 420, coins: 420, scale: 2.5,
    blurb: 'Saute d’île en île en soufflant des éventails d’étoiles.',
  },
  aetherLord: {
    id: 'aetherLord', name: 'Gardien de l’Aether', model: 'q_demon', height: 3.5, tint: 0xd8fffa, ai: 'bossFinal', boss: true, summon: 'vampire', dash: 11.5, blast: 2.5,
    hp: 10500, speed: 1.45, radius: 0.95, touch: 185, shot: 108, shotSpeed: 6.8, xp: 500, coins: 500, scale: 2.8,
    blurb: 'Le cœur de l’Aether lui-même. Toutes les attaques, encore plus vite.',
  },
};
