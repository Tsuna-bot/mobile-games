// Progression between runs, on the save object: inventory, equipment, chests,
// upgrades, merges, talents, heroes, pets. Pure functions (no DOM), testable in Node.

import { BASES, BASE_IDS, RARITIES, SLOTS, itemStats, upgradeCost } from '../data/gear.js';
import { CHESTS, HEROES, PETS, TALENTS, petPower, talentCost } from '../data/meta.js';

const HOUR = 3600 * 1000;

/** Fills in the progression fields of a save (new player or older save). */
export function ensureProfile(save) {
  if (!Array.isArray(save.inventory)) save.inventory = [];
  if (!save.equipped || typeof save.equipped !== 'object') save.equipped = {};
  if (!save.talents || typeof save.talents !== 'object') save.talents = {};
  if (!Number.isFinite(save.talentRolls)) save.talentRolls = 0;
  if (!save.heroes || !Array.isArray(save.heroes.owned)) save.heroes = { owned: ['archer'], selected: 'archer' };
  if (!Number.isFinite(save.nextUid)) save.nextUid = 1;
  if (!Number.isFinite(save.freeChestAt)) save.freeChestAt = 0;
  // Drop anything the game no longer knows.
  save.inventory = save.inventory.filter((it) => it && (BASES[it.base] || PETS[it.base]) && RARITIES[it.rarity]);
  for (const it of save.inventory) it.level = Math.max(1, Math.min(RARITIES[it.rarity].cap, Math.floor(it.level) || 1));
  for (const [slot, uid] of Object.entries(save.equipped)) if (!save.inventory.some((it) => it.uid === uid)) delete save.equipped[slot];
  save.heroes.owned = save.heroes.owned.filter((id) => HEROES[id]);
  if (!save.heroes.owned.includes('archer')) save.heroes.owned.unshift('archer');
  if (!save.heroes.owned.includes(save.heroes.selected)) save.heroes.selected = 'archer';
  // Starting kit.
  if (!save.inventory.length) {
    equip(save, addItem(save, 'bow', 0).uid);
    equip(save, addItem(save, 'leather', 0).uid);
  }
  return save;
}

export function addItem(save, base, rarity, level = 1) {
  const item = { uid: save.nextUid++, base, rarity, level };
  save.inventory.push(item);
  return item;
}

export function itemDef(item) {
  return BASES[item.base] ?? { ...PETS[item.base], slot: 'pet' };
}

export function slotKind(slotId) {
  return SLOTS.find((s) => s.id === slotId)?.kind ?? slotId;
}

export function equippedSlotOf(save, uid) {
  return Object.entries(save.equipped).find(([, id]) => id === uid)?.[0] ?? null;
}

/** Equips an item in its slot (rings: the free ring slot, else the first). */
export function equip(save, uid) {
  const item = save.inventory.find((it) => it.uid === uid);
  if (!item) return false;
  const kind = itemDef(item).slot;
  if (equippedSlotOf(save, uid)) return true;
  let slot = kind;
  if (kind === 'ring') slot = !save.equipped.ring1 ? 'ring1' : !save.equipped.ring2 ? 'ring2' : 'ring1';
  save.equipped[slot] = uid;
  return true;
}

export function unequip(save, uid) {
  const slot = equippedSlotOf(save, uid);
  if (!slot || slot === 'weapon') return false; // always keep a weapon
  delete save.equipped[slot];
  return true;
}

export function rollRarity(odds, random) {
  let r = random();
  for (let i = 0; i < odds.length; i++) {
    if (r < odds[i]) return i;
    r -= odds[i];
  }
  return 0;
}

export function rollItem(save, odds, random, pet = false) {
  const pool = pet ? Object.keys(PETS) : BASE_IDS;
  const base = pool[Math.floor(random() * pool.length)];
  return addItem(save, base, rollRarity(odds, random));
}

export function chestReady(save, now = Date.now()) {
  return now >= save.freeChestAt;
}

/** Opens a chest: returns the item, or null when not affordable / not ready. */
export function openChest(save, chestId, random = Math.random, now = Date.now()) {
  const chest = CHESTS[chestId];
  if (!chest) return null;
  if (chest.cooldownHours) {
    if (!chestReady(save, now)) return null;
    save.freeChestAt = now + chest.cooldownHours * HOUR;
  } else {
    if (save.gems < chest.gems) return null;
    save.gems -= chest.gems;
  }
  return rollItem(save, chest.odds, random, Boolean(chest.pet));
}

export function upgradeItem(save, uid) {
  const item = save.inventory.find((it) => it.uid === uid);
  if (!item || item.level >= RARITIES[item.rarity].cap) return false;
  const cost = upgradeCost(item);
  if (save.coins < cost) return false;
  save.coins -= cost;
  item.level++;
  return true;
}

/** Two more copies (same base, same rarity) are needed to merge into the next rarity. */
export function mergePartners(save, uid) {
  const item = save.inventory.find((it) => it.uid === uid);
  if (!item || item.rarity >= RARITIES.length - 1) return [];
  // Spare copies first, equipped ones last.
  return save.inventory
    .filter((it) => it.uid !== uid && it.base === item.base && it.rarity === item.rarity)
    .sort((a, b) => Number(Boolean(equippedSlotOf(save, a.uid))) - Number(Boolean(equippedSlotOf(save, b.uid))) || b.level - a.level)
    .slice(0, 2);
}

export function merge(save, uid) {
  const item = save.inventory.find((it) => it.uid === uid);
  const partners = mergePartners(save, uid);
  if (!item || partners.length < 2) return null;
  const level = Math.max(item.level, ...partners.map((p) => p.level));
  // Partners leave; their slots go to the merged item if it was not equipped.
  // An equipped partner hands its slot to the merged item.
  for (const p of partners) {
    const slot = equippedSlotOf(save, p.uid);
    if (!slot) continue;
    delete save.equipped[slot];
    if (!equippedSlotOf(save, uid)) save.equipped[slot] = uid;
  }
  save.inventory = save.inventory.filter((it) => !partners.includes(it));
  item.rarity++;
  item.level = Math.min(level, RARITIES[item.rarity].cap);
  return item;
}

/** Scrapping gives back gold (never the equipped weapon). */
export function salvageValue(item) {
  return Math.round(15 * (item.rarity + 1) ** 2 + item.level * 8 * (item.rarity + 1));
}

export function salvage(save, uid) {
  const item = save.inventory.find((it) => it.uid === uid);
  if (!item || save.equipped.weapon === uid) return 0;
  const slot = equippedSlotOf(save, uid);
  if (slot) delete save.equipped[slot];
  save.inventory = save.inventory.filter((it) => it !== item);
  const gold = salvageValue(item);
  save.coins += gold;
  return gold;
}

// ------------------------------------------------------------ talents

export function nextTalentCost(save) {
  return talentCost(save.talentRolls);
}

/** Buys a random talent level; returns the talent, or null. */
export function rollTalent(save, random = Math.random) {
  const pool = TALENTS.filter((t) => (save.talents[t.id] ?? 0) < t.max);
  const cost = nextTalentCost(save);
  if (!pool.length || save.coins < cost) return null;
  save.coins -= cost;
  save.talentRolls++;
  const talent = pool[Math.floor(random() * pool.length)];
  save.talents[talent.id] = (save.talents[talent.id] ?? 0) + 1;
  return talent;
}

// ------------------------------------------------------------ heroes

export function buyHero(save, id) {
  const hero = HEROES[id];
  if (!hero || save.heroes.owned.includes(id) || save.gems < hero.price) return false;
  save.gems -= hero.price;
  save.heroes.owned.push(id);
  save.heroes.selected = id;
  return true;
}

export function selectHero(save, id) {
  if (!save.heroes.owned.includes(id)) return false;
  save.heroes.selected = id;
  return true;
}

// ------------------------------------------------------------ run stats

/** Everything the equipment, talents, hero and pet give, in the Run's `gear` format. */
export function runGear(save) {
  const gear = { damage: 0, hp: 0, hpMul: 1, rateMul: 1, speedMul: 1, crit: 0, critDamage: 0, dodge: 0, armor: 0, bossDamage: 0, healOnRoom: 0, coinMul: 1, bolt: 0 };
  const add = (stats) => {
    for (const [key, value] of Object.entries(stats)) {
      if (key === 'rateMul' || key === 'speedMul' || key === 'coinMul' || key === 'hpMul') gear[key] += value;
      else gear[key] = (gear[key] ?? 0) + value;
    }
  };
  for (const [slot, uid] of Object.entries(save.equipped)) {
    const item = save.inventory.find((it) => it.uid === uid);
    if (!item) continue;
    if (slot === 'pet') {
      const pet = PETS[item.base];
      gear.pet = { ...pet, power: petPower(RARITIES[item.rarity].mul, item.level) };
      continue;
    }
    add(itemStats(item));
    if (slot === 'weapon') gear.weapon = BASES[item.base].weapon;
  }
  for (const talent of TALENTS) {
    const n = save.talents[talent.id] ?? 0;
    if (n) add(talent.stats(n));
  }
  const hero = HEROES[save.heroes.selected] ?? HEROES.archer;
  add(hero.stats);
  gear.hero = hero;
  gear.armor = Math.min(0.6, gear.armor);
  gear.dodge = Math.min(0.5, gear.dodge);
  return gear;
}

/** A single "power" number for the menu (like the original's). */
export function powerScore(save) {
  const g = runGear(save);
  const attack = (85 + g.damage) * g.rateMul * (1 + g.crit);
  const life = (600 + g.hp) * g.hpMul / (1 - g.armor);
  return Math.round(attack * 4 + life * 0.6);
}

/** End of run: an item drop on a win (and sometimes after a good run). */
export function runDrop(save, chapterIndex, won, room, random = Math.random) {
  if (!won && (room < 6 || random() > 0.5)) return null;
  const odds = won
    ? [[0.75, 0.25, 0, 0], [0.55, 0.38, 0.07, 0], [0.35, 0.47, 0.16, 0.02]][chapterIndex] ?? [0.3, 0.45, 0.2, 0.05]
    : [0.9, 0.1, 0, 0];
  return rollItem(save, odds, random, random() < 0.15);
}
