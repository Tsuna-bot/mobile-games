// Spells: aimed by tapping the map, then on cooldown. Damage scales with the
// current wave so spells stay relevant late in a level.

export const SPELLS = {
  meteor: {
    id: 'meteor',
    name: 'Météore',
    blurb: 'Un rocher en feu écrase une zone.',
    cooldown: 36,
    initialCooldown: 10,
    radius: 1.3,
    damage: 105,
    delay: 0.75,
  },
  blizzard: {
    id: 'blizzard',
    name: 'Blizzard',
    blurb: 'Gèle sur place tous les ennemis de la zone.',
    cooldown: 45,
    initialCooldown: 18,
    radius: 1.6,
    damage: 15,
    freeze: 2.5,
  },
  lightning: {
    id: 'lightning',
    name: 'Foudre',
    blurb: 'Frappe en chaîne les ennemis les plus proches.',
    cooldown: 28,
    initialCooldown: 6,
    radius: 2.4,
    damage: 70,
    targets: 5,
  },
};

export const SPELL_ORDER = ['meteor', 'blizzard', 'lightning'];
