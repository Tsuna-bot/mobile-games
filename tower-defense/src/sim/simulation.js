// Pure game logic: no three.js, no DOM. Runs identically in the browser and in
// Node (see tools/balance.mjs). The renderer and UI observe it through `listener`.

import { CONFIG } from '../config.js';
import { ENEMIES } from '../data/enemies.js';
import { TOWERS, investedGold, stackHeight } from '../data/towers.js';
import { buildWaves } from '../data/waves.js';
import { Level } from './level.js';

const MAX_ENEMIES = 220;
const MAX_PROJECTILES = 260;
const BOULDER_ARC_HEIGHT = 1.6;

export const SIM_STATE = Object.freeze({ READY: 'ready', RUNNING: 'running', WON: 'won', LOST: 'lost' });

function createEnemy() {
  return {
    id: 0,
    active: false,
    def: null,
    hp: 0,
    maxHp: 0,
    hpMultiplier: 1,
    armor: 0,
    speed: 0,
    distance: 0,
    x: 0,
    z: 0,
    dirX: 0,
    dirZ: 1,
    slowFactor: 1,
    slowTimer: 0,
    wave: 0,
    view: null,
  };
}

function createProjectile() {
  return {
    active: false,
    kind: '',
    tower: null,
    target: null,
    targetId: 0,
    damage: 0,
    splash: 0,
    speed: 0,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    sx: 0, sy: 0, sz: 0,
    tx: 0, ty: 0, tz: 0,
    age: 0,
    flightTime: 0,
    view: null,
  };
}

export class Tower {
  constructor(id, def, cell) {
    this.id = id;
    this.def = def;
    this.cell = cell;
    this.x = cell.x;
    this.z = cell.z;
    this.level = 0;
    this.cooldown = 0;
    this.targeting = 'first';
    this.target = null;
    this.kills = 0;
    this.damageDealt = 0;
    this.view = null;
  }

  get stats() {
    return this.def.levels[this.level];
  }

  get muzzleY() {
    return CONFIG.world.tileTop + stackHeight(this.def, this.level) + 0.28;
  }

  get maxed() {
    return this.level >= this.def.levels.length - 1;
  }

  get upgradeCost() {
    return this.maxed ? 0 : this.def.levels[this.level + 1].upgrade;
  }

  get sellValue() {
    return Math.floor(investedGold(this.def, this.level) * CONFIG.economy.sellRefund);
  }
}

export class Simulation {
  constructor(levelDef, levelIndex, listener = {}) {
    this.level = new Level(levelDef, levelIndex);
    this.waves = buildWaves(levelDef, levelIndex);
    this.listener = listener;
    this.gold = levelDef.startGold;
    this.lives = CONFIG.economy.startLives;
    this.state = SIM_STATE.READY;
    this.time = 0;
    this.nextWave = 0;
    this.countdown = -1;
    this.spawners = [];
    this.waveRemaining = new Int32Array(this.waves.length);
    this.enemies = Array.from({ length: MAX_ENEMIES }, createEnemy);
    this.projectiles = Array.from({ length: MAX_PROJECTILES }, createProjectile);
    this.towers = [];
    this.towerByCell = new Map();
    this.nextEnemyId = 1;
    this.nextTowerId = 1;
    this.stats = { kills: 0, leaked: 0, goldEarned: 0, towersBuilt: 0 };
    this.sample = { x: 0, z: 0, dirX: 0, dirZ: 1 };
  }

  get over() {
    return this.state === SIM_STATE.WON || this.state === SIM_STATE.LOST;
  }

  get stars() {
    if (this.state !== SIM_STATE.WON) return 0;
    if (this.lives >= CONFIG.stars.three) return 3;
    if (this.lives >= CONFIG.stars.two) return 2;
    return 1;
  }

  // ------------------------------------------------------------ player actions

  canCallWave() {
    return !this.over && this.nextWave < this.waves.length;
  }

  /** Gold the player would earn by calling the next wave right now. */
  get earlyCallBonus() {
    return this.countdown > 0 ? Math.ceil(this.countdown * CONFIG.economy.earlyCallBonusPerSecond) : 0;
  }

  callNextWave() {
    if (!this.canCallWave()) return false;
    const bonus = this.earlyCallBonus;
    this.gold += bonus;
    const index = this.nextWave++;
    const wave = this.waves[index];
    this.spawners.push({ wave, index, cursor: 0, elapsed: 0 });
    this.waveRemaining[index] = wave.spawns.length;
    this.countdown = -1;
    this.state = SIM_STATE.RUNNING;
    this.listener.onWaveStart?.(index, bonus);
    return true;
  }

  towerAt(cell) {
    return this.towerByCell.get(cell.index) ?? null;
  }

  canBuild(cell) {
    return Boolean(cell?.buildable) && !this.towerByCell.has(cell.index) && !this.over;
  }

  build(typeId, cell) {
    const def = TOWERS[typeId];
    if (!def || !this.canBuild(cell) || this.gold < def.cost) return null;
    this.gold -= def.cost;
    const tower = new Tower(this.nextTowerId++, def, cell);
    this.towers.push(tower);
    this.towerByCell.set(cell.index, tower);
    this.stats.towersBuilt++;
    this.listener.onTowerBuilt?.(tower);
    return tower;
  }

  upgrade(tower) {
    if (tower.maxed || this.gold < tower.upgradeCost || this.over) return false;
    this.gold -= tower.upgradeCost;
    tower.level++;
    this.listener.onTowerUpgraded?.(tower);
    return true;
  }

  sell(tower) {
    if (this.over) return 0;
    const refund = tower.sellValue;
    this.gold += refund;
    this.towers.splice(this.towers.indexOf(tower), 1);
    this.towerByCell.delete(tower.cell.index);
    for (const p of this.projectiles) if (p.active && p.tower === tower) p.tower = null;
    this.listener.onTowerSold?.(tower, refund);
    return refund;
  }

  // ------------------------------------------------------------ simulation

  step(dt) {
    if (this.over) return;
    this.time += dt;
    this.updateSpawners(dt);
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.callNextWave();
    }
    this.updateEnemies(dt);
    if (this.over) return;
    this.updateTowers(dt);
    this.updateProjectiles(dt);
  }

  updateSpawners(dt) {
    for (let i = this.spawners.length - 1; i >= 0; i--) {
      const spawner = this.spawners[i];
      spawner.elapsed += dt;
      const spawns = spawner.wave.spawns;
      while (spawner.cursor < spawns.length && spawns[spawner.cursor].time <= spawner.elapsed) {
        this.spawnEnemy(spawns[spawner.cursor].type, spawner.wave.hpMultiplier, spawner.index, 0);
        spawner.cursor++;
      }
      if (spawner.cursor >= spawns.length) this.spawners.splice(i, 1);
    }
    if (this.spawners.length === 0 && this.countdown < 0 && this.nextWave > 0 && this.nextWave < this.waves.length) {
      this.countdown = CONFIG.waves.countdown;
      this.listener.onCountdown?.(this.countdown);
    }
  }

  spawnEnemy(typeId, hpMultiplier, wave, distance) {
    const enemy = this.enemies.find((e) => !e.active);
    if (!enemy) {
      // Pool exhausted (never expected with the shipped waves): count it as handled.
      this.enemyGone(wave);
      return null;
    }
    const def = ENEMIES[typeId];
    enemy.id = this.nextEnemyId++;
    enemy.active = true;
    enemy.def = def;
    enemy.hpMultiplier = hpMultiplier;
    enemy.maxHp = Math.round(def.hp * hpMultiplier);
    enemy.hp = enemy.maxHp;
    enemy.armor = def.armor;
    enemy.speed = def.speed * (0.94 + Math.random() * 0.12);
    enemy.distance = distance;
    enemy.slowFactor = 1;
    enemy.slowTimer = 0;
    enemy.wave = wave;
    this.level.sampleRoute(distance, this.sample);
    enemy.x = this.sample.x;
    enemy.z = this.sample.z;
    enemy.dirX = this.sample.dirX;
    enemy.dirZ = this.sample.dirZ;
    this.listener.onEnemySpawn?.(enemy);
    return enemy;
  }

  updateEnemies(dt) {
    const length = this.level.routeLength;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt;
        if (enemy.slowTimer <= 0) enemy.slowFactor = 1;
      }
      enemy.distance += enemy.speed * enemy.slowFactor * dt;
      if (enemy.distance >= length) {
        this.leak(enemy);
        if (this.over) return;
        continue;
      }
      this.level.sampleRoute(enemy.distance, this.sample);
      enemy.x = this.sample.x;
      enemy.z = this.sample.z;
      enemy.dirX = this.sample.dirX;
      enemy.dirZ = this.sample.dirZ;
    }
  }

  leak(enemy) {
    enemy.active = false;
    this.lives = Math.max(0, this.lives - enemy.def.leak);
    this.stats.leaked++;
    this.listener.onEnemyLeaked?.(enemy);
    if (this.lives <= 0) {
      this.state = SIM_STATE.LOST;
      this.listener.onDefeat?.();
      return;
    }
    this.enemyGone(enemy.wave);
  }

  enemyGone(wave) {
    this.waveRemaining[wave]--;
    if (this.waveRemaining[wave] > 0) return;
    const bonus = CONFIG.economy.waveClearBonusBase + CONFIG.economy.waveClearBonusPerWave * (wave + 1);
    this.gold += bonus;
    this.listener.onWaveCleared?.(wave, bonus);
    if (this.nextWave === this.waves.length && this.waveRemaining.every((n) => n <= 0)) {
      this.state = SIM_STATE.WON;
      this.listener.onVictory?.(this.stars);
    }
  }

  damage(enemy, amount, tower) {
    if (!enemy.active) return;
    const dealt = Math.max(amount * CONFIG.combat.minDamageShare, amount - enemy.armor);
    enemy.hp -= dealt;
    if (tower) tower.damageDealt += dealt;
    this.listener.onEnemyHit?.(enemy, dealt);
    if (enemy.hp <= 0) this.kill(enemy, tower);
  }

  kill(enemy, tower) {
    enemy.active = false;
    const def = enemy.def;
    this.gold += def.reward;
    this.stats.kills++;
    this.stats.goldEarned += def.reward;
    if (tower) tower.kills++;
    this.listener.onEnemyKilled?.(enemy);
    const children = def.spawnsOnDeath;
    if (children) {
      this.waveRemaining[enemy.wave] += children.count;
      for (let i = 0; i < children.count; i++) {
        this.spawnEnemy(children.type, enemy.hpMultiplier, enemy.wave, Math.max(0, enemy.distance - i * 0.3));
      }
    }
    this.enemyGone(enemy.wave);
  }

  findTarget(tower, range) {
    const rangeSq = range * range;
    let best = null;
    let bestScore = -Infinity;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - tower.x;
      const dz = enemy.z - tower.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > rangeSq) continue;
      let score;
      switch (tower.targeting) {
        case 'last': score = -enemy.distance; break;
        case 'strong': score = enemy.hp + enemy.distance * 0.01; break;
        case 'close': score = -distSq; break;
        default: score = enemy.distance;
      }
      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  updateTowers(dt) {
    for (const tower of this.towers) {
      const stats = tower.stats;
      tower.cooldown -= dt;
      if (tower.def.id === 'frost') {
        if (tower.cooldown <= 0 && this.frostPulse(tower, stats)) tower.cooldown = stats.rate;
        continue;
      }
      const target = this.findTarget(tower, stats.range);
      tower.target = target;
      if (!target) {
        if (tower.cooldown < 0) tower.cooldown = 0;
        continue;
      }
      if (tower.cooldown <= 0) {
        this.fire(tower, target, stats);
        tower.cooldown += stats.rate;
        if (tower.cooldown < 0) tower.cooldown = 0;
      }
    }
  }

  frostPulse(tower, stats) {
    const rangeSq = stats.range * stats.range;
    let hit = false;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - tower.x;
      const dz = enemy.z - tower.z;
      if (dx * dx + dz * dz > rangeSq) continue;
      if (!hit) {
        hit = true;
        this.listener.onFrostPulse?.(tower);
      }
      enemy.slowFactor = Math.min(enemy.slowFactor, 1 - stats.slow);
      enemy.slowTimer = Math.max(enemy.slowTimer, stats.slowDuration);
      this.damage(enemy, stats.damage, tower);
    }
    return hit;
  }

  fire(tower, target, stats) {
    const p = this.projectiles.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.kind = tower.def.projectile;
    p.tower = tower;
    p.target = target;
    p.targetId = target.id;
    p.damage = stats.damage;
    p.splash = stats.splash ?? 0;
    p.speed = stats.projectileSpeed ?? 0;
    p.age = 0;
    p.x = p.sx = tower.x;
    p.y = p.sy = tower.muzzleY;
    p.z = p.sz = tower.z;
    p.tx = target.x;
    p.ty = CONFIG.world.enemyHover;
    p.tz = target.z;
    p.vx = p.vy = p.vz = 0;
    if (p.kind === 'boulder') {
      // Aim where the target will be when the boulder lands.
      p.flightTime = stats.flightTime;
      const lead = target.distance + target.speed * target.slowFactor * stats.flightTime;
      this.level.sampleRoute(lead, this.sample);
      p.tx = this.sample.x;
      p.tz = this.sample.z;
      p.ty = CONFIG.world.tileTop;
    }
    this.listener.onFire?.(tower, p);
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.kind === 'boulder') {
        const t = Math.min(p.age / p.flightTime, 1);
        const px = p.x;
        const py = p.y;
        const pz = p.z;
        p.x = p.sx + (p.tx - p.sx) * t;
        p.z = p.sz + (p.tz - p.sz) * t;
        p.y = p.sy + (p.ty - p.sy) * t + 4 * BOULDER_ARC_HEIGHT * t * (1 - t);
        p.vx = (p.x - px) / dt;
        p.vy = (p.y - py) / dt;
        p.vz = (p.z - pz) / dt;
        if (t >= 1) this.impact(p);
        continue;
      }
      const target = p.target;
      if (target && target.active && target.id === p.targetId) {
        p.tx = target.x;
        p.tz = target.z;
      } else {
        p.target = null;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dz = p.tz - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const travel = p.speed * dt;
      if (dist <= travel + CONFIG.combat.projectileHitRadius) {
        p.x = p.tx;
        p.y = p.ty;
        p.z = p.tz;
        this.impact(p);
        continue;
      }
      p.vx = (dx / dist) * p.speed;
      p.vy = (dy / dist) * p.speed;
      p.vz = (dz / dist) * p.speed;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
  }

  impact(p) {
    p.active = false;
    this.listener.onImpact?.(p);
    if (p.splash > 0) {
      const radiusSq = p.splash * p.splash;
      const edge = CONFIG.combat.splashEdgeDamage;
      for (const enemy of this.enemies) {
        if (!enemy.active) continue;
        const dx = enemy.x - p.x;
        const dz = enemy.z - p.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > radiusSq) continue;
        const falloff = 1 - (1 - edge) * Math.sqrt(distSq / radiusSq);
        this.damage(enemy, p.damage * falloff, p.tower);
      }
    } else if (p.target && p.target.active && p.target.id === p.targetId) {
      this.damage(p.target, p.damage, p.tower);
    }
    p.target = null;
  }
}
