// Offline support. Bump VERSION whenever app files change so players get the update.
const VERSION = 'bastion-v1';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.0/';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/config.js',
  './src/main.js',
  './src/ui/haptics.js',
  './src/ui/ui.js',
  './src/game/game.js',
  './src/audio/audio.js',
  './src/sim/level.js',
  './src/sim/simulation.js',
  './src/render/assets.js',
  './src/render/cameraRig.js',
  './src/render/effects.js',
  './src/render/enemyViews.js',
  './src/render/particles.js',
  './src/render/projectileViews.js',
  './src/render/thumbnails.js',
  './src/render/towerViews.js',
  './src/render/view.js',
  './src/render/world.js',
  './src/input/pointer.js',
  './src/data/enemies.js',
  './src/data/levels.js',
  './src/data/towers.js',
  './src/data/waves.js',
  './src/core/loop.js',
  './src/core/math.js',
  './src/core/storage.js',
  './assets/models/detail-crystal.glb',
  './assets/models/detail-rocks-large.glb',
  './assets/models/detail-rocks.glb',
  './assets/models/detail-tree-large.glb',
  './assets/models/detail-tree.glb',
  './assets/models/enemy-ufo-a.glb',
  './assets/models/enemy-ufo-b.glb',
  './assets/models/enemy-ufo-beam.glb',
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
  './assets/models/tower-round-build-f.glb',
  './assets/models/tower-round-crystals.glb',
  './assets/models/tower-round-middle-a.glb',
  './assets/models/tower-round-middle-b.glb',
  './assets/models/tower-round-middle-c.glb',
  './assets/models/tower-round-top-a.glb',
  './assets/models/tower-round-top-b.glb',
  './assets/models/tower-round-top-c.glb',
  './assets/models/tower-square-bottom-a.glb',
  './assets/models/tower-square-bottom-c.glb',
  './assets/models/tower-square-middle-a.glb',
  './assets/models/tower-square-middle-c.glb',
  './assets/models/tower-square-top-a.glb',
  './assets/models/tower-square-top-c.glb',
  './assets/models/weapon-ammo-arrow.glb',
  './assets/models/weapon-ammo-boulder.glb',
  './assets/models/weapon-ammo-bullet.glb',
  './assets/models/weapon-ammo-cannonball.glb',
  './assets/models/weapon-ballista.glb',
  './assets/models/weapon-cannon.glb',
  './assets/models/weapon-catapult.glb',
  './assets/models/weapon-turret.glb',
  './assets/models/Textures/colormap.png',
];

const THREE_FILES = [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js',
].map((path) => THREE_CDN + path);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(APP_SHELL);
      // CDN files are cached best-effort: a CDN hiccup must not block installation.
      await Promise.all(THREE_FILES.map((url) => cache.add(new Request(url, { mode: 'cors' })).catch(() => {})));
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
    // Models never change within a version: serve them from cache for instant loads.
    event.respondWith(url.pathname.includes('/assets/') ? cacheFirst(request) : networkFirst(request));
  } else if (url.href.startsWith(THREE_CDN) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
});
