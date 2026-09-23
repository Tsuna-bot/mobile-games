import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { FixedLoop } from '../core/loop.js';
import { QUALITY_SETTINGS, writeSave } from '../core/storage.js';
import { LEVELS } from '../data/levels.js';
import { TOWERS } from '../data/towers.js';
import { PointerInput } from '../input/pointer.js';
import { CameraRig } from '../render/cameraRig.js';
import { Effects } from '../render/effects.js';
import { EnemyViews } from '../render/enemyViews.js';
import { ProjectileViews } from '../render/projectileViews.js';
import { TowerViews } from '../render/towerViews.js';
import { FrameRateMonitor, detectInitialQuality, lowerQuality } from '../render/view.js';
import { World } from '../render/world.js';
import { Level } from '../sim/level.js';
import { SIM_STATE, Simulation } from '../sim/simulation.js';

const MODE = Object.freeze({ MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', ENDED: 'ended' });
const END_SCREEN_DELAY = 1.6;
const TUTORIAL = [
  "Touche une case d'herbe pour construire ta première tour.",
  'Bien joué ! Touche « Lancer la vague 1 » quand tu es prêt.',
  "Touche une tour pour l'améliorer ou choisir sa cible.",
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
    this.world = new World(scene, assets);
    this.towerViews = new TowerViews(scene, assets);
    this.enemyViews = new EnemyViews(scene, assets);
    this.projectileViews = new ProjectileViews(scene, assets);
    this.effects = new Effects(scene, assets);
    this.rig = new CameraRig(view.camera);
    this.input = new PointerInput(view.canvas);
    this.monitor = new FrameRateMonitor();
    this.autoQuality = detectInitialQuality();

    this.mode = MODE.MENU;
    this.sim = null;
    this.levelIndex = 0;
    this.speed = 1;
    this.selection = null;
    this.sheetGold = -1;
    this.renderTime = 0;
    this.endTimer = 0;
    this.tutorialStep = -1;
    this.tutorialTimer = 0;
    this.previewCache = new Map();
    this.tmp = new THREE.Vector3();
    this.resizeQueued = false;

    this.loop = new FixedLoop({
      step: CONFIG.loop.fixedStep,
      maxFrameDelta: CONFIG.loop.maxFrameDelta,
      maxSubSteps: CONFIG.loop.maxSubSteps,
      onFrame: (dt) => this.onFrame(dt),
      update: (dt) => this.update(dt),
      render: (_, dt) => this.render(dt),
    });

    this.listener = this.createListener();
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

  // ------------------------------------------------------------ simulation events

  createListener() {
    return {
      onWaveStart: (index, bonus) => {
        this.ui.showBanner(`Vague ${index + 1}`, bonus > 0 ? `Appel anticipé : +${bonus} or` : '');
        this.audio.waveStart();
        this.audio.setIntensity(1);
        if (this.tutorialStep === 1) this.advanceTutorial();
      },
      onWaveCleared: (index, bonus) => {
        this.ui.showBanner('Vague repoussée', `+${bonus} or`);
        this.audio.waveCleared();
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
        this.effects.enemyDeath(this.tmp.x, this.tmp.y, this.tmp.z, big);
        this.floatAt(this.tmp.x, this.tmp.y + 0.4, this.tmp.z, `+${enemy.def.reward}`);
        this.enemyViews.release(enemy);
        this.audio.enemyDeath(big);
        this.audio.coin();
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
        if (tower.def.id === 'cannon' || tower.def.id === 'catapult') this.effects.muzzle(tower.x, projectile.y, tower.z);
      },
      onImpact: (projectile) => {
        this.projectileViews.release(projectile);
        const { x, y, z, kind, splash } = projectile;
        if (kind === 'boulder') {
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
      onFrostPulse: (tower) => {
        this.effects.frostPulse(tower.x, tower.z, tower.stats.range);
        this.audio.shoot('frost');
      },
      onVictory: (stars) => this.finish(true, stars),
      onDefeat: () => this.finish(false, 0),
    };
  }

  // ------------------------------------------------------------ wiring

  bindUi() {
    const ui = this.ui;
    ui.on('btn-pause', () => this.pause());
    ui.on('btn-resume', () => this.resume());
    ui.on('btn-restart', () => this.startLevel(this.levelIndex));
    ui.on('btn-quit', () => this.showMenu());
    ui.on('btn-menu', () => this.showMenu());
    ui.on('btn-retry', () => this.startLevel(this.levelIndex));
    ui.on('btn-next', () => this.startLevel(Math.min(this.levelIndex + 1, LEVELS.length - 1)));
    ui.on('btn-speed', () => this.toggleSpeed());
    ui.on('btn-wave', () => this.callWave());
    ui.on('btn-upgrade', () => this.upgradeSelected());
    ui.on('btn-sell', () => this.sellSelected());
    ui.on('close', () => this.deselect());
    ui.on('buildCard', (type) => this.chooseTower(type));
    ui.on('targeting', (mode) => this.setTargeting(mode));
    ui.on('setting', (key) => this.toggleSetting(key));
    ui.renderSettings(this.save.settings, this.haptics.supported);
  }

  bindInput() {
    this.input.onTap = (x, y) => this.handleTap(x, y);
    this.input.onPan = (dx, dy) => {
      if (this.mode === MODE.PLAYING || this.mode === MODE.ENDED) this.rig.pan(dx, dy);
    };
    this.input.onZoom = (factor) => {
      if (this.mode === MODE.PLAYING || this.mode === MODE.ENDED) this.rig.zoomBy(factor);
    };
    this.handleKey = (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (this.mode === MODE.PLAYING) this.pause();
        else if (this.mode === MODE.PAUSED) this.resume();
      } else if (event.code === 'Space' && this.mode === MODE.PLAYING && !(document.activeElement instanceof HTMLButtonElement)) {
        event.preventDefault();
        this.callWave();
      }
    };
    window.addEventListener('keydown', this.handleKey);
  }

  bindLifecycle() {
    this.handleVisibility = () => {
      if (document.hidden) {
        if (this.mode === MODE.PLAYING) this.pause();
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

  // ------------------------------------------------------------ flow

  showMenu() {
    this.mode = MODE.MENU;
    this.sim = null;
    this.clearEntities();
    const unlocked = LEVELS.findLastIndex((level, i) => i === 0 || (this.save.levels[LEVELS[i - 1].id]?.stars ?? 0) > 0);
    const backdrop = new Level(LEVELS[unlocked], unlocked);
    this.world.build(backdrop);
    this.snowy = backdrop.def.theme === 'snow';
    this.frame(backdrop);
    this.rig.setOrbit(0.25);
    this.loop.timeScale = 1;
    this.ui.setPlayingUi(false);
    this.ui.coach(null);
    this.ui.renderLevels(LEVELS, this.save, (index) => this.startLevel(index));
    this.ui.showScreen('menu');
    this.audio.setIntensity(0);
    this.audio.duck(false);
    this.loop.start();
  }

  startLevel(index) {
    this.audio.unlock();
    this.clearEntities();
    this.levelIndex = index;
    this.sim = new Simulation(LEVELS[index], index, this.listener);
    this.world.build(this.sim.level);
    this.snowy = LEVELS[index].theme === 'snow';
    this.frame(this.sim.level);
    this.rig.setOrbit(0);
    this.speed = 1;
    this.loop.timeScale = 1;
    this.ui.setSpeed(1);
    this.endTimer = 0;
    this.mode = MODE.PLAYING;
    this.ui.resetStats();
    this.ui.showScreen(null);
    this.ui.setPlayingUi(true);
    this.ui.showBanner(LEVELS[index].name, `${LEVELS[index].waves} vagues · ${LEVELS[index].subtitle}`);
    this.audio.setIntensity(0);
    this.audio.duck(false);
    this.audio.click();
    this.monitor.reset();
    this.tutorialStep = index === 0 && !this.save.tutorialDone ? 0 : -1;
    this.ui.coach(this.tutorialStep >= 0 ? TUTORIAL[0] : null);
    this.loop.start();
  }

  frame(level) {
    this.rig.setBounds(level.width, level.height);
    this.rig.reset();
    this.rig.fit(this.view.width, this.view.height);
    this.world.setViewDistance(this.rig.fitDistance);
  }

  clearEntities() {
    this.deselect();
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.towerViews.clear();
    this.effects.clear();
    this.input.reset();
  }

  pause() {
    if (this.mode !== MODE.PLAYING) return;
    this.mode = MODE.PAUSED;
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
    // The simulation stops here: remove shots still in flight so none hang in the air.
    for (const projectile of this.sim.projectiles) projectile.active = false;
    this.projectileViews.clear();
    this.ui.coach(null);
    this.speed = 1;
    this.loop.timeScale = 1;
    this.endTimer = END_SCREEN_DELAY;
    this.audio.setIntensity(0);
    if (victory) {
      const id = LEVELS[this.levelIndex].id;
      const previous = this.save.levels[id]?.stars ?? 0;
      this.save.levels[id] = { stars: Math.max(previous, stars) };
      writeSave(this.save);
      this.audio.victory();
      this.haptics.pulse(CONFIG.haptics.victory);
      this.ui.showBanner('Victoire !', '★'.repeat(stars) + '☆'.repeat(3 - stars));
    } else {
      this.audio.defeat();
      this.haptics.pulse(CONFIG.haptics.leak);
      this.ui.showBanner('Le château est tombé', '', 'danger');
    }
  }

  showEndScreen() {
    const sim = this.sim;
    const victory = sim.state === SIM_STATE.WON;
    this.ui.setPlayingUi(false);
    this.ui.showEnd({
      victory,
      levelName: LEVELS[this.levelIndex].name,
      stars: sim.stars,
      hasNext: this.levelIndex < LEVELS.length - 1,
      stats: [
        ['Vagues', `${victory ? sim.waves.length : Math.max(0, sim.nextWave - 1)}/${sim.waves.length}`],
        ['Vies restantes', sim.lives],
        ['Ovnis détruits', sim.stats.kills],
        ['Tours construites', sim.stats.towersBuilt],
      ],
    });
  }

  // ------------------------------------------------------------ player actions

  callWave() {
    if (this.mode !== MODE.PLAYING || !this.sim) return;
    const sim = this.sim;
    const canCall = sim.canCallWave() && (sim.nextWave === 0 || sim.countdown > 0);
    if (!canCall) return;
    this.audio.unlock();
    sim.callNextWave();
  }

  toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    this.loop.timeScale = this.speed;
    this.ui.setSpeed(this.speed);
    this.audio.click();
  }

  handleTap(clientX, clientY) {
    if (this.mode !== MODE.PLAYING || !this.sim) return;
    const hit = this.rig.groundAt(clientX, clientY, this.view.canvas.getBoundingClientRect());
    const cell = hit ? this.sim.level.cellAtWorld(hit.x, hit.z) : null;
    const tower = cell ? this.sim.towerAt(cell) : null;
    if (tower) this.selectTower(tower);
    else if (cell && this.sim.canBuild(cell)) this.selectBuildCell(cell);
    else this.deselect();
  }

  selectBuildCell(cell) {
    this.selection = { kind: 'build', cell, pending: null };
    this.effects.showCursor(cell.x, cell.z);
    this.effects.hideRange();
    this.sheetGold = this.sim.gold;
    this.ui.openBuildSheet(this.sim.gold, null);
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
    this.effects.showRange(selection.cell.x, selection.cell.z, def.levels[0].range, affordable);
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
    this.effects.showRange(tower.x, tower.z, tower.stats.range);
    this.sheetGold = this.sim.gold;
    this.ui.openTowerSheet(tower, this.sim.gold, false);
    this.audio.click();
    this.haptics.pulse(CONFIG.haptics.tap);
    if (this.tutorialStep === 2) this.advanceTutorial();
  }

  upgradeSelected() {
    const selection = this.selection;
    if (selection?.kind !== 'tower') return;
    if (!this.sim.upgrade(selection.tower)) {
      this.audio.denied();
      return;
    }
    selection.confirmSell = false;
    this.effects.showRange(selection.tower.x, selection.tower.z, selection.tower.stats.range);
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
    const selection = this.selection;
    if (selection?.kind !== 'tower') return;
    selection.tower.targeting = mode;
    this.ui.refreshTowerSheet(selection.tower, this.sim.gold, selection.confirmSell);
    this.audio.click();
  }

  deselect() {
    this.selection = null;
    this.effects.hideRange();
    this.effects.hideCursor();
    this.ui.closeSheets();
  }

  advanceTutorial() {
    this.tutorialStep++;
    if (this.tutorialStep < TUTORIAL.length) {
      this.ui.coach(TUTORIAL[this.tutorialStep]);
      if (this.tutorialStep === TUTORIAL.length - 1) this.tutorialTimer = 7;
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
    this.world.update(dt);
    this.towerViews.update(dt, this.renderTime);
    this.enemyViews.update(dt, this.renderTime, this.view.camera);
    this.projectileViews.update(dt);
    this.effects.update(dt);

    const sim = this.sim;
    if (sim && (this.mode === MODE.PLAYING || this.mode === MODE.ENDED)) {
      this.ui.setStats(sim.lives, sim.gold, sim.nextWave, sim.waves.length);
      this.ui.setWaveButton(this.waveButtonState());
      if (this.selection && sim.gold !== this.sheetGold) {
        this.sheetGold = sim.gold;
        if (this.selection.kind === 'build') this.ui.refreshBuildSheet(sim.gold, this.selection.pending);
        else this.ui.refreshTowerSheet(this.selection.tower, sim.gold, this.selection.confirmSell);
      }
    }
    this.view.render();
  }

  waveButtonState() {
    const sim = this.sim;
    const total = sim.waves.length;
    if (sim.nextWave >= total) {
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
    const key = `${this.levelIndex}:${waveIndex}`;
    if (!this.previewCache.has(key)) {
      const counts = new Map();
      for (const spawn of this.sim.waves[waveIndex].spawns) counts.set(spawn.type, (counts.get(spawn.type) ?? 0) + 1);
      this.previewCache.set(key, [...counts].map(([type, count]) => ({ type, count })));
    }
    return this.previewCache.get(key);
  }

  floatAt(x, y, z, text, variant) {
    const rect = this.view.canvas.getBoundingClientRect();
    const point = this.rig.toScreen(this.tmp.set(x, y, z), rect);
    if (point.visible) this.ui.floatText(point.x, point.y, text, variant);
  }

  // ------------------------------------------------------------ platform events

  handleResize(width, height) {
    this.rig.fit(width, height);
    this.world.setViewDistance(this.rig.fitDistance);
    this.effects.setViewport(height * this.view.pixelRatio, this.view.camera.fov);
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
    this.enemyViews.dispose();
    this.effects.dispose();
    this.world.dispose();
    this.assets.dispose();
    this.audio.dispose();
    this.view.dispose();
  }
}
