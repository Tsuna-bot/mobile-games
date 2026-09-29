import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { FixedLoop } from '../core/loop.js';
import { clamp, damp } from '../core/math.js';
import { writeSave } from '../core/storage.js';
import { ABILITIES } from '../data/abilities.js';
import { CHAPTERS, LAYOUTS } from '../data/chapters.js';
import { ENDLESS, HEROIC, runAccountXp } from '../data/progression.js';
import { addAccountXp, endlessOpen, ensureDaily, heroicOpen, track } from '../meta/progress.js';
import { Joystick } from '../input/joystick.js';
import { Actors } from '../render/actors.js';
import { Landscape } from '../render/landscape.js';
import { COLORS, Fx } from '../render/fx.js';
import { ResolutionScaler, detectInitialQuality, lowerQuality } from '../render/view.js';
import { HEROES } from '../data/meta.js';
import { RARITIES } from '../data/gear.js';
import { addHeroXp } from '../meta/heroes.js';
import { SPELLS } from '../data/heroes.js';
import { addItem, ensureProfile, itemDef, runDrop, runGear } from '../meta/profile.js';
import { Arena } from '../sim/arena.js';
import { Menu } from './menu.js';
import { icon } from '../ui/icons.js';
import { Run, STATE } from '../sim/run.js';

const MODE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', CHOOSING: 'choosing', DEAD: 'dead', END: 'end' };
const ROOMS = 10;
const ENDLESS_GEMS = ENDLESS.gemsPerBoss;
// Kills less than this many seconds apart chain into a combo; shouts at milestones.
const COMBO_TIME = 2.4;
const COMBO_TAGS = { 10: 'Carnage !', 20: 'Déchaîné !', 35: 'Inarrêtable !', 50: 'Légendaire !', 80: 'Divin !' };
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
    this.arenaView = new Landscape(scene, assets);
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
    // Anime screen effects: speed lines and impact frames (decay every frame).
    this.animeFx = { speed: 0, impact: 0, color: new THREE.Color(0xffffff) };
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
    ui.on('mode', (mode) => this.pickMode(mode));
    ui.on('btn-prev', () => this.pickChapter(-1));
    ui.on('btn-next', () => this.pickChapter(1));
    ui.on('btn-pause', () => this.pause());
    ui.on('spell', (i) => this.castSpell(i));
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
        setTimeout(() => this.menu.revealItem(item, 'Coffre de victoire'), 400);
      } else if (this.pendingLoot?.length) {
        // The best piece found on the way is shown.
        const best = [...this.pendingLoot].sort((a, b) => b.rarity - a.rarity || b.level - a.level)[0];
        if (best.rarity >= 1) setTimeout(() => this.menu.revealItem(best, 'Meilleure trouvaille'), 400);
      }
      this.pendingLoot = null;
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
    this.arenaView.grass = preset.grass;
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

  /** Camera distance so `halfWidth` either side of the hero fills the screen (portrait phones). */
  fitCamera() {
    const camera = this.view.camera;
    const aspect = this.view.width / this.view.height;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // Distance per unit of half-width seen at the hero's depth (the view widens when monsters spread out).
    this.camPerWidth = 1 / Math.tan(hfov / 2);
    this.camDistance = clamp(CONFIG.camera.halfWidth * this.camPerWidth, 11, 34);
    // Wide screens see the whole arena anyway: the menu close-up backs off a little less.
    this.menuDistance = CONFIG.camera.menu.distance * clamp(0.62 / aspect, 0.8, 1.35);
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
    ensureDaily(this.save);
    const arena = new Arena(LAYOUTS[0]);
    this.arenaView.build(arena, this.menuTheme(), 7);
    this.arenaView.openDoor(true);
    this.refreshMenuHero();
    this.menuHero = { x: 0, z: 1.5, dirX: 0, dirZ: 1, moving: false, hp: 1, maxHp: 1, invulnerable: 0 };
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

  /** The play mode picked in the menu, if it is open for the shown chapter. */
  currentMode() {
    const save = this.save;
    if (save.mode === 'endless' && endlessOpen(save)) return 'endless';
    if (save.mode === 'heroic') return 'heroic';
    return 'normal';
  }

  /** Landscape behind the menu: the shown chapter's (Endless: the last one opened). */
  menuTheme() {
    const save = this.save;
    return this.currentMode() === 'endless' ? CHAPTERS[save.unlocked].theme : CHAPTERS[save.chapter].theme;
  }

  refreshMenu() {
    const save = this.save;
    this.menu.refreshWallet();
    this.menu.refreshBadges();
    const mode = this.currentMode();
    const chapter = CHAPTERS[save.chapter];
    const key = mode === 'heroic' ? `${chapter.id}:heroic` : chapter.id;
    const best = save.best[key];
    const heroicLocked = mode === 'heroic' && !heroicOpen(save, save.chapter);
    this.ui.setMenu({
      coins: Math.floor(save.coins),
      gems: save.gems,
      kicker: mode === 'endless' ? 'Mode Infini' : `Chapitre ${save.chapter + 1}${mode === 'heroic' ? ' · Héroïque' : ''}`,
      chapterName: mode === 'endless' ? 'Les portails sans fin' : chapter.name,
      best: mode === 'endless'
        ? (save.endless.best ? `Record : salle ${save.endless.best}` : 'Un boss toutes les 5 salles')
        : best ? (best > ROOMS ? 'Terminé' : `Record : salle ${best}/${ROOMS}`) : 'Jamais exploré',
      locked: mode !== 'endless' && (save.chapter > save.unlocked || heroicLocked),
      lockText: heroicLocked ? 'Termine ce chapitre en Normal' : 'Termine le chapitre précédent',
      canPrev: mode !== 'endless' && save.chapter > 0,
      canNext: mode !== 'endless' && save.chapter < CHAPTERS.length - 1,
      mode,
      modes: { heroic: heroicOpen(save, 0), endless: endlessOpen(save) },
    });
  }

  /** Jumps to a chapter from the world map. */
  setChapter(index) {
    this.pickChapter(index - this.save.chapter);
  }

  pickChapter(delta) {
    const next = clamp(this.save.chapter + delta, 0, CHAPTERS.length - 1);
    if (next === this.save.chapter) return;
    this.save.chapter = next;
    writeSave(this.save);
    this.audio.click();
    this.arenaView.build(new Arena(LAYOUTS[0]), this.menuTheme(), 7);
    this.arenaView.openDoor(true);
    this.refreshMenu();
  }

  pickMode(mode) {
    const save = this.save;
    if (mode === 'endless' && !endlessOpen(save)) {
      this.audio.denied();
      this.ui.banner('Mode Infini', 'Termine le chapitre 1 pour l’ouvrir');
      return;
    }
    if (mode === 'heroic' && !heroicOpen(save, 0)) {
      this.audio.denied();
      this.ui.banner('Héroïque', 'Termine le chapitre 1 pour l’ouvrir');
      return;
    }
    if (save.mode === mode) return;
    const theme = this.menuTheme();
    save.mode = mode;
    writeSave(save);
    this.audio.click();
    if (this.menuTheme() !== theme) {
      this.arenaView.build(new Arena(LAYOUTS[0]), this.menuTheme(), 7);
      this.arenaView.openDoor(true);
    }
    this.refreshMenu();
  }

  // ------------------------------------------------------------ run

  /** Player stats from the save (equipment, talents: filled in later). */
  gearStats() {
    return runGear(this.save);
  }

  startRun(chapterIndex) {
    const save = this.save;
    const mode = this.currentMode();
    if (mode !== 'endless' && chapterIndex > save.unlocked) return;
    if (mode === 'heroic' && !heroicOpen(save, chapterIndex)) return;
    this.audio.unlock();
    this.audio.click();
    this.fx.clear();
    this.actors.clearEnemies();
    const gear = this.gearStats();
    // Endless goes through the landscapes of the chapters already opened.
    const themes = CHAPTERS.slice(0, save.unlocked + 1).map((c) => c.theme);
    this.run = new Run(chapterIndex, gear, this.createListener(), undefined, { mode, themes });
    this.combo = { count: 0, timer: 0 };
    this.bestCombo = 0;
    this.ui.setCombo(0, 0);
    this.runGear = gear;
    this.actors.createHero(gear.hero);
    if (this.run.pet) this.actors.createPet(this.run.pet.def.color);
    else this.actors.removePet();
    this.buildRoom();
    this.warmShaders();
    this.mode = MODE.CHOOSING;
    this.ui.showScreen(null);
    this.ui.setSpells(this.run.spells.map((sp) => ({ def: sp.def, rank: sp.rank })));
    this.ui.setHud(true);
    this.joystick.enabled = true;
    this.audio.setIntensity(0.6);
    this.save.runs++;
    writeSave(this.save);
    // The first ability comes for free.
    setTimeout(() => this.offerChoices('Début de l’aventure', 'Choisis ta capacité de départ'), 450);
  }

  buildRoom() {
    const run = this.run;
    this.actors.theme = run.theme;
    this.arenaView.build(run.arena, run.theme, run.chapterIndex * 100 + run.room * 7 + 3);
    this.arenaView.openDoor(false);
    if (run.chest) this.arenaView.addChest(run.chest.x, run.chest.z);
  }

  /**
   * Compiles every shader the room will need now (behind the fade), instead of in the
   * middle of the fight at the first spell, bomb or monster of a new kind.
   */
  warmShaders() {
    this.fx.prewarm(true);
    try {
      this.view.renderer.compile(this.view.scene, this.view.camera);
    } catch {
      // Compiling ahead is only an optimisation.
    }
    this.fx.prewarm(false);
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

  /** A spell button: cast if ready (a small shake of the button otherwise). */
  castSpell(i) {
    const run = this.run;
    if (this.mode !== MODE.PLAYING || !run) return;
    const ok = run.castSpell(i);
    this.ui.castFeedback(i, ok);
    if (!ok) {
      this.haptics.pulse(4);
      return;
    }
    if (this.hintShown) {
      this.hintShown = false;
      this.ui.setHint(false);
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

  /** End of a run: rewards, record, next chapter, account level, missions. */
  finishRun(won) {
    const run = this.run;
    this.mode = MODE.END;
    this.joystick.release();
    this.ui.setHud(false);
    this.ui.setLowHp(false);
    this.ui.setCombo(0, 0);
    this.ui.setMarkers([]);
    this.ui.setBoss(null);
    const save = this.save;
    const coins = Math.floor(run.coins);
    save.coins += coins;
    save.kills += run.kills;
    let gems = run.gems;
    if (won) gems += (10 + run.chapterIndex * 10) * (run.heroic ? HEROIC.gems : 1) + (this.runGear?.gemBonus ?? 0);
    save.gems += gems;
    const reached = won ? ROOMS + 1 : run.room;
    let record = false;
    let unlocked = false;
    if (run.endless) {
      // The room reached counts once it is cleared.
      const cleared = run.roomsCleared;
      record = cleared > (save.endless.best ?? 0);
      save.endless.best = Math.max(save.endless.best ?? 0, cleared);
    } else {
      const key = run.heroic ? `${run.chapter.id}:heroic` : run.chapter.id;
      record = reached > (save.best[key] ?? 0);
      save.best[key] = Math.max(save.best[key] ?? 0, reached);
      if (won && !run.heroic && run.chapterIndex === save.unlocked && save.unlocked < CHAPTERS.length - 1) {
        save.unlocked++;
        save.chapter = save.unlocked;
        unlocked = true;
      }
    }
    save.tutorial = false;
    // Counters for the missions and achievements.
    ensureDaily(save);
    track(save, 'runs', 1);
    track(save, 'kills', run.kills);
    track(save, 'rooms', run.roomsCleared);
    track(save, 'elites', run.eliteKills);
    track(save, 'bosses', run.bossKills);
    track(save, 'abilities', Object.values(run.taken).reduce((a, b) => a + b, 0));
    if (won) track(save, 'wins', 1);
    if (run.endless) track(save, 'endlessRooms', run.roomsCleared);
    if (run.heroic) track(save, 'heroicRooms', run.roomsCleared);
    track(save, 'spells', run.casts);
    track(save, 'loot', run.loot.length);
    track(save, 'runes', run.runes);
    // Account experience.
    const xp = runAccountXp({ rooms: run.roomsCleared, kills: run.kills, won, chapterIndex: run.chapterIndex, mode: run.mode });
    const levels = addAccountXp(save, xp);
    // A bonus item on a good run (the chest at the end), plus everything found on the way.
    const drop = won ? runDrop(save, run.chapterIndex, won, run.endless ? run.roomsCleared : run.room, Math.random, run.mode) : null;
    this.pendingDrop = drop;
    const found = run.loot.map((spec) => addItem(save, spec.base, spec.rarity, spec.level));
    save.runes = (save.runes ?? 0) + run.runes;
    // The hero grows with every run played with them.
    const heroId = this.runGear?.hero?.id ?? save.heroes.selected;
    const heroLevels = addHeroXp(save, heroId, xp);
    writeSave(save);
    const loot = [`<span class="pill"><i class="coin-icon"></i><b>+${coins}</b></span>`];
    if (drop) loot.push(`<span class="pill">${icon('gift')} Coffre de victoire</span>`);
    if (run.runes) loot.push(`<span class="pill">${icon('rune')} <b>+${run.runes}</b> runes</span>`);
    if (gems) loot.push(`<span class="pill"><i class="gem-icon"></i><b>+${gems}</b></span>`);
    loot.push(`<span class="pill">${icon('level')} +${xp} XP</span>`);
    for (const l of levels) loot.push(`<span class="pill pill--gold">${icon('level')} Compte niveau ${l.level} · +1 point de talent</span>`);
    const heroName = HEROES[heroId]?.name ?? 'Héros';
    for (const l of heroLevels) {
      const extra = l.spell ? ` · nouveau sort : ${SPELLS[l.spell].name}` : l.cls ? ' · choix de classe !' : '';
      loot.push(`<span class="pill pill--gold">${icon('hero-archer')} ${heroName} niveau ${l.level}${extra}</span>`);
    }
    if (found.length) {
      loot.push(`<div class="end-loot-list">${found.map((it) => this.menu.itemTile(it, { showEquipped: false })).join('')}</div>`);
      this.pendingLoot = found;
    }
    if (record && !won) loot.push(`<span class="pill">${icon('trophy')} Nouveau record</span>`);
    if (unlocked) loot.push(`<span class="pill">${icon('crown')} Chapitre suivant</span>`);
    const done = save.daily?.missions.filter((m) => !m.claimed && m.progress >= (this.menu.missionGoal(m.id) ?? Infinity)).length ?? 0;
    if (done) loot.push(`<span class="pill pill--gold">${icon('quests')} Mission accomplie</span>`);
    const title = run.endless ? 'Mode Infini' : `Chapitre ${run.chapterIndex + 1}${run.heroic ? ' · Héroïque' : ''} · ${run.chapter.name}`;
    this.ui.showEnd(
      title,
      run.endless ? `Salle ${run.roomsCleared}` : won ? 'Victoire !' : 'Défaite',
      [
        ['Salle', run.endless ? run.room : won ? `${ROOMS}/${ROOMS}` : `${run.room}/${ROOMS}`],
        ['Niveau', run.level],
        ['Monstres', run.kills],
        ['Élites', run.eliteKills],
        ['Meilleur combo', this.bestCombo ?? 0],
        ['Butin', run.loot.length],
      ],
      loot.join(''),
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
      onRoom: (room, boss, kind) => {
        if (!this.run) return;
        this.fade(() => {
          actors.clearEnemies();
          fx.clear();
          this.buildRoom();
          for (const enemy of this.run.enemies) actors.addEnemy(enemy);
          this.snapCamera = true;
          this.warmShaders();
          if (boss) {
            ui.banner(this.run.enemies[0]?.def.name ?? 'Boss', this.run.endless ? `Salle ${room}` : 'Le gardien du chapitre', 'danger');
            this.anime(1.4, 0);
            audio.warning(true);
            this.haptics.pulse(HAPTIC.boss);
          } else if (kind === 'treasure') ui.banner('Salle au trésor', 'Nettoie la salle pour ouvrir le coffre', 'gold');
          else if (kind === 'challenge') {
            ui.banner('Salle de défi', 'Monstres d’élite · une capacité en récompense', 'danger');
            audio.warning(false);
          } else ui.banner(`Salle ${room}`);
        });
      },
      onChestOpen: (chest) => {
        this.arenaView.openChest();
        fx.chest(chest.x, chest.z);
        audio.victory();
        this.haptics.pulse([20, 30, 20, 30, 50]);
      },
      onExplosion: (x, z) => {
        fx.blast(x, z, 1.4, COLORS.fire);
        audio.explosion(false);
      },
      onEnemySpawn: (enemy) => {
        // Enemies of a new room are added once the fade has rebuilt it.
        if (this.fading) return;
        actors.addEnemy(enemy);
        fx.spawn(enemy.x, enemy.z);
      },
      onShadow: (phase, x, z) => {
        fx.shadowPuff(x, z);
        actors.heroShadow(phase, x, z);
        if (phase !== 'back') audio.whoosh();
      },
      onExecute: (enemy, boss) => {
        fx.execute(enemy.x, enemy.z, boss);
        if (boss) this.anime(0.5, 0.8, 0xd8b0ff);
        this.floatWorld(enemy.x, 1.6 + enemy.def.scale * 0.4, enemy.z, boss ? 'Coup fatal !' : 'Exécution !', 'crit');
        this.hitStop = Math.max(this.hitStop, 0.09);
        this.shake = Math.min(1, this.shake + (boss ? 0.6 : 0.3));
        this.haptics.pulse(boss ? HAPTIC.boss : [18, 30, 18]);
      },
      onShoot: () => {
        actors.heroShoot();
        audio.shoot('ballista');
      },
      onEnemyHit: (enemy, damage, crit, source) => {
        if (!source?.execute || enemy.def.boss) this.floatWorld(enemy.x, 1 + enemy.def.scale * 0.5, enemy.z, String(Math.round(damage)), crit ? 'crit' : '');
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
        this.addCombo();
        // Loot falling: a burst in the rarity colour (after the kill's own drops are placed).
        setTimeout(() => {
          const run = this.run;
          if (!run) return;
          for (const p of run.pickups) {
            if (p.kind !== 'loot' || p.announced) continue;
            p.announced = true;
            fx.lootDrop(p.x, p.z, new THREE.Color(RARITIES[p.value.rarity].color));
            if (p.value.rarity >= 2) audio.warning(false);
          }
        }, 0);
        fx.death(enemy.x, enemy.z, Boolean(enemy.def.boss), enemy.def.id === 'ghost' || enemy.def.id === 'wisp' ? COLORS.ice : COLORS.smoke);
        audio.enemyDeath(Boolean(enemy.def.boss));
        this.haptics.pulse(enemy.def.boss ? HAPTIC.boss : HAPTIC.kill);
        // A few frames of hit stop sell the kill.
        this.hitStop = Math.max(this.hitStop, 0.06);
        this.shake = Math.min(1, this.shake + 0.12);
        if (enemy.def.boss) {
          this.shake = 1;
          this.slowMo = 0.9;
          this.anime(1.1, 1, 0xfff0d0);
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
      onClear: (boss, kind) => {
        this.arenaView.openDoor(true);
        audio.waveCleared();
        if (kind === 'challenge') ui.banner('Défi réussi !', '+3 gemmes · choisis une capacité', 'gold');
        else if (boss) ui.banner('Boss vaincu !', `+${ENDLESS_GEMS} gemmes · le portail est ouvert`, 'gold');
        else if (kind !== 'treasure') ui.banner('Salle nettoyée !', 'Le portail est ouvert');
      },
      onAngel: () => {
        this.mode = MODE.CHOOSING;
        this.joystick.release();
        audio.heal();
        setTimeout(() => this.offerChoices('Un ange apparaît', 'Soin ou capacité ?'), 200);
      },
      onWin: () => {
        // Let the boss fall in slow motion, then straight to the rewards.
        this.joystick.release();
        ui.banner('Victoire !', `${this.run.chapter.name} est libéré`);
        audio.waveCleared();
        const run = this.run;
        setTimeout(() => {
          if (this.run === run && this.mode === MODE.PLAYING) this.fade(() => this.finishRun(true));
        }, 1700);
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
        if (item.kind === 'coin') {
          audio.coin();
          const at = this.screenOf(item.x, 0.3, item.z);
          ui.flyCoin(at.x, at.y);
        }
        else if (item.kind === 'heart') {
          fx.heal(p.x, p.z);
          this.floatWorld(p.x, 1.3, p.z, 'Soin', 'heal');
          audio.heal();
        } else audio.collect(0);
      },
      onArrowWall: (arrow, x, z) => fx.wallHit(x, z),
      onSpell: (s, info) => this.spellFx(s, info),
      onZone: (zone, def) => {
        const c = new THREE.Color(def.color);
        fx.addZone(zone, c.getHex());
        fx.spellFall(zone.x, zone.z, zone.delay, c, zone.big);
      },
      onZoneBlast: (zone) => {
        const c = new THREE.Color(SPELLS[zone.spell]?.color ?? '#ffffff');
        fx.blast(zone.x, zone.z, zone.radius, c);
        if (zone.big) {
          this.anime(0.3, 0.6, c.getHex());
          this.shake = Math.min(1, this.shake + 0.6);
          audio.explosion(true);
          this.haptics.pulse([30, 20, 50]);
        } else audio.explosion(false);
      },
      onLoot: (spec) => {
        const rarity = RARITIES[spec.rarity];
        const def = itemDef({ base: spec.base });
        ui.toast(`${icon(def.icon)}<span><b>${rarity.name}</b> · ${def.name}</span>`, rarity.color);
        if (spec.rarity >= 2) {
          audio.victory();
          this.haptics.pulse([20, 30, 20, 30, 50]);
        } else audio.upgrade();
      },
      onBuffEnd: () => {},
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

  /** What a cast looks, sounds and feels like. */
  spellFx(s, info) {
    const fx = this.fx;
    const c = new THREE.Color(s.def.color);
    const p = this.run.player;
    this.actors.heroShoot();
    switch (s.def.type) {
      case 'nova':
        this.anime(0.35, 0);
        fx.nova(p.x, p.z, info.radius, c);
        this.shake = Math.min(1, this.shake + 0.45);
        this.audio.explosion(true);
        this.haptics.pulse([25, 20, 40]);
        break;
      case 'dash':
        this.anime(0.45, 0);
        fx.trail(info.x, info.z, info.toX, info.toZ, c);
        fx.ring(info.toX, info.toZ, 1.2, 0.35, c);
        this.audio.whoosh();
        this.haptics.pulse(18);
        break;
      case 'buff':
      case 'guard':
        fx.aura(p.x, p.z, c);
        if (s.def.type === 'guard') fx.heal(p.x, p.z);
        this.aura = { color: c, until: this.time + (info.duration ?? 5) };
        this.audio.upgrade();
        this.haptics.pulse([15, 30, 15]);
        break;
      case 'execute':
        this.anime(0.5, 0.75, c.getHex());
        fx.trail(p.x, p.z, info.toX, info.toZ, c);
        fx.execute(info.toX, info.toZ, true);
        this.hitStop = Math.max(this.hitStop, 0.08);
        this.shake = Math.min(1, this.shake + 0.5);
        this.audio.whoosh();
        this.haptics.pulse([30, 20, 50]);
        break;
      case 'chain':
        fx.lightning(p.x, p.z, info.toX, info.toZ);
        fx.flash(p.x, 0.9, p.z, 1.2, c);
        this.audio.lightning();
        this.haptics.pulse(20);
        break;
      case 'pierce':
      case 'fan':
        fx.flash(p.x, 0.6, p.z, 1.4, c);
        fx.ring(p.x, p.z, 1.3, 0.3, c);
        this.audio.shoot('ballista');
        this.haptics.pulse(15);
        break;
      default:
        fx.flash(p.x, 0.8, p.z, 1.2, c);
        this.audio.whoosh();
        this.haptics.pulse(12);
    }
  }

  /** A kill feeds the combo; milestones shout, buzz and chime. */
  addCombo() {
    const c = (this.combo ??= { count: 0, timer: 0 });
    c.count = c.timer > 0 ? c.count + 1 : 1;
    c.timer = COMBO_TIME;
    const tag = COMBO_TAGS[c.count];
    if (tag) {
      this.audio.upgrade();
      this.haptics.pulse([12, 20, 24]);
      this.anime(0.35, 0);
    }
    this.ui.setCombo(c.count, 1, tag ?? '');
    this.bestCombo = Math.max(this.bestCombo ?? 0, c.count);
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

  /** Camera target { x, y, z, d, pitch } that keeps the hero and the monsters on screen. */
  frameFight(run, cfg) {
    const p = run.player;
    const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg);
    const cam = (this.frameCam ??= new THREE.PerspectiveCamera());
    cam.fov = this.view.camera.fov;
    cam.aspect = this.view.camera.aspect;
    cam.near = 0.1;
    cam.far = 200;
    cam.updateProjectionMatrix();
    const pts = (this.framePts ??= []);
    pts.length = 0;
    pts.push([p.x, p.z, 1.3]);
    for (const e of run.enemies) if (!e.dead) pts.push([e.x, e.z, 0.8 + e.radius]);
    const halfH = CONFIG.arena.height / 2;
    // Safe box in normalised screen coordinates.
    const safe = { x0: -0.84, x1: 0.84, y0: -0.7, y1: 0.58 };
    let x = p.x * cfg.follow;
    let z = p.z - 1.4;
    let d = cfg.halfWidth * this.camPerWidth;
    const dMax = cfg.maxHalfWidth * this.camPerWidth;
    const v = this.tmp;
    for (let iter = 0; iter < 4; iter++) {
      cam.position.set(x, Math.sin(pitch) * d, z + Math.cos(pitch) * d);
      cam.lookAt(x, 0, z);
      cam.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [px, pz, r] of pts) {
        for (const [ox, oz] of [[-r, 0], [r, 0], [0, -r * 1.4], [0, r]]) {
          v.set(px + ox, 0.4, pz + oz).project(cam);
          x0 = Math.min(x0, v.x);
          x1 = Math.max(x1, v.x);
          y0 = Math.min(y0, v.y);
          y1 = Math.max(y1, v.y);
        }
      }
      // Too wide or too tall for the safe box: back off.
      const scale = Math.max((x1 - x0) / (safe.x1 - safe.x0), (y1 - y0) / (safe.y1 - safe.y0));
      if (scale > 1) d = Math.min(dMax, d * (1 + (scale - 1) * 0.9));
      // Recentre on the group (screen offsets back to ground units at this distance).
      const halfW = d / this.camPerWidth;
      const halfHt = halfW / cam.aspect / Math.sin(pitch);
      x += ((x0 + x1) / 2 - (safe.x0 + safe.x1) / 2) * halfW;
      z -= ((y0 + y1) / 2 - (safe.y0 + safe.y1) / 2) * halfHt;
    }
    return {
      x: clamp(x, -2.2, 2.2),
      y: 0,
      z: clamp(z, -halfH + 2.2, halfH - 2.6),
      d,
      pitch: cfg.pitchDeg,
    };
  }

  /** Monsters out of view (or hidden under the HUD): an arrow on the edge toward each. */
  offscreenMarkers(run) {
    const out = [];
    const w = this.view.width;
    const h = this.view.height;
    const top = 120;
    const margin = 22;
    for (const e of run.enemies) {
      if (e.dead || e.spawning > 0) continue;
      const s = this.screenOf(e.x, 0.6, e.z);
      if (s.x > 8 && s.x < w - 8 && s.y > top - 20 && s.y < h - 8) continue;
      const cx = w / 2;
      const cy = h / 2;
      const dx = s.x - cx;
      const dy = s.y - cy;
      const k = Math.min((cx - margin) / Math.max(1e-3, Math.abs(dx)), ((dy < 0 ? cy - top : h - cy - margin)) / Math.max(1e-3, Math.abs(dy)));
      out.push({ x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx), boss: Boolean(e.def.boss) });
      if (out.length >= 12) break;
    }
    return out;
  }

  /** Screen position (CSS pixels) of a world point. */
  screenOf(x, y, z) {
    const rect = this.view.canvas.getBoundingClientRect();
    const v = this.tmp.set(x, y, z).project(this.view.camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
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

  /** Speed lines for `amount` (≈ seconds), an impact frame of `impact` strength. */
  anime(speed = 0, impact = 0, color = null) {
    const a = this.animeFx;
    a.speed = Math.max(a.speed, speed);
    if (impact > a.impact) {
      a.impact = impact;
      a.color.set(color ?? 0xffffff);
    }
  }

  render(dt) {
    this.time += dt;
    const a = this.animeFx;
    a.speed = Math.max(0, a.speed - dt);
    a.impact = Math.max(0, a.impact - dt * 8);
    this.view.setAnime(Math.min(1, a.speed * 1.4), a.impact > 0.05 ? Math.min(0.85, a.impact) : 0, a.color);
    // Depth of field: the hero and the room sharp, the far hills soft; the menu focuses on the hero.
    const focusMode = this.mode === MODE.MENU ? 'menu' : 'play';
    if (this.focusMode !== focusMode) {
      this.focusMode = focusMode;
      if (focusMode === 'menu') this.view.setFocus(0.14, 0.7, 2.6);
      else this.view.setFocus(0.08, 0.66, 3.2);
    }
    const run = this.mode === MODE.MENU ? null : this.run;
    this.arenaView.update(dt, run?.player ?? (this.mode === MODE.MENU ? this.menuHero : null));
    if (this.mode === MODE.MENU) this.renderMenu(dt);
    else this.actors.update(dt, this.time, this.view.camera, run);
    this.fx.update(dt, run && !this.fading ? run : null);
    this.updateCamera(dt);
    this.hudDt = dt;
    if (run) this.updateHud();
    this.view.render();
  }

  renderMenu(dt) {
    // The hero waits on the arena while the menu is open.
    const hero = this.menuHero;
    const fake = { player: hero, state: 'menu' };
    // Three-quarter view (the cape shows), turning slowly.
    hero.dirX = 0.5 + Math.sin(this.time * 0.35) * 0.2;
    hero.dirZ = 1;
    this.actors.update(dt, this.time, this.view.camera, fake);
    // Motes of light spiral up around the hero, in the colour of their cape.
    this.menuMotes = (this.menuMotes ?? 0) + dt;
    if (this.menuMotes > 0.07) {
      this.menuMotes = 0;
      const heroDef = HEROES[this.save.heroes.selected] ?? HEROES.archer;
      const c = (this.menuMoteColor ??= new THREE.Color()).setHex(heroDef.cape);
      const a = this.time * 2.2;
      const r = 0.55 + Math.sin(this.time * 0.9) * 0.1;
      this.fx.sparks.emit(hero.x + Math.cos(a) * r, 0.05, hero.z + Math.sin(a) * r, -Math.sin(a) * 0.5, 0.9 + Math.random() * 0.4, Math.cos(a) * 0.5, c, 0.09, 1.6, { endSize: 0.02, drag: 0.3, brightness: 2.4 });
      if (Math.random() < 0.35) this.fx.sparks.emit(hero.x + (Math.random() - 0.5) * 2.4, 0.1, hero.z + (Math.random() - 0.5) * 1.6, 0, 0.35, 0, c, 0.06, 2.2, { endSize: 0.01, drag: 0, brightness: 1.8 });
    }
  }

  updateCamera(dt) {
    const camera = this.view.camera;
    const run = this.run;
    const cfg = CONFIG.camera;
    const halfH = CONFIG.arena.height / 2;
    const halfW = CONFIG.arena.width / 2;
    const cam = (this.cam ??= { x: 0, y: 0, z: 3.4, d: this.menuDistance, pitch: cfg.menu.pitchDeg });
    let target;
    if (this.mode === MODE.MENU || !run) {
      // Close-up on the hero, from low: the landscape rises behind them.
      const hero = this.menuHero ?? { x: 0, z: 1.5 };
      // A slow drift from side to side: the landscape moves behind the hero (parallax).
      target = { x: hero.x + Math.sin(this.time * 0.13) * 0.45, y: cfg.menu.lookY, z: hero.z, d: this.menuDistance, pitch: cfg.menu.pitchDeg + Math.sin(this.time * 0.09) * 1.5 };
    } else {
      // Frames the hero and every monster: recentres and backs off just enough that
      // they all fit inside the safe part of the screen (under the HUD, above the thumbs).
      target = this.frameFight(run, cfg);
    }
    // Position follows fast; distance and angle glide (the swoop from the menu to a room).
    if (this.snapCamera) {
      // A new room (behind the fade): no glide.
      this.snapCamera = false;
      Object.assign(cam, target);
    }
    cam.x = damp(cam.x, target.x, 6, dt);
    cam.z = damp(cam.z, target.z, 6, dt);
    cam.y = damp(cam.y, target.y, 3, dt);
    cam.d = damp(cam.d, target.d, 3, dt);
    cam.pitch = damp(cam.pitch, target.pitch, 3, dt);
    this.camZ = cam.z;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.25;
    const pitch = THREE.MathUtils.degToRad(cam.pitch);
    const jx = s ? (Math.random() - 0.5) * s : 0;
    const jz = s ? (Math.random() - 0.5) * s : 0;
    camera.position.set(cam.x + jx, cam.y + Math.sin(pitch) * cam.d, cam.z + Math.cos(pitch) * cam.d + jz);
    camera.lookAt(cam.x + jx, cam.y, cam.z + jz);
  }

  updateHud() {
    const run = this.run;
    const ui = this.ui;
    ui.updateSpells(run.spells.map((_, i) => run.spellState(i)));
    const dt = this.hudDt ?? 0.016;
    ui.tick(dt);
    const combo = this.combo;
    if (combo?.timer > 0) {
      if (this.mode === MODE.PLAYING) combo.timer -= dt;
      ui.setCombo(combo.count, Math.max(0, combo.timer / COMBO_TIME));
    }
    const p = run.player;
    ui.setLowHp(this.mode === MODE.PLAYING && p.hp > 0 && p.hp < p.maxHp * 0.3);
    ui.setMarkers(this.mode === MODE.PLAYING ? this.offscreenMarkers(run) : []);
    // A boost glows around the hero while it lasts.
    if (this.aura && this.mode === MODE.PLAYING) {
      if (this.time > this.aura.until || !run.buffs.length && run.player.invulnerable <= 0) this.aura = null;
      else if ((this.auraTick = (this.auraTick ?? 0) + 1) % 14 === 0) this.fx.ring(run.player.x, run.player.z, 1.1, 0.45, this.aura.color);
    }
    if (run.endless) ui.setRoom('Mode Infini', run.isBossRoom ? `Boss · salle ${run.room}` : `Salle ${run.room}`);
    else ui.setRoom(`Chapitre ${run.chapterIndex + 1}${run.heroic ? ' · Héroïque' : ''}`, run.room >= ROOMS ? 'Boss !' : `Salle ${run.room}/${ROOMS}`);
    ui.setCoins(run.coins);
    ui.setXp(run.level, run.xp / run.xpNeeded);
    const boss = run.enemies.find((e) => e.def.boss && !e.dead);
    ui.setBoss(boss && boss.spawning <= 0 ? { name: boss.def.name, share: boss.hp / boss.maxHp } : null);
  }
}
