import { ENEMIES } from '../data/enemies.js';
import { RESOURCE_INFO } from '../data/realm.js';
import { PERKS } from '../data/perks.js';
import { SPELLS, SPELL_ORDER } from '../data/spells.js';
import { TARGETING, TARGETING_LABELS, TOWERS, TOWER_ORDER } from '../data/towers.js';

const QUALITY_LABELS = { auto: 'Auto', ultra: 'Ultra', high: 'Haute', medium: 'Moyenne', low: 'Basse' };
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
const FLOATER_POOL = 14;
const COIN_POOL = 24;
const RES_FLY_POOL = 24;
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
      research: $('screen-research'),
      report: $('screen-report'),
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

    // Kingdom: resource icons that fly from the map into the counters.
    this.resFlyers = Array.from({ length: RES_FLY_POOL }, () => {
      const el = doc.createElement('div');
      el.className = 'res-fly';
      $('coins').append(el);
      return el;
    });
    this.resFlyCursor = 0;
    this.resHold = {};
    this.resValue = {};
    this.resTarget = {};

    // Minimap: a tap moves the camera there (coordinates 0..1 across the map).
    this.minimap = $('minimap');
    this.minimap.addEventListener('pointerdown', (event) => {
      const rect = this.minimap.getBoundingClientRect();
      this.handlers.minimap?.((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      event.preventDefault();
    });
    this.arrowLayer = $('arrows');
    this.arrows = [];

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

    // Kingdom mode.
    this.realmBuildSheet = $('sheet-realm-build');
    this.realmInfoSheet = $('sheet-realm-info');
    this.workersSheet = $('sheet-workers');
    this.realmTab = 'defense';
    this.researchTab = 'Économie';
    this.shownRes = {};
    for (const tab of doc.querySelectorAll('[data-realm-tab]')) {
      tab.addEventListener('click', () => {
        this.realmTab = tab.dataset.realmTab;
        for (const other of doc.querySelectorAll('[data-realm-tab]')) other.setAttribute('aria-selected', String(other === tab));
        this.handlers.realmTab?.(this.realmTab);
      });
    }

    for (const id of ['btn-pause', 'btn-speed', 'btn-wave', 'btn-resume', 'btn-restart', 'btn-quit', 'btn-next', 'btn-retry', 'btn-menu', 'btn-upgrade', 'btn-sell', 'btn-perks', 'btn-perks-back', 'btn-perks-reset', 'btn-spell-cancel', 'btn-shop', 'btn-shop-back', 'btn-achievements', 'btn-achievements-back', 'btn-resume-run',
      'btn-realm', 'btn-workers', 'btn-research', 'btn-research-back', 'btn-demolish', 'btn-realm-upgrade', 'btn-new-realm', 'btn-realm-extra', 'btn-undo', 'btn-report-repair', 'btn-report-ok', 'objective', 'btn-recenter']) {
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
    if (waveNumber === null) return;
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
      if (stats.beam) rows.push(['Dégâts/s', diff('damage', (v) => Math.round(v * 10))]);
      else rows.push(['Dégâts', diff('damage', (v) => Math.round(v))]);
      rows.push(['Portée', diff('range', (v) => v.toFixed(1).replace('.', ','))]);
      if (!stats.beam) rows.push(['Cadence', diff('rate', formatRate)]);
    }
    if (stats.burn) rows.push(['Brûlure', diff('burn', (v) => `${v}/s`)]);
    if (stats.poison) rows.push(['Poison', diff('poison', (v) => `${v}/s`)]);
    if (stats.chains) rows.push(['Rebonds', diff('chains')]);
    if (stats.armorPierce && !stats.beam) rows.push(['Spécial', 'Perce l’armure']);
    if (stats.beam) rows.push(['Chauffe', `jusqu’à ×${stats.maxRamp}`]);
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
    this.$('btn-spell-cancel').textContent = 'Annuler';
    this.spellHint.classList.toggle('is-visible', Boolean(spell));
  }

  /** Same bar as the spell hint, for a building mode (walls). */
  /**
   * Dawn report: title, stars (0..3), counters that roll up one after the other,
   * the best tower and an optional repair button.
   * @param report { kicker, title, danger, stars, stats: [{ label, value, prefix, suffix, tone }], best, note, repair }
   */
  showNightReport(report, have) {
    const screen = this.screens.report;
    screen.classList.toggle('is-danger', Boolean(report.danger));
    this.$('report-kicker').textContent = report.kicker;
    this.$('report-title').textContent = report.title;
    const stars = this.$('report-stars');
    const star = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
    stars.innerHTML = [0, 1, 2].map((i) => `<i class="${i < report.stars ? 'on' : ''}" style="animation-delay:${0.35 + i * 0.22}s">${star}</i>`).join('');
    const stats = this.$('report-stats');
    stats.innerHTML = report.stats.map((row, i) => `<div class="${row.tone ?? ''}" style="animation-delay:${0.2 + i * 0.12}s"><dt>${row.label}</dt><dd data-value="${row.value}" data-prefix="${row.prefix ?? ''}" data-suffix="${row.suffix ?? ''}">${row.prefix ?? ''}0${row.suffix ?? ''}</dd></div>`).join('');
    const best = this.$('report-best');
    best.hidden = !report.best;
    if (report.best) {
      this.$('report-best-image').src = report.best.image;
      this.$('report-best-name').textContent = report.best.name;
      this.$('report-best-damage').textContent = `${number.format(report.best.damage)} dégâts`;
    }
    this.$('report-note').textContent = report.note ?? '';
    const repair = this.$('btn-report-repair');
    repair.hidden = !report.repair;
    if (report.repair) {
      repair.innerHTML = `🔧 Réparer tout ${this.costHtml(report.repair.cost, have)}`;
      repair.disabled = !report.repair.affordable;
    }
    this.showScreen('report');
    // Counters roll up one after the other.
    const cells = [...stats.querySelectorAll('dd')];
    const start = performance.now() + 250;
    const tick = (now) => {
      let running = false;
      cells.forEach((dd, i) => {
        const t = Math.min(1, Math.max(0, (now - start - i * 120) / 700));
        if (t < 1) running = true;
        const eased = 1 - (1 - t) ** 3;
        dd.textContent = `${dd.dataset.prefix}${number.format(Math.round(Number(dd.dataset.value) * eased))}${dd.dataset.suffix}`;
      });
      if (running && screen.classList.contains('is-visible')) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Short "Annuler" toast after placing something (the timer bar runs down). */
  showUndo(text, seconds) {
    const el = this.$('undo');
    this.$('undo-text').textContent = text;
    const timer = this.$('undo-timer');
    timer.style.animationDuration = `${seconds}s`;
    this.restartAnimation(timer, 'is-running');
    el.classList.add('is-visible');
    clearTimeout(this.undoTimeout);
    this.undoTimeout = setTimeout(() => this.hideUndo(), seconds * 1000);
  }

  hideUndo() {
    clearTimeout(this.undoTimeout);
    this.$('undo').classList.remove('is-visible');
  }

  showModeHint(text, buttonText) {
    this.$('spell-hint-text').textContent = text;
    this.$('btn-spell-cancel').textContent = buttonText;
    this.spellHint.classList.add('is-visible');
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
    this.realmBuildSheet.classList.remove('is-open');
    this.realmInfoSheet.classList.remove('is-open');
    this.workersSheet.classList.remove('is-open');
  }

  // ------------------------------------------------------------ Kingdom

  /** Cost chips like "🪵 20 🪨 10"; resources the player lacks are red. */
  costHtml(cost, have) {
    return `<span class="costs">${Object.entries(cost)
      .map(([resource, amount]) => `<span class="${have && have(resource) < amount ? 'poor' : ''}">${RESOURCE_INFO[resource].icon} ${number.format(amount)}</span>`)
      .join('')}</span>`;
  }

  /** @param o { text, count, goal, reward (html), done, fresh } */
  setObjective(o) {
    const el = this.$('objective');
    const key = o ? `${o.text}|${o.count}|${o.done}` : '';
    if (key === this.shown.objective) return;
    const fresh = o && this.shown.objectiveText !== o.text;
    this.shown.objective = key;
    this.shown.objectiveText = o?.text;
    el.hidden = !o;
    if (!o) return;
    this.$('objective-text').textContent = o.done ? 'Objectif atteint !' : o.text;
    this.$('objective-reward').innerHTML = o.reward;
    this.$('objective-count').textContent = o.goal > 1 && !o.done ? `${Math.min(o.count, o.goal)}/${o.goal}` : o.done ? '✓' : '';
    this.$('objective-fill').style.width = `${Math.round(Math.min(1, o.count / o.goal) * 100)}%`;
    el.classList.toggle('is-done', Boolean(o.done));
    if (o.done) this.restartAnimation(el, 'is-cheering');
    else if (fresh) this.restartAnimation(el, 'is-new');
  }

  /**
   * Arrows at the screen edge pointing to enemies out of view.
   * @param list [{ x, y, angle, count }] in CSS pixels
   */
  setArrows(list) {
    while (this.arrows.length < list.length) {
      const el = document.createElement('div');
      el.className = 'edge-arrow';
      el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 12L7 4v16z"/></svg><b></b>';
      this.arrowLayer.append(el);
      this.arrows.push(el);
    }
    this.arrows.forEach((el, i) => {
      const a = list[i];
      el.hidden = !a;
      if (!a) return;
      el.style.transform = `translate(${a.x}px, ${a.y}px)`;
      el.firstChild.style.transform = `rotate(${a.angle}rad)`;
      el.lastChild.textContent = a.count > 1 ? a.count : '';
    });
  }

  setRealmMode(on) {
    document.body.classList.toggle('is-realm', on);
    this.$('hud-row').hidden = !on;
    if (!on) this.setArrows([]);
    this.shown.objective = '';
    this.$('hud-res').hidden = !on;
    this.$('realm-bar').hidden = !on;
    this.$('hud-wave-label').textContent = on ? 'Jour' : 'Vague';
    this.$('btn-restart').hidden = on;
    this.$('btn-new-realm').hidden = !on;
    this.shownRes = {};
    this.resValue = {};
    this.resTarget = {};
    this.resHold = {};
    this.shown.wave = '';
  }

  setRealmCard(detail, fresh) {
    this.$('realm-detail').textContent = detail;
    this.$('btn-realm').querySelector('.realm-card__tag').hidden = !fresh;
  }

  /** Resource chips under the HUD: amounts and storage cap. */
  /**
   * Resource counters roll toward the stock; amounts still flying to the HUD
   * (see `flyResource`) are held back until they land.
   */
  setResources(stock, cap) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.resTime ?? now)) / 1000);
    this.resTime = now;
    for (const el of this.$('hud-res').children) {
      const resource = el.dataset.res;
      const target = Math.max(0, stock[resource] - (this.resHold[resource] ?? 0));
      let shown = this.resValue[resource] ?? target;
      if (shown !== target) {
        const diff = target - shown;
        const step = Math.sign(diff) * Math.max(dt * 30, Math.abs(diff) * Math.min(1, dt * 9));
        shown = Math.abs(step) >= Math.abs(diff) ? target : shown + step;
      }
      this.resValue[resource] = shown;
      if (target > (this.resTarget[resource] ?? target)) this.restartAnimation(el, 'bump');
      this.resTarget[resource] = target;
      const value = Math.round(shown);
      const key = `${value}/${cap}`;
      if (this.shownRes[resource] === key) continue;
      this.shownRes[resource] = key;
      el.querySelector('b').textContent = number.format(value);
      el.querySelector('small').textContent = `/${number.format(cap)}`;
      el.classList.toggle('is-full', value >= cap);
    }
  }

  /** Resource icons fly from a screen point into their counter; `onLand(i)` per icon. */
  flyResource(x, y, resource, amount, icon, onLand) {
    const counter = this.$('hud-res').querySelector(`[data-res="${resource}"]`);
    if (!counter || amount <= 0) return;
    const target = counter.getBoundingClientRect();
    const tx = target.left + 14;
    const ty = target.top + target.height / 2;
    const count = Math.min(4, Math.max(1, Math.round(amount / 3)));
    this.resHold[resource] = (this.resHold[resource] ?? 0) + amount;
    let landed = 0;
    const release = () => {
      if (landed >= count) return;
      landed++;
      onLand?.(landed - 1);
      if (landed === count) this.resHold[resource] = Math.max(0, (this.resHold[resource] ?? 0) - amount);
    };
    for (let i = 0; i < count; i++) {
      const el = this.resFlyers[this.resFlyCursor];
      this.resFlyCursor = (this.resFlyCursor + 1) % this.resFlyers.length;
      el.textContent = icon;
      const sx = x + (Math.random() - 0.5) * 26;
      const sy = y + (Math.random() - 0.5) * 16;
      el.classList.remove('is-flying');
      el.style.transitionDelay = `${i * 0.07}s`;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.transform = 'translate(0, 0) scale(1.15)';
      void el.offsetWidth;
      el.classList.add('is-flying');
      el.style.transform = `translate(${tx - sx}px, ${ty - sy}px) scale(0.75)`;
      // Timer rather than transitionend: it also fires when the page is hidden.
      setTimeout(() => {
        el.classList.remove('is-flying');
        el.style.transform = '';
        release();
      }, 700 + i * 70);
    }
  }

  setDay(text) {
    if (text !== this.shown.wave) {
      this.shown.wave = text;
      this.wave.textContent = text;
    }
  }

  setRealmBar(workersText, workersAlert, researchText, researchEnabled, researchAlert) {
    const workers = this.$('btn-workers');
    const research = this.$('btn-research');
    const key = `${workersText}|${workersAlert}|${researchText}|${researchEnabled}|${researchAlert}`;
    if (this.shown.realmBar === key) return;
    this.shown.realmBar = key;
    this.$('workers-label').textContent = workersText;
    workers.classList.toggle('is-alert', workersAlert);
    this.$('research-label').textContent = researchText;
    research.classList.toggle('is-alert', researchAlert);
    research.setAttribute('aria-disabled', String(!researchEnabled));
  }

  /**
   * @param items [{ id, name, image, cost, affordable, locked, lockText, blurb }]
   */
  openRealmBuild(items, pending, have) {
    this.closeSheets();
    this.renderRealmBuild(items, pending, have);
    this.realmBuildSheet.classList.add('is-open');
  }

  renderRealmBuild(items, pending, have, hint) {
    const grid = this.$('realm-build-grid');
    grid.replaceChildren();
    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `build-card${item.locked ? ' is-locked' : ''}${!item.locked && !item.affordable ? ' is-poor' : ''}${item.id === pending ? ' is-selected' : ''}`;
      card.dataset.item = item.id;
      card.innerHTML = `<img src="${item.image}" alt="">${item.locked ? '<span class="build-card__lock" aria-hidden="true">🔒</span>' : ''}
        <span class="build-card__name">${item.name}</span>
        <span class="build-card__costs">${item.locked ? item.lockText : this.costHtml(item.cost, have)}</span>`;
      card.setAttribute('aria-label', `${item.name}${item.locked ? ', verrouillé' : ''}`);
      card.addEventListener('click', () => this.handlers.realmBuildCard?.(item.id));
      grid.append(card);
    }
    const selected = items.find((item) => item.id === pending);
    this.$('realm-build-hint').textContent = hint ?? (selected
      ? `${selected.name} : ${selected.blurb} Touche encore pour construire.`
      : 'Touche un élément pour le voir, puis touche-le encore pour construire.');
  }

  denyRealmCard(id) {
    const card = this.$('realm-build-grid').querySelector(`[data-item="${id}"]`);
    if (card) this.restartAnimation(card, 'denied');
  }

  /**
   * @param info { image, name, level, levels, stats: [[label, value]], upgrade: { cost, affordable } | null,
   *               maxText, demolish: html, confirm, targeting: mode | null }
   */
  openRealmInfo(info, have) {
    if (!this.realmInfoSheet.classList.contains('is-open')) this.closeSheets();
    this.$('realm-info-image').src = info.image;
    this.$('realm-info-name').textContent = info.name;
    this.$('realm-info-level').innerHTML = Array.from({ length: info.levels }, (_, i) => `<i class="${i <= info.level ? 'on' : ''}"></i>`).join('');
    this.$('realm-info-stats').innerHTML = info.stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
    const targeting = this.$('realm-info-targeting');
    targeting.hidden = !info.targeting;
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
    for (const button of targeting.children) button.setAttribute('aria-pressed', String(button.dataset.mode === info.targeting));
    const work = this.$('realm-info-work');
    work.hidden = !info.work;
    if (info.work) {
      this.$('realm-info-work-fill').style.width = `${Math.round(info.work.fraction * 100)}%`;
      this.$('realm-info-work-text').textContent = info.work.text;
    }
    const extra = this.$('btn-realm-extra');
    extra.hidden = !info.extra;
    if (info.extra) {
      extra.innerHTML = `${info.extra.label} ${info.extra.cost ? this.costHtml(info.extra.cost, have) : ''}`;
      extra.disabled = !info.extra.enabled;
    }
    const upgrade = this.$('btn-realm-upgrade');
    upgrade.hidden = info.upgrade === false;
    if (info.upgrade) {
      upgrade.innerHTML = `${info.upgradeLabel ?? 'Améliorer'} ${this.costHtml(info.upgrade.cost, have)}`;
      upgrade.disabled = !info.upgrade.affordable;
    } else {
      upgrade.textContent = info.maxText ?? 'Niveau max';
      upgrade.disabled = true;
    }
    const demolish = this.$('btn-demolish');
    demolish.hidden = info.demolish === null;
    demolish.classList.toggle('btn--danger', info.confirm);
    demolish.classList.toggle('btn--ghost', !info.confirm);
    const verb = info.demolishLabel ?? 'Démolir';
    demolish.innerHTML = info.confirm ? `Confirmer ${info.demolish ?? ''}` : `${verb} ${info.demolish ?? ''}`;
    this.realmInfoSheet.classList.add('is-open');
  }

  /** @param rows [{ resource, name, icon, count, info, canAdd, canRemove }] */
  openWorkers(rows, idle, total, hint) {
    if (!this.workersSheet.classList.contains('is-open')) this.closeSheets();
    const list = this.$('jobs');
    list.replaceChildren();
    for (const row of rows) {
      const el = document.createElement('div');
      el.className = 'job';
      el.innerHTML = `<span class="job__icon" aria-hidden="true">${row.icon}</span>
        <span><span class="job__name">${row.name}</span><span class="job__info">${row.info}</span></span>`;
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'job__btn';
      minus.textContent = '−';
      minus.disabled = !row.canRemove;
      minus.setAttribute('aria-label', `Un ouvrier de moins sur ${row.name}`);
      minus.addEventListener('click', () => this.handlers.job?.(row.resource, -1));
      const count = document.createElement('span');
      count.className = 'job__count';
      count.textContent = row.count;
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'job__btn';
      plus.textContent = '+';
      plus.disabled = !row.canAdd;
      plus.setAttribute('aria-label', `Un ouvrier de plus sur ${row.name}`);
      plus.addEventListener('click', () => this.handlers.job?.(row.resource, 1));
      el.append(minus, count, plus);
      list.append(el);
    }
    const free = document.createElement('div');
    free.className = 'job job--idle';
    free.innerHTML = `<span class="job__icon" aria-hidden="true">💤</span>
      <span><span class="job__name">Libres</span><span class="job__info">${total} ouvrier${total > 1 ? 's' : ''} au total · une maison en loge 2 de plus</span></span>
      <span class="job__count">${idle}</span>`;
    list.append(free);
    if (hint) this.$('workers-hint').textContent = hint;
    this.workersSheet.classList.add('is-open');
  }

  /**
   * @param items [{ id, icon, name, effect, level, max, cost, affordable, locked }]
   */
  renderResearch(groups, tab, items, walletHtml, have) {
    this.$('research-wallet').innerHTML = walletHtml;
    const tabs = this.$('research-tabs');
    if (!tabs.childElementCount) {
      for (const group of groups) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab';
        button.setAttribute('role', 'tab');
        button.dataset.group = group;
        button.textContent = group;
        button.addEventListener('click', () => {
          this.researchTab = group;
          this.handlers.researchTab?.(group);
        });
        tabs.append(button);
      }
    }
    for (const button of tabs.children) button.setAttribute('aria-selected', String(button.dataset.group === tab));
    const list = this.$('research');
    list.replaceChildren();
    for (const item of items) {
      const maxed = item.level >= item.max;
      const row = document.createElement('div');
      row.className = `shop-item research-item${maxed ? ' is-maxed' : ''}`;
      row.innerHTML = `
        <span class="shop-item__art">${item.image ? `<img src="${item.image}" alt="">` : `<span aria-hidden="true">${item.icon}</span>`}</span>
        <span>
          <span class="shop-item__name">${item.name}</span>
          <span class="shop-item__blurb">${item.effect}</span>
          ${item.max > 1 ? `<span class="pips">${Array.from({ length: item.max }, (_, i) => `<i class="${i < item.level ? 'on' : ''}"></i>`).join('')}</span>` : ''}
        </span>
        <span class="shop-item__footer"></span>`;
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'btn btn--gold shop-item__buy';
      if (maxed) {
        buy.textContent = item.max > 1 ? '✓ Maximum' : '✓ Débloqué';
        buy.disabled = true;
      } else {
        buy.innerHTML = this.costHtml(item.cost, have);
        buy.disabled = !item.affordable;
        buy.setAttribute('aria-label', `Rechercher ${item.name}`);
        buy.addEventListener('click', () => this.handlers.researchBuy?.(item.id));
      }
      row.querySelector('.shop-item__footer').append(buy);
      list.append(row);
    }
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
