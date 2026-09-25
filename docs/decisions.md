# Registre des décisions de dbcodex

## Statut

- **Phase :** découverte produit / design.
- **Dernière mise à jour :** 25 septembre 2026.
- **Implémentation :** interdite tant que le périmètre et l'architecture ne sont pas validés.
- **Série active :** QCM 1 condensé, questions 1 à 3, en attente de réponse.

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

## Nuances enregistrées

- `View All` est une règle propre à dbcodex ; elle ne doit pas être confondue avec la vue `Default` de DBML/dbdiagram.
- Le déplacement des tables suppose une persistance, mais son emplacement (DBML, sidecar ou stockage Codex) reste ouvert.
- Le parser officiel `@dbml/core` est un candidat, pas encore un choix architectural.
- « Local-first » n'interdit pas de futures fonctions réseau explicites ; il interdit tout envoi implicite.

## Points ouverts par catégorie

1. **Périmètre fonctionnel V1 :** série 1 ci-dessous.
2. **Couverture DBML :** fidélité exacte, modules, diagnostics et stratégie de compatibilité.
3. **Édition visuelle :** opérations, source de vérité, conflits et préservation sans perte.
4. **Système de vues :** critères de sélection, héritage, positions et cycle de vie.
5. **Import/export :** dialectes, formats et garanties de fidélité.
6. **Architecture Codex :** formes d'intégration et frontières de composants.
7. **Expérience utilisateur :** navigation, raccourcis, thèmes et accessibilité.
8. **Persistance locale et Git :** sidecars, emplacement, diff et conflits.
9. **Collaboration et partage :** Git, liens, hébergement et éventuel temps réel.
10. **Intelligence artificielle :** cas d'usage, consentement et validation par diff.
11. **Sécurité et confidentialité :** modèle de menace, sandbox et télémétrie.
12. **Licence et gouvernance :** licence, contributions et conduite.
13. **Stratégie de tests :** corpus, round-trip, rendu et performance.
14. **Publication et distribution :** packaging, versioning et canaux.

## Série 1 — périmètre fonctionnel de la V1

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

## Historique des séries

- **Première version de la série 1 — questions 1 à 8 :** retirée sans réponse à la demande de l'utilisateur, car trop détaillée.
- **Série 1 condensée — questions 1 à 3 :** proposée le 25 septembre 2026, réponses en attente.
