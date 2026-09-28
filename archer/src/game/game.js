import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { FixedLoop } from '../core/loop.js';
import { clamp, damp } from '../core/math.js';
import { writeSave } from '../core/storage.js';
import { ABILITIES } from '../data/abilities.js';
import { CHAPTERS, LAYOUTS } from '../data/chapters.js';
import { Joystick } from '../input/joystick.js';
import { Actors } from '../render/actors.js';
import { ArenaView } from '../render/arenaView.js';
import { COLORS, Fx } from '../render/fx.js';
import { ResolutionScaler, detectInitialQuality, lowerQuality } from '../render/view.js';
import { HEROES } from '../data/meta.js';
import { ensureProfile, runDrop, runGear } from '../meta/profile.js';
import { Arena } from '../sim/arena.js';
import { Menu } from './menu.js';
import { icon } from '../ui/icons.js';
import { Run, STATE } from '../sim/run.js';

const MODE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', CHOOSING: 'choosing', DEAD: 'dead', END: 'end' };
const ROOMS = 10;
const HAPTIC = { hit: 10, hurt: [30, 20, 40], kill: 6, level: [15, 40, 15], boss: [40, 30, 60, 30, 90] };

/**
 * Orchestrates everything: the menu, a run (simulation + views + sound + UI),
 * the camera, transitions and saving.
 */
export class Game {
  constructor({ view, assets, ui, audio, haptics, save }) {
    this.view = view;
    this.assets = assets;
    this.ui = ui;
    this.audio = audio;
    this.haptics = haptics;
    this.save = ensureProfile(save);
    const scene = view.scene;
    this.arenaView = new ArenaView(scene, assets);
    this.arenaView.onTheme = (theme) => view.setGrade(theme.grade);
    this.actors = new Actors(scene, assets);
    this.fx = new Fx(scene);
    this.joystick = new Joystick(document.getElementById('touch'), document.getElementById('joy'), document.getElementById('joy-knob'));
    this.joystick.onFirstTouch = () => {
      this.audio.unlock();
      if (this.hintShown) {
        this.hintShown = false;
        this.ui.setHint(false);
      }
    };
    this.monitor = new ResolutionScaler(view);
    this.autoQuality = detectInitialQuality();
    this.mode = MODE.MENU;
    this.run = null;
    this.camZ = 0;
    this.shake = 0;
    this.time = 0;
    this.slowMo = 0;
    this.hitStop = 0;
    this.tmp = new THREE.Vector3();
    this.fadeEl = document.createElement('div');
    this.fadeEl.style.cssText = 'position:absolute;inset:0;z-index:5;background:#000;opacity:0;pointer-events:none;transition:opacity .22s ease';
    document.getElementById('app').append(this.fadeEl);

    this.loop = new FixedLoop({
      step: CONFIG.step,
      maxFrameDelta: 0.1,
      maxSubSteps: 5,
      onFrame: (dt) => this.onFrame(dt),
      update: (dt) => this.update(dt),
      render: (_, dt) => this.render(dt),
    });
    this.bindUi();
    this.menu = new Menu(this);
    view.onResize = () => this.fitCamera();
    this.applyQuality();
    this.fitCamera();
  }

  // ------------------------------------------------------------ setup

  bindUi() {
    const ui = this.ui;
    ui.on('btn-play', () => this.startRun(this.save.chapter));
    ui.on('btn-prev', () => this.pickChapter(-1));
    ui.on('btn-next', () => this.pickChapter(1));
    ui.on('btn-pause', () => this.pause());
    ui.on('btn-resume', () => this.resume());
    ui.on('btn-quit', () => this.giveUp());
    ui.on('btn-revive', () => this.revive());
    ui.on('btn-giveup', () => this.giveUp());
    ui.on('btn-end', () => {
      this.showMenu();
      // The item found during the run is revealed in the menu.
      if (this.pendingDrop) {
        const item = this.pendingDrop;
        this.pendingDrop = null;
        setTimeout(() => this.menu.revealItem(item, 'Butin de l’expédition'), 400);
      }
    });
    ui.on('setting', (key) => this.toggleSetting(key));
    ui.renderSettings(this.save.settings, this.haptics.supported);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === MODE.PLAYING) this.pause();
        this.audio.suspend();
      } else this.audio.resume();
    });
  }

  applyQuality() {
    const setting = this.save.settings.quality;
    this.view.applyQuality(setting === 'auto' ? this.autoQuality : setting);
    const preset = this.view.preset;
    this.view.renderer.shadowMap.enabled = preset.shadows;
    this.arenaView.setShadowSize(preset.shadowMapSize);
    this.fx.scale = preset.effects;
    this.arenaView.effects = preset.effects;
    this.monitor.reset();
    this.fitCamera();
  }

  toggleSetting(key) {
    const s = this.save.settings;
    this.audio.unlock();
    if (key === 'quality') {
      const order = ['auto', 'low', 'medium', 'high', 'ultra'];
      s.quality = order[(order.indexOf(s.quality) + 1) % order.length];
      if (s.quality === 'auto') this.autoQuality = detectInitialQuality();
      this.applyQuality();
    } else {
      s[key] = !s[key];
      if (key === 'sound') this.audio.setSound(s.sound);
      if (key === 'music') this.audio.setMusic(s.music);
      if (key === 'haptics') this.haptics.enabled = s.haptics;
    }
    writeSave(this.save);
    this.ui.renderSettings(s, this.haptics.supported);
    this.audio.click();
  }

  /** Camera distance so the arena width fills the screen (portrait phones). */
  fitCamera() {
    const camera = this.view.camera;
    const aspect = this.view.width / this.view.height;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const halfW = CONFIG.arena.width / 2 + 0.7;
    this.camDistance = clamp(halfW / Math.tan(hfov / 2), 12, 26);
    this.fx.setViewport(this.view.renderer.domElement.height, camera.fov);
  }

  // ------------------------------------------------------------ menu

  showMenu() {
    this.mode = MODE.MENU;
    this.run = null;
    this.ui.setHud(false);
    this.ui.setBoss(null);
    this.ui.setHint(false);
    this.joystick.release();
    this.joystick.enabled = false;
    this.fx.clear();
    this.actors.clearEnemies();
    const chapter = CHAPTERS[this.save.chapter];
    const arena = new Arena(LAYOUTS[0]);
    this.arenaView.build(arena, chapter.theme, 7);
    this.arenaView.openDoor(true);
    this.refreshMenuHero();
    this.menuHero = { x: 0, z: 6.2, dirX: 0, dirZ: 1, moving: false, hp: 1, maxHp: 1, invulnerable: 0 };
    this.refreshMenu();
    this.ui.showScreen('menu');
    this.audio.setIntensity(0);
    this.loop.start();
  }

  /** The chosen hero stands in the menu scene. */
  refreshMenuHero() {
    const hero = HEROES[this.save.heroes.selected] ?? HEROES.archer;
    this.actors.createHero(hero);
    this.actors.removePet();
  }

  refreshMenu() {
    const save = this.save;
    this.menu.refreshWallet();
    this.menu.refreshBadges();
    const chapter = CHAPTERS[save.chapter];
    const best = save.best[chapter.id];
    this.ui.setMenu({
      coins: Math.floor(save.coins),
      gems: save.gems,
      chapterNumber: save.chapter + 1,
      chapterName: chapter.name,
      best: best ? (best > ROOMS ? 'Terminé' : `Record : salle ${best}/${ROOMS}`) : 'Jamais exploré',
      locked: save.chapter > save.unlocked,
      canPrev: save.chapter > 0,
      canNext: save.chapter < CHAPTERS.length - 1,
    });
  }

  pickChapter(delta) {
    const next = clamp(this.save.chapter + delta, 0, CHAPTERS.length - 1);
    if (next === this.save.chapter) return;
    this.save.chapter = next;
    writeSave(this.save);
    this.audio.click();
    this.arenaView.build(new Arena(LAYOUTS[0]), CHAPTERS[next].theme, 7);
    this.arenaView.openDoor(true);
    this.refreshMenu();
  }

  // ------------------------------------------------------------ run

  /** Player stats from the save (equipment, talents: filled in later). */
  gearStats() {
    return runGear(this.save);
  }

  startRun(chapterIndex) {
    if (chapterIndex > this.save.unlocked) return;
    this.audio.unlock();
    this.audio.click();
    this.fx.clear();
    this.actors.clearEnemies();
    const gear = this.gearStats();
    this.run = new Run(chapterIndex, gear, this.createListener());
    this.actors.createHero(gear.hero);
    if (this.run.pet) this.actors.createPet(this.run.pet.def.color);
    else this.actors.removePet();
    this.buildRoom();
    this.mode = MODE.CHOOSING;
    this.ui.showScreen(null);
    this.ui.setHud(true);
    this.joystick.enabled = true;
    this.audio.setIntensity(0.6);
    this.save.runs++;
    writeSave(this.save);
    // The first ability comes for free.
    setTimeout(() => this.offerChoices('Début de l’aventure', 'Choisis ta capacité de départ'), 450);
    this.camZ = this.run.player.z;
  }

  buildRoom() {
    const run = this.run;
    this.actors.theme = run.chapter.theme;
    this.arenaView.build(run.arena, run.chapter.theme, run.chapterIndex * 100 + run.room * 7 + 3);
    this.arenaView.openDoor(false);
  }

  offerChoices(kicker, title) {
    const run = this.run;
    // Delayed offers can arrive after the choice was already made: never show an empty screen.
    if (!run || this.mode !== MODE.CHOOSING || ![STATE.START, STATE.CHOOSE, STATE.ANGEL].includes(run.state) || (!run.choices.length && run.state !== STATE.ANGEL)) return;
    this.mode = MODE.CHOOSING;
    this.joystick.release();
    const angel = run.state === STATE.ANGEL;
    const extra = angel ? [{ id: 'heal', icon: 'heal', name: 'Soin de l’ange', text: 'Rend 40 % de ta vie.' }] : [];
    this.ui.showChoices(kicker, title, run.choices, run.taken, (id) => this.choose(id), extra);
  }

  choose(id) {
    const run = this.run;
    const wasStart = run.state === STATE.START;
    const ok = wasStart ? run.begin(id) : run.choose(id);
    if (!ok) return;
    this.audio.upgrade();
    this.haptics.pulse(HAPTIC.level);
    if (run.state === STATE.CHOOSE) {
      this.offerChoices(`Niveau ${run.level}`, 'Choisis une capacité');
      return;
    }
    this.ui.showScreen(null);
    this.mode = MODE.PLAYING;
    if (wasStart && this.save.tutorial) {
      this.hintShown = true;
      this.ui.setHint(true);
    }
  }

  pause() {
    if (this.mode !== MODE.PLAYING) return;
    this.mode = MODE.PAUSED;
    this.joystick.release();
    this.ui.showPause(this.run.taken);
    this.audio.duck(true);
    this.audio.click();
  }

  resume() {
    if (this.mode !== MODE.PAUSED) return;
    this.mode = MODE.PLAYING;
    this.ui.showScreen(null);
    this.audio.duck(false);
    this.audio.click();
  }

  revive() {
    if (!this.run?.revive()) return;
    this.mode = MODE.PLAYING;
    this.ui.showScreen(null);
    this.actors.heroRevive();
    this.fx.heal(this.run.player.x, this.run.player.z);
    this.audio.heal();
  }

  giveUp() {
    if (!this.run) return;
    this.finishRun(false);
  }

  /** End of a run: rewards, record, next chapter. */
  finishRun(won) {
    const run = this.run;
    this.mode = MODE.END;
    this.joystick.release();
    this.ui.setHud(false);
    this.ui.setBoss(null);
    const save = this.save;
    const coins = Math.floor(run.coins);
    save.coins += coins;
    save.kills += run.kills;
    const gems = won ? 10 + run.chapterIndex * 10 : 0;
    save.gems += gems;
    const reached = won ? ROOMS + 1 : run.room;
    const id = run.chapter.id;
    const record = reached > (save.best[id] ?? 0);
    save.best[id] = Math.max(save.best[id] ?? 0, reached);
    let unlocked = false;
    if (won && run.chapterIndex === save.unlocked && save.unlocked < CHAPTERS.length - 1) {
      save.unlocked++;
      save.chapter = save.unlocked;
      unlocked = true;
    }
    save.tutorial = false;
    const drop = runDrop(save, run.chapterIndex, won, run.room);
    this.pendingDrop = drop;
    writeSave(save);
    const loot = [`<span class="pill"><i class="coin-icon"></i><b>+${coins}</b></span>`];
    if (drop) loot.push(`<span class="pill">${icon('gift')} Objet trouvé</span>`);
    if (gems) loot.push(`<span class="pill"><i class="gem-icon"></i><b>+${gems}</b></span>`);
    this.ui.showEnd(
      `Chapitre ${run.chapterIndex + 1} · ${run.chapter.name}`,
      won ? 'Victoire !' : 'Défaite',
      [
        ['Salle', won ? `${ROOMS}/${ROOMS}` : `${run.room}/${ROOMS}`],
        ['Niveau', run.level],
        ['Monstres', run.kills],
        ['Capacités', Object.values(run.taken).reduce((a, b) => a + b, 0)],
      ],
      loot.join('') + (record && !won ? `<span class="pill">${icon('trophy')} Nouveau record</span>` : '') + (unlocked ? `<span class="pill">${icon('crown')} Chapitre suivant</span>` : ''),
    );
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.audio.setIntensity(0);
  }

  // ------------------------------------------------------------ simulation events

  createListener() {
    const fx = this.fx;
    const actors = this.actors;
    const audio = this.audio;
    const ui = this.ui;
    return {
      onRoom: (room, boss) => {
        if (!this.run) return;
        this.fade(() => {
          actors.clearEnemies();
          fx.clear();
          this.buildRoom();
          for (const enemy of this.run.enemies) actors.addEnemy(enemy);
          this.camZ = this.run.player.z;
          if (boss) {
            ui.banner(this.run.enemies[0]?.def.name ?? 'Boss', 'Le gardien du chapitre', 'danger');
            audio.warning(true);
            this.haptics.pulse(HAPTIC.boss);
          } else ui.banner(`Salle ${room}`);
        });
      },
      onEnemySpawn: (enemy) => {
        // Enemies of a new room are added once the fade has rebuilt it.
        if (this.fading) return;
        actors.addEnemy(enemy);
        fx.spawn(enemy.x, enemy.z);
      },
      onShoot: () => {
        actors.heroShoot();
        audio.shoot('ballista');
      },
      onEnemyHit: (enemy, damage, crit, source) => {
        this.floatWorld(enemy.x, 1 + enemy.def.scale * 0.5, enemy.z, String(Math.round(damage)), crit ? 'crit' : '');
        const p = this.run.player;
        fx.hit(enemy.x, enemy.z, crit, source?.orb ?? (p.burn ? 'fire' : p.frost ? 'ice' : p.poison ? 'poison' : null));
        actors.enemyHit(enemy, crit);
        if (crit) {
          this.haptics.pulse(HAPTIC.hit);
          this.hitStop = Math.max(this.hitStop, 0.03);
        }
      },
      onDot: (enemy, amount) => this.floatWorld(enemy.x, 1.1, enemy.z, String(Math.round(amount)), 'dot'),
      onEnemyDie: (enemy) => {
        actors.enemyDied(enemy);
        fx.death(enemy.x, enemy.z, Boolean(enemy.def.boss), enemy.def.id === 'ghost' || enemy.def.id === 'wisp' ? COLORS.ice : COLORS.smoke);
        audio.enemyDeath(Boolean(enemy.def.boss));
        this.haptics.pulse(enemy.def.boss ? HAPTIC.boss : HAPTIC.kill);
        // A few frames of hit stop sell the kill.
        this.hitStop = Math.max(this.hitStop, 0.06);
        this.shake = Math.min(1, this.shake + 0.12);
        if (enemy.def.boss) {
          this.shake = 1;
          this.slowMo = 0.9;
          ui.setBoss(null);
        }
      },
      onPlayerHit: (damage) => {
        const p = this.run.player;
        this.floatWorld(p.x, 1.3, p.z, `−${damage}`, 'hurt');
        actors.heroHurt();
        ui.hurt();
        audio.leak();
        this.shake = Math.min(1, this.shake + 0.35);
        this.haptics.pulse(HAPTIC.hurt);
      },
      onDodge: () => {
        const p = this.run.player;
        this.floatWorld(p.x, 1.3, p.z, 'Esquive !', 'info');
        audio.whoosh();
      },
      onShieldBlock: () => {
        const p = this.run.player;
        this.floatWorld(p.x, 1.3, p.z, 'Bloqué !', 'info');
        fx.ring(p.x, p.z, 1, 0.4, COLORS.ice);
        audio.shieldBreak();
      },
      onLevelUp: (level) => {
        const p = this.run.player;
        fx.levelUp(p.x, p.z);
        audio.upgrade();
        this.haptics.pulse(HAPTIC.level);
        this.mode = MODE.CHOOSING;
        this.joystick.release();
        setTimeout(() => this.offerChoices(`Niveau ${level}`, 'Choisis une capacité'), 380);
      },
      onAbility: (ability) => {
        const p = this.run.player;
        if (ability.id === 'heal' || ability.id === 'vitality') fx.heal(p.x, p.z);
      },
      onClear: (boss) => {
        this.arenaView.openDoor(true);
        audio.waveCleared();
        if (!boss) ui.banner('Salle nettoyée !', 'La porte est ouverte');
      },
      onAngel: () => {
        this.mode = MODE.CHOOSING;
        this.joystick.release();
        audio.heal();
        setTimeout(() => this.offerChoices('Un ange apparaît', 'Soin ou capacité ?'), 200);
      },
      onWin: () => {
        this.fade(() => this.finishRun(true));
      },
      onDeath: () => {
        this.mode = MODE.DEAD;
        this.joystick.release();
        actors.heroDie();
        audio.defeat();
        this.haptics.pulse(HAPTIC.boss);
        this.shake = 0.8;
        setTimeout(() => {
          if (this.mode !== MODE.DEAD) return;
          if (this.run.revived) this.finishRun(false);
          else this.ui.showScreen('dead');
        }, 1100);
      },
      onTelegraph: (enemy, kind, duration) => {
        if (kind === 'line' || kind === 'dash') fx.addLine(enemy, kind, duration);
        else if (kind === 'glow') fx.ring(enemy.x, enemy.z, 1 + enemy.def.scale * 0.3, duration, COLORS.magic);
      },
      onHazard: (h) => fx.addHazard(h),
      onHazardBlast: (h) => {
        fx.blast(h.x, h.z, h.radius, h.kind === 'slam' ? COLORS.dust : COLORS.fire);
        audio.explosion(h.radius > 1.5);
        const p = this.run.player;
        if (Math.hypot(p.x - h.x, p.z - h.z) < 4) this.shake = Math.min(1, this.shake + (h.kind === 'slam' ? 0.5 : 0.2));
      },
      onBlink: (enemy, x0, z0, x1, z1) => {
        fx.blink(x0, z0, x1, z1);
        audio.whoosh();
      },
      onSummon: (enemy) => fx.ring(enemy.x, enemy.z, 2, 0.6, COLORS.magic),
      onLightning: (a, b) => {
        fx.lightning(a.x, a.z, b.x, b.z);
        audio.lightning();
      },
      onDeathBlast: (enemy) => fx.blast(enemy.x, enemy.z, 1.4, COLORS.fire),
      onPickup: (item) => {
        const p = this.run.player;
        fx.pickup(p.x, p.z, item.kind);
        if (item.kind === 'coin') audio.coin();
        else if (item.kind === 'heart') {
          fx.heal(p.x, p.z);
          this.floatWorld(p.x, 1.3, p.z, 'Soin', 'heal');
          audio.heal();
        } else audio.collect(0);
      },
      onArrowWall: (arrow, x, z) => fx.wallHit(x, z),
      onDash: (enemy) => fx.dust(enemy.x, enemy.z, 8),
      onBump: (enemy) => {
        fx.dust(enemy.x, enemy.z, 14);
        this.shake = Math.min(1, this.shake + (enemy.def.boss ? 0.5 : 0.15));
      },
      onThrow: () => audio.whoosh(),
      onShieldUp: () => {},
      onDoor: () => audio.whoosh(),
      onRevive: () => {},
    };
  }

  /** Short black fade around room changes. */
  fade(middle) {
    this.fading = true;
    this.fadeEl.style.opacity = '1';
    setTimeout(() => {
      middle();
      this.fading = false;
      this.fadeEl.style.opacity = '0';
    }, 230);
  }

  floatWorld(x, y, z, text, variant) {
    const rect = this.view.canvas.getBoundingClientRect();
    const v = this.tmp.set(x + (Math.random() - 0.5) * 0.3, y, z).project(this.view.camera);
    this.ui.floatAt(rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height, text, variant);
  }

  // ------------------------------------------------------------ loop

  onFrame(dt) {
    if (this.mode === MODE.PLAYING && this.save.settings.quality === 'auto' && this.monitor.sample(dt)) {
      const lower = lowerQuality(this.autoQuality);
      if (lower) {
        this.autoQuality = lower;
        this.applyQuality();
      }
    }
    // Slow motion after the boss falls.
    if (this.slowMo > 0) this.slowMo -= dt;
    if (this.hitStop > 0) this.hitStop -= dt;
    this.loop.timeScale = this.hitStop > 0 ? 0.12 : this.slowMo > 0 ? 0.3 : 1;
  }

  update(dt) {
    if (this.mode !== MODE.PLAYING || !this.run || this.fading) return;
    const run = this.run;
    run.step(dt, this.joystick.read());
  }

  render(dt) {
    this.time += dt;
    const run = this.mode === MODE.MENU ? null : this.run;
    this.arenaView.update(dt);
    if (this.mode === MODE.MENU) this.renderMenu(dt);
    else this.actors.update(dt, this.time, this.view.camera, run);
    this.fx.update(dt, run && !this.fading ? run : null);
    this.updateCamera(dt);
    if (run) this.updateHud();
    this.view.render();
  }

  renderMenu(dt) {
    // The hero waits on the arena while the menu is open.
    const hero = this.menuHero;
    const fake = { player: hero, state: 'menu' };
    hero.dirX = Math.sin(this.time * 0.4) * 0.3;
    hero.dirZ = 1;
    this.actors.update(dt, this.time, this.view.camera, fake);
  }

  updateCamera(dt) {
    const camera = this.view.camera;
    const run = this.run;
    const halfH = CONFIG.arena.height / 2;
    let targetZ;
    if (this.mode === MODE.MENU || !run) targetZ = 3.4;
    // The view scrolls with the hero (a little ahead of them), like the original.
    else targetZ = clamp(run.player.z - 1.6, -halfH + 3.4, halfH - 4.2);
    this.camZ = damp(this.camZ, targetZ, 6, dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.25;
    const pitch = THREE.MathUtils.degToRad(CONFIG.camera.pitchDeg);
    const d = this.mode === MODE.MENU ? this.camDistance * 0.62 : this.camDistance;
    const jx = s ? (Math.random() - 0.5) * s : 0;
    const jz = s ? (Math.random() - 0.5) * s : 0;
    camera.position.set(jx, Math.sin(pitch) * d, this.camZ + Math.cos(pitch) * d + jz);
    camera.lookAt(jx, 0, this.camZ + jz);
  }

  updateHud() {
    const run = this.run;
    const ui = this.ui;
    ui.setRoom(run.chapterIndex + 1, run.room, ROOMS);
    ui.setCoins(run.coins);
    ui.setXp(run.level, run.xp / run.xpNeeded);
    const boss = run.enemies.find((e) => e.def.boss && !e.dead);
    ui.setBoss(boss && boss.spawning <= 0 ? { name: boss.def.name, share: boss.hp / boss.maxHp } : null);
  }
}
