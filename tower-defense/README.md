# Bastion

Tower defense 3D pour mobile (Three.js). Des ovnis suivent la route jusqu'à ton château : construis des tours sur l'herbe, améliore-les et choisis leurs cibles pour tenir jusqu'à la dernière vague.

Modèles 3D : [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit) de Kenney, licence CC0 (voir `assets/models/LICENSE-Kenney.txt`).

## Contenu

- **3 niveaux** faits main, de difficulté croissante : Prairie (10 vagues), Col enneigé (12 vagues, décor neige), Canyon cristallin (15 vagues). Chaque niveau se débloque en terminant le précédent. On gagne de 1 à 3 étoiles selon les vies restantes (18+ pour 3 étoiles, 10+ pour 2), et elles sont sauvegardées.
- **5 tours à 3 niveaux**. Le modèle grandit à chaque amélioration, étage par étage.

  | Tour | Rôle |
  | --- | --- |
  | Baliste | Tir précis sur une seule cible, bon rapport coût/efficacité |
  | Canon | Boulets explosifs, dégâts de zone |
  | Mitrailleuse | Rafales très rapides, faible contre l'armure |
  | Catapulte | Très longue portée, grosse zone, tir en cloche qui anticipe la position de la cible |
  | Givre | Onde qui ralentit tous les ennemis proches |

- **4 ennemis** : Éclaireur, Rapide, Blindé (l'armure retire des dégâts à chaque coup) et Vaisseau-mère, qui libère 4 Rapides en mourant.
- **Économie** : or par ennemi détruit, prime de fin de vague, revente à 70 %. Appeler la vague suivante en avance rapporte 1 or par seconde gagnée.
- **Ciblage par tour** : premier, dernier, plus fort, plus proche.
- **Confort** : vitesse x1/x2, pause automatique quand l'app passe en arrière-plan, tutoriel au premier niveau, aperçu de la composition de la prochaine vague.

## Contrôles

| Action | Geste |
| --- | --- |
| Construire | Toucher une case d'herbe, choisir une tour (sa portée s'affiche), la toucher à nouveau pour confirmer |
| Améliorer / vendre / cibler | Toucher une tour |
| Déplacer la vue | Glisser un doigt (une fois zoomé) |
| Zoomer | Pincer, ou molette sur ordinateur |
| Lancer la vague | Bouton en bas, ou Espace |
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
    ├── data/                   # Tours, ennemis, cartes ASCII, génération des vagues
    ├── sim/                    # Logique pure, sans Three.js ni DOM
    │   ├── level.js            # Lecture de carte, chemin, virages arrondis
    │   └── simulation.js       # Vagues, ennemis, tours, projectiles, économie
    ├── render/                 # Tout le visuel Three.js
    │   ├── assets.js           # Chargement GLB, matériau unique partagé
    │   ├── world.js            # Terrain en InstancedMesh, décor, lumières, château
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
node tools/balance.mjs 10          # le bot joue 10 parties par niveau
node tools/balance.mjs 1 --leaks   # et détaille les ennemis qui passent
```

Résultat actuel (10 parties) : le bot gagne 10/10 en Prairie avec 16 à 20 vies, 10/10 au Col avec 5 à 11 vies, et 8/10 au Canyon avec 0 à 10 vies. Toutes les valeurs d'équilibrage sont dans `src/data/` et `src/config.js`.

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
