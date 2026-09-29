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
    ready: false, // decor and monsters not drawn yet
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
    ready: false, // decor and monsters not drawn yet
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
    ready: false, // decor and monsters not drawn yet
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
    ready: false, // decor and monsters not drawn yet
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
    ready: false, // decor and monsters not drawn yet
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

/** Chapters players can pick (the others are still being built). */
export const CHAPTERS = ALL_CHAPTERS.filter((c) => c.ready !== false);

/** Rooms after which an angel offers a heal or an ability. */
export const ANGEL_AFTER = [5];
