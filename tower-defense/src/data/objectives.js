// Kingdom objectives: one at a time, each with a reward. They double as the tutorial
// (the first ones explain the basics in the coach bubble).

const built = (sim, id) => sim.buildings.filter((b) => b.def.id === id).length;
const nightsPassed = (sim) => sim.day - 1;
const ruinsExplored = (sim) => sim.level.cells.filter((c) => c.node?.type === 'ruin' && c.node.amount <= 0).length;
const blessingCount = (sim) => Object.values(sim.blessings ?? {}).reduce((sum, n) => sum + n, 0);

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
    id: 'farm', text: 'Construis une ferme', goal: 1, reward: { wood: 40 },
    hint: 'Onglet Village : chaque ouvrier mange 1 🌾 à l’aube. Sans nourriture, ils ralentissent.',
    progress: (sim) => built(sim, 'farm'),
  },
  {
    id: 'night3', text: 'Survis à la nuit 3', goal: 3, reward: { gems: 5 },
    hint: 'Un deuxième portail s’ouvre la nuit 3 : renforce l’autre côté.',
    progress: nightsPassed,
  },
  {
    id: 'ruin', text: 'Explore une ruine', goal: 1, reward: { gold: 60 },
    hint: 'Les coffres dorés dans les ruines cachent un trésor : touche-en un pour y envoyer un ouvrier.',
    progress: ruinsExplored,
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
    id: 'forge', text: 'Construis la forge', goal: 1, reward: { crystal: 30 },
    hint: 'Onglet Village (après l’Académie) : toutes les tours frappent plus fort.',
    progress: (sim) => built(sim, 'forge'),
  },
  {
    id: 'stone', text: 'Passe 4 murs en pierre', goal: 4, reward: { crystal: 40 },
    hint: 'Touche une palissade puis « En pierre » : bien plus solide.',
    progress: (sim) => sim.buildings.filter((b) => b.def.id === 'wall' && b.level > 0).length,
  },
  {
    id: 'seal', text: 'Scelle un portail', goal: 1, reward: { gold: 100 },
    hint: 'Le jour, touche un portail ouvert : tu peux le fermer pour deux nuits (cristaux + or).',
    progress: (sim) => sim.sealsUsed ?? 0,
  },
  {
    id: 'night7', text: 'Survis à la nuit 7', goal: 7, reward: { gems: 10 },
    hint: 'Trois portails à partir de la nuit 7.',
    progress: nightsPassed,
  },
  {
    id: 'mothership', text: 'Abats un vaisseau amiral', goal: 1, reward: { gems: 10 },
    hint: 'Il arrive toutes les 5 nuits : très résistant, il se protège à mi-vie et largue des mini-ovnis.',
    progress: (sim) => sim.stats.mothershipKills ?? 0,
  },
  {
    id: 'blessings', text: 'Réunis 6 bénédictions', goal: 6, reward: { gems: 8 },
    hint: 'Chaque aube, choisis une bénédiction parmi trois.',
    progress: blessingCount,
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

/** Order of the first version, to map the index an older save kept. */
const LEGACY_ORDER = ['gather', 'tower', 'house', 'night1', 'walls', 'academy', 'research', 'workers', 'night3', 'castle1', 'towers6', 'upgrade', 'depot', 'stone', 'night7', 'citadel', 'night12'];
export const OBJECTIVES_VERSION = 2;

/** Index in the current list for an index saved by the first version. */
export function migrateObjective(index) {
  if (index >= LEGACY_ORDER.length) return OBJECTIVES.length + (index - LEGACY_ORDER.length);
  return OBJECTIVES.findIndex((o) => o.id === LEGACY_ORDER[index]);
}

/** Objective number `index` (after the list: survive 5 more nights, again and again). */
export function objectiveAt(index) {
  if (index < OBJECTIVES.length) return OBJECTIVES[index];
  const night = 12 + (index - OBJECTIVES.length + 1) * 5;
  return { id: `night${night}`, text: `Survis à la nuit ${night}`, goal: night, reward: { gems: 20 }, hint: 'Les nuits sont de plus en plus longues.', progress: nightsPassed };
}

/** Number of objectives that also teach the basics (shown in the coach bubble). */
export const TUTORIAL_OBJECTIVES = 5;
