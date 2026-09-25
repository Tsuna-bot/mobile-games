import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../core/math.js';
import { clearRealm, loadRealm, writeRealm, writeSave } from '../core/storage.js';
import { BUILDINGS, CASTLE_LEVELS, REALM, RESEARCH, RESEARCH_GROUPS, RESOURCE_INFO, UNDO_WINDOW } from '../data/realm.js';
import { SPELLS } from '../data/spells.js';
import { THEMES } from '../data/themes.js';
import { TOWERS, TOWER_ORDER } from '../data/towers.js';
import { PHASE, RealmSim } from '../sim/realm.js';

const REALM_DEF = { id: 'realm', theme: 'meadow', name: 'Royaume', endless: true };
const DUSK = 12;
const OFFLINE_MIN = 60;
const SWING_EVERY = 0.8;
const HAMMER_EVERY = 0.55;
const TUTORIAL = [
  'Tes ouvriers récoltent tout seuls. Touche un arbre, un rocher ou un cristal pour y envoyer un ouvrier.',
  'Touche une case d’herbe libre pour construire : tours, palissades, maisons…',
  'À la nuit, les ovnis sortent du portail et foncent vers le château. Lance la nuit quand tu es prêt !',
];

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatRate(seconds) {
  return `${(1 / seconds).toFixed(seconds < 0.5 ? 1 : 2).replace('.', ',')}/s`;
}

function costText(cost) {
  return Object.entries(cost).map(([r, a]) => `${a} ${RESOURCE_INFO[r].icon}`).join(' ');
}

/**
 * Kingdom mode controller: owns the RealmSim, reuses the Game's views, loop,
 * camera and UI, and adds the Kingdom panels (build, info, workers, research).
 */
export class RealmMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.sim = null;
    this.cycleT = 0;
    this.ambientNight = null;
    this.sheetKey = '';
    this.tutorialStep = -1;
    this.confirmReset = false;
    this.dayProgress = 0;
    this.lastSite = null;
    this.bindUi();
    // A felled tree hits the ground: dust and a thud.
    game.realmViews.onTreeLanded = (cell) => {
      if (!this.active) return;
      game.effects.depleted(cell.x, cell.z, 'wood');
      if (this.nearCamera(cell.x, cell.z, 10)) {
        game.audio.thud();
        game.haptics.pulse(CONFIG.haptics.tap);
      }
    };
  }

  get ui() {
    return this.game.ui;
  }

  get save() {
    return this.game.save;
  }

  bindUi() {
    const ui = this.ui;
    ui.on('btn-realm', () => this.start());
    ui.on('btn-workers', () => this.toggleWorkers());
    ui.on('btn-research', () => this.openResearch());
    ui.on('btn-research-back', () => this.closeResearch());
    ui.on('btn-realm-upgrade', () => this.upgradeSelected());
    ui.on('btn-demolish', () => this.demolishSelected());
    ui.on('btn-new-realm', () => this.newRealm());
    ui.on('btn-realm-extra', () => this.extraSelected());
    ui.on('btn-undo', () => this.undoLast());
    ui.on('realmTab', () => this.refreshBuild(true));
    ui.on('realmBuildCard', (id) => this.chooseItem(id));
    ui.on('job', (resource, delta) => this.changeJob(resource, delta));
    ui.on('researchTab', () => this.renderResearch());
    ui.on('researchBuy', (id) => this.buyResearch(id));
  }

  /** Text of the menu card. */
  menuDetail() {
    const data = loadRealm();
    const best = this.save.realm.bestNight;
    if (!data) return { detail: 'Monde ouvert : récolte, construis, survis aux nuits', fresh: !this.save.realm.played };
    const phase = data.phase === PHASE.NIGHT ? `nuit ${data.day} en cours` : `jour ${data.day}`;
    return { detail: `Reprendre · ${phase}${best ? ` · record : ${best} nuit${best > 1 ? 's' : ''}` : ''}`, fresh: false };
  }

  // ------------------------------------------------------------ lifecycle

  start() {
    const game = this.game;
    game.audio.unlock();
    game.armSpell(null);
    game.clearEntities();
    game.realmViews.clear();
    const data = loadRealm();
    this.sim = new RealmSim(data, {});
    let gains = null;
    if (data?.phase === PHASE.DAY && data.savedAt) {
      const away = (Date.now() - data.savedAt) / 1000;
      if (away > OFFLINE_MIN) gains = this.sim.offlineGains(away);
    }
    this.sim.listener = this.createListener();
    game.sim = this.sim;
    game.current = { def: REALM_DEF, index: 7, heroic: false };
    game.realm = this;
    this.active = true;
    this.confirmReset = false;
    this.portalsBefore = this.sim.activePortals().length;

    game.world.build(this.sim.level);
    this.cycleT = this.sim.phase === PHASE.NIGHT ? 1 : 0;
    this.dayProgress = this.dayTarget();
    this.ambientNight = null;
    this.lastSite = null;
    this.applyCycle(true);
    game.realmViews.build(this.sim);
    for (const tower of this.sim.towers) game.towerViews.add(tower);
    game.realmViews.warmUp(game.view.renderer, game.view.camera);
    for (const enemy of this.sim.enemies) if (enemy.active) game.enemyViews.acquire(enemy);
    this.ui.setSpellCount(Object.keys(this.sim.spells).length);

    game.frame(this.sim.level);
    game.rig.minZoom = 0.2;
    game.rig.zoom = game.rig.targetZoom = 0.42;
    game.rig.clampGoal();
    game.rig.setOrbit(0);
    game.speed = 1;
    game.loop.timeScale = 1;
    this.ui.setSpeed(1);
    game.endTimer = 0;
    game.mode = 'playing';
    this.ui.resetStats();
    this.ui.setRealmMode(true);
    this.ui.showScreen(null);
    this.ui.setPlayingUi(true);
    if (data) this.ui.showBanner(`Royaume · jour ${this.sim.day}`, this.sim.phase === PHASE.NIGHT ? 'La nuit continue : tiens bon !' : 'Bon retour, seigneur');
    else this.ui.showBanner('🏰 Ton royaume', 'Récolte le jour, défends la nuit');
    if (gains && Object.keys(gains).length) {
      const text = Object.entries(gains).map(([r, a]) => `+${a} ${RESOURCE_INFO[r].icon}`).join('  ');
      setTimeout(() => this.ui.showBanner('Pendant ton absence', `Tes ouvriers ont récolté ${text}`), 2600);
    }
    game.audio.setIntensity(this.sim.phase === PHASE.NIGHT ? 1 : 0);
    game.audio.duck(false);
    game.monitor.reset();
    game.tutorialStep = -1;
    this.save.realm.played = true;
    writeSave(this.save);
    this.tutorialStep = this.save.realm.tutorialDone ? -1 : 0;
    this.ui.coach(this.tutorialStep >= 0 ? TUTORIAL[0] : null);
    this.persist();
    game.loop.start();
  }

  stop() {
    if (!this.active) return;
    this.persist();
    this.active = false;
    this.game.realm = null;
    this.ui.hideUndo();
    this.game.world.terrain.showGrid(false);
    this.ui.setRealmMode(false);
    this.game.realmViews.clear();
    this.sim = null;
  }

  persist() {
    if (!this.active || !this.sim) return;
    writeRealm({ ...this.sim.serialize(), savedAt: Date.now() });
  }

  newRealm() {
    if (!this.confirmReset) {
      this.confirmReset = true;
      this.ui.$('btn-new-realm').textContent = 'Confirmer : tout recommencer ?';
      this.game.audio.click();
      return;
    }
    this.confirmReset = false;
    this.ui.$('btn-new-realm').textContent = 'Nouveau royaume';
    clearRealm();
    this.active = false;
    this.start();
  }

  resetPauseMenu() {
    this.confirmReset = false;
    this.ui.$('btn-new-realm').textContent = 'Nouveau royaume';
  }

  // ------------------------------------------------------------ simulation events

  createListener() {
    const game = this.game;
    const base = game.createListener();
    const views = game.realmViews;
    const effects = game.effects;
    const removeView = (structure) => {
      if (structure.kind === 'site') views.removeSite(structure);
      else {
        if (structure.kind === 'tower') game.towerViews.remove(structure);
        views.removeStructure(structure);
      }
      const selected = game.selection?.structure;
      if (selected === structure || (selected?.kind === 'site' && selected.target === structure)) game.deselect();
    };
    const siteName = (site) => (site.target?.kind === 'castle' ? CASTLE_LEVELS[site.level].name : site.def.name);
    return {
      ...base,
      onEnemySpawn: (enemy) => {
        game.enemyViews.acquire(enemy);
        if (enemy.fromPortal) effects.spawnBeam(enemy.x, enemy.z);
      },
      onEnemyRemoved: (enemy) => game.enemyViews.release(enemy),
      onProjectileRemoved: (projectile) => game.projectileViews.release(projectile),
      onEnemyLeaked: (enemy) => {
        game.enemyViews.release(enemy);
        const castle = this.sim.level.base;
        game.world.hitCastle();
        effects.castleHit(castle.x, castle.z);
        game.floatAt(castle.x, 2.6, castle.z, `−${enemy.def.leak * REALM.leakDamage}`, 'danger');
        game.rig.shake(0.3);
        this.ui.hurt();
        game.audio.leak();
        game.haptics.pulse(CONFIG.haptics.leak);
      },
      // Construction sites: placing pays and opens a site, workers build it.
      onSiteStarted: (site) => {
        views.addSite(site);
        effects.build(site.x, site.z, false);
        game.audio.build();
        game.haptics.pulse(CONFIG.haptics.tap);
        this.advanceTutorial(1);
      },
      onSiteComplete: (site, structure) => {
        views.removeSite(site);
        const wall = site.typeId === 'wall';
        effects.siteDone(site.x, site.z, site.target?.kind === 'castle');
        if (!wall && this.nearCamera(site.x, site.z, 14)) {
          game.floatAt(site.x, 1.8, site.z, site.target ? `⬆ ${siteName(site)} niv. ${site.level + 1}` : `✔ ${siteName(site)}`, 'res');
          game.audio.upgrade();
          game.haptics.pulse(CONFIG.haptics.build);
        }
        if (game.selection?.structure === site) this.selectStructure(structure, false);
        this.persist();
      },
      onSiteRemoved: (site, back) => {
        removeView(site);
        effects.sell(site.x, site.z);
        const text = costText(back);
        if (text) game.floatAt(site.x, 1, site.z, `+${text}`, 'res');
        game.audio.sell();
        if (this.lastSite === site) this.ui.hideUndo();
        this.persist();
      },
      onTowerBuilt: (tower) => {
        game.towerViews.add(tower);
        if (tower.view) tower.view.pop = 1;
        views.trackTower(tower);
      },
      onTowerUpgraded: (tower) => {
        game.towerViews.upgrade(tower);
        effects.upgrade(tower.x, tower.z);
      },
      onBuildingBuilt: (building) => {
        views.addStructure(building);
      },
      onBuildingUpgraded: (building) => {
        views.upgradeStructure(building);
        effects.upgrade(building.cell.x, building.cell.z);
      },
      onCastleUpgraded: (castle) => {
        views.upgradeStructure(castle);
        effects.upgrade(castle.x, castle.z);
        game.rig.shake(0.35);
        const now = CASTLE_LEVELS[castle.level];
        const before = CASTLE_LEVELS[castle.level - 1];
        this.ui.showBanner(`🏰 ${now.name}`, `+${now.hp - before.hp} vie · +${now.storage - before.storage} stockage · +${now.workers - before.workers} ouvrier`);
        game.audio.victory();
        game.haptics.pulse(CONFIG.haptics.victory);
      },
      onRepaired: (damaged) => {
        for (const s of damaged) effects.heal(s.cell.x, s.cell.z);
        game.audio.upgrade();
        game.haptics.pulse(CONFIG.haptics.build);
      },
      onStructureRemoved: (structure, back) => {
        if (structure.kind === 'site') return;
        effects.sell(structure.cell.x, structure.cell.z);
        const text = costText(back);
        if (text) game.floatAt(structure.cell.x, 1, structure.cell.z, `+${text}`, 'res');
        removeView(structure);
        game.audio.sell();
      },
      onStructureDestroyed: (structure) => {
        effects.destroyed(structure.cell.x, structure.cell.z);
        game.floatAt(structure.cell.x, 1.2, structure.cell.z, structure.kind === 'site' ? 'Chantier détruit !' : structure.def.id === 'wall' ? 'Brèche !' : 'Détruit !', 'danger');
        removeView(structure);
        game.audio.explosion(false);
        game.rig.shake(0.15);
      },
      onSiegeHit: (enemy, structure) => {
        effects.siegeHit(structure.cell.x, CONFIG.world.tileTop + 0.5, structure.cell.z);
        views.hitStructure(structure);
        game.audio.siege();
      },
      onWorkerAdded: (worker) => views.addWorker(worker),
      onWorkerRemoved: (worker) => views.removeWorker(worker),
      onHarvest: (worker, cell) => views.nodeChanged(cell),
      onDeliver: (worker, resource, added, amount) => {
        if (added > 0) game.floatAt(worker.x, 0.95, worker.z, `+${added} ${RESOURCE_INFO[resource].icon}`, 'res');
        else if (amount > 0) game.floatAt(worker.x, 0.95, worker.z, 'Stock plein', 'danger');
        game.audio.deliver();
      },
      onNodeDepleted: (cell) => {
        views.nodeChanged(cell);
        const near = this.nearCamera(cell.x, cell.z, 10);
        // Trees topple first (dust when they land); rocks and crystals burst at once.
        if (cell.node?.type === 'tree') {
          if (near) game.audio.treeFall();
          return;
        }
        effects.depleted(cell.x, cell.z, REALM.nodes[cell.node?.type ?? 'rock'].resource);
        if (near) game.audio.thud(0.6);
      },
      onNodeRegrown: (cell) => views.nodeChanged(cell),
      onNodeRemoved: (cell) => views.nodeChanged(cell),
      onNightStart: (night, wave, bonus) => {
        const portals = this.sim.activePortals().length;
        const newPortal = portals > this.portalsBefore;
        this.portalsBefore = portals;
        const count = wave.spawns.length;
        this.ui.showBanner(`🌙 Nuit ${night}`, `${count} ovnis · ${portals} portail${portals > 1 ? 's' : ''}${newPortal ? ' (nouveau !)' : ''}${bonus ? ` · +${bonus} or` : ''}`, 'danger');
        game.audio.nightfall();
        game.audio.setIntensity(1);
        this.advanceTutorial(2);
        this.persist();
      },
      onDawn: (day, info) => {
        if (info.fallen) {
          this.ui.showBanner(`☀️ Jour ${day}`, 'Le château tient encore, à moitié réparé', 'danger');
        } else {
          this.ui.showBanner(`☀️ Jour ${day}`, `Nuit ${info.night} repoussée · +${info.gold} or${info.gems ? ` · +${info.gems} gemmes` : ''}`);
          this.save.gems += info.gems;
          this.save.stats.realmNights = (this.save.stats.realmNights ?? 0) + 1;
          this.save.realm.bestNight = Math.max(this.save.realm.bestNight, info.night);
          game.checkAchievements();
          writeSave(this.save);
        }
        game.audio.dawn();
        game.audio.setIntensity(0);
        game.flyCoinsFrom(this.sim.level.base.x, 1.5, this.sim.level.base.z, 6);
        this.portalsBefore = this.sim.activePortals().length;
        this.persist();
      },
      onCastleFallen: (loss) => {
        setTimeout(() => this.ui.showBanner('Le château est tombé !', `Les pillards emportent ${costText(loss)}`, 'danger'), 50);
        game.audio.defeat();
        game.rig.shake(1);
        game.haptics.pulse(CONFIG.haptics.leak);
      },
      onResearch: (item, level) => {
        this.ui.showBanner(item.name, item.unlock ? 'Débloqué !' : `Niveau ${level}`);
        game.audio.upgrade();
        game.haptics.pulse(CONFIG.haptics.build);
        this.ui.setSpellCount(Object.keys(this.sim.spells).length);
        this.persist();
      },
      onSpellCast: (id, x, z, targets) => {
        if (id !== 'quake') {
          base.onSpellCast(id, x, z, targets);
          return;
        }
        for (const enemy of this.sim.enemies) if (enemy.active) effects.quakeDust(enemy.x, enemy.z);
        game.rig.shake(1);
        game.audio.quake();
        game.haptics.pulse(CONFIG.haptics.leak);
      },
    };
  }

  advanceTutorial(step) {
    if (this.tutorialStep !== step) return;
    this.tutorialStep++;
    if (this.tutorialStep < TUTORIAL.length) {
      this.ui.coach(TUTORIAL[this.tutorialStep]);
      return;
    }
    this.tutorialStep = -1;
    this.ui.coach(null);
    this.save.realm.tutorialDone = true;
    writeSave(this.save);
  }

  // ------------------------------------------------------------ input

  handleTap(hit) {
    const game = this.game;
    const sim = this.sim;
    const cell = hit ? sim.level.cellAtWorld(hit.x, hit.z) : null;
    const selection = game.selection;
    // Quick walls: after placing one palisade, every tap on free grass adds another.
    if (selection?.kind === 'build' && selection.repeat) {
      if (cell && sim.canPlace(cell)) {
        this.buildAt(cell, selection.pending);
        return;
      }
      game.deselect();
    }
    const candidates = [...game.towerViews.pick(game.rig.raycaster), ...game.realmViews.pick(game.rig.raycaster)];
    const onTile = cell?.structure;
    if (onTile && !candidates.includes(onTile)) candidates.push(onTile);
    const unique = [...new Set(candidates)];
    const current = selection?.kind === 'structure' ? unique.indexOf(selection.structure) : -1;
    const structure = unique.length > 0 ? unique[(current + 1) % unique.length] : null;
    const node = structure ? null : game.realmViews.pickNode(game.rig.raycaster) ?? (cell?.node?.amount > 0 ? cell : null);
    if (structure) {
      this.selectStructure(structure);
    } else if (node) {
      this.sendWorker(node);
    } else if (cell && sim.canPlace(cell)) {
      this.openBuild(cell);
    } else if (cell?.castle) {
      this.selectStructure(sim.castle);
    } else {
      game.deselect();
    }
  }

  sendWorker(cell) {
    const game = this.game;
    const worker = this.sim.sendWorkerTo(cell);
    const info = RESOURCE_INFO[cell.node.resource];
    game.deselect();
    if (!worker) {
      game.floatAt(cell.x, 1.2, cell.z, 'Aucun ouvrier', 'danger');
      game.audio.denied();
      return;
    }
    game.effects.showCursor(cell.x, cell.z);
    game.effects.ring(cell.x, cell.z, 0.6, 0.5, new THREE.Color(0xffffff));
    game.floatAt(cell.x, 1.4, cell.z, `👷 → ${info.icon}`, 'res');
    game.audio.click();
    game.haptics.pulse(CONFIG.haptics.tap);
    this.advanceTutorial(0);
    setTimeout(() => {
      if (!game.selection) game.effects.hideCursor();
    }, 700);
  }

  // ------------------------------------------------------------ build sheet

  buildItems() {
    const sim = this.sim;
    const unlocked = sim.unlockedTowers;
    const have = (r) => sim.amountOf(r);
    const affordable = (cost) => Object.entries(cost).every(([r, a]) => have(r) >= a);
    const buildingItem = (id) => {
      const def = BUILDINGS[id];
      const cost = sim.buildCost(id);
      const built = def.unique && sim.buildings.some((b) => b.def.id === id);
      return { id, kind: 'building', name: def.name, blurb: def.blurb, image: this.ui.thumbnails.buildings[id][0], cost, affordable: affordable(cost), locked: built, lockText: 'Déjà construite' };
    };
    if (this.ui.realmTab === 'village') return ['house', 'depot', 'academy'].map(buildingItem);
    const towers = TOWER_ORDER.map((id) => {
      const def = TOWERS[id];
      const cost = sim.buildCost(id);
      const locked = !unlocked.includes(id);
      return { id, kind: 'tower', name: def.name, blurb: def.blurb, image: this.ui.thumbnails.towers[id][0], cost, affordable: affordable(cost), locked, lockText: '📜 Académie' };
    });
    // Unlocked towers first, then the ones still to research.
    towers.sort((a, b) => Number(a.locked) - Number(b.locked));
    return [buildingItem('wall'), ...towers];
  }

  /** Slides the camera so `cell` stays visible above the bottom sheet. */
  keepVisible(cell) {
    const game = this.game;
    const rect = game.view.canvas.getBoundingClientRect();
    const point = game.rig.toScreen(new THREE.Vector3(cell.x, 0.3, cell.z), rect);
    const limit = rect.top + rect.height * 0.42;
    if (point.y > limit) game.rig.pan(0, -(point.y - limit));
  }

  openBuild(cell) {
    const game = this.game;
    this.keepVisible(cell);
    game.selection = { kind: 'build', cell, pending: null, repeat: false };
    game.effects.showCursor(cell.x, cell.z);
    game.effects.hideRange();
    this.sheetKey = '';
    this.ui.openRealmBuild(this.buildItems(), null, (r) => this.sim.amountOf(r));
    game.audio.click();
    game.haptics.pulse(CONFIG.haptics.tap);
  }

  refreshBuild(force = false, hint) {
    const selection = this.game.selection;
    if (selection?.kind !== 'build') return;
    const key = `${this.stockKey()}|${selection.pending}|${this.ui.realmTab}`;
    if (!force && key === this.sheetKey) return;
    this.sheetKey = key;
    this.ui.renderRealmBuild(this.buildItems(), selection.pending, (r) => this.sim.amountOf(r), selection.repeat ? hint ?? this.repeatHint : undefined);
  }

  get repeatHint() {
    return 'Mode palissade : touche d’autres cases libres pour continuer le mur. ✕ pour terminer.';
  }

  chooseItem(id) {
    const game = this.game;
    const selection = game.selection;
    if (selection?.kind !== 'build') return;
    const item = this.buildItems().find((i) => i.id === id);
    if (!item) return;
    if (item.locked) {
      this.ui.denyRealmCard(id);
      game.audio.denied();
      if (item.kind === 'tower') this.ui.$('realm-build-hint').textContent = `${item.name} : à débloquer dans l’Académie (onglet Village).`;
      return;
    }
    if (selection.pending === id && selection.cell) {
      if (!item.affordable) {
        this.ui.denyRealmCard(id);
        game.audio.denied();
        return;
      }
      this.buildAt(selection.cell, id);
      return;
    }
    selection.pending = id;
    selection.repeat = false;
    const cell = selection.cell;
    if (item.kind === 'tower' && cell) {
      const range = TOWERS[id].levels[0].range * this.sim.modifiers.range;
      if (range > 0) game.effects.showRange(cell.x, cell.z, range, item.affordable);
      else game.effects.hideRange();
    } else {
      game.effects.hideRange();
    }
    this.refreshBuild(true);
    if (item.affordable) game.audio.click();
    else {
      this.ui.denyRealmCard(id);
      game.audio.denied();
    }
  }

  buildAt(cell, id) {
    const game = this.game;
    const sim = this.sim;
    const site = TOWERS[id] ? sim.build(id, cell) : sim.placeBuilding(id, cell);
    if (!site) {
      game.audio.denied();
      this.ui.denyRealmCard(id);
      return;
    }
    this.lastSite = site;
    this.ui.showUndo(id === 'wall' ? 'Palissade en chantier' : `${site.def.name} en chantier`, UNDO_WINDOW);
    if (id === 'wall') {
      // Wall mode: the sheet steps aside and every tap on free grass extends the wall.
      const first = !game.selection?.repeat;
      game.selection = { kind: 'build', cell: null, pending: 'wall', repeat: true };
      game.effects.showCursor(cell.x, cell.z);
      game.effects.hideRange();
      if (first) {
        this.ui.closeSheets();
        this.ui.showModeHint('🧱 Touche des cases pour le mur', 'OK');
      }
      this.persist();
      return;
    }
    game.deselect();
    this.persist();
  }

  // ------------------------------------------------------------ info sheet

  selectStructure(structure, feedback = true) {
    const game = this.game;
    this.keepVisible(structure.cell);
    game.selection = { kind: 'structure', structure, confirm: false };
    if (structure.kind === 'castle') game.effects.hideCursor();
    else game.effects.showCursor(structure.cell.x, structure.cell.z);
    const range = structure.kind === 'tower' ? structure.stats.range : structure.kind === 'site' && structure.tower && !structure.target ? structure.def.levels[0].range * this.sim.modifiers.range : 0;
    if (range > 0) game.effects.showRange(structure.cell.x, structure.cell.z, range);
    else game.effects.hideRange();
    this.sheetKey = '';
    this.refreshInfo(true);
    if (!feedback) return;
    game.audio.click();
    game.haptics.pulse(CONFIG.haptics.tap);
  }

  /** Thumbnail of a structure (or of a site's future structure) at `level`. */
  imageOf(kind, def, level) {
    const thumbs = this.ui.thumbnails;
    if (kind === 'castle') return thumbs.castle[level];
    return (kind === 'tower' ? thumbs.towers[def.id] : thumbs.buildings[def.id])[level];
  }

  /** Progress line of a site: percent, builders and time left. */
  workInfo(site) {
    const fraction = Math.min(1, site.progress / site.work);
    const working = site.builders.filter((w) => w.state === 'building').length;
    const rate = Math.max(1, site.builders.length) * this.sim.modifiers.buildSpeed;
    const left = Math.max(1, Math.ceil((site.work - site.progress) / rate));
    let text = `${Math.floor(fraction * 100)} %`;
    if (!site.builders.length) text += ' · en attente d’un ouvrier';
    else if (!working) text += ' · l’ouvrier arrive';
    else text += ` · ~${left} s`;
    return { fraction, text };
  }

  undoWindowOpen(site) {
    return site === this.lastSite && this.sim.time - site.startedAt <= UNDO_WINDOW;
  }

  refreshInfo(force = false) {
    const selection = this.game.selection;
    if (selection?.kind !== 'structure') return;
    const s = selection.structure;
    const sim = this.sim;
    const site = s.kind === 'site' ? s : s.upgrading;
    const work = site ? this.workInfo(site) : null;
    const hpNow = s.kind === 'castle' ? sim.lives : s.hp;
    const key = `${this.stockKey()}|${Math.ceil(hpNow)}|${s.level}|${selection.confirm}|${s.targeting ?? ''}|${work?.text ?? ''}|${site ? this.undoWindowOpen(site) : ''}`;
    if (!force && key === this.sheetKey) return;
    this.sheetKey = key;
    const have = (r) => sim.amountOf(r);
    const affordable = (cost) => Object.entries(cost).every(([r, a]) => have(r) >= a);
    if (s.kind === 'site') {
      this.refreshSiteInfo(s, work, selection.confirm, have);
      return;
    }
    if (s.kind === 'castle') {
      this.refreshCastleInfo(s, work, have, affordable);
      return;
    }
    const hp = `${Math.ceil(s.hp)}/${s.maxHp}`;
    const back = {};
    for (const [r, a] of Object.entries(sim.spentOn(s))) if (Math.floor(a * 0.5) > 0) back[r] = Math.floor(a * 0.5);
    const demolish = `<span class="costs">+${costText(back)}</span>`;
    if (s.kind === 'tower') {
      const stats = s.stats;
      const rows = [['Vie', hp]];
      if (stats.income) rows.push(['Or à l’aube', `+${stats.income}`]);
      else {
        rows.push(['Dégâts', stats.beam ? `${Math.round(stats.damage * 10)}/s` : Math.round(stats.damage)]);
        rows.push(['Portée', stats.range.toFixed(1).replace('.', ',')]);
        if (!stats.beam) rows.push(['Cadence', formatRate(stats.rate)]);
        if (stats.burn) rows.push(['Brûlure', `${stats.burn}/s`]);
        if (stats.poison) rows.push(['Poison', `${stats.poison}/s`]);
        if (stats.chains) rows.push(['Rebonds', stats.chains]);
        if (stats.splash) rows.push(['Zone', stats.splash.toFixed(1).replace('.', ',')]);
        if (stats.slow) rows.push(['Ralenti', `${Math.round(stats.slow * 100)} %`]);
        rows.push(['Éliminés', s.kills]);
      }
      const cost = sim.towerUpgradeCost(s);
      this.ui.openRealmInfo({
        image: this.ui.thumbnails.towers[s.def.id][s.level],
        name: s.def.name,
        level: s.level,
        levels: s.def.levels.length,
        stats: rows,
        upgrade: cost ? { cost, affordable: affordable(cost) } : null,
        maxText: s.upgrading ? '🔨 Amélioration en cours' : 'Niveau max',
        work,
        demolish,
        confirm: selection.confirm,
        targeting: ['frost', 'goldmine'].includes(s.def.id) ? null : s.targeting,
      }, have);
      return;
    }
    const def = s.def;
    const level = def.levels[s.level];
    const rows = [['Vie', hp]];
    if (def.id === 'house') rows.push(['Ouvriers logés', `+${level.workers}`]);
    if (def.id === 'depot') rows.push(['Stockage', `+${Math.round(level.storage * sim.modifiers.storage)}`], ['Dépôt', 'Oui']);
    if (def.id === 'academy') rows.push(['Recherches', RESEARCH.filter((r) => sim.researchLevel(r.id) > 0).length]);
    const cost = sim.buildingUpgradeCost(s);
    this.ui.openRealmInfo({
      image: this.ui.thumbnails.buildings[def.id][s.level],
      name: level.name ?? def.name,
      level: s.level,
      levels: def.levels.length,
      stats: rows,
      upgrade: def.id === 'academy' ? { cost: {}, affordable: true } : cost ? { cost, affordable: affordable(cost) } : null,
      upgradeLabel: def.id === 'academy' ? '📜 Ouvrir la recherche' : def.id === 'wall' ? 'En pierre' : 'Améliorer',
      maxText: s.upgrading ? '🔨 Amélioration en cours' : 'Niveau max',
      work,
      demolish,
      confirm: selection.confirm,
      targeting: null,
    }, have);
  }

  refreshSiteInfo(site, work, confirm, have) {
    const target = site.target;
    const kind = target?.kind ?? (site.tower ? 'tower' : 'building');
    const undo = this.undoWindowOpen(site);
    const back = {};
    for (const [r, a] of Object.entries(site.cost)) if (Math.floor(a * (undo ? 1 : 0.8)) > 0) back[r] = Math.floor(a * (undo ? 1 : 0.8));
    const name = target?.kind === 'castle' ? CASTLE_LEVELS[site.level].name : site.def.levels?.[site.level]?.name ?? site.def.name;
    const rows = [['Ouvriers', `${site.builders.length}`]];
    if (!target && site.hp < site.maxHp - 0.5) rows.push(['Solidité', `${Math.ceil(site.hp)}/${site.maxHp}`]);
    if (site.typeId !== 'wall' && site.builders.length < 2 && site.work >= 8) rows.push(['Astuce', 'Un 2ᵉ ouvrier viendra aider']);
    this.ui.openRealmInfo({
      image: this.imageOf(kind, site.def, site.level),
      name: target ? `${name} · niv. ${site.level + 1}` : name,
      level: site.level,
      levels: kind === 'castle' ? CASTLE_LEVELS.length : site.def.levels.length,
      stats: rows,
      work,
      upgrade: false,
      demolish: `<span class="costs">+${costText(back)}</span>`,
      demolishLabel: undo ? 'Annuler' : 'Annuler le chantier',
      confirm,
      targeting: null,
    }, have);
  }

  refreshCastleInfo(castle, work, have, affordable) {
    const sim = this.sim;
    const level = CASTLE_LEVELS[castle.level];
    const next = CASTLE_LEVELS[castle.level + 1];
    const cost = sim.upgradeCostOf(castle);
    const counts = sim.jobCounts();
    const rows = [
      ['Vie', `${Math.ceil(sim.lives)}/${sim.startLives}`],
      ['Stockage', `${sim.storageCap()}`],
      ['Ouvriers', `${sim.workers.length} (${counts.idle} libre${counts.idle > 1 ? 's' : ''})`],
    ];
    if (next && !castle.upgrading) rows.push([`${next.name}`, `+${next.hp - level.hp} vie · +${next.storage - level.storage} stock`]);
    const quote = sim.repairQuote();
    this.ui.openRealmInfo({
      image: this.imageOf('castle', null, castle.level),
      name: level.name,
      level: castle.level,
      levels: CASTLE_LEVELS.length,
      stats: rows,
      work,
      upgrade: cost ? { cost, affordable: affordable(cost) } : null,
      upgradeLabel: next ? `→ ${next.name}` : 'Améliorer',
      maxText: castle.upgrading ? '🔨 Travaux en cours' : 'Niveau max',
      extra: { label: quote.damaged.length ? `🔧 Réparer (${quote.damaged.length})` : '🔧 Rien à réparer', cost: quote.damaged.length ? quote.cost : null, enabled: quote.damaged.length > 0 && affordable(quote.cost) },
      demolish: null,
      confirm: false,
      targeting: null,
    }, have);
  }

  upgradeSelected() {
    const selection = this.game.selection;
    if (selection?.kind !== 'structure') return;
    const s = selection.structure;
    if (s.def?.id === 'academy') {
      this.openResearch();
      return;
    }
    const ok = Boolean(this.sim.startUpgrade(s));
    if (!ok) {
      this.game.audio.denied();
      return;
    }
    selection.confirm = false;
    this.refreshInfo(true);
    this.persist();
  }

  demolishSelected() {
    const selection = this.game.selection;
    if (selection?.kind !== 'structure' || selection.structure.kind === 'castle') return;
    const s = selection.structure;
    if (!selection.confirm) {
      selection.confirm = true;
      this.refreshInfo(true);
      this.game.audio.click();
      return;
    }
    if (s.kind === 'site' && this.undoWindowOpen(s)) this.sim.cancelSite(s, 1);
    else this.sim.demolish(s);
    this.game.deselect();
    this.persist();
  }

  /** Third button of the info sheet: "Tout réparer" on the castle. */
  extraSelected() {
    const selection = this.game.selection;
    if (selection?.kind !== 'structure' || selection.structure.kind !== 'castle') return;
    if (!this.sim.repairAll()) {
      this.game.audio.denied();
      return;
    }
    this.refreshInfo(true);
    this.persist();
  }

  /** "Annuler" toast: takes back the last site, fully refunded. */
  undoLast() {
    const site = this.lastSite;
    this.ui.hideUndo();
    if (!site || !this.sim.sites.includes(site) || !this.undoWindowOpen(site)) return;
    this.sim.cancelSite(site, 1);
    this.lastSite = null;
    if (this.game.selection?.kind === 'build' && this.game.selection.repeat && !this.sim.sites.some((x) => x.typeId === 'wall')) this.game.deselect();
    this.game.haptics.pulse(CONFIG.haptics.tap);
  }

  setTargeting(mode) {
    const selection = this.game.selection;
    if (selection?.kind !== 'structure' || selection.structure.kind !== 'tower') return;
    selection.structure.targeting = mode;
    this.refreshInfo(true);
    this.game.audio.click();
  }

  // ------------------------------------------------------------ workers

  toggleWorkers(forceOpen = false) {
    const game = this.game;
    if (!this.active || game.mode !== 'playing') return;
    if (!forceOpen && game.selection?.kind === 'workers') {
      game.deselect();
      return;
    }
    game.deselect();
    game.selection = { kind: 'workers' };
    this.sheetKey = '';
    this.refreshWorkers(true);
    game.audio.click();
  }

  refreshWorkers(force = false) {
    if (this.game.selection?.kind !== 'workers') return;
    const counts = this.sim.jobCounts();
    const key = JSON.stringify(counts) + this.sim.workers.length;
    if (!force && key === this.sheetKey) return;
    this.sheetKey = key;
    const perTrip = REALM.worker.carry + this.sim.modifiers.carry;
    const rows = ['wood', 'stone', 'crystal'].map((resource) => ({
      resource,
      name: RESOURCE_INFO[resource].name,
      icon: RESOURCE_INFO[resource].icon,
      count: counts[resource],
      info: `${perTrip} par voyage · ${resource === 'wood' ? 'arbres' : resource === 'stone' ? 'rochers' : 'cristaux violets'}`,
      canAdd: counts.idle > 0,
      canRemove: counts[resource] > 0,
    }));
    this.ui.openWorkers(rows, counts.idle, this.sim.workers.length);
  }

  changeJob(resource, delta) {
    if (!this.sim.setJob(resource, delta)) {
      this.game.audio.denied();
      return;
    }
    this.game.audio.click();
    this.refreshWorkers(true);
    this.persist();
  }

  // ------------------------------------------------------------ research

  openResearch() {
    const game = this.game;
    if (!this.active) return;
    if (!this.sim.hasAcademy()) {
      game.audio.denied();
      this.ui.showBanner('Académie requise', 'Construis-la depuis l’onglet Village (bois + pierre)');
      return;
    }
    game.deselect();
    game.armSpell(null);
    game.mode = 'research';
    this.ui.setPlayingUi(false);
    this.renderResearch();
    this.ui.showScreen('research');
    game.audio.click();
  }

  closeResearch() {
    const game = this.game;
    if (game.mode !== 'research') return;
    game.mode = 'playing';
    this.ui.showScreen(null);
    this.ui.setPlayingUi(true);
    game.audio.click();
  }

  renderResearch() {
    const sim = this.sim;
    const tab = this.ui.researchTab;
    const have = (r) => sim.amountOf(r);
    const items = RESEARCH.filter((item) => item.group === tab).map((item) => {
      const level = sim.researchLevel(item.id);
      const cost = sim.researchCost(item);
      const tower = item.unlock?.tower;
      const spell = item.unlock?.spell;
      return {
        id: item.id,
        icon: item.icon,
        image: tower ? this.ui.thumbnails.towers[tower][0] : null,
        name: item.name,
        effect: spell ? `${SPELLS[spell].blurb}` : level > 0 && !item.unlock ? `${item.effect(level)}${level < item.costs.length ? ` → ${item.effect(level + 1)}` : ''}` : item.effect(1),
        level,
        max: item.costs.length,
        cost: cost ?? {},
        affordable: Boolean(cost) && sim.canAfford(cost),
      };
    });
    const wallet = ['gold', 'crystal', 'stone', 'wood'].map((r) => `<span>${RESOURCE_INFO[r].icon} ${Math.floor(sim.amountOf(r))}</span>`).join('');
    this.ui.renderResearch(RESEARCH_GROUPS, tab, items, wallet, have);
  }

  buyResearch(id) {
    if (!this.sim.doResearch(id)) {
      this.game.audio.denied();
      return;
    }
    this.renderResearch();
  }

  // ------------------------------------------------------------ frame

  callNight() {
    if (!this.sim.callNight()) return;
    this.game.audio.unlock();
  }

  stockKey() {
    const s = this.sim;
    return `${s.stock.wood}|${s.stock.stone}|${s.stock.crystal}|${s.gold}`;
  }

  /** Night falls over the last seconds of the day; dawn fades back in. */
  cycleTarget() {
    const sim = this.sim;
    if (sim.phase === PHASE.NIGHT) return 1;
    return Math.max(0, Math.min(1, 1 - sim.phaseTimer / DUSK)) * 0.85;
  }

  /** How far the sun has travelled across the sky (0 sunrise, 1 sunset). */
  dayTarget() {
    const sim = this.sim;
    if (sim.phase === PHASE.NIGHT) return 1;
    const length = sim.day === 1 ? REALM.firstDayLength : REALM.dayLength;
    return Math.max(0, Math.min(1, 1 - sim.phaseTimer / length));
  }

  nearCamera(x, z, radius) {
    const target = this.game.rig.target;
    return Math.hypot(x - target.x, z - target.z) < radius;
  }

  applyCycle(instant = false, dt = 0) {
    const game = this.game;
    const target = this.cycleTarget();
    const previous = this.cycleT;
    const previousSun = this.dayProgress;
    this.cycleT = instant ? target : damp(this.cycleT, target, target > this.cycleT ? 1.2 : 0.8, dt);
    if (Math.abs(this.cycleT - target) < 0.002) this.cycleT = target;
    // The sun keeps moving by day; at dawn it jumps back below the eastern horizon while it is still dark.
    const sun = this.dayTarget();
    this.dayProgress = instant || sun < this.dayProgress - 0.5 ? sun : damp(this.dayProgress, sun, 2, dt);
    if (!instant && this.cycleT === previous && Math.abs(this.dayProgress - previousSun) < 0.0015) {
      this.dayProgress = previousSun;
      return;
    }
    const t = this.cycleT;
    game.world.setCycle(t, THEMES.meadow, THEMES.night, this.dayProgress);
    const day = THEMES.meadow.grade;
    const night = THEMES.night.grade;
    game.view.setGrade({
      shadows: new THREE.Color(day.shadows).lerp(new THREE.Color(night.shadows), t).getHex(),
      highlights: new THREE.Color(day.highlights).lerp(new THREE.Color(night.highlights), t).getHex(),
      tone: day.tone + (night.tone - day.tone) * t,
      saturation: day.saturation + (night.saturation - day.saturation) * t,
    });
    game.view.renderer.toneMappingExposure = game.world.exposure;
    const nightAmbient = t > 0.5;
    if (nightAmbient !== this.ambientNight) {
      this.ambientNight = nightAmbient;
      const half = this.sim.level.width / 2 + 1.5;
      game.world.ambient.configure(nightAmbient ? THEMES.night.ambient : THEMES.meadow.ambient, half, half);
    }
  }

  render(dt, realDt, time) {
    const game = this.game;
    const sim = this.sim;
    this.applyCycle(false, realDt);
    game.realmViews.update(dt, time, game.view.camera, this.cycleT);
    game.world.terrain.showGrid(game.selection?.kind === 'build');

    // Swings of the axe and pick: chips and sounds near the camera.
    for (const worker of sim.workers) {
      if (worker.state !== 'harvest' || !worker.node) {
        worker.swing = 0.3;
        continue;
      }
      worker.swing = (worker.swing ?? 0.3) - dt;
      if (worker.swing > 0) continue;
      worker.swing = SWING_EVERY;
      const cell = worker.node;
      const resource = cell.node?.resource ?? 'wood';
      game.effects.chips(cell.x, cell.z, resource);
      game.realmViews.harvestHit(cell);
      if (Math.hypot(cell.x - game.rig.target.x, cell.z - game.rig.target.z) < 9) game.audio.chop(resource);
    }

    // Builders hammer away: dust, sparks and knocks.
    for (const worker of sim.workers) {
      if (worker.state !== 'building' || !worker.site) {
        worker.hammer = Math.random() * HAMMER_EVERY;
        continue;
      }
      worker.hammer = (worker.hammer ?? 0) - dt;
      if (worker.hammer > 0) continue;
      worker.hammer = HAMMER_EVERY * (0.85 + Math.random() * 0.3);
      const x = worker.x + worker.dirX * 0.35;
      const z = worker.z + worker.dirZ * 0.35;
      game.effects.hammer(x, CONFIG.world.tileTop + 0.25, z);
      if (this.nearCamera(x, z, 9)) game.audio.hammer();
    }

    if (game.mode !== 'playing') return;
    this.ui.setStats(Math.ceil(sim.lives), sim.gold, null, null);
    this.ui.setResources(sim.stock, sim.storageCap());
    this.ui.setDay(`${sim.day} ${sim.phase === PHASE.NIGHT ? '🌙' : '☀️'}`);
    this.ui.setWaveButton(this.waveButtonState());
    const counts = sim.jobCounts();
    const researchReady = sim.hasAcademy() && RESEARCH.some((item) => sim.canResearch(item));
    this.ui.setRealmBar(
      counts.idle > 0 ? `Ouvriers · ${counts.idle} libre${counts.idle > 1 ? 's' : ''}` : `Ouvriers · ${sim.workers.length}`,
      counts.idle > 0,
      sim.hasAcademy() ? 'Recherche' : 'Recherche 🔒',
      sim.hasAcademy(),
      researchReady,
    );
    const kind = game.selection?.kind;
    if (kind === 'build') this.refreshBuild();
    else if (kind === 'structure') this.refreshInfo();
    else if (kind === 'workers') this.refreshWorkers();
  }

  waveButtonState() {
    const sim = this.sim;
    if (sim.phase === PHASE.DAY) {
      const bonus = sim.earlyCallBonus;
      const length = sim.day === 1 ? REALM.firstDayLength : REALM.dayLength;
      return {
        title: `La nuit tombe dans ${formatTime(sim.phaseTimer)}`,
        meta: bonus > 0 ? `Lancer la nuit maintenant : +${bonus} or` : 'Lancer la nuit',
        enabled: true,
        ready: sim.phaseTimer < 30,
        progress: 1 - sim.phaseTimer / length,
        preview: [],
        previewKey: `day${sim.day}`,
      };
    }
    const remaining = sim.enemies.filter((e) => e.active).length + (sim.spawners[0] ? sim.spawners[0].wave.spawns.length - sim.spawners[0].cursor : 0);
    const counts = sim.nightWave?.counts ?? {};
    return {
      title: `Nuit ${sim.day}`,
      meta: remaining > 0 ? `${remaining} ovni${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}` : 'L’aube arrive…',
      enabled: false,
      ready: false,
      progress: 0,
      preview: Object.entries(counts).map(([type, count]) => ({ type, count })),
      previewKey: `night${sim.day}`,
    };
  }
}
