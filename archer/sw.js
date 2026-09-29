// Offline support. Bump VERSION whenever app files change so players get the update.
const VERSION = 'aetherfall-v14';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/kk/chars/barbarian.glb',
  './assets/kk/chars/knight.glb',
  './assets/kk/chars/mage.glb',
  './assets/kk/chars/q_alien.glb',
  './assets/kk/chars/q_alien_blob.glb',
  './assets/kk/chars/q_bat.glb',
  './assets/kk/chars/q_bee.glb',
  './assets/kk/chars/q_bee_evolved.glb',
  './assets/kk/chars/q_bluedemon.glb',
  './assets/kk/chars/q_demon.glb',
  './assets/kk/chars/q_dino.glb',
  './assets/kk/chars/q_dragon.glb',
  './assets/kk/chars/q_dragon_small.glb',
  './assets/kk/chars/q_ghost.glb',
  './assets/kk/chars/q_ghost_skull.glb',
  './assets/kk/chars/q_glub.glb',
  './assets/kk/chars/q_glub_evolved.glb',
  './assets/kk/chars/q_greenblob.glb',
  './assets/kk/chars/q_hywirl.glb',
  './assets/kk/chars/q_mushnub.glb',
  './assets/kk/chars/q_mushnub_evolved.glb',
  './assets/kk/chars/q_mushroomking.glb',
  './assets/kk/chars/q_ninja.glb',
  './assets/kk/chars/q_orc.glb',
  './assets/kk/chars/q_orc_skull.glb',
  './assets/kk/chars/q_pinkblob.glb',
  './assets/kk/chars/q_spiky.glb',
  './assets/kk/chars/q_squidle.glb',
  './assets/kk/chars/q_tribal.glb',
  './assets/kk/chars/q_wizard.glb',
  './assets/kk/chars/q_yeti.glb',
  './assets/kk/chars/rogue.glb',
  './assets/kk/chars/rogue_hooded.glb',
  './assets/kk/chars/skeleton_mage.glb',
  './assets/kk/chars/skeleton_minion.glb',
  './assets/kk/chars/skeleton_rogue.glb',
  './assets/kk/chars/skeleton_warrior.glb',
  './assets/kk/props/Bush_1_A.glb',
  './assets/kk/props/Bush_1_C.glb',
  './assets/kk/props/Bush_1_E.glb',
  './assets/kk/props/Bush_1_G.glb',
  './assets/kk/props/Bush_3_A.glb',
  './assets/kk/props/Bush_4_A.glb',
  './assets/kk/props/Grass_1_A.glb',
  './assets/kk/props/Grass_2_A.glb',
  './assets/kk/props/Rock_1_A.glb',
  './assets/kk/props/Rock_2_A.glb',
  './assets/kk/props/Rock_3_A.glb',
  './assets/kk/props/Rock_3_B.glb',
  './assets/kk/props/Rock_3_C.glb',
  './assets/kk/props/Rock_3_E.glb',
  './assets/kk/props/Tree_1_A.glb',
  './assets/kk/props/Tree_1_B.glb',
  './assets/kk/props/Tree_1_C.glb',
  './assets/kk/props/Tree_2_A.glb',
  './assets/kk/props/Tree_3_A.glb',
  './assets/kk/props/Tree_3_B.glb',
  './assets/kk/props/Tree_4_A.glb',
  './assets/kk/props/Tree_4_B.glb',
  './assets/kk/props/Tree_Bare_1_A.glb',
  './assets/kk/props/Tree_Bare_1_B.glb',
  './assets/kk/props/Tree_Bare_2_A.glb',
  './assets/kk/props/arch_gate.glb',
  './assets/kk/props/axe_2handed.glb',
  './assets/kk/props/banner_patternA_blue.glb',
  './assets/kk/props/banner_red.glb',
  './assets/kk/props/barrel.glb',
  './assets/kk/props/barrel_large.glb',
  './assets/kk/props/barrel_small_stack.glb',
  './assets/kk/props/bone_A.glb',
  './assets/kk/props/box_stacked.glb',
  './assets/kk/props/chest_gold.glb',
  './assets/kk/props/coffin_decorated.glb',
  './assets/kk/props/coin_stack_large.glb',
  './assets/kk/props/column.glb',
  './assets/kk/props/crate_A_big.glb',
  './assets/kk/props/crates_stacked.glb',
  './assets/kk/props/crossbow_1handed.glb',
  './assets/kk/props/crypt.glb',
  './assets/kk/props/fence.glb',
  './assets/kk/props/fence_gate.glb',
  './assets/kk/props/fence_pillar.glb',
  './assets/kk/props/fence_wood_straight_gate.glb',
  './assets/kk/props/grave_A.glb',
  './assets/kk/props/grave_B.glb',
  './assets/kk/props/gravemarker_A.glb',
  './assets/kk/props/gravestone.glb',
  './assets/kk/props/keg_decorated.glb',
  './assets/kk/props/pillar.glb',
  './assets/kk/props/pillar_decorated.glb',
  './assets/kk/props/post_lantern.glb',
  './assets/kk/props/post_skull.glb',
  './assets/kk/props/pumpkin_orange_jackolantern.glb',
  './assets/kk/props/pumpkin_yellow.glb',
  './assets/kk/props/quiver.glb',
  './assets/kk/props/ribcage.glb',
  './assets/kk/props/rubble_half.glb',
  './assets/kk/props/shrine_candles.glb',
  './assets/kk/props/skull_candle.glb',
  './assets/kk/props/staff.glb',
  './assets/kk/props/sword_1handed.glb',
  './assets/kk/props/torch_lit.glb',
  './assets/kk/props/tree_dead_large.glb',
  './assets/kk/props/tree_dead_medium.glb',
  './assets/kk/props/tree_pine_orange_large.glb',
  './assets/kk/props/tree_pine_orange_medium.glb',
  './assets/kk/props/tree_pine_yellow_large.glb',
  './assets/kk/props/wall.glb',
  './assets/kk/props/wall_gated.glb',
  './assets/anime/anims.glb',
  './assets/anime/archer.glb',
  './assets/anime/assassin.glb',
  './assets/anime/knight.glb',
  './assets/anime/mage.glb',
  './assets/anime/ranger.glb',
  './vendor/three/build/three.core.js',
  './vendor/three/build/three.module.js',
  './vendor/three/examples/jsm/libs/meshopt_decoder.module.js',
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
  './vendor/three/examples/jsm/environments/RoomEnvironment.js',
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
  './src/data/heroes.js',
  './src/data/loot.js',
  './src/data/meta.js',
  './src/data/progression.js',
  './src/data/skins.js',
  './src/game/game.js',
  './src/game/menu.js',
  './src/input/joystick.js',
  './src/main.js',
  './src/meta/heroes.js',
  './src/meta/profile.js',
  './src/meta/progress.js',
  './src/render/actors.js',
  './src/render/ambience.js',
  './src/render/anime.js',
  './src/render/assets.js',
  './src/render/batch.js',
  './src/render/fx.js',
  './src/render/landscape.js',
  './src/render/particles.js',
  './src/render/surfaces.js',
  './src/render/view.js',
  './src/sim/arena.js',
  './src/sim/enemies.js',
  './src/sim/run.js',
  './src/ui/haptics.js',
  './src/ui/iconPaths.js',
  './src/ui/icons.js',
  './src/ui/ui.js',
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
      await Promise.all(keys.filter((key) => (key.startsWith('aetherfall-') || key.startsWith('sagittaire-')) && key !== VERSION).map((key) => caches.delete(key)));
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
