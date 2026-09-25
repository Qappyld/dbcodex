# Atelier DBML intégré — Spécification de conception

**Date :** 25 septembre 2026  
**Statut :** conception validée par l’utilisateur  
**Socle technique :** branche `codex/compatibility-spike`, commit `2389170bc8b0cc73d8c0bf2b5f63628b70553a86`

## 1. Objectif

Transformer le prototype dbcodex en un atelier DBML local intégré à Codex. L’utilisateur doit pouvoir lire et modifier le DBML, explorer le diagramme, organiser les tables en groupes et en vues, ajuster la représentation graphique, enregistrer une version cohérente de l’ensemble et restaurer une révision antérieure.

L’interface doit fonctionner dans une carte MCP Apps et pouvoir passer en plein écran sans perdre son état. Le traitement du DBML, des layouts, des brouillons et des versions reste local au poste et au workspace.

## 2. Principes directeurs

- Le texte DBML est la source de vérité du modèle fonctionnel.
- Les commentaires, l’ordre, le formatage et les syntaxes non rendues doivent être préservés.
- Les opérations visuelles ne doivent pas réécrire tout le DBML.
- Une version enregistrée représente un état cohérent du DBML et de sa présentation.
- Aucun brouillon invalide ne peut devenir une version enregistrée.
- Le diagramme reste utilisable pendant une erreur de syntaxe en affichant le dernier graphe valide.
- Aucun contenu DBML n’est envoyé à un service réseau.
- Les fonctions essentielles restent disponibles au clavier et avec une préférence de réduction des mouvements.

## 3. Périmètre fonctionnel

### 3.1 Inclus

- éditeur DBML intégré et modifiable ;
- analyse différée de 300 ms, diagnostics et synchronisation avec le diagramme ;
- enregistrement explicite par bouton ou `Ctrl+S` ;
- historique local immuable à chaque enregistrement ;
- aperçu des différences et restauration non destructive ;
- brouillon local récupérable ;
- détection des modifications externes et résolution explicite des conflits ;
- interface intégrée et plein écran ;
- vues DBML nommées et vue système permanente « Toutes les tables » ;
- groupes `TableGroup` créés depuis le diagramme ;
- trois niveaux de détail des tables ;
- positions, viewport et routages propres à chaque vue ;
- relations orthogonales, cardinalités, indication animée du sens et points de contrôle ;
- recherche, centrage, sélection multiple, zoom, réorganisation et minicarte ;
- panneaux redimensionnables et repliables ;
- comportement hors ligne et thème clair/sombre.

### 3.2 Exclus de cette livraison

- collaboration temps réel ;
- partage ou hébergement public ;
- import SQL ou connexion directe à une base ;
- génération ou modification du schéma par une IA embarquée ;
- édition graphique générale des tables, colonnes et relations ;
- historique distant ou synchronisation cloud ;
- multi-fichiers DBML, sauf si le socle existant le prend déjà en charge sans élargissement.

## 4. Architecture retenue

L’architecture est hybride et réutilise le prototype de compatibilité validé.

### 4.1 Éléments conservés

- serveur MCP local et protocole MCP Apps ;
- résolution confinée des chemins de workspace ;
- parsing avec `@dbml/core` ;
- stockage atomique des sidecars ;
- bridge UI vers les outils MCP ;
- empaquetage autonome et contrôle des dépendances distantes.

### 4.2 Éléments remplacés ou étendus

- le SVG minimal est remplacé par React Flow ;
- l’éditeur DBML repose sur CodeMirror 6 ;
- le résultat de parsing expose une cartographie source précise ;
- le stockage gère les layouts de vue, les brouillons et les révisions ;
- de nouveaux outils MCP couvrent lecture de document, enregistrement transactionnel, historique et restauration.

### 4.3 Composants principaux

- `DocumentSession` : coordonne brouillon, version enregistrée, graphe valide, diagnostics, conflits et état sale ;
- `DbmlEditor` : CodeMirror, coloration, recherche, diagnostics et navigation source ;
- `DiagramWorkspace` : React Flow, tables, groupes, relations, viewport et sélection ;
- `ViewManager` : vues nommées, règles d’inclusion, exceptions et vue système ;
- `DetailController` : niveau par défaut d’une vue et surcharges par table ;
- `DbmlTextPatcher` : modifications textuelles localisées et préservation sans perte ;
- `LayoutStore` : sidecars déterministes et écritures atomiques ;
- `DraftStore` : récupération de brouillon ;
- `RevisionStore` : snapshots compressés, index, diff et restauration ;
- `SaveTransaction` : validation et coordination de l’enregistrement cohérent.

## 5. Interface

### 5.1 Structure générale

La barre supérieure affiche le chemin du fichier, l’état de validation, l’état sale, les commandes d’enregistrement, d’historique, d’annulation et de plein écran.

Le corps comporte trois zones redimensionnables :

1. un éditeur DBML repliable à gauche ;
2. le diagramme au centre ;
3. un panneau droit avec vues, explorateur et propriétés.

La barre inférieure du diagramme regroupe zoom, recentrage, réorganisation, minicarte et niveau de détail. Les dimensions et états repliés des panneaux sont mémorisés localement. Une largeur insuffisante transforme le panneau droit en tiroir et autorise le repli rapide de l’éditeur.

### 5.2 Mode plein écran

La ressource MCP Apps déclare les modes `inline` et `fullscreen`. Un bouton demande le plein écran à l’hôte. Le composant conserve la session, la sélection, le brouillon, le viewport et les dimensions relatives pendant le changement de mode.

### 5.3 Vues

- « Toutes les tables » est une vue système permanente et non supprimable.
- Une vue utilisateur peut être créée, dupliquée, renommée ou supprimée.
- Son contenu combine règles dynamiques par schéma ou groupe et inclusions/exclusions manuelles.
- La définition fonctionnelle est stockée dans un bloc `DiagramView` du DBML.
- Chaque vue possède son layout, son viewport, son niveau de détail par défaut et ses surcharges.

### 5.4 Recherche

La recherche couvre tables, champs, groupes et schémas. Les éléments non correspondants sont atténués sans être retirés du contexte. Choisir un résultat centre le diagramme et sélectionne le bloc source correspondant.

## 6. Synchronisation du document

### 6.1 États de session

La session conserve séparément :

- le snapshot enregistré ;
- le brouillon courant ;
- le dernier graphe valide ;
- les diagnostics courants ;
- le brouillon graphique ;
- l’empreinte du fichier observée à l’ouverture ou au dernier enregistrement.

### 6.2 Saisie et parsing

Chaque modification de texte réarme un délai de 300 ms. À son expiration :

- le brouillon est analysé ;
- les diagnostics sont associés à des positions de l’éditeur ;
- un résultat valide remplace le graphe affiché ;
- un résultat invalide conserve le dernier graphe valide ;
- les identités stables de tables, groupes et relations permettent de préserver la sélection et les layouts.

### 6.3 Navigation bidirectionnelle

Le parseur produit des plages source pour les tables, champs, relations, groupes et vues. Une sélection graphique place l’éditeur sur la plage correspondante. Déplacer le curseur dans une plage sélectionne l’élément graphique associé, sans déplacer automatiquement le viewport si l’utilisateur interagit déjà avec le diagramme.

### 6.4 Modifications générées depuis l’interface

La création ou la modification d’un `TableGroup` ou d’un `DiagramView` produit un patch textuel minimal. Le patcher ne sérialise pas le modèle complet. Il remplace une plage connue ou insère un nouveau bloc à un emplacement déterministe.

Si la cartographie source est absente, obsolète ou ambiguë, l’opération est suspendue et un aperçu du diff est présenté. Aucun patch incertain n’est appliqué silencieusement.

## 7. Diagramme

### 7.1 Tables et niveaux de détail

Les tables sont des nœuds React Flow personnalisés. Les niveaux disponibles sont :

- noms seuls ;
- clés uniquement ;
- tous les champs.

Le niveau par défaut appartient à la vue. Une table peut le surcharger. Un changement de niveau recalcule la taille du nœud mais ne déplace pas les positions enregistrées.

### 7.2 Groupes

Une sélection multiple peut être regroupée avec un nom et une couleur. Le groupe apparaît comme un conteneur coloré, déplaçable et repliable. Sa création, son renommage, sa couleur et sa composition modifient le `TableGroup` DBML par patch ciblé.

### 7.3 Relations

- le tracé par défaut est orthogonal ;
- les cardinalités sont visibles aux extrémités ;
- sélectionner ou survoler une relation anime de petits points dans le sens de la relation ;
- sélectionner une relation révèle ses points de contrôle ;
- les points de contrôle sont déplaçables au pointeur et au clavier ;
- une commande rétablit le routage automatique ;
- les routages sont sauvegardés par vue dans le sidecar.

Avec `prefers-reduced-motion`, les points cessent de se déplacer et une indication statique conserve le sens.

### 7.4 Placement et navigation

Un placement automatique est produit à la première ouverture lorsqu’aucun layout n’existe. La commande « Réorganiser » demande confirmation avant de remplacer un placement manuel. Le zoom, le déplacement du canevas, le recentrage et la sélection multiple sont disponibles au clavier et au pointeur.

La minicarte est repliable et proposée automatiquement au-delà d’un seuil de complexité défini par le nombre de tables et l’étendue du graphe.

## 8. Persistance

### 8.1 Répartition des données

Pour un fichier `fixtures/demo-shop.dbml` :

- le DBML contient modèle, `TableGroup` et `DiagramView` ;
- `.dbcodex/layouts/fixtures/demo-shop.dbml.layout.json` contient les données graphiques par vue ;
- `.dbcodex/history/fixtures/demo-shop.dbml/` contient les révisions compressées et leur index ;
- `.dbcodex/drafts/fixtures/demo-shop.dbml.draft.json` contient le brouillon récupérable.

Les chemins sont normalisés et vérifiés avec les mêmes règles de confinement que le prototype. Les liens symboliques, jonctions et traversées hors workspace sont refusés.

Les layouts sont des artefacts de projet compatibles avec Git. Les révisions et brouillons sont ajoutés aux exclusions Git recommandées.

### 8.2 Enregistrement transactionnel

`Ctrl+S` ou le bouton Enregistrer déclenche une seule transaction pour le DBML et l’état graphique :

1. vérifier l’absence d’erreur bloquante ;
2. comparer l’empreinte disque avec celle de la session ;
3. construire le DBML final et le sidecar final ;
4. préparer une révision compressée contenant les deux états, la date, le résumé du diff, le libellé facultatif et leurs empreintes ;
5. écrire les fichiers temporaires et les synchroniser ;
6. remplacer atomiquement les fichiers cibles ;
7. publier l’entrée dans l’index d’historique ;
8. supprimer le brouillon et actualiser l’empreinte de session.

Un journal transactionnel local permet de terminer ou d’annuler proprement une opération interrompue. Une révision n’est visible dans l’historique que lorsque tous ses éléments sont cohérents.

### 8.3 Rétention et restauration

La politique initiale conserve au maximum 500 versions ou 90 jours, le seuil atteint en premier. Elle est configurable. Les versions explicitement épinglées ne sont jamais supprimées automatiquement.

La restauration affiche un diff du DBML et des changements graphiques. Après confirmation, elle produit une nouvelle version courante ; elle ne supprime ni ne réécrit les versions plus récentes.

### 8.4 Brouillons

Le brouillon est enregistré localement après les changements significatifs sans apparaître dans l’historique officiel. À la prochaine ouverture, l’utilisateur peut comparer, récupérer ou supprimer ce brouillon. Un enregistrement réussi supprime le brouillon associé.

## 9. Conflits et erreurs

### 9.1 Modification externe

Si l’empreinte disque change pendant qu’un brouillon local existe, l’enregistrement est bloqué. L’interface présente trois choix :

- fusionner à partir d’un diff à trois sources ;
- recharger la version disque ;
- conserver le brouillon local sans écraser le disque.

Une fusion comportant des conflits textuels reste invalide jusqu’à leur résolution explicite.

### 9.2 Erreurs de parsing

Les diagnostics contiennent sévérité, message, ligne et colonne quand disponibles. Le texte source complet et les chemins absolus ne sont jamais inclus dans les erreurs MCP ou les journaux.

### 9.3 Échec d’écriture

L’échec d’une étape d’écriture laisse la version enregistrée précédente utilisable. Le journal de transaction signale l’opération incomplète au prochain démarrage. L’interface conserve le brouillon et explique quel fichier n’a pas pu être enregistré sans révéler de chemin extérieur au workspace.

### 9.4 Échec de layout ou de routage

Un échec du placement automatique ou du routage n’altère ni le DBML ni le layout enregistré. Le dernier placement valide reste affiché et une commande de nouvelle tentative est proposée.

## 10. Annulation

L’éditeur et le diagramme possèdent des historiques contextuels séparés :

- l’éditeur annule et rétablit les changements textuels ;
- le diagramme annule et rétablit positions, routages, niveaux de détail et opérations de sélection structurelle ;
- l’en-tête agrège les deux pour calculer l’état « modifications non enregistrées ».

Un enregistrement crée un point de référence sans supprimer les piles d’annulation de la session courante.

## 11. Accessibilité et présentation

- navigation complète au clavier des panneaux, tables, groupes, relations et points de contrôle ;
- libellés accessibles pour les tables, champs, cardinalités et commandes ;
- focus visible avec contraste minimal de 3:1 ;
- texte normal avec contraste minimal de 4,5:1 ;
- états non communiqués uniquement par la couleur ;
- cibles interactives d’au moins 32 pixels ;
- respect de `prefers-reduced-motion` ;
- adaptation aux thèmes clair et sombre de l’hôte ;
- aucune police, image, feuille de style ou ressource chargée depuis le réseau.

## 12. Sécurité et confidentialité

- résolution uniquement dans les racines de workspace fournies par Codex ;
- refus des chemins absolus, traversées, liens symboliques et jonctions sortantes ;
- contenu complet livré au composant dans les métadonnées réservées à l’interface plutôt que dans le texte visible du transcript lorsque le protocole le permet ;
- aucun `fetch`, XHR, WebSocket, EventSource ou domaine CSP autorisé ;
- rendu des noms et notes par échappement React, sans HTML arbitraire ;
- validation stricte des schémas des outils MCP ;
- écritures sérialisées par document ;
- snapshots compressés protégés contre la substitution de chemin et vérifiés par empreinte.

## 13. Stratégie de tests

### 13.1 Tests unitaires

- parsing, diagnostics et plages source ;
- patchs `TableGroup` et `DiagramView` préservant commentaires et formatage ;
- identités stables entre deux parsings ;
- règles d’inclusion et d’exclusion des vues ;
- niveaux de détail et surcharges ;
- calcul des relations orthogonales et points de contrôle ;
- rétention, épinglage et index de révisions ;
- journal et récupération de transaction ;
- détection d’empreinte et conflits ;
- politiques de chemins et confinement.

### 13.2 Tests de composants

- saisie différée et conservation du dernier graphe valide ;
- synchronisation sélection source/diagramme ;
- redimensionnement et repli des panneaux ;
- création de groupe et aperçu du patch ;
- création, duplication, renommage et suppression de vues ;
- changement global et surcharge du niveau de détail ;
- déplacement clavier/pointeur des tables et points de contrôle ;
- animation conditionnelle et réduction des mouvements ;
- minicarte, recherche, centrage et réorganisation ;
- historique, diff et restauration.

### 13.3 Tests d’intégration MCP

- ouverture d’un document avec source réservée à l’interface ;
- enregistrement transactionnel DBML + layout + révision ;
- conflit causé par une modification externe ;
- récupération après interruption simulée à chaque phase de transaction ;
- restauration créant une nouvelle révision ;
- comportement multi-racines et messages d’erreur assainis.

### 13.4 Tests de bout en bout dans Codex

- ouverture de `fixtures/demo-shop.dbml` ;
- passage intégré vers plein écran et retour ;
- modification valide puis invalide du DBML ;
- création d’un groupe et d’une vue ;
- déplacement d’une table et d’un point de relation ;
- changement de niveau de détail ;
- enregistrement, fermeture, réouverture et restitution exacte ;
- consultation du diff et restauration d’une révision ;
- observation réseau confirmant zéro requête du composant ;
- contrôle clavier et thème sombre.

## 14. Budgets non fonctionnels

- ouverture interactive d’un document de démonstration en moins de 2 secondes ;
- retour visuel d’une interaction graphique en moins de 100 ms ;
- parsing différé sans tâche principale supérieure à 100 ms pour le fichier de démonstration ;
- aucune perte de frappe pendant parsing, layout ou sauvegarde ;
- bundle entièrement local ;
- support fonctionnel d’au moins 200 tables et 500 relations, avec mesure dédiée avant publication.

## 15. Critères d’acceptation

La fonctionnalité est acceptée lorsque :

1. le fichier DBML est modifiable dans le panneau gauche ;
2. un DBML valide actualise le diagramme et un DBML invalide conserve le dernier graphe valide ;
3. le passage en plein écran préserve le brouillon et le viewport ;
4. une sélection source/diagramme se synchronise dans les deux sens ;
5. un groupe créé graphiquement produit un `TableGroup` sans altérer le reste du fichier ;
6. une vue produit un `DiagramView` et conserve son layout propre ;
7. les trois niveaux de détail fonctionnent globalement et par table ;
8. les relations montrent cardinalités, sens et points de contrôle enregistrables ;
9. `Ctrl+S` crée une révision cohérente du DBML et du layout ;
10. la restauration crée une nouvelle révision sans détruire l’historique ;
11. un conflit externe bloque l’écrasement silencieux ;
12. la fermeture avec brouillon permet une récupération ultérieure ;
13. les vérifications build, types, tests, confinement et absence de réseau réussissent ;
14. le parcours complet est observé dans Codex desktop.

