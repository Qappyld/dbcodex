# Rationalisation et performances — 15 octobre 2026

## Périmètre et résultat

Revue du code actif du cœur, de l'atelier React, du pont MCP et de la version portable. Les modifications déjà présentes au début de l'intervention sont conservées. Les archives de migration et l'ancien module de conversation ne sont pas réécrits. Les optimisations concernent les traitements partagés et les opérations répétées, sans changement de format `.dbcd` ni de contrat MCP.

La version de développement est compilée dans `packages/desktop/dist`, ainsi que le widget. Le dossier portable installé dans `release/DBCodex-win32-x64` et son archive ne sont pas remplacés par cette intervention. Aucun déploiement ou publication n'a été effectué.

## Revue par fonctionnalité

| Fonctionnalité | Diagnostic et traitement | Vérification |
| --- | --- | --- |
| Création, ouverture, import/export DBML | Analyse répétée du même texte ; cache partagé limité, index des positions de champs | Tests parsing, transfert, stockage et limites de ressources |
| Édition DBML, diagnostics | Validation temporisée déjà présente ; réutilisation du parsing pour les textes identiques, aucune réutilisation pour un texte modifié | Tests éditeur, session, cache et construction |
| Brouillons et récupération | Les lectures avant/après transaction reparsaient le document enregistré ; le cache évite ce travail sans supprimer les lectures ou contrôles du disque | Tests récupération, conflits, transactions et corruption |
| Enregistrement et restauration | Suppression d'une analyse doublonnée dans `saveProject`, réutilisation des analyses entre opérations | Tests historique, restauration, épinglage et intégration MCP |
| Rafraîchissement externe | Parsing réutilisé ; fréquence de 2 s et suspension lorsque masqué conservées | Tests de session ; lecture du fichier et vérifications de génération maintenues |
| Diagramme, déplacement individuel, survol | Index des nœuds au lieu d'une recherche linéaire pour chaque nœud/relation ; caches de routage existants conservés | Tests du canvas, relations et script Electron réel |
| Déplacement de groupes/multisélections | Une seule copie et validation du document au lieu d'une par table | Test d'équivalence, atomicité et benchmark de 100 tables |
| Réorganisation et couleur d'une sélection | Réutilisation de la commande groupée ; suppression d'une copie supplémentaire lors de la coloration | Tests de commandes et interactions |
| Recherche | Retour immédiat pour une requête vide, index des noms de groupes par table | Tests des commandes et vues |
| Vues, aperçu de visibilité | Calcul mémorisé selon le graphe, la présentation et l'aperçu ; pas de nouvelle copie à chaque rendu sans changement | Tests ViewManager/ViewInspector/visibilité |
| Construction SharePoint, Dataverse, SQL | Index des relations par table et colonne ; index des tables et colonnes affichables pour les diagnostics ; règles partagées avec le sélecteur Lookup | Tests des modèles, commandes, SchemaBuilder et nouveaux tests d'index |
| Relations N:N | Appartenance des tables vérifiée dans un ensemble au lieu de parcours répétés | Tests des commandes de construction |
| Historique et comparaison | Tri mémorisé des révisions ; comparaison déjà mémorisée et LCS déjà borné conservés | Tests HistoryPanel et revision-diff |
| Session, panneaux, annuler/rétablir | Suppression de la sérialisation initiale de présentation répétée à chaque rendu ; lecture de l'enveloppe mémorisée | Tests session, récupération et interactions |
| Notes, détails, sélection, plein écran | Pas de changement de comportement ; pas de gain spécifique revendiqué | Tests existants de l'atelier et du pont |
| Lanceur, récents, thème | Pas de nouveau cache de fichiers/préférences ; comportement conservé | Tests de stockage portable ; inspection du lanceur |
| Mises à jour | Contrôles de signature, empreintes, verrouillage et récupération conservés ; aucune réduction des vérifications | Suites updater, update-manifest, apply-update |

## Limites du cache

Le cache porte uniquement sur le résultat de `parseDbml`, indexé par le texte exact, et non sur l'état du fichier. Il conserve au maximum quatre entrées avec éviction LRU, et un budget cumulé de 2 000 000 caractères pour le texte source et la représentation JSON des résultats. Ce budget est une borne de volume logique, pas une mesure exacte du tas JavaScript. Les sources dépassant 500 000 caractères ne sont pas conservées. Les résultats trop volumineux ne le sont pas non plus.

Chaque appel reçoit une copie indépendante ; modifier un graphe ou un diagnostic ne contamine pas les appels suivants. Le chemin du résultat est celui de l'appel courant. Les limites de taille sont vérifiées avant la consultation du cache. Les contrôles SQLite, empreintes, chemins, générations et révisions restent exécutés.

## Mesures avant/après

Mesures locales Node 24, sur le même poste, à partir du cœur compilé avant puis après modification. Médianes de 15 opérations, sauf les enregistrements (5). Les projets sont créés dans un dossier temporaire, supprimé après le test. Les ouvertures sont répétées dans un processus chaud : il ne s'agit pas du démarrage d'Electron ni d'une première ouverture à froid.

| Opération | Compliance, 19 tables, avant → après | Synthétique, 100 tables et 3 100 colonnes, avant → après |
| --- | ---: | ---: |
| Parsing d'un texte identique | 21,48 → 0,92 ms | 118,65 → 10,23 ms |
| Ouverture répétée | 22,24 → 5,43 ms | 121,59 → 14,81 ms |
| Persistance d'un brouillon | 49,89 → 13,62 ms | 248,76 → 32,61 ms |
| Enregistrement explicite | 83,83 → 16,76 ms | 525,95 → 43,60 ms |
| Parsing d'un texte modifié à chaque appel | 18,32 → 22,39 ms | 118,95 → 133,12 ms |

Le cache a donc un coût de copie et de comptabilisation sur les textes nouveaux ; cette mesure ne démontre pas d'accélération de la première analyse. Le gain porte sur les opérations récurrentes. Une prochaine amélioration pour les très gros schémas serait de déplacer le parsing hors du thread principal, avec gestion des annulations et des résultats obsolètes ; ce changement d'architecture n'est pas inclus ici.

Déplacement de 100 tables dans un document de 11 vues : **127,21 → 1,34 ms** (médianes de 15 exécutions), avec égalité complète des documents produits. Ce chiffre mesure la commande de présentation, pas toute l'animation du diagramme.

Scripts reproductibles : `scripts/measure-core-performance.mjs before-rationalisation`, puis `after-rationalisation` après compilation ; `scripts/measure-presentation-performance.mjs`. Les mesures brutes sont dans `build/performance/core-before-rationalisation.json`, `core-after-rationalisation.json` et `presentation-batch.json`. Ne pas relancer le libellé avant après avoir compilé la nouvelle version si l'on veut préserver la référence.

## Contrôle dans Electron

`scripts/measure-diagram-performance.mjs`, exécuté sur une copie de Compliance : ouverture et affichage en 3 310 ms ; recalcul, survol, déplacement réel et déplacement du fond accomplis ; aucune erreur JavaScript. Le 95e percentile des intervalles entre images est de 31 ms pour les quatre phases. Aucune tâche supérieure à 50 ms pour recalcul/survol/fond ; une tâche autour de 50 ms pendant le déplacement. Le script restaure les préférences qu'il a sauvegardées.

Ce contrôle ne fournit pas de comparaison Electron avant/après pour cette intervention. Les chiffres du rapport du 13 octobre correspondent à un autre état fonctionnel et ne servent pas de référence directe. Le rendu actuel comprend notamment les raccordements ajoutés pour Construction.

## Validation et limites connues

- TypeScript cœur, UI, MCP et portable : succès.
- Compilation widget et application Electron : succès.
- Contrôle hors ligne : aucune dépendance réseau de l'interface.
- Intégration MCP : succès, ouverture 13,3 ms et enregistrement 11,2 ms dans ce contrôle.
- Suites actives cœur/UI/MCP/portable : 43 fichiers, 414 tests réussis, incluant cache et déplacement groupé. Les deux tests additionnels d'index de modèle sont exécutés séparément.
- La première validation complète signalait deux échecs et un fichier impossible à charger. Corrigés lors du suivi : `chat-service.test.ts` fournit désormais `baseGeneration` et vérifie que le refus conserve réellement le brouillon et la révision ; `renderer.test.tsx` utilise une assertion DOM standard et attend le chargement du formulaire. Le test du service supprimé a été remplacé par quatre tests du point d'entrée portable actuel, avec les vrais handlers MCP et le vrai stockage SQLite : accès au projet sélectionné, validation puis sauvegarde explicite, conflit de génération, lecture seule sans verrou et isolation des fenêtres. Les tests des fonctions de propositions et de stockage des conversations restent exécutés.
- Validation finale du suivi : **50 fichiers, 439 tests réussis, aucun échec**, en 82,16 s avec la commande complète `node node_modules/vitest/vitest.mjs run`, sans exclusion ajoutée. TypeScript cœur/UI/MCP/portable et `git diff --check` passent également. Les changements de ce suivi concernent les tests et ce bilan ; ils ne nécessitent pas de nouvelle compilation de l'application.

Il n'est pas possible de garantir une optimisation « maximale » de chaque fonctionnalité avec ces seules mesures. Les gains ci-dessus sont mesurés ; les fonctions conservées sont distinguées des chemins effectivement optimisés. L'analyse initiale de gros fichiers, le lancement d'Electron et la dette de l'ancien module conversation restent des axes séparés.
