// A run through one chapter: the hero, the rooms one after another, monsters,
// arrows, enemy shots, dangers on the ground, pickups, levels and abilities.
// Pure logic at a fixed step; the renderer and the UI listen to its events.

import { CONFIG } from '../config.js';
import { ABILITIES, rollAbilities } from '../data/abilities.js';
import { ALL_CHAPTERS, ANGEL_AFTER, BOSS_LAYOUT, LAYOUTS } from '../data/chapters.js';
import { ENEMIES } from '../data/enemies.js';
import { ENDLESS, HEROIC, SPECIAL_ROOMS, eliteChance } from '../data/progression.js';
import { SPELLS, rankCooldown, rankPower } from '../data/heroes.js';
import { DROP_CHANCE, rollLoot, runeDrop } from '../data/loot.js';
import { seededRandom } from '../core/random.js';
import { Arena, CELL } from './arena.js';
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
const MAX_SHOTS = 160;
// Elite monsters: tougher, hit harder, drop more.
const ELITE = { health: 2.6, power: 1.3, radius: 1.12, coins: 3, xp: 2, heart: 0.4 };
// Shurikens fly out this long, then come back to the hero.
const BOOMERANG_OUT = 0.62;

/**
 * @param chapterIndex which chapter
 * @param gear player stats from equipment and talents: { hp, damage, rate, crit, critDamage, speed, dodge, ... }
 * @param options { mode: 'normal' | 'heroic' | 'endless', themes: landscapes the Endless mode goes through }
 */
export class Run {
  constructor(chapterIndex = 0, gear = {}, listener = {}, seed = (Math.random() * 2 ** 31) >>> 0, options = {}) {
    this.mode = options.mode ?? 'normal';
    this.endless = this.mode === 'endless';
    this.heroic = this.mode === 'heroic';
    this.themes = options.themes?.length ? options.themes : ['forest'];
    this.chapterIndex = this.endless ? 0 : chapterIndex;
    this.chapter = this.endless ? { id: 'endless', name: 'Mode Infini', theme: this.themes[0], hp: 1, rooms: [] } : ALL_CHAPTERS[chapterIndex];
    this.theme = this.chapter.theme;
    this.roomCount = this.endless ? Infinity : ROOMS;
    this.listener = listener;
    // Counters for the rewards, missions and achievements.
    this.gems = 0;
    this.eliteKills = 0;
    this.bossKills = 0;
    this.roomsCleared = 0;
    this.roomKind = 'normal';
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
    if (w === 'longbow') this.player.rateMul *= 0.8;
    if (w === 'tome') this.player.rateMul *= 0.85;
    if (w === 'blades') {
      this.player.rateMul *= 1.35;
      this.player.ricochet += 1;
    }
    this.pet = this.createPet(gear.pet);
    // The hero's spells (buttons during the run), their timed boosts and ground zones.
    this.spells = (gear.spells ?? []).filter((s) => SPELLS[s.id]).map((s) => {
      const def = SPELLS[s.id];
      const cooldown = def.cd * rankCooldown(s.rank) * (s.cdMul ?? 1);
      return { id: s.id, def, rank: s.rank, power: rankPower(s.rank) * (s.power ?? 1), cooldown, timer: Math.min(2, cooldown) };
    });
    this.buffs = [];
    this.zones = [];
    this.lastInput = { x: 0, z: 0 };
    // Loot found on the way (kept even on a defeat) and runes.
    this.loot = [];
    this.runes = 0;
    this.casts = 0;
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
    // Talent "Maître d'armes": more abilities to pick before the first room.
    this.pendingLevels += gear.startAbilities ?? 0;
  }

  createPlayer(gear) {
    const maxHp = Math.round(P.hp * (gear.hpMul ?? 1) + (gear.hp ?? 0));
    return {
      x: 0, z: 0, radius: P.radius, dirX: 0, dirZ: -1,
      hp: maxHp, maxHp,
      baseDamage: (P.damage + (gear.damage ?? 0)) * (gear.damageMul ?? 1),
      damageMul: 1, rateMul: gear.rateMul ?? 1, speedMul: gear.speedMul ?? 1,
      crit: P.crit + (gear.crit ?? 0), critDamage: P.critDamage + (gear.critDamage ?? 0),
      dodge: gear.dodge ?? 0, armor: gear.armor ?? 0,
      front: gear.front ?? 0, multishot: gear.multishot ?? 0, diagonal: gear.diagonal ?? 0, side: 0, rear: 0, wallBounce: 0, ricochet: gear.ricochet ?? 0, pierce: Boolean(gear.pierce),
      burn: gear.burn ?? 0, frost: gear.frost ?? 0, poison: gear.poison ?? 0, bolt: gear.bolt ?? 0,
      orbs: [...(gear.orbs ?? [])], orbAngle: 0,
      lifeOnKill: gear.lifeOnKill ?? 0, deathBlast: gear.deathBlast ?? 0,
      shieldMax: gear.shield ?? 0, shieldTimer: 0, shieldReady: Boolean(gear.shield),
      // Legendary powers and talents.
      explosive: gear.explosive ?? 0, fury: gear.fury ?? 0, veil: gear.veil ?? 0, xpMul: gear.xpMul ?? 1,
      magnet: 1 + (gear.magnet ?? 0), bossHeal: gear.bossHeal ?? 0, reviveShare: gear.reviveShare ?? 0.5, extraAngel: gear.extraAngel ?? 0,
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
    const p = this.player;
    // Legendary "Furie": stronger when badly hurt.
    const fury = p.fury && p.hp < p.maxHp * 0.4 ? 1 + p.fury : 1;
    return p.baseDamage * p.damageMul * fury;
  }

  get room() {
    return this.roomIndex + 1;
  }

  get isBossRoom() {
    return this.endless ? this.room % ENDLESS.bossEvery === 0 : this.roomIndex === ROOMS - 1;
  }

  /** How deep the run is (loot quality): the chapter, the Endless depth, Heroic higher. */
  get tier() {
    if (this.endless) return Math.min(17, Math.floor(this.roomIndex / 3));
    return Math.min(20, this.chapterIndex + (this.heroic ? 4 : 0));
  }

  /** Monster health multiplier of the current room. */
  healthScale() {
    const d = CONFIG.difficulty;
    if (this.endless) return ENDLESS.health(this.roomIndex) * d.health;
    const base = this.chapter.hp * d.health * (1 + d.roomGrowth * this.roomIndex);
    return this.heroic ? base * HEROIC.health : base;
  }

  /** Chance for a room monster to be elite. */
  eliteChance() {
    if (this.endless) return ENDLESS.elites(this.roomIndex);
    return this.heroic ? HEROIC.elites : eliteChance(this.chapterIndex);
  }

  /** Endless mode: the monsters of room `index` (a boss every few rooms). */
  endlessRoom(index) {
    const room = index + 1;
    if (room % ENDLESS.bossEvery === 0) {
      const boss = ENDLESS.bosses[(room / ENDLESS.bossEvery - 1) % ENDLESS.bosses.length];
      return [[boss, 1]];
    }
    const pool = ENDLESS.pool.filter(([, from]) => index >= from).map(([type]) => type);
    const count = Math.min(9, 3 + Math.floor(index / 3));
    const spec = new Map();
    for (let i = 0; i < count; i++) {
      const type = pool[Math.floor(this.random() * pool.length)];
      spec.set(type, (spec.get(type) ?? 0) + 1);
    }
    return [...spec];
  }

  get xpNeeded() {
    return Math.round(CONFIG.xp.base * CONFIG.xp.growth ** (this.level - 1));
  }

  // ------------------------------------------------------------ rooms

  loadRoom(index) {
    this.roomIndex = index;
    const boss = this.isBossRoom;
    // Endless: the landscape changes after each boss.
    if (this.endless) {
      this.theme = this.themes[Math.floor(index / ENDLESS.bossEvery) % this.themes.length];
      this.chapter.theme = this.theme;
    }
    // Now and then a treasure room or a challenge room (never twice in a row).
    const previous = this.roomKind;
    this.roomKind = 'normal';
    this.chest = null;
    if (!boss && index >= 1 && previous === 'normal') {
      const r = this.random();
      if (r < SPECIAL_ROOMS.treasure) this.roomKind = 'treasure';
      else if (r < SPECIAL_ROOMS.treasure + SPECIAL_ROOMS.challenge) this.roomKind = 'challenge';
    }
    const layout = boss ? BOSS_LAYOUT : LAYOUTS[Math.floor(this.random() * LAYOUTS.length)];
    this.arena = new Arena(layout);
    this.layout = layout;
    this.enemies = [];
    this.arrows = [];
    this.shots = [];
    this.hazards = [];
    this.zones = [];
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
    const spec = this.endless ? this.endlessRoom(index) : this.chapter.rooms[index];
    // Monsters appear in the top part, away from the hero.
    const free = this.arena.freeCells(1, boss ? 5 : 8);
    const elites = this.roomKind === 'challenge' ? 1 : this.eliteChance();
    for (const [type, full] of spec) {
      // A treasure room is lightly guarded.
      const count = this.roomKind === 'treasure' ? Math.ceil(full / 2) : full;
      for (let i = 0; i < count; i++) {
        const cell = free.length ? free.splice(Math.floor(this.random() * free.length), 1)[0] : 0;
        const at = this.arena.centerOf(cell);
        const elite = !boss && this.random() < elites;
        this.spawn(type, boss ? 0 : at.x, boss ? -3.5 : at.z, SPAWN_DELAY + i * 0.08, { elite });
      }
    }
    if (this.roomKind === 'treasure') this.chest = this.freeSpotNear(0, -1.5, 0.5);
    if (p.healOnRoom && index > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.healOnRoom);
    // Legendary "Renouveau": a heal at the boss's door.
    if (boss && p.bossHeal) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.bossHeal);
    this.listener.onRoom?.(this.room, boss, this.roomKind);
  }

  spawn(type, x, z, delay = SPAWN_DELAY, { elite = false } = {}) {
    const def = ENEMIES[type];
    // Summons and split blobs must not appear inside a block or a pit (they would be stuck).
    const radius = def.radius * (elite ? ELITE.radius : 1);
    if (!def.flying) ({ x, z } = this.freeSpotNear(x, z, radius));
    const scale = this.healthScale() * (elite ? ELITE.health : 1);
    const power = this.healthScale() ** (this.endless ? ENDLESS.damage : 0.5) * (this.heroic ? HEROIC.damage : 1) * (elite ? ELITE.power : 1);
    const enemy = {
      id: this.nextId++, def, x, z, radius, dirX: 0, dirZ: 1, elite,
      hp: Math.round(def.hp * scale), maxHp: Math.round(def.hp * scale), power,
      spawning: delay, state: 'idle', timer: 1 + this.random() * 1.5, phase: 0, step: 0,
      aimX: 0, aimZ: 0, vx: 0, vz: 0,
      slow: 0, slowTimer: 0, frozen: 0, burn: 0, burnTimer: 0, poison: 0, poisonTimer: 0, orbHit: 0,
      flash: 0, dead: false, view: null,
    };
    this.enemies.push(enemy);
    this.listener.onEnemySpawn?.(enemy);
    return enemy;
  }

  /** (x, z) if a walker of radius `r` fits there, else the centre of the nearest free floor cell. */
  freeSpotNear(x, z, r) {
    const arena = this.arena;
    x = Math.max(-arena.halfW + r, Math.min(arena.halfW - r, x));
    z = Math.max(-arena.halfH + r, Math.min(arena.halfH - r, z));
    if (!arena.overlaps(x, z, r)) return { x, z };
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < arena.cells.length; i++) {
      if (arena.cells[i] !== CELL.FLOOR) continue;
      const c = arena.centerOf(i);
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bestD && !arena.overlaps(c.x, c.z, r)) {
        bestD = d;
        best = c;
      }
    }
    return best ?? { x, z };
  }

  /** The hero walks through the open door at the top. */
  enterDoor() {
    this.listener.onDoor?.();
    if (this.isBossRoom && !this.endless) {
      this.state = STATE.WON;
      this.listener.onWin?.();
      return;
    }
    // An angel after room 5 (and 8 with the "Ange gardien" talent); in Endless, after each boss.
    const angel = this.endless ? this.isBossRoom : ANGEL_AFTER.includes(this.room) || (this.player.extraAngel && this.room === 8);
    if (angel) {
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
    // Back to the fight; a room emptied during the choice gets cleared (or won) on the next step.
    this.state = this.enemies.some((e) => !e.dead) || !this.doorOpen ? STATE.FIGHT : STATE.CLEARED;
    return true;
  }

  addXp(amount) {
    this.xp += amount * this.player.xpMul;
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
    this.lastInput = input;
    this.updateSpells(dt);
    this.updatePlayer(dt, input);
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.25;
      this.arena.computeFlow(this.player.x, this.player.z);
    }
    for (const enemy of this.enemies) if (!enemy.dead) this.updateEnemyCommon(enemy, dt);
    // Safety net: a position that went NaN is put back in the arena instead of breaking the view.
    const p0 = this.player;
    if (!Number.isFinite(p0.x) || !Number.isFinite(p0.z)) {
      p0.x = 0;
      p0.z = this.arena.halfH - 1.2;
    }
    for (const e of this.enemies) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) {
        e.x = 0;
        e.z = -this.arena.halfH + 2;
      }
    }
    this.updateArrows(dt);
    this.updateShots(dt);
    this.updateHazards(dt);
    this.updateZones(dt);
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
    this.roomsCleared++;
    // The boss is down: the chapter is won right away (no door, no last ability).
    if (this.isBossRoom && !this.endless) {
      for (const item of this.pickups) {
        if (item.kind === 'coin') this.coins += item.value;
        else if (item.kind === 'loot' || item.kind === 'rune') this.collect(item);
      }
      this.pickups = [];
      this.shots = [];
      this.hazards = [];
      this.pendingLevels = 0;
      this.state = STATE.WON;
      this.listener.onWin?.();
      return;
    }
    this.state = STATE.CLEARED;
    this.doorOpen = true;
    this.shots = [];
    this.hazards = [];
    this.zones = [];
    if (this.endless && this.isBossRoom) this.gems += ENDLESS.gemsPerBoss;
    // Treasure: the chest bursts into gold (and a heart).
    if (this.roomKind === 'treasure' && this.chest) {
      const { x, z } = this.chest;
      const value = 6 + this.chapterIndex * 4 + (this.endless ? Math.floor(this.roomIndex / 5) * 4 : 0);
      for (let i = 0; i < 14; i++) this.pickups.push({ id: this.nextId++, kind: 'coin', value: value * this.player.coinMul, x: x + (this.random() - 0.5) * 1.6, z: z + (this.random() - 0.5) * 1.6, magnet: false, view: null });
      this.pickups.push({ id: this.nextId++, kind: 'heart', value: 0.2, x, z: z + 0.4, magnet: false, view: null });
      this.listener.onChestOpen?.(this.chest);
      this.chest = null;
    }
    for (const pickup of this.pickups) pickup.magnet = true;
    this.listener.onClear?.(this.isBossRoom, this.roomKind);
    // Challenge won: 3 gems and a free ability.
    if (this.roomKind === 'challenge') {
      this.gems += 3;
      this.pendingLevels++;
      this.addXp(0);
    }
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
    const limit = this.player.shadow?.cfg?.share ?? SHADOW.share;
    return share <= limit || ((e.marks ?? 0) >= KUNAI.marks && share <= SHADOW.markedShare);
  }

  /** A weak monster in reach; when cast as a spell, else the most hurt one around. */
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
    if (best || !this.player.shadow?.cfg?.forced) return best;
    let share = Infinity;
    for (const e of this.enemies) {
      if (e === exclude || e.dead || e.spawning > 0 || (e.x - x) ** 2 + (e.z - z) ** 2 > 64) continue;
      const s = e.hp / e.maxHp;
      if (s < share) {
        share = s;
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
        if (this.canExecute(e) || !sh.cfg) {
          const damage = boss ? this.damage * SHADOW.bossHit * (1 + p.bossDamage) : e.hp + 1;
          this.listener.onExecute?.(e, boss, damage);
          this.damageEnemy(e, damage, true, { execute: true });
        } else this.hitEnemy(e, sh.cfg.damage, { spell: 'shadowStrike' }, { noElements: true });
      }
      return this.shadowNext(b);
    }
    // phase 'back': reappear where the move started.
    p.x = b.homeX;
    p.z = b.homeZ;
    sh.blink = null;
    // Cast as a spell: it waits for the next cast.
    sh.cooldown = sh.cfg ? Infinity : SHADOW.cooldown;
    p.invulnerable = Math.max(p.invulnerable, SHADOW.untouchable);
    p.cooldown = Math.min(p.cooldown, 0.1);
    this.listener.onShadow?.('back', p.x, p.z, null);
    return false;
  }

  /** After a strike: chain to another weak monster close by, else head back. */
  shadowNext(b) {
    const p = this.player;
    const chain = p.shadow.cfg?.chain ?? SHADOW.chain;
    const next = b.chain < chain - 1 && !b.target.def.boss && (b.target.dead || p.shadow.cfg) ? this.shadowTarget(p.x, p.z, b.target) : null;
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
      const speed = { crossbow: 1.4, staff: 0.75, longbow: 1.25, tome: 0.7, shuriken: 1.05 }[w] ?? 1;
      this.arrows.push({
        id: this.nextId++, kind: w,
        x: p.x + dx * 0.35 + dz * offset, z: p.z + dz * 0.35 - dx * offset,
        dx, dz, speed: P.arrowSpeed * speed,
        damage: this.damage, life: 2.2,
        bounces: p.wallBounce, ricochets: p.ricochet, hits: new Set(), view: null,
        // Crossbow bolts go through one monster, long bow arrows through all of them.
        pierceLeft: w === 'crossbow' ? 1 : w === 'longbow' ? 99 : 0,
        homing: w === 'staff' ? 7 : w === 'tome' ? 5 : 0,
        boomerang: w === 'shuriken', age: 0, explosive: p.explosive > 0,
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
      // Shurikens turn back after a while and fly home, through walls.
      if (arrow.boomerang) {
        arrow.age += dt;
        if (arrow.grace > 0) arrow.grace -= dt;
        if (!arrow.returning && arrow.age > BOOMERANG_OUT) this.turnBack(arrow);
        if (arrow.returning) {
          const p = this.player;
          const hx = p.x - arrow.x;
          const hz = p.z - arrow.z;
          const d = Math.hypot(hx, hz);
          if (d < 0.45) {
            arrow.dead = true;
            continue;
          }
          arrow.dx = hx / d;
          arrow.dz = hz / d;
        }
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
        if (arena.wall(nx, nz) && !arrow.returning && !arrow.ghost) {
          if (arrow.boomerang && arrow.bounces <= 0) {
            this.turnBack(arrow);
            continue;
          }
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

  /** A shuriken heads back to the hero (it may hit the same monsters again). */
  turnBack(arrow, from = null) {
    arrow.returning = true;
    arrow.life = 2;
    arrow.hits.clear();
    arrow.graceId = from?.id ?? null;
    arrow.grace = 0.18;
    arrow.speed *= 1.1;
  }

  /** Legendary crossbow: a small blast around the impact. */
  explode(x, z, damage, except) {
    for (const e of this.enemies) {
      if (e.dead || e === except || e.spawning > 0 || (e.x - x) ** 2 + (e.z - z) ** 2 > 1.4 ** 2) continue;
      this.damageEnemy(e, damage, false, null);
    }
    this.listener.onExplosion?.(x, z);
  }

  /** Arrow at (x, z) touching a monster: damage, then ricochet, pierce or stop. Returns true when it redirected or stopped. */
  arrowHits(arrow, x, z) {
    for (const e of this.enemies) {
      if (e.dead || e.spawning > 0 || arrow.hits.has(e.id)) continue;
      if (arrow.grace > 0 && arrow.graceId === e.id) continue;
      const r = e.radius + (arrow.width ?? 0.12);
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
      // Grimoire: every hit throws a chain of lightning.
      if (arrow.kind === 'tome') this.lightning(e, 2, arrow.damage * 0.4);
      if (arrow.explosive) this.explode(e.x, e.z, arrow.damage * 0.45, e);
      if (arrow.boomerang) {
        // Out: back to the hero after the first hit (unless the legendary lets it pierce);
        // on the way back it goes through everything.
        if (!arrow.returning && !this.player.pierce) {
          this.turnBack(arrow, e);
          return true;
        }
        return false;
      }
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

  lightning(from, count, damage, range = 3.2) {
    const hit = new Set([from.id]);
    let prev = from;
    for (let i = 0; i < count; i++) {
      const next = this.nearestEnemy(prev.x, prev.z, range, hit);
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
    if (enemy.elite) this.eliteKills++;
    if (enemy.def.boss) this.bossKills++;
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
    const xp = enemy.def.xp * (enemy.elite ? ELITE.xp : 1);
    const orbs = Math.min(6, Math.ceil(xp / 3));
    for (let i = 0; i < orbs; i++) drop('xp', xp / orbs);
    const tier = this.endless ? Math.min(7, Math.floor(this.roomIndex / 5)) : this.chapterIndex;
    const coins = Math.max(1, Math.round(enemy.def.coins * (1 + tier * 0.5) * (this.heroic ? 1.5 : 1) * (enemy.elite ? ELITE.coins : 1) * p.coinMul));
    for (let i = 0; i < Math.min(5, coins); i++) drop('coin', coins / Math.min(5, coins));
    if (this.random() < (enemy.elite ? ELITE.heart : HEART_CHANCE)) drop('heart', 0.12);
    // Loot: an item now and then (elites often, bosses always, two in the deeper chapters), and runes.
    if (!enemy.minion) {
      const source = enemy.def.boss ? 'boss' : enemy.elite ? 'elite' : 'normal';
      const items = source === 'boss' ? (this.tier >= 6 ? 2 : 1) : this.random() < DROP_CHANCE[source] ? 1 : 0;
      for (let i = 0; i < items; i++) drop('loot', rollLoot(source, this.tier, this.random));
      const runes = runeDrop(source, this.tier);
      if (runes) drop('rune', runes);
    }
    // Blobs split in two when they die.
    if (enemy.def.split) {
      for (const side of [-1, 1]) {
        const child = this.spawn(enemy.def.split, enemy.x + side * 0.4, enemy.z, 0.15);
        child.minion = true;
      }
    }
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
    // Safety cap: past this many shots in the air the oldest ones fade out.
    if (this.shots.length > MAX_SHOTS) this.shots.splice(0, this.shots.length - MAX_SHOTS);
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
      if (item.magnet || d < CONFIG.pickupRadius * p.magnet) {
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
        else this.collect(item);
        this.listener.onPickup?.(item);
      }
    }
    this.pickups = this.pickups.filter((i) => !i.dead);
  }

  /** Loot and runes picked up (or swept up when the boss falls). */
  collect(item) {
    if (item.kind === 'loot') {
      this.loot.push(item.value);
      this.listener.onLoot?.(item.value);
    } else if (item.kind === 'rune') this.runes += item.value;
  }

  // ------------------------------------------------------------ spells

  /** Seconds left before spell `i` is ready, and its full cooldown. */
  spellState(i) {
    const s = this.spells[i];
    return s ? { ready: s.timer <= 0, share: Math.max(0, s.timer) / s.cooldown, timer: s.timer } : null;
  }

  updateSpells(dt) {
    for (const s of this.spells) if (s.timer > 0) s.timer -= dt;
    if (!this.buffs.length) return;
    for (const b of this.buffs) {
      if (this.time < b.until) continue;
      b.revert();
      b.done = true;
      this.listener.onBuffEnd?.(b.spell);
    }
    this.buffs = this.buffs.filter((b) => !b.done);
  }

  /** Living monsters sorted by distance to the hero. */
  enemiesByDistance() {
    const p = this.player;
    return this.enemies
      .filter((e) => !e.dead && e.spawning <= 0)
      .map((e) => ({ e, d: (e.x - p.x) ** 2 + (e.z - p.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.e);
  }

  /** Casts spell `i` if it is ready; returns true on a cast. */
  castSpell(i) {
    const s = this.spells[i];
    if (!s || s.timer > 0 || this.state !== STATE.FIGHT) return false;
    const p = this.player;
    const def = s.def;
    const par = def.params;
    const k = s.power;
    const damage = this.damage * (par.damage ?? 0) * k;
    const source = { spell: def.id };
    const targets = this.enemiesByDistance();
    const offensive = !['buff', 'guard', 'dash'].includes(def.type);
    if (offensive && !targets.length) return false;
    const info = { x: p.x, z: p.z };
    switch (def.type) {
      case 'rain': {
        const count = par.count + (def.id === 'arrowRain' ? Math.floor((s.rank - 1) / 2) : 0);
        for (let n = 0; n < count; n++) {
          const e = targets[n % targets.length];
          // Most rains pick different monsters; a spread one falls again on the same ones.
          if (n >= targets.length && n > 0 && !par.spread) break;
          const zone = {
            id: this.nextId++, spell: def.id, x: e.x, z: e.z, radius: par.radius * (par.big ? 1 : 1), delay: par.delay + n * 0.07, damage,
            slow: par.slow, poison: par.poison ? damage * 0.3 : 0, burn: par.burn ? damage * 0.12 : 0, big: Boolean(par.big), freeze: par.freeze ?? 0,
          };
          zone.max = zone.delay;
          this.zones.push(zone);
          this.listener.onZone?.(zone, def);
        }
        break;
      }
      case 'pierce': {
        const t = targets[0];
        const d = Math.hypot(t.x - p.x, t.z - p.z) || 1;
        const dx = (t.x - p.x) / d;
        const dz = (t.z - p.z) / d;
        p.dirX = dx;
        p.dirZ = dz;
        this.arrows.push({
          id: this.nextId++, kind: 'gale', x: p.x + dx * 0.4, z: p.z + dz * 0.4, dx, dz, speed: P.arrowSpeed * 1.35, damage, life: 1.6,
          bounces: 0, ricochets: 0, hits: new Set(), view: null, pierceLeft: 99, homing: 0, width: par.width, ghost: true,
        });
        break;
      }
      case 'fan': {
        const count = par.count + (s.rank - 1) * 2;
        for (let n = 0; n < count; n++) {
          const a = (n / count) * Math.PI * 2;
          this.arrows.push({
            id: this.nextId++, kind: par.kunai ? 'kunai' : 'bow', x: p.x, z: p.z, dx: Math.sin(a), dz: Math.cos(a), speed: P.arrowSpeed * (par.kunai ? 1.3 : 1), damage, life: par.homing ? 2 : 1.4,
            bounces: 0, ricochets: 0, hits: new Set(), view: null, pierceLeft: par.homing ? 0 : 1, homing: par.homing ?? 0,
          });
        }
        break;
      }
      case 'buff': {
        const duration = par.duration + (s.rank - 1);
        const rate = par.rateMul ? 1 + (par.rateMul - 1) * k : 1;
        const dmg = par.damageMul ? 1 + (par.damageMul - 1) * k : 1;
        const speed = par.speedMul ?? 1;
        const crit = par.crit ?? 0;
        p.rateMul *= rate;
        p.damageMul *= dmg;
        p.speedMul *= speed;
        p.crit += crit;
        this.buffs.push({
          spell: def.id, until: this.time + duration,
          revert: () => {
            p.rateMul /= rate;
            p.damageMul /= dmg;
            p.speedMul /= speed;
            p.crit -= crit;
          },
        });
        info.duration = duration;
        break;
      }
      case 'guard': {
        const time = par.invulnerable + (s.rank - 1) * 0.3;
        p.invulnerable = Math.max(p.invulnerable, time);
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * par.heal * k);
        info.duration = time;
        break;
      }
      case 'dash': {
        const input = this.lastInput;
        const len = Math.hypot(input.x, input.z);
        let dx = len > 0.12 ? input.x / len : p.dirX;
        let dz = len > 0.12 ? input.z / len : p.dirZ;
        // Standing still: toward the nearest monster (or away if it is too close).
        if (len <= 0.12 && targets[0]) {
          const t = targets[0];
          const d = Math.hypot(t.x - p.x, t.z - p.z) || 1;
          dx = (t.x - p.x) / d;
          dz = (t.z - p.z) / d;
        }
        const hit = new Set();
        const steps = 12;
        for (let n = 0; n < steps; n++) {
          this.arena.move(p, (dx * par.distance) / steps, (dz * par.distance) / steps);
          for (const e of targets) {
            if (e.dead || hit.has(e.id) || (e.x - p.x) ** 2 + (e.z - p.z) ** 2 > (e.radius + 0.7) ** 2) continue;
            hit.add(e.id);
            this.hitEnemy(e, damage, source, { noElements: true });
            if (par.stun) this.stun(e, par.stun);
          }
        }
        p.dirX = dx;
        p.dirZ = dz;
        p.invulnerable = Math.max(p.invulnerable, par.invulnerable);
        p.cooldown = Math.min(p.cooldown, 0.05);
        p.volley = null;
        info.toX = p.x;
        info.toZ = p.z;
        break;
      }
      case 'nova': {
        const r = par.radius;
        for (const e of targets) {
          if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 > (r + e.radius) ** 2) continue;
          this.hitEnemy(e, damage, source, { noElements: true });
          if (e.dead) continue;
          if (par.freeze) this.stun(e, par.freeze + (s.rank - 1) * 0.2);
          if (par.stun) this.stun(e, par.stun);
          if (par.poison) {
            e.poison = Math.max(e.poison, damage * 0.25);
            e.poisonTimer = 5;
          }
          if (par.push && !e.def.boss) {
            const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
            this.arena.move(e, ((e.x - p.x) / d) * par.push, ((e.z - p.z) / d) * par.push);
          }
        }
        info.radius = r;
        break;
      }
      case 'shadow': {
        // Kaze's shadow strike: vanish, strike from behind, chain, come back.
        if (p.shadow?.blink) return false;
        p.shadow = {
          cooldown: 0, blink: null,
          cfg: { forced: true, chain: par.chain + Math.floor((s.rank - 1) / 2), share: par.execute + 0.03 * (s.rank - 1), damage },
        };
        break;
      }
      case 'execute': {
        let t = targets[0];
        for (const e of targets) if (e.hp > t.hp) t = e;
        const hit = damage * p.critDamage * (t.def.boss ? 1 + p.bossDamage : 1);
        info.toX = t.x;
        info.toZ = t.z;
        this.listener.onSpell?.(s, info);
        this.damageEnemy(t, hit, true, source);
        s.timer = s.cooldown;
        this.casts++;
        return true;
      }
      case 'chain': {
        const first = targets[0];
        info.toX = first.x;
        info.toZ = first.z;
        this.listener.onSpell?.(s, info);
        this.hitEnemy(first, damage, source, { noElements: true });
        this.lightning(first, par.jumps + (s.rank - 1), damage, 4.5);
        s.timer = s.cooldown;
        this.casts++;
        return true;
      }
      default:
        return false;
    }
    s.timer = s.cooldown;
    this.casts++;
    this.listener.onSpell?.(s, info);
    return true;
  }

  /** Frozen in place (bosses are only slowed). */
  stun(e, time) {
    if (e.def.boss) {
      e.slow = Math.max(e.slow, 0.5);
      e.slowTimer = Math.max(e.slowTimer, time);
    } else e.frozen = Math.max(e.frozen, time);
  }

  /** The hero's ground spells (rain, meteor, thorns) land when their timer ends. */
  updateZones(dt) {
    if (!this.zones.length) return;
    for (const z of this.zones) {
      z.delay -= dt;
      if (z.delay > 0) continue;
      z.dead = true;
      this.listener.onZoneBlast?.(z);
      for (const e of this.enemies) {
        if (e.dead || e.spawning > 0 || (e.x - z.x) ** 2 + (e.z - z.z) ** 2 > (z.radius + e.radius) ** 2) continue;
        this.hitEnemy(e, z.damage, { spell: z.spell }, { noElements: true });
        if (e.dead) continue;
        if (z.slow) {
          e.slow = Math.max(e.slow, 0.5);
          e.slowTimer = 2.5;
        }
        if (z.freeze) this.stun(e, z.freeze);
        if (z.poison) {
          e.poison = Math.max(e.poison, z.poison);
          e.poisonTimer = 5;
        }
        if (z.burn) {
          e.burn = Math.max(e.burn, z.burn);
          e.burnTimer = 3;
        }
      }
    }
    this.zones = this.zones.filter((z) => !z.dead);
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
    // Legendary "Voile d'ombre": untouchable a little longer.
    if (p.veil) p.invulnerable += p.veil;
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
    p.hp = Math.round(p.maxHp * p.reviveShare);
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
