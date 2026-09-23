import { AudioEngine } from './audio/audio.js';
import { loadSave } from './core/storage.js';
import { Game } from './game/game.js';
import { Assets } from './render/assets.js';
import { renderThumbnails } from './render/thumbnails.js';
import { View } from './render/view.js';
import { Haptics } from './ui/haptics.js';
import { UI } from './ui/ui.js';

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

  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) game.dispose();
  });
  // `?debug` exposes the game for testing from the console.
  if (new URLSearchParams(location.search).has('debug')) window.bastion = game;

  ui.hideLoading();
  game.start();
  registerServiceWorker();
}

boot();
