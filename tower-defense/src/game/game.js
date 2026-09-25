import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { FixedLoop } from '../core/loop.js';
import { QUALITY_SETTINGS, clearRun, earnedStars, loadRun, writeRun, writeSave } from '../core/storage.js';
import { ACHIEVEMENTS, runReward } from '../data/achievements.js';
import { LEVELS, SURVIVAL } from '../data/levels.js';
import { PERKS, buildModifiers, spentStars } from '../data/perks.js';
import { SPELLS, SPELL_ORDER } from '../data/spells.js';
import { TOWERS, TOWER_ORDER } from '../data/towers.js';
import { PointerInput } from '../input/pointer.js';
import { CameraRig } from '../render/cameraRig.js';
import { Effects } from '../render/effects.js';
import { EnemyViews } from '../render/enemyViews.js';
import { ProjectileViews } from '../render/projectileViews.js';
import { RealmViews } from '../render/realmViews.js';
import { SpellViews } from '../render/spellViews.js';
import { TowerViews } from '../render/towerViews.js';
import { FrameRateMonitor, detectInitialQuality, lowerQuality } from '../render/view.js';
import { World } from '../render/world.js';
import { Level } from '../sim/level.js';
import { SIM_STATE, Simulation } from '../sim/simulation.js';
import { RealmMode } from './realmMode.js';

const MODE = Object.freeze({ MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', ENDED: 'ended', PERKS: 'perks' });
const END_SCREEN_DELAY = 1.6;
const MULTI_KILL_WINDOW = 0.35;
const SURVIVAL_STAR_EVERY = 10;
const AUTOSAVE_EVERY = 4;
const ALL_LEVELS = [...LEVELS, SURVIVAL];
const TUTORIAL = [
  "Touche une case d'herbe pour construire ta première tour.",
  'Bien joué ! Touche « Lancer la vague 1 » quand tu es prêt.',
  'Tes sorts se rechargent en bas à gauche : touche-en un, puis la carte.',
];

/** Glue between the simulation, the 3D views, the UI, audio and input. */
export class Game {
  constructor({ view, assets, audio, haptics, ui, save }) {
    this.view = view;
    this.assets = assets;
    this.audio = audio;
    this.haptics = haptics;
    this.ui = ui;
    this.save = save;

    const scene = view.scene;
    this.world = new World(scene, assets, view.renderer);
    this.effects = new Effects(scene, assets);
    this.towerViews = new TowerViews(scene, assets);
    this.enemyViews = new EnemyViews(scene, assets);
    this.projectileViews = new ProjectileViews(scene, assets, this.effects);
    this.spellViews = new SpellViews(scene, assets, this.effects, view.camera);
    this.realmViews = new RealmViews(scene, assets, this.world, this.effects);
    this.rig = new CameraRig(view.camera);
    this.input = new PointerInput(view.canvas);
    this.monitor = new FrameRateMonitor();
    this.autoQuality = detectInitialQuality();

    this.mode = MODE.MENU;
    this.sim = null;
    this.current = null; // { def, index, heroic }
    this.speed = 1;
    this.selection = null;
    this.armedSpell = null;
    this.sheetGold = -1;
    this.renderTime = 0;
    this.endTimer = 0;
    this.tutorialStep = -1;
    this.tutorialTimer = 0;
    this.previewCache = new Map();
    this.recentKills = [];
    this.smokeTimer = 0;
    this.spellCharges = {};
    this.spellRemaining = {};
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.resizeQueued = false;
    this.autosaveTimer = 0;
    this.runCommitted = false;

    this.loop = new FixedLoop({
      step: CONFIG.loop.fixedStep,
      maxFrameDelta: CONFIG.loop.maxFrameDelta,
      maxSubSteps: CONFIG.loop.maxSubSteps,
      onFrame: (dt) => this.onFrame(dt),
      update: (dt) => this.update(dt),
      render: (_, dt) => this.render(dt),
    });

    this.listener = this.createListener();
    // Kingdom mode reuses everything above; `this.realm` is set while it runs.
    this.realm = null;
    this.realmMode = new RealmMode(this);
    this.bindUi();
    this.bindInput();
    this.bindLifecycle();
    view.onResize = (width, height) => this.handleResize(width, height);
    view.onContextLost = () => this.handleContextLost();
    view.onContextRestored = () => this.handleContextRestored();
    this.applyQualitySetting();
  }

  start() {
    this.showMenu();
  }

  get snowy() {
    return this.current?.def.theme === 'snow';
  }

  // ------------------------------------------------------------ simulation events

  createListener() {
    return {
      onWaveStart: (index, bonus) => {
        this.ui.showBanner(`Vague ${index + 1}`, bonus > 0 ? `Appel anticipé : +${bonus} or` : '');
        this.audio.waveStart();
        this.audio.setIntensity(1);
        if (this.tutorialStep === 1) this.advanceTutorial();
      },
      onWaveCleared: (index, bonus, perfect) => {
        if (perfect) this.ui.showBanner('Vague parfaite !', `+${bonus} or · aucun ovni n’est passé`);
        else this.ui.showBanner('Vague repoussée', `+${bonus} or`);
        this.audio.waveCleared();
        const base = this.sim.level.base;
        this.flyCoinsFrom(base.x, 1, base.z, perfect ? 8 : 5);
        if (!this.sim.enemies.some((e) => e.active) && this.sim.spawners.length === 0) this.audio.setIntensity(0);
      },
      onEnemySpawn: (enemy) => {
        this.enemyViews.acquire(enemy);
        if (enemy.distance === 0) this.effects.spawnBeam(enemy.x, enemy.z);
      },
      onEnemyHit: (enemy) => this.enemyViews.hit(enemy),
      onEnemyKilled: (enemy) => {
        const big = enemy.def.id === 'boss';
        this.enemyViews.positionOf(enemy, this.tmp);
        const { x, y, z } = this.tmp;
        this.effects.enemyDeath(x, y, z, big);
        this.floatAt(x, y + 0.4, z, `+${enemy.def.reward}`);
        this.flyCoinsFrom(x, y, z, big ? 6 : 1);
        this.enemyViews.release(enemy);
        this.audio.enemyDeath(big);
        this.audio.coin();
        this.registerKill(x, y, z);
        if (big) {
          this.rig.shake(0.5);
          this.haptics.pulse(CONFIG.haptics.build);
        }
      },
      onEnemyLeaked: (enemy) => {
        this.enemyViews.release(enemy);
        const base = this.sim.level.base;
        this.world.hitCastle();
        this.effects.castleHit(base.x, base.z);
        this.floatAt(base.x, 1.6, base.z, `−${enemy.def.leak}`, 'danger');
        this.rig.shake(0.35);
        this.ui.hurt();
        this.audio.leak();
        this.haptics.pulse(CONFIG.haptics.leak);
      },
      onTowerBuilt: (tower) => {
        this.towerViews.add(tower);
        this.effects.build(tower.x, tower.z, this.snowy);
        this.audio.build();
        this.haptics.pulse(CONFIG.haptics.build);
      },
      onTowerUpgraded: (tower) => {
        this.towerViews.upgrade(tower);
        this.effects.upgrade(tower.x, tower.z);
        this.audio.upgrade();
        this.haptics.pulse(CONFIG.haptics.build);
      },
      onTowerSold: (tower, refund) => {
        this.effects.sell(tower.x, tower.z);
        this.floatAt(tower.x, 1, tower.z, `+${refund}`);
        this.towerViews.remove(tower);
        this.audio.sell();
      },
      onFire: (tower, projectile) => {
        this.projectileViews.acquire(projectile);
        this.towerViews.fired(tower);
        this.audio.shoot(tower.def.id);
        if (tower.def.id !== 'ballista') this.effects.muzzle(tower.x, projectile.y, tower.z);
      },
      onImpact: (projectile) => {
        this.projectileViews.release(projectile);
        const { x, y, z, kind, splash } = projectile;
        if (kind === 'shell') {
          this.effects.groundImpact(x, z, splash, this.snowy);
          this.effects.explosion(x, y + 0.2, z, splash);
          this.audio.explosion(true);
          this.rig.shake(0.12);
        } else if (kind === 'poison') {
          this.effects.poisonCloud(x, z, splash);
          this.audio.shoot('poison');
        } else if (kind === 'boulder') {
          this.effects.groundImpact(x, z, splash, this.snowy);
          this.audio.explosion(true);
          this.rig.shake(0.08);
        } else if (kind === 'cannonball') {
          this.effects.explosion(x, y, z, splash);
          this.audio.explosion(false);
        } else {
          this.effects.sparksAt(x, y, z);
        }
      },
      onChain: (tower, chain) => {
        const from = this.tmp2.set(tower.x, tower.muzzleY + 0.2, tower.z).clone();
        const points = chain.map((enemy) => this.enemyViews.positionOf(enemy, new THREE.Vector3()));
        this.spellViews.chain(from, points);
        for (const point of points) this.effects.sparksAt(point.x, point.y, point.z);
        this.audio.shoot('tesla');
      },
      onFlame: (tower, target) => {
        const to = this.enemyViews.positionOf(target, this.tmp2);
        this.effects.flameJet(tower.x, tower.muzzleY, tower.z, to.x, to.y, to.z);
        this.towerViews.fired(tower);
        this.audio.shoot('flame');
      },
      onBeam: () => this.audio.shoot('laser'),
      onMineIncome: (tower, amount) => {
        this.floatAt(tower.x, 1.4, tower.z, `+${amount}`);
        this.flyCoinsFrom(tower.x, 1, tower.z, 3);
        this.effects.goldShower(tower.x, tower.z);
      },
      onFrostPulse: (tower) => {
        this.effects.frostPulse(tower.x, tower.z, tower.stats.range);
        this.audio.shoot('frost');
      },
      onSpellCast: (id, x, z, targets) => {
        const spell = SPELLS[id];
        this.haptics.pulse(CONFIG.haptics.build);
        if (id === 'meteor') {
          this.spellViews.castMeteor(x, z, spell.delay);
          this.audio.meteorFall();
        } else if (id === 'blizzard') {
          this.spellViews.blizzard(x, z, spell.radius);
          this.ui.flash('frost');
          this.audio.blizzard();
          this.rig.shake(0.2);
        } else if (id === 'lightning') {
          this.spellViews.lightning(x, z, targets, (enemy, out) => this.enemyViews.positionOf(enemy, out));
          this.ui.flash('lightning');
          this.audio.lightning();
          this.rig.shake(0.25);
        } else if (id === 'quake') {
          const { routeX, routeZ } = this.sim.level;
          for (let i = 0; i < routeX.length; i += 4) this.effects.quakeDust(routeX[i], routeZ[i]);
          this.rig.shake(1);
          this.audio.quake();
          this.haptics.pulse(CONFIG.haptics.leak);
        } else if (id === 'repair') {
          const base = this.sim.level.base;
          this.effects.heal(base.x, base.z);
          this.floatAt(base.x, 1.8, base.z, targets > 0 ? `+${targets} ❤` : 'Château intact', targets > 0 ? 'heal' : '');
          this.audio.heal();
        } else if (id === 'goldrain') {
          this.effects.goldShower(0, 0);
          this.floatAt(0, 1.5, 0, `+${targets} or`, 'combo');
          this.flyCoinsFrom(0, 1, 0, 12);
          this.audio.goldRain();
          this.audio.coin();
        }
      },
      onSpellImpact: (id, x, z) => {
        if (id !== 'meteor') return;
        this.spellViews.meteorImpact(x, z, SPELLS.meteor.radius);
        this.ui.flash('');
        this.audio.explosion(true);
        this.audio.meteorImpact();
        this.rig.shake(0.7);
        this.haptics.pulse(CONFIG.haptics.leak);
      },
      onVictory: (stars) => this.finish(true, stars),
      onDefeat: () => this.finish(false, 0),
    };
  }

  /** Several kills in a short window grant a bonus: rewards splash towers and spells. */
  registerKill(x, y, z) {
    const now = this.sim.time;
    this.recentKills.push(now);
    while (this.recentKills.length && now - this.recentKills[0] > MULTI_KILL_WINDOW) this.recentKills.shift();
    const count = this.recentKills.length;
    if (count >= 3) {
      const bonus = CONFIG.economy.multiKillBonus;
      this.sim.addGold(bonus);
      const label = count >= 6 ? 'CARNAGE' : count >= 5 ? 'QUINTUPLÉ' : count >= 4 ? 'QUADRUPLÉ' : 'TRIPLÉ';
      this.floatAt(x, y + 0.9, z, `${label} ! +${bonus}`, 'combo');
      if (count === 3 || count === 5) this.audio.combo(count);
    }
  }

  // ------------------------------------------------------------ wiring

  bindUi() {
    const ui = this.ui;
    ui.on('btn-pause', () => this.pause());
    ui.on('btn-resume', () => this.resume());
    ui.on('btn-restart', () => {
      this.commitRun(false);
      this.startLevel(this.current);
    });
    ui.on('btn-quit', () => {
      this.persistRun();
      this.showMenu();
    });
    ui.on('btn-menu', () => this.showMenu());
    ui.on('btn-retry', () => this.startLevel(this.current));
    ui.on('btn-next', () => {
      const next = this.current.index + 1;
      if (next < LEVELS.length) this.startLevel({ def: LEVELS[next], index: next, heroic: false });
    });
    ui.on('btn-speed', () => this.toggleSpeed());
    ui.on('btn-wave', () => this.callWave());
    ui.on('btn-upgrade', () => this.upgradeSelected());
    ui.on('btn-sell', () => this.sellSelected());
    ui.on('btn-perks', () => this.showPerks());
    ui.on('btn-shop', () => this.showShop());
    ui.on('btn-shop-back', () => this.showMenu());
    ui.on('btn-achievements', () => this.showAchievements());
    ui.on('btn-achievements-back', () => this.showMenu());
    ui.on('btn-resume-run', () => this.resumeRun());
    ui.on('shopTab', () => this.renderShop());
    ui.on('btn-perks-back', () => this.showMenu());
    ui.on('btn-perks-reset', () => this.resetPerks());
    ui.on('btn-spell-cancel', () => {
      if (this.selection?.repeat) this.deselect();
      else this.armSpell(null);
    });
    ui.on('close', () => this.deselect());
    ui.on('buildCard', (type) => this.chooseTower(type));
    ui.on('targeting', (mode) => this.setTargeting(mode));
    ui.on('setting', (key) => this.toggleSetting(key));
    ui.on('spell', (id) => this.armSpell(this.armedSpell === id ? null : id));
    ui.renderSettings(this.save.settings, this.haptics.supported);
  }

  bindInput() {
    this.input.onTap = (x, y) => this.handleTap(x, y);
    this.input.onPan = (dx, dy) => {
      if (this.mode === MODE.PLAYING || this.mode === MODE.ENDED) this.rig.pan(dx, dy);
    };
    this.input.onDragStart = (x, y) => this.mode === MODE.PLAYING && Boolean(this.realm?.dragStart(x, y));
    this.input.onDragMove = (x, y) => this.realm?.dragMove(x, y);
    this.input.onDragEnd = () => this.realm?.dragEnd();
    this.input.onZoom = (factor) => {
      if (this.mode === MODE.PLAYING || this.mode === MODE.ENDED) this.rig.zoomBy(factor);
    };
    this.handleKey = (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (this.armedSpell) this.armSpell(null);
        else if (this.mode === MODE.PLAYING) this.pause();
        else if (this.mode === MODE.PAUSED) this.resume();
      } else if (this.mode === MODE.PLAYING && !(document.activeElement instanceof HTMLButtonElement)) {
        if (event.code === 'Space') {
          event.preventDefault();
          this.callWave();
        } else if (/^Digit[1-6]$/.test(event.code)) {
          const id = SPELL_ORDER.filter((spell) => this.sim.hasSpell(spell))[Number(event.code.slice(-1)) - 1];
          if (id) this.armSpell(this.armedSpell === id ? null : id);
        }
      }
    };
    window.addEventListener('keydown', this.handleKey);
  }

  bindLifecycle() {
    this.handleVisibility = () => {
      if (document.hidden) {
        if (this.mode === MODE.PLAYING) this.pause();
        this.persistRun();
        this.loop.stop();
        this.audio.suspend();
      } else {
        this.audio.resume();
        if (this.mode !== MODE.PAUSED && !this.view.contextLost) this.loop.start();
      }
    };
    this.handleBlur = () => {
      if (this.mode === MODE.PLAYING) this.pause();
    };
    this.handleWindowResize = () => {
      if (this.resizeQueued) return;
      this.resizeQueued = true;
      requestAnimationFrame(() => {
        this.resizeQueued = false;
        this.view.resize();
      });
    };
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('resize', this.handleWindowResize);
    window.visualViewport?.addEventListener('resize', this.handleWindowResize);
  }

  // ------------------------------------------------------------ progression

  levelStars(def) {
    return this.save.levels[def.id]?.stars ?? 0;
  }

  isUnlocked(index) {
    return index === 0 || this.levelStars(LEVELS[index - 1]) > 0;
  }

  get availableStars() {
    return earnedStars(this.save) - spentStars(this.save.perks);
  }

  get maxStars() {
    return LEVELS.length * 4 + 3;
  }

  canBuyPerk() {
    const available = this.availableStars;
    return PERKS.some((perk) => {
      const rank = this.save.perks[perk.id] ?? 0;
      return rank < perk.costs.length && perk.costs[rank] <= available;
    });
  }

  menuEntries() {
    const entries = LEVELS.map((def, index) => {
      const record = this.save.levels[def.id];
      return {
        def,
        index,
        unlocked: this.isUnlocked(index),
        stars: record?.stars ?? 0,
        crown: record?.crown ?? false,
        heroicAvailable: (record?.stars ?? 0) >= 3,
        info: `${def.waves} vagues · ${def.subtitle}`,
        lockText: 'Termine le niveau précédent',
      };
    });
    const survivalUnlocked = this.levelStars(LEVELS[SURVIVAL.unlockAfter]) > 0;
    entries.push({
      def: SURVIVAL,
      index: SURVIVAL.unlockAfter,
      unlocked: survivalUnlocked,
      stars: this.save.survival.stars,
      crown: false,
      heroicAvailable: false,
      info: this.save.survival.bestWave > 0 ? `Record : vague ${this.save.survival.bestWave} · 1 ★ toutes les ${SURVIVAL_STAR_EVERY} vagues` : SURVIVAL.subtitle,
      lockText: `Termine le niveau ${SURVIVAL.unlockAfter + 1} pour débloquer`,
    });
    return entries;
  }

  // ------------------------------------------------------------ flow

  showMenu() {
    this.realmMode.stop();
    this.mode = MODE.MENU;
    this.sim = null;
    this.armSpell(null);
    this.clearEntities();
    const unlocked = LEVELS.findLastIndex((_, i) => this.isUnlocked(i));
    this.current = { def: LEVELS[unlocked], index: unlocked, heroic: false };
    const backdrop = new Level(LEVELS[unlocked], unlocked);
    this.world.build(backdrop);
    this.view.setGrade(this.world.theme.grade);
    this.view.renderer.toneMappingExposure = this.world.exposure;
    this.frame(backdrop);
    this.rig.setOrbit(0.25);
    this.loop.timeScale = 1;
    this.ui.setPlayingUi(false);
    this.ui.coach(null);
    this.ui.renderLevels(this.menuEntries(), (entry, heroic) => this.startLevel({ def: entry.def, index: entry.index, heroic }));
    this.ui.setStarTotal(this.availableStars, earnedStars(this.save), this.canBuyPerk());
    this.refreshWallet();
    const run = loadRun();
    const runDef = run && ALL_LEVELS.find((def) => def.id === run.levelId);
    const realmCard = this.realmMode.menuDetail();
    this.ui.setRealmCard(realmCard.detail, realmCard.fresh);
    this.ui.setResume(runDef ? `${runDef.name}${run.heroic ? ' · Héroïque' : ''} · vague ${Math.max(1, run.snapshot.nextWave)} · ${run.snapshot.lives} vies` : null);
    this.ui.showScreen('menu');
    this.audio.setIntensity(0);
    this.audio.duck(false);
    this.loop.start();
  }

  showPerks() {
    this.mode = MODE.PERKS;
    this.renderPerks();
    this.ui.showScreen('perks');
    this.audio.click();
  }

  renderPerks() {
    this.ui.renderPerks(this.save.perks, this.availableStars, (id) => this.buyPerk(id));
  }

  buyPerk(id) {
    const perk = PERKS.find((p) => p.id === id);
    const rank = this.save.perks[id] ?? 0;
    if (!perk || rank >= perk.costs.length || perk.costs[rank] > this.availableStars) {
      this.audio.denied();
      return;
    }
    this.save.perks[id] = rank + 1;
    writeSave(this.save);
    this.audio.upgrade();
    this.haptics.pulse(CONFIG.haptics.build);
    this.renderPerks();
  }

  resetPerks() {
    if (spentStars(this.save.perks) === 0) return;
    this.save.perks = {};
    writeSave(this.save);
    this.audio.sell();
    this.renderPerks();
  }

  startLevel(target, snapshot = null) {
    if (!target) return;
    this.audio.unlock();
    this.armSpell(null);
    this.clearEntities();
    this.current = target;
    const { def, index, heroic } = target;
    const options = { heroic, modifiers: buildModifiers(this.save.perks), spells: this.save.owned.spells };
    if (snapshot) {
      // Rebuild the saved run silently, then attach the listener and create the views.
      this.sim = new Simulation(def, index, {}, options);
      this.sim.restore(snapshot);
      this.sim.listener = this.listener;
    } else {
      clearRun();
      this.sim = new Simulation(def, index, this.listener, options);
    }
    this.runCommitted = false;
    this.autosaveTimer = AUTOSAVE_EVERY;
    this.world.build(this.sim.level);
    this.view.setGrade(this.world.theme.grade);
    for (const tower of this.sim.towers) this.towerViews.add(tower);
    for (const enemy of this.sim.enemies) if (enemy.active) this.enemyViews.acquire(enemy);
    this.ui.setSpellCount(Object.keys(this.sim.spells).length);
    this.view.renderer.toneMappingExposure = this.world.exposure;
    this.frame(this.sim.level);
    this.rig.setOrbit(0);
    this.speed = 1;
    this.loop.timeScale = 1;
    this.ui.setSpeed(1);
    this.endTimer = 0;
    this.recentKills.length = 0;
    this.mode = MODE.PLAYING;
    this.ui.resetStats();
    this.ui.showScreen(null);
    this.ui.setPlayingUi(true);
    const detail = def.endless ? 'Vagues infinies' : `${def.waves} vagues · ${heroic ? 'Héroïque : 5 vies, ennemis renforcés' : def.subtitle}`;
    if (snapshot) this.ui.showBanner('Partie reprise', `${def.name} · vague ${Math.max(1, this.sim.nextWave)}`);
    else this.ui.showBanner(heroic ? `👑 ${def.name}` : def.name, detail, heroic ? 'danger' : '');
    this.audio.setIntensity(0);
    this.audio.duck(false);
    this.audio.click();
    this.monitor.reset();
    this.tutorialStep = index === 0 && !heroic && !def.endless && !snapshot && !this.save.tutorialDone ? 0 : -1;
    this.ui.coach(this.tutorialStep >= 0 ? TUTORIAL[0] : null);
    this.loop.start();
  }

  frame(level) {
    // Frame the island rim too, with a glimpse of sea around it.
    this.rig.setBounds(level.width + 1.1, level.height + 1.1);
    this.rig.reset();
    this.rig.minZoom = CONFIG.camera.minZoom;
    this.rig.fit(this.view.width, this.view.height);
    this.world.setViewDistance(this.rig.fitDistance);
  }

  clearEntities() {
    this.deselect();
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.towerViews.clear();
    this.spellViews.clear();
    this.effects.clear();
    this.input.reset();
  }

  pause() {
    if (this.mode !== MODE.PLAYING) return;
    this.mode = MODE.PAUSED;
    this.realmMode.resetPauseMenu();
    this.armSpell(null);
    this.persistRun();
    this.loop.stop();
    this.input.reset();
    this.ui.showScreen('pause');
    this.audio.duck(true);
  }

  resume() {
    if (this.mode !== MODE.PAUSED || this.view.contextLost || document.hidden) return;
    this.mode = MODE.PLAYING;
    this.ui.showScreen(null);
    this.audio.duck(false);
    this.loop.start();
  }

  finish(victory, stars) {
    this.mode = MODE.ENDED;
    this.deselect();
    this.armSpell(null);
    this.ui.coach(null);
    for (const projectile of this.sim.projectiles) projectile.active = false;
    this.projectileViews.clear();
    this.speed = 1;
    this.loop.timeScale = 1;
    this.endTimer = END_SCREEN_DELAY;
    this.audio.setIntensity(0);
    const { def, heroic } = this.current;
    const before = earnedStars(this.save);
    this.wasCleared = (this.save.levels[def.id]?.stars ?? 0) > 0;
    this.hadCrown = this.save.levels[def.id]?.crown ?? false;

    if (def.endless) {
      const reached = Math.max(0, this.sim.nextWave - 1);
      const record = reached > this.save.survival.bestWave;
      this.save.survival.bestWave = Math.max(this.save.survival.bestWave, reached);
      this.save.survival.stars = Math.min(3, Math.max(this.save.survival.stars, Math.floor(this.save.survival.bestWave / SURVIVAL_STAR_EVERY)));
      this.endInfo = { record, reached };
      this.audio.defeat();
      this.ui.showBanner(record ? 'Nouveau record !' : 'Survie terminée', `Vague ${reached}`, record ? '' : 'danger');
    } else if (victory) {
      const record = this.save.levels[def.id] ?? { stars: 0, crown: false };
      this.save.levels[def.id] = { stars: Math.max(record.stars, stars), crown: record.crown || heroic };
      this.audio.victory();
      this.haptics.pulse(CONFIG.haptics.victory);
      this.ui.showBanner(heroic ? 'Couronne gagnée !' : 'Victoire !', '★'.repeat(stars) + '☆'.repeat(3 - stars));
    } else {
      this.audio.defeat();
      this.haptics.pulse(CONFIG.haptics.leak);
      this.ui.showBanner('Le château est tombé', '', 'danger');
    }
    this.newStars = earnedStars(this.save) - before;
    clearRun();
    this.commitRun(victory);
    writeSave(this.save);
  }

  /** Adds this run to lifetime stats, pays gems and checks achievements (once per run). */
  commitRun(victory) {
    const sim = this.sim;
    if (!sim || this.runCommitted) return;
    this.runCommitted = true;
    const { def, heroic } = this.current;
    const stats = this.save.stats;
    const run = sim.stats;
    stats.kills += run.kills;
    stats.bossKills += run.bossKills;
    stats.spellsCast += run.spellsCast;
    stats.perfectWaves += run.perfectWaves;
    stats.towersMaxed += run.towersMaxed;
    stats.maxGold = Math.max(stats.maxGold, run.maxGold);
    const records = Object.values(this.save.levels);
    stats.levelsWon = LEVELS.filter((level) => (this.save.levels[level.id]?.stars ?? 0) > 0).length;
    stats.bestStars = Math.max(0, ...records.map((r) => r.stars));
    stats.crowns = records.filter((r) => r.crown).length;
    if (def.endless) stats.survivalWave = Math.max(stats.survivalWave, this.save.survival.bestWave);
    const firstClear = victory && !this.wasCleared;
    if (victory) stats.wins++;
    const reward = sim.over ? runReward({
      victory,
      stars: sim.stars,
      firstClear: heroic ? !this.hadCrown : firstClear,
      heroic,
      endless: def.endless,
      wavesCleared: sim.stats.wavesCleared,
    }) : 0;
    this.save.gems += reward;
    this.gemsEarned = reward + this.checkAchievements();
    writeSave(this.save);
  }

  /** Unlocks newly met achievements; returns the gems they paid. */
  checkAchievements() {
    let gems = 0;
    const unlocked = [];
    for (const achievement of ACHIEVEMENTS) {
      if (this.save.achievements[achievement.id] || !achievement.check(this.save.stats)) continue;
      this.save.achievements[achievement.id] = true;
      this.save.gems += achievement.reward;
      gems += achievement.reward;
      unlocked.push(achievement);
    }
    unlocked.forEach((achievement, i) => {
      setTimeout(() => {
        this.ui.showBanner(`🏆 ${achievement.name}`, `Succès débloqué · +${achievement.reward} gemmes`);
        this.audio.victory();
      }, 2500 + i * 2400);
    });
    return gems;
  }

  /** Saves the run in progress so it can be resumed after closing the page. */
  persistRun() {
    if (this.realm) {
      this.realm.persist();
      return;
    }
    const sim = this.sim;
    if (!sim || sim.over || !this.current || (this.mode !== MODE.PLAYING && this.mode !== MODE.PAUSED)) return;
    writeRun({
      levelId: this.current.def.id,
      heroic: this.current.heroic,
      savedAt: Date.now(),
      snapshot: sim.serialize(),
    });
  }

  resumeRun() {
    const run = loadRun();
    const index = LEVELS.findIndex((def) => def.id === run?.levelId);
    const def = index >= 0 ? LEVELS[index] : run?.levelId === SURVIVAL.id ? SURVIVAL : null;
    if (!def) {
      clearRun();
      this.showMenu();
      return;
    }
    this.startLevel({ def, index: def.endless ? SURVIVAL.unlockAfter : index, heroic: run.heroic }, run.snapshot);
  }

  refreshWallet() {
    const done = ACHIEVEMENTS.filter((a) => this.save.achievements[a.id]).length;
    const affordable = this.shopItems().some((item) => !item.owned && item.price <= this.save.gems);
    this.ui.setWallet(this.save.gems, affordable, done, ACHIEVEMENTS.length);
  }

  shopItems() {
    const towers = TOWER_ORDER.filter((id) => TOWERS[id].shopPrice).map((id) => {
      const def = TOWERS[id];
      const lv = def.levels[0];
      const stats = lv.income
        ? `Coût ${def.cost} or · +${lv.income} or par vague (jusqu’à +${def.levels[2].income})`
        : `Coût ${def.cost} or · ${lv.beam ? `${Math.round(lv.damage * 10)} dégâts/s (monte ×${lv.maxRamp})` : `${lv.damage} dégâts`} · portée ${lv.range}${lv.chains ? ` · ${lv.chains} rebonds` : ''}${lv.burn ? ` · brûlure ${lv.burn}/s` : ''}${lv.poison ? ` · poison ${lv.poison}/s` : ''}${lv.armorPierce && !lv.beam ? ' · perce l’armure' : ''}`;
      return { id, kind: 'tower', name: def.name, blurb: def.blurb, stats, price: def.shopPrice, owned: this.save.owned.towers.includes(id) };
    });
    const spells = SPELL_ORDER.filter((id) => SPELLS[id].shopPrice).map((id) => {
      const def = SPELLS[id];
      return { id, kind: 'spell', name: def.name, blurb: def.blurb, stats: `Recharge ${def.cooldown} s`, price: def.shopPrice, owned: this.save.owned.spells.includes(id) };
    });
    return [...towers, ...spells];
  }

  showShop() {
    this.mode = MODE.PERKS;
    this.renderShop();
    this.ui.showScreen('shop');
    this.audio.click();
  }

  renderShop() {
    const kind = this.ui.shopTab === 'spells' ? 'spell' : 'tower';
    this.ui.renderShop(this.shopItems().filter((item) => item.kind === kind), this.save.gems, (item) => this.buyItem(item));
  }

  buyItem(item) {
    if (item.owned || this.save.gems < item.price) {
      this.audio.denied();
      return;
    }
    this.save.gems -= item.price;
    if (item.kind === 'tower') this.save.owned.towers.push(item.id);
    else this.save.owned.spells.push(item.id);
    writeSave(this.save);
    this.audio.upgrade();
    this.haptics.pulse(CONFIG.haptics.victory);
    this.ui.showBanner(`${item.name} débloqué !`, item.kind === 'tower' ? 'Disponible dans le menu de construction' : 'Disponible dans la barre des sorts');
    this.renderShop();
    this.refreshWallet();
  }

  showAchievements() {
    this.mode = MODE.PERKS;
    this.ui.renderAchievements(ACHIEVEMENTS.map((a) => ({ ...a, done: Boolean(this.save.achievements[a.id]) })));
    this.ui.showScreen('achievements');
    this.audio.click();
  }

  showEndScreen() {
    const sim = this.sim;
    const { def, index, heroic } = this.current;
    const victory = sim.state === SIM_STATE.WON;
    this.ui.setPlayingUi(false);
    const parts = [];
    if (this.newStars > 0) parts.push(`+${this.newStars} ★`);
    if (this.gemsEarned > 0) parts.push(`+${this.gemsEarned} gemmes`);
    const reward = parts.length ? `${parts.join(' · ')} gagnées` : '';
    if (def.endless) {
      this.ui.showEnd({
        victory: false,
        title: this.endInfo.record ? 'Nouveau record !' : 'Survie terminée',
        levelName: 'Survie',
        stars: 0,
        hasNext: false,
        reward,
        stats: [
          ['Vague atteinte', this.endInfo.reached],
          ['Record', this.save.survival.bestWave],
          ['Ovnis détruits', sim.stats.kills],
          ['Vagues parfaites', sim.stats.perfectWaves],
        ],
      });
      return;
    }
    this.ui.showEnd({
      victory,
      title: victory && heroic ? 'Couronne !' : undefined,
      levelName: heroic ? `${def.name} · Héroïque` : def.name,
      stars: sim.stars,
      hasNext: !heroic && index < LEVELS.length - 1,
      reward,
      stats: [
        ['Vagues', `${victory ? sim.waveCount : Math.max(0, sim.nextWave - 1)}/${sim.waveCount}`],
        ['Vies restantes', `${sim.lives}/${sim.startLives}`],
        ['Ovnis détruits', sim.stats.kills],
        ['Vagues parfaites', sim.stats.perfectWaves],
      ],
    });
  }

  // ------------------------------------------------------------ player actions

  callWave() {
    if (this.mode !== MODE.PLAYING || !this.sim) return;
    if (this.realm) {
      this.realm.callNight();
      return;
    }
    const sim = this.sim;
    const canCall = sim.canCallWave() && (sim.nextWave === 0 || sim.countdown > 0);
    if (!canCall) return;
    this.audio.unlock();
    sim.callNextWave();
  }

  toggleSpeed() {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.loop.timeScale = this.speed;
    this.ui.setSpeed(this.speed);
    this.audio.click();
  }

  armSpell(id) {
    if (id && (!this.sim || this.mode !== MODE.PLAYING)) return;
    if (id && !this.sim.spellReady(id)) {
      this.audio.denied();
      return;
    }
    if (id && SPELLS[id].global) {
      // Global spells need no aiming.
      this.sim.castSpell(id, 0, 0);
      this.armedSpell = null;
      this.ui.showSpellHint(null);
      return;
    }
    this.armedSpell = id;
    if (id) {
      this.deselect();
      this.audio.click();
    }
    this.ui.showSpellHint(id);
    if (!id) this.effects.hideRange();
  }

  handleTap(clientX, clientY) {
    if (this.mode !== MODE.PLAYING || !this.sim) return;
    const hit = this.rig.groundAt(clientX, clientY, this.view.canvas.getBoundingClientRect());
    if (this.armedSpell) {
      if (hit && Math.abs(hit.x) < this.sim.level.width / 2 + 1 && Math.abs(hit.z) < this.sim.level.height / 2 + 1) {
        const id = this.armedSpell;
        if (this.sim.castSpell(id, hit.x, hit.z)) {
          this.armSpell(null);
          if (this.tutorialStep === 2) this.advanceTutorial();
        }
      }
      return;
    }
    if (this.realm) {
      this.realm.handleTap(hit);
      return;
    }
    // Every tower under the finger, nearest first, then the one on the tile below.
    // Tapping the same spot again cycles to the next, so a tower hidden behind a tall one stays reachable.
    const cell = hit ? this.sim.level.cellAtWorld(hit.x, hit.z) : null;
    const candidates = this.towerViews.pick(this.rig.raycaster);
    const onTile = cell ? this.sim.towerAt(cell) : null;
    if (onTile && !candidates.includes(onTile)) candidates.push(onTile);
    const current = this.selection?.kind === 'tower' ? candidates.indexOf(this.selection.tower) : -1;
    const tower = candidates.length > 0 ? candidates[(current + 1) % candidates.length] : null;
    if (tower) this.selectTower(tower);
    else if (cell && this.sim.canBuild(cell)) this.selectBuildCell(cell);
    else this.deselect();
  }

  selectBuildCell(cell) {
    this.selection = { kind: 'build', cell, pending: null };
    this.effects.showCursor(cell.x, cell.z);
    this.effects.hideRange();
    this.sheetGold = this.sim.gold;
    this.ui.openBuildSheet(this.sim.gold, null, this.save.owned.towers);
    this.audio.click();
    this.haptics.pulse(CONFIG.haptics.tap);
  }

  chooseTower(type) {
    const selection = this.selection;
    if (!selection || selection.kind !== 'build' || !this.sim) return;
    const def = TOWERS[type];
    const affordable = this.sim.gold >= def.cost;
    if (selection.pending === type) {
      if (!affordable) {
        this.ui.denyCard(type);
        this.audio.denied();
        return;
      }
      const tower = this.sim.build(type, selection.cell);
      if (!tower) return;
      this.deselect();
      if (this.tutorialStep === 0) this.advanceTutorial();
      return;
    }
    selection.pending = type;
    if (def.levels[0].range > 0) this.effects.showRange(selection.cell.x, selection.cell.z, def.levels[0].range * this.sim.modifiers.range, affordable);
    else this.effects.hideRange();
    this.ui.refreshBuildSheet(this.sim.gold, type);
    if (affordable) this.audio.click();
    else {
      this.ui.denyCard(type);
      this.audio.denied();
    }
  }

  selectTower(tower) {
    this.selection = { kind: 'tower', tower, confirmSell: false };
    this.effects.showCursor(tower.x, tower.z);
    if (tower.stats.range > 0) this.effects.showRange(tower.x, tower.z, tower.stats.range);
    else this.effects.hideRange();
    this.sheetGold = this.sim.gold;
    this.ui.openTowerSheet(tower, this.sim.gold, false);
    this.audio.click();
    this.haptics.pulse(CONFIG.haptics.tap);
  }

  upgradeSelected() {
    const selection = this.selection;
    if (selection?.kind !== 'tower') return;
    if (!this.sim.upgrade(selection.tower)) {
      this.audio.denied();
      return;
    }
    selection.confirmSell = false;
    if (selection.tower.stats.range > 0) this.effects.showRange(selection.tower.x, selection.tower.z, selection.tower.stats.range);
    this.ui.refreshTowerSheet(selection.tower, this.sim.gold, false);
  }

  sellSelected() {
    const selection = this.selection;
    if (selection?.kind !== 'tower') return;
    if (!selection.confirmSell) {
      selection.confirmSell = true;
      this.ui.refreshTowerSheet(selection.tower, this.sim.gold, true);
      this.audio.click();
      return;
    }
    this.sim.sell(selection.tower);
    this.deselect();
  }

  setTargeting(mode) {
    if (this.realm) {
      this.realm.setTargeting(mode);
      return;
    }
    const selection = this.selection;
    if (selection?.kind !== 'tower') return;
    selection.tower.targeting = mode;
    this.ui.refreshTowerSheet(selection.tower, this.sim.gold, selection.confirmSell);
    this.audio.click();
  }

  deselect() {
    if (this.selection?.repeat) this.ui.showSpellHint(null);
    this.selection = null;
    this.effects.hideRange();
    this.effects.hideCursor();
    this.ui.closeSheets();
  }

  advanceTutorial() {
    this.tutorialStep++;
    if (this.tutorialStep < TUTORIAL.length) {
      this.ui.coach(TUTORIAL[this.tutorialStep]);
      if (this.tutorialStep === TUTORIAL.length - 1) this.tutorialTimer = 9;
      return;
    }
    this.tutorialStep = -1;
    this.ui.coach(null);
    this.save.tutorialDone = true;
    writeSave(this.save);
  }

  toggleSetting(key) {
    const settings = this.save.settings;
    this.audio.unlock();
    if (key === 'sound') {
      settings.sound = !settings.sound;
      this.audio.setSound(settings.sound);
    } else if (key === 'music') {
      settings.music = !settings.music;
      this.audio.setMusic(settings.music);
    } else if (key === 'haptics') {
      settings.haptics = !settings.haptics;
      this.haptics.setEnabled(settings.haptics);
      this.haptics.pulse(CONFIG.haptics.build);
    } else if (key === 'quality') {
      const index = QUALITY_SETTINGS.indexOf(settings.quality);
      settings.quality = QUALITY_SETTINGS[(index + 1) % QUALITY_SETTINGS.length];
      if (settings.quality === 'auto') this.autoQuality = detectInitialQuality();
      this.applyQualitySetting();
    }
    writeSave(this.save);
    this.ui.renderSettings(settings, this.haptics.supported);
    this.audio.click();
  }

  applyQualitySetting() {
    const setting = this.save.settings.quality;
    this.view.applyQuality(setting === 'auto' ? this.autoQuality : setting);
    this.world.applyQuality(this.view.preset);
    this.effects.scale = this.view.preset.effects;
    this.monitor.reset();
    if (!this.loop.running) this.loop.renderOnce();
  }

  // ------------------------------------------------------------ loop

  onFrame(realDt) {
    if (this.mode === MODE.PLAYING) {
      this.autosaveTimer -= realDt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = AUTOSAVE_EVERY;
        this.persistRun();
      }
    }
    if (this.endTimer > 0) {
      this.endTimer -= realDt;
      if (this.endTimer <= 0) this.showEndScreen();
    }
    if (this.tutorialTimer > 0) {
      this.tutorialTimer -= realDt;
      if (this.tutorialTimer <= 0 && this.tutorialStep === TUTORIAL.length - 1) this.advanceTutorial();
    }
    if (this.mode === MODE.PLAYING && this.save.settings.quality === 'auto' && this.monitor.sample(realDt)) {
      const lower = lowerQuality(this.autoQuality);
      if (lower) {
        this.autoQuality = lower;
        this.applyQualitySetting();
      }
    }
  }

  update(dt) {
    if (this.mode === MODE.PLAYING) this.sim?.step(dt);
  }

  render(realDt) {
    const dt = realDt * this.loop.timeScale;
    this.renderTime += dt;
    this.rig.update(realDt);
    this.world.update(dt, this.view.camera);
    this.towerViews.update(dt, this.renderTime);
    this.enemyViews.update(dt, this.renderTime, this.view.camera);
    this.projectileViews.update(dt);
    this.spellViews.update(dt);
    this.effects.update(dt);

    const sim = this.sim;
    // Enemies on fire or poisoned give off flames and bubbles.
    if (sim) {
      for (const enemy of sim.enemies) {
        if (!enemy.active || !enemy.view || (enemy.burnTimer <= 0 && enemy.poisonTimer <= 0)) continue;
        if (Math.random() > dt * 14 * this.effects.scale) continue;
        const p = enemy.view.root.position;
        this.effects.burning(p.x, p.y, p.z, enemy.burnTimer <= 0);
      }
    }
    if (this.realm) {
      this.realm.render(dt, realDt, this.renderTime);
      if (sim && this.mode === MODE.PLAYING) {
        for (const id of SPELL_ORDER) {
          if (!sim.hasSpell(id)) {
            delete this.spellCharges[id];
            continue;
          }
          this.spellCharges[id] = sim.spellCharge(id);
          this.spellRemaining[id] = sim.spells[id].cooldown;
        }
        this.ui.setSpells(this.spellCharges, this.spellRemaining, this.armedSpell, true);
      }
    } else if (sim && (this.mode === MODE.PLAYING || this.mode === MODE.ENDED)) {
      this.ui.setStats(sim.lives, sim.gold, sim.nextWave, sim.waveCount);
      this.ui.setWaveButton(this.waveButtonState());
      for (const id of SPELL_ORDER) {
        if (!sim.hasSpell(id)) {
          delete this.spellCharges[id];
          continue;
        }
        this.spellCharges[id] = sim.spellCharge(id);
        this.spellRemaining[id] = sim.spells[id].cooldown;
      }
      this.ui.setSpells(this.spellCharges, this.spellRemaining, this.armedSpell, this.mode === MODE.PLAYING);
      if (this.selection && sim.gold !== this.sheetGold) {
        this.sheetGold = sim.gold;
        if (this.selection.kind === 'build') this.ui.refreshBuildSheet(sim.gold, this.selection.pending);
        else this.ui.refreshTowerSheet(this.selection.tower, sim.gold, this.selection.confirmSell);
      }
      // A castle under half health smokes.
      if (sim.lives < sim.startLives / 2 && this.mode === MODE.PLAYING) {
        this.smokeTimer -= dt;
        if (this.smokeTimer <= 0) {
          this.smokeTimer = sim.lives < sim.startLives / 4 ? 0.08 : 0.18;
          this.effects.castleSmoke(sim.level.base.x, sim.level.base.z);
        }
      }
    }
    this.view.render();
  }

  waveButtonState() {
    const sim = this.sim;
    if (sim.nextWave >= sim.waveCount) {
      return { title: sim.over ? 'Partie terminée' : 'Dernière vague !', meta: sim.over ? '' : 'Tiens bon jusqu’au bout', enabled: false, ready: false, progress: 0, preview: [], previewKey: 'none' };
    }
    const preview = this.previewFor(sim.nextWave);
    const base = { preview, previewKey: sim.nextWave, progress: 0 };
    if (sim.nextWave === 0) {
      return { ...base, title: 'Lancer la vague 1', meta: 'Construis tes tours, puis lance', enabled: true, ready: true };
    }
    if (sim.countdown > 0) {
      return {
        ...base,
        title: `Vague ${sim.nextWave + 1} dans ${Math.ceil(sim.countdown)} s`,
        meta: `Lancer maintenant : +${sim.earlyCallBonus} or`,
        enabled: true,
        ready: false,
        progress: 1 - sim.countdown / CONFIG.waves.countdown,
      };
    }
    return { ...base, title: `Vague ${sim.nextWave} en cours`, meta: 'La suivante se prépare…', enabled: false, ready: false };
  }

  previewFor(waveIndex) {
    const key = `${this.current.def.id}:${this.current.heroic}:${waveIndex}`;
    if (!this.previewCache.has(key)) {
      const counts = new Map();
      for (const spawn of this.sim.wave(waveIndex).spawns) counts.set(spawn.type, (counts.get(spawn.type) ?? 0) + 1);
      this.previewCache.set(key, [...counts].map(([type, count]) => ({ type, count })));
    }
    return this.previewCache.get(key);
  }

  floatAt(x, y, z, text, variant) {
    const rect = this.view.canvas.getBoundingClientRect();
    const point = this.rig.toScreen(this.tmp.set(x, y, z), rect);
    if (point.visible) this.ui.floatText(point.x, point.y, text, variant);
  }

  flyCoinsFrom(x, y, z, count) {
    const rect = this.view.canvas.getBoundingClientRect();
    const point = this.rig.toScreen(this.tmp.set(x, y, z), rect);
    if (point.visible) this.ui.flyCoins(point.x, point.y, count);
  }

  // ------------------------------------------------------------ platform events

  handleResize(width, height) {
    this.rig.fit(width, height);
    this.world.setViewDistance(this.rig.fitDistance);
    this.effects.setViewport(height * this.view.pixelRatio, this.view.camera.fov);
    this.world.ambient.setViewport(height * this.view.pixelRatio, this.view.camera.fov);
    this.realmViews.setViewport(height * this.view.pixelRatio, this.view.camera.fov);
    if (!this.loop.running) this.loop.renderOnce();
  }

  handleContextLost() {
    if (this.mode === MODE.PLAYING) this.pause();
    this.loop.stop();
    this.ui.setContextLost(true);
  }

  handleContextRestored() {
    this.ui.setContextLost(false);
    if (this.mode !== MODE.PAUSED && !document.hidden) this.loop.start();
    else this.loop.renderOnce();
  }

  dispose() {
    this.loop.stop();
    window.removeEventListener('keydown', this.handleKey);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('resize', this.handleWindowResize);
    window.visualViewport?.removeEventListener('resize', this.handleWindowResize);
    this.input.dispose();
    this.clearEntities();
    this.realmViews.dispose();
    this.enemyViews.dispose();
    this.spellViews.dispose();
    this.effects.dispose();
    this.world.dispose();
    this.assets.dispose();
    this.audio.dispose();
    this.view.dispose();
  }
}
