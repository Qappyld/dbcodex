# Fichier de travail dbcodex `.dbcd` — Spécification de conception

**Date :** 26 septembre 2026  
**Statut :** conception approuvée, revue écrite en attente  
**Remplace :** la persistance `.dbml` + sidecars de la spécification du 25 septembre 2026

## 1. Décision

Un projet dbcodex est stocké dans un fichier unique portant l’extension `.dbcd`.
Ce fichier est la source persistante de l’atelier : il contient le texte DBML,
la présentation du diagramme, les vues, le brouillon récupérable et l’historique
des enregistrements.

Le format interne est une base SQLite. Le serveur MCP l’ouvre localement avec le
module `node:sqlite`; le moteur minimal devient Node.js 22.13 afin de ne pas
ajouter de dépendance native à compiler ou à distribuer. Le chargement
d’extensions SQLite reste désactivé.

Le DBML demeure la source de vérité fonctionnelle du modèle. SQLite ne remplace
pas la syntaxe DBML : il regroupe dans un seul document de travail le DBML et les
données d’atelier qui l’accompagnent.

## 2. Alternatives étudiées

### 2.1 SQLite — retenu

SQLite fournit des transactions, des contraintes, des migrations de format et
un accès ciblé à l’historique sans réécrire tout le document. Le fichier est
binaire et donc peu lisible dans un diff Git, mais c’est l’option la plus robuste
pour un document unique versionné.

### 2.2 Archive ZIP — rejetée

Une archive contenant `model.dbml`, `views.json` et `history/` serait facilement
inspectable après extraction. En revanche, chaque enregistrement réécrirait
l’archive entière et demanderait un protocole supplémentaire pour garantir son
atomicité et sa récupération après interruption.

### 2.3 JSON ou YAML monolithique — rejeté

Un format texte serait diffable, mais l’historique ferait grossir et réécrire le
fichier rapidement. Le DBML y serait échappé ou imbriqué, ce qui dégraderait
l’expérience d’édition et la résistance aux écritures interrompues.

## 3. Contenu logique

Le schéma SQLite initial comporte les unités suivantes :

- `project_meta` : version du format, identifiant du projet et dates de création
  et de modification ;
- `document_state` : unique état officiellement enregistré, avec texte DBML,
  empreinte, présentation sérialisée, numéro de génération et révision courante ;
- `draft_state` : brouillon facultatif, sa génération de base, son texte DBML,
  sa présentation et sa date de mise à jour ;
- `revisions` : snapshots immuables et compressés du DBML et de la présentation,
  parent, date, empreintes, résumé, libellé facultatif et état épinglé.

La présentation sérialisée contient notamment :

- les vues nommées et la vue système « Toutes les tables » ;
- les positions, tailles, viewport et niveau de détail par vue ;
- les groupes visuels, états repliés et couleurs ;
- les routages et points de contrôle des relations ;
- les dimensions et états repliés des panneaux.

Les définitions fonctionnelles `TableGroup` et `DiagramView` restent dans le
texte DBML. Leur état graphique complémentaire se trouve dans la présentation.
Un snapshot de révision contient toujours les deux afin de pouvoir restaurer un
état cohérent.

## 4. Cycle de vie du document

### 4.1 Création et import

- Un nouveau projet crée directement un fichier `.dbcd` valide avec une première
  révision.
- L’import d’un `.dbml` crée un nouveau `.dbcd` sans modifier le fichier source.
- L’outil historique `open_dbml` reste disponible pour la prévisualisation et
  propose la conversion vers `.dbcd`; l’édition persistante cible `.dbcd`.
- Une collision de nom ne provoque jamais d’écrasement silencieux.

### 4.2 Ouverture

`open_dbcd` vérifie que le chemin reste dans une racine de workspace autorisée,
refuse les liens symboliques ou jonctions sortantes, contrôle la signature
SQLite, la version de format et les contraintes essentielles, puis charge l’état
enregistré et le brouillon éventuel.

Un format plus récent non reconnu est ouvert en lecture seule. Un fichier
corrompu n’est jamais migré ni réécrit automatiquement ; l’interface présente
une erreur assainie et conserve le fichier intact.

### 4.3 Brouillon

La saisie et les déplacements mettent à jour la session en mémoire. Un brouillon
récupérable est écrit périodiquement dans `draft_state` sans créer de révision.
Un brouillon DBML invalide est autorisé, mais le diagramme conserve le dernier
graphe valide.

À la réouverture, le brouillon peut être repris ou écarté depuis l’interface. Un
enregistrement réussi supprime le brouillon correspondant dans la même
transaction.

### 4.4 Enregistrement et versionnement

`Ctrl+S` et le bouton Enregistrer exécutent une seule transaction SQLite :

1. valider le DBML et l’état de présentation ;
2. vérifier la génération de base pour détecter une modification concurrente ;
3. compresser et insérer un snapshot immuable dans `revisions` ;
4. remplacer `document_state` et incrémenter sa génération ;
5. supprimer le brouillon intégré ;
6. valider la transaction puis actualiser la session.

Une validation échouée annule toute la transaction. Une révision n’est donc
jamais visible sans son état courant correspondant. Les écritures d’un même
fichier sont sérialisées dans le serveur MCP.

SQLite utilise `journal_mode=DELETE`, `foreign_keys=ON` et
`synchronous=FULL`. Un journal temporaire peut exister pendant une transaction
ou après une interruption, mais le seul artefact persistant au repos est le
fichier `.dbcd`.

### 4.5 Historique et restauration

Chaque enregistrement explicite produit une révision. Les snapshots sont
immuables ; les seules métadonnées modifiables d’une révision sont son libellé et
son état épinglé. La politique initiale conserve au plus 500 révisions ou 90
jours, sans supprimer les révisions épinglées.

La restauration affiche les différences DBML et graphiques, puis crée une
nouvelle révision courante. Elle ne supprime ni ne modifie les révisions qui la
suivent dans l’historique.

### 4.6 Export

L’export `.dbml` écrit uniquement le texte DBML de la révision courante ou d’une
révision choisie. Il ne modifie pas le `.dbcd`. Cette sortie reste lisible par les
outils DBML et fournit un artefact texte adapté aux revues Git.

## 5. Intégration dans Codex

Le plugin expose un outil principal `open_dbcd`. La commande naturelle
« Ouvre `fixtures/demo-shop.dbcd` avec dbcodex » renvoie la ressource MCP Apps de
l’atelier. L’interface s’affiche dans la surface proposée par l’hôte et peut
passer en plein écran sans perdre sa session.

Le format ne suppose pas qu’un double-clic sur `.dbcd` déclenche un éditeur
personnalisé : cette association de fichier n’est pas une capacité publique
garantie de Codex. Si l’hôte ajoute une surface latérale compatible, la même
ressource responsive doit pouvoir l’utiliser sans changer le format du fichier.

Les outils MCP secondaires couvrent la validation d’un brouillon,
l’enregistrement, la liste des révisions, le diff, la restauration, l’import et
l’export. Le texte DBML complet et les chemins absolus ne sont pas placés dans le
contenu visible du transcript.

## 6. Concurrence, erreurs et récupération

- Chaque session mémorise la génération de `document_state` observée à
  l’ouverture ou au dernier enregistrement.
- La transaction d’enregistrement compare cette génération avant toute
  mutation. Une différence produit un conflit explicite et ne modifie rien.
- Un verrou SQLite occupé attend pendant une durée bornée puis retourne une
  erreur récupérable ; aucune boucle d’attente infinie n’est autorisée.
- Après interruption, SQLite restaure ou annule la transaction à la prochaine
  ouverture grâce à son journal.
- `PRAGMA quick_check` est exécuté lors d’une ouverture suspecte ou après une
  récupération, pas à chaque interaction.
- Les migrations de schéma utilisent `PRAGMA user_version` et une transaction.
  Un échec laisse l’ancienne version intacte.

## 7. Sécurité et confidentialité

- Tous les accès restent sous les racines de workspace fournies par Codex.
- Les chemins absolus fournis par le modèle, traversées, liens symboliques et
  jonctions sortantes sont refusés.
- Les requêtes utilisent des instructions préparées pour toutes les valeurs.
- Le chargement d’extensions SQLite et les bases attachées sont interdits.
- Les limites de taille du DBML, de la présentation et des snapshots compressés
  sont vérifiées avant allocation ou décompression.
- Aucune donnée du `.dbcd` n’est transmise sur le réseau.
- Les messages visibles du modèle ne contiennent ni source complète, ni snapshot,
  ni chemin absolu.

## 8. Évolution du code existant

Les contrats déjà introduits (`DocumentSnapshot`, `DocumentDraft`,
`RevisionSummary`) sont conservés dans leur intention mais remplacent
`sourcePath` par une identité de projet et séparent l’état enregistré du chemin
d’export. `LayoutDocument` devient la représentation de présentation stockée
dans le conteneur.

`LayoutStore`, les sidecars `.dbcodex/` et le futur `RevisionStore` sur fichiers
sont remplacés par un `DbcdProjectStore`. La politique de confinement des chemins
et le parseur DBML existants restent réutilisés. Les anciens tests de sidecars
sont remplacés par des tests de migration, de transaction et de corruption du
conteneur.

## 9. Stratégie de tests

### 9.1 Tests unitaires

- création du schéma et lecture d’un projet vide ;
- validation de la version de format et migrations transactionnelles ;
- sérialisation déterministe de la présentation ;
- compression, empreintes et immutabilité des révisions ;
- rétention, épinglage et restauration non destructive ;
- import et export DBML sans altération du texte ;
- refus des chemins et fichiers non autorisés.

### 9.2 Tests d’intégration

- un enregistrement met à jour DBML, présentation et historique dans une seule
  transaction ;
- une erreur injectée à chaque étape ne laisse aucun état partiel ;
- deux sessions concurrentes produisent un conflit de génération ;
- une interruption avec journal est récupérée à la réouverture ;
- un brouillon invalide est récupérable sans remplacer l’état enregistré ;
- une base corrompue ou de version future reste intacte ;
- le nombre de fichiers stables au repos reste égal à un.

### 9.3 Tests UI et MCP

- ouverture de `.dbcd`, modification, enregistrement, fermeture et réouverture ;
- conservation de la session pendant le passage intégré/plein écran ;
- navigation dans l’historique, diff et restauration ;
- import `.dbml` et export d’une révision ;
- absence de source complète et de chemin absolu dans les sorties visibles ;
- fonctionnement entièrement hors ligne.

## 10. Critères d’acceptation

1. Un projet complet est transportable sous la forme d’un seul fichier `.dbcd`.
2. Son DBML, ses vues, ses layouts, son brouillon et ses révisions survivent à la
   fermeture puis à la réouverture.
3. Chaque enregistrement valide crée exactement une révision cohérente.
4. Aucun enregistrement invalide, concurrent ou interrompu ne produit d’état
   partiel.
5. Un `.dbml` peut être importé sans être modifié et réexporté sans perte du texte
   enregistré.
6. Le projet s’ouvre dans l’atelier MCP Apps de Codex et passe en plein écran.
7. Le stockage et l’interface fonctionnent sans accès réseau.
8. Les vérifications de build, types, tests, confinement et récupération
   réussissent sur le runtime Node minimal supporté.
