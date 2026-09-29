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

  /** The coin counter rolls toward its value (see tick) and bounces when it grows. */
  setCoins(coins) {
    this.coinTarget = Math.floor(coins);
    if (this.coinShown === undefined || this.coinTarget < this.coinShown) this.coinShown = this.coinTarget;
  }

  /** Per-frame HUD animation (rolling counters, combo timer). */
  tick(dt) {
    if (this.coinTarget !== undefined && this.coinShown !== this.coinTarget) {
      const gap = this.coinTarget - this.coinShown;
      this.coinShown += Math.sign(gap) * Math.max(1, Math.ceil(Math.abs(gap) * Math.min(1, dt * 9)));
      if (Math.abs(this.coinTarget - this.coinShown) < 1) this.coinShown = this.coinTarget;
      this.$('hud-coins').textContent = this.coinShown;
    }
  }

  /** A coin flies from a screen point to the coin counter; the counter bounces when it lands. */
  flyCoin(x, y, kind = 'coin') {
    const now = performance.now();
    if (now - (this.lastFly ?? 0) < 45) return;
    this.lastFly = now;
    this.flyPool ??= [];
    let el = this.flyPool.find((e) => !e.busy);
    if (!el) {
      if (this.flyPool.length >= 18) return;
      el = document.createElement('i');
      this.$('flyers').append(el);
      this.flyPool.push(el);
    }
    el.busy = true;
    el.className = kind === 'gem' ? 'flyer gem-icon' : 'flyer coin-icon';
    const target = this.$('hud-coins').parentElement.querySelector('.coin-icon').getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const mx = x + (Math.random() - 0.5) * 80;
    const my = Math.min(y, ty) - 40 - Math.random() * 60;
    const anim = el.animate([
      { transform: `translate(${x}px, ${y}px) scale(0.4)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.25)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${tx}px, ${ty}px) scale(0.7)`, opacity: 1 },
    ], { duration: 520 + Math.random() * 160, easing: 'cubic-bezier(0.45, 0, 0.6, 1)' });
    anim.onfinish = () => {
      el.busy = false;
      el.style.opacity = 0;
      const box = this.$('hud-coins').parentElement;
      box.classList.remove('is-bump');
      void box.offsetWidth;
      box.classList.add('is-bump');
    };
  }

  /** Kill combo: count, time left (0..1), a tag at milestones. */
  setCombo(count, share, tag = '') {
    const box = this.$('combo');
    const visible = count >= 3 && share > 0;
    box.classList.toggle('is-visible', visible);
    if (!visible) {
      this.shown.combo = 0;
      return;
    }
    if (this.shown.combo !== count) {
      this.shown.combo = count;
      this.$('combo-count').textContent = count;
      box.classList.remove('is-pop');
      void box.offsetWidth;
      box.classList.add('is-pop');
      box.dataset.tier = count >= 35 ? '3' : count >= 20 ? '2' : count >= 10 ? '1' : '0';
    }
    this.$('combo-timer').style.transform = `scaleX(${share.toFixed(3)})`;
    if (tag) {
      const t = this.$('combo-tag');
      t.textContent = tag;
      t.classList.remove('is-playing');
      void t.offsetWidth;
      t.classList.add('is-playing');
    }
  }

  /** Arrows on the screen edges toward monsters out of view: [{ x, y, angle, boss }]. */
  setMarkers(list) {
    this.markerPool ??= [];
    const box = this.$('markers');
    while (this.markerPool.length < list.length && this.markerPool.length < 12) {
      const el = document.createElement('i');
      el.className = 'marker';
      box.append(el);
      this.markerPool.push(el);
    }
    this.markerPool.forEach((el, i) => {
      const m = list[i];
      if (!m) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.classList.toggle('is-boss', Boolean(m.boss));
      el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px) rotate(${m.angle.toFixed(3)}rad)`;
    });
  }

  /** A red heartbeat on the screen edges while the hero's life is low. */
  setLowHp(low) {
    if (this.shown.low === low) return;
    this.shown.low = low;
    this.$('hurt').classList.toggle('is-low', low);
  }

  setXp(level, fraction) {
    const width = `${Math.round(fraction * 100)}%`;
    if (this.shown.level !== level) {
      if (this.shown.level !== undefined) {
        const el = this.$('hud-level').parentElement;
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
        // Level up: the bar flashes full before starting again.
        this.$('hud-xp').style.transition = 'none';
        this.$('hud-xp').style.width = '100%';
        void el.offsetWidth;
        this.$('hud-xp').style.transition = '';
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
    if (!b) {
      this.shown.boss = null;
      return;
    }
    this.$('boss-name').textContent = b.name;
    const width = `${Math.max(0, Math.round(b.share * 1000) / 10)}%`;
    if (this.shown.boss !== width) {
      // The white chip lags behind the red bar: you see the chunk you just took off.
      if (this.shown.boss && parseFloat(width) < parseFloat(this.shown.boss)) {
        box.classList.remove('is-hit');
        void box.offsetWidth;
        box.classList.add('is-hit');
      } else if (!this.shown.boss) this.$('boss-chip').style.width = width;
      this.shown.boss = width;
      this.$('boss-fill').style.width = width;
      clearTimeout(this.chipTimer);
      this.chipTimer = setTimeout(() => { this.$('boss-chip').style.width = width; }, 380);
    }
    box.classList.toggle('is-enraged', b.share < 0.5);
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
        if (performance.now() - this.choiceShownAt < 350 || box.classList.contains('is-picking')) return;
        // The chosen card lifts and glows, the others drop away; then the pick.
        box.classList.add('is-picking');
        card.classList.add('is-picked');
        setTimeout(() => {
          box.classList.remove('is-picking');
          onPick(a.id);
        }, 230);
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
    this.$('end-stats').innerHTML = stats.map(([l, v]) => `<div><dt>${l}</dt><dd data-value="${typeof v === 'number' ? v : ''}">${typeof v === 'number' ? 0 : v}</dd></div>`).join('');
    this.$('end-loot').innerHTML = loot;
    this.showScreen('end');
    // Numbers count up, then the rewards pop in one after another (CSS delays).
    const start = performance.now();
    const cells = [...this.$('end-stats').querySelectorAll('dd[data-value]')].filter((d) => d.dataset.value !== '');
    const step = (now) => {
      const k = Math.min(1, (now - start) / 750);
      const e = 1 - (1 - k) ** 3;
      for (const d of cells) d.textContent = Math.round(Number(d.dataset.value) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
