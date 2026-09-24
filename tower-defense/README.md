# Bastion

Tower defense 3D pour mobile (Three.js). Des ovnis suivent la route jusqu'à ton château : construis des tours sur l'herbe, améliore-les et choisis leurs cibles pour tenir jusqu'à la dernière vague.

Modèles 3D : [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit) de Kenney, licence CC0 (voir `assets/models/LICENSE-Kenney.txt`).

## Contenu

- **5 niveaux** faits main, chacun avec sa propre ambiance :

  | Niveau | Vagues | Ambiance |
  | --- | --- | --- |
  | Prairie | 10 | journée ensoleillée, pollen |
  | Col enneigé | 12 | neige qui tombe |
  | Forêt du crépuscule | 12 | coucher de soleil, lucioles |
  | Canyon cristallin | 15 | lumière magique, poussière de cristal |
  | Citadelle nocturne | 18 | nuit étoilée, lueur du château |

- **Mode Survie** : vagues infinies, débloqué après le niveau 3. Le record est sauvegardé.
- **Mode Héroïque** : se débloque sur un niveau fini avec 3 étoiles. 5 vies, ennemis plus résistants et plus rapides, et une couronne à gagner.
- **5 tours à 3 niveaux**. Le modèle grandit à chaque amélioration, et une aura dorée apparaît au niveau maximum.

  | Tour | Rôle |
  | --- | --- |
  | Baliste | Tir précis sur une seule cible |
  | Canon | Boulets explosifs, dégâts de zone |
  | Mitrailleuse | Rafales très rapides, faible contre l'armure |
  | Catapulte | Très longue portée, tir en cloche qui anticipe la cible |
  | Givre | Onde qui ralentit les ennemis proches |

- **3 sorts** à recharge, qu'on vise en touchant la carte. Leur puissance suit la difficulté des vagues.
  - Météore : un rocher en feu écrase une zone.
  - Blizzard : gèle les ennemis sur place (moitié du temps pour les boss).
  - Foudre : éclair en chaîne sur les 5 ennemis les plus proches.
- **4 ennemis** : Éclaireur, Rapide, Blindé et Vaisseau-mère, qui libère 4 Rapides en mourant.
- **Progression** :
  - on gagne des étoiles (3 par niveau, 1 couronne en Héroïque, 1 étoile toutes les 10 vagues en Survie, jusqu'à 3) ;
  - elles s'échangent contre **6 améliorations permanentes** : dégâts, or de départ, portée, coût des améliorations, sorts, vies ;
  - elles sont réinitialisables à tout moment.
- **Récompenses en jeu** :
  - bonus multi-kill (triplé, quadruplé, carnage) ;
  - bonus de vague parfaite (aucun ovni passé) ;
  - bonus d'appel anticipé ;
  - pièces qui volent vers le compteur d'or.

## Graphismes

- **L'île** : la carte est une île flottante en tuiles Kenney, posée sur une falaise rocheuse générée, au milieu d'une mer animée (shader maison : vagues, écume sur le rivage, reflets). Des îlots boisés l'entourent et des nuages dérivent autour.
- **Ambiances** : ciel en dégradé avec soleil ou lune et étoiles, ombres de nuages qui glissent sur le terrain, arbres qui bougent au vent (vertex shader), particules d'ambiance par niveau, lueur chaude du château la nuit.
- **Effets** :
  - ovnis avec ombre de contact, halo coloré par type, bloc de glace quand ils sont gelés ;
  - traînées derrière les projectiles, flash au tir ;
  - météore enflammé, éclairs en chaîne, traces de brûlure et de givre au sol ;
  - le château fume quand il est endommagé.
- **Qualité** :
  - Haute : bloom, ombres 2048 ;
  - Moyenne : ombres 1024 ;
  - Basse : pas d'ombres.

  En mode Auto, la qualité baisse d'un cran si le jeu ralentit.

## Contrôles

| Action | Geste |
| --- | --- |
| Construire | Toucher une case d'herbe, choisir une tour (sa portée s'affiche), la toucher à nouveau pour confirmer |
| Améliorer / vendre / cibler | Toucher une tour |
| Déplacer la vue | Glisser un doigt (une fois zoomé) |
| Zoomer | Pincer, ou molette sur ordinateur |
| Lancer la vague | Bouton en bas, ou Espace |
| Lancer un sort | Toucher le sort en bas à gauche, puis la carte (ou touches 1, 2, 3) |
| Pause | Bouton en haut à droite, ou Échap |

## Architecture

```
tower-defense/
├── index.html, styles.css      # UI HTML/CSS (HUD, panneaux, écrans)
├── manifest.webmanifest, sw.js # PWA, jeu hors ligne après la première visite
├── assets/models/              # Modèles GLB Kenney + texture palette partagée
├── tools/balance.mjs           # Bot d'équilibrage (Node, sans navigateur)
└── src/
    ├── config.js               # Réglages globaux (économie, caméra, combat)
    ├── data/                   # Tours, ennemis, sorts, améliorations, cartes, ambiances, vagues
    ├── sim/                    # Logique pure, sans Three.js ni DOM
    │   ├── level.js            # Lecture de carte, chemin, virages arrondis
    │   └── simulation.js       # Vagues, ennemis, tours, projectiles, économie
    ├── render/                 # Tout le visuel Three.js
    │   ├── assets.js           # Chargement GLB, matériau unique partagé
    │   ├── world.js            # Île, mer, nuages, ciel, terrain instancié, lumières
    │   ├── ambient.js          # Particules d'ambiance animées sur le GPU
    │   ├── spellViews.js       # Météore, éclairs, traces au sol
    │   ├── towerViews.js       # Tours empilées, visée, recul, animations
    │   ├── enemyViews.js       # Ovnis (pool), barres de vie, flash, teinte givre
    │   ├── projectileViews.js  # Flèches, boulets, balles, rochers
    │   ├── effects.js          # Particules, ondes, portée, curseur
    │   ├── cameraRig.js        # Cadrage auto, pan, zoom, tremblement
    │   ├── thumbnails.js       # Icônes générées depuis les vrais modèles 3D
    │   └── view.js             # Renderer, qualité adaptative, perte de contexte
    ├── input/pointer.js        # Tap, glisser, pincer
    ├── audio/audio.js          # Musique et bruitages générés (Web Audio)
    ├── ui/                     # DOM et vibrations
    └── game/game.js            # Orchestrateur : états, événements, actions
```

La simulation ne connaît ni Three.js ni le DOM : elle tourne à pas fixe (60 Hz) et prévient le rendu, l'UI et l'audio par des événements. On peut donc la tester seule :

```bash
cd tower-defense
node tools/balance.mjs 6 --survival   # 6 parties par niveau, sorts compris, et la Survie
node tools/balance.mjs 6 --perks      # même chose avec des améliorations « milieu de partie »
node tools/balance.mjs 1 --leaks      # détaille les ennemis qui passent
```

Résultat actuel (bot qui utilise aussi les sorts) :

| Niveau | Sans amélioration | Avec améliorations moyennes |
| --- | --- | --- |
| 1 à 2 | 3 étoiles | 3 étoiles |
| 3 à 4 | 1 à 3 étoiles | 3 étoiles |
| 5 | gagne 4 fois sur 6, 1 étoile | 3 étoiles |
| Survie | vague 22 environ | vague 28 environ |

Le niveau 5 pousse donc à utiliser les améliorations. Toutes les valeurs d'équilibrage sont dans `src/data/` et `src/config.js`.

**Performance** : terrain et décor en InstancedMesh, un seul matériau et une seule texture pour tous les modèles, objets (ennemis, projectiles, particules) réutilisés en pool. La qualité (ombres, pixel ratio, particules) baisse automatiquement si le FPS chute.

## Lancer en local

```bash
cd tower-defense
python3 -m http.server 8080
```

Ouvre ensuite http://localhost:8080. Ajoute `?debug` à l'URL pour accéder au jeu depuis la console (`window.bastion`).

## Tester sur téléphone et déployer

Même procédure que pour Neon Drift (voir `../neon-drift/README.md`) :
- **Réseau local** : `python3 -m http.server 8080 --bind 0.0.0.0`, puis `http://<IP>:8080` sur le téléphone, connecté au même Wi-Fi.
- **GitHub Pages** : l'URL sera `https://<utilisateur>.github.io/<dépôt>/tower-defense/`.
- **Netlify** : glisser-déposer le dossier `tower-defense/`.

Incrémente `VERSION` dans `sw.js` à chaque mise à jour des fichiers.
