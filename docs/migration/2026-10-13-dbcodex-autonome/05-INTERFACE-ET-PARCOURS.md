# Interface et parcours utilisateur

## Fenêtre

- Barre supérieure : projet, état enregistré/modifié, ouvrir/créer/importer, enregistrer.
- Éditeur DBML à gauche : repliable, diagnostics et sélection synchronisés.
- Diagramme au centre : vues, groupes, recherche, zoom et dispositions existants.
- Espace droit : liste des discussions, messages, champ de saisie et propositions.
- Historique de projet accessible depuis la barre supérieure.

Prévoir redimensionnement, focus clavier, thème et adaptation à une petite fenêtre. Éviter d’empiler plusieurs éditeurs ou d’ouvrir un navigateur externe.

## Accueil

L’utilisateur peut :
- ouvrir un projet récent ;
- choisir un .dbcd ;
- créer un projet ;
- importer un DBML dans un nouveau projet ;
- utiliser une démonstration fictive.

Si Codex/Claude est absent ou non connecté, afficher l’état et les étapes de connexion. L’éditeur doit tout de même fonctionner. Détecter une installation sans lancer d’inférence.

## Nouvelle discussion

Choisir un titre et un assistant. L’assistant reste attaché à cette discussion. L’utilisateur retrouve les discussions en revenant au projet.

La saisie non envoyée est propre à chaque discussion. Un changement d’onglet ne doit pas effacer un message en préparation.

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

