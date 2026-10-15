# Optimisation de la fluidité — 13 octobre 2026

## Diagnostic mesuré

Sur une copie du modèle Compliance (19 tables, 37 relations), le déplacement d'une table déclenchait des recherches de chemin complètes pendant les événements de souris. Le profil V8 attribuait environ 37 % des échantillons à la comparaison des voies occupées. La UI embarquait React en mode développement et créait 800 raccordements DOM, y compris pour des champs non utilisés.

L'essai déplace la table Personne Physique de 90 pixels horizontalement et 50 verticalement en 30 étapes, puis vérifie que la table a réellement bougé. Les autres phases sont le recalcul global, le survol de 12 relations et un déplacement du fond du diagramme. La géométrie et les données de la fixture originale ne sont pas modifiées.

## Corrections

- Renderer portable et widget intégré compilés en mode production, avec minification.
- Raccordements de champ limités aux colonnes et aux rôles source/cible réellement utilisés : **800 → 176**.
- Index des champs, callbacks stables, tables et dessins de relations mémorisés. Les callbacks de sauvegarde restent actualisés même lorsque le dessin est réutilisé.
- Cache des chemins tenant compte des extrémités, de la vue, des définitions enregistrées et des obstacles. Une modification explicite ou une restauration de chemin ne peut pas être masquée par l'ancien cache.
- Pendant un glissement de table, adaptation légère des raccordements ; calcul complet et réparation des obstacles au relâchement. Les chemins indépendants encore valides sont réutilisés.
- Recherche A* avec estimation admissible de distance et coût d'un segment de grille calculé une seule fois, au lieu de répéter le calcul pour chaque direction et orientation.
- Index des segments verticaux pour calculer tous les croisements ; aides d'alignement préparées seulement pour la relation sélectionnée.
- Recalcul global réparti en tranches, boutons temporairement désactivés. Un résultat devenu obsolète après changement de présentation, de graphe, début de déplacement ou démontage est écarté avant toute application.

## Résultats

Profilage de l'ancienne compilation puis de la nouvelle, et confirmation sur le véritable portable. Le temps du thread principal provient de Performance.getMetrics / TaskDuration ; le champ historique cpuMs dans les JSON est cette durée cumulée, pas un taux d'utilisation CPU système.

| Mesure | Avant | Portable optimisé, hors packaging |
| --- | ---: | ---: |
| Thread principal pendant le déplacement testé | 13 384 ms | 678 ms |
| Traitement JavaScript pendant ce déplacement | 12 340 ms | 423 ms |
| Tâches supérieures à 50 ms pendant le déplacement | 61 | 1 |
| Intervalle entre images, 95e percentile pendant le déplacement | 313 ms | 31 ms |
| Thread principal pendant les survols | 1 108 ms | 282 ms |
| Tâches supérieures à 50 ms pendant les survols | 6 | 0 |
| Tâches supérieures à 50 ms pendant le recalcul global | 2 | 0 |
| Raccordements DOM | 800 | 176 |

Le temps de traitement du déplacement baisse d'environ **95 %** dans cet essai. La durée totale de l'action automatisée (attentes et transmission des 30 événements comprises) passe de 14 274 à 1 313 ms. L'application conserve les animations de relations.

Une pointe de 109 ms reste mesurée au relâchement de la table, lorsque le diagramme se stabilise. Le recalcul global demande encore un temps total mesurable, mais laisse désormais l'interface traiter des images et des événements entre ses étapes. Aucune promesse de 60 images/s sur tout modèle et toute machine n'est formulée.

Le premier contrôle du portable a été effectué pendant la compression du ZIP et était perturbé par cette charge. Il est conservé sous delivered.json ; delivered-stable.json correspond au contrôle hors packaging et confirme les résultats de la compilation optimisée. Le scénario emploie le même modèle et la même version d'Electron ; les préférences sont préservées autour des mesures.

## Validation et livraison

- **357 tests, 36 fichiers, zéro échec** dans le périmètre portable.
- Types core/UI/MCP et desktop portable : réussis.
- Contrôles UI hors ligne et MCP stdio : réussis.
- Véritable exécutable livré : gestes, création de détour, Échap, déplacements de table, annulation/rétablissement et sauvegarde validés ; aucune erreur JavaScript observée.
- Régressions couvertes : callbacks de sauvegarde actualisés malgré la mémorisation, absence de raccordements inutiles, rejet d'un recalcul devenu obsolète, croisements distincts des coins et des segments d'une même relation.
- Ancien paquet conservé sous build/performance/app-before-optimization.asar ; dossier data préservé par le packaging.
- Portable et ZIP reconstruits aux emplacements habituels. ZIP extrait et paquet app.asar identique : SHA-256 9DDC524EC019909C79D613984330214D02C67A2990543ABCF2D613EFF7BF96EC.

Preuves : build/performance/before.json, after.json, delivered-stable.json et profils .cpuprofile ; build/routing-review/result.json et captures de l'exécutable optimisé. Les scripts scripts/measure-diagram-performance.mjs et scripts/review-routing-ui.mjs permettent de répéter ces contrôles.

L'application doit être relancée pour charger le nouveau renderer. Le composant intégré est compilé, mais le rafraîchissement d'un éventuel cache de plugin Codex externe reste distinct du portable vérifié.
