import { writeSave } from '../core/storage.js';
import { badge, icon } from '../ui/icons.js';
import { LEGENDARY, MAX_STARS, RARITIES, SLOTS, awakenCost, canAwaken, itemStats, setOf, statLines, upgradeCost } from '../data/gear.js';
import { CHESTS, HEROES, HERO_ORDER, PETS, TALENTS } from '../data/meta.js';
import { CHAPTERS } from '../data/chapters.js';
import { ENEMIES } from '../data/enemies.js';
import { CLASSES, CLASS_LEVEL, CLASS_SWITCH_GEMS, HERO_SPELLS, MAX_HERO_LEVEL, MAX_SPELL_RANK, SPELLS, SPELL_UNLOCK, classOf, heroLevelStats, heroXpNeeded, rankCooldown, spellUpgradeCost } from '../data/heroes.js';
import { chooseClass, heroState, spellRank, spellUpgradeBlock, upgradeSpell } from '../meta/heroes.js';
import { ACHIEVEMENTS, BRANCHES, TIER_NEEDS, TREE, TREE_BY_ID, accountXpNeeded } from '../data/progression.js';
import {
  activeSets, awaken, buyHero, chestReady, equip, equippedSlotOf, grantChest, itemDef, merge, mergePartners, nextTalentCost, openChest, powerScore, rollTalent,
  runGear, salvage, salvageValue, selectHero, unequip, upgradeItem,
} from '../meta/profile.js';
import {
  achievementState, canLearn, claimAchievement, claimDailyBonus, claimMission, dailyBonusReady, ensureDaily, learn, missionDef, nodeOpen, questsReady,
  resetTree, treeFree, treePoints, treeSpent,
} from '../meta/progress.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function timeLeft(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

/**
 * The menu tabs: shop (chests), equipment (slots, inventory, item sheet with
 * upgrade / merge / equip / scrap), talents, heroes. The "Jouer" tab lives in Game.
 */
export class Menu {
  constructor(game) {
    this.game = game;
    this.tab = 'play';
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    for (const button of document.querySelectorAll('#nav [data-tab]')) {
      button.addEventListener('click', () => this.show(button.dataset.tab));
    }
    $('btn-talent').addEventListener('click', () => this.buyTalent());
    $('btn-quests').addEventListener('click', () => this.show('quests'));
    $('btn-map').addEventListener('click', () => this.openChapters());
    document.querySelector('#chapter-card .chapter-card__body').addEventListener('click', () => this.openChapters());
    $('btn-tree-reset').addEventListener('click', () => {
      if (!resetTree(this.save)) return;
      this.game.audio.click();
      this.persist();
      this.renderTalents();
    });
    this.talentView = 'tree';
    this.questView = 'daily';
    for (const button of document.querySelectorAll('#talent-tabs [data-view]')) {
      button.addEventListener('click', () => {
        this.talentView = button.dataset.view;
        this.game.audio.click();
        this.renderTalents();
      });
    }
    for (const button of document.querySelectorAll('#quest-tabs [data-view]')) {
      button.addEventListener('click', () => {
        this.questView = button.dataset.view;
        this.game.audio.click();
        this.renderQuests();
      });
    }
    $('popup').addEventListener('click', (e) => {
      if (e.target === $('popup')) this.closePopup();
    });
    // The free chest timer ticks in the shop.
    setInterval(() => {
      if (this.tab === 'shop' && this.game.mode === 'menu') this.renderShop();
      this.refreshBadges();
    }, 20000);
  }

  get save() {
    return this.game.save;
  }

  persist() {
    writeSave(this.save);
    this.refreshWallet();
    this.refreshBadges();
  }

  show(tab) {
    this.tab = tab;
    for (const button of document.querySelectorAll('#nav [data-tab]')) button.classList.toggle('is-active', button.dataset.tab === tab);
    for (const panel of document.querySelectorAll('.panel-view')) panel.classList.toggle('is-active', panel.id === `panel-${tab}`);
    if (tab === 'gear') this.renderGear();
    if (tab === 'talents') this.renderTalents();
    if (tab === 'heroes') this.renderHeroes();
    if (tab === 'shop') this.renderShop();
    if (tab === 'quests') this.renderQuests();
    this.game.audio.click();
    this.game.haptics.pulse(6);
  }

  refreshWallet() {
    const save = this.save;
    this.$('menu-coins').textContent = Math.floor(save.coins);
    this.$('menu-gems').textContent = save.gems;
    this.$('menu-power').textContent = powerScore(save);
    this.$('menu-level').textContent = save.account.level;
    this.$('menu-level-bar').style.width = `${Math.round(Math.min(1, save.account.xp / accountXpNeeded(save.account.level)) * 100)}%`;
  }

  refreshBadges() {
    const save = this.save;
    ensureDaily(save);
    const shop = document.querySelector('#nav [data-tab="shop"]');
    shop.classList.toggle('badge-dot', chestReady(save));
    const talents = document.querySelector('#nav [data-tab="talents"]');
    talents.classList.toggle('badge-dot', save.coins >= nextTalentCost(save) || treeFree(save) > 0);
    this.$('btn-quests').classList.toggle('badge-dot', questsReady(save));
    const heroes = document.querySelector('#nav [data-tab="heroes"]');
    const hid = save.heroes.selected;
    const hs = heroState(save, hid);
    heroes.classList.toggle('badge-dot', [0, 1, 2].some((slot) => !spellUpgradeBlock(save, hid, slot)) || (hs.level >= CLASS_LEVEL && !hs.cls));
    const gear = document.querySelector('#nav [data-tab="gear"]');
    gear.classList.toggle('badge-dot', save.inventory.some((it) => mergePartners(save, it.uid).length >= 2));
  }

  // ------------------------------------------------------------ equipment

  itemTile(item, { slotLabel = '', showEquipped = true } = {}) {
    const def = itemDef(item);
    const rarity = RARITIES[item.rarity];
    const equipped = showEquipped && equippedSlotOf(this.save, item.uid);
    const canMerge = mergePartners(this.save, item.uid).length >= 2;
    const stars = item.stars ? `<span class="item__stars">${icon('star').repeat(item.stars)}</span>` : '';
    return `<button type="button" class="item${item.rarity === 3 ? ' is-legendary' : ''}" data-uid="${item.uid}" style="--rarity:${rarity.color}" aria-label="${esc(def.name)}">
      ${slotLabel ? `<span class="item__slot">${slotLabel}</span>` : ''}${icon(def.icon, 'item__ico')}${stars}<span class="item__level">Niv. ${item.level}</span>${equipped ? `<span class="item__equipped">${icon('check')}</span>` : ''}${canMerge ? `<span class="item__merge">${icon('upgrade')}</span>` : ''}</button>`;
  }

  renderGear() {
    const save = this.save;
    const byUid = (uid) => save.inventory.find((it) => it.uid === uid);
    this.$('slots').innerHTML = SLOTS.map((slot) => {
      const item = byUid(save.equipped[slot.id]);
      return item ? this.itemTile(item, { slotLabel: slot.name, showEquipped: false }) : `<div class="item item--empty"><span class="item__slot">${slot.name}</span>${icon(slot.icon, 'item__ico')}</div>`;
    }).join('');
    const g = runGear(save);
    const pct = (v) => `${Math.round(v * 100)} %`;
    this.$('gear-stats').innerHTML = [
      ['Attaque', Math.round(85 + g.damage)],
      ['Vie', Math.round((600 + g.hp) * g.hpMul)],
      ['Cadence', `×${g.rateMul.toFixed(2)}`],
      ['Critique', pct(0.05 + g.crit)],
      ['Esquive', pct(g.dodge)],
      ['Protection', pct(g.armor)],
    ].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
    // Sets being worn and their bonuses.
    this.$('gear-sets').innerHTML = activeSets(save).map(({ set, count }) => `<div class="set" style="--set:${set.color}"><b>${set.name} <small>${count}/4</small></b>${set.bonuses.map(([need, text]) => `<span class="${count >= need ? 'is-on' : ''}">${need} pièces : ${text}</span>`).join('')}</div>`).join('');
    // Unequipped items, best first.
    const spare = save.inventory
      .filter((it) => !equippedSlotOf(save, it.uid))
      .sort((a, b) => b.rarity - a.rarity || b.level - a.level || a.base.localeCompare(b.base));
    this.$('inventory-count').textContent = `(${spare.length})`;
    // Loot piles up: one tap scraps every spare common item that cannot merge.
    const junk = spare.filter((it) => it.rarity === 0 && !(it.stars ?? 0) && mergePartners(save, it.uid).length < 2 && !PETS[it.base]);
    const recycle = this.$('btn-recycle');
    recycle.hidden = junk.length < 2;
    recycle.innerHTML = `${icon('reset')} Recycler ${junk.length} objets communs · <i class="coin-icon"></i> ${junk.reduce((a, it) => a + salvageValue(it), 0)}`;
    recycle.onclick = () => {
      let gold = 0;
      for (const it of junk) gold += salvage(save, it.uid);
      this.game.audio.coin();
      this.game.haptics.pulse([10, 20, 10]);
      this.persist();
      this.renderGear();
      this.game.ui.toast(`${icon('gold-bag')}<span>Recyclage : <b>+${gold}</b> or</span>`, '#ffc93c');
    };
    this.$('inventory').innerHTML = spare.length ? spare.map((it) => this.itemTile(it)).join('') : '<p class="panel-text" style="grid-column:1/-1;margin:0">Ouvre des coffres ou gagne des chapitres pour trouver de l’équipement.</p>';
    for (const el of document.querySelectorAll('#slots .item[data-uid], #inventory .item[data-uid]')) {
      el.addEventListener('click', () => this.openItem(Number(el.dataset.uid)));
    }
  }

  openItem(uid) {
    const save = this.save;
    const item = save.inventory.find((it) => it.uid === uid);
    if (!item) return;
    const def = itemDef(item);
    const rarity = RARITIES[item.rarity];
    const isPet = Boolean(PETS[item.base]);
    const equippedSlot = equippedSlotOf(save, uid);
    const stars = item.stars ?? 0;
    const lines = isPet ? [`Puissance ×${(rarity.mul * (1 + 0.08 * (item.level - 1)) * (1 + 0.15 * stars)).toFixed(2)}`] : statLines(itemStats(item));
    const next = item.level < rarity.cap ? (isPet ? [] : statLines(itemStats({ ...item, level: item.level + 1 }))) : [];
    // Set, legendary power, awakening.
    const set = isPet ? null : setOf(item.base);
    const setCount = set ? activeSets(save).find((a) => a.set === set)?.count ?? 0 : 0;
    const setBlock = set ? `<div class="popup__set" style="--set:${set.color}"><b>Ensemble ${set.name}${equippedSlot ? ` · ${setCount}/4` : ''}</b>${set.bonuses.map(([need, text]) => `<span class="${equippedSlot && setCount >= need ? 'is-on' : ''}">${need} pièces : ${text}</span>`).join('')}</div>` : '';
    const power = isPet ? null : LEGENDARY[item.base];
    const powerBlock = power ? `<div class="popup__power${item.rarity === 3 ? ' is-on' : ''}"><b>${icon('star')} ${power.name}</b><span>${item.rarity === 3 ? power.text : `Légendaire : ${power.text}`}</span></div>` : '';
    const starRow = `<span class="popup__stars">${Array.from({ length: MAX_STARS }, (_, i) => `<i class="${i < stars ? 'is-on' : ''}">${icon('star')}</i>`).join('')}</span>`;
    const partners = mergePartners(save, uid);
    const cost = item.level < rarity.cap ? upgradeCost(item) : null;
    const actions = [];
    if (cost !== null) actions.push(`<button type="button" class="btn btn--gold" data-act="upgrade" ${save.coins < cost ? 'disabled' : ''}>Niv. + <i class="coin-icon"></i>${cost}</button>`);
    else actions.push('<button type="button" class="btn" disabled>Niveau max</button>');
    if (equippedSlot) actions.push(`<button type="button" class="btn btn--ghost" data-act="unequip" ${equippedSlot === 'weapon' ? 'disabled' : ''}>Retirer</button>`);
    else actions.push('<button type="button" class="btn btn--primary" data-act="equip">Équiper</button>');
    if (item.rarity < RARITIES.length - 1) actions.push(`<button type="button" class="btn ${partners.length >= 2 ? 'btn--gold' : ''} btn--full" data-act="merge" ${partners.length >= 2 ? '' : 'disabled'}>Fusionner → ${RARITIES[item.rarity + 1].name} (${Math.min(2, partners.length) + 1}/3)</button>`);
    if (canAwaken(item)) {
      const cost = awakenCost(item);
      const ok = save.gems >= cost.gems && save.coins >= cost.coins;
      actions.push(`<button type="button" class="btn ${ok ? 'btn--gold' : ''} btn--full" data-act="awaken" ${ok ? '' : 'disabled'}>${icon('star')} Éveil ${stars + 1}/${MAX_STARS} · <i class="gem-icon"></i>${cost.gems} <i class="coin-icon"></i>${cost.coins}</button>`);
    } else if (item.rarity >= 2 && stars < MAX_STARS) actions.push(`<button type="button" class="btn btn--full" disabled>${icon('star')} Éveil au niveau ${rarity.cap}</button>`);
    if (equippedSlot !== 'weapon') actions.push(`<button type="button" class="btn btn--ghost btn--full" data-act="salvage">Démonter · +${salvageValue(item)} <i class="coin-icon"></i></button>`);
    this.openPopup(`
      <span class="popup__icon">${badge(def.icon, 'badge--xl')}</span>
      <span class="popup__rarity">${rarity.name} · niveau ${item.level}/${rarity.cap}</span>
      <h3 class="popup__name">${esc(def.name)}</h3>
      ${item.rarity >= 2 ? starRow : ''}
      <p class="popup__text">${esc(def.text)}</p>
      <div class="popup__stats">${lines.map((l) => `<span>${l}</span>`).join('')}${next.length ? `<span class="next">Niveau suivant : ${next.join(' · ')}</span>` : ''}</div>
      ${powerBlock}${setBlock}
      <div class="popup__actions">${actions.join('')}</div>`, rarity.color);
    for (const button of this.$('popup-card').querySelectorAll('[data-act]')) {
      button.addEventListener('click', () => this.itemAction(uid, button.dataset.act));
    }
  }

  itemAction(uid, act) {
    const save = this.save;
    const game = this.game;
    let ok = false;
    if (act === 'upgrade') ok = upgradeItem(save, uid);
    else if (act === 'equip') ok = equip(save, uid);
    else if (act === 'unequip') ok = unequip(save, uid);
    else if (act === 'merge') ok = Boolean(merge(save, uid));
    else if (act === 'salvage') ok = salvage(save, uid) > 0;
    else if (act === 'awaken') ok = awaken(save, uid);
    if (!ok) {
      game.audio.denied();
      return;
    }
    if (act === 'merge' || act === 'awaken') {
      game.audio.victory();
      game.haptics.pulse([20, 40, 20, 40, 60]);
    } else if (act === 'upgrade') {
      game.audio.upgrade();
      game.haptics.pulse(12);
    } else game.audio.click();
    this.persist();
    this.renderGear();
    if (act === 'salvage' || act === 'unequip' || act === 'equip') this.closePopup();
    else this.openItem(uid);
  }

  // ------------------------------------------------------------ talents

  renderTalents(highlight = null) {
    const view = this.talentView;
    for (const button of document.querySelectorAll('#talent-tabs [data-view]')) button.classList.toggle('is-active', button.dataset.view === view);
    this.$('view-tree').hidden = view !== 'tree';
    this.$('view-train').hidden = view !== 'train';
    if (view === 'tree') this.renderTree(highlight);
    else this.renderTraining(highlight);
  }

  /** The talent tree: three branches, five tiers; account levels give the points. */
  renderTree(highlight = null) {
    const save = this.save;
    const free = treeFree(save);
    this.$('tree-points').innerHTML = `Points disponibles : <b>${free}</b> · 1 point par niveau de compte (niveau ${save.account.level})`;
    this.$('tree').innerHTML = BRANCHES.map((branch) => {
      const spent = treeSpent(save, branch.id);
      const nodes = TREE.filter((n) => n.branch === branch.id).map((node) => {
        const rank = save.tree[node.id] ?? 0;
        const open = nodeOpen(save, node);
        const cls = ['node', rank ? 'is-learned' : '', rank >= node.max ? 'is-max' : '', !open ? 'is-closed' : '', canLearn(save, node.id) ? 'is-ready' : '', highlight === node.id ? 'is-new' : ''].join(' ');
        return `<button type="button" class="${cls}" data-node="${node.id}">${open ? icon(node.icon) : icon('lock')}<small>${node.name}</small><em>${rank}/${node.max}</em>${!open ? `<i class="node__need">${TIER_NEEDS[node.tier - 1]} pts</i>` : ''}</button>`;
      }).join('');
      return `<div class="branch" style="--branch:${branch.color}"><b class="branch__name">${branch.name} <small>${spent}</small></b>${nodes}</div>`;
    }).join('');
    for (const el of this.$('tree').querySelectorAll('[data-node]')) el.addEventListener('click', () => this.openNode(el.dataset.node));
    this.$('btn-tree-reset').disabled = !treeSpent(save);
  }

  openNode(id) {
    const save = this.save;
    const node = TREE_BY_ID[id];
    const branch = BRANCHES.find((b) => b.id === node.branch);
    const rank = save.tree[id] ?? 0;
    const open = nodeOpen(save, node);
    const now = rank ? node.text(rank) : '—';
    const next = rank < node.max ? node.text(rank + 1) : null;
    let button;
    if (rank >= node.max) button = '<button type="button" class="btn" disabled>Maximum</button>';
    else if (!open) button = `<button type="button" class="btn" disabled>${icon('lock')} ${TIER_NEEDS[node.tier - 1]} points en ${branch.name}</button>`;
    else button = `<button type="button" class="btn btn--gold" data-learn ${canLearn(save, id) ? '' : 'disabled'}>Apprendre · 1 point</button>`;
    this.openPopup(`
      <span class="popup__icon">${badge(node.icon, 'badge--xl')}</span>
      <span class="popup__rarity">${branch.name} · palier ${node.tier}</span>
      <h3 class="popup__name">${node.name}</h3>
      <div class="popup__stats"><span>Actuel : ${now}</span>${next ? `<span class="next">Rang ${rank + 1} : ${next}</span>` : ''}</div>
      <div class="popup__actions">${button}<button type="button" class="btn btn--ghost" data-close>Fermer</button></div>`, branch.color);
    this.$('popup-card').querySelector('[data-close]').addEventListener('click', () => this.closePopup());
    this.$('popup-card').querySelector('[data-learn]')?.addEventListener('click', () => {
      if (!learn(save, id)) {
        this.game.audio.denied();
        return;
      }
      this.game.audio.upgrade();
      this.game.haptics.pulse([12, 40, 12]);
      this.persist();
      this.renderTree(id);
      this.openNode(id);
    });
  }

  renderTraining(highlight = null) {
    const save = this.save;
    this.$('talents').innerHTML = TALENTS.map((t) => {
      const n = save.talents[t.id] ?? 0;
      return `<div class="talent${highlight === t.id ? ' is-new' : ''}">${badge(t.icon)}<b>${t.name}</b><small>${n ? t.text(n) : '—'}</small><em>${n}/${t.max}</em></div>`;
    }).join('');
    const cost = nextTalentCost(save);
    const done = TALENTS.every((t) => (save.talents[t.id] ?? 0) >= t.max);
    const button = this.$('btn-talent');
    button.innerHTML = done ? 'Tout est au maximum' : `Améliorer · <i class="coin-icon"></i> ${cost}`;
    button.disabled = done || save.coins < cost;
  }

  buyTalent() {
    const talent = rollTalent(this.save);
    if (!talent) {
      this.game.audio.denied();
      return;
    }
    this.game.audio.upgrade();
    this.game.haptics.pulse([12, 40, 12]);
    this.persist();
    this.renderTalents(talent.id);
  }

  // ------------------------------------------------------------ quests

  missionGoal(id) {
    return missionDef(id)?.goal;
  }

  /** Daily missions (and their bonus chest) or achievements. */
  renderQuests() {
    const save = this.save;
    const view = this.questView;
    for (const button of document.querySelectorAll('#quest-tabs [data-view]')) button.classList.toggle('is-active', button.dataset.view === view);
    const reward = (r) => [r.gems ? `<i class="gem-icon"></i>${r.gems}` : '', r.coins ? `<i class="coin-icon"></i>${r.coins}` : ''].join(' ');
    const bar = (value, goal) => `<span class="quest__bar"><i style="width:${Math.round(Math.min(1, value / goal) * 100)}%"></i></span><small>${Math.min(value, goal)} / ${goal}</small>`;
    let html;
    if (view === 'daily') {
      const daily = ensureDaily(save);
      html = daily.missions.map((m) => {
        const def = missionDef(m.id);
        const done = m.progress >= def.goal;
        const button = m.claimed ? `<button type="button" class="btn" disabled>${icon('check')}</button>` : `<button type="button" class="btn ${done ? 'btn--gold' : ''}" data-mission="${m.id}" ${done ? '' : 'disabled'}>${reward(def.reward)}</button>`;
        return `<div class="quest${m.claimed ? ' is-done' : ''}">${badge('calendar')}<div><b>${def.text}</b>${bar(m.progress, def.goal)}</div>${button}</div>`;
      }).join('');
      const all = daily.missions.every((m) => m.claimed);
      html += `<div class="quest quest--bonus${daily.bonus ? ' is-done' : ''}">${badge('chest-gold')}<div><b>Les 3 missions du jour</b><small>Un coffre doré en récompense</small></div><button type="button" class="btn ${all && !daily.bonus ? 'btn--gold' : ''}" data-bonus ${dailyBonusReady(save) ? '' : 'disabled'}>${daily.bonus ? icon('check') : 'Ouvrir'}</button></div>`;
      html += '<p class="panel-text" style="margin:2px 0 0;text-align:center">Nouvelles missions chaque jour.</p>';
    } else {
      html = ACHIEVEMENTS.map((a) => {
        const st = achievementState(save, a);
        const tiers = `<span class="quest__tiers">${a.goals.map((_, i) => `<i class="${i < st.claimed ? 'is-on' : ''}"></i>`).join('')}</span>`;
        const button = st.done ? `<button type="button" class="btn" disabled>${icon('check')}</button>` : `<button type="button" class="btn ${st.ready ? 'btn--gold' : ''}" data-achievement="${a.id}" ${st.ready ? '' : 'disabled'}><i class="gem-icon"></i>${st.gems}</button>`;
        return `<div class="quest${st.done ? ' is-done' : ''}">${badge(a.icon)}<div><b>${a.name} ${tiers}</b><small class="quest__text">${a.text(st.goal)}</small>${bar(st.value, st.goal)}</div>${button}</div>`;
      }).join('');
    }
    this.$('quests').innerHTML = html;
    for (const b of this.$('quests').querySelectorAll('[data-mission]')) b.addEventListener('click', () => this.claim(() => claimMission(save, b.dataset.mission)));
    for (const b of this.$('quests').querySelectorAll('[data-achievement]')) b.addEventListener('click', () => this.claim(() => claimAchievement(save, b.dataset.achievement)));
    this.$('quests').querySelector('[data-bonus]')?.addEventListener('click', () => {
      const bonus = claimDailyBonus(save);
      if (!bonus) return;
      const item = grantChest(save, bonus.chest);
      this.persist();
      this.renderQuests();
      if (item) this.revealItem(item, 'Récompense du jour');
    });
  }

  claim(action) {
    const reward = action();
    if (!reward) {
      this.game.audio.denied();
      return;
    }
    this.game.audio.coin();
    this.game.haptics.pulse([15, 30, 15]);
    this.persist();
    this.renderQuests();
  }

  // ------------------------------------------------------------ heroes

  renderHeroes() {
    const save = this.save;
    if (!HEROES[this.heroView]) this.heroView = save.heroes.selected;
    this.$('heroes').innerHTML = HERO_ORDER.map((id) => {
      const hero = HEROES[id];
      const owned = save.heroes.owned.includes(id);
      const selected = save.heroes.selected === id;
      const viewed = this.heroView === id;
      const level = heroState(save, id).level;
      const face = badge(`hero-${id}`, 'badge--lg');
      return `<button type="button" class="hero-card${selected ? ' is-selected' : ''}${viewed ? ' is-viewed' : ''}${owned ? '' : ' is-locked'}" data-view-hero="${id}" style="--hero:#${hero.cape.toString(16).padStart(6, '0')}"><span class="hero-card__face">${face}${owned ? `<span class="hero-card__level">${level}</span>` : `<span class="hero-card__level hero-card__level--lock">${icon('lock')}</span>`}</span><b>${hero.name}</b></button>`;
    }).join('');
    for (const card of this.$('heroes').querySelectorAll('[data-view-hero]')) {
      card.addEventListener('click', () => {
        if (this.heroView === card.dataset.viewHero) return;
        this.heroView = card.dataset.viewHero;
        this.game.audio.click();
        this.renderHeroes();
      });
    }
    this.renderHeroDetail();
  }

  /** The viewed hero: level, experience, the three spells (ranks) and the class. */
  renderHeroDetail() {
    const save = this.save;
    const id = this.heroView;
    const hero = HEROES[id];
    const h = heroState(save, id);
    const owned = save.heroes.owned.includes(id);
    const need = heroXpNeeded(h.level);
    const selected = save.heroes.selected === id;
    const pick = selected
      ? `<button type="button" class="btn btn--small" disabled>${icon('check')} Choisi</button>`
      : owned
        ? `<button type="button" class="btn btn--primary btn--small" data-hero="${id}">Jouer avec</button>`
        : `<button type="button" class="btn btn--gold btn--small" data-hero="${id}" ${save.gems < hero.price ? 'disabled' : ''}><i class="gem-icon"></i> ${hero.price}</button>`;
    const bonus = heroLevelStats(h.level);
    const spells = HERO_SPELLS[id].map((sid, slot) => {
      const def = SPELLS[sid];
      const rank = spellRank(save, id, slot);
      const shown = Math.max(1, rank);
      const pips = Array.from({ length: MAX_SPELL_RANK }, (_, i) => `<i class="${i < rank ? 'is-on' : ''}"></i>`).join('');
      let action;
      if (!rank) action = `<span class="spell-row__lock">${icon('level')} Niveau ${SPELL_UNLOCK[slot]}</span>`;
      else if (rank >= MAX_SPELL_RANK) action = '<span class="spell-row__lock">Rang max</span>';
      else {
        const cost = spellUpgradeCost(slot, rank);
        const block = owned ? spellUpgradeBlock(save, id, slot) : 'owned';
        const label = block === 'level' ? `Niv. ${cost.level} requis` : `<i class="coin-icon"></i>${cost.coins} · ${icon('rune')}${cost.runes}`;
        action = `<button type="button" class="btn btn--gold btn--small" data-spell="${slot}" ${block ? 'disabled' : ''}>${label}</button>`;
      }
      return `<div class="spell-row${rank ? '' : ' is-locked'}" style="--spell:${def.color}">
        <span class="spell-row__icon">${badge(def.icon, 'badge--md')}</span>
        <div class="spell-row__body"><b>${def.name}</b><span class="spell-row__pips">${pips}</span><small>${esc(def.text(shown))} Recharge ${Math.round(def.cd * rankCooldown(shown))} s.</small></div>
        ${action}</div>`;
    }).join('');
    const classes = CLASSES[id];
    let classHtml;
    if (h.level < CLASS_LEVEL) classHtml = `<p class="panel-text">${icon('classes')} Au niveau ${CLASS_LEVEL}, ${hero.name} choisit une classe : ${classes.map((c) => `<b>${c.name}</b>`).join(' ou ')}.</p>`;
    else {
      classHtml = `<div class="class-cards">${classes.map((c) => {
        const active = h.cls === c.id;
        const btn = active ? `<button type="button" class="btn" disabled>${icon('check')} Active</button>` : `<button type="button" class="btn ${h.cls ? 'btn--gold' : 'btn--primary'} btn--small" data-class="${c.id}" ${!owned || (h.cls && save.gems < CLASS_SWITCH_GEMS) ? 'disabled' : ''}>${h.cls ? `<i class="gem-icon"></i> ${CLASS_SWITCH_GEMS}` : 'Choisir'}</button>`;
        return `<div class="class-card${active ? ' is-active' : ''}">${badge(c.icon, 'badge--md')}<b>${c.name}</b><small>${esc(c.text)}</small>${btn}</div>`;
      }).join('')}</div>`;
    }
    this.$('hero-detail').innerHTML = `
      <div class="hero-sheet" style="--hero:#${hero.cape.toString(16).padStart(6, '0')}">
        <div class="hero-sheet__head">
          <span class="hero-sheet__level">${h.level}</span>
          <div class="hero-sheet__name"><b>${hero.name} · ${hero.role}</b><small>${esc(hero.text)}</small></div>
          ${pick}
        </div>
        <div class="hero-sheet__xp"><i style="width:${h.level >= MAX_HERO_LEVEL ? 100 : Math.round((h.xp / need) * 100)}%"></i><span>${h.level >= MAX_HERO_LEVEL ? 'Niveau max' : `${h.xp} / ${need} XP`}</span></div>
        <small class="hero-sheet__bonus">Bonus de niveau : attaque +${Math.round(bonus.damageMul * 100)} %, vie +${Math.round(bonus.hpMul * 100)} %${h.cls ? ` · Classe : ${classOf(id, h.cls).name}` : ''}</small>
      </div>
      <h3 class="panel-subtitle">Sorts <span class="runes-pill">${icon('rune')} ${save.runes} runes</span></h3>
      <div class="spell-list">${spells}</div>
      <h3 class="panel-subtitle">Classe</h3>
      ${classHtml}
      <p class="panel-text hero-sheet__tip">${owned ? 'Le héros gagne de l’expérience à chaque partie jouée avec lui. Les runes tombent des élites et des boss.' : `Recrute ${hero.name} pour le faire progresser.`}</p>`;
    this.$('hero-detail').querySelector('[data-hero]')?.addEventListener('click', () => this.pickHero(id));
    for (const button of this.$('hero-detail').querySelectorAll('[data-spell]')) {
      button.addEventListener('click', () => {
        if (!upgradeSpell(save, id, Number(button.dataset.spell))) {
          this.game.audio.denied();
          return;
        }
        this.game.audio.upgrade();
        this.game.haptics.pulse([15, 30, 15]);
        this.persist();
        this.renderHeroes();
        const row = this.$('hero-detail').querySelectorAll('.spell-row')[Number(button.dataset.spell)];
        row?.classList.add('is-bumped');
      });
    }
    for (const button of this.$('hero-detail').querySelectorAll('[data-class]')) {
      button.addEventListener('click', () => {
        if (!chooseClass(save, id, button.dataset.class)) {
          this.game.audio.denied();
          return;
        }
        this.game.audio.victory();
        this.game.haptics.pulse([20, 40, 20, 40, 60]);
        this.persist();
        this.renderHeroes();
      });
    }
  }

  pickHero(id) {
    const save = this.save;
    const owned = save.heroes.owned.includes(id);
    const ok = owned ? selectHero(save, id) : buyHero(save, id);
    this.heroView = id;
    if (!ok) {
      this.game.audio.denied();
      return;
    }
    if (!owned) {
      this.game.audio.victory();
      this.game.haptics.pulse([20, 40, 20, 40, 60]);
    } else this.game.audio.click();
    this.persist();
    this.renderHeroes();
    this.game.refreshMenuHero();
  }

  // ------------------------------------------------------------ chapter map

  /** Every chapter at a glance: done, record, locked; a tap goes there. */
  openChapters() {
    const save = this.save;
    const rows = CHAPTERS.map((c, i) => {
      const best = save.best[c.id] ?? 0;
      const heroic = (save.best[`${c.id}:heroic`] ?? 0) > 10;
      const locked = i > save.unlocked;
      const state = locked ? `${icon('lock')}` : best > 10 ? `${icon('check')}${heroic ? icon('heroic') : ''}` : best ? `${best}/10` : 'Nouveau';
      return `<button type="button" class="chapter-row${locked ? ' is-locked' : ''}${i === save.chapter ? ' is-current' : ''}${best > 10 ? ' is-done' : ''}" data-chapter="${i}" ${locked ? 'disabled' : ''}>
        <span class="chapter-row__num">${i + 1}</span><span class="chapter-row__name">${esc(c.name)}<small>Boss : ${esc(ENEMIES[c.boss]?.name ?? '')}</small></span><span class="chapter-row__state">${state}</span></button>`;
    }).join('');
    this.openPopup(`<h3 class="popup__name">Carte du monde</h3><div class="chapter-list">${rows}</div><div class="popup__actions"><button type="button" class="btn btn--ghost" data-close>Fermer</button></div>`, '#4fb4ff');
    const card = this.$('popup-card');
    card.classList.add('popup__card--list');
    card.querySelector('[data-close]').addEventListener('click', () => this.closePopup());
    for (const row of card.querySelectorAll('[data-chapter]')) {
      row.addEventListener('click', () => {
        this.closePopup();
        this.game.setChapter(Number(row.dataset.chapter));
      });
    }
    card.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
    this.game.audio.click();
  }

  // ------------------------------------------------------------ shop

  renderShop() {
    const save = this.save;
    const now = Date.now();
    const cards = Object.values(CHESTS).map((chest) => {
      let button;
      if (chest.cooldownHours) {
        const ready = chestReady(save, now);
        button = ready ? `<button type="button" class="btn btn--primary" data-chest="${chest.id}">Gratuit</button>` : `<button type="button" class="btn" disabled>${timeLeft(save.freeChestAt - now)}</button>`;
      } else button = `<button type="button" class="btn btn--gold" data-chest="${chest.id}" ${save.gems < chest.gems ? 'disabled' : ''}><i class="gem-icon"></i> ${chest.gems}</button>`;
      const odds = chest.odds.map((p, i) => (p ? `${RARITIES[i].name} ${Math.round(p * 100)} %` : null)).filter(Boolean).join(' · ');
      return `<div class="shop-card"><span class="shop-card__icon">${badge(chest.icon, 'badge--lg')}</span><div><b>${chest.name}</b><small>${chest.pet ? 'Un familier · ' : ''}${odds}</small></div>${button}</div>`;
    });
    cards.push(`<div class="shop-card"><span class="shop-card__icon">${badge('gold-bag', 'badge--lg')}</span><div><b>Sac d’or</b><small>600 pièces d’or</small></div><button type="button" class="btn btn--gold" data-gold="1" ${save.gems < 50 ? 'disabled' : ''}><i class="gem-icon"></i> 50</button></div>`);
    this.$('shop').innerHTML = cards.join('') + '<p class="panel-text" style="margin:4px 0 0;text-align:center">Les gemmes se gagnent en finissant les chapitres. Pas d’achats avec de l’argent réel.</p>';
    for (const button of this.$('shop').querySelectorAll('[data-chest]')) button.addEventListener('click', () => this.buyChest(button.dataset.chest));
    this.$('shop').querySelector('[data-gold]')?.addEventListener('click', () => {
      if (save.gems < 50) return;
      save.gems -= 50;
      save.coins += 600;
      this.game.audio.coin();
      this.persist();
      this.renderShop();
    });
  }

  buyChest(id) {
    const item = openChest(this.save, id);
    if (!item) {
      this.game.audio.denied();
      return;
    }
    this.persist();
    this.renderShop();
    this.revealItem(item, 'Nouvel objet !');
  }

  /** Chest / end-of-run reward reveal. */
  revealItem(item, title) {
    const def = itemDef(item);
    const rarity = RARITIES[item.rarity];
    const isPet = Boolean(PETS[item.base]);
    const lines = isPet ? [def.text] : statLines(itemStats(item));
    const canMerge = mergePartners(this.save, item.uid).length >= 2;
    this.openPopup(`
      <span class="popup__rarity">${title}</span>
      <span class="popup__icon">${badge(def.icon, 'badge--xl')}</span>
      <span class="popup__rarity">${rarity.name}</span>
      <h3 class="popup__name">${esc(def.name)}</h3>
      <div class="popup__stats">${lines.map((l) => `<span>${esc(l)}</span>`).join('')}${canMerge ? `<span class="next">${icon('upgrade')} Tu peux fusionner 3 exemplaires !</span>` : ''}</div>
      <div class="popup__actions"><button type="button" class="btn btn--ghost" data-close>OK</button><button type="button" class="btn btn--primary" data-see>Voir</button></div>`, rarity.color, true);
    this.$('popup-card').querySelector('[data-close]').addEventListener('click', () => this.closePopup());
    this.$('popup-card').querySelector('[data-see]').addEventListener('click', () => {
      this.closePopup();
      this.show('gear');
      this.openItem(item.uid);
    });
    this.game.audio.victory();
    this.game.haptics.pulse(item.rarity >= 2 ? [30, 40, 30, 40, 90] : [20, 40, 20]);
  }

  openPopup(html, color, reveal = false) {
    const card = this.$('popup-card');
    card.classList.remove('popup__card--list');
    card.style.setProperty('--rarity', color);
    card.classList.toggle('is-reveal', reveal);
    card.innerHTML = html;
    this.$('popup').hidden = false;
  }

  closePopup() {
    this.$('popup').hidden = true;
  }
}
