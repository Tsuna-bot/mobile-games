// Monster behaviours. Each attack is telegraphed first (aim line, circle on the
// ground, wind-up) so the player can read it and dodge. `dt` is already slowed by
// frost; `realDt` is not (used for projectile patterns that must stay regular).

import { ENEMIES } from '../data/enemies.js';

const KEEP_DISTANCE = 4;

function toPlayer(run, enemy) {
  const p = run.player;
  const dx = p.x - enemy.x;
  const dz = p.z - enemy.z;
  const d = Math.hypot(dx, dz) || 1;
  return { dx: dx / d, dz: dz / d, d };
}

/** Walks toward the hero (around obstacles unless flying). */
function approach(run, enemy, dt, speed = enemy.def.speed, away = false) {
  const p = run.player;
  let dir;
  if (enemy.def.flying) dir = toPlayer(run, enemy);
  else {
    const flow = run.arena.flowDirection(enemy.x, enemy.z);
    dir = flow ? { dx: flow.x, dz: flow.z } : toPlayer(run, enemy);
    // In the hero's cell or next to it: straight at them.
    if (Math.hypot(p.x - enemy.x, p.z - enemy.z) < 1.2) dir = toPlayer(run, enemy);
  }
  const sign = away ? -1 : 1;
  enemy.dirX = dir.dx * sign;
  enemy.dirZ = dir.dz * sign;
  run.arena.move(enemy, enemy.dirX * speed * dt, enemy.dirZ * speed * dt, enemy.def.flying);
  enemy.moving = true;
}

/** Keeps shooters at a comfortable distance, strafing a little. */
function hover(run, enemy, dt) {
  const { d } = toPlayer(run, enemy);
  if (d > KEEP_DISTANCE + 1) approach(run, enemy, dt);
  else if (d < KEEP_DISTANCE - 1) approach(run, enemy, dt, enemy.def.speed * 0.8, true);
  else {
    enemy.strafe = enemy.strafe ?? (run.random() < 0.5 ? 1 : -1);
    const t = toPlayer(run, enemy);
    const moved = run.arena.move(enemy, -t.dz * enemy.strafe * enemy.def.speed * 0.6 * dt, t.dx * enemy.strafe * enemy.def.speed * 0.6 * dt);
    if (moved) enemy.strafe *= -1;
    enemy.dirX = t.dx;
    enemy.dirZ = t.dz;
    enemy.moving = true;
  }
}

function lockAim(run, enemy) {
  const t = toPlayer(run, enemy);
  enemy.aimX = t.dx;
  enemy.aimZ = t.dz;
  enemy.dirX = t.dx;
  enemy.dirZ = t.dz;
}

function fan(run, enemy, count, spread, speed, damage, kind = 'orb') {
  const base = Math.atan2(enemy.aimX, enemy.aimZ);
  for (let i = 0; i < count; i++) {
    const a = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
    run.fire(enemy, Math.sin(a), Math.cos(a), speed, damage, kind);
  }
}

function ring(run, enemy, count, speed, damage, offset = 0) {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    run.fire(enemy, Math.sin(a), Math.cos(a), speed, damage, 'orb');
  }
}

/** Teleports to a free spot away from the hero. */
function blink(run, enemy, rowMax = 9) {
  const cells = run.arena.freeCells(1, rowMax).map((i) => run.arena.centerOf(i)).filter((c) => Math.hypot(c.x - run.player.x, c.z - run.player.z) > 3.5);
  if (!cells.length) return;
  const to = cells[Math.floor(run.random() * cells.length)];
  run.listener.onBlink?.(enemy, enemy.x, enemy.z, to.x, to.z);
  enemy.x = to.x;
  enemy.z = to.z;
}

const AI = {
  chase(run, enemy, dt) {
    approach(run, enemy, dt);
  },

  float(run, enemy, dt) {
    // Wobbles a little so a group does not stack into one.
    enemy.step += dt;
    const t = toPlayer(run, enemy);
    const wob = Math.sin(enemy.step * 3 + enemy.id) * 0.5;
    enemy.dirX = t.dx - t.dz * wob;
    enemy.dirZ = t.dz + t.dx * wob;
    const len = Math.hypot(enemy.dirX, enemy.dirZ);
    enemy.dirX /= len;
    enemy.dirZ /= len;
    run.arena.move(enemy, enemy.dirX * enemy.def.speed * dt, enemy.dirZ * enemy.def.speed * dt, true);
    enemy.moving = true;
  },

  // Aim (a line shows where), then one straight shot.
  shooter(run, enemy, dt) {
    const def = enemy.def;
    enemy.timer -= dt;
    if (enemy.state === 'aim') {
      if (enemy.timer > 0) return;
      run.fire(enemy, enemy.aimX, enemy.aimZ, def.shotSpeed, def.shot, 'arrow');
      enemy.state = 'move';
      enemy.timer = def.cooldown * (0.8 + run.random() * 0.4);
      return;
    }
    hover(run, enemy, dt);
    if (enemy.timer <= 0 && run.arena.lineOfSight(enemy.x, enemy.z, run.player.x, run.player.z)) {
      enemy.state = 'aim';
      enemy.timer = def.aim;
      enemy.moving = false;
      lockAim(run, enemy);
      run.listener.onTelegraph?.(enemy, 'line', def.aim);
    }
  },

  // Wind-up in place, then a straight dash until a wall.
  charger(run, enemy, dt) {
    const def = enemy.def;
    enemy.timer -= dt;
    if (enemy.state === 'aim') {
      enemy.moving = false;
      if (enemy.timer > 0) return;
      enemy.state = 'dash';
      enemy.timer = 1.1;
      run.listener.onDash?.(enemy);
      return;
    }
    if (enemy.state === 'dash') {
      const hit = run.arena.move(enemy, enemy.aimX * def.dash * dt, enemy.aimZ * def.dash * dt);
      enemy.moving = true;
      if (hit || enemy.timer <= 0) {
        enemy.state = 'rest';
        enemy.timer = 0.7;
        if (hit) run.listener.onBump?.(enemy);
      }
      return;
    }
    if (enemy.state === 'rest') {
      enemy.moving = false;
      if (enemy.timer <= 0) {
        enemy.state = 'move';
        enemy.timer = def.cooldown * (0.7 + run.random() * 0.6);
      }
      return;
    }
    approach(run, enemy, dt, def.speed);
    if (enemy.timer <= 0 && run.arena.lineOfSight(enemy.x, enemy.z, run.player.x, run.player.z)) {
      enemy.state = 'aim';
      enemy.timer = def.aim;
      lockAim(run, enemy);
      run.listener.onTelegraph?.(enemy, 'dash', def.aim);
    }
  },

  // Fan of orbs, then sometimes a teleport.
  spread(run, enemy, dt) {
    const def = enemy.def;
    enemy.timer -= dt;
    if (enemy.state === 'aim') {
      enemy.moving = false;
      if (enemy.timer > 0) return;
      fan(run, enemy, def.spread, 0.7, def.shotSpeed, def.shot);
      enemy.state = 'move';
      enemy.timer = def.cooldown * (0.8 + run.random() * 0.4);
      if (run.random() < 0.4) blink(run, enemy);
      return;
    }
    hover(run, enemy, dt);
    if (enemy.timer <= 0) {
      enemy.state = 'aim';
      enemy.timer = def.aim;
      lockAim(run, enemy);
      run.listener.onTelegraph?.(enemy, 'glow', def.aim);
    }
  },

  // Slow orbs in every direction.
  ring(run, enemy, dt) {
    const def = enemy.def;
    enemy.timer -= dt;
    if (enemy.state === 'aim') {
      enemy.moving = false;
      if (enemy.timer > 0) return;
      ring(run, enemy, def.ring, def.shotSpeed, def.shot, run.random() * Math.PI);
      enemy.state = 'move';
      enemy.timer = def.cooldown;
      return;
    }
    if (toPlayer(run, enemy).d > 3) approach(run, enemy, dt);
    else enemy.moving = false;
    if (enemy.timer <= 0) {
      enemy.state = 'aim';
      enemy.timer = def.aim;
      run.listener.onTelegraph?.(enemy, 'glow', def.aim);
    }
  },

  // Bombs land where the hero stands: a red circle shows the blast.
  bomber(run, enemy, dt) {
    const def = enemy.def;
    enemy.timer -= dt;
    hover(run, enemy, dt);
    if (enemy.timer > 0) return;
    enemy.timer = def.cooldown * (0.8 + run.random() * 0.4);
    const p = run.player;
    lockAim(run, enemy);
    run.listener.onThrow?.(enemy, p.x, p.z, def.fuse);
    run.hazard(p.x, p.z, def.blast, def.fuse, def.shot * enemy.power, 'bomb');
  },

  // ---------------------------------------------------------------- bosses

  bossOgre(run, enemy, dt) {
    const def = enemy.def;
    const rage = enemy.hp < enemy.maxHp * 0.5;
    enemy.timer -= dt;
    switch (enemy.state) {
      case 'aim':
        enemy.moving = false;
        if (enemy.timer > 0) return;
        enemy.state = 'dash';
        enemy.timer = 1.2;
        run.listener.onDash?.(enemy);
        return;
      case 'dash': {
        const hit = run.arena.move(enemy, enemy.aimX * def.dash * (rage ? 1.2 : 1) * dt, enemy.aimZ * def.dash * (rage ? 1.2 : 1) * dt);
        enemy.moving = true;
        if (hit || enemy.timer <= 0) {
          if (hit) {
            run.listener.onBump?.(enemy);
            // Rocks fly from the impact.
            enemy.aimX = -enemy.aimX;
            enemy.aimZ = -enemy.aimZ;
            fan(run, enemy, rage ? 5 : 3, 1.2, def.shotSpeed, def.shot, 'rock');
          }
          enemy.state = 'wait';
          enemy.timer = rage ? 0.5 : 0.8;
        }
        return;
      }
      case 'slam':
        enemy.moving = false;
        if (enemy.timer <= 0) {
          enemy.state = 'wait';
          enemy.timer = 0.6;
        }
        return;
      case 'wait':
        enemy.moving = false;
        if (enemy.timer <= 0) {
          enemy.state = 'walk';
          enemy.timer = rage ? 0.8 : 1.3;
        }
        return;
      default: {
        approach(run, enemy, dt, def.speed);
        if (enemy.timer > 0) return;
        const pattern = ['charge', 'charge', 'slam', 'rocks'][enemy.phase++ % 4];
        if (pattern === 'charge') {
          enemy.state = 'aim';
          enemy.timer = rage ? 0.6 : 0.85;
          lockAim(run, enemy);
          run.listener.onTelegraph?.(enemy, 'dash', enemy.timer);
        } else if (pattern === 'slam') {
          enemy.state = 'slam';
          enemy.timer = 1.1;
          run.hazard(enemy.x, enemy.z, def.blast * (rage ? 1.35 : 1.15), 0.95, def.shot * 1.6 * enemy.power, 'slam');
          run.listener.onTelegraph?.(enemy, 'slam', 0.95);
        } else {
          const p = run.player;
          const count = rage ? 5 : 3;
          for (let i = 0; i < count; i++) {
            const x = p.x + (i ? (run.random() - 0.5) * 3 : 0);
            const z = p.z + (i ? (run.random() - 0.5) * 3 : 0);
            run.hazard(x, z, 1, 1.1 + i * 0.12, def.shot * enemy.power, 'rock');
          }
          run.listener.onThrow?.(enemy, p.x, p.z, 1.1);
          enemy.state = 'wait';
          enemy.timer = 0.9;
        }
      }
    }
  },

  bossKing(run, enemy, dt, realDt) {
    const def = enemy.def;
    const rage = enemy.hp < enemy.maxHp * 0.5;
    enemy.timer -= dt;
    if (enemy.state === 'spiral') {
      enemy.moving = false;
      enemy.spin = (enemy.spin ?? 0) + realDt * (rage ? 2.6 : 2);
      enemy.shotTimer = (enemy.shotTimer ?? 0) - realDt;
      if (enemy.shotTimer <= 0) {
        enemy.shotTimer = rage ? 0.1 : 0.14;
        const arms = rage ? 3 : 2;
        for (let i = 0; i < arms; i++) {
          const a = enemy.spin + (i / arms) * Math.PI * 2;
          run.fire(enemy, Math.sin(a), Math.cos(a), def.shotSpeed, def.shot, 'bone');
        }
      }
      if (enemy.timer <= 0) {
        enemy.state = 'walk';
        enemy.timer = 1.2;
      }
      return;
    }
    if (enemy.state === 'burst') {
      enemy.moving = false;
      if (enemy.timer > 0) return;
      enemy.bursts = (enemy.bursts ?? 0) - 1;
      lockAim(run, enemy);
      fan(run, enemy, 3, 0.35, def.shotSpeed * 1.3, def.shot, 'bone');
      if (enemy.bursts > 0) enemy.timer = 0.35;
      else {
        enemy.state = 'walk';
        enemy.timer = 1;
      }
      return;
    }
    if (enemy.state === 'aim') {
      enemy.moving = false;
      if (enemy.timer > 0) return;
      ring(run, enemy, 16, def.shotSpeed * 0.8, def.shot, enemy.phase * 0.2);
      if (rage) ring(run, enemy, 16, def.shotSpeed * 0.55, def.shot, enemy.phase * 0.2 + Math.PI / 16);
      enemy.state = 'walk';
      enemy.timer = 1;
      return;
    }
    if (toPlayer(run, enemy).d > 3.5) approach(run, enemy, dt);
    else enemy.moving = false;
    if (enemy.timer > 0) return;
    const pattern = ['spiral', 'ring', 'summon', 'burst'][enemy.phase++ % 4];
    if (pattern === 'spiral') {
      enemy.state = 'spiral';
      enemy.timer = 3;
      run.listener.onTelegraph?.(enemy, 'glow', 0.4);
    } else if (pattern === 'ring') {
      enemy.state = 'aim';
      enemy.timer = 0.7;
      run.listener.onTelegraph?.(enemy, 'glow', 0.7);
    } else if (pattern === 'summon') {
      const count = rage ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + run.random();
        const s = run.spawn(def.summon ?? 'skeleton', enemy.x + Math.sin(a) * 1.6, enemy.z + Math.cos(a) * 1.6, 0.6);
        s.minion = true;
      }
      run.listener.onSummon?.(enemy);
      enemy.timer = 1.5;
    } else {
      enemy.state = 'burst';
      enemy.bursts = rage ? 4 : 3;
      enemy.timer = 0.5;
      lockAim(run, enemy);
      run.listener.onTelegraph?.(enemy, 'line', 0.5);
    }
  },

  bossCount(run, enemy, dt) {
    const def = enemy.def;
    const rage = enemy.hp < enemy.maxHp * 0.5;
    enemy.timer -= dt;
    if (enemy.state === 'fan') {
      enemy.moving = false;
      if (enemy.timer > 0) return;
      enemy.bursts--;
      lockAim(run, enemy);
      fan(run, enemy, rage ? 7 : 5, 1.1, def.shotSpeed, def.shot);
      if (enemy.bursts > 0) enemy.timer = 0.45;
      else {
        enemy.state = 'walk';
        enemy.timer = 0.9;
      }
      return;
    }
    if (enemy.state === 'aim') {
      enemy.moving = false;
      if (enemy.timer > 0) return;
      ring(run, enemy, 20, def.shotSpeed * 0.7, def.shot, run.random());
      enemy.state = 'walk';
      enemy.timer = 1;
      return;
    }
    hover(run, enemy, dt);
    if (enemy.timer > 0) return;
    const patterns = rage ? ['blink', 'fan', 'bats', 'ring', 'blink', 'fan'] : ['blink', 'fan', 'bats', 'fan'];
    const pattern = patterns[enemy.phase++ % patterns.length];
    if (pattern === 'blink') {
      blink(run, enemy, 7);
      enemy.timer = 0.5;
    } else if (pattern === 'fan') {
      enemy.state = 'fan';
      enemy.bursts = 3;
      enemy.timer = 0.6;
      lockAim(run, enemy);
      run.listener.onTelegraph?.(enemy, 'glow', 0.6);
    } else if (pattern === 'ring') {
      enemy.state = 'aim';
      enemy.timer = 0.7;
      run.listener.onTelegraph?.(enemy, 'glow', 0.7);
    } else {
      const count = rage ? 6 : 4;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const bat = run.spawn(def.summon ?? 'wisp', enemy.x + Math.sin(a), enemy.z + Math.cos(a), 0.4);
        bat.minion = true;
      }
      run.listener.onSummon?.(enemy);
      enemy.timer = 1.4;
    }
  },
};

// The final boss switches between the three boss styles every few seconds,
// only between attacks (their states would clash otherwise).
AI.bossFinal = (run, enemy, dt, realDt) => {
  const idle = !['aim', 'dash', 'slam', 'spiral', 'burst', 'fan'].includes(enemy.state);
  enemy.modeTimer = (enemy.modeTimer ?? 7) - dt;
  if (idle && enemy.modeTimer <= 0) {
    const modes = ['bossOgre', 'bossKing', 'bossCount'];
    enemy.mode = modes[(modes.indexOf(enemy.mode ?? 'bossOgre') + 1) % modes.length];
    enemy.modeTimer = enemy.hp < enemy.maxHp * 0.5 ? 6 : 8;
    enemy.state = 'walk';
    enemy.timer = 0.6;
    run.listener.onTelegraph?.(enemy, 'glow', 0.6);
  }
  AI[enemy.mode ?? 'bossOgre'](run, enemy, dt, realDt);
};

export function updateEnemy(run, enemy, dt, realDt) {
  enemy.moving = false;
  AI[enemy.def.ai](run, enemy, dt, realDt);
}

export { ENEMIES };
