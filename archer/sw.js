// Offline support. Bump VERSION whenever app files change so players get the update.
const VERSION = 'sagittaire-v1';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/models/characters/Textures/colormap.png',
  './assets/models/characters/character-female-b.glb',
  './assets/models/characters/character-female-d.glb',
  './assets/models/characters/character-female-f.glb',
  './assets/models/characters/character-male-a.glb',
  './assets/models/characters/character-male-c.glb',
  './assets/models/characters/character-male-e.glb',
  './assets/models/dungeon/Textures/colormap.png',
  './assets/models/dungeon/banner.glb',
  './assets/models/dungeon/barrel.glb',
  './assets/models/dungeon/character-human.glb',
  './assets/models/dungeon/character-orc.glb',
  './assets/models/dungeon/chest.glb',
  './assets/models/dungeon/coin.glb',
  './assets/models/dungeon/column.glb',
  './assets/models/dungeon/floor-detail.glb',
  './assets/models/dungeon/floor.glb',
  './assets/models/dungeon/gate.glb',
  './assets/models/dungeon/pot.glb',
  './assets/models/dungeon/potion.glb',
  './assets/models/dungeon/rocks.glb',
  './assets/models/dungeon/stones.glb',
  './assets/models/dungeon/trap.glb',
  './assets/models/dungeon/wall-half.glb',
  './assets/models/dungeon/wall.glb',
  './assets/models/dungeon/wood-structure.glb',
  './assets/models/graveyard/Textures/colormap.png',
  './assets/models/graveyard/character-ghost.glb',
  './assets/models/graveyard/character-keeper.glb',
  './assets/models/graveyard/character-skeleton.glb',
  './assets/models/graveyard/character-vampire.glb',
  './assets/models/graveyard/character-zombie.glb',
  './assets/models/graveyard/crypt-small.glb',
  './assets/models/graveyard/debris.glb',
  './assets/models/graveyard/fence.glb',
  './assets/models/graveyard/fire-basket.glb',
  './assets/models/graveyard/grave.glb',
  './assets/models/graveyard/gravestone-bevel.glb',
  './assets/models/graveyard/gravestone-cross.glb',
  './assets/models/graveyard/gravestone-round.glb',
  './assets/models/graveyard/iron-fence-border-gate.glb',
  './assets/models/graveyard/iron-fence.glb',
  './assets/models/graveyard/lightpost-single.glb',
  './assets/models/graveyard/pillar-large.glb',
  './assets/models/graveyard/pine-crooked.glb',
  './assets/models/graveyard/pine.glb',
  './assets/models/graveyard/pumpkin-carved.glb',
  './assets/models/graveyard/rocks-tall.glb',
  './assets/models/graveyard/stone-wall.glb',
  './assets/models/graveyard/trunk.glb',
  './assets/models/nature/flower_redA.glb',
  './assets/models/nature/flower_yellowA.glb',
  './assets/models/nature/grass_large.glb',
  './assets/models/nature/log_stack.glb',
  './assets/models/nature/mushroom_redGroup.glb',
  './assets/models/nature/plant_bush.glb',
  './assets/models/nature/plant_bushLarge.glb',
  './assets/models/nature/rock_smallA.glb',
  './assets/models/nature/rock_tallA.glb',
  './assets/models/nature/stump_round.glb',
  './assets/models/nature/tree_default.glb',
  './assets/models/nature/tree_detailed.glb',
  './assets/models/nature/tree_fat.glb',
  './assets/models/nature/tree_oak.glb',
  './assets/models/nature/tree_pineRoundA.glb',
  './src/audio/audio.js',
  './src/config.js',
  './src/core/loop.js',
  './src/core/math.js',
  './src/core/random.js',
  './src/core/storage.js',
  './src/data/abilities.js',
  './src/data/chapters.js',
  './src/data/enemies.js',
  './src/data/gear.js',
  './src/data/meta.js',
  './src/game/game.js',
  './src/game/menu.js',
  './src/input/joystick.js',
  './src/main.js',
  './src/meta/profile.js',
  './src/render/actors.js',
  './src/render/arenaView.js',
  './src/render/assets.js',
  './src/render/fx.js',
  './src/render/particles.js',
  './src/render/view.js',
  './src/sim/arena.js',
  './src/sim/enemies.js',
  './src/sim/run.js',
  './src/ui/haptics.js',
  './src/ui/ui.js',
  './vendor/three/build/three.core.js',
  './vendor/three/build/three.module.js',
  './vendor/three/examples/jsm/loaders/GLTFLoader.js',
  './vendor/three/examples/jsm/math/SimplexNoise.js',
  './vendor/three/examples/jsm/postprocessing/EffectComposer.js',
  './vendor/three/examples/jsm/postprocessing/GTAOPass.js',
  './vendor/three/examples/jsm/postprocessing/MaskPass.js',
  './vendor/three/examples/jsm/postprocessing/OutputPass.js',
  './vendor/three/examples/jsm/postprocessing/Pass.js',
  './vendor/three/examples/jsm/postprocessing/RenderPass.js',
  './vendor/three/examples/jsm/postprocessing/ShaderPass.js',
  './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js',
  './vendor/three/examples/jsm/shaders/CopyShader.js',
  './vendor/three/examples/jsm/shaders/GTAOShader.js',
  './vendor/three/examples/jsm/shaders/LuminosityHighPassShader.js',
  './vendor/three/examples/jsm/shaders/OutputShader.js',
  './vendor/three/examples/jsm/shaders/PoissonDenoiseShader.js',
  './vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  './vendor/three/examples/jsm/utils/SkeletonUtils.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // cache: 'reload' skips the browser's HTTP cache, so an update never stores stale copies.
      await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('sagittaire-') && key !== VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// Cache first: instant start and full offline play; updates come with a new sw.js.
async function fromCache(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      const page = (await cache.match('./')) ?? (await cache.match('./index.html'));
      if (page) return page;
    }
    throw error;
  }
}

async function fonts(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.includes('/archer/')) event.respondWith(fromCache(request));
  else if (url.origin === self.location.origin) return;
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(fonts(request));
});
