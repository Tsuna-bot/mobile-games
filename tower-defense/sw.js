// Offline support. Bump VERSION whenever app files change so players get the update.
const VERSION = 'bastion-v6';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/models/Textures/colormap.png',
  './assets/models/characters/Textures/colormap.png',
  './assets/models/characters/character-female-b.glb',
  './assets/models/characters/character-female-d.glb',
  './assets/models/characters/character-female-f.glb',
  './assets/models/characters/character-male-a.glb',
  './assets/models/characters/character-male-c.glb',
  './assets/models/characters/character-male-e.glb',
  './assets/models/detail-crystal-large.glb',
  './assets/models/detail-crystal.glb',
  './assets/models/detail-rocks-large.glb',
  './assets/models/detail-rocks.glb',
  './assets/models/detail-tree-large.glb',
  './assets/models/detail-tree.glb',
  './assets/models/enemy-ufo-a.glb',
  './assets/models/enemy-ufo-b.glb',
  './assets/models/enemy-ufo-beam.glb',
  './assets/models/enemy-ufo-c-weapon.glb',
  './assets/models/enemy-ufo-c.glb',
  './assets/models/enemy-ufo-d.glb',
  './assets/models/selection-a.glb',
  './assets/models/snow-detail-crystal.glb',
  './assets/models/snow-detail-rocks-large.glb',
  './assets/models/snow-detail-rocks.glb',
  './assets/models/snow-detail-tree-large.glb',
  './assets/models/snow-detail-tree.glb',
  './assets/models/snow-tile-corner-round.glb',
  './assets/models/snow-tile-crystal.glb',
  './assets/models/snow-tile-end-round.glb',
  './assets/models/snow-tile-hill.glb',
  './assets/models/snow-tile-rock.glb',
  './assets/models/snow-tile-spawn-end.glb',
  './assets/models/snow-tile-straight.glb',
  './assets/models/snow-tile-tree-double.glb',
  './assets/models/snow-tile-tree-quad.glb',
  './assets/models/snow-tile-tree.glb',
  './assets/models/snow-tile.glb',
  './assets/models/spawn-round.glb',
  './assets/models/survival/Textures/colormap.png',
  './assets/models/survival/barrel.glb',
  './assets/models/survival/box-large.glb',
  './assets/models/survival/box.glb',
  './assets/models/survival/chest.glb',
  './assets/models/survival/fence-fortified.glb',
  './assets/models/survival/resource-planks.glb',
  './assets/models/survival/resource-stone.glb',
  './assets/models/survival/resource-wood.glb',
  './assets/models/survival/rock-a.glb',
  './assets/models/survival/rock-b.glb',
  './assets/models/survival/rock-c.glb',
  './assets/models/survival/rock-flat.glb',
  './assets/models/survival/structure-roof.glb',
  './assets/models/survival/tool-axe.glb',
  './assets/models/survival/tool-pickaxe.glb',
  './assets/models/survival/tree-autumn.glb',
  './assets/models/survival/tree-tall.glb',
  './assets/models/survival/tree-trunk.glb',
  './assets/models/survival/tree.glb',
  './assets/models/survival/workbench-anvil.glb',
  './assets/models/tile-corner-round.glb',
  './assets/models/tile-crystal.glb',
  './assets/models/tile-end-round.glb',
  './assets/models/tile-hill.glb',
  './assets/models/tile-rock.glb',
  './assets/models/tile-spawn-end.glb',
  './assets/models/tile-straight.glb',
  './assets/models/tile-tree-double.glb',
  './assets/models/tile-tree-quad.glb',
  './assets/models/tile-tree.glb',
  './assets/models/tile.glb',
  './assets/models/tower-round-bottom-a.glb',
  './assets/models/tower-round-bottom-b.glb',
  './assets/models/tower-round-bottom-c.glb',
  './assets/models/tower-round-build-a.glb',
  './assets/models/tower-round-build-b.glb',
  './assets/models/tower-round-build-c.glb',
  './assets/models/tower-round-build-d.glb',
  './assets/models/tower-round-build-f.glb',
  './assets/models/tower-round-crystals.glb',
  './assets/models/tower-round-middle-a.glb',
  './assets/models/tower-round-middle-b.glb',
  './assets/models/tower-round-middle-c.glb',
  './assets/models/tower-round-roof-a.glb',
  './assets/models/tower-round-top-a.glb',
  './assets/models/tower-round-top-b.glb',
  './assets/models/tower-round-top-c.glb',
  './assets/models/tower-square-bottom-a.glb',
  './assets/models/tower-square-bottom-b.glb',
  './assets/models/tower-square-bottom-c.glb',
  './assets/models/tower-square-build-a.glb',
  './assets/models/tower-square-build-b.glb',
  './assets/models/tower-square-build-c.glb',
  './assets/models/tower-square-build-d.glb',
  './assets/models/tower-square-build-e.glb',
  './assets/models/tower-square-build-f.glb',
  './assets/models/tower-square-middle-a.glb',
  './assets/models/tower-square-middle-b.glb',
  './assets/models/tower-square-middle-c.glb',
  './assets/models/tower-square-roof-a.glb',
  './assets/models/tower-square-roof-b.glb',
  './assets/models/tower-square-roof-c.glb',
  './assets/models/tower-square-top-a.glb',
  './assets/models/tower-square-top-b.glb',
  './assets/models/tower-square-top-c.glb',
  './assets/models/weapon-ammo-arrow.glb',
  './assets/models/weapon-ammo-boulder.glb',
  './assets/models/weapon-ammo-bullet.glb',
  './assets/models/weapon-ammo-cannonball.glb',
  './assets/models/weapon-ballista.glb',
  './assets/models/weapon-cannon.glb',
  './assets/models/weapon-catapult.glb',
  './assets/models/weapon-turret.glb',
  './src/audio/audio.js',
  './src/config.js',
  './src/core/cloud.js',
  './src/core/loop.js',
  './src/core/math.js',
  './src/core/random.js',
  './src/core/storage.js',
  './src/data/achievements.js',
  './src/data/enemies.js',
  './src/data/levels.js',
  './src/data/perks.js',
  './src/data/realm.js',
  './src/data/spells.js',
  './src/data/themes.js',
  './src/data/towers.js',
  './src/data/waves.js',
  './src/game/game.js',
  './src/game/realmMode.js',
  './src/input/pointer.js',
  './src/main.js',
  './src/render/ambient.js',
  './src/render/assets.js',
  './src/render/cameraRig.js',
  './src/render/effects.js',
  './src/render/enemyViews.js',
  './src/render/particles.js',
  './src/render/projectileViews.js',
  './src/render/realmViews.js',
  './src/render/spellViews.js',
  './src/render/thumbnails.js',
  './src/render/towerViews.js',
  './src/render/view.js',
  './src/render/world.js',
  './src/sim/level.js',
  './src/sim/realm.js',
  './src/sim/simulation.js',
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
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return (await cache.match('./index.html')) ?? Response.error();
    return Response.error();
  }
}

async function cacheFirst(request) {
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
  if (url.origin === self.location.origin) {
    // Models and three.js never change within a version: serve them from cache for instant loads.
    event.respondWith(url.pathname.includes('/assets/') || url.pathname.includes('/vendor/') ? cacheFirst(request) : networkFirst(request));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
});
