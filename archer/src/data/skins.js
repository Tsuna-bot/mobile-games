// What each monster looks like in each chapter (the simulation does not change):
// KayKit skeletons and adventurers, Quaternius monsters (q_*). `height` fits the
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
  orc: { model: 'q_orc_skull', height: 1.45 },
  keeper: { model: 'q_wizard', height: 1.05 },
  ghost: { model: 'q_ghost_skull', height: 1, hover: true },
  wisp: { model: 'q_bat', height: 0.6, hover: true },
  vampire: { model: 'q_demon', height: 1.3 },
};

const GRAVEYARD = {
  ghost: { model: 'q_ghost', height: 1.05, hover: true },
  wisp: { model: 'q_hywirl', height: 0.6, hover: true },
  vampire: { model: 'q_demon', height: 1.3 },
  orc: { model: 'q_orc_skull', height: 1.45 },
  keeper: { model: 'skeleton_mage', attach: 'staff', aimClip: 'Spellcast_Summon' },
};

const SKINS = { forest: FOREST, dungeon: DUNGEON, graveyard: GRAVEYARD };

/** The look of monster `def` in chapter theme `theme` (falls back on the monster's own). */
export function skinOf(def, theme) {
  const skin = SKINS[theme]?.[def.id];
  if (!skin) return { model: def.model, height: def.height, show: def.show, attach: def.attach, aimClip: def.aimClip, tint: def.tint, hover: Boolean(def.flying || def.hover) };
  return { show: [], attach: null, aimClip: null, tint: null, hover: false, ...skin };
}
