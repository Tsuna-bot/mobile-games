# Aetherfall

Roguelite d’aventure en 3D pour mobile (Three.js), dans l’esprit d’Archero : **cours pour esquiver, arrête-toi pour tirer.** Chaque salle nettoyée ouvre le portail suivant ; à chaque niveau, tu choisis 1 capacité parmi 3 et ton héros devient de plus en plus fou. Style anime : héros en ombrage toon avec contours, paysages ouverts (herbe au vent, fleurs, étangs, ciel peint).

Crédits :
- Modèles 3D **KayKit** de Kay Lousberg (CC0) : Adventurers, Skeletons, Dungeon Remastered, Halloween Bits, Medieval Hexagon, Forest Nature Pack ([kaylousberg.itch.io](https://kaylousberg.itch.io), licences dans `assets/kk/`).
- Monstres animés **Ultimate Monsters** de Quaternius (CC0, [quaternius.com](https://quaternius.com)).
- Arbres, rochers, fougères, fleurs et champignons du **Stylized Nature MegaKit** de Quaternius (CC0), convertis par `tools/convert-nature.mjs` (un seul fichier, textures réduites en WebP, troncs simplifiés).
- Héros : personnages d’exemple **VRoid** de pixiv ([vroid.com](https://vroid.com)) — HairSample_Male et Sakurada Fumiriya en CC0, AvatarSample_C selon les conditions d’utilisation VRoid (usage libre, y compris commercial) — recolorés et habillés en fantasy (capes, pans de tunique, épaulières). `tools/convert-vroid.mjs` refait la conversion.
- Animations des héros : **Universal Animation Library** de Quaternius (CC0), adaptées au squelette VRoid.
- Icônes de [game-icons.net](https://game-icons.net) (CC BY 3.0) par Lorc, Delapouite, Carl Olsen, Caro Asercion, Sbed, Skoll, Willdabeast, Zeromancer, Darkzaitzev et Lucas.

## Jouer

- **Joystick flottant** : pose le pouce n’importe où et glisse pour courir. Lâche : le héros s’arrête et tire tout seul sur le monstre le plus proche.
- **18 chapitres de 10 salles**, chacun avec son paysage : Forêt des murmures (prairie ensoleillée), Ruines oubliées (ruines au crépuscule), Cimetière maudit (lande de nuit), Mines de cristal (hauts plateaux aux cristaux lumineux), Toundra gelée (neige, sapins, étangs gelés), Marais toxique (roseaux, eaux vertes, brume), Cœur du volcan (basalte, lave, fissures incandescentes), Citadelle de l’ombre (grande cour de nuit), puis Dunes d’Ashara (cactus, palmiers, oasis), Jardin des cerisiers (pétales qui tombent), Bois d’automne (feuilles rousses), Abysses de corail (coraux lumineux, bulles), Îles célestes (au-dessus des nuages), Jungle d’émeraude (champignons géants lumineux), Pics de l’orage (pluie battante), Faille du néant (cristaux violets, fissures), Cité d’or et Trône céleste (la fin). La **carte du monde** (bouton Carte ou toucher le nom du chapitre) montre tout d’un coup d’œil. Un ange après la salle 5 (soin ou capacité), un boss à la salle 10 ; le boss vaincu, la partie est gagnée.
- **Chaque attaque est annoncée** : ligne rouge avant un tir, couloir avant une charge, cercle rouge qui se remplit avant une bombe ou une frappe au sol.
- **Une seconde chance** par partie (tu repars avec la moitié de ta vie).
- **3 sorts par héros** : des boutons à droite de l’écran, avec leur temps de recharge (voir plus bas).
- **Butin en partie** : les monstres lâchent parfois un objet (colonne de lumière de la couleur de sa rareté), les élites souvent, les boss toujours (deux à partir du chapitre 7) et de meilleure qualité. Plus on avance, plus les objets sont rares et de haut niveau. Les élites et les boss lâchent aussi des **runes**. Tout ce qui est ramassé est gardé, même en cas de défaite.

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

Chapitres 9 à 18 : **Scarabée colosse**, **Kitsune céleste**, **Chef des brigands**, **Léviathan**, **Dragon céleste**, **Seigneur orc**, **Chevalier-tempête**, **Œil du néant**, **Pharaon éternel** et l’**Archonte déchu**.

Les boss deviennent plus agressifs sous la moitié de leur vie.

## Modes de jeu

- **Normal** : les 8 chapitres, l'un après l'autre.
- **Héroïque** (ouvert chapitre par chapitre, une fois le chapitre gagné en Normal) : monstres 3 fois plus résistants, 60 % plus forts, beaucoup plus d'élites ; meilleur butin (épique et légendaire), gemmes doublées.
- **Infini** (ouvert après le chapitre 1) : des salles sans fin, un boss toutes les 5 salles (les 8 boss à tour de rôle), un ange après chaque boss, le paysage change à chaque boss ; 5 gemmes par boss, un objet à partir de la salle 10 (meilleur plus on va loin). Record gardé.
- **Monstres d'élite** (dès le chapitre 2) : plus grands, dorés, 2,6 fois plus de vie, frappent plus fort, lâchent 3 fois plus d'or et souvent un cœur.
- **Salles spéciales** : *salle au trésor* (peu de monstres, un coffre qui explose en pièces d'or) et *salle de défi* (que des élites ; récompense : 3 gemmes et une capacité).

## Progression (entre les parties)

- **Niveau des héros** (1 à 50) : chaque héros gagne de l’expérience dans ses propres parties ; chaque niveau donne +2 % d’attaque et de vie.
- **Sorts** : 3 par héros, appris aux niveaux 1, 4 et 8, améliorés jusqu’au rang 5 avec de l’or et des runes (le rang suivant demande aussi un niveau de héros). Plus de dégâts et une recharge plus courte à chaque rang.
  - Aren : Pluie de flèches, Flèche du vent (traverse tout), Œil du faucon (cadence et critique).
  - Kaze : Pas de l’ombre (bond intouchable), Frappe de l’ombre (disparaît, achève les ennemis affaiblis dans leur dos, enchaîne), Marque mortelle (frappe l’ennemi le plus robuste).
  - Kael : Salve circulaire, Ronces (ralentit, empoisonne), Instinct sauvage.
  - Ilian : Nova de givre (gèle), Météore, Chaîne d’éclairs.
  - Bran : Frappe sismique (repousse, étourdit), Rempart sacré (intouchable, soin), Charge du lion.
- **Classes** (niveau 12, rangs 1 à 5 avec or et runes : bonus +25 % par rang ; chaque classe apprend un **4e sort** qui monte avec elle — Tir fatal, Déluge, Éventail de kunaïs, Faux du bourreau, Flèches chercheuses, Sève sacrée, Pluie de feu, Blizzard, Jugement, Tourbillon) : deux par héros, par exemple Tireur d’élite ou Maître des volées pour Aren, Pyromancien ou Cryomancien pour Ilian, Paladin ou Berserker pour Bran. Chaque classe donne des bonus et renforce un sort. Premier choix gratuit, changement pour 50 gemmes.
- **Niveau de compte** : chaque partie donne de l'expérience (salles, monstres, victoires). Chaque niveau rapporte un point de talent, des gemmes et de l'or.
- **Arbre de talents** : 3 branches (Guerre, Garde, Fortune) de 5 paliers, avec des capstones (une capacité de départ en plus, bouclier divin dès le départ, un deuxième ange). Réinitialisation gratuite.
- **Missions du jour** : 3 missions par jour (monstres, salles, élites, boss, coffres, améliorations…) ; les 3 accomplies donnent un coffre doré.
- **Succès** : 15 succès à plusieurs paliers (monstres, salles, chapitres, boss, élites, Infini, Héroïque, légendaires, éveils, niveau, héros), récompensés en gemmes.
- **Ensembles** : Chasseur, Rempart, Arcane, Ombre ; bonus à 2 et 4 pièces différentes (cadence, vie, attaque, critique ; flèche frontale, bouclier divin, orbe de foudre, explosions).
- **Pouvoirs légendaires** : chaque objet légendaire a son pouvoir (volée, carreaux explosifs, orbes jumeaux, tempête, venin, furie, voile d'ombre…).
- **Éveil** : un objet épique ou légendaire à son niveau maximum peut être éveillé 3 fois (gemmes et or), +15 % de stats par étoile.

- **Départ** : arc et tunique rares, anneau du loup, chouette, 2 000 pièces d’or et 300 gemmes (les joueurs des versions précédentes reçoivent aussi l’or et les gemmes, une fois).

- **Équipement** (6 emplacements) : arme, armure, 2 anneaux, amulette, familier.
  - 7 armes qui changent le tir : **Arc** (équilibré), **Arbalète** (lente, carreaux qui traversent un ennemi), **Bâton arcanique** (orbes à tête chercheuse), **Lames tournoyantes** (très rapides, rebondissent), **Arc long** (lent, traverse tous les ennemis), **Shurikens** (reviennent vers toi et frappent deux fois), **Grimoire de foudre** (orbes lents, éclair en chaîne à chaque coup).
  - Armures et amulettes en plus : **Tenue de l'ombre** (esquive, vitesse), **Croc de l'ombre** (dégâts critiques).
  - 4 raretés : Commun, Rare, Épique, Légendaire (niveau max 10 / 20 / 30 / 40).
  - Améliorer avec l’or, **fusionner 3 exemplaires identiques** pour passer à la rareté suivante, démonter pour récupérer de l’or.
- **Familiers** : chauve-souris, chouette, esprit du givre, salamandre. Ils volent près du héros et tirent tout seuls.
- **Entraînement** : l’or achète une amélioration au hasard (Force, Vigueur, Agilité, Récupération, Garde, Pillage, Chance, Célérité).
- **Héros** : Aren (archer), **Kaze (assassin, gratuit)**, Kael (rôdeur), Ilian (mage, flèches de foudre), Bran (chevalier), chacun avec sa tenue, son arme et son bonus.
- **Armes et équipement** : chaque arme tire de la même façon quel que soit le héros. Chaque objet et chaque familier est **conseillé** pour certains héros (coche verte dans l’inventaire), avec un bonus par emplacement : arme +12 % d’attaque, armure +10 % de vie, anneau +5 % d’attaque, amulette +4 % d’attaque et de vie, familier +25 % de puissance.
  - Aren : Arc de chasse, Arc long, Tunique de cuir, Anneaux du faucon et du loup, Amulette de rage, familier Chouette.
  - Kaze : Shurikens, Lames tournoyantes, Tenue de l’ombre, Anneaux du serpent et du loup, Croc de l’ombre, familier Chauve-souris.
  - Kael : Arbalète, Arc long, Tunique de cuir, Anneaux du serpent et du faucon, Amulette de fortune, familier Chouette.
  - Ilian : Bâton arcanique, Grimoire de foudre, Robe enchantée, Anneaux du faucon et de l’ours, Amulette de fortune, familiers Esprit du givre et Salamandre.
  - Bran : Arbalète, Arc de chasse, Cotte de mailles, Anneau de l’ours, Amulettes de vie et de rage, familier Salamandre.
- **Boutique** : coffre en bois gratuit toutes les 4 h, coffre doré et coffre du familier en gemmes. Les gemmes se gagnent en jouant (aucun achat réel).
- Un coffre de victoire à chaque chapitre gagné, en plus du butin ramassé en route. Le bouton **Recycler** de l’équipement démonte d’un coup les objets communs en trop.

## Équilibrage

Un bot joue les chapitres avec la vraie simulation (esquive les tirs, sort des cercles et des couloirs de charge, choisit ses capacités) :

```bash
cd archer
node tools/bot.mjs 20 1 --gear=start   # chapitre 1 avec l’équipement de départ
node tools/bot.mjs 16 2 --gear=start   # chapitre 2, équipement de départ jamais amélioré
node tools/bot.mjs 16 3 --gear=mid     # chapitre 3 avec l’équipement de ~25 parties
node tools/bot.mjs 6 1 --gear=mid --mode=endless    # mode Infini
node tools/bot.mjs 6 2 --gear=late --mode=heroic    # chapitre 2 en Héroïque
node tools/bot.mjs 8 2 --gear=start --weapon=shuriken   # une autre arme
```

Réglage global dans `src/config.js` (`difficulty` : dégâts et vie des monstres, hausse par salle).

| Équipement | Chapitre 1 | Chapitre 2 | Chapitre 3 |
| --- | --- | --- | --- |
| départ, jamais amélioré | gagne ~95 % | gagne ~60 % | atteint le boss, gagne ~20 % |
| moyen (~25 parties) | — | — | gagne ~80 % |

Chapitres 4 à 8 avec l’équipement avancé : gagnés ~90 à 100 % (4 à 7), ~50 % (8, le dernier). Infini : le bot atteint en général les salles 10 à 35 avec un équipement moyen.

Armes au chapitre 2 avec l'équipement de départ : arc ~5/6, arbalète 6/6, arc long 6/6, grimoire 5/6, shurikens 6/8.

Avec les sorts (le bot les lance dès qu’ils sont prêts) : chapitre 3 gagné 4/4 avec l’équipement de départ ; chapitre 9 ~25 % avec l’équipement moyen et un héros niveau 15 ; avec l’équipement avancé et un héros niveau 30 : chapitres 9 et 12 gagnés 4/4, 15 : 3/4, 18 (le dernier) : 1/4. Options du bot : `--hlevel=15` (niveau du héros, sorts inclus), `--spells=off`.

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
