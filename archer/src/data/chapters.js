// Chapters: a theme, room layouts and which monsters appear in each room.
// Layout legend (9 × 15, top row = the door side): '.' floor, '#' block (stops
// walking and arrows), '~' water / pit (stops walking, arrows fly over).

export const LAYOUTS = [
  [
    '.........', '.........', '.........', '.........', '.........',
    '.........', '..#...#..', '.........', '.........', '.........',
    '.........', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '.##...##.', '.........', '.........',
    '....#....', '....#....', '.........', '.........', '.##...##.',
    '.........', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '.........', '..~~~~~..', '.........',
    '.........', '#.......#', '#...#...#', '.........', '.........',
    '..~~~~~..', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '.#.....#.', '.#.....#.', '.........',
    '...###...', '.........', '.........', '.........', '...###...',
    '.........', '.#.....#.', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '.........', '~~~...~~~', '.........',
    '.........', '..#.#.#..', '.........', '.........', '.........',
    '~~.....~~', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '#.......#', '##.....##', '.........',
    '.........', '...#.#...', '....#....', '...#.#...', '.........',
    '.........', '##.....##', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '..#...#..', '.........', '~~.....~~',
    '~~.....~~', '.........', '...#.#...', '.........', '.........',
    '...~~~...', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '.........', '.#.#.#.#.', '.........',
    '.........', '.........', '.#.#.#.#.', '.........', '.........',
    '.........', '.........', '.........', '.........', '.........',
  ],
];

// Boss rooms are open: room to dodge.
export const BOSS_LAYOUT = [
  '.........', '.........', '.........', '.........', '.#.....#.',
  '.........', '.........', '.........', '.........', '.........',
  '.#.....#.', '.........', '.........', '.........', '.........',
];

/**
 * rooms[i] = monsters of room i+1: [type, count]... Room 5 holds an elite, room 10 the boss.
 * `hp` scales every monster of the chapter.
 */
export const ALL_CHAPTERS = [
  {
    id: 'forest',
    name: 'Forêt des murmures',
    theme: 'forest',
    hp: 1,
    boss: 'ogre',
    rooms: [
      [['zombie', 3]],
      [['zombie', 3], ['skeleton', 1]],
      [['skeleton', 2], ['zombie', 2]],
      [['orc', 1], ['zombie', 3]],
      [['orc', 2], ['skeleton', 2]],
      [['wisp', 6], ['skeleton', 1]],
      [['orc', 2], ['zombie', 3]],
      [['skeleton', 3], ['bomber', 1]],
      [['orc', 2], ['bomber', 2], ['zombie', 2]],
      [['ogre', 1]],
    ],
  },
  {
    id: 'dungeon',
    name: 'Ruines oubliées',
    theme: 'dungeon',
    hp: 2.3,
    boss: 'skeletonKing',
    rooms: [
      [['skeleton', 3], ['zombie', 2]],
      [['bomber', 2], ['orc', 1]],
      [['keeper', 1], ['zombie', 3]],
      [['skeleton', 3], ['orc', 2]],
      [['keeper', 2], ['bomber', 1]],
      [['wisp', 8], ['keeper', 1]],
      [['orc', 3], ['skeleton', 2]],
      [['bomber', 2], ['keeper', 1], ['zombie', 2]],
      [['orc', 2], ['skeleton', 3], ['keeper', 1]],
      [['skeletonKing', 1]],
    ],
  },
  {
    id: 'graveyard',
    name: 'Cimetière maudit',
    theme: 'graveyard',
    hp: 3.2,
    boss: 'count',
    rooms: [
      [['ghost', 3], ['zombie', 1]],
      [['vampire', 1], ['skeleton', 2]],
      [['ghost', 3], ['keeper', 1]],
      [['vampire', 2], ['wisp', 5]],
      [['keeper', 2], ['orc', 2]],
      [['vampire', 2], ['ghost', 3]],
      [['bomber', 2], ['vampire', 1], ['skeleton', 2]],
      [['keeper', 2], ['ghost', 4]],
      [['vampire', 3], ['orc', 2], ['wisp', 4]],
      [['count', 1]],
    ],
  },
  {
    id: 'mines',
    name: 'Mines de cristal',
    theme: 'mines',
    hp: 4.4,
    boss: 'crystal',
    rooms: [
      [['blob', 2], ['zombie', 2]],
      [['skeleton', 3], ['ghost', 2]],
      [['blob', 3], ['keeper', 1]],
      [['orc', 2], ['skeleton', 2], ['wisp', 4]],
      [['vampire', 2], ['blob', 2]],
      [['wisp', 8], ['keeper', 1], ['ghost', 2]],
      [['orc', 3], ['blob', 2]],
      [['bomber', 2], ['vampire', 1], ['skeleton', 2]],
      [['orc', 2], ['keeper', 2], ['blob', 2]],
      [['crystal', 1]],
    ],
  },
  {
    id: 'tundra',
    name: 'Toundra gelée',
    theme: 'tundra',
    hp: 5.8,
    boss: 'yeti',
    rooms: [
      [['zombie', 4], ['skeleton', 1]],
      [['orc', 2], ['ghost', 2]],
      [['skeleton', 3], ['keeper', 1], ['wisp', 3]],
      [['orc', 3], ['bomber', 1]],
      [['vampire', 2], ['ghost', 3]],
      [['wisp', 10], ['orc', 1]],
      [['keeper', 2], ['skeleton', 3]],
      [['orc', 3], ['vampire', 1], ['zombie', 2]],
      [['bomber', 2], ['keeper', 2], ['ghost', 3]],
      [['yeti', 1]],
    ],
  },
  {
    id: 'swamp',
    name: 'Marais toxique',
    theme: 'swamp',
    hp: 7.4,
    boss: 'tyrant',
    rooms: [
      [['blob', 3], ['ghost', 2]],
      [['skeleton', 3], ['wisp', 5]],
      [['orc', 2], ['blob', 3]],
      [['keeper', 2], ['vampire', 1]],
      [['blob', 4], ['bomber', 1]],
      [['ghost', 4], ['orc', 2]],
      [['vampire', 2], ['skeleton', 3], ['wisp', 4]],
      [['orc', 3], ['keeper', 1], ['blob', 2]],
      [['bomber', 2], ['vampire', 2], ['blob', 3]],
      [['tyrant', 1]],
    ],
  },
  {
    id: 'volcano',
    name: 'Cœur du volcan',
    theme: 'volcano',
    hp: 9.2,
    boss: 'demonLord',
    rooms: [
      [['zombie', 4], ['vampire', 1]],
      [['orc', 3], ['skeleton', 2]],
      [['bomber', 3], ['ghost', 2]],
      [['vampire', 2], ['keeper', 2]],
      [['wisp', 10], ['orc', 2]],
      [['skeleton', 4], ['bomber', 2]],
      [['orc', 3], ['vampire', 2]],
      [['keeper', 2], ['ghost', 4], ['zombie', 2]],
      [['orc', 3], ['bomber', 2], ['vampire', 2]],
      [['demonLord', 1]],
    ],
  },
  {
    id: 'citadel',
    name: 'Citadelle de l’ombre',
    theme: 'citadel',
    hp: 11.5,
    boss: 'shadowMaster',
    rooms: [
      [['zombie', 4], ['skeleton', 2]],
      [['orc', 3], ['keeper', 1]],
      [['vampire', 2], ['ghost', 3], ['skeleton', 1]],
      [['bomber', 2], ['orc', 2], ['wisp', 4]],
      [['keeper', 2], ['vampire', 2]],
      [['blob', 4], ['ghost', 3]],
      [['orc', 4], ['skeleton', 2]],
      [['vampire', 3], ['keeper', 2]],
      [['orc', 3], ['bomber', 2], ['vampire', 2], ['ghost', 2]],
      [['shadowMaster', 1]],
    ],
  },
];

/**
 * Chapters 9 to 18 follow one pacing: `pool` = four monster types of the chapter
 * (a, b, c, d), rising in pressure, an elite-friendly room 5, the boss in room 10.
 */
function paced([a, b, c, d], boss, extra = 'wisp') {
  return [
    [[a, 4], [b, 2]],
    [[b, 3], [c, 2]],
    [[c, 2], [d, 1], [a, 2]],
    [[d, 2], [extra, 6]],
    [[a, 3], [c, 2], [b, 2]],
    [[d, 2], [b, 3], [extra, 4]],
    [[c, 3], [a, 3], [d, 1]],
    [[b, 3], [d, 2], ['bomber', 1]],
    [[a, 3], [c, 3], [d, 2]],
    [[boss, 1]],
  ];
}

ALL_CHAPTERS.push(
  { id: 'desert', name: 'Dunes d’Ashara', theme: 'desert', hp: 14, boss: 'sandKing', rooms: paced(['zombie', 'orc', 'bomber', 'vampire'], 'sandKing') },
  { id: 'sakura', name: 'Jardin des cerisiers', theme: 'sakura', hp: 16.8, boss: 'kitsune', rooms: paced(['skeleton', 'ghost', 'orc', 'keeper'], 'kitsune') },
  { id: 'autumn', name: 'Bois d’automne', theme: 'autumn', hp: 19.8, boss: 'brigand', rooms: paced(['zombie', 'skeleton', 'bomber', 'orc'], 'brigand') },
  { id: 'abyss', name: 'Abysses de corail', theme: 'abyss', hp: 23.2, boss: 'leviathan', rooms: paced(['blob', 'ghost', 'skeleton', 'vampire'], 'leviathan') },
  { id: 'sky', name: 'Îles célestes', theme: 'sky', hp: 27, boss: 'skyDragon', rooms: paced(['orc', 'ghost', 'keeper', 'vampire'], 'skyDragon') },
  { id: 'jungle', name: 'Jungle d’émeraude', theme: 'jungle', hp: 31.5, boss: 'warlord', rooms: paced(['zombie', 'blob', 'skeleton', 'orc'], 'warlord') },
  { id: 'storm', name: 'Pics de l’orage', theme: 'storm', hp: 36.5, boss: 'stormKnight', rooms: paced(['orc', 'ghost', 'keeper', 'vampire'], 'stormKnight') },
  { id: 'void', name: 'Faille du néant', theme: 'void', hp: 42, boss: 'voidEye', rooms: paced(['skeleton', 'blob', 'ghost', 'vampire'], 'voidEye') },
  { id: 'golden', name: 'Cité d’or', theme: 'golden', hp: 48, boss: 'pharaoh', rooms: paced(['zombie', 'orc', 'bomber', 'vampire'], 'pharaoh') },
  { id: 'celestial', name: 'Trône céleste', theme: 'celestial', hp: 55, boss: 'archon', rooms: paced(['orc', 'keeper', 'vampire', 'blob'], 'archon') },
);

/** Chapters players can pick (the others are still being built). */
export const CHAPTERS = ALL_CHAPTERS.filter((c) => c.ready !== false);

/** Rooms after which an angel offers a heal or an ability. */
export const ANGEL_AFTER = [5];
