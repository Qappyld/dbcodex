# Routage : étude dbdiagram et validation du portable

## Observation du projet de test

Étude interactive dans le navigateur de Quentin : https://dbdiagram.io/d/Test-Compliance-solution-6acf2c2d064322c869455e45.

Gestes réalisés sur la relation Règle de Calcul → Analyse de risque : déplacement d'un segment, déplacement puis retour de la table, réinitialisation locale, création d'un détour depuis un petit point intermédiaire, puis nouvelle réinitialisation locale. Le texte du schéma n'a pas été modifié. La relation étudiée est laissée avec un tracé simplifié et la vue ajustée à 40 %.

Constats observables : les grandes poignées déplacent un segment avec ses coudes voisins ; les petits points créent un détour autour de la zone saisie ; le premier coude suit le champ lors du déplacement de sa table ; un très petit décrochement peut disparaître. Le nombre de poignées dépend donc de la géométrie et de la place disponible, plutôt que d'un nombre fixe par relation. Ces observations ne permettent pas de déterminer l'algorithme interne de dbdiagram.

Capture après réinitialisation : `build/dbdiagram-study/dbdiagram-reset.jpg`.

## Changements DBCodex

- Les coudes proches des extrémités suivent directement la hauteur du champ. Les petits décrochements de bord sont simplifiés, et le reste du trajet manuel est conservé.
- Les détours sont créés autour du point saisi ; les contrôles intermédiaires sont symétriques, aux quarts du segment. La poignée principale reste prioritaire quand leurs zones de saisie se recouvrent.
- Pour les tables superposées horizontalement, les nouveaux tracés automatiques choisissent un côté extérieur commun. Le choix tient compte de la longueur et des obstacles ; il s'agit d'une heuristique DBCodex, pas d'un algorithme confirmé de dbdiagram.
- Les anciens tracés manuels restent compatibles. Le bouton supérieur de routage automatique conserve les tracés manuels par défaut ; la remise à zéro explicite de toutes les relations reste disponible.

## Validation

369 tests sur 37 fichiers passent ; vérifications TypeScript core, UI, MCP et desktop réussies. Après la dernière modification de priorité des poignées, les 12 tests DirectedRelationEdge passent également. Builds de production UI et desktop, contrôles hors ligne et intégration MCP réussis.

Le portable final a été testé réellement : orthogonalité, édition au clavier, annulation/rétablissement, conservation des tracés manuels au recalcul global, sauvegarde, remise à zéro explicite, annulation du geste par Échap, insertion à la souris et déplacement d'une table. Aucune erreur JavaScript observée. Résultat : `build/routing-review/result.json` ; captures : `build/routing-review/pointer-detour-light.png` et `overview-light.png`.

Mesure sur Compliance (19 tables, 37 relations, 176 points d'attache, animations actives) : aucune tâche principale de plus de 50 ms pendant les scénarios de recalcul, survol, déplacement et panoramique. Le déplacement mesuré dure 1 281 ms au total, dont 406 ms de script ; ce total inclut le geste simulé et les attentes. Le champ historique `cpuMs` correspond au TaskDuration CDP, pas à un pourcentage de CPU. Ces mesures portent sur un scénario local, sans garantir la fluidité de tous les schémas. Détails : `build/performance/dbdiagram-study-2026-10-14.json` et profil CPU associé.

## Livraison Windows

Le portable d'origine étant ouvert et verrouillé par Windows, la mise à jour est livrée séparément sans fermer la session utilisateur :

- `release/routing-2026-10-14/DBCodex-win32-x64/DBCodex.exe`
- `release/routing-2026-10-14/DBCodex-0.1.0-win-x64.zip`

L'archive contient le même `resources/app.asar` que le portable testé, vérifié par SHA-256 : `55CD17D317BDA2551D16DAB7CBF87F63B537FF55ACD8456BBEF4D116A36A8407`.

Le fichier de préférences du nouveau portable ne conserve pas le projet temporaire des tests. Les préférences et fichiers de la version déjà ouverte restent intacts. Sauvegarde préalable de l'ancien bundle : `build/dbdiagram-study/app-before-study.asar`.
