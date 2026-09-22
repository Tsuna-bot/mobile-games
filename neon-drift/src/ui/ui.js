const QUALITY_LABELS = { auto: 'Auto', high: 'Haute', medium: 'Moyenne', low: 'Basse' };
const POPUP_POOL_SIZE = 4;

const numberFormat = new Intl.NumberFormat('fr-FR');

/** DOM overlay: screens, HUD, popups. Writes to the DOM only when values change. */
export class UI {
  constructor(root = document) {
    const $ = (id) => root.getElementById(id);
    this.app = $('app');
    this.screens = {
      menu: $('screen-menu'),
      pause: $('screen-pause'),
      over: $('screen-over'),
    };
    this.hud = $('hud');
    this.score = $('hud-score');
    this.combo = $('hud-combo');
    this.menuBest = $('menu-best');
    this.tutorial = $('tutorial');
    this.flash = $('flash');
    this.loading = $('loading');
    this.contextLost = $('context-lost');
    this.fatal = $('fatal');
    this.fatalMessage = $('fatal-message');
    this.over = {
      score: $('over-score'),
      record: $('over-record'),
      best: $('over-best'),
      distance: $('over-distance'),
      shards: $('over-shards'),
      nearMisses: $('over-near'),
    };
    this.buttons = {
      play: $('btn-play'),
      pause: $('btn-pause'),
      resume: $('btn-resume'),
      restart: $('btn-restart'),
      quit: $('btn-quit'),
      retry: $('btn-retry'),
      menu: $('btn-menu'),
    };
    this.settingButtons = [...root.querySelectorAll('[data-setting]')];

    const popupLayer = $('popups');
    this.popups = Array.from({ length: POPUP_POOL_SIZE }, () => {
      const el = document.createElement('div');
      el.className = 'popup';
      popupLayer.append(el);
      return el;
    });
    this.popupCursor = 0;

    this.shownScore = -1;
    this.shownCombo = -1;
    this.activeScreen = null;
  }

  on(button, handler) {
    this.buttons[button].addEventListener('click', handler);
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      const visible = key === name;
      el.classList.toggle('is-visible', visible);
      el.inert = !visible;
      el.setAttribute('aria-hidden', String(!visible));
    }
    this.activeScreen = name;
    // Move focus into the new screen for keyboard and screen reader users.
    const primary = name ? this.screens[name].querySelector('.btn--primary') : null;
    if (primary && matchMedia('(pointer: fine)').matches) primary.focus({ preventScroll: true });
    else document.activeElement?.blur?.();
  }

  setHudVisible(visible) {
    this.hud.classList.toggle('is-visible', visible);
  }

  setScore(score) {
    if (score === this.shownScore) return;
    this.shownScore = score;
    this.score.textContent = numberFormat.format(score);
  }

  setCombo(combo) {
    if (combo === this.shownCombo) return;
    const increased = combo > this.shownCombo;
    this.shownCombo = combo;
    this.combo.textContent = `x${combo}`;
    this.combo.classList.toggle('is-visible', combo > 1);
    if (increased && combo > 1) this.restartAnimation(this.combo, 'bump');
  }

  setBest(best) {
    this.menuBest.textContent = numberFormat.format(best);
  }

  popup(text, variant = '') {
    const el = this.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % this.popups.length;
    el.textContent = text;
    el.dataset.variant = variant;
    this.restartAnimation(el, 'is-playing');
  }

  flashScreen() {
    this.restartAnimation(this.flash, 'is-playing');
  }

  restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // Force a reflow so the CSS animation restarts.
    el.classList.add(className);
  }

  setTutorialVisible(visible) {
    this.tutorial.classList.toggle('is-visible', visible);
  }

  showGameOver({ score, best, isRecord, distance, shards, nearMisses }) {
    this.over.score.textContent = numberFormat.format(score);
    this.over.best.textContent = numberFormat.format(best);
    this.over.distance.textContent = `${numberFormat.format(distance)} m`;
    this.over.shards.textContent = numberFormat.format(shards);
    this.over.nearMisses.textContent = numberFormat.format(nearMisses);
    this.over.record.classList.toggle('is-visible', isRecord);
    this.showScreen('over');
  }

  /** Keeps every copy of the settings toggles (menu + pause) in sync. */
  renderSettings(settings, hapticsSupported) {
    for (const button of this.settingButtons) {
      const key = button.dataset.setting;
      const label = button.querySelector('.chip__value');
      if (key === 'quality') {
        label.textContent = QUALITY_LABELS[settings.quality];
      } else {
        button.setAttribute('aria-pressed', String(settings[key]));
        label.textContent = settings[key] ? 'On' : 'Off';
      }
      if (key === 'haptics') button.hidden = !hapticsSupported;
    }
  }

  onSetting(handler) {
    for (const button of this.settingButtons) {
      button.addEventListener('click', () => handler(button.dataset.setting));
    }
  }

  setLoading(visible) {
    this.loading.classList.toggle('is-visible', visible);
  }

  setContextLost(visible) {
    this.contextLost.classList.toggle('is-visible', visible);
  }

  showFatal(message) {
    this.setLoading(false);
    this.fatalMessage.textContent = message;
    this.fatal.classList.add('is-visible');
  }
}
