// Hero logic shared by the campaign and the Kingdom (see data/heroes.js). Pure: no DOM.

import { HERO_LEVELS, HERO_MAX_LEVEL, heroDef, heroStats } from '../data/heroes.js';

export function createHero(x, z, level = 1, xp = 0, type = 'knight') {
  const def = heroDef(type);
  const hero = {
    type: def.id, def,
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
  hero.maxHp = heroStats(level, 1, def).maxHp;
  hero.hp = hero.maxHp;
  return hero;
}

const isBoss = (enemy) => Boolean(enemy.def.boss) || enemy.def.id === 'boss';

/** Kingdom blessings can make the hero stronger. */
function stats(sim, hero) {
  const base = heroStats(hero.level, sim.threat, hero.def);
  const boost = sim.heroBoost ?? 1;
  if (boost === 1) return base;
  return { ...base, damage: base.damage * boost, maxHp: Math.round(base.maxHp * boost) };
}

export function heroAlive(hero) {
  return hero.respawn <= 0;
}

/** XP needed for the next level, or null at the top. */
export function heroNextXp(hero) {
  return hero.level >= HERO_MAX_LEVEL ? null : HERO_LEVELS[hero.level];
}

function gainXp(sim, hero, amount) {
  hero.xp += amount;
  let leveled = false;
  while (hero.level < HERO_MAX_LEVEL && hero.xp >= HERO_LEVELS[hero.level]) {
    hero.level++;
    leveled = true;
  }
  if (leveled) {
    hero.maxHp = stats(sim, hero).maxHp;
    hero.hp = hero.maxHp;
    sim.listener.onHeroLevel?.(hero);
  }
}

/** Called by the simulation when an enemy dies: XP if the hero (or their turret) dealt the blow or stood close. */
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

/** Damage dealt by the hero: counted as theirs for XP. */
function strike(sim, enemy, amount, pierce = false) {
  sim.heroStrike = true;
  sim.damage(enemy, amount, null, pierce);
  sim.heroStrike = false;
}

function slow(enemy, amount, seconds) {
  enemy.slowFactor = Math.min(enemy.slowFactor, 1 - amount);
  enemy.slowTimer = Math.max(enemy.slowTimer, seconds);
}

function enemiesAround(sim, x, z, radius) {
  const radiusSq = radius * radius;
  return sim.enemies.filter((e) => e.active && (e.x - x) ** 2 + (e.z - z) ** 2 <= radiusSq);
}

export function castHeroPower(sim) {
  const hero = sim.hero;
  if (!heroPowerReady(hero)) return false;
  const power = hero.def.power;
  const s = stats(sim, hero);
  hero.powerCooldown = power.cooldown;
  const targets = power.radius ? enemiesAround(sim, hero.x, hero.z, power.radius) : [];
  let healed = 0;
  if (power.id === 'turret') {
    sim.heroTurret = { x: hero.x + hero.dirX * 0.7, z: hero.z + hero.dirZ * 0.7, time: power.time, max: power.time, cooldown: 0.4, target: null, dirX: hero.dirX, dirZ: hero.dirZ };
  } else if (power.id === 'sanctuary') {
    if (sim.realm) {
      // Kingdom: the castle and every building around her are mended.
      healed = Math.min(Math.round(sim.startLives * 0.12), sim.startLives - sim.lives);
      const radiusSq = (power.radius + 0.8) ** 2;
      for (const s2 of [...sim.buildings, ...sim.towers]) {
        if ((s2.x - hero.x) ** 2 + (s2.z - hero.z) ** 2 <= radiusSq) s2.hp = Math.min(s2.maxHp, s2.hp + s2.maxHp * 0.4);
      }
    } else healed = Math.min(power.heal, sim.startLives - sim.lives);
    sim.lives += Math.max(0, healed);
  }
  sim.listener.onHeroPower?.(hero, targets, healed);
  for (const enemy of targets) {
    if (!enemy.active) continue;
    if (power.stun) sim.stunEnemy(enemy, power.stun);
    if (power.freeze) enemy.freezeTimer = Math.max(enemy.freezeTimer, isBoss(enemy) ? power.freeze / 2 : power.freeze);
    if (power.slow) slow(enemy, power.slow, power.slowTime);
    strike(sim, enemy, s.damage * power.damage, true);
  }
  return true;
}

/** Engineer and priestess: towers near them fire faster or hit harder. */
export function heroAura(sim, tower) {
  const hero = sim.hero;
  const aura = hero?.def.aura;
  if (!aura || !heroAlive(hero)) return null;
  return (tower.x - hero.x) ** 2 + (tower.z - hero.z) ** 2 <= aura.radius * aura.radius ? aura : null;
}

function updateTurret(sim, hero, dt) {
  const turret = sim.heroTurret;
  if (!turret) return;
  turret.time -= dt;
  if (turret.time <= 0) {
    sim.heroTurret = null;
    sim.listener.onHeroTurretGone?.(turret);
    return;
  }
  const power = hero.def.power;
  turret.cooldown -= dt;
  let target = null;
  let best = power.range * power.range;
  for (const enemy of sim.enemies) {
    if (!enemy.active) continue;
    const d = (enemy.x - turret.x) ** 2 + (enemy.z - turret.z) ** 2;
    if (d <= best) {
      best = d;
      target = enemy;
    }
  }
  turret.target = target;
  if (!target) {
    if (turret.cooldown < 0) turret.cooldown = 0;
    return;
  }
  const len = Math.hypot(target.x - turret.x, target.z - turret.z) || 1;
  turret.dirX = (target.x - turret.x) / len;
  turret.dirZ = (target.z - turret.z) / len;
  if (turret.cooldown > 0) return;
  turret.cooldown += power.rate;
  sim.listener.onHeroTurretShot?.(turret, target);
  strike(sim, target, stats(sim, hero).damage * power.damage);
}

export function updateHero(sim, dt) {
  const hero = sim.hero;
  if (!hero) return;
  const def = hero.def;
  if (hero.powerCooldown > 0) hero.powerCooldown -= dt;
  updateTurret(sim, hero, dt);
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
  const s = stats(sim, hero);
  if (s.maxHp !== hero.maxHp) {
    hero.hp *= s.maxHp / hero.maxHp;
    hero.maxHp = s.maxHp;
  }

  // Walk toward the goal.
  const dx = hero.goalX - hero.x;
  const dz = hero.goalZ - hero.z;
  const dist = Math.hypot(dx, dz);
  hero.moving = dist > 0.05;
  if (hero.moving) {
    const step = Math.min(dist, def.speed * dt);
    hero.dirX = dx / dist;
    hero.dirZ = dz / dist;
    hero.x += hero.dirX * step;
    hero.z += hero.dirZ * step;
  }

  // UFOs close by zap the hero; alone, they recover.
  let threatened = false;
  const rangeSq = s.range * s.range;
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
  if (!threatened) hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * def.regen * dt);
  if (hero.hp <= 0) {
    hero.hp = 0;
    hero.respawn = def.respawn;
    hero.target = null;
    sim.listener.onHeroDown?.(hero);
    return;
  }

  // Attack the nearest UFO in reach (not while walking far).
  hero.target = target;
  hero.cooldown -= dt;
  if (hero.attacking > 0) hero.attacking -= dt;
  if (target && hero.cooldown <= 0 && dist < 0.6) {
    hero.cooldown = s.rate;
    hero.attacking = 0.35;
    hero.dirX = target.x - hero.x;
    hero.dirZ = target.z - hero.z;
    const len = Math.hypot(hero.dirX, hero.dirZ) || 1;
    hero.dirX /= len;
    hero.dirZ /= len;
    sim.listener.onHeroAttack?.(hero, target);
    if (def.slow) slow(target, def.slow, def.slowTime);
    strike(sim, target, s.damage, Boolean(def.pierce));
  } else if (hero.cooldown < 0) hero.cooldown = 0;
}

export function serializeHero(hero) {
  if (!hero) return null;
  const r = (v) => Math.round(v * 100) / 100;
  return { type: hero.type, x: r(hero.x), z: r(hero.z), level: hero.level, xp: hero.xp, hp: Math.round(hero.hp), respawn: r(hero.respawn), power: r(hero.powerCooldown), kills: hero.kills };
}

/** Restores a saved hero; `type` (the hero chosen now) wins over the saved one, keeping the level. */
export function restoreHero(hero, data, type = null) {
  if (!hero || !data) return;
  const def = heroDef(type ?? data.type ?? hero.type);
  hero.def = def;
  hero.type = def.id;
  hero.x = hero.goalX = data.x;
  hero.z = hero.goalZ = data.z;
  hero.level = Math.min(HERO_MAX_LEVEL, data.level);
  hero.xp = data.xp;
  hero.maxHp = heroStats(hero.level, 1, def).maxHp;
  hero.hp = def.id === (data.type ?? 'knight') ? Math.min(hero.maxHp, data.hp) : hero.maxHp;
  hero.respawn = data.respawn ?? 0;
  hero.powerCooldown = Math.min(def.power.cooldown, data.power ?? 0);
  hero.kills = data.kills ?? 0;
}
