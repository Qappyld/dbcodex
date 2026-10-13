# Données, version du format et migration

## État actuel

`packages/core/src/dbcd-schema.ts` définit **DBCD_FORMAT_VERSION = 1**. Le .dbcd contient :
- project_meta ;
- document_state, avec source DBML exacte et présentation ;
- draft_state ;
- revisions, avec snapshots compressés du modèle et de la présentation.

Les révisions actuelles ne contiennent pas de conversations. Les stores vérifient identité de projet, révision courante et génération. Les formats futurs inconnus sont traités selon le comportement existant de lecture seule ; les fichiers corrompus ne doivent pas être réécrits.

## Cible fonctionnelle

Un projet portable devrait regrouper modèle, présentation, historique, discussions et propositions dans un seul .dbcd. Ne pas inventer un schéma v2 définitif sans analyser les stores et la compatibilité v1.

Un schéma logique pourrait introduire :
- discussions : id, titre, fournisseur, dates, archivage, préférences de contexte ;
- messages : discussion, rôle, texte, état, mode, version et contexte associés ;
- propositions : discussion, explication, opérations, avant/après, base, statut ;
- paramètres de projet spécifiques au chat, sans identifiants de connexion.

Les comptes et tokens restent gérés par les mécanismes officiels des fournisseurs, hors du projet portable.

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
- suppression/archivage volontaire d’une discussion, avec règles explicites pour ses propositions ;
- aucune clé API ou session fournisseur dans le fichier.

## Brouillons et stockage de message interrompu

Les brouillons de l’éditeur, de la saisie de chat et les réponses partielles sont distincts. La fermeture ordonnée doit les préserver selon les règles prévues. Une réponse partielle ne doit jamais devenir une proposition applicable.

À la reprise, le logiciel indique « interrompu », « échoué » ou « prêt à réessayer ». Il ne relance pas de requête IA facturable sans une nouvelle action de l’utilisateur.

