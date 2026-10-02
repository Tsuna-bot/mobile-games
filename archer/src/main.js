import { AudioEngine } from './audio/audio.js';
import { loadSave } from './core/storage.js';
import { Game } from './game/game.js';
import { Assets } from './render/assets.js';
import { View } from './render/view.js';
import { Haptics } from './ui/haptics.js';
import { UI } from './ui/ui.js';
import { installIcons } from './ui/icons.js';

function supportsWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function blockBrowserGestures() {
  const prevent = (event) => event.preventDefault();
  document.addEventListener('gesturestart', prevent);
  document.addEventListener('contextmenu', prevent);
  document.addEventListener('dblclick', prevent);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  // A new version takes over: reload into it from the menu (never in the middle of a run).
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || window.__archerReloading) return;
    const onMenu = () => document.getElementById('screen-menu')?.classList.contains('is-visible');
    const reload = () => {
      window.__archerReloading = true;
      window.location.reload();
    };
    if (onMenu()) reload();
    else {
      const timer = setInterval(() => {
        if (!onMenu()) return;
        clearInterval(timer);
        reload();
      }, 1000);
    }
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
}

/** The version saved for offline play (the newest "aetherfall-vN" cache), under the menu. */
async function showVersion() {
  try {
    const versions = (await caches.keys()).map((k) => Number(/^aetherfall-v(\d+)$/.exec(k)?.[1])).filter(Number.isFinite);
    if (versions.length) document.getElementById('app-version').textContent = `Version ${Math.max(...versions)} · `;
  } catch {
    // No cache storage (private mode): no version shown.
  }
}

async function boot() {
  window.__archerBooted = true;
  showVersion();
  // Once the offline copy is ready (first visit, or right after an update).
  navigator.serviceWorker?.ready.then(() => setTimeout(showVersion, 1500)).catch(() => {});
  installIcons();
  const ui = new UI(document);
  if (!supportsWebGL2()) {
    ui.fatal('Ton navigateur ne supporte pas WebGL 2. Mets-le à jour ou essaie Safari ou Chrome récents.');
    return;
  }
  blockBrowserGestures();
  const save = loadSave();
  const audio = new AudioEngine({ sound: save.settings.sound, music: save.settings.music });
  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });

  let game;
  try {
    const view = new View(document.getElementById('scene'));
    const assets = new Assets();
    await assets.load((f) => ui.setLoading(f));
    game = new Game({ view, assets, ui, audio, haptics: new Haptics(save.settings.haptics), save });
  } catch (error) {
    console.error(error);
    ui.fatal('Impossible de charger le jeu. Vérifie ta connexion et réessaie.');
    return;
  }
  if (new URLSearchParams(location.search).has('debug')) window.archer = game;
  ui.hideLoading();
  game.showMenu();
  registerServiceWorker();
}

boot();
