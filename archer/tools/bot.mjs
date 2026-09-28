// Balance bot: plays chapters with the real simulation.
//   node tools/bot.mjs [runs] [chapter 1..3] [--verbose]
import { Run, STATE } from '../src/sim/run.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const RUNS = Number(args[0] ?? 5);
const CHAPTER = Number(args[1] ?? 1) - 1;
const VERBOSE = process.argv.includes('--verbose');
const DT = 1 / 60;
const PREFER = ['attack', 'front', 'multishot', 'speed', 'crit', 'ricochet', 'diagonal', 'vitality', 'bolt', 'fire', 'heal'];

/** Dodges shots and hazards, keeps away from contact, otherwise stands and shoots. */
function botInput(run) {
  const p = run.player;
  let fx = 0;
  let fz = 0;
  for (const s of run.shots) {
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2) continue;
    // Step sideways from the shot's path.
    const side = Math.sign(dx * s.dz - dz * s.dx) || 1;
    fx += s.dz * side * (2.2 - d);
    fz += -s.dx * side * (2.2 - d);
  }
  for (const h of run.hazards) {
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    const d = Math.hypot(dx, dz) || 0.01;
    if (d < h.radius + 0.5) {
      fx += (dx / d) * 2;
      fz += (dz / d) * 2;
    }
  }
  for (const e of run.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 0.01;
    const safe = e.def.boss ? 3.2 : e.state === 'dash' || e.state === 'aim' ? 2.8 : 2.2;
    if (d < safe) {
      fx += (dx / d) * (safe - d) * 1.5;
      fz += (dz / d) * (safe - d) * 1.5;
    }
  }
  // Fleeing into a corner is death: a pull toward the middle when threatened.
  if (Math.hypot(fx, fz) > 0.3) {
    fx += -p.x * 0.15;
    fz += (-p.z + 2) * 0.1;
  }
  // Room cleared: walk to the door (around obstacles).
  if (run.state === STATE.CLEARED) return walkTo(run, 0, -run.arena.halfH + 0.4);
  const len = Math.hypot(fx, fz);
  if (len < 0.3) {
    // Nothing to dodge: if no monster is in sight, go find one.
    const target = run.pickTarget();
    if (target && !run.arena.lineOfSight(p.x, p.z, target.x, target.z)) return walkTo(run, target.x, target.z);
    return { x: 0, z: 0 };
  }
  return { x: fx / len, z: fz / len };
}

function walkTo(run, x, z) {
  const p = run.player;
  if (Math.hypot(x - p.x, z - p.z) < 1.2) return { x: x - p.x, z: z - p.z };
  const arena = run.arena;
  const saved = arena.flow.slice();
  arena.computeFlow(x, z);
  const dir = arena.flowDirection(p.x, p.z);
  arena.flow.set(saved);
  return dir ? { x: dir.x, z: dir.z } : { x: x - p.x, z: z - p.z };
}

function pick(run) {
  return [...run.choices].sort((a, b) => (PREFER.indexOf(a) + 99) % 99 - (PREFER.indexOf(b) + 99) % 99)[0];
}

export function play(chapter, gear = {}, seed = undefined) {
  const events = { hits: 0, damageTaken: 0 };
  const run = new Run(chapter, gear, {
    onPlayerHit: (d) => { events.hits++; events.damageTaken += d; },
  }, seed);
  run.begin(pick(run));
  let t = 0;
  while (t < 1800 && run.state !== STATE.DEAD && run.state !== STATE.WON) {
    if (run.state === STATE.CHOOSE || run.state === STATE.ANGEL) run.choose(pick(run));
    run.step(DT, botInput(run));
    t += DT;
  }
  if (run.state === STATE.FIGHT && t >= 1800) events.stuck = run.enemies.filter((e) => !e.dead).map((e) => `${e.def.id}@${e.x.toFixed(1)},${e.z.toFixed(1)} ${e.state}`).join(' ') + ` hero@${run.player.x.toFixed(1)},${run.player.z.toFixed(1)} layout ${run.layout.join('|')}`;
  return { state: run.state, room: run.room, level: run.level, coins: Math.round(run.coins), kills: run.kills, time: Math.round(t), hp: Math.round(run.player.hp), ...events, abilities: Object.keys(run.taken).join(',') };
}

if (process.argv[1].endsWith('bot.mjs')) {
  const results = Array.from({ length: RUNS }, (_, i) => play(CHAPTER, {}, 1000 + i));
  for (const r of results) if (VERBOSE) console.log(JSON.stringify(r));
  const won = results.filter((r) => r.state === STATE.WON).length;
  console.log(`chapter ${CHAPTER + 1}: won ${won}/${RUNS}, reached rooms [${results.map((r) => r.room).join(',')}], levels [${results.map((r) => r.level).join(',')}], minutes [${results.map((r) => (r.time / 60).toFixed(1)).join(',')}]`);
}
