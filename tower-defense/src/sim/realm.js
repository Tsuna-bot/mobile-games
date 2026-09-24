// Kingdom mode simulation: an open, seeded map around the castle. Pure logic
// (no three.js, no DOM), built on the campaign Simulation for all the combat:
// towers, projectiles, spells and enemy stats. What changes here:
// - enemies walk a flow field toward the castle instead of a fixed road, and
//   smash the walls or buildings in their way when that is shorter;
// - workers gather wood, stone and crystal during the day;
// - a day/night cycle replaces waves, and the game never ends (a fallen castle
//   costs part of the stock, then the next day starts).

import { makeNoise, seededRandom } from '../core/random.js';
import { ENEMIES } from '../data/enemies.js';
import {
  BUILDINGS, BUILDING_COST_GROWTH, REALM, RESEARCH, TOWER_COST_GROWTH, makeNight, portalsOpen, realmModifiers,
  scaleCost, towerCost, towerHp, unlockedSpells, unlockedTowers,
} from '../data/realm.js';
import { SPELLS } from '../data/spells.js';
import { TOWERS } from '../data/towers.js';
import { SIM_STATE, Simulation, Tower } from './simulation.js';

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];
const FLOW_MAX = 10000;
const NODE_TYPES = ['tree', 'rock', 'crystal'];
const DAWN_DELAY = 2.5;
const WORKER_RETRY = 3;
const SIEGE_FX_EVERY = 0.7;

export const PHASE = Object.freeze({ DAY: 'day', NIGHT: 'night' });

/** The Kingdom map: grid, castle footprint, portals and resource nodes, generated from a seed. */
export class RealmGrid {
  constructor(seed, size = REALM.size) {
    this.seed = seed;
    this.def = { id: 'realm', theme: 'meadow', name: 'Royaume' };
    this.index = 7;
    this.width = size;
    this.height = size;
    this.cells = [];
    this.pathTiles = [];
    const center = (size - 1) / 2;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        this.cells.push({
          index: row * size + col, col, row,
          x: col - center, z: row - center,
          isPath: false, decoration: null, buildable: true,
          castle: Math.abs(col - center) <= 1 && Math.abs(row - center) <= 1,
          portal: -1,
          node: null,
          structure: null,
        });
      }
    }
    this.base = this.cellAt(center, center);
    const random = seededRandom(seed);
    // Portals at the edge midpoints, opened in a seeded order.
    const sides = [[center, 0], [size - 1, center], [center, size - 1], [0, center]];
    for (let i = sides.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [sides[i], sides[j]] = [sides[j], sides[i]];
    }
    this.portals = sides.map(([col, row], i) => {
      const cell = this.cellAt(col, row);
      cell.portal = i;
      cell.buildable = false;
      return cell;
    });
    this.spawn = this.portals[0];
    for (const cell of this.cells) if (cell.castle) cell.buildable = false;
    this.generate(random);
  }

  cellAt(col, row) {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return null;
    return this.cells[row * this.width + col];
  }

  cellAtWorld(x, z) {
    const center = (this.width - 1) / 2;
    return this.cellAt(Math.round(x + center), Math.round(z + center));
  }

  distanceToCastle(cell) {
    return Math.hypot(cell.x - this.base.x, cell.z - this.base.z);
  }

  generate(random) {
    const forest = makeNoise(this.seed ^ 0x51ed);
    const rocks = makeNoise(this.seed ^ 0x2b3c);
    const crystals = makeNoise(this.seed ^ 0x77a1);
    const place = (cell, type) => {
      const def = REALM.nodes[type];
      cell.node = { type, resource: def.resource, variant: Math.floor(random() * 3), amount: def.amount, max: def.amount, regrow: 0, reserved: 0 };
    };
    for (const cell of this.cells) {
      if (cell.castle || cell.portal >= 0) continue;
      const d = this.distanceToCastle(cell);
      if (d < 4.2) continue;
      if (this.portals.some((p) => Math.abs(p.col - cell.col) + Math.abs(p.row - cell.row) <= 1)) continue;
      if (forest(cell.col, cell.row, 5.5) > 0.6) place(cell, 'tree');
      else if (d > 6 && rocks(cell.col, cell.row, 4.5) > 0.68) place(cell, 'rock');
      else if (d > 9 && crystals(cell.col, cell.row, 4) > 0.73) place(cell, 'crystal');
      else if (random() < 0.03) place(cell, 'tree');
    }
    // Enough of everything near the castle for a good start.
    const ensure = (type, count, minD, maxD) => {
      const have = this.cells.filter((c) => c.node?.type === type && this.distanceToCastle(c) <= maxD).length;
      for (let k = have, guard = 0; k < count && guard < 400; guard++) {
        const angle = random() * Math.PI * 2;
        const r = minD + random() * (maxD - minD);
        const cell = this.cellAtWorld(this.base.x + Math.cos(angle) * r, this.base.z + Math.sin(angle) * r);
        if (!cell || cell.node || cell.castle || cell.portal >= 0) continue;
        place(cell, type);
        k++;
      }
    };
    ensure('tree', 12, 4.5, 8);
    ensure('rock', 6, 5.5, 9.5);
    ensure('crystal', 4, 8, 12.5);
    this.connectPortals(random);
    this.initial = this.cells.map((c) => (c.node ? c.node.type : null));
  }

  /** Clears a winding corridor from each portal whose way to the castle is fully wooded. */
  connectPortals(random) {
    for (const portal of this.portals) {
      if (this.reachable(portal)) continue;
      let cell = portal;
      for (let guard = 0; guard < 200 && !cell.castle; guard++) {
        if (cell.node) cell.node = null;
        const dx = Math.sign(this.base.col - cell.col);
        const dz = Math.sign(this.base.row - cell.row);
        const options = [];
        if (dx) options.push(this.cellAt(cell.col + dx, cell.row));
        if (dz) options.push(this.cellAt(cell.col, cell.row + dz));
        cell = options[Math.floor(random() * options.length)];
      }
    }
  }

  reachable(from) {
    const seen = new Uint8Array(this.cells.length);
    const queue = [from];
    seen[from.index] = 1;
    while (queue.length) {
      const cell = queue.pop();
      if (cell.castle) return true;
      for (let k = 0; k < 4; k++) {
        const next = this.cellAt(cell.col + DIRS[k][0], cell.row + DIRS[k][1]);
        if (!next || seen[next.index] || nodeBlocks(next)) continue;
        seen[next.index] = 1;
        queue.push(next);
      }
    }
    return false;
  }

  // The combat code samples a route for arcing shots; the Kingdom predicts from velocity instead.
  sampleRoute(_, out) {
    out.x = 0;
    out.z = 0;
    out.dirX = 0;
    out.dirZ = 1;
    return out;
  }
}

function nodeBlocks(cell) {
  return Boolean(cell.node && cell.node.amount > 0);
}

/** Walkable by workers: no live resource node, no building or tower, not inside the castle. Walls have gates. */
function walkable(cell) {
  return Boolean(cell) && !cell.castle && !nodeBlocks(cell) && (!cell.structure || cell.structure.def.id === 'wall');
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(priority, value) {
    const items = this.items;
    items.push([priority, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l][0] < items[m][0]) m = l;
        if (r < items.length && items[r][0] < items[m][0]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }

  get size() {
    return this.items.length;
  }
}

function createWorker(id) {
  return {
    id, job: null, state: 'idle', x: 0, z: 0, dirX: 0, dirZ: 1,
    cell: null, path: [], pathIndex: 0, node: null, preferred: null,
    carry: null, timer: 0, retry: 0, view: null,
  };
}

export class RealmSim extends Simulation {
  /**
   * @param save   `serialize()` output to resume, or null for a new kingdom
   * @param options.seed map seed for a new kingdom
   */
  constructor(save = null, listener = {}, { seed } = {}) {
    const mapSeed = save?.seed ?? seed ?? Math.floor(Math.random() * REALM.seedRange);
    const modifiers = realmModifiers({});
    super({ id: 'realm', theme: 'meadow', name: 'Royaume', startGold: 0, endless: true, hpScale: 1, waves: Infinity, seed: mapSeed }, 7, {}, { modifiers, spells: [] });
    this.realm = true;
    this.seed = mapSeed;
    this.research = {};
    this.day = 1;
    this.nextWave = 1;
    this.phase = PHASE.DAY;
    this.phaseTimer = REALM.firstDayLength;
    this.dawnTimer = -1;
    this.gold = REALM.start.gold;
    this.stock = { wood: REALM.start.wood, stone: REALM.start.stone, crystal: REALM.start.crystal };
    this.startLives = REALM.castleHp;
    this.lives = this.startLives;
    this.buildings = [];
    this.workers = [];
    this.nextWorkerId = 1;
    this.nextBuildingId = 1;
    this.nightWave = null;
    this.flow = new Float32Array(this.level.cells.length);
    this.flowDirty = true;
    this.bfsDist = new Float32Array(this.level.cells.length);
    this.bfsFrom = new Int32Array(this.level.cells.length);
    Object.assign(this.stats, { nightsSurvived: 0, bestNight: 0, gathered: 0, castleFalls: 0, wallsBuilt: 0 });
    this.refreshSpells();
    this.pendingSpawnAt = null;
    if (save) this.restoreRealm(save);
    this.syncWorkers();
    if (!save) ['wood', 'wood', 'stone'].forEach((job, i) => { if (this.workers[i]) this.workers[i].job = job; });
    this.computeFlow();
    this.listener = listener;
  }

  createLevel(def) {
    return new RealmGrid(def.seed);
  }

  get over() {
    return false;
  }

  get threat() {
    return makeNight(this.day, 1).hpMultiplier;
  }

  // ------------------------------------------------------------ resources

  storageCap() {
    let cap = REALM.baseStorage;
    for (const b of this.buildings) if (b.def.id === 'depot') cap += b.def.levels[b.level].storage;
    return Math.round(cap * this.modifiers.storage);
  }

  amountOf(resource) {
    return resource === 'gold' ? this.gold : this.stock[resource];
  }

  canAfford(cost) {
    return Object.entries(cost).every(([resource, amount]) => this.amountOf(resource) >= amount);
  }

  pay(cost) {
    if (!this.canAfford(cost)) return false;
    for (const [resource, amount] of Object.entries(cost)) {
      if (resource === 'gold') this.gold -= amount;
      else this.stock[resource] -= amount;
    }
    return true;
  }

  /** Adds to the stock up to the storage cap; returns what fitted. */
  addStock(resource, amount) {
    if (resource === 'gold') {
      this.addGold(amount);
      return amount;
    }
    const added = Math.max(0, Math.min(amount, this.storageCap() - this.stock[resource]));
    this.stock[resource] += added;
    this.stats.gathered += added;
    return added;
  }

  refund(cost, share) {
    const back = {};
    for (const [resource, amount] of Object.entries(cost)) {
      const value = Math.floor(amount * share);
      if (value > 0) back[resource] = this.addStock(resource, value);
    }
    return back;
  }

  // ------------------------------------------------------------ building

  get unlockedTowers() {
    return unlockedTowers(this.research);
  }

  hasAcademy() {
    return this.buildings.some((b) => b.def.id === 'academy');
  }

  canPlace(cell) {
    return Boolean(cell) && !cell.castle && cell.portal < 0 && !cell.structure && !nodeBlocks(cell);
  }

  canBuild(cell) {
    return this.canPlace(cell);
  }

  towerAt(cell) {
    return cell?.structure?.kind === 'tower' ? cell.structure : null;
  }

  structureAt(cell) {
    return cell?.structure ?? null;
  }

  occupy(cell, structure) {
    if (cell.node) {
      cell.node = null;
      this.listener.onNodeRemoved?.(cell);
    }
    cell.structure = structure;
    this.flowDirty = true;
    this.rerouteWorkers();
  }

  /** Price of a new tower or building now (towers, houses and depots get pricier as you own more). */
  buildCost(typeId) {
    if (TOWERS[typeId]) return scaleCost(towerCost(typeId, 0), 1 + TOWER_COST_GROWTH * this.towers.length);
    const def = BUILDINGS[typeId];
    if (def.id === 'wall' || def.unique) return def.levels[0].cost;
    const owned = this.buildings.filter((b) => b.def.id === typeId).length;
    return scaleCost(def.levels[0].cost, 1 + BUILDING_COST_GROWTH * owned);
  }

  build(typeId, cell) {
    const def = TOWERS[typeId];
    if (!def || !this.canPlace(cell) || !this.unlockedTowers.includes(typeId)) return null;
    const cost = this.buildCost(typeId);
    if (!this.pay(cost)) return null;
    const tower = new Tower(this.nextTowerId++, def, cell, this.modifiers);
    tower.kind = 'tower';
    tower.maxHp = Math.round(towerHp(0) * this.modifiers.hp);
    tower.hp = tower.maxHp;
    tower.spentCost = cost;
    this.towers.push(tower);
    this.towerByCell.set(cell.index, tower);
    this.occupy(cell, tower);
    this.stats.towersBuilt++;
    this.listener.onTowerBuilt?.(tower);
    return tower;
  }

  towerUpgradeCost(tower) {
    return tower.maxed ? null : towerCost(tower.def.id, tower.level + 1, this.modifiers.upgradeCost);
  }

  upgrade(tower) {
    const cost = this.towerUpgradeCost(tower);
    if (!cost || !this.pay(cost)) return false;
    tower.level++;
    tower.refreshStats();
    this.refreshHp(tower);
    if (tower.maxed) this.stats.towersMaxed++;
    this.listener.onTowerUpgraded?.(tower);
    return true;
  }

  maxHpOf(structure) {
    const base = structure.kind === 'tower' ? towerHp(structure.level) : structure.def.levels[structure.level].hp;
    return Math.round(base * this.modifiers.hp);
  }

  refreshHp(structure) {
    const max = this.maxHpOf(structure);
    structure.hp += max - structure.maxHp;
    structure.maxHp = max;
  }

  placeBuilding(typeId, cell) {
    const def = BUILDINGS[typeId];
    if (!def || !this.canPlace(cell)) return null;
    if (def.unique && this.buildings.some((b) => b.def.id === typeId)) return null;
    const cost = this.buildCost(typeId);
    if (!this.pay(cost)) return null;
    const building = this.addBuilding(def, cell, 0);
    building.spentCost = cost;
    return building;
  }

  addBuilding(def, cell, level, hp) {
    const building = { kind: 'building', id: this.nextBuildingId++, def, cell, x: cell.x, z: cell.z, level, hp: 0, maxHp: 0, view: null };
    building.maxHp = this.maxHpOf(building);
    building.hp = hp ?? building.maxHp;
    this.buildings.push(building);
    this.occupy(cell, building);
    if (def.id === 'wall') this.stats.wallsBuilt++;
    this.syncWorkers();
    this.listener.onBuildingBuilt?.(building);
    return building;
  }

  buildingUpgradeCost(building) {
    return building.def.levels[building.level + 1]?.cost ?? null;
  }

  upgradeBuilding(building) {
    const cost = this.buildingUpgradeCost(building);
    if (!cost || !this.pay(cost)) return false;
    building.level++;
    this.refreshHp(building);
    building.hp = building.maxHp;
    this.syncWorkers();
    this.listener.onBuildingUpgraded?.(building);
    return true;
  }

  /** Everything spent on a structure so far (for the demolish refund). */
  spentOn(structure) {
    const total = {};
    const addCost = (cost) => {
      for (const [r, a] of Object.entries(cost ?? {})) total[r] = (total[r] ?? 0) + a;
    };
    addCost(structure.spentCost ?? (structure.kind === 'tower' ? towerCost(structure.def.id, 0) : structure.def.levels[0].cost));
    for (let l = 1; l <= structure.level; l++) addCost(structure.kind === 'tower' ? towerCost(structure.def.id, l, this.modifiers.upgradeCost) : structure.def.levels[l].cost);
    return total;
  }

  /** Demolish a wall, building or tower: half of what it cost comes back. */
  demolish(structure) {
    const back = this.refund(this.spentOn(structure), 0.5);
    this.removeStructure(structure);
    this.listener.onStructureRemoved?.(structure, back);
    return back;
  }

  sell(tower) {
    this.demolish(tower);
    return 0;
  }

  removeStructure(structure) {
    const cell = structure.cell;
    if (cell.structure === structure) cell.structure = null;
    if (structure.kind === 'tower') {
      this.towers.splice(this.towers.indexOf(structure), 1);
      this.towerByCell.delete(cell.index);
      for (const p of this.projectiles) if (p.active && p.tower === structure) p.tower = null;
    } else {
      this.buildings.splice(this.buildings.indexOf(structure), 1);
      this.syncWorkers();
    }
    for (const enemy of this.enemies) if (enemy.attacking === structure) enemy.attacking = null;
    this.flowDirty = true;
    this.rerouteWorkers();
  }

  // ------------------------------------------------------------ research

  researchLevel(id) {
    return this.research[id] ?? 0;
  }

  researchCost(item) {
    return item.costs[this.researchLevel(item.id)] ?? null;
  }

  canResearch(item) {
    const cost = this.researchCost(item);
    return this.hasAcademy() && Boolean(cost) && this.canAfford(cost);
  }

  doResearch(id) {
    const item = RESEARCH.find((r) => r.id === id);
    if (!item || !this.canResearch(item)) return false;
    this.pay(this.researchCost(item));
    this.research[id] = this.researchLevel(id) + 1;
    this.applyResearch();
    this.listener.onResearch?.(item, this.research[id]);
    return true;
  }

  applyResearch() {
    Object.assign(this.modifiers, realmModifiers(this.research));
    for (const tower of this.towers) {
      tower.refreshStats();
      this.refreshHp(tower);
    }
    for (const building of this.buildings) this.refreshHp(building);
    const max = REALM.castleHp + this.modifiers.castleHp;
    this.lives += max - this.startLives;
    this.startLives = max;
    this.refreshSpells();
  }

  refreshSpells() {
    for (const id of unlockedSpells(this.research)) {
      if (this.spells[id]) continue;
      const spell = SPELLS[id];
      this.spells[id] = { cooldown: 0, max: spell.cooldown };
    }
    for (const [id, spell] of Object.entries(this.spells)) spell.max = SPELLS[id].cooldown * this.modifiers.spellCooldown;
  }

  castSpell(id, x, z) {
    if (id !== 'repair') return super.castSpell(id, x, z);
    if (!this.spellReady(id)) return false;
    this.spells[id].cooldown = this.spells[id].max;
    this.stats.spellsCast++;
    // In the Kingdom, repair also mends every wall and building a bit.
    const healed = Math.min(Math.round(SPELLS.repair.heal * 5 * this.modifiers.spellPower), this.startLives - this.lives);
    this.lives += healed;
    for (const s of [...this.buildings, ...this.towers]) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.3);
    this.listener.onSpellCast?.(id, x, z, healed);
    return true;
  }

  // ------------------------------------------------------------ day / night

  /** Starts the night now; skipped daylight pays a little gold. */
  callNight() {
    if (this.phase !== PHASE.DAY) return false;
    const bonus = Math.round(Math.max(0, this.phaseTimer) * REALM.earlyNightBonus);
    this.addGold(bonus);
    this.startNight(bonus);
    return true;
  }

  // The campaign "call wave" button maps to calling the night.
  callNextWave() {
    return this.callNight();
  }

  canCallWave() {
    return this.phase === PHASE.DAY;
  }

  get earlyCallBonus() {
    return this.phase === PHASE.DAY ? Math.round(Math.max(0, this.phaseTimer) * REALM.earlyNightBonus) : 0;
  }

  activePortals() {
    return this.level.portals.slice(0, portalsOpen(this.day));
  }

  startNight(bonus = 0) {
    this.phase = PHASE.NIGHT;
    this.state = SIM_STATE.RUNNING;
    const portals = this.activePortals();
    this.nightWave = makeNight(this.day, portals.length);
    this.spawners = [{ wave: this.nightWave, index: this.day, cursor: 0, elapsed: 0 }];
    this.waveRemaining = [];
    this.waveRemaining[this.day] = this.nightWave.spawns.length;
    this.waveLeaks = [];
    this.waveLeaks[this.day] = 0;
    this.dawnTimer = -1;
    for (const worker of this.workers) this.sendHome(worker);
    this.listener.onNightStart?.(this.day, this.nightWave, bonus);
  }

  dawn(fallen = false) {
    const night = this.day;
    this.phase = PHASE.DAY;
    this.state = SIM_STATE.READY;
    this.dawnTimer = -1;
    this.spawners = [];
    this.nightWave = null;
    this.day++;
    this.nextWave = this.day;
    this.phaseTimer = REALM.dayLength;
    const gold = fallen ? 0 : REALM.dawnGold(night);
    this.addGold(gold);
    if (!fallen) {
      this.stats.nightsSurvived++;
      this.stats.bestNight = Math.max(this.stats.bestNight, night);
      if (this.waveLeaks[night] === 0) this.stats.perfectWaves++;
    }
    this.stats.wavesCleared++;
    // Masons patch everything up by half of the damage.
    for (const s of [...this.buildings, ...this.towers]) s.hp = Math.min(s.maxHp, s.hp + (s.maxHp - s.hp) * 0.5);
    let income = 0;
    for (const tower of this.towers) {
      if (!tower.stats.income) continue;
      this.addGold(tower.stats.income);
      income += tower.stats.income;
      this.listener.onMineIncome?.(tower, tower.stats.income);
    }
    this.regrowNodes();
    for (const worker of this.workers) {
      worker.state = 'idle';
      worker.retry = 0;
    }
    this.listener.onDawn?.(this.day, { night, gold, income, fallen, gems: fallen ? 0 : REALM.dawnGems(night) });
  }

  regrowNodes() {
    let changed = false;
    for (const cell of this.level.cells) {
      const node = cell.node;
      if (!node || node.amount > 0) continue;
      if (node.regrow > 1) {
        node.regrow--;
        continue;
      }
      if (cell.structure || this.workers.some((w) => w.cell === cell)) continue;
      node.amount = node.max;
      node.regrow = 0;
      // Never let regrowth wall off a portal.
      this.computeFlow();
      if (this.activePortals().concat(this.level.portals).some((p) => this.flow[p.index] >= FLOW_MAX)) {
        node.amount = 0;
        node.regrow = 1;
        this.computeFlow();
        continue;
      }
      changed = true;
      this.listener.onNodeRegrown?.(cell);
    }
    if (changed) this.flowDirty = true;
  }

  castleFall() {
    const loss = {};
    for (const resource of ['wood', 'stone', 'crystal']) {
      loss[resource] = Math.floor(this.stock[resource] * REALM.fallLoss);
      this.stock[resource] -= loss[resource];
    }
    loss.gold = Math.floor(this.gold * REALM.fallLoss);
    this.gold -= loss.gold;
    this.stats.castleFalls++;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.active = false;
      this.listener.onEnemyRemoved?.(enemy);
    }
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.active = false;
      this.listener.onProjectileRemoved?.(p);
    }
    this.lives = Math.ceil(this.startLives * 0.5);
    this.listener.onCastleFallen?.(loss, this.day);
    this.dawn(true);
  }

  // ------------------------------------------------------------ enemies

  computeFlow() {
    const cells = this.level.cells;
    const flow = this.flow;
    flow.fill(FLOW_MAX);
    const heap = new MinHeap();
    for (const cell of cells) {
      if (!cell.castle) continue;
      flow[cell.index] = 0;
      heap.push(0, cell);
    }
    while (heap.size) {
      const [d, cell] = heap.pop();
      if (d > flow[cell.index]) continue;
      for (const [dc, dr, len] of DIRS) {
        const next = this.level.cellAt(cell.col + dc, cell.row + dr);
        if (!next || nodeBlocks(next) || next.castle) continue;
        if (len > 1 && !this.diagonalOpen(cell, dc, dr)) continue;
        // Moving from `next` into `cell`: pay for breaking through `cell` if it is built.
        const cost = len * (cell.structure ? 1 + REALM.breakCost : 1);
        const value = d + cost;
        if (value < flow[next.index]) {
          flow[next.index] = value;
          heap.push(value, next);
        }
      }
    }
    this.flowDirty = false;
  }

  /** Diagonal steps may not cut between two blocked cells. */
  diagonalOpen(cell, dc, dr) {
    const a = this.level.cellAt(cell.col + dc, cell.row);
    const b = this.level.cellAt(cell.col, cell.row + dr);
    return Boolean(a && b) && !nodeBlocks(a) && !nodeBlocks(b) && !a.structure && !b.structure;
  }

  /** Best neighbor of `cell` toward the castle (entering a built cell means breaking it). */
  nextStep(cell) {
    let best = null;
    let bestValue = Infinity;
    for (const [dc, dr, len] of DIRS) {
      const next = this.level.cellAt(cell.col + dc, cell.row + dr);
      if (!next || nodeBlocks(next)) continue;
      if (len > 1 && !this.diagonalOpen(cell, dc, dr)) continue;
      const value = next.castle ? -1 : this.flow[next.index] + len * (next.structure ? 1 + REALM.breakCost : 1);
      if (value < bestValue) {
        bestValue = value;
        best = next;
      }
    }
    if (best && bestValue < FLOW_MAX) return best;
    // Walled in by regrown trees (should not happen): the saucer flies straight toward the castle.
    const base = this.level.base;
    return this.level.cellAt(cell.col + Math.sign(base.col - cell.col), cell.row + Math.sign(base.row - cell.row));
  }

  /** New enemies appear at `pendingSpawnAt` (a portal, or where a mothership died). */
  placeEnemy(enemy) {
    const source = this.pendingSpawnAt ?? { cell: this.level.portals[0], x: this.level.portals[0].x, z: this.level.portals[0].z, portal: true };
    enemy.cell = source.cell;
    enemy.next = null;
    enemy.attacking = null;
    enemy.siegeTimer = 0;
    enemy.fromPortal = Boolean(source.portal);
    enemy.x = source.x + (source.portal ? 0 : (Math.random() - 0.5) * 0.3);
    enemy.z = source.z + (source.portal ? 0 : (Math.random() - 0.5) * 0.3);
    const dx = this.level.base.x - enemy.x;
    const dz = this.level.base.z - enemy.z;
    const len = Math.hypot(dx, dz) || 1;
    enemy.dirX = dx / len;
    enemy.dirZ = dz / len;
    enemy.distance = FLOW_MAX - this.flow[source.cell.index];
  }

  kill(enemy, tower) {
    // Children of a mothership appear where it died.
    this.pendingSpawnAt = { cell: enemy.cell, x: enemy.x, z: enemy.z };
    super.kill(enemy, tower);
    this.pendingSpawnAt = null;
  }

  enemyGone(wave) {
    this.waveRemaining[wave]--;
    if (this.phase === PHASE.NIGHT && this.spawners.length === 0 && !this.enemies.some((e) => e.active) && this.dawnTimer < 0) {
      this.dawnTimer = DAWN_DELAY;
    }
  }

  leak(enemy) {
    enemy.active = false;
    this.lives = Math.max(0, this.lives - enemy.def.leak * REALM.leakDamage);
    this.stats.leaked++;
    this.waveLeaks[enemy.wave] = (this.waveLeaks[enemy.wave] ?? 0) + 1;
    this.listener.onEnemyLeaked?.(enemy);
    if (this.lives <= 0) {
      this.castleFall();
      return;
    }
    this.enemyGone(enemy.wave);
  }

  predictPosition(target, time, out) {
    const moving = target.freezeTimer > 0 || target.stunTimer > 0 || target.attacking ? 0 : target.speed * target.slowFactor;
    out.x = target.x + target.dirX * moving * time;
    out.z = target.z + target.dirZ * moving * time;
    return out;
  }

  updateRealmSpawners(dt) {
    const portals = this.activePortals();
    for (let i = this.spawners.length - 1; i >= 0; i--) {
      const spawner = this.spawners[i];
      spawner.elapsed += dt;
      const spawns = spawner.wave.spawns;
      while (spawner.cursor < spawns.length && spawns[spawner.cursor].time <= spawner.elapsed) {
        const spawn = spawns[spawner.cursor];
        const portal = portals[spawn.portal % portals.length];
        this.pendingSpawnAt = { cell: portal, x: portal.x, z: portal.z, portal: true };
        this.spawnEnemy(spawn.type, spawner.wave.hpMultiplier, spawner.index, 0);
        this.pendingSpawnAt = null;
        spawner.cursor++;
      }
      if (spawner.cursor >= spawns.length) this.spawners.splice(i, 1);
    }
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      this.updateDots(enemy, dt);
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
      if (enemy.attacking) {
        this.siege(enemy, dt);
        continue;
      }
      if (!enemy.next || enemy.next.structure || nodeBlocks(enemy.next)) {
        const next = this.nextStep(enemy.cell);
        if (!next) continue;
        if (next.structure) {
          enemy.attacking = next.structure;
          enemy.dirX = next.x - enemy.x;
          enemy.dirZ = next.z - enemy.z;
          const len = Math.hypot(enemy.dirX, enemy.dirZ) || 1;
          enemy.dirX /= len;
          enemy.dirZ /= len;
          continue;
        }
        enemy.next = next;
      }
      const dx = enemy.next.x - enemy.x;
      const dz = enemy.next.z - enemy.z;
      const dist = Math.hypot(dx, dz);
      const travel = enemy.speed * enemy.slowFactor * dt;
      if (dist > 1e-6) {
        enemy.dirX = dx / dist;
        enemy.dirZ = dz / dist;
      }
      if (travel >= dist) {
        enemy.x = enemy.next.x;
        enemy.z = enemy.next.z;
        enemy.cell = enemy.next;
        enemy.next = null;
        if (enemy.cell.castle) {
          this.leak(enemy);
          if (this.phase !== PHASE.NIGHT) return;
          continue;
        }
      } else {
        enemy.x += enemy.dirX * travel;
        enemy.z += enemy.dirZ * travel;
      }
      enemy.distance = FLOW_MAX - this.flow[enemy.cell.index] + (enemy.next ? 1 - Math.min(1, dist) : 0);
    }
  }

  siege(enemy, dt) {
    const target = enemy.attacking;
    if (target.cell.structure !== target) {
      enemy.attacking = null;
      return;
    }
    target.hp -= (enemy.def.siege ?? 8) * dt;
    enemy.siegeTimer -= dt;
    if (enemy.siegeTimer <= 0) {
      enemy.siegeTimer = SIEGE_FX_EVERY;
      this.listener.onSiegeHit?.(enemy, target);
    }
    if (target.hp <= 0) {
      this.removeStructure(target);
      this.listener.onStructureDestroyed?.(target);
    }
  }

  // ------------------------------------------------------------ workers

  get workerCapacity() {
    let total = REALM.startWorkers;
    for (const b of this.buildings) if (b.def.id === 'house') total += b.def.levels[b.level].workers;
    return total;
  }

  /** Adds or removes workers to match the houses. */
  syncWorkers() {
    const capacity = this.workerCapacity;
    while (this.workers.length < capacity) {
      const worker = createWorker(this.nextWorkerId++);
      const spot = this.homeSpot(this.workers.length);
      worker.cell = spot;
      worker.x = spot.x;
      worker.z = spot.z;
      worker.state = this.phase === PHASE.NIGHT ? 'hidden' : 'idle';
      this.workers.push(worker);
      this.listener.onWorkerAdded?.(worker);
    }
    while (this.workers.length > capacity) {
      const worker = this.workers.findLast((w) => !w.job) ?? this.workers[this.workers.length - 1];
      this.releaseNode(worker);
      this.workers.splice(this.workers.indexOf(worker), 1);
      this.listener.onWorkerRemoved?.(worker);
    }
  }

  /** A walkable cell next to the castle, spread around it. */
  homeSpot(i) {
    const ring = this.castleRing();
    return ring[(i * 5) % ring.length] ?? this.level.base;
  }

  castleRing() {
    const out = [];
    const base = this.level.base;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== 2) continue;
        const cell = this.level.cellAt(base.col + dc, base.row + dr);
        if (walkable(cell)) out.push(cell);
      }
    }
    return out;
  }

  jobCounts() {
    const counts = { wood: 0, stone: 0, crystal: 0, idle: 0 };
    for (const w of this.workers) counts[w.job ?? 'idle']++;
    return counts;
  }

  /** Changes how many workers gather `resource` (+1 takes an idle worker, −1 frees one). */
  setJob(resource, delta) {
    if (delta > 0) {
      const worker = this.workers.find((w) => !w.job);
      if (!worker) return false;
      worker.job = resource;
      worker.state = worker.state === 'hidden' ? 'hidden' : 'idle';
      worker.retry = 0;
      return true;
    }
    const worker = this.workers.findLast((w) => w.job === resource);
    if (!worker) return false;
    this.releaseNode(worker);
    worker.job = null;
    worker.preferred = null;
    if (worker.state !== 'hidden') this.walkTo(worker, this.castleRing(), 'home');
    return true;
  }

  /** Sends a worker to a specific resource node (tap on a tree, rock or crystal). */
  sendWorkerTo(cell) {
    const node = cell?.node;
    if (!node || node.amount <= 0) return null;
    let worker = this.workers.find((w) => !w.job)
      ?? this.nearestWorker(cell, (w) => w.job === node.resource)
      ?? this.nearestWorker(cell, () => true);
    if (!worker) return null;
    this.releaseNode(worker);
    worker.job = node.resource;
    worker.preferred = cell;
    worker.retry = 0;
    if (worker.state !== 'hidden') {
      if (worker.carry) this.goDeliver(worker);
      else worker.state = 'idle';
    }
    return worker;
  }

  nearestWorker(cell, filter) {
    let best = null;
    let bestDist = Infinity;
    for (const w of this.workers) {
      if (!filter(w)) continue;
      const d = Math.hypot(w.x - cell.x, w.z - cell.z);
      if (d < bestDist) {
        bestDist = d;
        best = w;
      }
    }
    return best;
  }

  releaseNode(worker) {
    if (worker.node?.node) worker.node.node.reserved = Math.max(0, worker.node.node.reserved - 1);
    worker.node = null;
  }

  /** BFS over walkable cells from the worker; fills bfsDist/bfsFrom. */
  explore(start) {
    const dist = this.bfsDist;
    const from = this.bfsFrom;
    dist.fill(Infinity);
    from.fill(-1);
    const heap = new MinHeap();
    dist[start.index] = 0;
    heap.push(0, start);
    while (heap.size) {
      const [d, cell] = heap.pop();
      if (d > dist[cell.index]) continue;
      for (const [dc, dr, len] of DIRS) {
        const next = this.level.cellAt(cell.col + dc, cell.row + dr);
        if (!walkable(next)) continue;
        if (len > 1 && !this.diagonalOpen(cell, dc, dr)) continue;
        const value = d + len;
        if (value < dist[next.index]) {
          dist[next.index] = value;
          from[next.index] = cell.index;
          heap.push(value, next);
        }
      }
    }
  }

  pathTo(target) {
    const path = [];
    let index = target.index;
    while (index >= 0) {
      path.push(this.level.cells[index]);
      index = this.bfsFrom[index];
    }
    return path.reverse();
  }

  /** Walks the worker to the closest reachable cell among `targets`. */
  walkTo(worker, targets, state) {
    this.explore(worker.cell);
    let best = null;
    for (const cell of targets) if (cell && this.bfsDist[cell.index] < (best ? this.bfsDist[best.index] : Infinity)) best = cell;
    if (!best) return false;
    worker.path = this.pathTo(best);
    worker.pathIndex = 1;
    worker.state = state;
    return true;
  }

  standCells(cell) {
    const out = [];
    for (const [dc, dr] of DIRS) {
      const next = this.level.cellAt(cell.col + dc, cell.row + dr);
      if (walkable(next)) out.push(next);
    }
    return out;
  }

  dropCells() {
    const out = this.castleRing();
    for (const b of this.buildings) if (b.def.id === 'depot') out.push(...this.standCells(b.cell));
    return out;
  }

  findNode(worker) {
    this.explore(worker.cell);
    const perNode = REALM.worker.perNode;
    const score = (cell) => {
      let best = Infinity;
      for (const stand of this.standCells(cell)) best = Math.min(best, this.bfsDist[stand.index]);
      return best;
    };
    const preferred = worker.preferred;
    if (preferred?.node && preferred.node.amount > 0 && preferred.node.resource === worker.job && score(preferred) < Infinity) return preferred;
    worker.preferred = null;
    let best = null;
    let bestScore = Infinity;
    for (const cell of this.level.cells) {
      const node = cell.node;
      if (!node || node.amount <= 0 || node.resource !== worker.job || node.reserved >= perNode) continue;
      // Cheap filter before the exact reachable distance.
      if (Math.abs(cell.x - worker.x) + Math.abs(cell.z - worker.z) > bestScore * 1.5 + 2) continue;
      const s = score(cell) + this.level.distanceToCastle(cell) * 0.35;
      if (s < bestScore) {
        bestScore = s;
        best = cell;
      }
    }
    return best;
  }

  goToNode(worker, cell) {
    this.releaseNode(worker);
    worker.node = cell;
    cell.node.reserved++;
    if (!this.walkTo(worker, this.standCells(cell), 'toNode')) {
      this.releaseNode(worker);
      worker.state = 'idle';
      worker.retry = WORKER_RETRY;
    }
  }

  goDeliver(worker) {
    if (!this.walkTo(worker, this.dropCells(), 'toDrop')) {
      worker.state = 'idle';
      worker.retry = WORKER_RETRY;
    }
  }

  sendHome(worker) {
    this.releaseNode(worker);
    if (worker.state === 'hidden') return;
    if (!this.walkTo(worker, this.castleRing(), 'goingHome')) worker.state = 'hidden';
  }

  /** A new wall or building may cut a worker's path: recompute from where they are. */
  rerouteWorkers() {
    for (const worker of this.workers) {
      if (!worker.path.length || worker.state === 'hidden' || worker.state === 'harvest') continue;
      if (!worker.path.slice(worker.pathIndex).some((cell) => cell.structure || nodeBlocks(cell))) continue;
      if (worker.state === 'toNode' && worker.node) this.goToNode(worker, worker.node);
      else if (worker.state === 'toDrop') this.goDeliver(worker);
      else if (worker.state === 'goingHome' || worker.state === 'home') this.walkTo(worker, this.castleRing(), worker.state);
    }
  }

  updateWorkers(dt) {
    const speed = REALM.worker.speed * this.modifiers.workerSpeed;
    for (const worker of this.workers) {
      if (worker.state === 'hidden') {
        if (this.phase === PHASE.DAY) {
          const spot = this.homeSpot(worker.id);
          worker.cell = spot;
          worker.x = spot.x;
          worker.z = spot.z;
          worker.state = 'idle';
          this.listener.onWorkerShown?.(worker);
        }
        continue;
      }
      if (worker.path.length && worker.pathIndex < worker.path.length && worker.state !== 'harvest') {
        this.walk(worker, speed * dt);
        continue;
      }
      switch (worker.state) {
        case 'toNode':
          this.arriveAtNode(worker);
          break;
        case 'harvest':
          worker.timer -= dt;
          if (worker.timer <= 0) this.finishHarvest(worker);
          break;
        case 'toDrop':
          this.deliver(worker);
          break;
        case 'goingHome':
          if (worker.carry) this.deliver(worker, true);
          worker.state = this.phase === PHASE.NIGHT ? 'hidden' : 'home';
          worker.path = [];
          if (worker.state === 'hidden') this.listener.onWorkerHidden?.(worker);
          break;
        case 'home':
        case 'idle':
          if (this.phase !== PHASE.DAY || !worker.job) break;
          if (worker.retry > 0) {
            worker.retry -= dt;
            break;
          }
          if (worker.carry) {
            this.goDeliver(worker);
            break;
          }
          {
            const cell = this.findNode(worker);
            if (cell) this.goToNode(worker, cell);
            else worker.retry = WORKER_RETRY;
          }
          break;
        default:
          break;
      }
    }
  }

  walk(worker, distance) {
    while (distance > 0 && worker.pathIndex < worker.path.length) {
      const target = worker.path[worker.pathIndex];
      const dx = target.x - worker.x;
      const dz = target.z - worker.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) {
        worker.dirX = dx / d;
        worker.dirZ = dz / d;
      }
      if (distance >= d) {
        worker.x = target.x;
        worker.z = target.z;
        worker.cell = target;
        worker.pathIndex++;
        distance -= d;
      } else {
        worker.x += (dx / d) * distance;
        worker.z += (dz / d) * distance;
        distance = 0;
      }
    }
  }

  arriveAtNode(worker) {
    const cell = worker.node;
    if (!cell?.node || cell.node.amount <= 0) {
      this.releaseNode(worker);
      worker.state = 'idle';
      return;
    }
    const dx = cell.x - worker.x;
    const dz = cell.z - worker.z;
    const d = Math.hypot(dx, dz) || 1;
    worker.dirX = dx / d;
    worker.dirZ = dz / d;
    worker.state = 'harvest';
    worker.path = [];
    worker.timer = REALM.worker.harvestTime * this.modifiers.harvest;
    this.listener.onHarvestStart?.(worker, cell);
  }

  finishHarvest(worker) {
    const cell = worker.node;
    const node = cell?.node;
    if (!node || node.amount <= 0) {
      this.releaseNode(worker);
      worker.state = 'idle';
      return;
    }
    const amount = Math.min(node.amount, REALM.worker.carry + this.modifiers.carry);
    node.amount -= amount;
    worker.carry = { resource: node.resource, amount };
    this.listener.onHarvest?.(worker, cell, amount);
    if (node.amount <= 0) {
      node.regrow = REALM.nodes[node.type].regrowDays;
      node.reserved = 0;
      worker.node = null;
      for (const other of this.workers) if (other.node === cell) other.node = null;
      this.flowDirty = true;
      this.listener.onNodeDepleted?.(cell);
    }
    this.goDeliver(worker);
  }

  deliver(worker, silent = false) {
    const carry = worker.carry;
    worker.carry = null;
    worker.path = [];
    if (carry) {
      const added = this.addStock(carry.resource, carry.amount);
      if (!silent || added) this.listener.onDeliver?.(worker, carry.resource, added, carry.amount);
    }
    // Back to the same node while it lasts, otherwise look for another one.
    if (this.phase === PHASE.DAY && worker.job && worker.node?.node?.amount > 0) this.goToNode(worker, worker.node);
    else worker.state = 'idle';
  }

  // ------------------------------------------------------------ loop

  step(dt) {
    this.time += dt;
    if (this.gold > this.stats.maxGold) this.stats.maxGold = this.gold;
    if (this.flowDirty) this.computeFlow();
    if (this.phase === PHASE.DAY) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.startNight();
    } else {
      this.updateRealmSpawners(dt);
      if (this.spawners.length === 0 && this.dawnTimer < 0 && !this.enemies.some((e) => e.active)) this.dawnTimer = DAWN_DELAY;
      if (this.dawnTimer > 0) {
        this.dawnTimer -= dt;
        if (this.dawnTimer <= 0) this.dawn();
      }
    }
    this.updateSpells(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateWorkers(dt);
  }

  // ------------------------------------------------------------ offline gathering

  /** What the workers gathered while the page was closed (daytime saves only). */
  offlineGains(seconds) {
    const time = Math.min(seconds, REALM.offlineCap);
    const counts = this.jobCounts();
    const trip = REALM.worker.harvestTime * this.modifiers.harvest + 12 / (REALM.worker.speed * this.modifiers.workerSpeed);
    const perSecond = (REALM.worker.carry + this.modifiers.carry) / trip;
    const gains = {};
    for (const resource of ['wood', 'stone', 'crystal']) {
      const amount = Math.floor(counts[resource] * perSecond * time * REALM.offlineRate);
      if (amount > 0) gains[resource] = this.addStock(resource, amount);
    }
    return gains;
  }

  // ------------------------------------------------------------ save / resume

  serialize() {
    const round = (v) => Math.round(v * 100) / 100;
    const nodes = [];
    this.level.cells.forEach((cell, i) => {
      const initial = this.level.initial[i];
      const node = cell.node;
      if (!initial && !node) return;
      if (!node) nodes.push([i, -1, 0]);
      else if (node.amount !== node.max || node.regrow > 0 || !initial) nodes.push([i, node.amount, node.regrow, NODE_TYPES.indexOf(node.type), node.variant]);
    });
    return {
      version: 1,
      seed: this.seed,
      day: this.day,
      phase: this.phase,
      phaseTimer: round(this.phaseTimer),
      gold: this.gold,
      stock: { ...this.stock },
      lives: this.lives,
      research: { ...this.research },
      stats: { ...this.stats },
      spells: Object.fromEntries(Object.entries(this.spells).map(([id, s]) => [id, round(s.cooldown)])),
      nodes,
      buildings: this.buildings.map((b) => [b.def.id, b.cell.index, b.level, Math.round(b.hp)]),
      towers: this.towers.map((t) => [t.def.id, t.cell.index, t.level, Math.round(t.hp), t.targeting, t.kills]),
      jobs: this.workers.map((w) => w.job),
      night: this.phase === PHASE.NIGHT ? {
        spawner: this.spawners[0] ? { cursor: this.spawners[0].cursor, elapsed: round(this.spawners[0].elapsed) } : null,
        remaining: this.waveRemaining[this.day] ?? 0,
        leaks: this.waveLeaks[this.day] ?? 0,
        enemies: this.enemies.filter((e) => e.active).map((e) => [e.def.id, round(e.hp), e.maxHp, round(e.speed), round(e.x), round(e.z), e.cell.index]),
      } : null,
    };
  }

  restoreRealm(data) {
    if (data?.version !== 1) return;
    this.day = data.day;
    this.nextWave = data.day;
    this.phase = data.phase === PHASE.NIGHT ? PHASE.NIGHT : PHASE.DAY;
    this.phaseTimer = data.phaseTimer;
    this.gold = data.gold;
    Object.assign(this.stock, data.stock);
    Object.assign(this.research, data.research);
    this.applyResearch();
    this.lives = Math.min(this.startLives, data.lives);
    for (const [id, cooldown] of Object.entries(data.spells ?? {})) if (this.spells[id]) this.spells[id].cooldown = cooldown;
    const cells = this.level.cells;
    for (const [i, amount, regrow, type, variant] of data.nodes ?? []) {
      const cell = cells[i];
      if (!cell) continue;
      if (amount < 0) {
        cell.node = null;
        continue;
      }
      if (!cell.node) {
        const nodeType = NODE_TYPES[type] ?? 'tree';
        cell.node = { type: nodeType, resource: REALM.nodes[nodeType].resource, variant: variant ?? 0, amount, max: REALM.nodes[nodeType].amount, regrow, reserved: 0 };
      } else {
        cell.node.amount = amount;
        cell.node.regrow = regrow;
      }
    }
    for (const [id, index, level, hp] of data.buildings ?? []) {
      const def = BUILDINGS[id];
      const cell = cells[index];
      if (!def || !cell || !this.canPlace(cell)) continue;
      this.addBuilding(def, cell, Math.min(level, def.levels.length - 1), hp);
    }
    for (const [id, index, level, hp, targeting, kills] of data.towers ?? []) {
      const def = TOWERS[id];
      const cell = cells[index];
      if (!def || !cell || !this.canPlace(cell)) continue;
      const tower = new Tower(this.nextTowerId++, def, cell, this.modifiers);
      tower.kind = 'tower';
      tower.level = Math.min(level, def.levels.length - 1);
      tower.refreshStats();
      tower.maxHp = this.maxHpOf(tower);
      tower.hp = Math.min(tower.maxHp, hp);
      tower.targeting = targeting;
      tower.kills = kills;
      this.towers.push(tower);
      this.towerByCell.set(cell.index, tower);
      cell.structure = tower;
    }
    Object.assign(this.stats, data.stats);
    this.syncWorkers();
    (data.jobs ?? []).forEach((job, i) => {
      if (this.workers[i] && ['wood', 'stone', 'crystal'].includes(job)) this.workers[i].job = job;
    });
    this.computeFlow();
    if (this.phase === PHASE.NIGHT && data.night) {
      this.state = SIM_STATE.RUNNING;
      const portals = this.activePortals();
      this.nightWave = makeNight(this.day, portals.length);
      this.spawners = data.night.spawner ? [{ wave: this.nightWave, index: this.day, cursor: data.night.spawner.cursor, elapsed: data.night.spawner.elapsed }] : [];
      this.waveRemaining = [];
      this.waveRemaining[this.day] = data.night.remaining;
      this.waveLeaks = [];
      this.waveLeaks[this.day] = data.night.leaks;
      for (const [type, hp, maxHp, speed, x, z, index] of data.night.enemies) {
        const def = ENEMIES[type];
        const enemy = this.enemies.find((e) => !e.active);
        if (!def || !enemy || !cells[index]) continue;
        Object.assign(enemy, {
          id: this.nextEnemyId++, active: true, def, hp, maxHp, hpMultiplier: maxHp / def.hp, armor: def.armor, speed,
          x, z, cell: cells[index], next: null, attacking: null, siegeTimer: 0, slowFactor: 1, slowTimer: 0,
          freezeTimer: 0, stunTimer: 0, burnTimer: 0, poisonTimer: 0, dotTower: null, wave: this.day, view: null,
        });
      }
      for (const worker of this.workers) worker.state = 'hidden';
    }
  }
}
