// Kingdom objectives: one at a time, each with a reward. They double as the tutorial
// (the first ones explain the basics in the coach bubble).

const built = (sim, id) => sim.buildings.filter((b) => b.def.id === id).length;
const nightsPassed = (sim) => sim.day - 1;

export const OBJECTIVES = [
  {
    id: 'gather', text: 'Envoie un ouvrier couper un arbre', goal: 1, reward: { wood: 25 },
    hint: 'Touche un arbre : un ouvrier part le couper et rapporte le bois au château.',
    progress: (sim, flags) => (flags.sent ? 1 : 0),
  },
  {
    id: 'tower', text: 'Construis une tour de défense', goal: 1, reward: { gold: 40 },
    hint: 'Touche une case d’herbe libre, choisis une tour et confirme : un ouvrier vient la bâtir.',
    progress: (sim) => sim.towers.length,
  },
  {
    id: 'house', text: 'Construis une maison', goal: 1, reward: { wood: 40 },
    hint: 'Onglet Village : chaque maison loge un nouvel ouvrier.',
    progress: (sim) => built(sim, 'house'),
  },
  {
    id: 'night1', text: 'Survis à la première nuit', goal: 1, reward: { gold: 60 },
    hint: 'Quand tu es prêt, lance la nuit : les ovnis sortent du portail et foncent sur le château.',
    progress: nightsPassed,
  },
  {
    id: 'walls', text: 'Pose 6 palissades', goal: 6, reward: { stone: 40 },
    hint: 'Les murs détournent les ovnis vers tes tours. Glisse le doigt pour en tracer plusieurs.',
    progress: (sim) => built(sim, 'wall'),
  },
  {
    id: 'academy', text: 'Construis l’Académie', goal: 1, reward: { crystal: 30 },
    hint: 'Onglet Village : l’Académie débloque de nouvelles tours et des sorts.',
    progress: (sim) => (sim.hasAcademy() ? 1 : 0),
  },
  {
    id: 'research', text: 'Termine une recherche', goal: 1, reward: { gold: 80 },
    hint: 'Touche le bouton Recherche ou l’Académie.',
    progress: (sim) => Object.values(sim.research).filter((level) => level > 0).length,
  },
  {
    id: 'workers', text: 'Aie 6 ouvriers', goal: 6, reward: { wood: 60, stone: 30 },
    hint: 'Construis et améliore des maisons.',
    progress: (sim) => sim.workers.length,
  },
  {
    id: 'night3', text: 'Survis à la nuit 3', goal: 3, reward: { gems: 5 },
    hint: 'Un deuxième portail s’ouvre la nuit 3 : renforce l’autre côté.',
    progress: nightsPassed,
  },
  {
    id: 'castle1', text: 'Agrandis le château', goal: 1, reward: { gold: 120 },
    hint: 'Touche le château : plus de vie, de stockage et un ouvrier de plus.',
    progress: (sim) => Math.min(1, sim.castle.level),
  },
  {
    id: 'towers6', text: 'Défends-toi avec 6 tours', goal: 6, reward: { crystal: 40 },
    hint: 'Place-les le long du chemin des ovnis (les flèches en mode construction).',
    progress: (sim) => sim.towers.length,
  },
  {
    id: 'upgrade', text: 'Améliore une tour au niveau 3', goal: 3, reward: { gold: 150 },
    hint: 'Touche une tour, puis Améliorer.',
    progress: (sim) => Math.max(0, ...sim.towers.map((t) => t.level + 1)),
  },
  {
    id: 'depot', text: 'Construis un dépôt', goal: 1, reward: { stone: 60 },
    hint: 'Il agrandit le stock et raccourcit les trajets des ouvriers.',
    progress: (sim) => built(sim, 'depot'),
  },
  {
    id: 'stone', text: 'Passe 4 murs en pierre', goal: 4, reward: { crystal: 40 },
    hint: 'Touche une palissade puis « En pierre » : bien plus solide.',
    progress: (sim) => sim.buildings.filter((b) => b.def.id === 'wall' && b.level > 0).length,
  },
  {
    id: 'night7', text: 'Survis à la nuit 7', goal: 7, reward: { gems: 10 },
    hint: 'Trois portails à partir de la nuit 7.',
    progress: nightsPassed,
  },
  {
    id: 'citadel', text: 'Bâtis la Citadelle', goal: 2, reward: { gems: 15 },
    hint: 'Le dernier niveau du château.',
    progress: (sim) => sim.castle.level,
  },
  {
    id: 'night12', text: 'Survis à la nuit 12', goal: 12, reward: { gems: 20 },
    hint: 'Quatre portails à partir de la nuit 12.',
    progress: nightsPassed,
  },
];

/** Objective number `index` (after the list: survive 5 more nights, again and again). */
export function objectiveAt(index) {
  if (index < OBJECTIVES.length) return OBJECTIVES[index];
  const night = 12 + (index - OBJECTIVES.length + 1) * 5;
  return { id: `night${night}`, text: `Survis à la nuit ${night}`, goal: night, reward: { gems: 20 }, hint: 'Les nuits sont de plus en plus longues.', progress: nightsPassed };
}

/** Number of objectives that also teach the basics (shown in the coach bubble). */
export const TUTORIAL_OBJECTIVES = 5;
