import { writeSave } from '../core/storage.js';
import { badge, icon } from '../ui/icons.js';
import { RARITIES, SLOTS, itemStats, statLines, upgradeCost } from '../data/gear.js';
import { CHESTS, HEROES, HERO_ORDER, PETS, TALENTS } from '../data/meta.js';
import {
  buyHero, chestReady, equip, equippedSlotOf, itemDef, merge, mergePartners, nextTalentCost, openChest, powerScore, rollTalent,
  runGear, salvage, salvageValue, selectHero, unequip, upgradeItem,
} from '../meta/profile.js';

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
    this.game.audio.click();
    this.game.haptics.pulse(6);
  }

  refreshWallet() {
    this.$('menu-coins').textContent = Math.floor(this.save.coins);
    this.$('menu-gems').textContent = this.save.gems;
    this.$('menu-power').textContent = powerScore(this.save);
  }

  refreshBadges() {
    const save = this.save;
    const shop = document.querySelector('#nav [data-tab="shop"]');
    shop.classList.toggle('badge-dot', chestReady(save));
    const talents = document.querySelector('#nav [data-tab="talents"]');
    talents.classList.toggle('badge-dot', save.coins >= nextTalentCost(save));
    const gear = document.querySelector('#nav [data-tab="gear"]');
    gear.classList.toggle('badge-dot', save.inventory.some((it) => mergePartners(save, it.uid).length >= 2));
  }

  // ------------------------------------------------------------ equipment

  itemTile(item, { slotLabel = '', showEquipped = true } = {}) {
    const def = itemDef(item);
    const rarity = RARITIES[item.rarity];
    const equipped = showEquipped && equippedSlotOf(this.save, item.uid);
    const canMerge = mergePartners(this.save, item.uid).length >= 2;
    return `<button type="button" class="item${item.rarity === 3 ? ' is-legendary' : ''}" data-uid="${item.uid}" style="--rarity:${rarity.color}" aria-label="${esc(def.name)}">
      ${slotLabel ? `<span class="item__slot">${slotLabel}</span>` : ''}${icon(def.icon, 'item__ico')}<span class="item__level">Niv. ${item.level}</span>${equipped ? `<span class="item__equipped">${icon('check')}</span>` : ''}${canMerge ? `<span class="item__merge">${icon('upgrade')}</span>` : ''}</button>`;
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
    // Unequipped items, best first.
    const spare = save.inventory
      .filter((it) => !equippedSlotOf(save, it.uid))
      .sort((a, b) => b.rarity - a.rarity || b.level - a.level || a.base.localeCompare(b.base));
    this.$('inventory-count').textContent = `(${spare.length})`;
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
    const lines = isPet ? [`Puissance ×${(rarity.mul * (1 + 0.08 * (item.level - 1))).toFixed(2)}`] : statLines(itemStats(item));
    const next = item.level < rarity.cap ? (isPet ? [] : statLines(itemStats({ ...item, level: item.level + 1 }))) : [];
    const equippedSlot = equippedSlotOf(save, uid);
    const partners = mergePartners(save, uid);
    const cost = item.level < rarity.cap ? upgradeCost(item) : null;
    const actions = [];
    if (cost !== null) actions.push(`<button type="button" class="btn btn--gold" data-act="upgrade" ${save.coins < cost ? 'disabled' : ''}>Niv. + <i class="coin-icon"></i>${cost}</button>`);
    else actions.push('<button type="button" class="btn" disabled>Niveau max</button>');
    if (equippedSlot) actions.push(`<button type="button" class="btn btn--ghost" data-act="unequip" ${equippedSlot === 'weapon' ? 'disabled' : ''}>Retirer</button>`);
    else actions.push('<button type="button" class="btn btn--primary" data-act="equip">Équiper</button>');
    if (item.rarity < RARITIES.length - 1) actions.push(`<button type="button" class="btn ${partners.length >= 2 ? 'btn--gold' : ''} btn--full" data-act="merge" ${partners.length >= 2 ? '' : 'disabled'}>Fusionner → ${RARITIES[item.rarity + 1].name} (${Math.min(2, partners.length) + 1}/3)</button>`);
    if (equippedSlot !== 'weapon') actions.push(`<button type="button" class="btn btn--ghost btn--full" data-act="salvage">Démonter · +${salvageValue(item)} <i class="coin-icon"></i></button>`);
    this.openPopup(`
      <span class="popup__icon">${badge(def.icon, 'badge--xl')}</span>
      <span class="popup__rarity">${rarity.name} · niveau ${item.level}/${rarity.cap}</span>
      <h3 class="popup__name">${esc(def.name)}</h3>
      <p class="popup__text">${esc(def.text)}</p>
      <div class="popup__stats">${lines.map((l) => `<span>${l}</span>`).join('')}${next.length ? `<span class="next">Niveau suivant : ${next.join(' · ')}</span>` : ''}</div>
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
    if (!ok) {
      game.audio.denied();
      return;
    }
    if (act === 'merge') {
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

  // ------------------------------------------------------------ heroes

  renderHeroes() {
    const save = this.save;
    this.$('heroes').innerHTML = HERO_ORDER.map((id) => {
      const hero = HEROES[id];
      const owned = save.heroes.owned.includes(id);
      const selected = save.heroes.selected === id;
      const face = badge(`hero-${id}`, 'badge--lg');
      const button = selected
        ? `<button type="button" class="btn" disabled>${icon('check')} Choisi</button>`
        : owned
          ? `<button type="button" class="btn btn--primary" data-hero="${id}">Choisir</button>`
          : `<button type="button" class="btn btn--gold" data-hero="${id}" ${save.gems < hero.price ? 'disabled' : ''}><i class="gem-icon"></i> ${hero.price}</button>`;
      return `<div class="hero-card${selected ? ' is-selected' : ''}" style="--hero:#${hero.cape.toString(16).padStart(6, '0')}"><span class="hero-card__face">${face}</span><b>${hero.name}</b><small>${hero.role} · ${hero.text}</small>${button}</div>`;
    }).join('');
    for (const button of this.$('heroes').querySelectorAll('[data-hero]')) {
      button.addEventListener('click', () => this.pickHero(button.dataset.hero));
    }
  }

  pickHero(id) {
    const save = this.save;
    const owned = save.heroes.owned.includes(id);
    const ok = owned ? selectHero(save, id) : buyHero(save, id);
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
    card.style.setProperty('--rarity', color);
    card.classList.toggle('is-reveal', reveal);
    card.innerHTML = html;
    this.$('popup').hidden = false;
  }

  closePopup() {
    this.$('popup').hidden = true;
  }
}
