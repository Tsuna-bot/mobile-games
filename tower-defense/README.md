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
- **8 tours à 3 niveaux** (5 de départ, 3 à acheter en boutique). Le modèle grandit à chaque amélioration, et une aura dorée apparaît au niveau maximum.

  | Tour | Rôle |
  | --- | --- |
  | Baliste | Tir précis sur une seule cible |
  | Canon | Boulets explosifs, dégâts de zone |
  | Mitrailleuse | Rafales très rapides, faible contre l'armure |
  | Catapulte | Très longue portée, tir en cloche qui anticipe la cible |
  | Givre | Onde qui ralentit les ennemis proches |
  | Tesla (boutique) | Arc électrique qui rebondit sur 3 à 5 ovnis |
  | Arbalète lourde (boutique) | Portée immense, perce l'armure |
  | Mine d'or (boutique) | Ne tire pas, rapporte de l'or à chaque vague |

- **6 sorts** à recharge (3 de départ, 3 à acheter). Leur puissance suit la difficulté des vagues.
  - Météore : un rocher en feu écrase une zone (à viser).
  - Blizzard : gèle les ennemis sur place, moitié du temps pour les boss (à viser).
  - Foudre : éclair en chaîne sur les 5 ennemis les plus proches (à viser).
  - Séisme (boutique) : étourdit et blesse tous les ovnis.
  - Réparation (boutique) : rend 3 vies au château.
  - Pluie d'or (boutique) : or immédiat, qui augmente avec les vagues.
- **Boutique et gemmes** : on gagne des gemmes en finissant des niveaux (gros bonus la première fois), en Héroïque, en Survie et avec les succès. Elles achètent les nouvelles tours et les nouveaux sorts.
- **12 succès** (première victoire, 3 étoiles, campagne finie, 3 000 ovnis détruits, vague parfaite…), chacun récompensé en gemmes.
- **Sauvegarde automatique** : la progression est enregistrée en continu. Une partie en cours est sauvegardée toutes les 4 secondes, en pause et quand on quitte la page. Au retour, la carte « Reprendre la partie » du menu la relance là où on l'avait laissée.
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
- **Rendu réaliste stylisé** :
  - éclairage d'environnement (le ciel se reflète sur les modèles) ;
  - herbe animée par le vent ;
  - mer avec reflets du ciel (Fresnel) et scintillement du soleil ;
  - étalonnage couleur filmique par niveau (courbe, tons chauds/froids, vignette, grain).
- **Barres de vie** : grandes, toujours visibles au-dessus des tours, couleur du vert au rouge selon la vie restante.
- **Qualité** :
  - Ultra : tout Haute + occlusion ambiante (GTAO) ;
  - Haute : bloom, ombres 2048 ;
  - Moyenne : ombres 1024, herbe réduite ;
  - Basse : pas d'ombres ni d'herbe.

  En mode Auto, la qualité baisse d'un cran si le jeu ralentit.

## Contrôles

| Action | Geste |
| --- | --- |
| Construire | Toucher une case d'herbe, choisir une tour (sa portée s'affiche), la toucher à nouveau pour confirmer |
| Améliorer / vendre / cibler | Toucher une tour. Si elle est cachée derrière une autre, toucher encore au même endroit passe à la suivante |
| Déplacer la vue | Glisser un doigt (une fois zoomé) |
| Zoomer | Pincer, ou molette sur ordinateur |
| Lancer la vague | Bouton en bas, ou Espace |
| Lancer un sort | Toucher le sort en bas à gauche, puis la carte (ou touches 1 à 6). Séisme, Réparation et Pluie d'or partent tout de suite |
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
    ├── data/                   # Tours, ennemis, sorts, améliorations, succès, cartes, ambiances, vagues
    ├── sim/                    # Logique pure, sans Three.js ni DOM
    │   ├── level.js            # Lecture de carte, chemin, virages arrondis
    │   └── simulation.js       # Vagues, ennemis, tours, projectiles, économie
    ├── render/                 # Tout le visuel Three.js
    │   ├── assets.js           # Chargement GLB, matériau unique partagé
    │   ├── world.js            # Île, mer, herbe, nuages, ciel, carte d'environnement, lumières
    │   ├── ambient.js          # Particules d'ambiance animées sur le GPU
    │   ├── spellViews.js       # Météore, éclairs, traces au sol
    │   ├── towerViews.js       # Tours empilées, visée, recul, animations
    │   ├── enemyViews.js       # Ovnis (pool), barres de vie, flash, teinte givre
    │   ├── projectileViews.js  # Flèches, boulets, balles, rochers
    │   ├── effects.js          # Particules, ondes, portée, curseur
    │   ├── cameraRig.js        # Cadrage auto, pan, zoom, tremblement
    │   ├── thumbnails.js       # Icônes générées depuis les vrais modèles 3D
    │   └── view.js             # Renderer, post-traitement (GTAO, bloom, étalonnage), qualité adaptative
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

Résultat actuel (bot qui utilise les sorts de départ, mais pas les tours de la boutique) :

| Niveau | Sans amélioration | Avec améliorations moyennes |
| --- | --- | --- |
| 1. Prairie | gagne toujours, 2 étoiles | 3 étoiles |
| 2. Col enneigé | gagne 5 fois sur 6, 0 à 2 étoiles | 3 étoiles |
| 3. Forêt du crépuscule | gagne 5 fois sur 8, 0 à 2 étoiles | 3 étoiles |
| 4. Canyon cristallin | gagne toujours, 1 à 2 étoiles, peu de vies restantes | 3 étoiles |
| 5. Citadelle nocturne | perd toujours | gagne toujours, 2 étoiles |
| Survie | vague 17 | vague 22 |

La difficulté est volontairement élevée : il faut les améliorations, les tours de la boutique et bien viser ses sorts pour tout finir en 3 étoiles. Toutes les valeurs d'équilibrage sont dans `src/data/` et `src/config.js`.

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
