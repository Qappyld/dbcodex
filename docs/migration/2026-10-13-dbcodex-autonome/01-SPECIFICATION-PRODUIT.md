# Spécification produit — DBCodex autonome

## Vision

DBCodex est un logiciel local pour comprendre, éditer et organiser des schémas DBML. Il réunit :
- un diagramme interactif ;
- un éditeur DBML synchronisé ;
- un projet .dbcd avec disposition et historique ;
- un espace de discussions avec Codex ou Claude Code ;
- des propositions de modification examinables avant application.

L’utilisateur garde la maîtrise de ses fichiers. Le logiciel fonctionne comme éditeur sans assistant installé ou sans Internet. L’assistance IA utilise un service en ligne, après un envoi volontaire.

## Objectifs de la première version autonome

1. Ouvrir, créer ou importer un projet par un dialogue de fichier Windows.
2. Réutiliser l’atelier actuel, sans remplacer React Flow ni CodeMirror.
3. Créer plusieurs discussions nommées pour le même projet.
4. Choisir Codex ou Claude Code à la création d’une discussion.
5. Poser des questions sans aucune écriture du schéma.
6. Préparer une proposition à partir d’un message ou des décisions de la discussion.
7. Examiner explication, opérations et différence avant/après.
8. Appliquer explicitement une proposition validée.
9. Détecter les changements concurrents et refuser les propositions périmées.
10. Consulter l’historique et restaurer une version en conservant les versions suivantes.
11. Retrouver le projet, les discussions et les propositions après fermeture.
12. Annuler une requête IA sans endommager le projet.

## Règle principale : discuter n’est pas appliquer

Une phrase ambiguë telle que « Est-ce qu’on pourrait ajouter un champ ? » ne doit jamais changer le fichier. Même une demande explicite « Ajoute un champ » passe par une proposition visible dans cette première version.

Le texte de l’utilisateur ne débloque pas directement l’écriture. L’action **Appliquer** dans le panneau de proposition est la seule confirmation suffisante pour appliquer cette proposition précise.

La génération d’une proposition peut stocker la proposition et les messages localement ; elle ne modifie ni le DBML enregistré, ni sa présentation, ni son historique de versions appliquées.

## Plusieurs discussions, un seul modèle

Exemples :
- « Modèle clients » ;
- « Facturation » ;
- « Revue des relations » ;
- « Performance et index ».

Chaque discussion conserve ses messages, son assistant, ses paramètres de contexte et ses propositions. Le modèle enregistré, la présentation et l’historique de projet sont communs. Une application de changement provenant d’une discussion doit être visible partout.

Une discussion n’est pas une branche de schéma. La V1 ne gère pas plusieurs versions divergentes du modèle en parallèle. Les propositions peuvent être alternatives, mais seule la version enregistrée commune est la source de vérité.

## Portée fonctionnelle à préserver

Le socle actuel comprend des vues, groupes, positions, niveaux de détail, recherches, historique et brouillons. La migration doit les conserver. Toute modification du texte doit préserver le reste du DBML et ses commentaires.

Les noms, notes ou données d’exemple d’un projet peuvent être sensibles. Le partage vers l’IA doit être explicitement défini et visible. Le diagramme ne provoque aucun appel IA lorsqu’une table est simplement sélectionnée ou déplacée.

## Hors périmètre de cette migration

- exports PNG/SVG encore non livrés, couverture DBML avancée et autres chantiers sans rapport direct ;
- collaboration cloud, hébergement de projets ou édition multi-utilisateurs temps réel ;
- connexion aux bases de production ou collecte de secrets ;
- génération silencieuse de commits Git ;
- marketplace/publication publique avant décision de licence et de distribution ;
- génération du schéma par une IA sans validation utilisateur ;
- déplacement du logiciel dans un navigateur externe ;
- changement global de framework ou refonte de l’éditeur.

## Critère de réussite

L’utilisateur ouvre DBCodex, charge un .dbcd, discute avec l’assistant choisi, prépare puis applique une proposition après inspection, observe le diagramme actualisé et peut restaurer l’état antérieur. La fermeture puis la réouverture conservent les discussions, le projet et l’historique.

