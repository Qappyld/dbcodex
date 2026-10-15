# Spécification produit — DBCodex autonome

## Vision

DBCodex est un logiciel local pour comprendre, éditer et organiser des schémas DBML. Il réunit :
- un diagramme interactif ;
- un éditeur DBML synchronisé ;
- un projet .dbcd avec disposition et historique ;
- un espace de discussions avec Codex ou Claude Code ;
- des propositions de modification examinables avant application.

L’utilisateur garde la maîtrise de ses fichiers. Le logiciel fonctionne comme éditeur sans assistant installé ou sans Internet. L’assistance IA utilise un service en ligne, après un envoi volontaire.

## Distribution portable Windows — validée le 13 octobre 2026

DBCodex doit fonctionner depuis un dossier décompressé, sous un compte Windows standard, sans installation ni élévation de privilèges. La distribution de référence est une archive ZIP contenant DBCodex.exe et ses composants nécessaires ; Node.js et les outils de développement ne doivent pas être installés sur le poste utilisateur.

Les projets .dbcd sont enregistrés dans un emplacement choisi par l’utilisateur. Les préférences personnelles (notamment thème et projets récents) sont enregistrées par défaut dans un sous-dossier de données du répertoire portable, distinct des fichiers applicatifs remplaçables. Les caches propres au poste et les identifiants IA restent séparés des données portables ; les identifiants sont hors de l’archive distribuée et des projets. Le remplacement du dossier applicatif doit préserver les projets et préférences.

Le dossier portable et les projets peuvent être placés dans un répertoire synchronisé, notamment OneDrive. Les références aux projets récents utilisent des chemins relatifs à la racine du dossier portable lorsque c’est possible, afin de supporter un déplacement ou une racine OneDrive différente sur un autre PC. Un projet extérieur peut conserver un chemin absolu et être relocalisé explicitement. Il s’agit de chemins de fichiers, pas d’URL de partage OneDrive.

Des préférences absentes ou illisibles ne doivent pas empêcher le démarrage : utiliser les valeurs par défaut. Un dossier de préférences non accessible en écriture conduit à un repli local au compte utilisateur, annoncé discrètement ; si aucun emplacement n’est accessible, les préférences restent en mémoire pour la session. Un projet récent introuvable ou non disponible localement reste marqué indisponible, avec possibilité de réessayer, retrouver le fichier ou retirer l’entrée. Ne pas créer un projet vide à sa place, supprimer son fichier ni afficher une erreur bloquant tout le logiciel.

L’éditeur, le diagramme et l’historique doivent fonctionner hors ligne. Le chat utilise les moteurs Codex/Claude disponibles sur le poste ; leur présence n’est pas un prérequis au lancement de DBCodex. Les moteurs et leur authentification doivent être qualifiés séparément sans droits administrateur. Si un moteur est absent, son chat est indisponible ; l’application explique la limite et conserve l’éditeur utilisable. Aucun embarquement ou installation automatique de ces moteurs n’est requis pour la version portable.

Les politiques d’entreprise peuvent interdire les exécutables portables ou les connexions IA ; la portabilité ne contourne pas ces restrictions. L’association Windows de .dbcd n’est pas un prérequis au lancement.

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

Les commandes graphiques existantes restent disponibles. Plusieurs projets peuvent être ouverts simultanément dans des fenêtres ou instances distinctes, avec une seule fenêtre éditable par projet. Les ouvertures supplémentaires du même projet sont en lecture seule.

Le fichier .dbcd contient toutes les données du projet : modèle, présentation, vues, historique, brouillons de projet, discussions et propositions. L’archivage des discussions est l’action par défaut ; leur suppression est explicite et conserve les traces des modifications déjà appliquées.

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

