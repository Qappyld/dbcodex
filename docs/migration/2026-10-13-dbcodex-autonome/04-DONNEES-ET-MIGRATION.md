# Données, version du format et migration

## État actuel

`packages/core/src/dbcd-schema.ts` définit **DBCD_FORMAT_VERSION = 1**. Le .dbcd contient :
- project_meta ;
- document_state, avec source DBML exacte et présentation ;
- draft_state ;
- revisions, avec snapshots compressés du modèle et de la présentation.

Les révisions actuelles ne contiennent pas de conversations. Les stores vérifient identité de projet, révision courante et génération. Les formats futurs inconnus sont traités selon le comportement existant de lecture seule ; les fichiers corrompus ne doivent pas être réécrits.

## Cible fonctionnelle

Un projet portable doit regrouper toutes ses données, dont modèle, présentation, vues, historique, brouillons de projet, discussions et propositions, dans un seul .dbcd. Ce choix a été confirmé par l’utilisateur le 13 octobre 2026. Ne pas inventer un schéma v2 définitif sans analyser les stores et la compatibilité v1.

Un schéma logique pourrait introduire :
- discussions : id, titre, fournisseur, dates, archivage, préférences de contexte ;
- messages : discussion, rôle, texte, état, mode, version et contexte associés ;
- propositions : discussion, explication, opérations, avant/après, base, statut ;
- paramètres de projet spécifiques au chat, sans identifiants de connexion.

Les comptes et tokens restent gérés par les mécanismes officiels des fournisseurs, hors du projet portable.

## Préférences personnelles et chemins portables

Le fichier .dbcd contient les données propres au projet. Le thème général et la liste des projets récents appartiennent aux préférences de l’application, sauvegardées par défaut dans un sous-dossier de données du répertoire portable. Elles ne contiennent aucun token fournisseur. Leur nom de fichier et leur schéma versionné seront définis pendant la conception technique.

Les chemins récents sont typés comme relatifs ou absolus. La base des chemins relatifs est la racine du dossier portable, et non le répertoire courant du processus. Privilégier les chemins relatifs pour les projets dans ce dossier ou sa même arborescence transportable ; conserver un chemin absolu pour un emplacement extérieur lorsque le relatif ne serait pas pertinent ou possible. Un chemin relatif ne donne aucun droit d’accès : les vérifications de fichier et d’autorisation restent nécessaires.

À l’ouverture, résoudre puis vérifier le fichier demandé. Si le dossier a été déplacé ou si la racine OneDrive change entre deux postes, une arborescence relative identique doit continuer de fonctionner. Les chemins absolus devenus invalides proposent une relocalisation volontaire ; vérifier le projet sélectionné avant d’actualiser l’entrée et ne pas confondre deux projets de même nom.

Préférences absentes : utiliser les valeurs par défaut et une liste récente vide ; créer la configuration lors d’une sauvegarde si l’emplacement est accessible. Préférences malformées ou de version future inconnue : valeurs par défaut, information discrète et conservation du fichier original ; ne pas l’écraser automatiquement. Écriture des préférences : remplacement atomique après validation. Un dossier non accessible en écriture entraîne un repli dans les données locales du compte utilisateur, indiqué dans l’interface ; à défaut, mode session sans persistance des préférences. Le choix de repli ne doit pas déplacer les projets ni recopier leurs données.

Les entrées indisponibles restent dans la liste récente jusqu’à retrait explicite ou relocalisation. Une entrée récente n’est ni une preuve d’existence ni une autorisation de créer un fichier. Un problème de préférences n’altère pas les .dbcd.

La reprise depuis un dossier synchronisé doit être testée. Les fichiers non disponibles localement, erreurs de synchronisation, copies en conflit et remplacements externes sont des états à traiter ; aucune fusion silencieuse de bases .dbcd n’est prévue. Les caches, verrous actifs et identifiants propres au poste ne sont pas des préférences à transporter.

## Ce qui change de version, et ce qui n’en change pas

Séparer :
- la génération du modèle enregistré ;
- les modifications de présentation qui font partie d’une révision ;
- les messages et métadonnées de chat.

Recevoir un message ne doit pas rendre toutes les propositions périmées. Ajouter une discussion ne doit pas créer une nouvelle révision de schéma.

Une restauration de modèle restaure source et présentation. Elle ne supprime pas les discussions historiques ni les propositions rejetées/appliquées. Les propositions encore en attente sont requalifiées par rapport à la version restaurée.

## Proposition liée à sa base

Conserver au minimum :
- identité du projet ;
- identité de la discussion et fournisseur ;
- génération et révision de base ;
- empreinte de la source ;
- date ;
- opérations exactes ;
- avant/après vérifiable ;
- statut et révision d’application.

Comparer le schéma réel et les empreintes au moment d’appliquer. Refuser aussi un projet avec un brouillon non résolu. Une proposition ne doit pas écraser une saisie faite après sa préparation.

## Transactions

Avec un seul SQLite, l’application de proposition doit idéalement :
1. obtenir le verrou et ouvrir une transaction ;
2. revérifier identité, base, source et brouillon ;
3. valider le DBML final ;
4. enregistrer la nouvelle révision et la présentation préservée ;
5. marquer la proposition appliquée ;
6. incrémenter la génération pertinente ;
7. confirmer la transaction.

Une interruption doit laisser soit l’ancien état cohérent, soit le nouveau.

Le code partiel avec deux SQLite utilise un libellé `DBCodex proposal:<id>` pour retrouver une application après interruption. Ce mécanisme est un candidat de récupération, pas une transaction atomique commune. Le réévaluer si les données sont rassemblées.

## Migration v1 vers une version avec chat

Travail à spécifier/tester :
- sauvegarde de récupération avant conversion ;
- vérification de la signature, de la version et de l’intégrité ;
- migration transactionnelle à partir d’un état propre ;
- préservation exacte du texte, commentaires, layouts, brouillon et toutes les révisions ;
- comportement après interruption à chaque étape ;
- refus de migration silencieuse des formats plus récents ;
- compatibilité du plugin ancien avec le fichier migré ;
- procédure de retour vers la copie initiale.

Ne pas supprimer les anciennes données, historiques ou fichiers compagnons à l’import.

## Discussions et confidentialité

Un fichier projet partagé contenant le chat peut révéler des intentions métier et du texte envoyé aux fournisseurs. Prévoir :
- export DBML du modèle seul ;
- export de projet sans conversations ;
- explication claire lors d’un partage de projet complet ;
- archivage par défaut d’une discussion, réversible et sans suppression de ses messages ou propositions ;
- suppression uniquement sur une action explicite indiquant les éléments supprimés ; elle ne supprime ni les révisions du modèle ni les traces des modifications appliquées (identité de proposition, opérations appliquées, date et révision résultante) ;
- aucune clé API ou session fournisseur dans le fichier.

## Brouillons et stockage de message interrompu

Les brouillons de l’éditeur, de la saisie de chat et les réponses partielles sont distincts. La fermeture ordonnée doit les préserver selon les règles prévues. Une réponse partielle ne doit jamais devenir une proposition applicable.

À la reprise, le logiciel indique « interrompu », « échoué » ou « prêt à réessayer ». Il ne relance pas de requête IA facturable sans une nouvelle action de l’utilisateur.

