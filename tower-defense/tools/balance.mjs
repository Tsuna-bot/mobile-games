// Headless balance check: a greedy bot plays every level with the real simulation.
// Usage: node tools/balance.mjs [runs]
import { LEVELS } from '../src/data/levels.js';
import { TOWERS } from '../src/data/towers.js';
import { SIM_STATE, Simulation } from '../src/sim/simulation.js';

const runs = Number(process.argv[2] ?? 5);
const STEP = 1 / 60;
const PLAN = ['ballista', 'cannon', 'ballista', 'frost', 'upgrade', 'catapult', 'turret', 'upgrade', 'cannon', 'upgrade', 'upgrade', 'ballista', 'catapult', 'upgrade', 'upgrade'];

function coverage(sim, cell, range) {
  const { routeX, routeZ } = sim.level;
  let score = 0;
  for (let i = 0; i < routeX.length; i++) {
    if ((routeX[i] - cell.x) ** 2 + (routeZ[i] - cell.z) ** 2 <= range * range) score++;
  }
  return score;
}

function bestCell(sim, range) {
  let best = null;
  let bestScore = -1;
  for (const cell of sim.level.cells) {
    if (!sim.canBuild(cell)) continue;
    const score = coverage(sim, cell, range);
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best;
}

function botAct(sim, bot) {
  for (let guard = 0; guard < 4; guard++) {
    const action = PLAN[bot.step % PLAN.length];
    if (action === 'upgrade') {
      const candidate = sim.towers.filter((t) => !t.maxed).sort((a, b) => a.upgradeCost - b.upgradeCost)[0];
      if (!candidate) { bot.step++; continue; }
      if (!sim.upgrade(candidate)) return;
    } else {
      const def = TOWERS[action];
      if (sim.gold < def.cost) return;
      const cell = bestCell(sim, def.levels[0].range);
      if (!cell) { bot.step++; continue; }
      sim.build(action, cell);
    }
    bot.step++;
  }
}

function play(levelIndex, withBot = true, leaks = {}) {
  const sim = new Simulation(LEVELS[levelIndex], levelIndex, { onEnemyLeaked: (e) => { const k = `w${e.wave + 1}:${e.def.id}`; leaks[k] = (leaks[k] ?? 0) + 1; } });
  const bot = { step: 0 };
  if (withBot) botAct(sim, bot);
  sim.callNextWave();
  let lastWave = 0;
  while (!sim.over && sim.time < 3600) {
    if (withBot) botAct(sim, bot);
    sim.step(STEP);
    lastWave = sim.nextWave;
  }
  return { won: sim.state === SIM_STATE.WON, lives: sim.lives, wave: lastWave, time: sim.time, towers: sim.towers.length, gold: sim.gold, stars: sim.stars };
}

for (let i = 0; i < LEVELS.length; i++) {
  const results = Array.from({ length: runs }, () => play(i));
  const idle = play(i, false);
  const wins = results.filter((r) => r.won).length;
  const lives = results.map((r) => r.lives).join(',');
  const waves = results.map((r) => r.wave).join(',');
  const minutes = (results.reduce((s, r) => s + r.time, 0) / runs / 60).toFixed(1);
  console.log(`${LEVELS[i].name.padEnd(18)} bot wins ${wins}/${runs}  lives [${lives}]  reached waves [${waves}]  ~${minutes} min  | no towers: lost at wave ${idle.wave}`);
}

if (process.argv.includes('--leaks')) {
  for (let i = 0; i < LEVELS.length; i++) {
    const leaks = {};
    play(i, true, leaks);
    console.log(LEVELS[i].name, JSON.stringify(leaks));
  }
}
