import { ICON_PATHS } from './iconPaths.js';

// Vector icons (game-icons.net, CC BY 3.0) installed once as an SVG sprite;
// `icon()` returns markup that references a symbol and takes the text colour.

// Colour family of each icon, used for the badges behind them.
const TONES = {
  gold: ['longbow', 'elite', 'star', 'level', 'quests', 'treasure', 'front', 'multishot', 'diagonal', 'side', 'rear', 'bounce', 'ricochet', 'pierce', 'attack', 'speed', 'crit', 'strength', 'power', 'bow', 'crossbow', 'blades', 'slot-weapon', 'chest-gold', 'gold-bag', 'looting', 'fortune', 'trophy', 'crown', 'upgrade'],
  fire: ['heroic', 'fire', 'fireOrb', 'deathBlast', 'rage', 'salamander'],
  ice: ['reset', 'calendar', 'ice', 'iceOrb', 'frostling', 'shield', 'guard', 'mail', 'slot-armor', 'hero-knight'],
  poison: ['tree', 'poison', 'recovery', 'luck', 'serpent', 'heal', 'life'],
  arcane: ['tome', 'shadowgarb', 'infinity', 'bolt', 'boltOrb', 'staff', 'robe', 'agility', 'bat', 'hero-mage', 'hero-assassin', 'shuriken', 'slot-amulet', 'chest-pet'],
  blood: ['fang', 'vitality', 'bloodthirst', 'vigor'],
  wind: ['dodge', 'haste', 'swift', 'falcon', 'owl', 'wolf', 'bear', 'leather', 'slot-pet', 'slot-ring', 'hero-ranger', 'hero-archer', 'chest-free'],
};
const TONE_OF = {};
for (const [tone, names] of Object.entries(TONES)) for (const name of names) TONE_OF[name] = tone;

export function installIcons() {
  if (document.getElementById('icon-sprite')) return;
  const symbols = Object.entries(ICON_PATHS).map(([name, d]) => `<symbol id="i-${name}" viewBox="0 0 512 512"><path d="${d}"/></symbol>`).join('');
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="icon-sprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${symbols}</svg>`;
  document.body.prepend(holder.firstChild);
}

/** An inline icon; `cls` adds classes (e.g. "ico--lg"). */
export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

/** An icon on a round, coloured, lit badge. */
export function badge(name, cls = '') {
  return `<span class="badge badge--${TONE_OF[name] ?? 'gold'} ${cls}">${icon(name)}</span>`;
}
