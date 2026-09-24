// Achievements reward gems. `check` reads the lifetime stats kept in the save.

export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'Premier bastion', text: 'Gagner un niveau', reward: 20, check: (s) => s.wins >= 1 },
  { id: 'three_stars', name: 'Sans une égratignure', text: 'Obtenir 3 étoiles sur un niveau', reward: 30, check: (s) => s.bestStars >= 3 },
  { id: 'campaign', name: 'Campagne terminée', text: 'Gagner les 5 niveaux', reward: 100, check: (s) => s.levelsWon >= 5 },
  { id: 'heroic', name: 'Couronné', text: 'Gagner un niveau en Héroïque', reward: 60, check: (s) => s.crowns >= 1 },
  { id: 'kills_500', name: 'Chasseur d’ovnis', text: 'Détruire 500 ovnis', reward: 40, check: (s) => s.kills >= 500 },
  { id: 'kills_3000', name: 'Exterminateur', text: 'Détruire 3 000 ovnis', reward: 100, check: (s) => s.kills >= 3000 },
  { id: 'bosses', name: 'Tueur de géants', text: 'Abattre 10 vaisseaux-mères', reward: 50, check: (s) => s.bossKills >= 10 },
  { id: 'spells', name: 'Archimage', text: 'Lancer 50 sorts', reward: 40, check: (s) => s.spellsCast >= 50 },
  { id: 'maxed', name: 'Ingénieur en chef', text: 'Améliorer une tour au niveau maximum', reward: 20, check: (s) => s.towersMaxed >= 1 },
  { id: 'perfect', name: 'Sans faille', text: 'Réussir 25 vagues parfaites', reward: 40, check: (s) => s.perfectWaves >= 25 },
  { id: 'survivor', name: 'Survivant', text: 'Atteindre la vague 20 en Survie', reward: 60, check: (s) => s.survivalWave >= 20 },
  { id: 'rich', name: 'Trésorier', text: 'Avoir 1 000 or en même temps', reward: 30, check: (s) => s.maxGold >= 1000 },
  { id: 'realm_5', name: 'Seigneur', text: 'Survivre à 5 nuits dans le Royaume', reward: 40, check: (s) => s.realmNights >= 5 },
  { id: 'realm_15', name: 'Roi des nuits', text: 'Survivre à 15 nuits dans le Royaume', reward: 100, check: (s) => s.realmNights >= 15 },
  { id: 'realm_30', name: 'Légende du royaume', text: 'Survivre à 30 nuits dans le Royaume', reward: 200, check: (s) => s.realmNights >= 30 },
];

export const EMPTY_STATS = Object.freeze({
  wins: 0,
  bestStars: 0,
  levelsWon: 0,
  crowns: 0,
  kills: 0,
  bossKills: 0,
  spellsCast: 0,
  towersMaxed: 0,
  perfectWaves: 0,
  survivalWave: 0,
  maxGold: 0,
  realmNights: 0,
});

/** Gems earned at the end of a run (the first clear of a level pays more). */
export function runReward({ victory, stars, firstClear, heroic, endless, wavesCleared }) {
  if (endless) return wavesCleared * 2;
  if (!victory) return Math.min(15, wavesCleared);
  if (heroic) return firstClear ? 80 : 25;
  return firstClear ? 30 + stars * 20 : 10 + stars * 5;
}
