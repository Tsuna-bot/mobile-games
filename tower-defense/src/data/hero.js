// The knight: one hero per game, moved by tapping the map. He fights UFOs in reach,
// takes damage from the ones around him, levels up from his kills and has one power.

export const HERO = {
  name: 'Chevalier',
  speed: 2.4,
  range: 1.15,
  rate: 0.65,
  damage: 20,
  hp: 260,
  regen: 0.04,
  respawn: 12,
  // XP needed to reach each level (index = level - 1).
  levels: [0, 80, 200, 380, 620, 950, 1400],
  power: {
    name: 'Frappe tournoyante',
    blurb: 'Gros dégâts autour du chevalier et assomme les ovnis 1,5 s.',
    cooldown: 24,
    radius: 1.9,
    damage: 6,
    stun: 1.5,
  },
};

export const HERO_MAX_LEVEL = HERO.levels.length;

/** Stats of the knight at `level` (1-based); `threat` scales with the current wave. */
export function heroStats(level, threat = 1) {
  const scale = 0.65 + 0.35 * threat;
  return {
    damage: HERO.damage * (1 + 0.28 * (level - 1)) * scale,
    maxHp: Math.round(HERO.hp * (1 + 0.2 * (level - 1)) * Math.sqrt(scale)),
    range: HERO.range + 0.05 * (level - 1),
    rate: HERO.rate * (1 - 0.03 * (level - 1)),
  };
}
