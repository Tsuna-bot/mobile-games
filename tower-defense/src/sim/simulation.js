// Pure game logic: no three.js, no DOM. Runs identically in the browser and in
// Node (see tools/balance.mjs). The renderer and UI observe it through `listener`.

import { CONFIG } from '../config.js';
import { ENEMIES } from '../data/enemies.js';
import { DEFAULT_MODIFIERS } from '../data/perks.js';
import { SPELLS, STARTER_SPELLS } from '../data/spells.js';
import { TOWERS, stackHeight } from '../data/towers.js';
import { makeWave } from '../data/waves.js';
import { Level } from './level.js';

const MAX_ENEMIES = 260;
const MAX_PROJECTILES = 300;
const BOULDER_ARC_HEIGHT = 1.6;
const HEROIC_LIVES = 5;

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
    freezeTimer: 0,
    stunTimer: 0,
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
    pierce: false,
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
  constructor(id, def, cell, modifiers) {
    this.id = id;
    this.def = def;
    this.cell = cell;
    this.x = cell.x;
    this.z = cell.z;
    this.level = 0;
    this.modifiers = modifiers;
    this.spent = def.cost;
    this.cooldown = 0;
    this.targeting = 'first';
    this.target = null;
    this.kills = 0;
    this.damageDealt = 0;
    this.view = null;
    this.refreshStats();
  }

  /** Level stats with the permanent upgrades (perks) applied. */
  refreshStats() {
    const base = this.def.levels[this.level];
    this.stats = { ...base, range: base.range * this.modifiers.range };
    if (base.damage !== undefined) this.stats.damage = base.damage * this.modifiers.damage;
  }

  get muzzleY() {
    return CONFIG.world.tileTop + stackHeight(this.def, this.level) + 0.28;
  }

  get maxed() {
    return this.level >= this.def.levels.length - 1;
  }

  get upgradeCost() {
    return this.maxed ? 0 : Math.round(this.def.levels[this.level + 1].upgrade * this.modifiers.upgradeCost);
  }

  get sellValue() {
    return Math.floor(this.spent * CONFIG.economy.sellRefund);
  }
}

export class Simulation {
  /**
   * @param options.heroic   harder variant: tougher enemies, only 5 lives
   * @param options.modifiers permanent upgrades (see perks.js)
   */
  constructor(levelDef, levelIndex, listener = {}, { heroic = false, modifiers = DEFAULT_MODIFIERS, spells = STARTER_SPELLS } = {}) {
    this.def = levelDef;
    this.levelIndex = levelIndex;
    this.level = new Level(levelDef, levelIndex);
    this.heroic = heroic;
    this.modifiers = modifiers;
    this.endless = Boolean(levelDef.endless);
    this.waveCount = this.endless ? Infinity : levelDef.waves;
    this.waves = [];
    this.listener = listener;
    this.gold = levelDef.startGold + modifiers.startGold;
    this.startLives = heroic ? HEROIC_LIVES : CONFIG.economy.startLives + modifiers.lives;
    this.lives = this.startLives;
    this.state = SIM_STATE.READY;
    this.time = 0;
    this.nextWave = 0;
    this.countdown = -1;
    this.spawners = [];
    this.waveRemaining = [];
    this.waveLeaks = [];
    this.enemies = Array.from({ length: MAX_ENEMIES }, createEnemy);
    this.projectiles = Array.from({ length: MAX_PROJECTILES }, createProjectile);
    this.towers = [];
    this.towerByCell = new Map();
    this.nextEnemyId = 1;
    this.nextTowerId = 1;
    this.stats = { kills: 0, bossKills: 0, leaked: 0, goldEarned: 0, towersBuilt: 0, towersMaxed: 0, spellsCast: 0, perfectWaves: 0, wavesCleared: 0, maxGold: 0 };
    this.sample = { x: 0, z: 0, dirX: 0, dirZ: 1 };
    this.spells = {};
    for (const id of spells) {
      const spell = SPELLS[id];
      if (!spell) continue;
      const max = spell.cooldown * modifiers.spellCooldown;
      this.spells[id] = { cooldown: spell.initialCooldown * modifiers.spellCooldown, max };
    }
    this.strikes = [];
  }

  get over() {
    return this.state === SIM_STATE.WON || this.state === SIM_STATE.LOST;
  }

  get stars() {
    if (this.state !== SIM_STATE.WON) return 0;
    const lost = this.startLives - this.lives;
    if (this.heroic) return 3;
    if (lost <= CONFIG.stars.maxLostForThree) return 3;
    if (lost <= CONFIG.stars.maxLostForTwo) return 2;
    return 1;
  }

  wave(index) {
    if (!this.waves[index]) this.waves[index] = makeWave(this.def, this.levelIndex, index + 1, { heroic: this.heroic });
    return this.waves[index];
  }

  /** HP multiplier of the latest wave; spells scale with it. */
  get threat() {
    return this.wave(Math.max(0, this.nextWave - 1)).hpMultiplier;
  }

  // ------------------------------------------------------------ player actions

  canCallWave() {
    return !this.over && this.nextWave < this.waveCount;
  }

  get earlyCallBonus() {
    return this.countdown > 0 ? Math.ceil(this.countdown * CONFIG.economy.earlyCallBonusPerSecond) : 0;
  }

  callNextWave() {
    if (!this.canCallWave()) return false;
    const bonus = this.earlyCallBonus;
    this.gold += bonus;
    const index = this.nextWave++;
    const wave = this.wave(index);
    this.spawners.push({ wave, index, cursor: 0, elapsed: 0 });
    this.waveRemaining[index] = wave.spawns.length;
    this.waveLeaks[index] = 0;
    this.countdown = -1;
    this.state = SIM_STATE.RUNNING;
    this.listener.onWaveStart?.(index, bonus);
    for (const tower of this.towers) {
      if (!tower.stats.income) continue;
      this.addGold(tower.stats.income);
      this.listener.onMineIncome?.(tower, tower.stats.income);
    }
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
    const tower = new Tower(this.nextTowerId++, def, cell, this.modifiers);
    this.towers.push(tower);
    this.towerByCell.set(cell.index, tower);
    this.stats.towersBuilt++;
    this.listener.onTowerBuilt?.(tower);
    return tower;
  }

  upgrade(tower) {
    const cost = tower.upgradeCost;
    if (tower.maxed || this.gold < cost || this.over) return false;
    this.gold -= cost;
    tower.spent += cost;
    tower.level++;
    tower.refreshStats();
    if (tower.maxed) this.stats.towersMaxed++;
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

  addGold(amount) {
    this.gold += amount;
    this.stats.goldEarned += amount;
  }

  // ------------------------------------------------------------ save / resume

  /** Everything needed to resume the run later (projectiles in flight are dropped). */
  serialize() {
    const round = (v) => Math.round(v * 1000) / 1000;
    return {
      version: 1,
      gold: this.gold,
      lives: this.lives,
      time: round(this.time),
      state: this.state,
      nextWave: this.nextWave,
      countdown: round(this.countdown),
      waveRemaining: [...this.waveRemaining],
      waveLeaks: [...this.waveLeaks],
      spawners: this.spawners.map((s) => ({ index: s.index, cursor: s.cursor, elapsed: round(s.elapsed) })),
      spells: Object.fromEntries(Object.entries(this.spells).map(([id, s]) => [id, round(s.cooldown)])),
      strikes: this.strikes.map((s) => ({ ...s })),
      stats: { ...this.stats },
      towers: this.towers.map((t) => ({
        type: t.def.id, cell: t.cell.index, level: t.level, spent: t.spent,
        targeting: t.targeting, kills: t.kills, cooldown: round(t.cooldown),
      })),
      enemies: this.enemies.filter((e) => e.active).map((e) => ({
        type: e.def.id, hp: round(e.hp), maxHp: e.maxHp, hpMultiplier: e.hpMultiplier, speed: round(e.speed),
        distance: round(e.distance), slowFactor: e.slowFactor, slowTimer: round(e.slowTimer),
        freezeTimer: round(e.freezeTimer), stunTimer: round(e.stunTimer), wave: e.wave,
      })),
    };
  }

  /** Rebuilds a run from `serialize()` output. Call before attaching the listener. */
  restore(data) {
    this.gold = data.gold;
    this.lives = data.lives;
    this.time = data.time;
    this.state = data.state === SIM_STATE.RUNNING ? SIM_STATE.RUNNING : SIM_STATE.READY;
    this.nextWave = data.nextWave;
    this.countdown = data.countdown;
    this.waveRemaining = [...data.waveRemaining];
    this.waveLeaks = [...data.waveLeaks];
    this.spawners = data.spawners.map((s) => ({ wave: this.wave(s.index), index: s.index, cursor: s.cursor, elapsed: s.elapsed }));
    for (const [id, cooldown] of Object.entries(data.spells)) if (this.spells[id]) this.spells[id].cooldown = cooldown;
    this.strikes = data.strikes.map((s) => ({ ...s }));
    Object.assign(this.stats, data.stats);
    for (const saved of data.towers) {
      const cell = this.level.cells[saved.cell];
      const def = TOWERS[saved.type];
      if (!cell || !def || !this.canBuild(cell)) continue;
      const tower = new Tower(this.nextTowerId++, def, cell, this.modifiers);
      tower.level = Math.min(saved.level, def.levels.length - 1);
      tower.spent = saved.spent;
      tower.targeting = saved.targeting;
      tower.kills = saved.kills;
      tower.cooldown = saved.cooldown;
      tower.refreshStats();
      this.towers.push(tower);
      this.towerByCell.set(cell.index, tower);
    }
    for (const saved of data.enemies) {
      const def = ENEMIES[saved.type];
      const enemy = this.enemies.find((e) => !e.active);
      if (!def || !enemy) continue;
      Object.assign(enemy, saved, { id: this.nextEnemyId++, active: true, def, armor: def.armor, view: null });
      delete enemy.type;
      this.level.sampleRoute(enemy.distance, this.sample);
      enemy.x = this.sample.x;
      enemy.z = this.sample.z;
      enemy.dirX = this.sample.dirX;
      enemy.dirZ = this.sample.dirZ;
    }
  }

  hasSpell(id) {
    return Boolean(this.spells[id]);
  }

  spellReady(id) {
    return Boolean(this.spells[id]) && this.spells[id].cooldown <= 0 && !this.over;
  }

  /** 0 = just cast, 1 = ready. */
  spellCharge(id) {
    const spell = this.spells[id];
    return 1 - Math.max(0, spell.cooldown) / spell.max;
  }

  castSpell(id, x, z) {
    const def = SPELLS[id];
    if (!def || !this.spellReady(id)) return false;
    this.spells[id].cooldown = this.spells[id].max;
    this.stats.spellsCast++;
    const power = def.damage * this.modifiers.spellPower * (0.45 + 0.55 * this.threat);
    const radiusSq = def.radius * def.radius;

    if (id === 'meteor') {
      this.strikes.push({ id, x, z, timer: def.delay, damage: power, radius: def.radius });
      this.listener.onSpellCast?.(id, x, z, null);
    } else if (id === 'blizzard') {
      this.listener.onSpellCast?.(id, x, z, null);
      for (const enemy of this.enemies) {
        if (!enemy.active || (enemy.x - x) ** 2 + (enemy.z - z) ** 2 > radiusSq) continue;
        // Bosses resist: frozen for half the time.
        enemy.freezeTimer = Math.max(enemy.freezeTimer, enemy.def.id === 'boss' ? def.freeze / 2 : def.freeze);
        this.damage(enemy, power, null);
      }
    } else if (id === 'quake') {
      this.listener.onSpellCast?.(id, x, z, null);
      for (const enemy of this.enemies) {
        if (!enemy.active) continue;
        enemy.stunTimer = Math.max(enemy.stunTimer, enemy.def.id === 'boss' ? def.stun / 2 : def.stun);
        this.damage(enemy, power, null);
      }
    } else if (id === 'repair') {
      const healed = Math.min(def.heal, this.startLives - this.lives);
      this.lives += healed;
      this.listener.onSpellCast?.(id, x, z, healed);
    } else if (id === 'goldrain') {
      const amount = Math.round((def.gold + def.goldPerWave * this.nextWave) * this.modifiers.spellPower);
      this.addGold(amount);
      this.listener.onSpellCast?.(id, x, z, amount);
    } else if (id === 'lightning') {
      const targets = this.enemies
        .filter((e) => e.active && (e.x - x) ** 2 + (e.z - z) ** 2 <= radiusSq)
        .sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2))
        .slice(0, def.targets);
      this.listener.onSpellCast?.(id, x, z, targets);
      targets.forEach((enemy, i) => this.damage(enemy, power * (1 - i * 0.08), null));
    }
    return true;
  }

  // ------------------------------------------------------------ simulation

  step(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.gold > this.stats.maxGold) this.stats.maxGold = this.gold;
    this.updateSpawners(dt);
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.callNextWave();
    }
    this.updateSpells(dt);
    this.updateEnemies(dt);
    if (this.over) return;
    this.updateTowers(dt);
    this.updateProjectiles(dt);
  }

  updateSpells(dt) {
    if (this.state === SIM_STATE.RUNNING) {
      for (const spell of Object.values(this.spells)) if (spell.cooldown > 0) spell.cooldown -= dt;
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const strike = this.strikes[i];
      strike.timer -= dt;
      if (strike.timer > 0) continue;
      this.strikes.splice(i, 1);
      this.listener.onSpellImpact?.(strike.id, strike.x, strike.z);
      this.areaDamage(strike.x, strike.z, strike.radius, strike.damage, null);
    }
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
    if (this.spawners.length === 0 && this.countdown < 0 && this.nextWave > 0 && this.nextWave < this.waveCount) {
      this.countdown = CONFIG.waves.countdown;
      this.listener.onCountdown?.(this.countdown);
    }
  }

  spawnEnemy(typeId, hpMultiplier, wave, distance) {
    const enemy = this.enemies.find((e) => !e.active);
    if (!enemy) {
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
    enemy.speed = def.speed * (0.94 + Math.random() * 0.12) * (this.heroic ? 1.1 : 1);
    enemy.distance = distance;
    enemy.slowFactor = 1;
    enemy.slowTimer = 0;
    enemy.freezeTimer = 0;
    enemy.stunTimer = 0;
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
      if (enemy.freezeTimer > 0 || enemy.stunTimer > 0) {
        if (enemy.freezeTimer > 0) enemy.freezeTimer -= dt;
        if (enemy.stunTimer > 0) enemy.stunTimer -= dt;
        continue;
      }
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
    this.waveLeaks[enemy.wave]++;
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
    const perfect = this.waveLeaks[wave] === 0;
    let bonus = CONFIG.economy.waveClearBonusBase + CONFIG.economy.waveClearBonusPerWave * (wave + 1);
    if (perfect) {
      bonus += CONFIG.economy.perfectWaveBonus + wave;
      this.stats.perfectWaves++;
    }
    this.gold += bonus;
    this.stats.wavesCleared++;
    this.listener.onWaveCleared?.(wave, bonus, perfect);
    if (!this.endless && this.nextWave === this.waveCount && this.waveRemaining.every((n) => n <= 0)) {
      this.state = SIM_STATE.WON;
      this.listener.onVictory?.(this.stars);
    }
  }

  damage(enemy, amount, tower, pierce = false) {
    if (!enemy.active) return;
    const dealt = pierce ? amount : Math.max(amount * CONFIG.combat.minDamageShare, amount - enemy.armor);
    enemy.hp -= dealt;
    if (tower) tower.damageDealt += dealt;
    this.listener.onEnemyHit?.(enemy, dealt);
    if (enemy.hp <= 0) this.kill(enemy, tower);
  }

  areaDamage(x, z, radius, amount, tower) {
    const radiusSq = radius * radius;
    const edge = CONFIG.combat.splashEdgeDamage;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const distSq = (enemy.x - x) ** 2 + (enemy.z - z) ** 2;
      if (distSq > radiusSq) continue;
      this.damage(enemy, amount * (1 - (1 - edge) * Math.sqrt(distSq / radiusSq)), tower);
    }
  }

  kill(enemy, tower) {
    enemy.active = false;
    const def = enemy.def;
    this.gold += def.reward;
    this.stats.kills++;
    if (def.id === 'boss') this.stats.bossKills++;
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
      if (stats.income) continue;
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

  /** Tesla: instant arc that jumps to the nearest enemies not hit yet. */
  chainLightning(tower, target, stats) {
    const chain = [target];
    let current = target;
    while (chain.length < stats.chains) {
      let next = null;
      let best = CONFIG.combat.chainJump * CONFIG.combat.chainJump;
      for (const enemy of this.enemies) {
        if (!enemy.active || chain.includes(enemy)) continue;
        const d = (enemy.x - current.x) ** 2 + (enemy.z - current.z) ** 2;
        if (d < best) {
          best = d;
          next = enemy;
        }
      }
      if (!next) break;
      chain.push(next);
      current = next;
    }
    this.listener.onChain?.(tower, chain);
    chain.forEach((enemy, i) => this.damage(enemy, stats.damage * 0.85 ** i, tower));
  }

  fire(tower, target, stats) {
    if (stats.chains) {
      this.chainLightning(tower, target, stats);
      return;
    }
    const p = this.projectiles.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.kind = tower.def.projectile;
    p.tower = tower;
    p.target = target;
    p.targetId = target.id;
    p.damage = stats.damage;
    p.splash = stats.splash ?? 0;
    p.pierce = Boolean(stats.armorPierce);
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
      const moving = target.freezeTimer > 0 || target.stunTimer > 0 ? 0 : target.speed * target.slowFactor;
      this.level.sampleRoute(target.distance + moving * stats.flightTime, this.sample);
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
    if (p.splash > 0) this.areaDamage(p.x, p.z, p.splash, p.damage, p.tower);
    else if (p.target && p.target.active && p.target.id === p.targetId) this.damage(p.target, p.damage, p.tower, p.pierce);
    p.target = null;
  }
}
