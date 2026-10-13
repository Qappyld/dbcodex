# Registre des décisions de dbcodex

## Statut

- **Phase :** atelier `.dbcd` en validation finale.
- **Dernière mise à jour :** 26 septembre 2026.
- **Implémentation :** édition, présentation, historique et échange DBML implémentés ; la validation interactive desktop reste à effectuer pour ce nouveau parcours.
- **Série active :** aucune ; les questions 8 et 10 sont différées à la demande de l'utilisateur.
- **Conception active :** atelier `.dbcd` ; preuve desktop finale encore requise.

## Décisions de l’atelier `.dbcd` — 26 septembre 2026

### Expérimentation d’intégration native — 9 octobre 2026

Le plugin déclare désormais des entrées `thread`, `global` et `file` d’après le SDK OpenAI et Bits & Bolts, réutilisant l’atelier existant. `apply_dbcd_edits` permet les modifications textuelles exactes explicitement demandées à Codex, avec contrôles de révision et refus des brouillons dans la transaction. L’interface détecte les versions enregistrées externes et préserve le brouillon au teardown ordonné. Aucun changement du format SQLite ni de l’historique.

Les 334 tests et le protocole du bundle installé passent. Le panneau natif, l’association fichier, la persistance entre conversations et le redémarrage ne sont pas déclarés validés : voir [preuves et procédure](evidence/native-integration.md). Chaque entrée de conversation possède son instance ; une session d’édition globale partagée n’est pas promise.

Ces décisions du chantier approuvé remplacent les choix historiques de persistance et de versioning ci-dessous pour le nouvel atelier. L’ancien prototype `.dbml` conserve sa compatibilité.

- `.dbcd` est un fichier projet SQLite local contenant source DBML exacte, présentation, brouillon et révisions ; `.dbml` est le format d’échange.
- Un enregistrement explicite accepté crée une révision atomique et avance la génération. Un brouillon ne crée pas de révision. Les conflits empêchent l’écriture.
- L’historique interne est indépendant de Git ; aucune création automatique de commit. La restauration délibérée dans Historique crée une nouvelle révision et préserve les anciennes selon la rétention ; l’épinglage les protège.
- La comparaison est un résumé de la révision sélectionnée vers le travail courant. Les remplacements sont appariés à l’intérieur de chaque bloc de lignes modifiées. Les changements de présentation comptent les déplacements et niveaux de détail par vue commune, les tracés et les vues ajoutées/supprimées ; les panneaux, noms et groupes ne sont pas exhaustivement détaillés.
- `read_dbcd_revision` est une lecture réservée au composant MCP Apps. Le contenu complet DBML et présentation reste dans `_meta.dbcodex.revision`, jamais dans le contenu visible au modèle. La liste d’historique demeure légère.
- Le plein écran dépend de l’accord du client MCP Apps. Aucune association OS/éditeur personnalisée ou ouverture dans un panneau latéral n’est promise sans preuve dédiée.
- Le traitement reste local et aucune écriture spéculative n’est autorisée. Licence, distribution publique et autres exigences V1 restent distinctes de cette livraison.

## Décisions acquises

### Produit et dépôt

- Le projet et le dépôt public s'appellent exactement `dbcodex`.
- La branche par défaut est `main`.
- Le produit cible est un plugin utilisable depuis Codex.
- Le projet est développé indépendamment : aucune copie du code, de l'interface, des ressources graphiques ou de la marque dbdiagram.
- Aucune licence n'est choisie avant la décision de gouvernance correspondante.

### Capacités obligatoires

- Ouvrir un fichier `.dbml` local.
- Analyser et valider la syntaxe DBML.
- Afficher un diagramme interactif dans Codex.
- Déplacer les tables et persister utilement leur disposition.
- Proposer zoom et navigation.
- Proposer recherche et filtres.
- Exporter au minimum en PNG et SVG.
- Créer des vues nommées à partir d'une sélection de tables.
- Maintenir une vue système `View All`, complète et impossible à supprimer.
- Réutiliser un modèle source unique entre toutes les vues, sans dupliquer les tables.

### Principes de conception

- Aucun fichier utilisateur n'est envoyé à un service externe sans consentement explicite.
- Toute syntaxe DBML non rendue graphiquement doit être préservée sans perte lors d'une future modification.
- Les responsabilités parsing, modèle interne, validation, diagramme, vues, édition, export et intégration Codex restent séparées.
- Aucun framework, parser ou moteur graphique n'est choisi silencieusement.
- Deux ou trois architectures seront comparées avant recommandation.
- Le parser officiel ou compatible sera privilégié, sous réserve de licence et de capacités vérifiées.

### Périmètre V1 validé — série 1

- La V1 inclut un éditeur DBML textuel avec validation et aperçu du diagramme synchronisés.
- Le texte DBML reste la source de vérité pour la structure ; la sauvegarde doit préserver sans perte les syntaxes, commentaires et éléments non rendus graphiquement.
- La disposition visuelle est également interactive : les tables peuvent être déplacées et leurs positions persistées sans imposer leur écriture dans le DBML.
- L'édition structurelle directement depuis le diagramme reste hors V1.
- La lecture et la validation couvrent le DBML actuel, notamment les projets multi-fichiers, groupes, couleurs, notes, `TablePartial`, `Records`, `Dep`, vues et métadonnées.
- Les valeurs potentiellement sensibles, notamment `Records`, restent masquées par défaut.
- Les grands diagrammes disposent de trois niveaux de détail, recherche/filtres, adapter/recentrer, auto-layout déterministe relançable et positions manuelles persistantes.
- La minimap est reportée après la V1.

### Vues et formats V1 validés — série 2

- Les vues peuvent sélectionner tables, groupes, schémas et notes.
- Chaque vue possède sa propre disposition.
- `View All` reste non supprimable et intègre automatiquement tout nouvel élément du modèle.
- La V1 n'ajoute aucun autre format : DBML en entrée, PNG et SVG en sortie.
- Import SQL/CSV, connexion directe et export PDF sont reportés.

### Versioning validé — série 3

- Le versioning du modèle est natif Git.
- dbcodex affiche l'historique et permet de comparer les versions du DBML et des dispositions.
- La restauration demande une confirmation explicite.
- dbcodex ne crée jamais de commit automatiquement.

### Architecture Codex validée — série 4

- La base retenue est un plugin portable local-first avec skill, serveur MCP local `stdio` et interface locale intégrée à Codex.
- Le fonctionnement interactif directement dans Codex est une condition de sortie de la V1, et non une amélioration facultative.
- Un prototype de compatibilité Codex constitue le jalon technique initial, avant le choix définitif du moteur graphique et des autres composants d'interface.
- Si l'interface MCP Apps locale n'est pas rendue dans Codex, l'architecture devra employer une autre surface officiellement prise en charge dans Codex ; une application ouverte seulement dans un navigateur externe ne satisferait pas la V1.
- Les sorties SVG et structurées restent utiles comme mode dégradé et pour les tests, mais ne remplacent pas le diagramme interactif dans Codex.
- Le skill et le serveur MCP installés ont été chargés avec succès par une nouvelle session Codex CLI ; l'ouverture, la sauvegarde et la persistance passent depuis le cache du plugin.
- La barrière interactive reste fermée tant que le widget n'a pas été observé et manipulé dans une nouvelle tâche Codex desktop.

### Stratégie de tests validée — série 5

- La V1 applique une barrière qualité complète.
- Les tests couvrent un corpus DBML, les contrats du parser, la préservation sans perte, Git et les vues.
- Les rendus PNG/SVG disposent de références vérifiables.
- Des parcours de bout en bout dans Codex, des contrôles d'accessibilité et des budgets de performance sont bloquants pour la sortie de la V1.

## Nuances enregistrées

- `View All` est une règle propre à dbcodex ; elle ne doit pas être confondue avec la vue `Default` de DBML/dbdiagram.
- Le déplacement des tables suppose une persistance, mais son emplacement (DBML, sidecar ou stockage Codex) reste ouvert.
- Le prototype utilise `@dbml/core` ; son adoption définitive pour la V1 reste soumise à la couverture DBML complète et à la décision de licence.
- « Local-first » n'interdit pas de futures fonctions réseau explicites ; il interdit tout envoi implicite.
- Le passage de `1A` à `1B` ajoute l'édition textuelle et la sauvegarde, mais pas l'édition structurelle depuis le diagramme.
- La documentation OpenAI décrit certaines capacités comme propres à une surface et documente explicitement l'UI MCP Apps pour ChatGPT ; le prototype Codex doit donc vérifier le comportement réel sans présumer d'une parité d'interface.

## Points ouverts par catégorie

1. **Périmètre fonctionnel V1 :** résolu par la série 1.
2. **Couverture DBML :** couverture complète en lecture/validation décidée ; détails de compatibilité à spécifier sans nouvel arbitrage produit.
3. **Édition :** édition textuelle incluse en V1 ; édition structurelle visuelle hors V1, sauf disposition des tables.
4. **Système de vues :** résolu par `4A`.
5. **Import/export :** résolu par `5A`.
6. **Architecture Codex :** résolue par `7A`, avec compatibilité interactive Codex obligatoire.
7. **Expérience utilisateur :** socle accessible, navigation clavier et thème sombre/clair adaptatif retenus comme exigences de conception, sans QCM supplémentaire.
8. **Persistance locale et Git :** versioning Git natif résolu par `6A` ; format des dispositions à préciser dans la conception.
9. **Collaboration et partage :** Git couvre la V1 ; hébergement et temps réel sont reportés.
10. **Intelligence artificielle :** Codex orchestre les outils locaux ; aucun second service d'IA ni envoi implicite de fichier dans la V1.
11. **Sécurité et confidentialité :** traitement local, absence de télémétrie par défaut et consentement explicite pour tout futur accès réseau.
12. **Licence et gouvernance :** décision 8 différée ; à résoudre avant la première release publique contenant l'implémentation.
13. **Stratégie de tests :** résolue par `9A`.
14. **Publication et distribution :** décision 10 différée ; à résoudre avant la première distribution du plugin.

## Série 1 — périmètre fonctionnel de la V1 — validée

Après cette série, il restera environ **12 à 18 décisions structurantes** pour l'ensemble des autres catégories. Les choix réversibles ou déjà couverts par une recommandation forte ne feront plus l'objet d'une question séparée.

Répondre sous la forme `1A, 2C, 3B` ; les nuances en texte libre sont acceptées. L'option A est la recommandation pour chaque question.

### 1. Positionner la V1 sur la lecture ou l'édition

- **A — Explorateur fiable en lecture seule.** Ouvrir, valider, visualiser, naviguer, gérer les vues/positions et exporter, sans réécrire le DBML ; réduit fortement le risque de perte.
- **B — Ajouter un éditeur texte intégré.** Autorise la modification du texte avec aperçu live, mais exige diagnostics incrémentaux, sauvegarde et gestion des conflits.
- **C — Inclure aussi l'édition visuelle.** Ajoute création/modification depuis le diagramme ; porte immédiatement la V1 au niveau de risque maximal.

### 2. Choisir le niveau de compatibilité DBML de la V1

- **A — Lecture complète du DBML actuel.** Supporter aussi les projets multi-fichiers, groupes, couleurs, notes, `TablePartial`, `Records`, `Dep`, vues et métadonnées ; les données sensibles restent masquées par défaut.
- **B — Cœur relationnel complet dans un fichier unique.** Tables, contraintes et relations sont rendues ; les constructions récentes sont préservées mais pas toutes interprétées.
- **C — Sous-ensemble minimal.** Tables, colonnes et relations simples seulement ; livraison plus rapide, mais de nombreux fichiers DBML valides seront partiellement représentés.

> L'option A concerne la lecture et la validation, pas l'édition de toutes ces constructions.

### 3. Choisir l'expérience des grands diagrammes en V1

- **A — Socle équilibré.** Trois niveaux de détail, recherche/filtres, adapter/recentrer, auto-layout déterministe relançable et positions manuelles persistantes ; minimap reportée.
- **B — Navigation complète.** Même socle avec minimap escamotable dès la V1 ; meilleure orientation, mais plus de travail de rendu et d'accessibilité.
- **C — Navigation minimale.** Zoom, pan, recherche et déplacement seulement ; V1 plus courte, mais expérience limitée sur les grands modèles.

**Réponses validées :** `1B` (correction remplaçant `1A`), `2A`, `3A`.

## Série 2 — vues puis import/export — validée

Après cette série, il restera environ **8 à 12 décisions structurantes**. Les deux catégories restent séparées ci-dessous.

### 4. Système de vues de la V1

- **A — Vues DBML complètes et indépendantes.** Une vue peut sélectionner tables, groupes, schémas et notes, possède sa propre disposition, tandis que `View All` ajoute automatiquement tout nouvel élément et reste non supprimable.
- **B — Vues limitées aux tables.** Chaque vue garde sa disposition, mais groupes, schémas et notes ne peuvent pas servir de critères.
- **C — Filtres partageant une disposition unique.** Les vues sont plus simples, mais déplacer une table affecte toutes les vues et limite les présentations spécialisées.

### 5. Import et export supplémentaires en V1

- **A — Aucun format supplémentaire.** La V1 ouvre le DBML et exporte PNG/SVG comme déjà décidé ; SQL, CSV, PDF et connexions directes sont reportés.
- **B — Ajouter import SQL et export PDF.** Facilite l'adoption, avec davantage de conversions imparfaites et de tests.
- **C — Ajouter aussi CSV et connexion directe.** Offre une entrée très large, mais augmente fortement le périmètre et les risques liés aux données et identifiants.

**Réponses validées :** `4A`, `5A`.

## Série 3 — versioning — validée

Après cette question, il restera environ **6 à 10 décisions structurantes**.

### 6. Quel versioning intégrer à dbcodex ?

- **A — Versioning Git natif.** Afficher l'historique, comparer les versions du DBML et des dispositions, et restaurer après confirmation ; dbcodex ne crée pas de commit automatiquement.
- **B — Historique local interne.** Créer automatiquement des snapshots comparables et restaurables, même sans dépôt Git, mais maintenir un second historique propre au plugin.
- **C — Système hybride.** Conserver des snapshots internes et proposer en plus des points de version Git explicites ; couverture maximale, mais deux historiques à comprendre et maintenir.

> Le choix porte sur l'historique du modèle utilisateur, pas sur le versioning des releases du plugin, qui sera traité avec la publication.

**Réponse validée :** `6A`.

## Série 4 — architecture du plugin Codex — validée

Après cette question, il restera environ **5 à 8 décisions structurantes**.

### 7. Quelle architecture doit servir de base ?

- **A — Plugin portable local-first avec skill, MCP local et UI locale.** Le skill orchestre le workflow, un serveur MCP `stdio` local expose parsing/validation/fichiers/Git, et une interface web locale fournit éditeur et diagramme. Un prototype de compatibilité vérifie d'abord l'affichage interactif dans Codex ; SVG et résultats structurés restent disponibles si la surface ne rend pas l'UI MCP Apps.
- **B — Plugin skill + CLI sans MCP.** Le skill lance des scripts locaux et une application web autonome. C'est plus simple et entièrement local, mais le dialogue structuré entre Codex, le modèle et l'interface est plus faible.
- **C — Plugin avec serveur MCP HTTPS distant et UI MCP Apps.** C'est le chemin le plus direct pour la publication universelle et l'UI ChatGPT, mais les fichiers locaux devraient être transmis au serveur et le fonctionnement hors ligne serait perdu.

> Recommandation A : elle respecte le traitement local et garde des frontières nettes. La documentation OpenAI confirme les plugins portables, les skills et les MCP locaux `stdio`, mais documente explicitement l'UI iframe pour ChatGPT et indique que certaines capacités sont propres à la surface. La compatibilité UI Codex est donc un risque à lever avant tout choix de moteur graphique.

Sources officielles : [architecture des plugins](https://developers.openai.com/plugins/concepts/plugins), [packaging](https://developers.openai.com/plugins/build/plugins), [serveur MCP](https://developers.openai.com/plugins/build/mcp-server), [UI MCP Apps](https://developers.openai.com/plugins/build/chatgpt-ui).

**Réponse validée :** `7A`, avec fonctionnement interactif dans Codex exigé pour la V1.

## Série 5 — QCM final — partiellement validée puis suspendue

Il reste **deux décisions différées**, la licence et la distribution. Elles ne bloquent pas la conception technique, mais devront être reprises avant toute publication correspondante. Les choix précis de bibliothèques seront proposés dans la conception technique et validés par le prototype Codex.

### 8. Quelle licence open source adopter ?

- **A — Apache-2.0.** Licence permissive avec concession explicite de brevets et obligations de notices ; recommandée pour un plugin et ses futures intégrations.
- **B — MIT.** Licence permissive très courte et familière, mais sans concession explicite de brevets.
- **C — MPL-2.0.** Copyleft limité aux fichiers modifiés ; protège davantage les améliorations du cœur, avec plus d'obligations pour les réutilisateurs.

**Décision différée à la demande de l'utilisateur.**

### 9. Quel niveau de tests imposer à la V1 ?

- **A — Barrière qualité complète.** Corpus DBML, contrats du parser, préservation sans perte, tests Git et vues, rendus de référence PNG/SVG, parcours de bout en bout dans Codex, accessibilité et budgets de performance.
- **B — Socle standard.** Tests unitaires et d'intégration, quelques parcours Codex et rendus de référence, sans corpus étendu ni budget de performance bloquant.
- **C — Validation minimale.** Cas heureux et vérification manuelle dans Codex ; livraison plus rapide, mais risque élevé de régressions sur les fichiers complexes.

**Réponse validée :** `9A`.

### 10. Quel canal de distribution viser en premier ?

- **A — Marketplace locale ou de dépôt, puis annuaire public.** Installer et tester le plugin directement dans Codex depuis le dépôt ; viser l'annuaire public après stabilisation et validation de l'interface Codex.
- **B — Annuaire public dès la V1.** Optimise la visibilité, mais impose plus tôt les exigences de soumission et, pour un MCP public, un endpoint HTTPS stable.
- **C — GitHub uniquement.** Distribuer le code et des instructions manuelles sans packaging de plugin ; simple, mais moins naturel à installer dans Codex.

> Recommandation A : la documentation OpenAI prévoit les marketplaces locales ou liées à un dépôt pour le développement et la distribution privée, tandis que la soumission publique d'un MCP attend normalement un endpoint HTTPS stable. Cela préserve le fonctionnement local-first pendant la validation Codex.

Sources officielles : [packager et tester un plugin](https://developers.openai.com/plugins/build/plugins), [soumettre un plugin](https://developers.openai.com/plugins/deploy/submission).

**Décision différée à la demande de l'utilisateur.**

## Historique des séries

- **Première version de la série 1 — questions 1 à 8 :** retirée sans réponse à la demande de l'utilisateur, car trop détaillée.
- **Série 1 condensée — questions 1 à 3 :** validée le 25 septembre 2026 avec `1B`, `2A`, `3A`. Le choix initial `1A` a été explicitement remplacé par `1B`.
- **Série 2 — questions 4 et 5 :** validée le 25 septembre 2026 avec `4A`, `5A`.
- **Série 3 — question 6 :** validée le 25 septembre 2026 avec `6A`.
- **Série 4 — question 7 :** validée le 25 septembre 2026 avec `7A` et la contrainte supplémentaire d'un fonctionnement interactif directement dans Codex.
- **Série 5 — questions 8 à 10 :** `9A` validée le 25 septembre 2026 ; les décisions 8 (licence) et 10 (distribution) ont été différées à la demande de l'utilisateur.
