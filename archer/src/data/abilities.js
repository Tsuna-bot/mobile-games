// Abilities chosen during a run (1 of 3 at each level up). `max` = how many times it
// stacks; `apply(p)` changes the player's stats. Icons are emoji (rendered big in the UI).

export const ABILITIES = {
  front: { id: 'front', icon: 'front', name: 'Flèche frontale +1', text: 'Une flèche de plus devant (dégâts −10 %).', max: 3, apply: (p) => { p.front++; p.damageMul *= 0.9; } },
  multishot: { id: 'multishot', icon: 'multishot', name: 'Tir multiple', text: 'Tire une deuxième volée juste après (dégâts −10 %).', max: 2, apply: (p) => { p.multishot++; p.damageMul *= 0.9; } },
  diagonal: { id: 'diagonal', icon: 'diagonal', name: 'Flèches diagonales', text: '+2 flèches en diagonale.', max: 3, apply: (p) => { p.diagonal++; } },
  side: { id: 'side', icon: 'side', name: 'Flèches latérales', text: '+2 flèches sur les côtés.', max: 3, apply: (p) => { p.side++; } },
  rear: { id: 'rear', icon: 'rear', name: 'Flèche arrière', text: '+1 flèche vers l’arrière.', max: 3, apply: (p) => { p.rear++; } },
  bounce: { id: 'bounce', icon: 'bounce', name: 'Rebond mural', text: 'Les flèches rebondissent 2 fois sur les murs.', max: 1, apply: (p) => { p.wallBounce += 2; } },
  ricochet: { id: 'ricochet', icon: 'ricochet', name: 'Ricochet', text: 'La flèche saute vers un autre ennemi proche.', max: 3, apply: (p) => { p.ricochet++; } },
  pierce: { id: 'pierce', icon: 'pierce', name: 'Perçante', text: 'Les flèches traversent les ennemis (−33 % à chaque traversée).', max: 1, apply: (p) => { p.pierce = true; } },
  attack: { id: 'attack', icon: 'attack', name: 'Attaque +', text: 'Dégâts +25 %.', max: 6, apply: (p) => { p.damageMul *= 1.25; } },
  speed: { id: 'speed', icon: 'speed', name: 'Vitesse d’attaque +', text: 'Tire 25 % plus vite.', max: 5, apply: (p) => { p.rateMul *= 1.25; } },
  crit: { id: 'crit', icon: 'crit', name: 'Coup critique +', text: 'Chance de critique +10 %, dégâts critiques +40 %.', max: 4, apply: (p) => { p.crit += 0.1; p.critDamage += 0.4; } },
  vitality: { id: 'vitality', icon: 'vitality', name: 'Vie max +', text: 'Vie max +20 % (et soigne d’autant).', max: 5, apply: (p) => { const gain = Math.round(p.maxHp * 0.2); p.maxHp += gain; p.hp += gain; } },
  fire: { id: 'fire', icon: 'fire', name: 'Flèche de feu', text: 'Enflamme les ennemis (dégâts sur la durée).', max: 2, apply: (p) => { p.burn += 1; } },
  ice: { id: 'ice', icon: 'ice', name: 'Flèche de glace', text: 'Ralentit les ennemis, parfois les gèle.', max: 2, apply: (p) => { p.frost += 1; } },
  poison: { id: 'poison', icon: 'poison', name: 'Flèche de poison', text: 'Empoisonne (dégâts qui s’accumulent).', max: 2, apply: (p) => { p.poison += 1; } },
  bolt: { id: 'bolt', icon: 'bolt', name: 'Foudre', text: 'Chaque touche électrise 2 ennemis proches.', max: 2, apply: (p) => { p.bolt += 1; } },
  fireOrb: { id: 'fireOrb', icon: 'fireOrb', name: 'Orbe de feu', text: 'Une boule de feu tourne autour de toi.', max: 2, apply: (p) => { p.orbs.push('fire'); } },
  iceOrb: { id: 'iceOrb', icon: 'iceOrb', name: 'Orbe de glace', text: 'Une orbe glacée tourne autour de toi.', max: 2, apply: (p) => { p.orbs.push('ice'); } },
  boltOrb: { id: 'boltOrb', icon: 'boltOrb', name: 'Orbe de foudre', text: 'Une orbe électrique tourne autour de toi.', max: 2, apply: (p) => { p.orbs.push('bolt'); } },
  dodge: { id: 'dodge', icon: 'dodge', name: 'Esquive', text: '15 % de chances d’éviter un coup.', max: 3, apply: (p) => { p.dodge += 0.15; } },
  shield: { id: 'shield', icon: 'shield', name: 'Bouclier divin', text: 'Bloque un coup, se recharge toutes les 8 s.', max: 1, apply: (p) => { p.shieldMax = 8; p.shieldTimer = 0; } },
  bloodthirst: { id: 'bloodthirst', icon: 'bloodthirst', name: 'Soif de sang', text: 'Chaque ennemi abattu rend 1,5 % de vie.', max: 3, apply: (p) => { p.lifeOnKill += 0.015; } },
  deathBlast: { id: 'deathBlast', icon: 'deathBlast', name: 'Explosion fatale', text: 'Les ennemis explosent en mourant et blessent leurs voisins.', max: 2, apply: (p) => { p.deathBlast += 1; } },
  haste: { id: 'haste', icon: 'haste', name: 'Pas légers', text: 'Déplacement +15 %.', max: 2, apply: (p) => { p.speedMul *= 1.15; } },
  heal: { id: 'heal', icon: 'heal', name: 'Soin', text: 'Rend 40 % de la vie.', max: 99, apply: (p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); } },
};

export const ABILITY_ORDER = Object.keys(ABILITIES);

/**
 * Three different abilities still below their cap (heal only offered when hurt).
 * `taken` maps id → stacks; `random` is a [0, 1) source.
 */
export function rollAbilities(taken, random, hpShare = 1, count = 3) {
  const pool = ABILITY_ORDER.filter((id) => (taken[id] ?? 0) < ABILITIES[id].max && (id !== 'heal' || hpShare < 0.7));
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}
