// Kingdom balance check: a greedy bot plays the real RealmSim for N nights.
//   node tools/realm-bot.mjs [runs] [nights]
// It gathers, builds houses and an academy, researches, puts towers along the
// enemy path and walls around the castle, then reports when the castle first fell.

import { RESEARCH } from '../src/data/realm.js';
import { TOWERS } from '../src/data/towers.js';
import { PHASE, RealmSim } from '../src/sim/realm.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const RUNS = Number(args[0] ?? 4);
const NIGHTS = Number(args[1] ?? 20);
const VERBOSE = process.argv.includes('--verbose');
const DT = 1 / 30;
const RESEARCH_PLAN = ['tower-cannon', 'ballistics', 'tower-frost', 'tools', 'tower-poison', 'bags', 'ballistics', 'spell-blizzard', 'tower-flame', 'optics', 'masonry',
  'ballistics', 'tower-tesla', 'arcana', 'tower-mortar', 'ballistics', 'tower-laser', 'optics', 'bastion', 'spell-lightning', 'engineering', 'focus', 'ballistics', 'arcana'];
const TOWER_PREFERENCE = ['laser', 'mortar', 'tesla', 'flame', 'poison', 'cannon', 'frost', 'ballista'];

function pathCells(sim) {
  const cells = new Set();
  for (const portal of sim.activePortals()) {
    let cell = portal;
    for (let guard = 0; guard < 200 && cell && !cell.castle; guard++) {
      cells.add(cell);
      cell = sim.nextStep(cell);
    }
  }
  return [...cells];
}

function bestTowerCell(sim, range) {
  const path = pathCells(sim);
  let best = null;
  let bestScore = 0;
  for (const cell of sim.level.cells) {
    if (!sim.canPlace(cell) || path.includes(cell)) continue;
    const d = sim.level.distanceToCastle(cell);
    if (d > 9) continue;
    let covered = 0;
    for (const p of path) if ((p.x - cell.x) ** 2 + (p.z - cell.z) ** 2 <= range * range) covered++;
    const score = covered - d * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best;
}

function freeCellNear(sim, maxD) {
  const base = sim.level.base;
  return sim.level.cells
    .filter((c) => sim.canPlace(c) && sim.level.distanceToCastle(c) >= 2.5 && sim.level.distanceToCastle(c) <= maxD && !pathCells(sim).includes(c))
    .sort((a, b) => Math.hypot(a.x - base.x, a.z - base.z) - Math.hypot(b.x - base.x, b.z - base.z))[0];
}

function decide(sim) {
  const counts = sim.jobCounts();
  // Jobs: mostly wood early, stone next, crystal once the academy stands.
  const want = sim.hasAcademy() ? { wood: 0.4, stone: 0.35, crystal: 0.25 } : { wood: 0.6, stone: 0.4, crystal: 0 };
  const total = sim.workers.length;
  for (const resource of ['wood', 'stone', 'crystal']) {
    while (counts.idle > 0 && counts[resource] < Math.round(total * want[resource])) {
      sim.setJob(resource, 1);
      counts[resource]++;
      counts.idle--;
    }
  }
  if (counts.idle > 0) sim.setJob('wood', 1);

  const houses = sim.buildings.filter((b) => b.def.id === 'house').length;
  const depots = sim.buildings.filter((b) => b.def.id === 'depot').length;
  if (sim.day >= 2 && !sim.hasAcademy() && sim.canAfford(sim.buildCost('academy'))) sim.placeBuilding('academy', freeCellNear(sim, 5));
  // Save up for the academy on day 2.
  if (sim.day >= 2 && !sim.hasAcademy()) return;
  if (houses < Math.min(6, 1 + sim.day) && sim.canAfford(sim.buildCost('house'))) sim.placeBuilding('house', freeCellNear(sim, 6));
  if (depots < 1 && sim.day >= 3 && sim.canAfford(sim.buildCost('depot'))) sim.placeBuilding('depot', freeCellNear(sim, 6));
  if (sim.day >= 4) for (const house of sim.buildings.filter((b) => b.def.id === 'house')) sim.upgradeBuilding(house);

  if (sim.hasAcademy()) {
    for (const id of RESEARCH_PLAN) {
      const item = RESEARCH.find((r) => r.id === id);
      if (sim.researchLevel(id) >= item.costs.length) continue;
      if (sim.canResearch(item)) sim.doResearch(id);
      break;
    }
  }

  // Towers: the best unlocked kind the stock allows, along the path.
  const unlocked = sim.unlockedTowers;
  for (let k = 0; k < 3; k++) {
    const id = TOWER_PREFERENCE.find((t) => unlocked.includes(t) && sim.canAfford(sim.buildCost(t)));
    if (!id) break;
    const cell = bestTowerCell(sim, TOWERS[id].levels[0].range * sim.modifiers.range);
    if (!cell || !sim.build(id, cell)) break;
  }
  // Upgrades only with spare gold: research comes first.
  for (const tower of [...sim.towers].sort((a, b) => a.level - b.level)) {
    const cost = sim.towerUpgradeCost(tower);
    if (cost && sim.gold - (cost.gold ?? 0) > 150 && sim.canAfford(cost)) sim.upgrade(tower);
  }
}

function castSpells(sim) {
  const alive = sim.enemies.filter((e) => e.active);
  if (alive.length < 3) return;
  for (const id of Object.keys(sim.spells)) {
    if (!sim.spellReady(id)) continue;
    const target = alive.sort((a, b) => b.distance - a.distance)[Math.min(2, alive.length - 1)];
    sim.castSpell(id, target.x, target.z);
  }
}

function play(seed) {
  const falls = [];
  const sim = new RealmSim(null, {
    onCastleFallen: () => falls.push(sim.day),
  }, { seed });
  let timer = 0;
  while (sim.day <= NIGHTS) {
    sim.step(DT);
    timer += DT;
    if (timer >= 1) {
      timer = 0;
      if (sim.phase === PHASE.DAY) decide(sim);
      else castSpells(sim);
    }
  }
  return { falls, sim };
}

console.log(`— ${RUNS} kingdoms × ${NIGHTS} nights`);
for (let run = 0; run < RUNS; run++) {
  const t0 = Date.now();
  const { falls, sim } = play(1000 + run * 7919);
  const towers = {};
  for (const t of sim.towers) towers[t.def.id] = (towers[t.def.id] ?? 0) + 1;
  console.log(`seed ${1000 + run * 7919}: first fall ${falls[0] ?? '—'}, falls [${falls.join(',')}], workers ${sim.workers.length}, towers ${sim.towers.length} ${JSON.stringify(towers)}, research ${Object.keys(sim.research).length}, gathered ${sim.stats.gathered}, kills ${sim.stats.kills} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (VERBOSE) console.log('  stock', sim.stock, 'gold', sim.gold, 'lives', sim.lives);
}
