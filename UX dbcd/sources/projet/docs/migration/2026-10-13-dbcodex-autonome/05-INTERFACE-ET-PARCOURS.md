# Interface et parcours utilisateur

## Fenêtre

- Barre supérieure : projet, état enregistré/modifié, ouvrir/créer/importer, enregistrer.
- Éditeur DBML à gauche : repliable, diagnostics et sélection synchronisés.
- Diagramme au centre : vues, groupes, recherche, zoom et dispositions existants.
- Un seul panneau droit, redimensionnable et repliable, avec deux onglets : **Vues**, **IA**. Un seul contenu d’onglet est affiché à la fois ; aucun panneau de discussion adjacent séparé ni inspecteur Propriétés complet.
- Historique de projet accessible depuis la barre supérieure.

Prévoir redimensionnement, focus clavier, thème et adaptation à une petite fenêtre. Éviter d’empiler plusieurs éditeurs ou d’ouvrir un navigateur externe.

## Panneau droit et outils du diagramme — direction révisée le 13 octobre 2026

- **Vues** : choix et gestion des vues, recherche et visibilité des tables, organisation par schéma ou groupe.
- L’onglet **Propriétés** est retiré : les informations de structure ne sont pas répétées dans un inspecteur. La commande **Couleur** se trouve dans la barre flottante du bas ; elle ouvre une palette et une couleur personnalisée pour la table ou le groupe sélectionné. Elle est désactivée sans sélection compatible ou si le projet est en lecture seule.
- **IA** : liste des discussions du projet, messages, contexte partagé, saisie et propositions examinables avant application. Changer d’onglet conserve la discussion active, les messages, la saisie et l’état d’une requête en cours ; aucun message n’est envoyé par ce changement.

La barre flottante du diagramme propose notamment **Créer un groupe** à partir des tables sélectionnées et **Couleur** pour la table ou le groupe sélectionné. Les commandes qui dépendent de la sélection sont désactivées sans sélection compatible ou si le projet est en lecture seule. Le fonctionnement exact de création continue de respecter les patchs DBML et les validations existants.

Sur petite fenêtre, conserver ce même panneau à onglets, repliable, afin de préserver l’espace du diagramme. Les commandes graphiques restent utilisables pendant qu’une discussion est affichée.

## Double-clic : retrouver la définition dans le DBML

Un clic simple sélectionne l’objet dans le diagramme et affiche ses commandes contextuelles, sans déplacer le focus ni faire défiler l’éditeur. Un double-clic sur une table, une relation ou un groupe ouvre le panneau DBML à gauche s’il est replié, fait défiler jusqu’à sa définition et sélectionne le texte correspondant :

- table : bloc `Table` entier, accolades comprises ;
- groupe : bloc `TableGroup` entier, accolades comprises ;
- relation : déclaration `Ref` correspondante, ou clause `ref` inline lorsque la relation est déclarée dans un champ.

L’éditeur reçoit le focus pour permettre la modification directe du texte. Cette navigation ne modifie pas le DBML, ne déclenche aucun appel IA et ne remplace pas un brouillon. Le panneau droit garde son onglet et son contenu. Les commandes contextuelles et poignées de routage ne doivent pas déclencher accidentellement cette navigation.

Retrouver la plage exacte dans le texte courant, en distinguant les schémas et les relations entre mêmes tables ; éviter une recherche approximative par nom. Si le DBML a changé ou est invalide et qu’aucune plage fiable ne peut être retrouvée, conserver le texte et expliquer discrètement que la définition ne peut pas être localisée. Un groupe purement visuel sans définition DBML ne doit pas conduire vers un bloc inventé. La navigation reste disponible en lecture seule, sans permettre d’écriture.

## Accueil

L’utilisateur peut :
- ouvrir un projet récent ;
- choisir un .dbcd ;
- créer un projet ;
- importer un DBML dans un nouveau projet ;
- utiliser une démonstration fictive.

Si Codex/Claude est absent ou non connecté, afficher l’état et les étapes de connexion. L’éditeur doit tout de même fonctionner. Détecter une installation sans lancer d’inférence.

## Préférences et projets récents indisponibles

Le thème et les projets récents sont conservés dans le dossier portable. Un premier lancement sans préférences ouvre normalement l’accueil avec les valeurs par défaut. Une configuration illisible affiche une information discrète, sans boîte d’erreur technique ni blocage ; le fichier original est conservé. Si le dossier ne permet pas la sauvegarde, indiquer le repli local ou « Préférences conservées pour cette session uniquement ».

Une entrée récente dont le fichier est absent, inaccessible ou pas encore disponible localement affiche **Indisponible**. Proposer **Réessayer**, **Retrouver le fichier** et **Retirer de la liste** ; retirer une entrée ne supprime aucun fichier. Si le fichier dépend de OneDrive, inviter à vérifier sa disponibilité locale et la synchronisation. La liste ne déclenche pas en boucle des tentatives d’ouverture ou des demandes de connexion.

Un problème affectant un projet laisse les autres projets et les actions ouvrir/créer accessibles. Si un fichier devient indisponible pendant l’édition, préserver le travail en mémoire, suspendre les écritures vers ce fichier et proposer une récupération vers une nouvelle copie validée. Ne pas remplacer automatiquement le fichier manquant par un projet vide ni présenter une sauvegarde échouée comme réussie.

## Projets simultanés

Plusieurs projets peuvent être ouverts en parallèle dans des fenêtres ou instances distinctes. Une seule fenêtre est éditable pour un projet donné ; une ouverture supplémentaire affiche clairement son état en lecture seule. Aucune opération d’écriture de projet, y compris chat, brouillon ou application de proposition, n’est disponible dans cette fenêtre. Les commandes graphiques existantes restent disponibles dans la fenêtre éditable.

## Nouvelle discussion

Choisir un titre et un assistant. L’assistant reste attaché à cette discussion. L’utilisateur retrouve les discussions en revenant au projet.

La saisie non envoyée est propre à chaque discussion. Un changement d’onglet ne doit pas effacer un message en préparation.

L’action par défaut pour retirer une discussion de la liste active est **Archiver**. Les discussions archivées restent consultables et peuvent être réactivées. **Supprimer** est une action explicite distincte ; son aperçu indique ce qui sera supprimé et rappelle que les versions du projet et les traces des modifications appliquées sont conservées.

## Contexte visible

Afficher un résumé tel que :
« Envoyé à Codex : structure de clients, commandes ; notes et données d’exemple exclues. »

Par défaut, utiliser les tables de la vue active ou une sélection explicite. Aucune sélection ambiguë ne doit signifier silencieusement « tout le projet ».

Afficher un aperçu du contenu réellement envoyé. L’élargissement de contexte est une action volontaire. Le texte déjà présent dans l’historique de cette discussion doit être pris en compte dans cet aperçu ou expliqué : réduire la sélection actuelle ne fait pas disparaître un contexte ancien déjà envoyé.

Si un patch exact demande une portion de source absente du contexte structurel, demander/présenter le fragment nécessaire ou utiliser une transformation locale vérifiée. Ne pas transmettre le DBML complet pour contourner cette limite sans signalement.

## Discussion

Exemple : « Est-ce pertinent de séparer les adresses ? »

Le logiciel ajoute un message utilisateur, envoie le contexte autorisé, affiche la réponse et propose éventuellement « Préparer une proposition ». Le projet enregistré ne change pas.

Même si le message contient « applique », le mode Discussion ne déclenche pas une écriture. La capacité d’application appartient à l’interface.

## Préparer

Exemple : « Prépare la séparation des adresses à partir de notre discussion. »

L’IA renvoie une proposition. Le logiciel vérifie ses opérations et sa cohérence. Le panneau montre :
- titre et explication ;
- tables/colonnes/relations concernées ;
- suppressions mises en évidence ;
- avant/après textuel ;
- aperçu du diagramme proposé si réalisable sans modifier le projet ;
- base et état : actuelle/périmée/invalide ;
- Appliquer, Réviser, Rejeter.

Ne pas présenter un changement de disposition comme une écriture DBML lorsque ce n’est pas le cas.

## Appliquer

Le bouton est disponible seulement si :
- proposition valide et actuelle ;
- projet éditable ;
- aucune sauvegarde/migration concurrente ;
- brouillon de l’éditeur résolu.

Un clic applique l’ensemble et crée une révision. Afficher le résultat et la possibilité de consulter l’historique. Pas de deuxième confirmation systématique pour des changements déjà examinés ; pour une opération destructrice majeure, la confirmation doit indiquer précisément ce qui sera perdu.

## Proposition périmée

Exemple : discussion A modifie clients, proposition de discussion B repose sur l’état précédent.

B conserve son historique et sa proposition originale, mais celle-ci ne peut plus s’appliquer. Afficher :
« Le projet a changé depuis cette proposition. »
Bouton : **Actualiser la proposition**.

L’actualisation ne masque pas la proposition précédente : conserver une trace ou la marquer remplacée. Elle ne fait aucun appel IA tant que l’utilisateur ne l’a pas demandée.

## Réviser ou rejeter

Réviser garde une proposition non applicable pendant la préparation de sa remplaçante. Rejeter ne modifie pas le projet et garde la trace dans la discussion.

Une proposition appliquée ne peut pas être appliquée une seconde fois comme un nouvel événement.

## Annuler et restaurer

Annuler une saisie locale suit le comportement actuel de l’éditeur/diagramme. Revenir sur une modification appliquée passe par l’historique et crée une nouvelle révision.

L’interface doit expliquer que restaurer un modèle ne supprime pas les conversations ni les versions plus récentes de l’historique.

## Erreurs et fermeture

Réponses incomplètes, perte de connexion, quotas atteints, CLI absent et login expiré sont des états distincts. Préserver message et projet, proposer une reprise.

Fermer pendant une sauvegarde attend sa fin puis conserve le brouillon restant. Un arrêt forcé reste soumis au dernier état effectivement écrit ; ne pas promettre une récupération magique de données jamais persistées.

