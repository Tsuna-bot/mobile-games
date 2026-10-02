// What each monster looks like in each chapter (the simulation does not change):
// KayKit skeletons and adventurers, Quaternius monsters (q_*, Bestiary imps and puglins b_*). `height` fits the
// model to that many units; `hover` makes it fly above the floor.

const FOREST = {
  zombie: { model: 'q_mushnub', height: 0.8 },
  skeleton: { model: 'q_mushnub_evolved', height: 0.95 },
  orc: { model: 'q_orc', height: 1.45 },
  ghost: { model: 'q_glub', height: 0.8, hover: true },
  wisp: { model: 'q_bee', height: 0.6, hover: true },
  vampire: { model: 'q_bluedemon', height: 1.3 },
  keeper: { model: 'q_wizard', height: 1 },
  bomber: { model: 'q_tribal', height: 1.2 },
};

const DUNGEON = {
  zombie: { model: 'b_puglin_red', height: 1 },
  orc: { model: 'q_orc_skull', height: 1.45 },
  keeper: { model: 'q_wizard', height: 1.05 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true },
  wisp: { model: 'q_bat', height: 0.6, hover: true },
  vampire: { model: 'b_imp_red', height: 1.35 },
};

const GRAVEYARD = {
  ghost: { model: 'q_ghost', height: 1.05, hover: true },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true },
  vampire: { model: 'b_imp_blue', height: 1.35 },
  orc: { model: 'q_orc_skull', height: 1.45 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon' },
};

const MINES = {
  orc: { model: 'q_orc', height: 1.45 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true },
  wisp: { model: 'q_bat', height: 0.6, hover: true },
  vampire: { model: 'q_glub_evolved', height: 1.2, hover: true },
  keeper: { model: 'q_wizard', height: 1.05 },
  blob: { model: 'q_alien_blob', height: 0.95 },
  blobling: { model: 'q_alien_blob', height: 0.5 },
};

const TUNDRA = {
  zombie: { model: 'q_yeti', height: 0.95 },
  orc: { model: 'q_orc_skull', height: 1.45 },
  ghost: { model: 'q_ghost', height: 1.05, hover: true },
  vampire: { model: 'b_imp_blue', height: 1.35 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon' },
};

const SWAMP = {
  zombie: { model: 'q_spiky', height: 0.85 },
  skeleton: { model: 'q_mushnub_evolved', height: 0.95 },
  orc: { model: 'q_orc', height: 1.45 },
  ghost: { model: 'q_glub', height: 0.8, hover: true },
  wisp: { model: 'q_bee_evolved', height: 0.65, hover: true },
  vampire: { model: 'q_squidle', height: 1.2, hover: true },
  keeper: { model: 'q_wizard', height: 1 },
  bomber: { model: 'q_tribal', height: 1.2 },
};

const VOLCANO = {
  zombie: { model: 'b_puglin_red', height: 1 },
  orc: { model: 'q_orc_skull', height: 1.45 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true },
  wisp: { model: 'q_bat', height: 0.6, hover: true },
  vampire: { model: 'b_imp_red', height: 1.35 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon' },
  bomber: { model: 'q_tribal', height: 1.2 },
};

const CITADEL = {
  ghost: { model: 'q_ghost', height: 1.05, hover: true },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true },
  vampire: { model: 'q_ninja', height: 1.2 },
  blob: { model: 'q_pinkblob', height: 0.9 },
  blobling: { model: 'q_pinkblob', height: 0.5 },
};

const DESERT = {
  zombie: { model: 'b_puglin_red', height: 1, tint: 0xffe8c0 },
  orc: { model: 'q_orc_skull', height: 1.45, tint: 0xffe0b0 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true },
  wisp: { model: 'q_bee', height: 0.6, hover: true },
  vampire: { model: 'b_imp_red', height: 1.35, tint: 0xffe0b0 },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0xffe0a0 },
  bomber: { model: 'q_tribal', height: 1.2 },
};

const SAKURA = {
  zombie: { model: 'q_mushnub', height: 0.8, tint: 0xffc8e0 },
  skeleton: { model: 'q_mushnub_evolved', height: 0.95, tint: 0xffd8ec },
  orc: { model: 'q_ninja', height: 1.35 },
  ghost: { model: 'q_glub', height: 0.8, hover: true, tint: 0xffc0e0 },
  wisp: { model: 'q_bee', height: 0.6, hover: true },
  vampire: { model: 'q_bluedemon', height: 1.3, tint: 0xffb8e8 },
  keeper: { model: 'q_wizard', height: 1 },
};

const AUTUMN = {
  zombie: { model: 'b_puglin_green', height: 1, tint: 0xffe0b0 },
  skeleton: { model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', tint: 0xffd8a0 },
  orc: { model: 'q_orc', height: 1.45, tint: 0xffc080 },
  ghost: { model: 'q_ghost', height: 1.05, hover: true, tint: 0xffd8a0 },
  wisp: { model: 'q_bee_evolved', height: 0.65, hover: true },
  vampire: { model: 'b_imp_red', height: 1.35 },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0xffb070 },
  bomber: { model: 'rogue', show: ['Throwable'], aimClip: 'Throw', tint: 0xffa060 },
};

const ABYSS = {
  zombie: { model: 'q_glub', height: 0.85, tint: 0x8affe8 },
  skeleton: { model: 'q_squidle', height: 1, hover: true, tint: 0xffa0c0 },
  orc: { model: 'q_spiky', height: 1.2, tint: 0x8ae0ff },
  ghost: { model: 'q_glub_evolved', height: 1.1, hover: true },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true, tint: 0x9affff },
  vampire: { model: 'q_squidle', height: 1.25, hover: true },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0x8ae8ff },
  blob: { model: 'q_alien_blob', height: 0.95, tint: 0x9affe0 },
  blobling: { model: 'q_alien_blob', height: 0.5, tint: 0x9affe0 },
};

const SKY = {
  zombie: { model: 'q_mushnub', height: 0.8, tint: 0xe8f0ff },
  orc: { model: 'q_orc_skull', height: 1.45, tint: 0xe0e8ff },
  ghost: { model: 'q_ghost', height: 1.05, hover: true },
  wisp: { model: 'q_dragon_small', height: 0.7, hover: true },
  vampire: { model: 'q_bluedemon', height: 1.3, tint: 0xd8e8ff },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0xfff0c0 },
};

const JUNGLE = {
  zombie: { model: 'b_puglin_green', height: 1 },
  skeleton: { model: 'q_mushnub_evolved', height: 0.95, tint: 0xd0ff90 },
  orc: { model: 'q_orc', height: 1.45 },
  ghost: { model: 'q_glub', height: 0.8, hover: true },
  wisp: { model: 'q_bee_evolved', height: 0.65, hover: true },
  vampire: { model: 'q_squidle', height: 1.2, hover: true, tint: 0xd8ff9a },
  keeper: { model: 'q_wizard', height: 1 },
  bomber: { model: 'q_tribal', height: 1.2 },
  blob: { model: 'q_greenblob', height: 0.9 },
  blobling: { model: 'q_greenblob', height: 0.5 },
};

const STORM = {
  zombie: { model: 'q_yeti', height: 0.95, tint: 0xc8d8ff },
  orc: { model: 'q_orc_skull', height: 1.45, tint: 0xa8c8ff },
  ghost: { model: 'q_ghost', height: 1.05, hover: true, tint: 0xc8e0ff },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true },
  vampire: { model: 'b_imp_blue', height: 1.35 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon', tint: 0xa8c8ff },
};

const VOID = {
  zombie: { model: 'q_alien', height: 0.95, tint: 0xc890ff },
  skeleton: { model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', tint: 0xc8a0ff },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true, tint: 0xd0a0ff },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true, tint: 0xd8a0ff },
  vampire: { model: 'q_ninja', height: 1.2, tint: 0xb890ff },
  blob: { model: 'q_pinkblob', height: 0.9 },
  blobling: { model: 'q_pinkblob', height: 0.5 },
};

const GOLDEN = {
  zombie: { model: 'skeleton_minion', tint: 0xffe8a0 },
  orc: { model: 'skeleton_warrior', attach: 'sword_1handed', aimClip: 'Taunt', tint: 0xffe090 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true, tint: 0xfff0b0 },
  wisp: { model: 'q_bee', height: 0.6, hover: true },
  vampire: { model: 'b_imp_red', height: 1.35, tint: 0xfff0c8 },
  bomber: { model: 'q_tribal', height: 1.2, tint: 0xffe0b0 },
};

const CELESTIAL = {
  zombie: { model: 'q_mushnub_evolved', height: 0.95, tint: 0xe8e8ff },
  orc: { model: 'q_orc_skull', height: 1.45, tint: 0xfff4d8 },
  ghost: { model: 'q_ghost', height: 1.05, hover: true, tint: 0xfff4d8 },
  wisp: { model: 'q_dragon_small', height: 0.7, hover: true, tint: 0xfff0c0 },
  vampire: { model: 'q_bluedemon', height: 1.3, tint: 0xfff0e0 },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0xd8d8ff },
  blob: { model: 'q_pinkblob', height: 0.9, tint: 0xfff0ff },
  blobling: { model: 'q_pinkblob', height: 0.5, tint: 0xfff0ff },
};

// Chapters 19 to 30.

const LAGOON = {
  zombie: { model: 'q_glub', height: 0.85, tint: 0xffc0a0 },
  skeleton: { model: 'q_squidle', height: 1, hover: true, tint: 0xffd0e0 },
  orc: { model: 'q_spiky', height: 1.2, tint: 0xffa080 },
  ghost: { model: 'q_glub_evolved', height: 1.1, hover: true, tint: 0xa8f0ff },
  wisp: { model: 'q_bee', height: 0.6, hover: true },
  vampire: { model: 'q_bluedemon', height: 1.3, tint: 0xa8f0ff },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0x9af0ff },
  bomber: { model: 'q_tribal', height: 1.2 },
  blob: { model: 'q_alien_blob', height: 0.95, tint: 0xa0fff0 },
  blobling: { model: 'q_alien_blob', height: 0.5, tint: 0xa0fff0 },
};

const GLOWWOOD = {
  zombie: { model: 'q_mushnub', height: 0.8, tint: 0xa8c8ff },
  skeleton: { model: 'q_mushnub_evolved', height: 0.95, tint: 0x9ae8ff },
  orc: { model: 'q_orc', height: 1.45, tint: 0xa8d8c8 },
  ghost: { model: 'q_ghost', height: 1.05, hover: true, tint: 0xb8fff0 },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true, tint: 0xd8ff9a },
  vampire: { model: 'q_bluedemon', height: 1.3 },
  keeper: { model: 'q_wizard', height: 1, tint: 0x9ae8ff },
  blob: { model: 'q_greenblob', height: 0.9, tint: 0x9affe0 },
  blobling: { model: 'q_greenblob', height: 0.5, tint: 0x9affe0 },
};

const CANYON = {
  zombie: { model: 'b_puglin_red', height: 1 },
  skeleton: { model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', tint: 0xffc8a0 },
  orc: { model: 'q_orc', height: 1.45, tint: 0xffb090 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true, tint: 0xffd0b0 },
  wisp: { model: 'q_bat', height: 0.6, hover: true },
  vampire: { model: 'b_imp_red', height: 1.35 },
  bomber: { model: 'q_tribal', height: 1.2, tint: 0xffc890 },
};

const GLACIER = {
  zombie: { model: 'q_yeti', height: 0.95 },
  orc: { model: 'q_orc_skull', height: 1.45, tint: 0xb8e0ff },
  ghost: { model: 'q_ghost', height: 1.05, hover: true, tint: 0xc8f0ff },
  wisp: { model: 'q_dragon_small', height: 0.7, hover: true, tint: 0xb8f0ff },
  vampire: { model: 'b_imp_blue', height: 1.35 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon', tint: 0xb8e0ff },
};

const JADE = {
  zombie: { model: 'q_mushnub', height: 0.8, tint: 0xc8ffd8 },
  skeleton: { model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', tint: 0xb8ffd0 },
  orc: { model: 'q_ninja', height: 1.35, tint: 0xa8ffc8 },
  ghost: { model: 'q_glub', height: 0.8, hover: true, tint: 0xb8ffd8 },
  wisp: { model: 'q_bee', height: 0.6, hover: true, tint: 0xd0ffb0 },
  vampire: { model: 'q_bluedemon', height: 1.3, tint: 0xa8ffd0 },
  keeper: { model: 'q_wizard', height: 1, tint: 0xa8ffc8 },
};

const NECROPOLIS = {
  zombie: { model: 'skeleton_minion', tint: 0xffb0b0 },
  skeleton: { model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', tint: 0xffa0a8 },
  orc: { model: 'q_orc_skull', height: 1.45, tint: 0xff9aa0 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true, tint: 0xffa0a8 },
  wisp: { model: 'q_bat', height: 0.6, hover: true, tint: 0xff8a8a },
  vampire: { model: 'b_imp_red', height: 1.35 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon', tint: 0xff8a9a },
};

const FORGE = {
  zombie: { model: 'b_puglin_red', height: 1, tint: 0xffb080 },
  orc: { model: 'skeleton_warrior', attach: 'axe_2handed', aimClip: 'Taunt', tint: 0xffa070 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true, tint: 0xffb070 },
  wisp: { model: 'q_bat', height: 0.6, hover: true, tint: 0xffa060 },
  vampire: { model: 'b_imp_red', height: 1.35 },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0xff9a60 },
  bomber: { model: 'rogue', show: ['Throwable'], aimClip: 'Throw', tint: 0xff9a50 },
};

const FUNGAL = {
  zombie: { model: 'q_mushnub', height: 0.8, tint: 0xe0a8ff },
  skeleton: { model: 'q_mushnub_evolved', height: 0.95, tint: 0xffa8e8 },
  orc: { model: 'q_spiky', height: 1.2, tint: 0xd8a0ff },
  ghost: { model: 'q_glub_evolved', height: 1.1, hover: true, tint: 0xf0b0ff },
  wisp: { model: 'q_bee_evolved', height: 0.65, hover: true, tint: 0xffb0f0 },
  vampire: { model: 'q_squidle', height: 1.2, hover: true, tint: 0xe0a0ff },
  keeper: { model: 'q_wizard', height: 1, tint: 0xd8a0ff },
  blob: { model: 'q_pinkblob', height: 0.9 },
  blobling: { model: 'q_pinkblob', height: 0.5 },
};

const STEPPE = {
  zombie: { model: 'b_puglin_green', height: 1, tint: 0xffe0a0 },
  skeleton: { model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', tint: 0xffe0b0 },
  orc: { model: 'q_orc', height: 1.45, tint: 0xffd090 },
  ghost: { model: 'q_ghost', height: 1.05, hover: true, tint: 0xffe8c0 },
  wisp: { model: 'q_bee_evolved', height: 0.65, hover: true },
  vampire: { model: 'q_bluedemon', height: 1.3, tint: 0xffd0a0 },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0xffc070 },
  bomber: { model: 'q_tribal', height: 1.2 },
};

const FAIRY = {
  zombie: { model: 'q_mushnub', height: 0.8, tint: 0xffc0f0 },
  skeleton: { model: 'q_mushnub_evolved', height: 0.95, tint: 0xd8c0ff },
  orc: { model: 'q_ninja', height: 1.35, tint: 0xf0b0ff },
  ghost: { model: 'q_glub', height: 0.8, hover: true, tint: 0xd8c8ff },
  wisp: { model: 'q_bee', height: 0.6, hover: true, tint: 0xffc8f0 },
  vampire: { model: 'q_bluedemon', height: 1.3, tint: 0xffb8f0 },
  keeper: { model: 'q_wizard', height: 1, tint: 0xffb0f0 },
  blob: { model: 'q_pinkblob', height: 0.9 },
  blobling: { model: 'q_pinkblob', height: 0.5 },
};

const ASTRAL = {
  zombie: { model: 'q_alien', height: 0.95, tint: 0xb0c0ff },
  orc: { model: 'q_orc_skull', height: 1.45, tint: 0xc0d0ff },
  ghost: { model: 'q_ghost', height: 1.05, hover: true, tint: 0xc8d8ff },
  wisp: { model: 'q_dragon_small', height: 0.7, hover: true, tint: 0xb8c8ff },
  vampire: { model: 'q_ninja', height: 1.2, tint: 0xa8b8ff },
  keeper: { model: 'q_wizard', height: 1.05, tint: 0xb0c0ff },
  blob: { model: 'q_alien_blob', height: 0.95, tint: 0xc0d0ff },
  blobling: { model: 'q_alien_blob', height: 0.5, tint: 0xc0d0ff },
};

const AETHER = {
  zombie: { model: 'q_alien', height: 0.95, tint: 0x9afff0 },
  skeleton: { model: 'skeleton_rogue', attach: 'crossbow_1handed', aimClip: '1H_Ranged_Shoot', tint: 0xa0fff0 },
  orc: { model: 'skeleton_warrior', attach: 'sword_1handed', aimClip: 'Taunt', tint: 0x9afff0 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true, tint: 0xa8fff4 },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true, tint: 0x9afff0 },
  vampire: { model: 'q_ninja', height: 1.2, tint: 0x8af0e8 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon', tint: 0x9afff0 },
  blob: { model: 'q_alien_blob', height: 0.95, tint: 0x9afff0 },
  blobling: { model: 'q_alien_blob', height: 0.5, tint: 0x9afff0 },
};

const SKINS = {
  forest: FOREST, dungeon: DUNGEON, graveyard: GRAVEYARD, mines: MINES, tundra: TUNDRA, swamp: SWAMP, volcano: VOLCANO, citadel: CITADEL,
  desert: DESERT, sakura: SAKURA, autumn: AUTUMN, abyss: ABYSS, sky: SKY, jungle: JUNGLE, storm: STORM, void: VOID, golden: GOLDEN, celestial: CELESTIAL,
  lagoon: LAGOON, glowwood: GLOWWOOD, canyon: CANYON, glacier: GLACIER, jade: JADE, necropolis: NECROPOLIS, forge: FORGE, fungal: FUNGAL,
  steppe: STEPPE, fairy: FAIRY, astral: ASTRAL, aether: AETHER,
};

/** The look of monster `def` in chapter theme `theme` (falls back on the monster's own). */
export function skinOf(def, theme) {
  const skin = SKINS[theme]?.[def.id];
  if (!skin) return { model: def.model, height: def.height, show: def.show, attach: def.attach, aimClip: def.aimClip, tint: def.tint, hover: Boolean(def.flying || def.hover) };
  return { show: [], attach: null, aimClip: null, tint: null, hover: false, ...skin };
}
