# Registre des décisions de dbcodex

## Statut

- **Phase :** découverte produit / design.
- **Dernière mise à jour :** 25 septembre 2026.
- **Implémentation :** interdite tant que le périmètre et l'architecture ne sont pas validés.
- **Série active :** QCM 3, question 6 sur le versioning, en attente de réponse.

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

## Nuances enregistrées

- `View All` est une règle propre à dbcodex ; elle ne doit pas être confondue avec la vue `Default` de DBML/dbdiagram.
- Le déplacement des tables suppose une persistance, mais son emplacement (DBML, sidecar ou stockage Codex) reste ouvert.
- Le parser officiel `@dbml/core` est un candidat, pas encore un choix architectural.
- « Local-first » n'interdit pas de futures fonctions réseau explicites ; il interdit tout envoi implicite.
- Le passage de `1A` à `1B` ajoute l'édition textuelle et la sauvegarde, mais pas l'édition structurelle depuis le diagramme.

## Points ouverts par catégorie

1. **Périmètre fonctionnel V1 :** résolu par la série 1.
2. **Couverture DBML :** couverture complète en lecture/validation décidée ; détails de compatibilité à spécifier sans nouvel arbitrage produit.
3. **Édition :** édition textuelle incluse en V1 ; édition structurelle visuelle hors V1, sauf disposition des tables.
4. **Système de vues :** résolu par `4A`.
5. **Import/export :** résolu par `5A`.
6. **Architecture Codex :** formes d'intégration et frontières de composants.
7. **Expérience utilisateur :** navigation, raccourcis, thèmes et accessibilité.
8. **Persistance locale et Git :** versioning demandé ; question 6 de la série 3.
9. **Collaboration et partage :** Git, liens, hébergement et éventuel temps réel.
10. **Intelligence artificielle :** cas d'usage, consentement et validation par diff.
11. **Sécurité et confidentialité :** modèle de menace, sandbox et télémétrie.
12. **Licence et gouvernance :** licence, contributions et conduite.
13. **Stratégie de tests :** corpus, round-trip, rendu et performance.
14. **Publication et distribution :** packaging, versioning et canaux.

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

## Série 3 — versioning

Après cette question, il restera environ **6 à 10 décisions structurantes**.

### 6. Quel versioning intégrer à dbcodex ?

- **A — Versioning Git natif.** Afficher l'historique, comparer les versions du DBML et des dispositions, et restaurer après confirmation ; dbcodex ne crée pas de commit automatiquement.
- **B — Historique local interne.** Créer automatiquement des snapshots comparables et restaurables, même sans dépôt Git, mais maintenir un second historique propre au plugin.
- **C — Système hybride.** Conserver des snapshots internes et proposer en plus des points de version Git explicites ; couverture maximale, mais deux historiques à comprendre et maintenir.

> Le choix porte sur l'historique du modèle utilisateur, pas sur le versioning des releases du plugin, qui sera traité avec la publication.

## Historique des séries

- **Première version de la série 1 — questions 1 à 8 :** retirée sans réponse à la demande de l'utilisateur, car trop détaillée.
- **Série 1 condensée — questions 1 à 3 :** validée le 25 septembre 2026 avec `1B`, `2A`, `3A`. Le choix initial `1A` a été explicitement remplacé par `1B`.
- **Série 2 — questions 4 et 5 :** validée le 25 septembre 2026 avec `4A`, `5A`.
- **Série 3 — question 6 :** proposée le 25 septembre 2026, réponse en attente.
