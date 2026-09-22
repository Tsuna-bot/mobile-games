import { AudioEngine } from './audio/audio.js';
import { loadSave } from './core/storage.js';
import { Game } from './game/game.js';
import { Input } from './input/input.js';
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
  // iOS Safari ignores user-scalable=no; these stop pinch zoom and the callout menu.
  document.addEventListener('gesturestart', prevent);
  document.addEventListener('contextmenu', prevent);
  document.addEventListener('dblclick', prevent);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is progressive enhancement; the game runs without it.
    });
  });
}

function boot() {
  const ui = new UI(document);
  window.__neonDriftBooted = true;

  if (!supportsWebGL2()) {
    ui.showFatal('Ton navigateur ne supporte pas WebGL 2. Mets-le à jour ou essaie Chrome, Safari ou Firefox récents.');
    return;
  }

  blockBrowserGestures();
  const save = loadSave();
  const audio = new AudioEngine(save.settings.sound);
  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });

  let game;
  try {
    const view = new View(document.getElementById('scene'));
    const input = new Input(document.getElementById('touch-surface'));
    game = new Game({ view, input, audio, haptics: new Haptics(save.settings.haptics), ui, save });
  } catch (error) {
    console.error(error);
    ui.showFatal('Impossible de démarrer les graphismes 3D sur cet appareil.');
    return;
  }

  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) game.dispose();
  });

  // `?debug` exposes the game instance for testing from the console.
  if (new URLSearchParams(location.search).has('debug')) window.neonDrift = game;

  ui.setLoading(false);
  game.start();
  registerServiceWorker();
}

boot();
