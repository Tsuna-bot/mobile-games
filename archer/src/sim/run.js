// A run through one chapter: the hero, the rooms one after another, monsters,
// arrows, enemy shots, dangers on the ground, pickups, levels and abilities.
// Pure logic at a fixed step; the renderer and the UI listen to its events.

import { CONFIG } from '../config.js';
import { ABILITIES, rollAbilities } from '../data/abilities.js';
import { ANGEL_AFTER, BOSS_LAYOUT, CHAPTERS, LAYOUTS } from '../data/chapters.js';
import { ENEMIES } from '../data/enemies.js';
import { seededRandom } from '../core/random.js';
import { Arena } from './arena.js';
import { updateEnemy } from './enemies.js';

export const STATE = Object.freeze({
  START: 'start', // choosing the starting ability
  FIGHT: 'fight',
  CLEARED: 'cleared', // door open, pickups flying in
  CHOOSE: 'choose', // level up: 1 ability out of 3
  ANGEL: 'angel', // heal or ability
  DEAD: 'dead',
  WON: 'won',
});

const P = CONFIG.player;
// Assassin tuning: kunai fans and the shadow strike.
const KUNAI = { damage: 0.4, marks: 3 };
const SHADOW = { share: 0.2, markedShare: 0.45, bossShare: 0.3, bossHit: 6, range: 6, chain: 3, cooldown: 5, vanish: 0.12, strike: 0.1, untouchable: 1 };
const ROOMS = 10;
const SPAWN_DELAY = 0.7;
const ORB_RADIUS = 1.35;
const ORB_SPEED = 3.2;
const ORB_HIT_EVERY = 0.45;
const DOOR_HALF = 0.9;
const HEART_CHANCE = 0.06;

/**
 * @param chapterIndex which chapter
 * @param gear player stats from equipment and talents: { hp, damage, rate, crit, critDamage, speed, dodge, ... }
 */
export class Run {
  constructor(chapterIndex = 0, gear = {}, listener = {}, seed = (Math.random() * 2 ** 31) >>> 0) {
    this.chapterIndex = chapterIndex;
    this.chapter = CHAPTERS[chapterIndex];
    this.listener = listener;
    this.random = seededRandom(seed);
    this.time = 0;
    this.roomIndex = 0;
    this.coins = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.taken = {};
    this.choices = [];
    this.pendingLevels = 0;
    this.player = this.createPlayer(gear);
    // Weapons change the shot: rate, speed, piercing, homing, bounces.
    const w = this.player.weapon;
    if (w === 'crossbow') this.player.rateMul *= 0.72;
    if (w === 'blades') {
      this.player.rateMul *= 1.35;
      this.player.ricochet += 1;
    }
    this.pet = this.createPet(gear.pet);
    this.enemies = [];
    this.arrows = [];
    this.shots = [];
    this.hazards = [];
    this.pickups = [];
    this.nextId = 1;
    this.loadRoom(0);
    // Archero opens with a free ability.
    this.state = STATE.START;
    this.choices = rollAbilities(this.taken, this.random, 1).filter((id) => id !== 'heal');
  }

  createPlayer(gear) {
    const maxHp = Math.round(P.hp * (gear.hpMul ?? 1) + (gear.hp ?? 0));
    return {
      x: 0, z: 0, radius: P.radius, dirX: 0, dirZ: -1,
      hp: maxHp, maxHp,
      baseDamage: P.damage * (gear.damageMul ?? 1) + (gear.damage ?? 0),
      damageMul: 1, rateMul: gear.rateMul ?? 1, speedMul: gear.speedMul ?? 1,
      crit: P.crit + (gear.crit ?? 0), critDamage: P.critDamage + (gear.critDamage ?? 0),
      dodge: gear.dodge ?? 0, armor: gear.armor ?? 0,
      front: 0, multishot: 0, diagonal: 0, side: 0, rear: 0, wallBounce: 0, ricochet: 0, pierce: false,
      burn: gear.burn ?? 0, frost: gear.frost ?? 0, poison: gear.poison ?? 0, bolt: gear.bolt ?? 0,
      orbs: [...(gear.orbs ?? [])], orbAngle: 0,
      lifeOnKill: gear.lifeOnKill ?? 0, deathBlast: 0,
      shieldMax: 0, shieldTimer: 0, shieldReady: false,
      moving: false, still: 0, cooldown: 0, invulnerable: 0, volley: null, target: null,
      bossDamage: gear.bossDamage ?? 0,
      healOnRoom: gear.healOnRoom ?? 0,
      coinMul: gear.coinMul ?? 1,
      weapon: gear.weapon ?? 'bow',
      // Assassin: kunai fans, marks and the shadow strike.
      kunai: gear.kunai ?? 0,
      shadow: gear.shadow ? { cooldown: 1.5, blink: null } : null,
    };
  }

  /** The pet flies behind the hero's shoulder and shoots on its own. */
  createPet(def) {
    if (!def) return null;
    return { def, x: 0, z: 0, cooldown: 1, power: def.power ?? 1, bob: 0 };
  }

  get damage() {
    return this.player.baseDamage * this.player.damageMul;
  }

  get room() {
    return this.roomIndex + 1;
  }

  get isBossRoom() {
    return this.roomIndex === ROOMS - 1;
  }

  get xpNeeded() {
    return Math.round(CONFIG.xp.base * CONFIG.xp.growth ** (this.level - 1));
  }

  // ------------------------------------------------------------ rooms

  loadRoom(index) {
    this.roomIndex = index;
    const boss = index === ROOMS - 1;
    const layout = boss ? BOSS_LAYOUT : LAYOUTS[Math.floor(this.random() * LAYOUTS.length)];
    this.arena = new Arena(layout);
    this.layout = layout;
    this.enemies = [];
    this.arrows = [];
    this.shots = [];
    this.hazards = [];
    this.pickups = [];
    const p = this.player;
    p.x = 0;
    p.z = this.arena.halfH - 1.2;
    p.cooldown = 0;
    p.volley = null;
    p.invulnerable = 1;
    if (this.pet) {
      this.pet.x = p.x - 0.7;
      this.pet.z = p.z;
    }
    this.flowTimer = 0;
    this.doorOpen = false;
    const spec = this.chapter.rooms[index];
    // Monsters appear in the top part, away from the hero.
    const free = this.arena.freeCells(1, boss ? 5 : 8);
    for (const [type, count] of spec) {
      for (let i = 0; i < count; i++) {
        const cell = free.length ? free.splice(Math.floor(this.random() * free.length), 1)[0] : 0;
        const at = this.arena.centerOf(cell);
        this.spawn(type, boss ? 0 : at.x, boss ? -3.5 : at.z, SPAWN_DELAY + i * 0.08);
      }
    }
    if (p.healOnRoom && index > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.healOnRoom);
    this.listener.onRoom?.(this.room, boss);
  }

  spawn(type, x, z, delay = SPAWN_DELAY) {
    const def = ENEMIES[type];
    const scale = this.chapter.hp * CONFIG.difficulty.health * (1 + CONFIG.difficulty.roomGrowth * this.roomIndex);
    const enemy = {
      id: this.nextId++, def, x, z, radius: def.radius, dirX: 0, dirZ: 1,
      hp: Math.round(def.hp * scale), maxHp: Math.round(def.hp * scale), power: Math.sqrt(scale),
      spawning: delay, state: 'idle', timer: 1 + this.random() * 1.5, phase: 0, step: 0,
      aimX: 0, aimZ: 0, vx: 0, vz: 0,
      slow: 0, slowTimer: 0, frozen: 0, burn: 0, burnTimer: 0, poison: 0, poisonTimer: 0, orbHit: 0,
      flash: 0, dead: false, view: null,
    };
    this.enemies.push(enemy);
    this.listener.onEnemySpawn?.(enemy);
    return enemy;
  }

  /** The hero walks through the open door at the top. */
  enterDoor() {
    this.listener.onDoor?.();
    if (this.isBossRoom) {
      this.state = STATE.WON;
      this.listener.onWin?.();
      return;
    }
    if (ANGEL_AFTER.includes(this.room)) {
      this.state = STATE.ANGEL;
      this.choices = rollAbilities(this.taken, this.random, 1, 2).filter((id) => id !== 'heal');
      this.listener.onAngel?.(this.choices);
      return;
    }
    this.loadRoom(this.roomIndex + 1);
    this.state = STATE.FIGHT;
  }

  // ------------------------------------------------------------ abilities and levels

  choose(id) {
    if (!this.choices.includes(id) && !(this.state === STATE.ANGEL && id === 'heal')) return false;
    const ability = ABILITIES[id];
    ability.apply(this.player);
    this.taken[id] = (this.taken[id] ?? 0) + 1;
    this.listener.onAbility?.(ability, this.taken[id]);
    this.choices = [];
    if (this.state === STATE.ANGEL) {
      this.loadRoom(this.roomIndex + 1);
      this.state = STATE.FIGHT;
      return true;
    }
    if (this.pendingLevels > 0) {
      this.pendingLevels--;
      this.offerLevel();
      return true;
    }
    this.state = this.enemies.some((e) => !e.dead) ? STATE.FIGHT : STATE.CLEARED;
    return true;
  }

  addXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && this.state !== STATE.CHOOSE && this.state !== STATE.DEAD) {
      this.pendingLevels--;
      this.offerLevel();
    }
  }

  offerLevel() {
    this.state = STATE.CHOOSE;
    const p = this.player;
    this.choices = rollAbilities(this.taken, this.random, p.hp / p.maxHp);
    this.listener.onLevelUp?.(this.level, this.choices);
  }

  // ------------------------------------------------------------ step

  /** @param input { x, z } joystick, length 0..1 (screen up = −z) */
  step(dt, input) {
    if (this.state !== STATE.FIGHT && this.state !== STATE.CLEARED) return;
    this.time += dt;
    this.updatePlayer(dt, input);
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.25;
      this.arena.computeFlow(this.player.x, this.player.z);
    }
    for (const enemy of this.enemies) if (!enemy.dead) this.updateEnemyCommon(enemy, dt);
    this.updateArrows(dt);
    this.updateShots(dt);
    this.updateHazards(dt);
    this.updateOrbs(dt);
    this.updatePet(dt);
    this.updatePickups(dt);
    if (this.enemies.length && this.enemies.every((e) => e.dead)) this.enemies = [];
    if (this.state === STATE.FIGHT && !this.enemies.length) this.clearRoom();
    if (this.state === STATE.CLEARED && this.doorOpen) {
      const p = this.player;
      if (p.z < -this.arena.halfH + 0.55 && Math.abs(p.x) < DOOR_HALF) this.enterDoor();
    }
  }

  clearRoom() {
    this.state = STATE.CLEARED;
    this.doorOpen = true;
    this.shots = [];
    this.hazards = [];
    for (const pickup of this.pickups) pickup.magnet = true;
    this.listener.onClear?.(this.isBossRoom);
  }

  updatePlayer(dt, input) {
    const p = this.player;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    if (p.shieldMax) {
      if (!p.shieldReady) {
        p.shieldTimer -= dt;
        if (p.shieldTimer <= 0) {
          p.shieldReady = true;
          this.listener.onShieldUp?.();
        }
      }
    }
    if (p.shadow && this.updateShadow(dt)) return;
    const len = Math.min(1, Math.hypot(input.x, input.z));
    p.moving = len > 0.12;
    if (p.moving) {
      const speed = P.speed * p.speedMul * len;
      p.dirX = input.x / Math.hypot(input.x, input.z);
      p.dirZ = input.z / Math.hypot(input.x, input.z);
      this.arena.move(p, p.dirX * speed * dt, p.dirZ * speed * dt);
      p.still = 0;
      p.volley = null;
      return;
    }
    // Standing still: aim at the nearest monster and shoot.
    p.still += dt;
    if (this.state !== STATE.FIGHT) return;
    const target = this.pickTarget();
    p.target = target;
    if (!target) return;
    p.dirX = target.x - p.x;
    p.dirZ = target.z - p.z;
    const d = Math.hypot(p.dirX, p.dirZ) || 1;
    p.dirX /= d;
    p.dirZ /= d;
    if (p.volley) {
      p.volley.timer -= dt;
      if (p.volley.timer <= 0) {
        this.fireVolley();
        p.volley.left--;
        p.volley = p.volley.left > 0 ? { timer: 0.12, left: p.volley.left } : null;
      }
    }
    p.cooldown -= dt;
    if (p.still < P.aimDelay || p.cooldown > 0) return;
    p.cooldown = 1 / (P.rate * p.rateMul);
    this.fireVolley();
    if (p.multishot) p.volley = { timer: 0.12, left: p.multishot };
  }

  // ------------------------------------------------------------ assassin

  /** A monster the shadow strike can finish: low life, or marked three times and hurt. */
  canExecute(e) {
    if (e.dead || e.spawning > 0) return false;
    const share = e.hp / e.maxHp;
    if (e.def.boss) return share <= SHADOW.bossShare;
    return share <= SHADOW.share || ((e.marks ?? 0) >= KUNAI.marks && share <= SHADOW.markedShare);
  }

  shadowTarget(x, z, exclude = null) {
    let best = null;
    let bestD = SHADOW.range * SHADOW.range;
    for (const e of this.enemies) {
      if (e === exclude || !this.canExecute(e)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /**
   * The shadow strike: vanish, appear behind a weak monster, finish it (bosses take a
   * huge critical hit instead), chain to another weak one (up to 3), then come back.
   * Untouchable during the whole move and one second after. Returns true while busy.
   */
  updateShadow(dt) {
    const p = this.player;
    const sh = p.shadow;
    const b = sh.blink;
    if (!b) {
      sh.cooldown -= dt;
      if (sh.cooldown > 0 || this.state !== STATE.FIGHT) return false;
      const target = this.shadowTarget(p.x, p.z);
      if (!target) return false;
      sh.blink = { target, homeX: p.x, homeZ: p.z, timer: SHADOW.vanish, phase: 'out', chain: 0 };
      p.volley = null;
      p.invulnerable = Math.max(p.invulnerable, 2);
      this.listener.onShadow?.('out', p.x, p.z, target);
      return true;
    }
    p.invulnerable = Math.max(p.invulnerable, 0.5);
    b.timer -= dt;
    if (b.timer > 0) return true;
    if (b.phase === 'out') {
      const e = b.target;
      if (e.dead) return this.shadowNext(b);
      // Appear behind the monster (seen from where the hero came from).
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const back = e.radius + 0.35;
      p.x = Math.max(-this.arena.halfW + p.radius, Math.min(this.arena.halfW - p.radius, e.x + (dx / d) * back));
      p.z = Math.max(-this.arena.halfH + p.radius, Math.min(this.arena.halfH - p.radius, e.z + (dz / d) * back));
      p.dirX = -dx / d;
      p.dirZ = -dz / d;
      b.phase = 'strike';
      b.timer = SHADOW.strike;
      this.listener.onShadow?.('in', p.x, p.z, e);
      return true;
    }
    if (b.phase === 'strike') {
      const e = b.target;
      if (!e.dead) {
        e.marks = 0;
        const boss = e.def.boss;
        const damage = boss ? this.damage * SHADOW.bossHit * (1 + p.bossDamage) : e.hp + 1;
        this.listener.onExecute?.(e, boss, damage);
        this.damageEnemy(e, damage, true, { execute: true });
      }
      return this.shadowNext(b);
    }
    // phase 'back': reappear where the move started.
    p.x = b.homeX;
    p.z = b.homeZ;
    sh.blink = null;
    sh.cooldown = SHADOW.cooldown;
    p.invulnerable = Math.max(p.invulnerable, SHADOW.untouchable);
    p.cooldown = Math.min(p.cooldown, 0.1);
    this.listener.onShadow?.('back', p.x, p.z, null);
    return false;
  }

  /** After a strike: chain to another weak monster close by, else head back. */
  shadowNext(b) {
    const p = this.player;
    const next = b.chain < SHADOW.chain - 1 && !b.target.def.boss && b.target.dead ? this.shadowTarget(p.x, p.z, b.target) : null;
    if (next && this.state === STATE.FIGHT) {
      b.chain++;
      b.target = next;
      b.phase = 'out';
      b.timer = SHADOW.vanish * 0.7;
      this.listener.onShadow?.('out', p.x, p.z, next);
      return true;
    }
    b.phase = 'back';
    b.timer = SHADOW.vanish;
    this.listener.onShadow?.('out', p.x, p.z, null);
    return true;
  }

  /** Nearest monster in sight; otherwise the nearest one at all. */
  pickTarget() {
    const p = this.player;
    let best = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.spawning > 0) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      const score = d + (this.arena.lineOfSight(p.x, p.z, e.x, e.z) ? 0 : 20);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  fireVolley() {
    const p = this.player;
    const base = Math.atan2(p.dirX, p.dirZ);
    const angles = [];
    // Front arrows side by side (offsets), then the extra directions.
    const front = 1 + p.front;
    for (let i = 0; i < front; i++) angles.push({ a: base, offset: (i - (front - 1) / 2) * 0.28 });
    for (let i = 1; i <= p.diagonal; i++) {
      const spread = 0.4 + (i - 1) * 0.18;
      angles.push({ a: base + spread, offset: 0 }, { a: base - spread, offset: 0 });
    }
    for (let i = 0; i < p.side; i++) angles.push({ a: base + Math.PI / 2 + i * 0.25, offset: 0 }, { a: base - Math.PI / 2 - i * 0.25, offset: 0 });
    for (let i = 0; i < p.rear; i++) angles.push({ a: base + Math.PI + (i - (p.rear - 1) / 2) * 0.3, offset: 0 });
    // Kunai: every direction becomes a fan of three blades.
    if (p.kunai) {
      const fan = [];
      for (const shot of angles) fan.push({ ...shot, fan: true }, { a: shot.a + 0.2, offset: shot.offset, fan: true }, { a: shot.a - 0.2, offset: shot.offset, fan: true });
      angles.length = 0;
      angles.push(...fan);
    }
    for (const { a, offset, fan } of angles) {
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const w = fan ? 'kunai' : p.weapon;
      if (fan) {
        this.arrows.push({
          id: this.nextId++, kind: 'kunai',
          x: p.x + dx * 0.35 + dz * offset, z: p.z + dz * 0.35 - dx * offset,
          dx, dz, speed: P.arrowSpeed * 1.3, damage: this.damage * KUNAI.damage, life: 1.6,
          bounces: p.wallBounce, ricochets: p.ricochet, hits: new Set(), view: null, pierceLeft: 1, homing: 0, marks: true,
        });
        continue;
      }
      this.arrows.push({
        id: this.nextId++, kind: w,
        x: p.x + dx * 0.35 + dz * offset, z: p.z + dz * 0.35 - dx * offset,
        dx, dz, speed: w === 'crossbow' ? P.arrowSpeed * 1.4 : w === 'staff' ? P.arrowSpeed * 0.75 : P.arrowSpeed,
        damage: this.damage, life: 2.2,
        bounces: p.wallBounce, ricochets: p.ricochet, hits: new Set(), view: null,
        pierceLeft: w === 'crossbow' ? 1 : 0, homing: w === 'staff' ? 7 : 0,
      });
    }
    this.listener.onShoot?.(angles.length);
  }

  // ------------------------------------------------------------ arrows

  updateArrows(dt) {
    const arena = this.arena;
    for (const arrow of this.arrows) {
      if (arrow.dead) continue;
      arrow.life -= dt;
      if (arrow.life <= 0) {
        arrow.dead = true;
        continue;
      }
      // Staff orbs curve toward the nearest monster in front of them.
      if (arrow.homing) {
        const target = this.nearestEnemy(arrow.x, arrow.z, 5, arrow.hits);
        if (target) {
          const want = Math.atan2(target.x - arrow.x, target.z - arrow.z);
          let a = Math.atan2(arrow.dx, arrow.dz);
          let d = want - a;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          a += Math.max(-arrow.homing * dt, Math.min(arrow.homing * dt, d));
          arrow.dx = Math.sin(a);
          arrow.dz = Math.cos(a);
        }
      }
      // Sub-steps so fast arrows never skip a thin monster.
      const n = 3;
      for (let s = 0; s < n && !arrow.dead; s++) {
        const nx = arrow.x + (arrow.dx * arrow.speed * dt) / n;
        const nz = arrow.z + (arrow.dz * arrow.speed * dt) / n;
        // Monsters first: a ghost floating over a block can still be hit.
        if (this.arrowHits(arrow, nx, nz)) continue;
        if (arena.wall(nx, nz)) {
          if (arrow.bounces > 0) {
            arrow.bounces--;
            // Reflect on the axis that hit.
            if (arena.wall(nx, arrow.z)) arrow.dx = -arrow.dx;
            if (arena.wall(arrow.x, nz)) arrow.dz = -arrow.dz;
            if (!arena.wall(nx, arrow.z) && !arena.wall(arrow.x, nz)) {
              arrow.dx = -arrow.dx;
              arrow.dz = -arrow.dz;
            }
            arrow.hits.clear();
            this.listener.onArrowBounce?.(arrow);
          } else {
            arrow.dead = true;
            this.listener.onArrowWall?.(arrow, nx, nz);
          }
          continue;
        }
        arrow.x = nx;
        arrow.z = nz;
      }
    }
    this.arrows = this.arrows.filter((a) => {
      if (a.dead) this.listener.onArrowGone?.(a);
      return !a.dead;
    });
  }

  /** Arrow at (x, z) touching a monster: damage, then ricochet, pierce or stop. Returns true when it redirected or stopped. */
  arrowHits(arrow, x, z) {
    for (const e of this.enemies) {
      if (e.dead || e.spawning > 0 || arrow.hits.has(e.id)) continue;
      const r = e.radius + 0.12;
      if ((e.x - x) ** 2 + (e.z - z) ** 2 > r * r) continue;
      arrow.hits.add(e.id);
      if (arrow.pet) {
        // Pet shots carry their own element, not the hero's.
        if (arrow.element === 'fire') {
          e.burn = Math.max(e.burn, arrow.damage * 0.6);
          e.burnTimer = 2;
        } else if (arrow.element === 'ice') {
          e.slow = Math.max(e.slow, 0.3);
          e.slowTimer = 1.2;
        }
        this.damageEnemy(e, arrow.damage, false, arrow);
        arrow.dead = true;
        return true;
      }
      if (arrow.marks && !e.dead) e.marks = Math.min(KUNAI.marks, (e.marks ?? 0) + 1);
      this.hitEnemy(e, arrow.damage, arrow);
      if (arrow.pierceLeft > 0) {
        arrow.pierceLeft--;
        return false;
      }
      if (arrow.ricochets > 0) {
        const next = this.nearestEnemy(e.x, e.z, 4, arrow.hits);
        if (next) {
          arrow.ricochets--;
          const d = Math.hypot(next.x - e.x, next.z - e.z) || 1;
          arrow.dx = (next.x - e.x) / d;
          arrow.dz = (next.z - e.z) / d;
          arrow.x = e.x;
          arrow.z = e.z;
          arrow.damage *= 0.7;
          arrow.life = 1;
          return true;
        }
      }
      if (this.player.pierce) {
        arrow.damage *= 0.67;
        return false;
      }
      arrow.dead = true;
      return true;
    }
    return false;
  }

  nearestEnemy(x, z, range, exclude) {
    let best = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (e.dead || e.spawning > 0 || exclude?.has(e.id)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** A hero hit (arrow, orb, lightning, blast): crits and elements. */
  hitEnemy(enemy, amount, source = null, { noElements = false, noCrit = false } = {}) {
    const p = this.player;
    let damage = amount;
    if (enemy.def.boss) damage *= 1 + p.bossDamage;
    const crit = !noCrit && this.random() < p.crit;
    if (crit) damage *= p.critDamage;
    if (!noElements) {
      if (p.burn) {
        enemy.burn = Math.max(enemy.burn, this.damage * 0.22 * p.burn);
        enemy.burnTimer = 2;
      }
      if (p.poison) {
        enemy.poison = Math.min(this.damage * 0.5 * p.poison, enemy.poison + this.damage * 0.08 * p.poison);
        enemy.poisonTimer = 6;
      }
      if (p.frost) {
        enemy.slow = 0.35;
        enemy.slowTimer = 1.5;
        if (!enemy.def.boss && this.random() < 0.08 * p.frost) enemy.frozen = 1;
      }
    }
    this.damageEnemy(enemy, damage, crit, source);
    if (!noElements && p.bolt) this.lightning(enemy, 2 + (p.bolt - 1), this.damage * 0.35 * p.bolt);
  }

  lightning(from, count, damage) {
    const hit = new Set([from.id]);
    let prev = from;
    for (let i = 0; i < count; i++) {
      const next = this.nearestEnemy(prev.x, prev.z, 3.2, hit);
      if (!next) break;
      hit.add(next.id);
      this.listener.onLightning?.(prev, next);
      this.damageEnemy(next, damage, false, null);
      prev = next;
    }
  }

  damageEnemy(enemy, damage, crit = false, source = null) {
    if (enemy.dead) return;
    enemy.hp -= damage;
    enemy.flash = 0.12;
    this.listener.onEnemyHit?.(enemy, damage, crit, source);
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    enemy.dead = true;
    enemy.hp = 0;
    this.kills++;
    const p = this.player;
    this.listener.onEnemyDie?.(enemy);
    if (p.lifeOnKill) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.lifeOnKill);
    if (p.deathBlast) {
      for (const other of this.enemies) {
        if (other.dead || other === enemy || (other.x - enemy.x) ** 2 + (other.z - enemy.z) ** 2 > 1.6 ** 2) continue;
        this.damageEnemy(other, this.damage * 0.45 * p.deathBlast, false, null);
      }
      this.listener.onDeathBlast?.(enemy);
    }
    // Drops: experience, coins, sometimes a heart.
    const drop = (kind, value) => this.pickups.push({ id: this.nextId++, kind, value, x: enemy.x + (this.random() - 0.5) * 0.8, z: enemy.z + (this.random() - 0.5) * 0.8, magnet: this.state === STATE.CLEARED, view: null });
    const orbs = Math.min(6, Math.ceil(enemy.def.xp / 3));
    for (let i = 0; i < orbs; i++) drop('xp', enemy.def.xp / orbs);
    const coins = Math.max(1, Math.round(enemy.def.coins * (1 + this.chapterIndex * 0.5) * p.coinMul));
    for (let i = 0; i < Math.min(5, coins); i++) drop('coin', coins / Math.min(5, coins));
    if (this.random() < HEART_CHANCE) drop('heart', 0.12);
  }

  // ------------------------------------------------------------ monsters

  updateEnemyCommon(enemy, dt) {
    if (enemy.flash > 0) enemy.flash -= dt;
    if (enemy.spawning > 0) {
      enemy.spawning -= dt;
      return;
    }
    // Damage over time.
    if (enemy.burnTimer > 0) {
      enemy.burnTimer -= dt;
      this.tickDot(enemy, enemy.burn * dt, 'burn');
    }
    if (enemy.poisonTimer > 0) {
      enemy.poisonTimer -= dt;
      this.tickDot(enemy, enemy.poison * dt, 'poison');
    }
    if (enemy.dead) return;
    if (enemy.slowTimer > 0) enemy.slowTimer -= dt;
    else enemy.slow = 0;
    if (enemy.frozen > 0) {
      enemy.frozen -= dt;
      return;
    }
    const speedMul = 1 - enemy.slow;
    updateEnemy(this, enemy, dt * speedMul, dt);
    // Contact damage.
    const p = this.player;
    const r = enemy.radius + p.radius - 0.05;
    if ((enemy.x - p.x) ** 2 + (enemy.z - p.z) ** 2 < r * r) this.hurtPlayer(enemy.def.touch * enemy.power, enemy);
  }

  tickDot(enemy, amount, kind) {
    enemy.dotAcc = (enemy.dotAcc ?? 0) + amount;
    if (enemy.dotAcc < 1) return;
    enemy.hp -= enemy.dotAcc;
    // Show the number about 3 times a second.
    enemy.dotShown = (enemy.dotShown ?? 0) + enemy.dotAcc;
    enemy.dotAcc = 0;
    if (this.time - (enemy.dotLast ?? 0) > 0.33) {
      enemy.dotLast = this.time;
      this.listener.onDot?.(enemy, enemy.dotShown, kind);
      enemy.dotShown = 0;
    }
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  /** Enemy projectile (orb, arrow, bone, rock). */
  fire(enemy, dx, dz, speed, damage, kind = 'orb', extra = {}) {
    const len = Math.hypot(dx, dz) || 1;
    const shot = {
      id: this.nextId++, kind, x: enemy.x + (dx / len) * enemy.radius, z: enemy.z + (dz / len) * enemy.radius,
      dx: dx / len, dz: dz / len, speed, damage: damage * enemy.power, radius: kind === 'orb' ? 0.2 : 0.14, life: 6, view: null,
      flying: true, ...extra,
    };
    this.shots.push(shot);
    this.listener.onEnemyShot?.(enemy, shot);
    return shot;
  }

  /** A circle on the ground that hurts when its timer ends (bombs, slams). */
  hazard(x, z, radius, delay, damage, kind = 'bomb') {
    const h = { id: this.nextId++, kind, x, z, radius, delay, max: delay, damage, view: null };
    this.hazards.push(h);
    this.listener.onHazard?.(h);
    return h;
  }

  updateShots(dt) {
    const p = this.player;
    for (const shot of this.shots) {
      shot.life -= dt;
      shot.x += shot.dx * shot.speed * dt;
      shot.z += shot.dz * shot.speed * dt;
      if (shot.turn) {
        const a = Math.atan2(shot.dx, shot.dz) + shot.turn * dt;
        shot.dx = Math.sin(a);
        shot.dz = Math.cos(a);
      }
      if (shot.life <= 0 || this.arena.wall(shot.x, shot.z)) {
        shot.dead = true;
        continue;
      }
      const r = shot.radius + p.radius - 0.06;
      if ((shot.x - p.x) ** 2 + (shot.z - p.z) ** 2 < r * r) {
        shot.dead = true;
        this.hurtPlayer(shot.damage, null);
      }
    }
    this.shots = this.shots.filter((s) => {
      if (s.dead) this.listener.onShotGone?.(s);
      return !s.dead;
    });
  }

  updateHazards(dt) {
    const p = this.player;
    for (const h of this.hazards) {
      h.delay -= dt;
      if (h.delay > 0) continue;
      h.dead = true;
      this.listener.onHazardBlast?.(h);
      if ((h.x - p.x) ** 2 + (h.z - p.z) ** 2 < (h.radius + p.radius * 0.5) ** 2) this.hurtPlayer(h.damage, null);
    }
    this.hazards = this.hazards.filter((h) => !h.dead);
  }

  updateOrbs(dt) {
    const p = this.player;
    if (!p.orbs.length) return;
    p.orbAngle += ORB_SPEED * dt;
    const n = p.orbs.length;
    for (let i = 0; i < n; i++) {
      const a = p.orbAngle + (i / n) * Math.PI * 2;
      const ox = p.x + Math.sin(a) * ORB_RADIUS;
      const oz = p.z + Math.cos(a) * ORB_RADIUS;
      for (const e of this.enemies) {
        if (e.dead || e.spawning > 0 || (e.x - ox) ** 2 + (e.z - oz) ** 2 > (e.radius + 0.3) ** 2) continue;
        if (this.time - (e.orbHit ?? -9) < ORB_HIT_EVERY) continue;
        e.orbHit = this.time;
        const kind = p.orbs[i];
        const damage = this.damage * 0.4;
        if (kind === 'fire') {
          e.burn = Math.max(e.burn, this.damage * 0.25);
          e.burnTimer = 2;
        } else if (kind === 'ice') {
          e.slow = 0.4;
          e.slowTimer = 1.5;
        }
        this.damageEnemy(e, damage, false, { orb: kind });
        if (kind === 'bolt') this.lightning(e, 2, this.damage * 0.3);
      }
    }
  }

  updatePet(dt) {
    const pet = this.pet;
    if (!pet) return;
    const p = this.player;
    pet.bob += dt;
    // Floats beside the hero, a little behind.
    const tx = p.x - p.dirZ * 0.7 - p.dirX * 0.4;
    const tz = p.z + p.dirX * 0.7 - p.dirZ * 0.4;
    const k = Math.min(1, dt * 6);
    pet.x += (tx - pet.x) * k;
    pet.z += (tz - pet.z) * k;
    if (this.state !== STATE.FIGHT) return;
    pet.cooldown -= dt;
    if (pet.cooldown > 0) return;
    const target = this.nearestEnemy(pet.x, pet.z, 9);
    if (!target) return;
    pet.cooldown = pet.def.rate;
    const d = Math.hypot(target.x - pet.x, target.z - pet.z) || 1;
    this.arrows.push({
      id: this.nextId++, kind: 'pet', pet: true, element: pet.def.element ?? null, color: pet.def.color,
      x: pet.x, z: pet.z, dx: (target.x - pet.x) / d, dz: (target.z - pet.z) / d, speed: 11,
      damage: this.player.baseDamage * pet.def.damage * pet.power, life: 1.6,
      bounces: 0, ricochets: 0, hits: new Set(), pierceLeft: 0, homing: 4,
    });
    this.listener.onPetShot?.(pet);
  }

  orbPositions(out = []) {
    const p = this.player;
    const n = p.orbs.length;
    out.length = 0;
    for (let i = 0; i < n; i++) {
      const a = p.orbAngle + (i / n) * Math.PI * 2;
      out.push({ kind: p.orbs[i], x: p.x + Math.sin(a) * ORB_RADIUS, z: p.z + Math.cos(a) * ORB_RADIUS });
    }
    return out;
  }

  updatePickups(dt) {
    const p = this.player;
    for (const item of this.pickups) {
      const dx = p.x - item.x;
      const dz = p.z - item.z;
      const d = Math.hypot(dx, dz);
      if (item.magnet || d < CONFIG.pickupRadius) {
        item.magnet = true;
        const speed = 9 + (item.flyTime = (item.flyTime ?? 0) + dt) * 14;
        const step = Math.min(d, speed * dt);
        item.x += (dx / (d || 1)) * step;
        item.z += (dz / (d || 1)) * step;
      }
      if (d < 0.35) {
        item.dead = true;
        if (item.kind === 'xp') this.addXp(item.value);
        else if (item.kind === 'coin') this.coins += item.value;
        else if (item.kind === 'heart') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * item.value);
        this.listener.onPickup?.(item);
      }
    }
    this.pickups = this.pickups.filter((i) => !i.dead);
  }

  // ------------------------------------------------------------ hero damage

  hurtPlayer(amount, enemy) {
    const p = this.player;
    if (p.invulnerable > 0 || this.state === STATE.DEAD) return;
    p.invulnerable = P.invulnerable;
    if (this.random() < p.dodge) {
      this.listener.onDodge?.();
      return;
    }
    if (p.shieldReady) {
      p.shieldReady = false;
      p.shieldTimer = p.shieldMax;
      this.listener.onShieldBlock?.();
      return;
    }
    const damage = Math.round(amount * CONFIG.difficulty.damage * (1 - Math.min(0.6, p.armor)));
    p.hp -= damage;
    this.listener.onPlayerHit?.(damage, enemy);
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = STATE.DEAD;
      this.listener.onDeath?.();
    }
  }

  /** Second chance (revive with half life), once per run. */
  revive() {
    if (this.state !== STATE.DEAD || this.revived) return false;
    this.revived = true;
    const p = this.player;
    p.hp = Math.round(p.maxHp * 0.5);
    p.invulnerable = 2.5;
    this.shots = [];
    this.hazards = [];
    this.state = this.enemies.some((e) => !e.dead) ? STATE.FIGHT : STATE.CLEARED;
    this.listener.onRevive?.();
    return true;
  }

  /** The first ability, chosen before the first room. */
  begin(id) {
    if (this.state !== STATE.START) return false;
    this.state = STATE.CHOOSE;
    return this.choose(id);
  }
}
