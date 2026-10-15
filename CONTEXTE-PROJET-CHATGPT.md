# dbcodex — contexte et état du projet pour ChatGPT

État relevé le **9 octobre 2026** à partir du dépôt local et de ses branches de développement. Dernier commit de l’implémentation : **27 septembre 2026**. Ce document est autonome : il peut être joint à une nouvelle conversation ChatGPT sans les autres fichiers du dépôt.

## Résumé immédiat

**dbcodex est un plugin local pour Codex permettant d’éditer du DBML, de manipuler son diagramme et de conserver des révisions dans un projet `.dbcd`.** Un atelier fonctionnel est implémenté sur la branche `codex/dbcodex-workbench`. Les contrôles automatisés et plusieurs parcours interactifs sont documentés comme réussis. La validation complète dans l’hôte natif Codex Desktop reste à consigner ; la V1 publique n’est pas terminée.

**Attention : `main` contient essentiellement la documentation initiale. Son README indique encore « aucune implémentation », ce qui ne décrit plus l’ensemble du projet. Il faut examiner la branche de l’atelier pour reprendre le développement.**

## 1. Objectif et principes

- Ouvrir et travailler sur des schémas de bases de données directement dans Codex.
- Afficher un diagramme interactif intégré, avec édition textuelle DBML synchronisée.
- Organiser les tables en vues et groupes, enregistrer leur présentation et consulter l’historique.
- Traiter les fichiers localement, sans envoi implicite à un service externe ni dépendances réseau de l’interface.
- Préserver le texte DBML, ses commentaires, son ordre et les constructions non rendues graphiquement.
- Développer un produit indépendant, sans copier le code, l’interface, les ressources ou la marque dbdiagram.
- Ne pas créer automatiquement de commits Git.

L’édition graphique générale des tables, colonnes et relations n’est pas incluse dans cette livraison. Les opérations graphiques sur les groupes et vues peuvent produire des patchs DBML ciblés.

## 2. Où se trouve le travail

Dépôt configuré : `https://github.com/Qappyld/dbcodex`.

| Branche locale | Commit observé | Contenu |
| --- | --- | --- |
| `main` | `bcd3ae2` | Décisions initiales, inventaire fonctionnel, spécifications et plans. |
| `codex/compatibility-spike` | `2389170` | Prototype DBML, serveur MCP local, diagramme SVG interactif et persistance des positions. |
| `codex/dbcodex-workbench` | `aa0f1ae` | Atelier éditable `.dbcd`, diagramme React Flow, vues, groupes, brouillons, historique et corrections de revue. |

Les trois checkouts étaient sans modifications locales au moment du relevé, avant la création de ce résumé. L’implémentation n’est pas fusionnée dans le `main` local. L’état distant n’a pas été rafraîchi pendant ce relevé.

Chemins sur le poste actuel :

- Dépôt principal : `C:/Users/qcham/OneDrive - APPYLD/Documents/ChatGPT/dbcodex`.
- Prototype : `C:/Users/qcham/.codex/worktrees/compatibility-spike/dbcodex`.
- **Implémentation à reprendre :** `C:/Users/qcham/.codex/worktrees/dbcodex-workbench/dbcodex`.

## 3. Décision récente essentielle : `.dbcd` remplace la persistance initiale

Le 26 septembre, la conception a évolué vers un **fichier projet unique `.dbcd`, au format SQLite**. Il contient :

- le texte DBML exact ;
- la présentation graphique, les positions et les paramètres par vue ;
- un brouillon récupérable ;
- des révisions immuables et compressées, avec leurs métadonnées.

**Le DBML reste la source de vérité fonctionnelle du schéma.** SQLite regroupe les données de l’atelier, sans remplacer le langage DBML.

Le fichier `.dbml` devient le format d’échange : import vers un nouveau `.dbcd`, export de la version enregistrée vers un `.dbml`. Import et export refusent d’écraser leur destination. L’export ne comprend pas le brouillon.

L’historique intégré est désormais **local et indépendant de Git**. Cette décision remplace le choix historique d’un versioning exclusivement Git pour le nouvel atelier. Le format SQLite binaire est moins lisible dans les différences Git.

L’ancien parcours `.dbml`, avec `open_dbml` et `save_layout`, reste compatible pour l’exploration et les positions en fichiers annexes. Il ne constitue plus le parcours principal d’édition persistante.

## 4. Capacités implémentées dans l’atelier

- Éditeur CodeMirror avec validation différée de 300 ms et diagramme synchronisé.
- Conservation du dernier graphe valide lorsque le texte contient une erreur ; sauvegarde du DBML invalide refusée.
- Diagramme React Flow et disposition persistante.
- Vues nommées et vue système permanente « Toutes les tables » ; dispositions propres aux vues.
- Groupes `TableGroup` et vues `DiagramView` modifiés par patchs textuels ciblés.
- Trois niveaux de détail : noms seuls, clés, tous les champs.
- Recherche, recentrage, commandes de navigation et contrôles de diagramme.
- Relations avec cardinalités, sens et contrôles de routage ; certaines interactions n’ont été vérifiées que par tests automatisés.
- Panneaux adaptatifs et demande de plein écran via le client MCP Apps.
- Enregistrement explicite par bouton ou `Ctrl+S`, transaction SQLite et nouvelle révision.
- Brouillon récupérable, distinct de l’historique officiel.
- Détection de conflits de génération empêchant l’écrasement concurrent.
- Historique, comparaison, épinglage et restauration produisant une nouvelle révision.
- Rétention avec cible de 500 révisions et 90 jours ; protection des révisions épinglées et courantes.
- Import/export DBML sans réécriture du texte et projet de démonstration fourni.

La comparaison d’historique va **de la révision sélectionnée vers le travail courant, brouillon compris**. Le résumé des différences graphiques n’est pas exhaustif : tous les changements de panneaux, noms et groupes ne sont pas détaillés.

## 5. Architecture actuelle

- Plugin Codex avec skill, serveur MCP local `stdio` et composant MCP Apps.
- Monorepo npm/TypeScript : `packages/core`, `packages/mcp`, `packages/ui`.
- Parser : `@dbml/core` ; sa couverture complète du DBML reste à démontrer avant la V1.
- Interface : React, CodeMirror 6, React Flow, panneaux redimensionnables.
- Persistance : `node:sqlite`, **Node.js 22.13.0 minimum**.
- Tests : Vitest et Testing Library ; compilation de bundles autonomes.
- Accès aux fichiers limité aux racines du workspace, avec contrôles de chemins et de liens.
- Texte complet et snapshots historiques réservés aux métadonnées du composant, hors contenu visible au modèle des outils concernés.

Le plein écran dépend de l’accord de l’hôte MCP Apps. Aucune association native Windows de l’extension `.dbcd`, aucun éditeur de fichier natif ni ouverture spécifique dans un panneau latéral n’est garanti.

## 6. Ce qui a été vérifié — et les limites de la preuve

Le rapport `docs/evidence/dbcd-workbench.md`, daté du 27 septembre, relève les résultats suivants sur l’implémentation revue à `2f42ebc`, avant le commit documentaire `aa0f1ae` :

- **323 tests réussis dans 32 fichiers**.
- Build, vérification des types, vérification MCP et contrôle statique des dépendances réseau réussis.
- Contrôle du protocole du bundle installé réussi.
- Dernière revue indépendante : aucun défaut actionable restant selon le rapport.
- Plugin installé et activé : `dbcodex@dbcodex-local`, version `0.1.0-dev.0+codex.20260927`.

Des essais dans le navigateur intégré à Codex, via un hôte de test local relayant les vrais appels MCP, ont confirmé : édition et validation, création de vue, sauvegarde, comparaison, restauration conservant les révisions antérieures, niveaux de détail, création de groupe et persistance après rechargement.

**Ces essais ne sont pas une validation dans l’hôte natif MCP Apps de Codex Desktop.** Le rendu natif de `open_dbcd`, le plein écran natif, l’observation réseau à l’exécution et le parcours complet dans cet hôte restent à documenter. Glisser-déposer, poignées de routage et animation du sens ont une couverture automatisée, mais n’ont pas tous été exercés dans le parcours navigateur.

Les temps MCP consignés étaient de 21,7 ms à l’ouverture et 12,1 ms à la sauvegarde ; ils ne mesurent pas le délai de rendu interactif dans Codex Desktop.

**Ces résultats sont des preuves historiques lues dans le dépôt, pas des tests relancés le 9 octobre.** Le rapport du prototype initial conservait également une barrière desktop non validée.

## 7. Travail restant avant une V1 complète

1. Vérifier le plugin actualisé dans une nouvelle session Codex Desktop et consigner le rendu natif, les interactions, la persistance et le plein écran.
2. Relancer les contrôles automatisés sur la branche à livrer avant toute intégration ou publication.
3. Vérifier les exigences V1 encore distinctes de l’atelier : exports **PNG/SVG**, couverture DBML complète, notamment multi-fichiers et constructions avancées, accessibilité et budgets de performance.
4. Décider de l’intégration de la branche de l’atelier dans `main` et actualiser la documentation principale.
5. Reprendre les deux décisions volontairement différées : **licence open source** et **canal de distribution**. Aucune licence définitive ni release publique n’est acquise.

Ne pas confondre le prototype opérationnel, l’atelier implémenté et l’acceptation de toutes les exigences V1. Ne pas déclarer les exports PNG/SVG ou la couverture DBML complète livrés sur la seule base des spécifications.

## 8. Reprise pratique

Dans le checkout de l’atelier, les commandes prévues sont :

```text
npm ci
npm run build
npm run typecheck
npm test
npm run verify:offline-ui
npm run verify:mcp
```

Exemples de demandes au plugin :

```text
Ouvre fixtures/demo-shop.dbcd avec dbcodex.
Importe fixtures/demo-shop.dbml dans fixtures/mon-essai.dbcd.
Exporte la version courante de fixtures/demo-shop.dbcd vers fixtures/mon-export.dbml.
```

Choisir des destinations inexistantes pour l’import et l’export. Le projet `demo-shop.dbcd` est déjà fourni. Rafraîchir le plugin depuis le checkout compilé puis ouvrir une nouvelle session si le cache installé ne reflète pas les derniers outils.

## 9. Documents de référence

Les chemins suivants sont relatifs au checkout **`codex/dbcodex-workbench`** :

- `README.md` : usage actuel, limites et développement local.
- `docs/decisions.md` : décisions récentes `.dbcd`, puis historique des anciens choix.
- `docs/evidence/dbcd-workbench.md` : résultats automatisés, essais interactifs et limite de validation native.
- `docs/evidence/codex-spike.md` : preuves du prototype initial.
- `docs/superpowers/specs/2026-09-26-dbcd-work-file-design.md` : conception du format SQLite.
- `docs/superpowers/plans/2026-09-26-dbcd-workbench.md` : plan de l’atelier `.dbcd`.
- `docs/superpowers/specs/2026-09-25-dbcodex-workbench-design.md` : conception initiale de l’atelier, à lire avec les décisions qui la remplacent.
- `docs/feature-inventory.md` : inventaire initial, qui ne constitue pas une liste de fonctionnalités livrées.

## 10. Consigne de reprise pour ChatGPT

Utilise ce document comme contexte du projet dbcodex. Considère la branche `codex/dbcodex-workbench` comme la base de l’implémentation actuelle, et non le README ancien de `main`. Conserve la décision du projet SQLite `.dbcd` et du DBML comme format d’échange. Distingue systématiquement les fonctionnalités implémentées, les vérifications historiques et les critères restant à démontrer. Pour reprendre le développement, examine le code et les preuves de cette branche avant de proposer des changements. La priorité actuelle est la validation native dans Codex Desktop, puis la clôture des exigences V1 restantes ; ne rouvre pas les décisions déjà acquises sans raison concrète.
