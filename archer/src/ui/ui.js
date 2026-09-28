import { ABILITIES } from '../data/abilities.js';
import { badge, icon } from './icons.js';

const FLOATERS = 40;

/** Everything DOM: HUD, screens, ability cards, damage numbers, banners. */
export class UI {
  constructor(doc = document) {
    const $ = (id) => doc.getElementById(id);
    this.$ = $;
    this.handlers = {};
    this.screens = {
      menu: $('screen-menu'),
      choose: $('screen-choose'),
      pause: $('screen-pause'),
      dead: $('screen-dead'),
      end: $('screen-end'),
    };
    this.hud = $('hud');
    this.shown = {};
    this.floaters = Array.from({ length: FLOATERS }, () => {
      const el = doc.createElement('div');
      el.className = 'floater';
      $('floaters').append(el);
      return el;
    });
    this.floaterCursor = 0;
    for (const id of ['btn-pause', 'btn-resume', 'btn-quit', 'btn-revive', 'btn-giveup', 'btn-end', 'btn-play', 'btn-prev', 'btn-next']) {
      $(id).addEventListener('click', () => this.handlers[id]?.());
    }
    this.settingButtons = [...doc.querySelectorAll('[data-setting]')];
    for (const button of this.settingButtons) button.addEventListener('click', () => this.handlers.setting?.(button.dataset.setting));
  }

  on(name, handler) {
    this.handlers[name] = handler;
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) el.classList.toggle('is-visible', key === name);
  }

  setHud(visible) {
    this.hud.classList.toggle('is-visible', visible);
  }

  setLoading(fraction, text) {
    this.$('loading-bar').style.width = `${Math.round(fraction * 100)}%`;
    if (text) this.$('loading-text').textContent = text;
  }

  hideLoading() {
    this.$('loading').classList.remove('is-visible');
  }

  fatal(message) {
    this.$('loading').classList.remove('is-visible');
    this.$('fatal-message').textContent = message;
    this.$('fatal').classList.add('is-visible');
  }

  // ------------------------------------------------------------ HUD

  setRoom(chapterNumber, room, rooms) {
    const key = `${chapterNumber}|${room}`;
    if (this.shown.room === key) return;
    this.shown.room = key;
    this.$('hud-chapter').textContent = `Chapitre ${chapterNumber}`;
    this.$('hud-room').textContent = room >= rooms ? 'Boss !' : `Salle ${room}/${rooms}`;
  }

  setCoins(coins) {
    const value = Math.floor(coins);
    if (this.shown.coins === value) return;
    this.shown.coins = value;
    this.$('hud-coins').textContent = value;
  }

  setXp(level, fraction) {
    const width = `${Math.round(fraction * 100)}%`;
    if (this.shown.level !== level) {
      if (this.shown.level !== undefined) {
        const el = this.$('hud-level').parentElement;
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
      this.shown.level = level;
      this.$('hud-level').textContent = level;
    }
    if (this.shown.xp !== width) {
      this.shown.xp = width;
      this.$('hud-xp').style.width = width;
    }
  }

  /** @param b { name, share } or null */
  setBoss(b) {
    const box = this.$('boss');
    box.hidden = !b;
    if (!b) return;
    this.$('boss-name').textContent = b.name;
    this.$('boss-fill').style.width = `${Math.max(0, Math.round(b.share * 1000) / 10)}%`;
  }

  hurt() {
    const el = this.$('hurt');
    el.classList.remove('is-playing');
    void el.offsetWidth;
    el.classList.add('is-playing');
  }

  setHint(visible) {
    this.$('hint').classList.toggle('is-visible', visible);
  }

  // ------------------------------------------------------------ texts

  floatAt(x, y, text, variant = '') {
    const el = this.floaters[this.floaterCursor];
    this.floaterCursor = (this.floaterCursor + 1) % FLOATERS;
    el.textContent = text;
    el.dataset.variant = variant;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.remove('is-playing');
    void el.offsetWidth;
    el.classList.add('is-playing');
  }

  banner(title, subtitle = '', variant = '') {
    const el = this.$('banner');
    el.innerHTML = subtitle ? `${title}<small>${subtitle}</small>` : title;
    el.dataset.variant = variant;
    el.classList.remove('is-playing');
    void el.offsetWidth;
    el.classList.add('is-playing');
  }

  // ------------------------------------------------------------ ability choice

  /** @param ids ability ids; @param taken { id: stacks }; `kicker`/`title` texts; `extra` = [{ id, icon, name, text }] (angel heal) */
  showChoices(kicker, title, ids, taken, onPick, extra = []) {
    this.$('choose-kicker').textContent = kicker;
    this.$('choose-title').textContent = title;
    const box = this.$('cards');
    box.replaceChildren();
    const items = [...extra, ...ids.map((id) => ABILITIES[id])];
    box.classList.toggle('cards--two', items.length === 2);
    items.forEach((a, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.style.animationDelay = `${0.08 + i * 0.1}s`;
      const stacks = taken[a.id] ?? 0;
      card.innerHTML = `${badge(a.icon, 'card__icon')}<b>${a.name}</b><small>${a.text}</small>${a.max && a.max < 99 && stacks ? `<span class="card__stack">${stacks}/${a.max}</span>` : ''}`;
      // Ignore taps in the first moments (the thumb was still on the joystick).
      card.addEventListener('click', () => {
        if (performance.now() - this.choiceShownAt < 350) return;
        onPick(a.id);
      });
      box.append(card);
    });
    this.renderTaken(this.$('taken'), taken);
    this.choiceShownAt = performance.now();
    this.showScreen('choose');
  }

  renderTaken(box, taken) {
    box.innerHTML = Object.entries(taken)
      .filter(([id]) => id !== 'heal')
      .map(([id, n]) => `<span title="${ABILITIES[id].name}">${badge(ABILITIES[id].icon)}${n > 1 ? `<sup>${n}</sup>` : ''}</span>`)
      .join('');
  }

  showPause(taken) {
    this.renderTaken(this.$('pause-taken'), taken);
    this.showScreen('pause');
  }

  /** @param stats [[label, value]], loot html */
  showEnd(kicker, title, stats, loot = '') {
    this.$('end-kicker').textContent = kicker;
    this.$('end-title').textContent = title;
    this.$('end-stats').innerHTML = stats.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('');
    this.$('end-loot').innerHTML = loot;
    this.showScreen('end');
  }

  // ------------------------------------------------------------ menu

  setMenu({ coins, gems, chapterNumber, chapterName, best, locked, canPrev, canNext }) {
    this.$('menu-coins').textContent = coins;
    this.$('menu-gems').textContent = gems;
    this.$('chapter-kicker').textContent = `Chapitre ${chapterNumber}`;
    this.$('chapter-name').textContent = chapterName;
    this.$('chapter-best').textContent = locked ? 'Termine le chapitre précédent' : best;
    this.$('chapter-card').classList.toggle('is-locked', locked);
    this.$('btn-play').disabled = locked;
    this.$('btn-prev').disabled = !canPrev;
    this.$('btn-next').disabled = !canNext;
  }

  renderSettings(settings, hapticsSupported) {
    for (const button of this.settingButtons) {
      const key = button.dataset.setting;
      const value = button.querySelector('.chip__value');
      if (key === 'quality') value.textContent = { auto: 'Auto', low: 'Basse', medium: 'Moyenne', high: 'Haute', ultra: 'Ultra' }[settings.quality];
      else value.textContent = settings[key] ? 'On' : 'Off';
      if (key === 'haptics') button.hidden = !hapticsSupported;
    }
  }
}
