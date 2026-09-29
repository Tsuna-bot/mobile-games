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
    for (const button of doc.querySelectorAll('#modes [data-mode]')) button.addEventListener('click', () => this.handlers.mode?.(button.dataset.mode));
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
    this.$('spellbar').classList.toggle('is-visible', visible);
  }

  /** The spell buttons of the run: [{ def, rank }] (index = the run's spell index). */
  setSpells(spells) {
    const bar = this.$('spellbar');
    bar.replaceChildren();
    this.spellButtons = spells.map((s, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'spell';
      button.style.setProperty('--spell', s.def.color);
      button.setAttribute('aria-label', s.def.name);
      button.innerHTML = `<span class="spell__icon">${icon(s.def.icon)}</span><i class="spell__cd"></i><b class="spell__time"></b><span class="spell__rank">${'•'.repeat(s.rank)}</span>`;
      // Instant on touch down (a second finger while the other one steers).
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.spell?.(i);
      });
      bar.append(button);
      return { button, cd: button.querySelector('.spell__cd'), time: button.querySelector('.spell__time'), shown: null };
    });
  }

  /** @param states [{ ready, share, timer }] */
  updateSpells(states) {
    if (!this.spellButtons) return;
    states.forEach((st, i) => {
      const b = this.spellButtons[i];
      if (!b || !st) return;
      const key = st.ready ? 'ready' : `${Math.ceil(st.timer)}|${Math.round(st.share * 60)}`;
      if (b.shown === key) return;
      const wasReady = b.shown === 'ready';
      b.shown = key;
      b.button.classList.toggle('is-ready', st.ready);
      b.cd.style.setProperty('--cd', st.ready ? 0 : st.share);
      b.time.textContent = st.ready ? '' : Math.ceil(st.timer);
      if (st.ready && !wasReady) {
        b.button.classList.remove('is-flash');
        void b.button.offsetWidth;
        b.button.classList.add('is-flash');
      }
    });
  }

  castFeedback(i, ok) {
    const b = this.spellButtons?.[i];
    if (!b) return;
    const cls = ok ? 'is-cast' : 'is-denied';
    b.button.classList.remove('is-cast', 'is-denied');
    void b.button.offsetWidth;
    b.button.classList.add(cls);
  }

  /** A short notice at the top (loot found). */
  toast(html, color = '#fff') {
    const box = this.$('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--toast', color);
    el.innerHTML = html;
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 2600);
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

  /** `title` above (chapter, mode), `room` below (room number or "Boss !"). */
  setRoom(title, room) {
    const key = `${title}|${room}`;
    if (this.shown.room === key) return;
    this.shown.room = key;
    this.$('hud-chapter').textContent = title;
    this.$('hud-room').textContent = room;
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

  setMenu({ coins, gems, kicker, chapterName, best, locked, lockText, canPrev, canNext, mode, modes }) {
    this.$('menu-coins').textContent = coins;
    this.$('menu-gems').textContent = gems;
    this.$('chapter-kicker').textContent = kicker;
    this.$('chapter-name').textContent = chapterName;
    this.$('chapter-best').textContent = locked ? lockText : best;
    const card = this.$('chapter-card');
    card.classList.toggle('is-locked', locked);
    card.dataset.mode = mode;
    this.$('btn-play').disabled = locked;
    this.$('btn-prev').disabled = !canPrev;
    this.$('btn-next').disabled = !canNext;
    for (const button of this.$('modes').querySelectorAll('[data-mode]')) {
      const id = button.dataset.mode;
      button.classList.toggle('is-active', id === mode);
      button.classList.toggle('is-locked', id !== 'normal' && !modes[id]);
    }
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
