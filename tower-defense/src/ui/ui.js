import { ENEMIES } from '../data/enemies.js';
import { PERKS } from '../data/perks.js';
import { SPELLS, SPELL_ORDER } from '../data/spells.js';
import { TARGETING, TARGETING_LABELS, TOWERS, TOWER_ORDER } from '../data/towers.js';

const QUALITY_LABELS = { auto: 'Auto', ultra: 'Ultra', high: 'Haute', medium: 'Moyenne', low: 'Basse' };
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
const FLOATER_POOL = 14;
const COIN_POOL = 24;
const number = new Intl.NumberFormat('fr-FR');

const MAP_COLORS = {
  meadow: { '.': '#5ad07a', T: '#2f8a4a', R: '#8e8aa8', C: '#b47cf0', H: '#49b068', '#': '#e8935a', S: '#8a6cff', B: '#ff5d5d' },
  snow: { '.': '#e9f1f8', T: '#8fb2c9', R: '#9aa3b8', C: '#b47cf0', H: '#d3e2ee', '#': '#b9d7ee', S: '#8a6cff', B: '#ff5d5d' },
  dusk: { '.': '#6fb85a', T: '#3c6b3a', R: '#8e7a98', C: '#c07cf0', H: '#5a9a4a', '#': '#ff9e6b', S: '#8a6cff', B: '#ff5d5d' },
  crystal: { '.': '#5ad0a0', T: '#2f8a6a', R: '#8e8aa8', C: '#d08cff', H: '#49b088', '#': '#c9a0ff', S: '#8a6cff', B: '#ff5d5d' },
  night: { '.': '#3f7a6a', T: '#244a44', R: '#5a5a78', C: '#9f7cff', H: '#35685a', '#': '#6d7fbf', S: '#b58cff', B: '#ff7d7d' },
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
    this.screens = {
      menu: $('screen-menu'),
      pause: $('screen-pause'),
      end: $('screen-end'),
      perks: $('screen-perks'),
      shop: $('screen-shop'),
      achievements: $('screen-achievements'),
    };
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

    this.coins = Array.from({ length: COIN_POOL }, () => {
      const el = doc.createElement('div');
      el.className = 'coin';
      el.addEventListener('transitionend', (event) => {
        if (event.propertyName !== 'transform') return;
        el.classList.remove('is-flying');
        el.style.transform = '';
        this.restartAnimation(this.statGold, 'bump');
      });
      $('coins').append(el);
      return el;
    });
    this.coinCursor = 0;

    this.spellButtons = {};
    for (const button of doc.querySelectorAll('[data-spell]')) {
      const id = button.dataset.spell;
      this.spellButtons[id] = {
        button,
        cooldown: button.querySelector('.spell__cooldown'),
        time: button.querySelector('.spell__time'),
        shown: '',
      };
      button.addEventListener('click', () => this.handlers.spell?.(id));
    }
    this.spellHint = $('spell-hint');
    this.spellBar = $('spells');
    this.shopTab = 'towers';
    for (const tab of doc.querySelectorAll('[data-tab]')) {
      tab.addEventListener('click', () => {
        this.shopTab = tab.dataset.tab;
        for (const other of doc.querySelectorAll('[data-tab]')) other.setAttribute('aria-selected', String(other === tab));
        this.handlers.shopTab?.(this.shopTab);
      });
    }
    this.builtFor = '';
    this.screenFlash = $('screen-flash');

    for (const id of ['btn-pause', 'btn-speed', 'btn-wave', 'btn-resume', 'btn-restart', 'btn-quit', 'btn-next', 'btn-retry', 'btn-menu', 'btn-upgrade', 'btn-sell', 'btn-perks', 'btn-perks-back', 'btn-perks-reset', 'btn-spell-cancel', 'btn-shop', 'btn-shop-back', 'btn-achievements', 'btn-achievements-back', 'btn-resume-run']) {
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

  /**
   * @param entries [{ def, unlocked, stars, crown, heroicAvailable, lockText, info }]
   */
  renderLevels(entries, onSelect) {
    const container = this.$('levels');
    container.replaceChildren();
    entries.forEach((entry, index) => {
      const { def } = entry;
      const card = document.createElement('div');
      card.className = `level-card${def.endless ? ' level-card--survival' : ''}`;
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'level-card__play';
      play.disabled = !entry.unlocked;
      const stars = `<span class="stars" aria-label="${entry.stars} étoiles sur 3">${[1, 2, 3].map((n) => starSvg(entry.stars >= n)).join('')}</span>`;
      play.innerHTML = `
        <canvas width="${def.map[0].length}" height="${def.map.length}"></canvas>
        <span>
          <span class="level-card__name">${def.endless ? '∞' : index + 1}. ${def.name}</span>
          <span class="level-card__info">${entry.unlocked ? entry.info : entry.lockText}</span>
        </span>
        ${entry.unlocked ? stars : '<span class="level-card__lock" aria-label="Verrouillé">🔒</span>'}`;
      this.drawMinimap(play.querySelector('canvas'), def);
      play.addEventListener('click', () => onSelect(entry, false));
      card.append(play);
      if (entry.heroicAvailable) {
        const heroic = document.createElement('button');
        heroic.type = 'button';
        heroic.className = `level-card__heroic${entry.crown ? ' is-done' : ''}`;
        heroic.textContent = entry.crown ? '👑 Héroïque réussi' : '👑 Héroïque';
        heroic.setAttribute('aria-label', `Mode héroïque : ${def.name}`);
        heroic.addEventListener('click', () => onSelect(entry, true));
        card.append(heroic);
      }
      container.append(card);
    });
  }

  setWallet(gems, shopBadge, achievementsDone, achievementsTotal) {
    this.$('gem-count').textContent = number.format(gems);
    this.$('shop-badge').hidden = !shopBadge;
    this.$('achievements-count').textContent = `${achievementsDone}/${achievementsTotal}`;
  }

  setResume(detail) {
    const card = this.$('btn-resume-run');
    card.hidden = !detail;
    if (detail) this.$('resume-detail').textContent = detail;
  }

  /** @param items [{ id, kind, name, blurb, stats, price, owned }] */
  renderShop(items, gems, onBuy) {
    this.$('shop-gems').textContent = number.format(gems);
    const list = this.$('shop');
    list.replaceChildren();
    for (const item of items) {
      const row = document.createElement('div');
      row.className = `shop-item${item.owned ? ' is-owned' : ''}`;
      const art = item.kind === 'tower'
        ? `<img src="${this.thumbnails.towers[item.id][2]}" alt="">`
        : `<span class="spell" data-spell="${item.id}">${this.spellButtons[item.id].button.querySelector('svg').outerHTML}</span>`;
      row.innerHTML = `
        <span class="shop-item__art">${art}</span>
        <span>
          <span class="shop-item__name">${item.name}</span>
          <span class="shop-item__blurb">${item.blurb}</span>
          <span class="shop-item__stats">${item.stats}</span>
        </span>
        <span class="shop-item__footer"></span>`;
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'btn btn--gem shop-item__buy';
      if (item.owned) {
        buy.textContent = '✓ Débloqué';
        buy.disabled = true;
      } else {
        buy.innerHTML = `<span class="gem" aria-hidden="true"></span>${item.price}`;
        buy.disabled = gems < item.price;
        buy.setAttribute('aria-label', `Acheter ${item.name} pour ${item.price} gemmes`);
        buy.addEventListener('click', () => onBuy(item));
      }
      row.querySelector('.shop-item__footer').append(buy);
      list.append(row);
    }
  }

  /** @param items [{ name, text, reward, done }] */
  renderAchievements(items) {
    const list = this.$('achievements');
    list.innerHTML = items
      .map((a) => `<div class="achievement${a.done ? ' is-done' : ''}">
          <span class="achievement__icon" aria-hidden="true">${a.done ? '🏆' : '🔒'}</span>
          <span><span class="achievement__name">${a.name}</span><span class="achievement__text">${a.text}</span></span>
          <span class="achievement__reward"><span class="gem" aria-hidden="true"></span>${a.reward}</span>
        </div>`)
      .join('');
  }

  setStarTotal(available, total, canBuy) {
    this.$('star-count').textContent = String(available);
    this.$('star-total').title = `${available} étoile(s) à dépenser, ${total} gagnée(s) au total`;
    this.$('perks-badge').hidden = !canBuy;
  }

  renderPerks(ranks, available, onBuy) {
    this.$('perks-stars').textContent = available;
    this.$('perks-stars-label').textContent = available > 1 ? 'étoiles disponibles' : 'étoile disponible';
    const list = this.$('perks');
    list.replaceChildren();
    for (const perk of PERKS) {
      const rank = ranks[perk.id] ?? 0;
      const maxed = rank >= perk.costs.length;
      const cost = maxed ? 0 : perk.costs[rank];
      const row = document.createElement('div');
      row.className = 'perk';
      row.innerHTML = `
        <span class="perk__icon" aria-hidden="true">${perk.icon}</span>
        <span>
          <span class="perk__name">${perk.name}</span>
          <span class="perk__effect">${rank > 0 ? perk.effect(rank) : 'Pas encore acheté'}${maxed ? '' : ` → ${perk.effect(rank + 1)}`}</span>
          <span class="pips">${perk.costs.map((_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('')}</span>
        </span>`;
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'btn btn--gold perk__buy';
      buy.disabled = maxed || available < cost;
      buy.textContent = maxed ? 'Max' : `${cost} ★`;
      buy.setAttribute('aria-label', maxed ? `${perk.name} : niveau maximum` : `Acheter ${perk.name} pour ${cost} étoiles`);
      buy.addEventListener('click', () => onBuy(perk.id));
      row.append(buy);
      list.append(row);
    }
  }

  drawMinimap(canvas, level) {
    const ctx = canvas.getContext('2d');
    const colors = MAP_COLORS[level.theme] ?? MAP_COLORS.meadow;
    level.map.forEach((row, r) => {
      [...row].forEach((char, c) => {
        ctx.fillStyle = colors[char] ?? colors['.'];
        ctx.fillRect(c, r, 1, 1);
      });
    });
  }

  showEnd({ victory, title, levelName, stars, stats, hasNext, reward }) {
    this.$('end-kicker').textContent = levelName;
    this.$('end-title').textContent = title ?? (victory ? 'Victoire !' : 'Défaite…');
    this.$('end-reward').textContent = reward ?? '';
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
    if (waveTotal === Infinity) waveTotal = '∞';
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

  openBuildSheet(gold, selectedType, owned = TOWER_ORDER) {
    this.towerSheet.classList.remove('is-open');
    const key = owned.join();
    if (this.builtFor !== key) {
      this.builtFor = key;
      this.buildGrid.replaceChildren();
      this.buildGrid.classList.toggle('build-grid--wide', owned.length > 5);
      for (const id of TOWER_ORDER.filter((t) => owned.includes(t))) {
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
    const nextBase = tower.maxed ? null : def.levels[tower.level + 1];
    const next = nextBase && {
      ...nextBase,
      range: nextBase.range * tower.modifiers.range,
      ...(nextBase.damage !== undefined ? { damage: nextBase.damage * tower.modifiers.damage } : {}),
    };
    this.$('tower-image').src = this.thumbnails.towers[def.id][tower.level];
    this.$('tower-name').textContent = def.name;
    this.$('tower-level').innerHTML = def.levels.map((_, i) => `<i class="${i <= tower.level ? 'on' : ''}"></i>`).join('');
    const rows = [];
    const diff = (key, format = (v) => v) => {
      const now = format(stats[key]);
      return next && next[key] !== stats[key] ? `${now}<span class="up">→ ${format(next[key])}</span>` : now;
    };
    if (stats.income) {
      rows.push(['Or par vague', diff('income', (v) => `+${v}`)]);
    } else {
      rows.push(['Dégâts', diff('damage', (v) => Math.round(v))]);
      rows.push(['Portée', diff('range', (v) => v.toFixed(1).replace('.', ','))]);
      rows.push(['Cadence', diff('rate', formatRate)]);
    }
    if (stats.chains) rows.push(['Rebonds', diff('chains')]);
    if (stats.armorPierce) rows.push(['Spécial', 'Perce l’armure']);
    if (stats.splash) rows.push(['Zone', diff('splash', (v) => v.toFixed(1).replace('.', ','))]);
    if (stats.slow) rows.push(['Ralenti', diff('slow', (v) => `${Math.round(v * 100)} %`)]);
    if (!stats.income) rows.push(['Éliminés', tower.kills]);
    this.$('tower-stats').innerHTML = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');

    const targeting = this.$('tower-targeting');
    targeting.hidden = def.id === 'frost' || def.id === 'goldmine';
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

  /** @param charges { id: 0..1 }, remaining { id: seconds }, armed id|null, enabled */
  setSpells(charges, remaining, armed, enabled) {
    for (const id of SPELL_ORDER) {
      const ui = this.spellButtons[id];
      const owned = charges[id] !== undefined;
      if (ui.button.hidden === owned) ui.button.hidden = !owned;
      if (!owned) continue;
      const ready = charges[id] >= 1;
      const seconds = ready ? '' : String(Math.ceil(remaining[id]));
      const key = `${ready}|${seconds}|${armed === id}|${enabled}|${Math.round(charges[id] * 60)}`;
      if (key === ui.shown) continue;
      ui.shown = key;
      ui.cooldown.style.setProperty('--remaining', String(1 - charges[id]));
      ui.time.textContent = seconds;
      ui.button.classList.toggle('is-ready', ready && enabled);
      ui.button.classList.toggle('is-armed', armed === id);
      ui.button.disabled = !enabled;
    }
  }

  setSpellCount(count) {
    this.spellBar.classList.toggle('spells--compact', count > 4);
  }

  showSpellHint(id) {
    const spell = SPELLS[id];
    this.$('spell-hint-text').innerHTML = spell ? `Touche la carte : <b>${spell.name}</b>` : '';
    this.spellHint.classList.toggle('is-visible', Boolean(spell));
  }

  flash(variant = '') {
    this.screenFlash.dataset.variant = variant;
    this.restartAnimation(this.screenFlash, 'is-playing');
  }

  /** Coins fly from a screen point to the gold counter. */
  flyCoins(x, y, count) {
    const target = this.statGold.getBoundingClientRect();
    const tx = target.left + 16;
    const ty = target.top + target.height / 2;
    for (let i = 0; i < count; i++) {
      const el = this.coins[this.coinCursor];
      this.coinCursor = (this.coinCursor + 1) % this.coins.length;
      const sx = x + (Math.random() - 0.5) * 30;
      const sy = y + (Math.random() - 0.5) * 20;
      el.classList.remove('is-flying');
      el.style.transitionDelay = `${i * 0.05}s`;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.transform = 'translate(0, 0) scale(1)';
      void el.offsetWidth;
      el.classList.add('is-flying');
      el.style.transform = `translate(${tx - sx}px, ${ty - sy}px) scale(0.7)`;
    }
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
