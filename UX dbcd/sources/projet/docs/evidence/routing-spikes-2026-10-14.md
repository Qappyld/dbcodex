# Correction des demi-tours et détours excessifs

Les captures utilisateur montrent un segment vertical qui dépasse son coude avant de revenir sur lui-même, ainsi qu'un grand crochet. La première géométrie est inutile ; la pertinence exacte de la seconde dépend des obstacles hors cadre.

Deux causes identifiées dans le code : la simplification conservait explicitement les demi-tours colinéaires ; la congestion ajoutait 2 000 unités par arête de grille partagée. La subdivision de la grille par des tables sans rapport pouvait donc favoriser un très grand détour.

Correction : suppression des segments retracés sur la même ligne (sans supprimer les boucles rectangulaires) et pénalité proportionnelle à la longueur partagée, de 0,35 unité par unité de longueur. Les croisements coûtent 24 unités, contre 150 auparavant. Les tables restent des obstacles stricts. Deux tests de régression reproduisent un dépassement vertical et un détour injustifié dans un espace libre.

Validation : 53 tests de routage, composants de relation et canvas passent. Vérification TypeScript UI réussie. Bundles desktop et UI reconstruits. Le portable corrigé est livré séparément dans `release/routing-fix-2026-10-14/DBCodex-win32-x64` pour préserver les applications déjà ouvertes.

Les tracés automatiques déjà enregistrés nécessitent un recalcul avec le bouton supérieur. Un détour enregistré en mode manuel est conservé ; la réinitialisation de la relation sélectionnée permet de le remplacer.

Le portable final passe également les gestes réels (souris, clavier, annulation, sauvegarde, déplacement de table et réinitialisation), sans erreur JavaScript. Résultats : `build/routing-review/result.json`. La capture d'ensemble `build/routing-review/overview-light.png` a été inspectée. Les préférences du portable livré ne conservent pas le projet temporaire du test.

## Mise à jour du portable principal

Après signalement de l'utilisateur, le portable principal a été reconstruit depuis les sources actuelles et installé dans `release/DBCodex-win32-x64`, application fermée. L'archive principale `release/DBCodex-0.1.0-win-x64.zip` a été régénérée. Les essais réels de routage passent également dans cet exécutable principal ; les préférences utilisateur ont été restaurées après le test. Sauvegarde du bundle précédent : `build/main-routing-update/app-before-update.asar`.
