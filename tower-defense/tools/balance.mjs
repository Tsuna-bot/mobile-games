// Headless balance check: a greedy bot plays every level with the real simulation.
// Usage: node tools/balance.mjs [runs] [--perks] [--no-spells] [--leaks] [--survival]
import { LEVELS, SURVIVAL } from '../src/data/levels.js';
import { buildModifiers } from '../src/data/perks.js';
import { SPELLS } from '../src/data/spells.js';
import { TOWERS } from '../src/data/towers.js';
import { SIM_STATE, Simulation } from '../src/sim/simulation.js';

const args = process.argv.slice(2);
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 5);
const usePerks = args.includes('--perks');
const useSpells = !args.includes('--no-spells');
const STEP = 1 / 60;
const PLAN = ['ballista', 'cannon', 'ballista', 'frost', 'upgrade', 'catapult', 'turret', 'upgrade', 'cannon', 'upgrade', 'upgrade', 'ballista', 'catapult', 'upgrade', 'upgrade'];
// A mid-game player: about 12 stars spent.
const MID_PERKS = buildModifiers({ arsenal: 2, treasury: 1, arcana: 1, engineering: 1, ramparts: 1 });

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

function botBuild(sim, bot) {
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

/** Casts each ready spell on the densest cluster of at least 3 enemies. */
function botSpells(sim) {
  const alive = sim.enemies.filter((e) => e.active);
  if (alive.length < 3) return;
  for (const id of Object.keys(SPELLS)) {
    if (!sim.spellReady(id)) continue;
    const r2 = SPELLS[id].radius ** 2;
    let best = null;
    let bestCount = 2;
    for (const e of alive) {
      const count = alive.reduce((n, o) => n + ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 <= r2 ? 1 : 0), 0);
      if (count > bestCount) {
        bestCount = count;
        best = e;
      }
    }
    if (best) sim.castSpell(id, best.x, best.z);
  }
}

export function play(levelDef, levelIndex, { bot = true, perks = false, spells = true, leaks = {}, maxWaves = 60 } = {}) {
  const sim = new Simulation(levelDef, levelIndex, {
    onEnemyLeaked: (e) => {
      const key = `w${e.wave + 1}:${e.def.id}`;
      leaks[key] = (leaks[key] ?? 0) + 1;
    },
  }, { modifiers: perks ? MID_PERKS : undefined });
  const state = { step: 0 };
  if (bot) botBuild(sim, state);
  sim.callNextWave();
  let frame = 0;
  while (!sim.over && sim.time < 7200 && sim.nextWave <= maxWaves) {
    if (bot) {
      botBuild(sim, state);
      if (spells && frame++ % 15 === 0) botSpells(sim);
    }
    sim.step(STEP);
  }
  return { won: sim.state === SIM_STATE.WON, lives: sim.lives, wave: sim.nextWave, time: sim.time, stars: sim.stars };
}

const label = `${usePerks ? 'with mid perks' : 'no perks'}, ${useSpells ? 'spells' : 'no spells'}`;
console.log(`— ${runs} runs per level (${label})`);
LEVELS.forEach((level, i) => {
  const results = Array.from({ length: runs }, () => play(level, i, { perks: usePerks, spells: useSpells }));
  const wins = results.filter((r) => r.won).length;
  const lives = results.map((r) => r.lives).join(',');
  const stars = results.map((r) => r.stars).join('');
  const minutes = (results.reduce((s, r) => s + r.time, 0) / runs / 60).toFixed(1);
  const idle = play(level, i, { bot: false });
  console.log(`${String(i + 1).padStart(2)}. ${level.name.padEnd(20)} wins ${wins}/${runs}  lives [${lives}]  stars ${stars}  ~${minutes} min  | idle lost at wave ${idle.wave}`);
});

if (args.includes('--survival')) {
  const waves = Array.from({ length: runs }, () => play(SURVIVAL, SURVIVAL.unlockAfter, { perks: usePerks, spells: useSpells }).wave);
  console.log(`Survie: bot reached waves [${waves.join(',')}]`);
}

if (args.includes('--leaks')) {
  LEVELS.forEach((level, i) => {
    const leaks = {};
    play(level, i, { perks: usePerks, spells: useSpells, leaks });
    console.log(level.name, JSON.stringify(leaks));
  });
}
