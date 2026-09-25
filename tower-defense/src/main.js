import { AudioEngine } from './audio/audio.js';
import { flushAll, syncFromCloud } from './core/cloud.js';
import { REALM_KEY, RUN_KEY, STORAGE_KEY, loadSave } from './core/storage.js';
import { Game } from './game/game.js';
import { Assets } from './render/assets.js';
import { renderThumbnails } from './render/thumbnails.js';
import { View } from './render/view.js';
import { Haptics } from './ui/haptics.js';
import { UI } from './ui/ui.js';


const SAVE_KEYS = [STORAGE_KEY, RUN_KEY, REALM_KEY];

/**
 * Save transfer: "Exporter" copies a code holding the whole save, "Importer" restores
 * one (e.g. to move it into a reinstalled home-screen app, which has its own storage).
 */
function bindSaveTransfer() {
  document.getElementById('btn-export')?.addEventListener('click', async () => {
    const data = {};
    for (const key of SAVE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
    const code = `BASTION1:${btoa(unescape(encodeURIComponent(JSON.stringify(data))))}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      // Clipboard refused: the code is shown to copy by hand.
    }
    if (copied) window.alert('Sauvegarde copiée ! Colle-la dans Notes pour la garder, puis utilise « Importer » pour la restaurer.');
    else window.prompt('Copie ce code et garde-le (Notes par exemple) :', code);
  });
  document.getElementById('btn-import')?.addEventListener('click', () => {
    const code = window.prompt('Colle ici le code de sauvegarde (il remplace la progression actuelle) :', '');
    if (!code) return;
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(code.trim().replace(/^BASTION1:/, '')))));
      const keys = Object.keys(data).filter((key) => SAVE_KEYS.includes(key));
      if (!keys.length) throw new Error('empty');
      for (const key of SAVE_KEYS) localStorage.removeItem(key);
      for (const key of keys) localStorage.setItem(key, data[key]);
      window.alert('Sauvegarde importée : le jeu redémarre.');
      window.location.reload();
    } catch {
      window.alert('Ce code ne correspond pas à une sauvegarde Bastion.');
    }
  });
}

/** Tapping the version line on the menu shows screen measurements (to diagnose display issues). */
function bindDiagnostics() {
  const line = document.querySelector('.credits');
  if (!line) return;
  line.addEventListener('click', async () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:100lvh;width:1px;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const app = document.getElementById('app').getBoundingClientRect();
    const keys = 'caches' in window ? await caches.keys() : [];
    const lines = [
      `écran ${screen.width}×${screen.height}`,
      `fenêtre ${window.innerWidth}×${window.innerHeight} · visible ${Math.round(window.visualViewport?.height ?? 0)}`,
      `100lvh ${Math.round(probe.getBoundingClientRect().height)} · html ${document.documentElement.clientHeight}`,
      `jeu y ${Math.round(app.top)} h ${Math.round(app.height)}`,
      `encoches haut ${style.paddingTop} bas ${style.paddingBottom}`,
      `app écran d'accueil ${Boolean(navigator.standalone)}`,
      `hors ligne ${navigator.serviceWorker?.controller ? 'actif' : 'inactif'} · cache ${keys.join(', ') || 'aucun'}`,
    ];
    probe.remove();
    window.alert(lines.join('\n'));
  });
}

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
  // The service worker serves the game from its cache; when a new version has been
  // downloaded and takes over, reload into it (right away from the menu, else at the next menu).
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || window.__bastionReloading) return;
    const reload = () => {
      window.__bastionReloading = true;
      window.location.reload();
    };
    const onMenu = () => document.getElementById('screen-menu')?.classList.contains('is-visible');
    if (onMenu()) reload();
    else {
      const timer = setInterval(() => {
        if (!onMenu()) return;
        clearInterval(timer);
        reload();
      }, 1000);
    }
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {
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
  bindDiagnostics();
  bindSaveTransfer();
}

boot();
