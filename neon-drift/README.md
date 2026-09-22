# Neon Drift

Jeu d'arcade 3D mobile (Three.js) à jouer d'une main. Tu pilotes un vaisseau sur une autoroute néon synthwave : glisse ton pouce pour passer dans les ouvertures des murs, ramasse les cristaux pour monter le combo et frôle les blocs pour gagner des bonus. La vitesse augmente jusqu'au crash. Une partie dure de 1 à 3 minutes.

## Contrôles

| Action | Mobile | Desktop |
| --- | --- | --- |
| Piloter | Glisser le pouce n'importe où (déplacement relatif) | Glisser à la souris, ou ← → / A D (Q D en AZERTY) |
| Pause | Bouton en haut à droite | Échap ou P |
| Jouer / Rejouer / Reprendre | Boutons | Entrée ou Espace |

## Gameplay

- **Murs** (rose) : une ou deux ouvertures. **Piliers** (cyan) : blocs isolés. **Glisseurs** (orange) : blocs qui bougent, et après un moment des « portes » qui s'ouvrent et se ferment.
- **Cristaux** : chaque cristal ramassé augmente le combo (jusqu'à x8). En rater un remet le combo à zéro.
- **Frôlé** : passer très près d'un bloc donne +50 points et un court ralenti.
- **Difficulté juste** : chaque rangée garantit une ouverture atteignable depuis la précédente, même au clavier (`lateralReach` dans `src/game/difficulty.js`). Un bot de test a tenu plus de 3 minutes à vitesse max sans mourir.
- Tous les réglages d'équilibrage sont dans `src/config.js`.

## Architecture

```
neon-drift/
├── index.html            # Import map Three.js, UI HTML, meta mobile/PWA
├── styles.css            # UI glassmorphism, safe-areas, animations
├── manifest.webmanifest  # PWA (plein écran, portrait)
├── sw.js                 # Service worker : hors ligne (app + Three.js en cache)
├── icons/                # Icônes (SVG + PNG)
└── src/
    ├── main.js           # Démarrage, détection WebGL 2, service worker
    ├── config.js         # Toutes les constantes de gameplay et de rendu
    ├── core/             # math (lerp, damp…), storage (localStorage sécurisé)
    ├── game/
    │   ├── game.js       # Orchestrateur : états, simulation, rendu, événements
    │   ├── stateMachine.js # menu → playing ⇄ paused → dying → gameover
    │   ├── loop.js       # Pas de temps fixe (120 Hz) + rendu interpolé
    │   ├── track.js      # Générateur procédural, pooling, InstancedMesh, collisions
    │   ├── difficulty.js # Courbes de vitesse / espacement / patterns
    │   └── player.js     # Vaisseau (simulation + modèle low-poly)
    ├── render/
    │   ├── view.js       # Renderer, caméra, bloom, perte de contexte WebGL
    │   ├── environment.js # Ciel synthwave, soleil, grille, route, montagnes, lumières
    │   ├── particles.js  # Particules GPU (pool circulaire, sans allocation)
    │   ├── cameraRig.js  # Caméra adaptée au format d'écran + screen shake
    │   └── quality.js    # Presets de qualité + baisse auto si le FPS chute
    ├── input/input.js    # Glisser relatif (pointer events) + clavier
    ├── audio/audio.js    # Musique et effets générés (Web Audio API)
    └── ui/               # Écrans, HUD, popups, vibrations
```

Points techniques :
- **Performance** : obstacles, cristaux, pylônes et lignes de vitesse passent par `InstancedMesh`. Tous les objets de jeu sont réutilisés depuis des pools, et la boucle de jeu n'alloue rien. Le pixel ratio est plafonné, et en mode Auto la qualité baisse d'un cran si le FPS reste sous 45.
- **Qualité** : Haute (bloom + ombres 1024), Moyenne (bloom + ombres 512, pixel ratio 1,5), Basse (sans post-process ni ombres). Réglable en jeu.
- **Robustesse** : pause automatique quand l'app passe en arrière-plan ou perd le focus. Gère la perte et la restauration du contexte WebGL, le redimensionnement et la rotation. Fonctionne même si `localStorage` est bloqué.
- **Debug** : ajoute `?debug` à l'URL pour accéder à l'instance du jeu via `window.neonDrift`.

## Lancer en local

Les modules ES exigent un serveur HTTP (ouvrir le fichier directement ne fonctionne pas) :

```bash
cd neon-drift
python3 -m http.server 8080
# ou : npx serve .
```

Puis ouvre http://localhost:8080. Une connexion internet est nécessaire au premier chargement (Three.js vient du CDN jsDelivr). Ensuite, le service worker permet de jouer hors ligne.

## Tester sur un téléphone

1. Lance le serveur en écoutant sur le réseau local : `python3 -m http.server 8080 --bind 0.0.0.0`
2. Récupère l'IP de ton ordinateur (`ipconfig` sous Windows, `ipconfig getifaddr en0` sous macOS, `hostname -I` sous Linux).
3. Sur le téléphone, connecté au même Wi-Fi, ouvre `http://<IP>:8080`.

En HTTP sur une IP locale, le navigateur désactive le service worker (mode hors ligne et installation PWA). Le jeu reste entièrement jouable. Pour tester l'expérience PWA complète (« Ajouter à l'écran d'accueil », plein écran, hors ligne), il faut du HTTPS : déploie sur GitHub Pages ou Netlify (ci-dessous), ou utilise un tunnel HTTPS comme `npx localtunnel --port 8080`.

Les vibrations ne fonctionnent que sur Android : iOS Safari ne supporte pas l'API Vibration, et l'option est alors masquée.

## Déployer

### GitHub Pages
Le workflow `.github/workflows/pages.yml` publie le dépôt à chaque push sur `main` :
1. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. Merge sur `main`. Le jeu sera accessible à `https://<utilisateur>.github.io/<dépôt>/neon-drift/`.

Tous les chemins sont relatifs : le jeu fonctionne dans un sous-dossier.

### Netlify
- Glisser-déposer le dossier `neon-drift/` sur https://app.netlify.com/drop, **ou**
- Relier le dépôt avec : *Base directory* `neon-drift`, *Build command* vide, *Publish directory* `neon-drift`.

À chaque modification des fichiers, incrémente `VERSION` dans `sw.js` pour que les joueurs reçoivent la nouvelle version.

## Compatibilité

Navigateurs avec WebGL 2 et import maps : Chrome/Edge 89+, Safari 16.4+ (iOS 16.4+), Firefox 108+. Sur un navigateur non compatible, un message clair s'affiche à la place du jeu.
