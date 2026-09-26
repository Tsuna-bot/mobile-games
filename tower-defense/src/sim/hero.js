// Hero logic shared by the campaign and the Kingdom (see data/hero.js). Pure: no DOM.

import { HERO, HERO_MAX_LEVEL, heroStats } from '../data/hero.js';

export function createHero(x, z, level = 1, xp = 0) {
  const hero = {
    x, z, goalX: x, goalZ: z, homeX: x, homeZ: z,
    dirX: 0, dirZ: 1,
    level, xp,
    hp: 0, maxHp: 0,
    cooldown: 0,
    powerCooldown: 0,
    respawn: 0,
    target: null,
    attacking: 0,
    moving: false,
    kills: 0,
    view: null,
  };
  hero.maxHp = heroStats(level).maxHp;
  hero.hp = hero.maxHp;
  return hero;
}

export function heroAlive(hero) {
  return hero.respawn <= 0;
}

/** XP needed for the next level, or null at the top. */
export function heroNextXp(hero) {
  return hero.level >= HERO_MAX_LEVEL ? null : HERO.levels[hero.level];
}

function gainXp(sim, hero, amount) {
  hero.xp += amount;
  let leveled = false;
  while (hero.level < HERO_MAX_LEVEL && hero.xp >= HERO.levels[hero.level]) {
    hero.level++;
    leveled = true;
  }
  if (leveled) {
    const stats = heroStats(hero.level, sim.threat);
    hero.maxHp = stats.maxHp;
    hero.hp = hero.maxHp;
    sim.listener.onHeroLevel?.(hero);
  }
}

/** Called by the simulation when an enemy dies: XP if the knight dealt the blow or stood close. */
export function heroOnKill(sim, enemy, byHero) {
  const hero = sim.hero;
  if (!hero || !heroAlive(hero)) return;
  if (byHero) {
    hero.kills++;
    gainXp(sim, hero, enemy.def.reward * 2);
  } else if ((enemy.x - hero.x) ** 2 + (enemy.z - hero.z) ** 2 < 9) {
    gainXp(sim, hero, Math.ceil(enemy.def.reward * 0.5));
  }
}

export function moveHero(sim, x, z) {
  const hero = sim.hero;
  if (!hero || !heroAlive(hero)) return false;
  const halfW = sim.level.width / 2 - 0.3;
  const halfH = sim.level.height / 2 - 0.3;
  hero.goalX = Math.max(-halfW, Math.min(halfW, x));
  hero.goalZ = Math.max(-halfH, Math.min(halfH, z));
  return true;
}

export function heroPowerReady(hero) {
  return Boolean(hero) && heroAlive(hero) && hero.powerCooldown <= 0;
}

export function castHeroPower(sim) {
  const hero = sim.hero;
  if (!heroPowerReady(hero)) return false;
  const power = HERO.power;
  hero.powerCooldown = power.cooldown;
  const stats = heroStats(hero.level, sim.threat);
  const radiusSq = power.radius * power.radius;
  sim.listener.onHeroPower?.(hero);
  for (const enemy of sim.enemies) {
    if (!enemy.active || (enemy.x - hero.x) ** 2 + (enemy.z - hero.z) ** 2 > radiusSq) continue;
    sim.stunEnemy(enemy, power.stun);
    sim.heroStrike = true;
    sim.damage(enemy, stats.damage * power.damage, null, true);
    sim.heroStrike = false;
  }
  return true;
}

export function updateHero(sim, dt) {
  const hero = sim.hero;
  if (!hero) return;
  if (hero.powerCooldown > 0) hero.powerCooldown -= dt;
  if (!heroAlive(hero)) {
    hero.respawn -= dt;
    if (heroAlive(hero)) {
      hero.x = hero.goalX = hero.homeX;
      hero.z = hero.goalZ = hero.homeZ;
      hero.hp = hero.maxHp;
      sim.listener.onHeroRevive?.(hero);
    }
    return;
  }
  const stats = heroStats(hero.level, sim.threat);
  if (stats.maxHp !== hero.maxHp) {
    hero.hp *= stats.maxHp / hero.maxHp;
    hero.maxHp = stats.maxHp;
  }

  // Walk toward the goal.
  const dx = hero.goalX - hero.x;
  const dz = hero.goalZ - hero.z;
  const dist = Math.hypot(dx, dz);
  hero.moving = dist > 0.05;
  if (hero.moving) {
    const step = Math.min(dist, HERO.speed * dt);
    hero.dirX = dx / dist;
    hero.dirZ = dz / dist;
    hero.x += hero.dirX * step;
    hero.z += hero.dirZ * step;
  }

  // UFOs close by zap him; alone, he recovers.
  let threatened = false;
  const rangeSq = stats.range * stats.range;
  let target = null;
  let best = Infinity;
  for (const enemy of sim.enemies) {
    if (!enemy.active) continue;
    const d = (enemy.x - hero.x) ** 2 + (enemy.z - hero.z) ** 2;
    if (d < 0.9) {
      threatened = true;
      hero.hp -= (enemy.def.siege ?? 8) * 0.55 * Math.sqrt(enemy.hpMultiplier) * dt;
    }
    if (d <= rangeSq && d < best) {
      best = d;
      target = enemy;
    }
  }
  if (!threatened) hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * HERO.regen * dt);
  if (hero.hp <= 0) {
    hero.hp = 0;
    hero.respawn = HERO.respawn;
    hero.target = null;
    sim.listener.onHeroDown?.(hero);
    return;
  }

  // Strike the nearest UFO in reach (not while walking far).
  hero.target = target;
  hero.cooldown -= dt;
  if (hero.attacking > 0) hero.attacking -= dt;
  if (target && hero.cooldown <= 0 && dist < 0.6) {
    hero.cooldown = stats.rate;
    hero.attacking = 0.35;
    hero.dirX = target.x - hero.x;
    hero.dirZ = target.z - hero.z;
    const len = Math.hypot(hero.dirX, hero.dirZ) || 1;
    hero.dirX /= len;
    hero.dirZ /= len;
    sim.listener.onHeroAttack?.(hero, target);
    sim.heroStrike = true;
    sim.damage(target, stats.damage, null);
    sim.heroStrike = false;
  } else if (hero.cooldown < 0) hero.cooldown = 0;
}

export function serializeHero(hero) {
  if (!hero) return null;
  const r = (v) => Math.round(v * 100) / 100;
  return { x: r(hero.x), z: r(hero.z), level: hero.level, xp: hero.xp, hp: Math.round(hero.hp), respawn: r(hero.respawn), power: r(hero.powerCooldown), kills: hero.kills };
}

export function restoreHero(hero, data) {
  if (!hero || !data) return;
  hero.x = hero.goalX = data.x;
  hero.z = hero.goalZ = data.z;
  hero.level = data.level;
  hero.xp = data.xp;
  hero.maxHp = heroStats(hero.level).maxHp;
  hero.hp = Math.min(hero.maxHp, data.hp);
  hero.respawn = data.respawn ?? 0;
  hero.powerCooldown = data.power ?? 0;
  hero.kills = data.kills ?? 0;
}
