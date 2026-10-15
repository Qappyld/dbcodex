# Interface Windows — 13 octobre 2026

- Barre application de 36 px et barre atelier de 40 px, sans menu Electron par défaut.
- Menu Fichier disponible dans l’accueil et dans l’atelier : création, ouverture .dbcd, fichiers récents, import/export DBML.
- Ctrl+O ouvre un fichier ; Échap ferme le menu et rend le focus à Fichier.
- Icônes SVG locales, infobulles et noms accessibles pour les commandes de l’atelier.
- Ouvrir un autre projet conserve la fenêtre et son brouillon ; un projet déjà ouvert est en lecture seule dans une seconde fenêtre.

Validation : compilation desktop, vérification TypeScript et 21 tests ciblés réussis. Vérification Electron automatisée avec `scripts/review-windows-ui.mjs` : ouverture par dialogue et par récent, conservation du brouillon, lecture seule, fermeture du menu, absence de débordement aux largeurs 850/1000/1440, thème sombre. Captures et résultat dans `build/ui-review/`.

Portable reconstruit dans `release/DBCodex-win32-x64/` et archive `release/DBCodex-0.1.0-win-x64.zip`.

## Harmonisation et sens des relations

Les liaisons affichent trois petites boules animées en continu, de la source vers la cible, sur le tracé SVG exact. Le bouton Animations permet de suspendre/reprendre le mouvement ; une flèche fixe indique le sens même en pause ou en mode de réduction des mouvements. Les points d’attache gauche/droite suivent la position des tables pour éviter de traverser les deux tables reliées. Les cardinalités restent placées à l’extérieur des tables.

Boutons, champs, panneaux, tables, notes et barre flottante harmonisés ; icônes et infobulles sur les outils du diagramme, état actif visible pour Relations, Grille et Animations. Vérification TypeScript, compilation et 50 tests ciblés réussis. Vérifications Electron : déplacement réel sans survol, tracé SVG commun à la ligne et aux boules, pause/reprise, réduction des mouvements, largeurs 850/1000/1440. Captures dans `build/ui-review/relations-animated.png` et `relations-compact.png`.

## Correction du bouton Relations

Relations commande désormais les boules sur toutes les liaisons, sans modifier la visibilité des lignes. Lorsqu’il est désactivé, seule la liaison sélectionnée affiche ses boules. Le bouton Animations redondant est retiré. Validation : 35 tests ciblés réussis et vérification Electron avec clic réel sur une liaison, désélection et activation globale. Portable livré dans `release/relations-update/DBCodex-win32-x64`, car le dossier de l’exécutable précédent était verrouillé.

## Version unique

Après déverrouillage, la version corrigée est regroupée dans `release/DBCodex-win32-x64`, avec l’archive principale `release/DBCodex-0.1.0-win-x64.zip` actualisée. Le dossier temporaire `release/relations-update` est supprimé. Les préférences et fichiers du dossier `data` principal sont conservés.

## Routage en haut et boules toujours visibles

Le bouton Routage automatique apparaît dans le panneau supérieur centré du diagramme, uniquement pour une relation sélectionnée et modifiable. Il n’est plus ancré sur la ligne. Les boules ont un rayon de 4,5 et restent visibles en réduction des mouvements : elles sont alors fixes sur le tracé. En mode normal, elles circulent en continu sur toutes les relations lorsque Relations est activé, sinon sur la relation sélectionnée. Vérifications : TypeScript, 35 tests ciblés, clic réel de sélection, position haute centrée, mouvement effectif et boules fixes en réduction des mouvements. Le packaging préserve désormais explicitement le dossier data lors de la reconstruction.

## Animation explicite des relations

À la demande de l’utilisateur, Relations et la sélection d’une liaison déclenchent désormais une animation continue même si Windows demande de réduire les mouvements. Le mode fixe conditionné par `prefers-reduced-motion` est retiré de la logique SVG. Validation : mouvement mesuré dans Electron avec et sans réduction des mouvements, 35 tests ciblés réussis. Version unique reconstruite, données conservées.

## Gestes, couleurs et groupes — Compliance Solution

- Bouton central maintenu : déplacement du diagramme. Glissé gauche depuis le fond : sélection multiple partielle, sans déplacer le viewport.
- En-têtes de tables à fond coloré ; `headercolor` DBML conservé, priorité à la couleur individuelle puis à celle du groupe. Texte contrasté sur les en-têtes.
- Lignes et boules suivent la couleur de la table référencée. Cliquer sur une table anime toutes ses relations lorsque Relations est désactivé.
- Poignées de routage de 28 px de diamètre, indépendamment du zoom.
- En-tête des groupes déplaçable, bouton de réduction distinct ; déplacement de toutes les tables du groupe et groupe sélectionné maintenu derrière les tables.
- Panneau Vues : regroupement par groupes de tables ou schémas, affichage visible/total, checkbox partielle, affichage/masquage du groupe ou de chaque table. Les relations des tables masquées disparaissent.
- `fixtures/Compliance Solution.dbcd` : DBML fourni conservé exactement, 19 tables, 37 relations, 4 groupes, disposition inspirée des captures ; source dans `fixtures/Compliance Solution.dbml`.

Validation : TypeScript, 71 tests ciblés et tests Electron par souris réelle avec `scripts/review-compliance-ui.mjs`. Résultat dans `build/ui-review/compliance-interactions.json`, captures `compliance-overview.png`, `selection-box.png`, `compliance-partial-group.png`. Unique portable et archive principale reconstruits avec préservation de data.
