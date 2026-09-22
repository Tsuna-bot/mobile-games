// Offline support. Bump VERSION whenever app files change to refresh caches.
const VERSION = 'neon-drift-v1';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.0/';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/main.js',
  './src/config.js',
  './src/core/math.js',
  './src/core/storage.js',
  './src/game/game.js',
  './src/game/loop.js',
  './src/game/stateMachine.js',
  './src/game/difficulty.js',
  './src/game/track.js',
  './src/game/player.js',
  './src/render/view.js',
  './src/render/environment.js',
  './src/render/particles.js',
  './src/render/cameraRig.js',
  './src/render/quality.js',
  './src/input/input.js',
  './src/audio/audio.js',
  './src/ui/ui.js',
  './src/ui/haptics.js',
];

const THREE_FILES = [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/Pass.js',
  'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/OutputShader.js',
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
    // Same-origin: always fresh when online, cached when offline.
    event.respondWith(networkFirst(request));
  } else if (url.href.startsWith(THREE_CDN) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // Versioned CDN files and fonts never change: serve from cache.
    event.respondWith(cacheFirst(request));
  }
});
