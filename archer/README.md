# Sagittaire

Roguelite d’archer en 3D pour mobile (Three.js), dans l’esprit d’Archero : **cours pour esquiver, arrête-toi pour tirer.** Chaque salle nettoyée ouvre la porte suivante ; à chaque niveau, tu choisis 1 capacité parmi 3 et ton archère devient de plus en plus folle.

Modèles 3D de Kenney, licence CC0 : [Mini Characters](https://kenney.nl/assets/mini-characters), [Mini Dungeon](https://kenney.nl/assets/mini-dungeon), [Graveyard Kit](https://kenney.nl/assets/graveyard-kit), [Nature Kit](https://kenney.nl/assets/nature-kit) (licences dans `assets/models/`).

## Jouer

- **Joystick flottant** : pose le pouce n’importe où et glisse pour courir. Lâche : le héros s’arrête et tire tout seul sur le monstre le plus proche.
- **3 chapitres de 10 salles** : Forêt des murmures, Cachots oubliés, Cimetière maudit. Un ange après la salle 5 (soin ou capacité), un boss à la salle 10.
- **Chaque attaque est annoncée** : ligne rouge avant un tir, couloir avant une charge, cercle rouge qui se remplit avant une bombe ou une frappe au sol.
- **Une seconde chance** par partie (tu repars avec la moitié de ta vie).

### Capacités (25)

Flèche frontale, tir multiple, flèches diagonales / latérales / arrière, rebond mural, ricochet, flèches perçantes, attaque, vitesse d’attaque, coups critiques, vie max, flèches de feu / glace / poison, foudre, orbes de feu / glace / foudre qui tournent autour de toi, esquive, bouclier divin, soif de sang, explosion fatale, pas légers, soin.

### Monstres

| Monstre | Comportement |
| --- | --- |
| Zombie | fonce sur toi |
| Squelette archer | vise (ligne rouge) puis tire |
| Orc chargeur | se prépare puis charge en ligne droite |
| Fantôme, feu follet | traversent les obstacles |
| Vampire | éventail de 3 orbes, se téléporte |
| Nécromancien | cercle d’orbes lentes |
| Bandit grenadier | bombes : sors du cercle rouge |
| **Ogre des bois** (boss) | charges, frappe au sol, rochers |
| **Roi squelette** (boss) | spirales d’os, cercles, invocations |
| **Comte vampire** (boss) | téléportation, éventails, chauves-souris |

Les boss deviennent plus agressifs sous la moitié de leur vie.

## Progression (entre les parties)

- **Équipement** (6 emplacements) : arme, armure, 2 anneaux, amulette, familier.
  - 4 armes qui changent le tir : **Arc** (équilibré), **Arbalète** (lente, carreaux qui traversent un ennemi), **Bâton arcanique** (orbes à tête chercheuse), **Lames tournoyantes** (très rapides, rebondissent).
  - 4 raretés : Commun, Rare, Épique, Légendaire (niveau max 10 / 20 / 30 / 40).
  - Améliorer avec l’or, **fusionner 3 exemplaires identiques** pour passer à la rareté suivante, démonter pour récupérer de l’or.
- **Familiers** : chauve-souris, chouette, esprit du givre, salamandre. Ils volent près du héros et tirent tout seuls.
- **Talents** : l’or achète une amélioration au hasard (Force, Vigueur, Agilité, Récupération, Garde, Pillage, Chance, Célérité).
- **Héros** : Lyra (archère), Kael (rôdeur), Iris (mage, flèches de foudre), Bran (chevalier), chacun avec son bonus.
- **Boutique** : coffre en bois gratuit toutes les 4 h, coffre doré et coffre du familier en gemmes. Les gemmes se gagnent en jouant (aucun achat réel).
- Un objet est trouvé à chaque chapitre gagné (et parfois après une bonne partie).

## Équilibrage

Un bot joue les chapitres avec la vraie simulation (esquive les tirs, sort des cercles et des couloirs de charge, choisit ses capacités) :

```bash
cd archer
node tools/bot.mjs 20 1                # chapitre 1, sans équipement
node tools/bot.mjs 16 2 --gear=early   # chapitre 2 avec l’équipement de ~5 parties
node tools/bot.mjs 16 3 --gear=mid     # chapitre 3 avec l’équipement de ~25 parties
```

| Équipement | Chapitre 1 | Chapitre 2 | Chapitre 3 |
| --- | --- | --- | --- |
| aucun | gagne ~60 % | — | — |
| début (~5 parties) | — | atteint parfois le boss | bloqué tôt |
| moyen (~25 parties) | — | gagne ~80 % | atteint le boss, gagne ~15 % |
| avancé | — | gagne toujours | gagne toujours |

Un humain esquive mieux que le bot : c’est une borne basse.

## Technique

- Simulation pure à pas fixe (60 Hz), sans Three.js ni DOM (`src/sim/`), testable dans Node.
- Rendu : modèles instanciés, projectiles et bonus en InstancedMesh, particules GPU, ombres douces sous les personnages. Environ 180 appels de dessin dans une salle de boss chargée.
- Résolution dynamique (baisse la netteté avant de couper des effets) et qualité automatique, comme Bastion.
- Hors ligne après la première visite (service worker, cache d’abord) ; installable sur l’écran d’accueil.

```
archer/
├── index.html, styles.css, manifest.webmanifest, sw.js
├── assets/models/          # Modèles Kenney (CC0)
├── tools/bot.mjs           # Bot d'équilibrage
└── src/
    ├── data/               # Capacités, monstres, chapitres, équipement, talents, familiers, héros
    ├── sim/                # Arène (grille, collisions, chemins), run (héros, tirs, salles), IA des monstres
    ├── meta/profile.js     # Inventaire, coffres, fusions, talents, héros, stats de partie
    ├── render/             # Arène 3D, personnages animés, effets
    ├── input/joystick.js   # Joystick flottant
    ├── ui/                 # Interface, vibrations
    └── game/               # Orchestration et menus
```

## Lancer en local

```bash
python3 -m http.server 8000   # depuis la racine du dépôt
# puis http://localhost:8000/archer/
```
