# Aetherfall

Roguelite d’aventure en 3D pour mobile (Three.js), dans l’esprit d’Archero : **cours pour esquiver, arrête-toi pour tirer.** Chaque salle nettoyée ouvre le portail suivant ; à chaque niveau, tu choisis 1 capacité parmi 3 et ton héros devient de plus en plus fou. Style anime : héros en ombrage toon avec contours, paysages ouverts (herbe au vent, fleurs, étangs, ciel peint).

Crédits :
- Modèles 3D **KayKit** de Kay Lousberg (CC0) : Adventurers, Skeletons, Dungeon Remastered, Halloween Bits, Medieval Hexagon, Forest Nature Pack ([kaylousberg.itch.io](https://kaylousberg.itch.io), licences dans `assets/kk/`).
- Monstres animés **Ultimate Monsters** de Quaternius (CC0, [quaternius.com](https://quaternius.com)).
- Héros : personnages d’exemple **VRoid** de pixiv ([vroid.com](https://vroid.com)) — HairSample_Male et Sakurada Fumiriya en CC0, AvatarSample_C selon les conditions d’utilisation VRoid (usage libre, y compris commercial) — recolorés et habillés en fantasy (capes, pans de tunique, épaulières). `tools/convert-vroid.mjs` refait la conversion.
- Animations des héros : **Universal Animation Library** de Quaternius (CC0), adaptées au squelette VRoid.
- Icônes de [game-icons.net](https://game-icons.net) (CC BY 3.0) par Lorc, Delapouite, Carl Olsen, Caro Asercion, Sbed, Skoll, Willdabeast, Zeromancer et Darkzaitzev.

## Jouer

- **Joystick flottant** : pose le pouce n’importe où et glisse pour courir. Lâche : le héros s’arrête et tire tout seul sur le monstre le plus proche.
- **8 chapitres de 10 salles**, chacun avec son paysage : Forêt des murmures (prairie ensoleillée), Ruines oubliées (ruines au crépuscule), Cimetière maudit (lande de nuit), Mines de cristal (hauts plateaux aux cristaux lumineux), Toundra gelée (neige, sapins, étangs gelés), Marais toxique (roseaux, eaux vertes, brume), Cœur du volcan (basalte, lave, fissures incandescentes), Citadelle de l’ombre (grande cour de nuit). Un ange après la salle 5 (soin ou capacité), un boss à la salle 10 ; le boss vaincu, la partie est gagnée.
- **Chaque attaque est annoncée** : ligne rouge avant un tir, couloir avant une charge, cercle rouge qui se remplit avant une bombe ou une frappe au sol.
- **Une seconde chance** par partie (tu repars avec la moitié de ta vie).

### Capacités (25)

Flèche frontale, tir multiple, flèches diagonales / latérales / arrière, rebond mural, ricochet, flèches perçantes, attaque, vitesse d’attaque, coups critiques, vie max, flèches de feu / glace / poison, foudre, orbes de feu / glace / foudre qui tournent autour de toi, esquive, bouclier divin, soif de sang, explosion fatale, pas légers, soin.

### Monstres

Chaque chapitre a ses propres monstres (même comportement, autre apparence) :

| Comportement | Forêt | Ruines | Cimetière |
| --- | --- | --- | --- |
| fonce sur toi | champignon | squelette | squelette |
| vise (ligne rouge) puis tire | champignon cracheur | squelette archer | squelette archer |
| se prépare puis charge | orc | orc au crâne | orc au crâne |
| traverse les obstacles | glouton volant, abeilles | fantôme au crâne, chauves-souris | fantôme, feux follets |
| éventail de 3 orbes, téléportation | démon bleu | diablotin | diablotin |
| cercle d’orbes lentes | sorcier | sorcier | mage squelette |
| bombes (sors du cercle rouge) | guerrier tribal | bandit | bandit |
| **Boss** | **Roi Champignon** : charges, frappe au sol, rochers | **Roi squelette** : spirales d’os, cercles, invocations | **Dragon spectral** : téléportation, éventails, chauves-souris |

Chapitres 4 à 8 : blobs qui se divisent en deux en mourant, et de nouveaux boss — **Gardien de cristal**, **Yéti ancestral**, **Tyran des marais**, **Seigneur démon** et le **Maître de l’ombre** (qui enchaîne les attaques des autres boss).

Les boss deviennent plus agressifs sous la moitié de leur vie.

## Progression (entre les parties)

- **Départ** : arc et tunique rares, anneau du loup, chouette, 2 000 pièces d’or et 300 gemmes (les joueurs des versions précédentes reçoivent aussi l’or et les gemmes, une fois).

- **Équipement** (6 emplacements) : arme, armure, 2 anneaux, amulette, familier.
  - 4 armes qui changent le tir : **Arc** (équilibré), **Arbalète** (lente, carreaux qui traversent un ennemi), **Bâton arcanique** (orbes à tête chercheuse), **Lames tournoyantes** (très rapides, rebondissent).
  - 4 raretés : Commun, Rare, Épique, Légendaire (niveau max 10 / 20 / 30 / 40).
  - Améliorer avec l’or, **fusionner 3 exemplaires identiques** pour passer à la rareté suivante, démonter pour récupérer de l’or.
- **Familiers** : chauve-souris, chouette, esprit du givre, salamandre. Ils volent près du héros et tirent tout seuls.
- **Talents** : l’or achète une amélioration au hasard (Force, Vigueur, Agilité, Récupération, Garde, Pillage, Chance, Célérité).
- **Héros** : Aren (archer), **Kaze (assassin, gratuit)**, Kael (rôdeur), Ilian (mage, flèches de foudre), Bran (chevalier), chacun avec sa tenue, son arme et son bonus.
- **Kaze l’assassin** : lance des éventails de 3 kunais (qui traversent un ennemi), se déplace 25 % plus vite. Chaque kunai pose une marque (3 au maximum). **Frappe de l’ombre** automatique : il disparaît, réapparaît derrière un monstre affaibli (moins de 20 % de vie, ou 3 marques et moins de 45 %), l’achève d’un coup, enchaîne jusqu’à 3 exécutions si d’autres sont à portée, puis revient à sa place. Intouchable pendant le saut et 1 s après. Sur un boss sous 30 % de vie : coup fatal (6 fois ses dégâts) au lieu d’une exécution. Recharge 5 s.
- **Boutique** : coffre en bois gratuit toutes les 4 h, coffre doré et coffre du familier en gemmes. Les gemmes se gagnent en jouant (aucun achat réel).
- Un objet est trouvé à chaque chapitre gagné (et parfois après une bonne partie).

## Équilibrage

Un bot joue les chapitres avec la vraie simulation (esquive les tirs, sort des cercles et des couloirs de charge, choisit ses capacités) :

```bash
cd archer
node tools/bot.mjs 20 1 --gear=start   # chapitre 1 avec l’équipement de départ
node tools/bot.mjs 16 2 --gear=start   # chapitre 2, équipement de départ jamais amélioré
node tools/bot.mjs 16 3 --gear=mid     # chapitre 3 avec l’équipement de ~25 parties
```

Réglage global dans `src/config.js` (`difficulty` : dégâts et vie des monstres, hausse par salle).

| Équipement | Chapitre 1 | Chapitre 2 | Chapitre 3 |
| --- | --- | --- | --- |
| départ, jamais amélioré | gagne ~95 % | gagne ~60 % | atteint le boss, gagne ~20 % |
| moyen (~25 parties) | — | — | gagne ~80 % |

Chapitres 4 à 8 avec l’équipement avancé : gagnés ~90 à 100 % (4 à 7), ~50 % (8, le dernier).

Un humain esquive mieux que le bot : c’est une borne basse.

## Technique

- Simulation pure à pas fixe (60 Hz), sans Three.js ni DOM (`src/sim/`), testable dans Node.
- Rendu : héros VRoid (un seul squelette, animations partagées), monstres Quaternius et KayKit, tous en ombrage toon (3 bandes de lumière) avec contour sombre d’épaisseur constante à l’écran ; décors d’une salle fusionnés en quelques maillages ; herbe, fleurs, projectiles et bonus en InstancedMesh. Environ 140 à 160 appels de dessin par image dans une salle de boss chargée.
- Image : paysage sculpté autour de l’arène (collines, arbres, étangs là où la salle a des trous, avec eau animée et écume), herbe et fleurs qui ondulent au vent et s’écartent sous les pas du héros, dallage en ruine, ciel peint (dégradé, nuages aux bords nets, étoiles la nuit), portail lumineux, lumière de contre-jour colorée, contour lumineux sur les personnages, particules d’ambiance, brume au cimetière, halo lumineux (bloom), étalonnage des couleurs par chapitre.
- Caméra : rapprochée et inclinée, elle suit le héros ; au menu, gros plan sur le héros devant le portail, puis plongée vers la salle au lancement.
- Sensations : arrêt sur image quand un monstre meurt, écrasement des monstres à l’impact, tremblement de caméra.
- Interface : icônes vectorielles (plus aucun emoji), badges colorés, boutons et panneaux en relief.
- Modèles compressés (meshopt + quantification, textures WebP) : environ 11 Mo pour tout le jeu. `tools/convert-kaykit.mjs` refait la conversion depuis les packs.
- Résolution dynamique (baisse la netteté avant de couper des effets) et qualité automatique, comme Bastion.
- Hors ligne après la première visite (service worker, cache d’abord) ; installable sur l’écran d’accueil.

```
archer/
├── index.html, styles.css, manifest.webmanifest, sw.js
├── assets/kk/              # Modèles KayKit et Quaternius convertis (CC0)
├── tools/bot.mjs           # Bot d'équilibrage
├── tools/convert-kaykit.mjs # Conversion des packs KayKit
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
