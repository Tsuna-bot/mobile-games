import { ENEMIES } from '../data/enemies.js';
import { TARGETING, TARGETING_LABELS, TOWERS, TOWER_ORDER } from '../data/towers.js';

const QUALITY_LABELS = { auto: 'Auto', high: 'Haute', medium: 'Moyenne', low: 'Basse' };
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
const FLOATER_POOL = 14;
const number = new Intl.NumberFormat('fr-FR');

const MAP_COLORS = {
  grass: { '.': '#5ad07a', T: '#2f8a4a', R: '#8e8aa8', C: '#b47cf0', H: '#49b068', '#': '#e8935a', S: '#8a6cff', B: '#ff5d5d' },
  snow: { '.': '#e9f1f8', T: '#8fb2c9', R: '#9aa3b8', C: '#b47cf0', H: '#d3e2ee', '#': '#b9d7ee', S: '#8a6cff', B: '#ff5d5d' },
};

function starSvg(on) {
  return `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
}

function formatRate(seconds) {
  return `${(1 / seconds).toFixed(seconds < 0.5 ? 1 : 2).replace('.', ',')}/s`;
}

/** Everything DOM: HUD, sheets, screens, banners, floating labels. */
export class UI {
  constructor(doc = document) {
    const $ = (id) => doc.getElementById(id);
    this.$ = $;
    this.screens = { menu: $('screen-menu'), pause: $('screen-pause'), end: $('screen-end') };
    this.hud = $('hud');
    this.dock = $('dock');
    this.lives = $('hud-lives');
    this.gold = $('hud-gold');
    this.wave = $('hud-wave');
    this.statLives = $('stat-lives');
    this.statGold = $('stat-gold');
    this.speedButton = $('btn-speed');
    this.waveButton = $('btn-wave');
    this.waveTitle = $('wave-title');
    this.waveMeta = $('wave-meta');
    this.waveProgress = $('wave-progress');
    this.wavePreview = $('wave-preview');
    this.buildSheet = $('sheet-build');
    this.buildGrid = $('build-grid');
    this.buildHint = $('build-hint');
    this.towerSheet = $('sheet-tower');
    this.banner = $('banner');
    this.coachEl = $('coach');
    this.vignette = $('damage-vignette');
    this.settingButtons = [...doc.querySelectorAll('[data-setting]')];
    this.handlers = {};
    this.thumbnails = null;
    this.shown = { lives: -1, gold: -1, wave: '', waveKey: '' };

    this.floaters = Array.from({ length: FLOATER_POOL }, () => {
      const el = doc.createElement('div');
      el.className = 'floater';
      $('floaters').append(el);
      return el;
    });
    this.floaterCursor = 0;

    for (const id of ['btn-pause', 'btn-speed', 'btn-wave', 'btn-resume', 'btn-restart', 'btn-quit', 'btn-next', 'btn-retry', 'btn-menu', 'btn-upgrade', 'btn-sell']) {
      $(id).addEventListener('click', () => this.handlers[id]?.());
    }
    for (const button of doc.querySelectorAll('[data-close]')) {
      button.addEventListener('click', () => this.handlers.close?.());
    }
    for (const button of this.settingButtons) {
      button.addEventListener('click', () => this.handlers.setting?.(button.dataset.setting));
    }
  }

  on(name, handler) {
    this.handlers[name] = handler;
  }

  // ------------------------------------------------------------ loading & errors

  setLoadingProgress(value) {
    this.$('loading-bar').style.width = `${Math.round(value * 100)}%`;
  }

  hideLoading() {
    this.$('loading').classList.remove('is-visible');
  }

  showFatal(message) {
    this.hideLoading();
    this.$('fatal-message').textContent = message;
    this.$('fatal').classList.add('is-visible');
  }

  setContextLost(visible) {
    this.$('context-lost').classList.toggle('is-visible', visible);
  }

  // ------------------------------------------------------------ screens

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      const visible = key === name;
      el.classList.toggle('is-visible', visible);
      el.inert = !visible;
    }
    const primary = name ? this.screens[name].querySelector('.btn--primary:not([hidden]), .level-card:not(:disabled)') : null;
    if (primary && matchMedia('(pointer: fine)').matches) primary.focus({ preventScroll: true });
  }

  setPlayingUi(visible) {
    this.hud.classList.toggle('is-visible', visible);
    this.dock.classList.toggle('is-visible', visible);
    this.hud.inert = !visible;
    this.dock.inert = !visible;
    if (!visible) this.closeSheets();
  }

  renderLevels(levels, save, onSelect) {
    const container = this.$('levels');
    container.replaceChildren();
    levels.forEach((level, index) => {
      const record = save.levels[level.id];
      const unlocked = index === 0 || (save.levels[levels[index - 1].id]?.stars ?? 0) > 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level-card';
      button.disabled = !unlocked;
      const stars = [1, 2, 3].map((n) => starSvg((record?.stars ?? 0) >= n)).join('');
      button.innerHTML = `
        <canvas width="${level.map[0].length}" height="${level.map.length}"></canvas>
        <span>
          <span class="level-card__name">${index + 1}. ${level.name}</span>
          <span class="level-card__info">${unlocked ? `${level.waves} vagues · ${level.subtitle}` : `${level.waves} vagues · termine le niveau ${index} pour débloquer`}</span>
        </span>
        ${unlocked ? `<span class="stars" aria-label="${record?.stars ?? 0} étoiles sur 3">${stars}</span>` : '<span class="level-card__lock" aria-label="Verrouillé">🔒</span>'}`;
      this.drawMinimap(button.querySelector('canvas'), level);
      button.addEventListener('click', () => onSelect(index));
      container.append(button);
    });
  }

  drawMinimap(canvas, level) {
    const ctx = canvas.getContext('2d');
    const colors = MAP_COLORS[level.theme] ?? MAP_COLORS.grass;
    level.map.forEach((row, r) => {
      [...row].forEach((char, c) => {
        ctx.fillStyle = colors[char] ?? colors['.'];
        ctx.fillRect(c, r, 1, 1);
      });
    });
  }

  showEnd({ victory, levelName, stars, stats, hasNext }) {
    this.$('end-kicker').textContent = levelName;
    this.$('end-title').textContent = victory ? 'Victoire !' : 'Défaite…';
    const starsEl = this.$('end-stars');
    starsEl.hidden = !victory;
    starsEl.innerHTML = [1, 2, 3].map((n) => starSvg(stars >= n)).join('');
    [...starsEl.children].forEach((star, i) => setTimeout(() => star.classList.add('pop'), 350 + i * 260));
    this.$('end-stats').innerHTML = stats
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join('');
    const next = this.$('btn-next');
    next.hidden = !(victory && hasNext);
    this.$('btn-retry').classList.toggle('btn--primary', !victory || !hasNext);
    this.showScreen('end');
  }

  // ------------------------------------------------------------ HUD

  setStats(lives, gold, waveNumber, waveTotal) {
    if (lives !== this.shown.lives) {
      if (lives < this.shown.lives) this.restartAnimation(this.statLives, 'hurt');
      this.shown.lives = lives;
      this.lives.textContent = lives;
    }
    if (gold !== this.shown.gold) {
      if (gold > this.shown.gold && this.shown.gold >= 0) this.restartAnimation(this.statGold, 'bump');
      this.shown.gold = gold;
      this.gold.textContent = number.format(gold);
    }
    const wave = `${waveNumber}/${waveTotal}`;
    if (wave !== this.shown.wave) {
      this.shown.wave = wave;
      this.wave.textContent = wave;
    }
  }

  resetStats() {
    this.shown.lives = -1;
    this.shown.gold = -1;
    this.shown.wave = '';
    this.shown.waveKey = '';
  }

  setSpeed(multiplier) {
    this.speedButton.textContent = `x${multiplier}`;
    this.speedButton.setAttribute('aria-pressed', String(multiplier > 1));
  }

  /**
   * @param state { title, meta, enabled, ready, progress (0..1), preview: [{type, count}] }
   */
  setWaveButton(state) {
    const key = `${state.title}|${state.meta}|${state.enabled}|${state.ready}|${state.previewKey}`;
    if (key !== this.shown.waveKey) {
      this.shown.waveKey = key;
      this.waveTitle.textContent = state.title;
      this.waveMeta.textContent = state.meta;
      this.waveButton.disabled = !state.enabled;
      this.waveButton.classList.toggle('is-ready', state.ready);
      this.wavePreview.innerHTML = state.preview
        .map(({ type, count }) => `<span class="enemy-chip" title="${ENEMIES[type].name}"><img src="${this.thumbnails.enemies[type]}" alt="${ENEMIES[type].name}"><b>${count}</b></span>`)
        .join('');
    }
    this.waveProgress.style.transform = `scaleX(${state.progress})`;
  }

  hurt() {
    this.restartAnimation(this.vignette, 'is-playing');
  }

  // ------------------------------------------------------------ sheets

  openBuildSheet(gold, selectedType) {
    this.towerSheet.classList.remove('is-open');
    if (!this.buildGrid.childElementCount) {
      for (const id of TOWER_ORDER) {
        const def = TOWERS[id];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'build-card';
        card.dataset.tower = id;
        card.innerHTML = `<img src="${this.thumbnails.towers[id][0]}" alt=""><span class="build-card__name">${def.name}</span><span class="build-card__cost">${def.cost}</span>`;
        card.addEventListener('click', () => this.handlers.buildCard?.(id));
        this.buildGrid.append(card);
      }
    }
    this.refreshBuildSheet(gold, selectedType);
    this.buildSheet.classList.add('is-open');
  }

  refreshBuildSheet(gold, selectedType) {
    for (const card of this.buildGrid.children) {
      const def = TOWERS[card.dataset.tower];
      card.classList.toggle('is-poor', gold < def.cost);
      card.classList.toggle('is-selected', card.dataset.tower === selectedType);
      card.setAttribute('aria-label', `${def.name}, ${def.cost} or`);
    }
    const def = TOWERS[selectedType];
    this.buildHint.textContent = def
      ? `${def.name} : ${def.blurb} Touche encore pour construire.`
      : 'Touche une tour pour voir sa portée, puis touche-la encore pour construire.';
  }

  denyCard(type) {
    const card = this.buildGrid.querySelector(`[data-tower="${type}"]`);
    if (card) this.restartAnimation(card, 'denied');
  }

  openTowerSheet(tower, gold, confirmSell) {
    this.buildSheet.classList.remove('is-open');
    this.refreshTowerSheet(tower, gold, confirmSell);
    this.towerSheet.classList.add('is-open');
  }

  refreshTowerSheet(tower, gold, confirmSell) {
    const def = tower.def;
    const stats = tower.stats;
    const next = tower.maxed ? null : def.levels[tower.level + 1];
    this.$('tower-image').src = this.thumbnails.towers[def.id][tower.level];
    this.$('tower-name').textContent = def.name;
    this.$('tower-level').innerHTML = def.levels.map((_, i) => `<i class="${i <= tower.level ? 'on' : ''}"></i>`).join('');
    const rows = [];
    const diff = (key, format = (v) => v) => {
      const now = format(stats[key]);
      return next && next[key] !== stats[key] ? `${now}<span class="up">→ ${format(next[key])}</span>` : now;
    };
    rows.push(['Dégâts', diff('damage')]);
    rows.push(['Portée', diff('range', (v) => v.toFixed(1).replace('.', ','))]);
    rows.push(['Cadence', diff('rate', formatRate)]);
    if (stats.splash) rows.push(['Zone', diff('splash', (v) => v.toFixed(1).replace('.', ','))]);
    if (stats.slow) rows.push(['Ralenti', diff('slow', (v) => `${Math.round(v * 100)} %`)]);
    rows.push(['Éliminés', tower.kills]);
    this.$('tower-stats').innerHTML = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');

    const targeting = this.$('tower-targeting');
    targeting.hidden = def.id === 'frost';
    if (!targeting.childElementCount) {
      for (const mode of TARGETING) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mode = mode;
        button.textContent = TARGETING_LABELS[mode];
        button.addEventListener('click', () => this.handlers.targeting?.(mode));
        targeting.append(button);
      }
    }
    for (const button of targeting.children) button.setAttribute('aria-pressed', String(button.dataset.mode === tower.targeting));

    const upgrade = this.$('btn-upgrade');
    if (tower.maxed) {
      upgrade.textContent = 'Niveau max';
      upgrade.disabled = true;
    } else {
      upgrade.innerHTML = `Améliorer <span class="gold-inline">${tower.upgradeCost}</span>`;
      upgrade.disabled = gold < tower.upgradeCost;
    }
    const sell = this.$('btn-sell');
    sell.classList.toggle('btn--danger', confirmSell);
    sell.classList.toggle('btn--ghost', !confirmSell);
    sell.innerHTML = confirmSell ? `Confirmer <span class="gold-inline">+${tower.sellValue}</span>` : `Vendre <span class="gold-inline">+${tower.sellValue}</span>`;
  }

  closeSheets() {
    this.buildSheet.classList.remove('is-open');
    this.towerSheet.classList.remove('is-open');
  }

  // ------------------------------------------------------------ feedback

  showBanner(title, detail = '', variant = '') {
    this.banner.innerHTML = detail ? `${title}<small>${detail}</small>` : title;
    this.banner.dataset.variant = variant;
    this.restartAnimation(this.banner, 'is-playing');
  }

  floatText(x, y, text, variant = '') {
    const el = this.floaters[this.floaterCursor];
    this.floaterCursor = (this.floaterCursor + 1) % this.floaters.length;
    el.textContent = text;
    el.dataset.variant = variant;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.restartAnimation(el, 'is-playing');
  }

  coach(text) {
    if (text) this.coachEl.textContent = text;
    this.coachEl.classList.toggle('is-visible', Boolean(text));
  }

  restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // Force a reflow so the animation restarts.
    el.classList.add(className);
  }

  renderSettings(settings, hapticsSupported) {
    for (const button of this.settingButtons) {
      const key = button.dataset.setting;
      const value = button.querySelector('.chip__value');
      if (key === 'quality') {
        value.textContent = QUALITY_LABELS[settings.quality];
      } else {
        value.textContent = settings[key] ? 'On' : 'Off';
        button.setAttribute('aria-pressed', String(settings[key]));
      }
      if (key === 'haptics') button.hidden = !hapticsSupported;
    }
  }
}
