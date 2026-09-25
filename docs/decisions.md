# Registre des décisions de dbcodex

## Statut

- **Phase :** découverte produit / design.
- **Dernière mise à jour :** 25 septembre 2026.
- **Implémentation :** interdite tant que le périmètre et l'architecture ne sont pas validés.
- **Série active :** QCM 1, questions 1 à 8, en attente de réponse.

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

Après cette série, il restera environ **48 à 64 décisions** à traiter dans les treize autres catégories ; cette fourchette sera recalculée selon les conséquences de vos réponses.

Répondre sous la forme `1A, 2C, 3B` ; les nuances en texte libre sont acceptées. L'option A est la recommandation pour chaque question.

### 1. Positionner la V1 sur la lecture ou l'édition

- **A — Explorateur fiable en lecture seule.** Ouvrir, valider, visualiser, naviguer, gérer les vues/positions et exporter, sans réécrire le DBML ; réduit fortement le risque de perte.
- **B — Ajouter un éditeur texte intégré.** Autorise la modification du texte avec aperçu live, mais exige diagnostics incrémentaux, sauvegarde et gestion des conflits.
- **C — Inclure aussi l'édition visuelle.** Ajoute création/modification depuis le diagramme ; porte immédiatement la V1 au niveau de risque maximal.

### 2. Supporter les projets DBML multi-fichiers en V1

- **A — Oui, lecture de `use`/`reuse` dès la V1.** Couvre les schémas professionnels et l'API officielle incrémentale, avec résolution confinée au projet.
- **B — Un fichier seulement avec erreur claire.** Accélère la livraison mais refuse des fichiers DBML valides et récents.
- **C — Aplatir les imports dans une copie temporaire.** Évite un modèle multi-fichiers complet, mais dégrade la traçabilité et les diagnostics.

### 3. Montrer les groupes, couleurs et notes en V1

- **A — Les trois, en lecture fidèle.** Conserve le sens documentaire du DBML et rend les grands diagrammes exploitables.
- **B — Groupes seulement.** Priorise la structure visuelle, au prix d'une perte de contexte et de repères couleur.
- **C — Aucun enrichissement.** Réduit le rendu initial aux tables/relations, mais produit une expérience trop appauvrie.

### 4. Proposer les niveaux de détail en V1

- **A — Trois niveaux : tables, clés, champs.** Répond directement aux schémas de tailles variées avec une complexité contenue.
- **B — Deux niveaux : tables et champs.** Plus simple, mais perd le compromis très utile « clés seulement ».
- **C — Champs complets uniquement.** Minimal à développer, mais peu utilisable sur les grands modèles.

### 5. Inclure une minimap dans la V1

- **A — Oui, avec possibilité de la masquer.** Améliore nettement l'orientation sur les grands modèles sans imposer l'espace écran.
- **B — Non, mais fournir « adapter à l'écran » et recentrage.** Réduit la charge V1 tout en gardant une navigation acceptable.
- **C — Reporter toute navigation globale avancée.** Ne garder que zoom/pan, avec un risque d'expérience insuffisante.

### 6. Fournir un auto-layout initial en V1

- **A — Oui, déterministe, relançable et respectant les positions épinglées.** Donne un résultat lisible dès l'ouverture sans empêcher l'arrangement manuel.
- **B — Layout automatique au premier chargement seulement.** Plus simple, mais difficile à corriger après de gros changements du modèle.
- **C — Aucun auto-layout.** Préserve uniquement les positions existantes/manuelles, mais les nouveaux fichiers peuvent être illisibles.

### 7. Visualiser `Records` dans la V1

- **A — Préserver et valider, sans afficher les valeurs par défaut.** Évite l'exposition accidentelle de données tout en restant fidèle au langage ; affichage explicite plus tard.
- **B — Afficher dans un panneau sur action explicite.** Très utile pour la documentation, avec un effort et un risque confidentialité supplémentaires.
- **C — Ignorer fonctionnellement tout en préservant le texte.** Réduit le scope, mais les diagnostics DBML restent incomplets.

### 8. Visualiser le lignage `Dep` dans la V1

- **A — Parser et valider, avec affichage désactivé par défaut mais activable.** Assure la compatibilité 2026 sans surcharger l'ERD classique.
- **B — Afficher toujours `Ref` et `Dep`.** Rend tout le modèle visible, au risque d'un canvas rapidement illisible.
- **C — Préserver seulement pour une version ultérieure.** Simplifie la V1, mais ne représente pas une construction DBML officielle importante.

## Historique des séries

- **Série 1 — questions 1 à 8 :** proposée le 25 septembre 2026, réponses en attente.
