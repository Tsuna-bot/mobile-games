import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, lerp } from '../core/math.js';
import { QUALITY_SETTINGS, writeSave } from '../core/storage.js';
import { CameraRig } from '../render/cameraRig.js';
import { Environment } from '../render/environment.js';
import { ParticleSystem } from '../render/particles.js';
import { FrameRateMonitor, detectInitialQuality, lowerQuality } from '../render/quality.js';
import { progressAt, speedAt } from './difficulty.js';
import { FixedLoop } from './loop.js';
import { Player } from './player.js';
import { STATE, StateMachine } from './stateMachine.js';
import { Track } from './track.js';

const RESUME_RAMP = 0.8;

/** Orchestrates simulation, rendering, audio, haptics and UI around a state machine. */
export class Game {
  constructor({ view, input, audio, haptics, ui, save }) {
    this.view = view;
    this.input = input;
    this.audio = audio;
    this.haptics = haptics;
    this.ui = ui;
    this.save = save;

    const scene = view.scene;
    this.env = new Environment(scene, view);
    this.player = new Player(scene);
    this.track = new Track(scene);
    this.particles = new ParticleSystem(scene);
    this.rig = new CameraRig(view.camera);
    this.monitor = new FrameRateMonitor();
    this.autoQuality = detectInitialQuality();

    this.colors = {
      shard: new THREE.Color(CONFIG.colors.shard),
      player: new THREE.Color(CONFIG.colors.player),
      accent: new THREE.Color(CONFIG.colors.playerAccent),
      white: new THREE.Color(0xffffff),
    };

    // Simulation state. "prev*" values feed render interpolation.
    this.distance = 0;
    this.prevDistance = 0;
    this.trackTime = 0;
    this.prevTrackTime = 0;
    this.worldTime = 0;
    this.prevWorldTime = 0;
    this.runTime = 0;
    this.progress = 0;
    this.speed = CONFIG.speed.menu;

    this.run = { startDistance: 0, bonus: 0, score: 0, shards: 0, combo: 0, nearMisses: 0 };
    this.slowmoTimer = 0;
    this.dyingTimer = 0;
    this.resumeRamp = 0;
    this.trailAccumulator = 0;
    this.tutorialActive = false;
    this.resizeQueued = false;

    this.fsm = new StateMachine(STATE.BOOT, {
      [STATE.MENU]: () => this.enterMenu(),
      [STATE.PLAYING]: (from) => this.enterPlaying(from),
      [STATE.PAUSED]: () => this.enterPaused(),
      [STATE.DYING]: () => this.enterDying(),
      [STATE.GAME_OVER]: () => this.enterGameOver(),
    });

    this.loop = new FixedLoop({
      step: CONFIG.loop.fixedStep,
      maxFrameDelta: CONFIG.loop.maxFrameDelta,
      maxSubSteps: CONFIG.loop.maxSubSteps,
      onFrame: (dt) => this.onFrame(dt),
      update: (dt) => this.update(dt),
      render: (alpha, dt) => this.render(alpha, dt),
    });

    this.bindTrackEvents();
    this.bindUi();
    this.bindInput();
    this.bindLifecycle();

    view.onResize = (width, height) => this.handleResize(width, height);
    view.onContextLost = () => this.handleContextLost();
    view.onContextRestored = () => this.handleContextRestored();
    this.applyQualitySetting();
  }

  start() {
    this.fsm.go(STATE.MENU);
  }

  // ---------------------------------------------------------------- wiring

  bindTrackEvents() {
    const { shards, nearMiss } = CONFIG;
    this.track.events.onShard = (x) => {
      const run = this.run;
      run.shards++;
      run.combo = Math.min(run.combo + 1, shards.maxCombo);
      run.bonus += shards.value * run.combo;
      this.particles.burst(x, shards.hoverHeight, 0, this.effectCount(14), 6, this.colors.shard, 2.6, 0.35, 0.5, this.speed * 0.3);
      this.ui.setCombo(run.combo);
      if (run.combo === shards.maxCombo) this.ui.popup('COMBO MAX', 'combo');
      this.audio.playShard(run.combo);
      this.haptics.pulse(CONFIG.haptics.shard);
    };
    this.track.events.onShardMissed = () => {
      this.run.combo = 0;
      this.ui.setCombo(0);
    };
    this.track.events.onNearMiss = (blockX, type) => {
      this.run.nearMisses++;
      this.run.bonus += nearMiss.bonus;
      this.slowmoTimer = nearMiss.duration;
      this.rig.addTrauma(0.22);
      const color = this.track.typeColors[type];
      this.particles.burst((blockX + this.player.x) / 2, 0.6, 0, this.effectCount(12), 5, color, 3, 0.3, 0.4, this.speed * 0.5);
      this.ui.popup(`FRÔLÉ +${nearMiss.bonus}`, 'near');
      this.audio.playNearMiss();
      this.haptics.pulse(CONFIG.haptics.nearMiss);
    };
  }

  bindUi() {
    const ui = this.ui;
    ui.on('play', () => this.startRun());
    ui.on('retry', () => this.startRun());
    ui.on('restart', () => this.startRun());
    ui.on('pause', () => this.pause());
    ui.on('resume', () => this.resume());
    ui.on('quit', () => this.goToMenu());
    ui.on('menu', () => this.goToMenu());
    ui.onSetting((key) => this.toggleSetting(key));
    ui.renderSettings(this.save.settings, this.haptics.supported);
    ui.setBest(this.save.best);
  }

  bindInput() {
    this.input.onPause = () => {
      if (this.fsm.is(STATE.PLAYING)) this.pause();
      else if (this.fsm.is(STATE.PAUSED)) this.resume();
    };
    this.input.onConfirm = () => {
      if (this.fsm.is(STATE.MENU) || this.fsm.is(STATE.GAME_OVER)) this.startRun();
      else if (this.fsm.is(STATE.PAUSED)) this.resume();
    };
  }

  bindLifecycle() {
    this.handleVisibility = () => {
      if (document.hidden) {
        if (this.fsm.is(STATE.PLAYING)) this.pause();
        this.loop.stop();
        this.audio.suspend();
      } else {
        this.audio.resume();
        if (!this.fsm.is(STATE.PAUSED) && !this.view.contextLost) this.loop.start();
      }
    };
    this.handleBlur = () => {
      if (this.fsm.is(STATE.PLAYING)) this.pause();
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
    window.addEventListener('orientationchange', this.handleWindowResize);
    window.visualViewport?.addEventListener('resize', this.handleWindowResize);
  }

  // ---------------------------------------------------------------- actions

  startRun() {
    if (!this.fsm.is(STATE.MENU) && !this.fsm.is(STATE.GAME_OVER) && !this.fsm.is(STATE.PAUSED)) return;
    if (this.view.contextLost) return;
    this.audio.unlock();
    this.resetRun();
    this.fsm.go(STATE.PLAYING);
    this.audio.playStart();
    this.haptics.pulse(CONFIG.haptics.ui);
    this.requestFullscreen();
  }

  pause() {
    this.fsm.go(STATE.PAUSED);
  }

  resume() {
    if (this.view.contextLost || document.hidden) return;
    if (this.fsm.go(STATE.PLAYING)) this.resumeRamp = RESUME_RAMP;
  }

  goToMenu() {
    this.fsm.go(STATE.MENU);
  }

  toggleSetting(key) {
    const settings = this.save.settings;
    if (key === 'sound') {
      settings.sound = !settings.sound;
      this.audio.setEnabled(settings.sound);
    } else if (key === 'haptics') {
      settings.haptics = !settings.haptics;
      this.haptics.setEnabled(settings.haptics);
      this.haptics.pulse(CONFIG.haptics.nearMiss);
    } else if (key === 'quality') {
      const index = QUALITY_SETTINGS.indexOf(settings.quality);
      settings.quality = QUALITY_SETTINGS[(index + 1) % QUALITY_SETTINGS.length];
      if (settings.quality === 'auto') this.autoQuality = detectInitialQuality();
      this.applyQualitySetting();
    }
    writeSave(this.save);
    this.ui.renderSettings(settings, this.haptics.supported);
    this.audio.unlock();
    this.audio.playClick();
  }

  applyQualitySetting() {
    const setting = this.save.settings.quality;
    this.view.applyQuality(setting === 'auto' ? this.autoQuality : setting);
    this.env.applyQuality(this.view.preset);
    this.monitor.reset();
    if (!this.loop.running) this.loop.renderOnce();
  }

  requestFullscreen() {
    const root = document.documentElement;
    const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    if (!matchMedia('(pointer: coarse)').matches || standalone || document.fullscreenElement || !root.requestFullscreen) return;
    root.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('portrait'))
      .catch(() => {});
  }

  resetRun() {
    this.track.begin(this.distance);
    this.particles.clear();
    this.player.reset();
    this.rig.reset();
    this.input.reset();
    this.monitor.reset();

    this.runTime = 0;
    this.progress = 0;
    this.slowmoTimer = 0;
    this.resumeRamp = 0;
    this.loop.timeScale = 1;
    Object.assign(this.run, { startDistance: this.distance, bonus: 0, score: 0, shards: 0, combo: 0, nearMisses: 0 });
    this.ui.setScore(0);
    this.ui.setCombo(0);

    this.tutorialActive = !this.save.tutorialDone;
    this.ui.setTutorialVisible(this.tutorialActive);
  }

  completeTutorial() {
    this.tutorialActive = false;
    this.ui.setTutorialVisible(false);
    this.save.tutorialDone = true;
    writeSave(this.save);
  }

  die() {
    this.fsm.go(STATE.DYING);
  }

  // ---------------------------------------------------------------- states

  enterMenu() {
    this.track.clear();
    this.particles.clear();
    this.player.reset();
    this.rig.reset();
    this.loop.timeScale = 1;
    this.ui.setBest(this.save.best);
    this.ui.setHudVisible(false);
    this.ui.setTutorialVisible(false);
    this.ui.showScreen('menu');
    this.audio.setMusicMode('menu');
    this.loop.start();
  }

  enterPlaying() {
    this.ui.showScreen(null);
    this.ui.setHudVisible(true);
    this.ui.setTutorialVisible(this.tutorialActive);
    this.audio.setMusicMode('play');
    this.loop.start();
  }

  enterPaused() {
    this.loop.stop();
    this.input.reset();
    this.ui.setTutorialVisible(false);
    this.ui.showScreen('pause');
    this.audio.setMusicMode('paused');
  }

  enterDying() {
    const x = this.player.x;
    const y = CONFIG.player.hoverHeight;
    this.player.setVisible(false);
    this.particles.burst(x, y, 0, this.effectCount(70), 12, this.colors.player, 3, 0.5, 1.1);
    this.particles.burst(x, y, 0, this.effectCount(40), 9, this.colors.accent, 3, 0.45, 1);
    this.particles.burst(x, y, 0, this.effectCount(24), 15, this.colors.white, 2, 0.25, 0.7);
    this.rig.addTrauma(1);
    this.ui.flashScreen();
    this.ui.setHudVisible(false);
    this.ui.setTutorialVisible(false);
    this.audio.playCrash();
    this.audio.setMusicMode('crash');
    this.haptics.pulse(CONFIG.haptics.crash);
    this.dyingTimer = CONFIG.death.duration;
    this.slowmoTimer = 0;
    this.loop.timeScale = CONFIG.death.timeScale;
  }

  enterGameOver() {
    const run = this.run;
    const isRecord = run.score > this.save.best;
    if (isRecord) {
      this.save.best = run.score;
      writeSave(this.save);
      this.audio.playRecord();
    }
    this.loop.timeScale = 1;
    this.audio.setMusicMode('menu');
    this.ui.showGameOver({
      score: run.score,
      best: this.save.best,
      isRecord,
      distance: Math.floor(this.distance - run.startDistance),
      shards: run.shards,
      nearMisses: run.nearMisses,
    });
  }

  // ---------------------------------------------------------------- loop

  /** Real-time bookkeeping: slow motion, death sequence, adaptive quality. */
  onFrame(realDt) {
    let scale = 1;
    if (this.fsm.is(STATE.DYING)) {
      this.dyingTimer -= realDt;
      const t = 1 - Math.max(this.dyingTimer, 0) / CONFIG.death.duration;
      scale = lerp(CONFIG.death.timeScale, 0.6, t * t);
      if (this.dyingTimer <= 0) this.fsm.go(STATE.GAME_OVER);
    } else if (this.slowmoTimer > 0) {
      this.slowmoTimer -= realDt;
      const t = clamp(1 - this.slowmoTimer / CONFIG.nearMiss.duration, 0, 1);
      scale = lerp(CONFIG.nearMiss.timeScale, 1, t * t);
    }
    if (this.resumeRamp > 0) {
      this.resumeRamp -= realDt;
      scale *= lerp(1, 0.3, Math.max(this.resumeRamp, 0) / RESUME_RAMP);
    }
    this.loop.timeScale = scale;

    if (this.fsm.is(STATE.PLAYING) && this.save.settings.quality === 'auto' && this.monitor.sample(realDt)) {
      const lower = lowerQuality(this.autoQuality);
      if (lower) {
        this.autoQuality = lower;
        this.applyQualitySetting();
      }
    }
  }

  update(dt) {
    this.prevDistance = this.distance;
    this.prevTrackTime = this.trackTime;
    this.prevWorldTime = this.worldTime;
    this.worldTime += dt;
    this.trackTime += dt;

    switch (this.fsm.current) {
      case STATE.PLAYING:
        this.updatePlaying(dt);
        break;
      case STATE.DYING:
        this.speed = damp(this.speed, 0, 2.5, dt);
        this.distance += this.speed * dt;
        break;
      default:
        this.speed = damp(this.speed, CONFIG.speed.menu, 1.5, dt);
        this.distance += this.speed * dt;
        this.player.idle();
        this.player.update(dt);
    }
  }

  updatePlaying(dt) {
    this.runTime += dt;
    this.progress = progressAt(this.runTime);
    this.speed = damp(this.speed, speedAt(this.progress), CONFIG.speed.acceleration, dt);
    this.distance += this.speed * dt;

    this.player.steer(dt, this.input);
    this.player.update(dt);
    this.track.update(this.distance, this.progress);

    if (this.track.hitTest(this.distance, this.trackTime, this.player.x)) {
      this.die();
      return;
    }
    this.track.processCrossings(this.distance, this.trackTime, this.player.x);
    this.track.collectShards(this.distance, this.player.x);

    const run = this.run;
    run.score = Math.floor((this.distance - run.startDistance) * CONFIG.score.perUnit) + run.bonus;

    if (this.tutorialActive && (this.player.distanceMoved > CONFIG.tutorial.moveToComplete || this.runTime > CONFIG.tutorial.maxDuration)) {
      this.completeTutorial();
    }
  }

  render(alpha, realDt) {
    const distance = lerp(this.prevDistance, this.distance, alpha);
    const trackTime = lerp(this.prevTrackTime, this.trackTime, alpha);
    const worldTime = lerp(this.prevWorldTime, this.worldTime, alpha);
    const scaledDt = realDt * this.loop.timeScale;
    const speedFactor = clamp((this.speed - CONFIG.speed.menu) / (CONFIG.speed.max - CONFIG.speed.menu), 0, 1);

    this.track.sync(distance, trackTime);
    const playerX = this.player.syncVisual(alpha, worldTime);
    if (this.rig.update(realDt, playerX, speedFactor, this.player.tilt)) this.updateParticleViewport();
    this.env.update(distance, this.speed, speedFactor, scaledDt, worldTime, this.view.camera);

    if (this.player.group.visible) this.emitTrail(playerX, scaledDt);
    this.particles.update(scaledDt);

    if (this.fsm.is(STATE.PLAYING)) {
      this.ui.setScore(this.run.score);
      this.audio.setIntensity(speedFactor);
    }
    this.view.render();
  }

  emitTrail(x, dt) {
    this.trailAccumulator += dt * 45 * this.view.preset.effects;
    const y = CONFIG.player.hoverHeight;
    while (this.trailAccumulator >= 1) {
      this.trailAccumulator -= 1;
      const color = Math.random() < 0.25 ? this.colors.accent : this.colors.player;
      this.particles.emit(
        x + (Math.random() - 0.5) * 0.35, y + (Math.random() - 0.5) * 0.1, 0.7,
        (Math.random() - 0.5) * 0.6, Math.random() * 0.4, this.speed * 0.6 + 4,
        color, 2.4, 0.3, 0.35, 1.5,
      );
    }
  }

  effectCount(base) {
    return Math.max(1, Math.round(base * this.view.preset.effects));
  }

  // ---------------------------------------------------------------- platform events

  handleResize(width, height) {
    this.rig.fit(width / height);
    this.input.updateReferenceWidth();
    this.updateParticleViewport();
    if (!this.loop.running) this.loop.renderOnce();
  }

  updateParticleViewport() {
    this.particles.setViewport(this.view.height * this.view.pixelRatio, this.view.camera.fov);
  }

  handleContextLost() {
    if (this.fsm.is(STATE.PLAYING)) this.pause();
    this.loop.stop();
    this.ui.setContextLost(true);
  }

  handleContextRestored() {
    this.ui.setContextLost(false);
    if (!this.fsm.is(STATE.PAUSED) && !document.hidden) this.loop.start();
    else this.loop.renderOnce();
  }

  dispose() {
    this.loop.stop();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('orientationchange', this.handleWindowResize);
    window.visualViewport?.removeEventListener('resize', this.handleWindowResize);
    this.input.dispose();
    this.track.dispose();
    this.player.dispose();
    this.particles.dispose();
    this.env.dispose();
    this.audio.dispose();
    this.view.dispose();
  }
}
