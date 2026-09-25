import { AudioEngine } from './audio/audio.js';
import { flushAll, syncFromCloud } from './core/cloud.js';
import { REALM_KEY, RUN_KEY, STORAGE_KEY, loadSave } from './core/storage.js';
import { Game } from './game/game.js';
import { Assets } from './render/assets.js';
import { renderThumbnails } from './render/thumbnails.js';
import { View } from './render/view.js';
import { Haptics } from './ui/haptics.js';
import { UI } from './ui/ui.js';

/**
 * iPhone home-screen app installed with a translucent status bar: iOS keeps that
 * setting from install time and gives the page a viewport shorter than the screen
 * by the status bar height, leaving an empty band at the bottom. Stretch the game
 * layer down to the real screen edge.
 */
function fitHomeScreenApp() {
  if (!navigator.standalone) return;
  const app = document.getElementById('app');
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.append(probe);
  const fit = () => {
    const portrait = window.innerHeight >= window.innerWidth;
    const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const gap = screenHeight - window.innerHeight;
    const stretch = gap > 0 && gap <= 100;
    app.style.bottom = stretch ? 'auto' : '';
    app.style.height = stretch ? `${screenHeight}px` : '';
    // The home indicator sits in the stretched part: keep the dock clear of it.
    const insetBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    document.documentElement.style.setProperty('--safe-bottom', stretch && insetBottom < 20 ? '34px' : '');
  };
  fit();
  let last = '';
  const check = () => {
    const key = `${window.innerWidth}x${window.innerHeight}`;
    if (key === last) return;
    last = key;
    fit();
    window.dispatchEvent(new Event('resize'));
  };
  window.addEventListener('resize', () => requestAnimationFrame(check));
  window.addEventListener('orientationchange', () => setTimeout(check, 300));
}
fitHomeScreenApp();

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
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Offline support is optional.
  });
}

async function boot() {
  window.__bastionBooted = true;
  const ui = new UI(document);
  if (!supportsWebGL2()) {
    ui.showFatal('Ton navigateur ne supporte pas WebGL 2. Mets-le à jour ou essaie Chrome, Safari ou Firefox récents.');
    return;
  }
  blockBrowserGestures();

  // In the Claude app the save lives in the artifact database: fetch it before reading.
  await syncFromCloud([STORAGE_KEY, RUN_KEY, REALM_KEY]);
  const save = loadSave();
  const audio = new AudioEngine({ sound: save.settings.sound, music: save.settings.music });
  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });

  let view;
  let game;
  try {
    view = new View(document.getElementById('scene'));
    const assets = new Assets();
    await assets.load((progress) => ui.setLoadingProgress(progress));
    ui.thumbnails = renderThumbnails(view.renderer, assets);
    game = new Game({ view, assets, audio, haptics: new Haptics(save.settings.haptics), ui, save });
  } catch (error) {
    console.error(error);
    ui.showFatal("Impossible de charger le jeu. Vérifie ta connexion et réessaie.");
    return;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', (event) => {
    game.persistRun();
    flushAll();
    if (!event.persisted) game.dispose();
  });
  // `?debug` exposes the game for testing from the console.
  if (new URLSearchParams(location.search).has('debug')) window.bastion = game;

  ui.hideLoading();
  game.start();
  registerServiceWorker();
}

boot();
