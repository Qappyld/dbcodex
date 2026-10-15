# Matrice de validation et critères d’acceptation

Tous les contrôles ci-dessous sont des exigences futures, sauf les preuves historiques explicitement indiquées dans 07. La création de ce dossier n’a pas exécuté cette matrice.

## Socle et migration

| Cas | Résultat exigé |
| --- | --- |
| Ouvrir un .dbcd v1 | Modèle, présentation et historique conservés |
| Migration interrompue | Fichier initial récupérable ou état migré cohérent |
| Format futur | Lecture seule ou refus clair, aucune conversion destructive |
| Fichier corrompu | Erreur assainie, pas d’écrasement |
| Notes/commentaires/Records | Préservés lors de modifications non concernées |
| Export modèle seul | DBML sans conversations ni brouillon non enregistré |
| Copier le projet complet | Discussions et propositions récupérables selon format final |
| Import d’un compagnon ancien | Pas de doublons, aucun effacement silencieux |

## Version portable Windows

| Cas | Résultat exigé |
| --- | --- |
| ZIP extrait sur un poste sans outils de développement | DBCodex.exe démarre par double-clic, sans installation de Node.js ni élévation |
| Compte Windows standard | Ouvrir/créer, éditer, enregistrer et rouvrir un .dbcd sans droits administrateur |
| Aucun réseau ni moteur IA disponible | Éditeur, diagramme, brouillon et historique utilisables |
| Paramètres et caches | Écriture uniquement dans des emplacements accessibles au compte ; emplacements documentés |
| Remplacement du dossier applicatif | Projets et paramètres conservés ; migration éventuelle qualifiée |
| Codex/Claude sous compte standard | Moteurs présents : connexion et restrictions vérifiées séparément ; moteur absent : chat correspondant indisponible, éditeur et données de discussion conservés |
| Politique d’entreprise bloquant un moteur ou le réseau IA | Limite documentée, pas de contournement ni d’élévation ; éditeur disponible si son exécution est autorisée |
| Archive, projet ou copie vers un autre poste | Aucun identifiant IA embarqué ; reconnexion selon le compte et le poste |

Consigner la version de Windows, l’architecture, le type de compte et les dépendances présentes. Une validation sur le seul poste de développement ne suffit pas.

## Préférences, chemins relatifs et dossier synchronisé

| Cas | Résultat exigé |
| --- | --- |
| Préférences absentes au premier lancement | Accueil utilisable, thème par défaut, liste récente vide ; aucun blocage |
| Préférences illisibles ou version future inconnue | Valeurs par défaut, information discrète ; original conservé sans écrasement automatique |
| Répertoire portable non inscriptible | Repli local annoncé ; si repli impossible, préférences en mémoire pour la session |
| Écriture des préférences interrompue | Ancienne configuration lisible ou nouvelle configuration complète ; pas de fichier partiel utilisé |
| Dossier portable déplacé, racine OneDrive différente | Les chemins relatifs restent fonctionnels si l’arborescence est conservée |
| Lancement depuis un autre répertoire courant | Résolution relative à la racine portable, sans dépendance au répertoire courant |
| Projet externe référencé par chemin absolu devenu invalide | État indisponible et relocalisation volontaire ; aucun projet vide créé |
| Projet récent absent, accès refusé ou téléchargement local impossible | Indisponible, Réessayer/Retrouver/Retirer accessibles ; autres projets utilisables |
| Retirer une entrée récente | Aucun fichier supprimé |
| Projet disparaissant pendant l’édition | Travail en mémoire conservé, écriture suspendue et récupération proposée ; aucune fausse confirmation de sauvegarde |
| Copie en conflit ou remplacement externe par synchronisation | Conflit signalé ; aucune fusion ou écrasement silencieux du projet |
| Deux instances mettent à jour les projets récents | Configuration valide, thème préservé et entrées distinctes conservées selon une règle documentée |

## Chat et confidentialité

| Cas | Résultat exigé |
| --- | --- |
| Ouvrir le logiciel | Aucun appel IA automatique |
| Poser « peut-on ajouter… ? » | Réponse uniquement, génération inchangée |
| Écrire « applique immédiatement » en discussion | Aucun changement sans action UI |
| Changer de discussion | Historique et saisie isolés |
| Changer de projet | Aucune réponse tardive injectée dans le mauvais projet |
| Contexte structurel | Aucune note, commentaire, donnée exemple ou secret de défaut |
| Partage complet | Option volontaire et aperçu identifiable |
| Provider absent/non connecté | Message clair ; éditeur fonctionnel |
| Annuler une requête | Réponse partielle marquée ; aucune proposition appliquée |
| Quota dépassé | Pas de passage silencieux à une clé API payante |
| Renderer recevant HTML hostile | Texte échappé ou rendu assaini |
| Logs | Aucun token ni copie inutile du schéma complet |

## Propositions

| Cas | Résultat exigé |
| --- | --- |
| Préparer | Stockage de proposition ; schéma inchangé |
| Patch absent/ambigu | Refus, aucune sauvegarde |
| Patchs chevauchants | Refus ou traitement déterministe explicitement validé |
| DBML final invalide | Appliquer désactivé, explication |
| Source non concernée | Conservation exacte |
| Refuser une proposition | Statut conservé ; aucune révision modèle |
| Appliquer une fois | Une nouvelle révision cohérente |
| Double clic/réessai | Pas de double application |
| Fichier modifié entre préparation et clic | Refus de proposition périmée |
| Brouillon créé entre lecture et transaction | Refus sous verrou, brouillon intact |
| Présentation modifiée ailleurs | Aucun écrasement silencieux |
| Réponse partielle/JSON tronqué | Jamais applicable |

## Plusieurs discussions et retour arrière

| Cas | Résultat exigé |
| --- | --- |
| A applique, B attend | B voit nouvelle base ; ancienne proposition bloquée |
| B actualise | Nouvelle proposition traçable, pas d’application automatique |
| Restaurer une révision | Nouvelle révision ; versions anciennes conservées |
| Restauration avec discussions | Conversations gardées et propositions requalifiées |
| Fermeture/réouverture | Modèle, vues, zoom, discussions, brouillons récupérés |
| Arrêt forcé | Limite documentée au dernier état écrit |
| Deux projets ouverts en parallèle | Sessions, messages, propositions et sauvegardes isolés par projet |
| Même projet ouvert dans deux fenêtres/instances | Une seule fenêtre éditable ; seconde en lecture seule, sans écriture de chat, brouillon ni modèle |
| Modification externe du projet | Conflit détecté ; pas de perte silencieuse |
| Archiver une discussion | Retirée de la liste active, données conservées et réactivation possible |
| Supprimer une discussion | Action explicite ; révisions et traces des modifications appliquées conservées |
| Commandes graphiques existantes | Disponibles dans la fenêtre éditable et comportement conservé |
| Panneau droit | Un seul panneau repliable avec onglets Vues / IA ; aucun panneau IA adjacent ni inspecteur Propriétés complet |
| Changement d’onglet droit | Discussion, saisie et requête en cours conservées ; aucun appel IA déclenché |
| Couleur de table ou groupe | Commande Couleur dans la barre flottante du bas, ouvrant palette et couleur personnalisée ; désactivée sans sélection compatible ou en lecture seule |
| Création de groupe depuis la barre flottante | Sélection compatible requise ; validations existantes préservées, couleur accessible dans cette même barre |
| Clic simple sur un objet graphique | Sélection graphique sans déplacement du focus ni défilement du DBML |
| Double-clic sur table ou groupe | Éditeur gauche ouvert, bloc Table/TableGroup exact sélectionné et visible, focus éditeur ; aucune modification de source |
| Double-clic sur relation | Déclaration Ref ou clause ref inline exacte sélectionnée et visible, y compris plusieurs relations entre mêmes tables |
| Navigation avec schémas homonymes ou source modifiée | Bonne définition dans le texte courant ; si localisation impossible, information discrète sans sélection erronée ni perte de brouillon |
| Double-clic avec panneau IA actif ou projet en lecture seule | Onglet, saisie et discussion conservés ; navigation permise sans écriture ni appel IA |

## Sécurité effective des moteurs

Tester les tentatives de lancer une commande, modifier le .dbcd, utiliser un MCP hérité ou demander une élévation. Les protections doivent être observées, pas seulement supposées depuis un prompt ou une option CLI.

Une discussion ne doit pas exposer d’outil d’application du projet. Le test doit montrer qu’un message hostile ne contourne pas le clic utilisateur.

## Niveaux de preuve

1. Tests unitaires : logique de parsing, patchs, états.
2. Intégration : transactions, fichiers, IPC et transport de processus simulé.
3. UI automatisée : actions explicites, contexte et affichage.
4. Application réelle : exécutable Windows, ouvrir/enregistrer/fermer/reprendre.
5. Provider réel : connexion et inférence consentie, compte/modèle/version précisés.
6. Validation utilisateur : parcours complet et compréhension du avant/après.

Les couches 1–3 ne remplacent pas 4–6.

## Commandes existantes à relancer dans la nouvelle conversation

```text
npm ci
npm run build
npm run typecheck
npm test
npm run verify:offline-ui
npm run verify:mcp
```

Le build/typecheck actuels ne couvrent pas le desktop. Ajouter des commandes desktop, son typecheck et son contrôle d’exécutable, puis les documenter. Ne pas supposer qu’elles existent déjà.

Conserver le rapport des échecs dus au code interrompu. Écarter un test absent de la suite pour rendre le tableau vert ne constitue pas une résolution.

## Parcours final proposé

Sur un projet fictif :
1. Ouvrir le logiciel autonome et le projet.
2. Créer « Clients » avec Codex, poser une question ; vérifier zéro modification.
3. Préparer un changement ; examiner avant/après ; rejeter.
4. Préparer une seconde proposition et l’appliquer ; vérifier une révision.
5. Créer une autre discussion, puis provoquer une proposition périmée.
6. Actualiser volontairement, conserver un brouillon et vérifier le blocage.
7. Restaurer l’état initial, garder les conversations.
8. Fermer puis rouvrir et retrouver toutes les données prévues.
9. Tester Claude si installé, sans changer silencieusement de fournisseur.
10. Vérifier la consommation et la limite des données envoyées.

La livraison ne peut être déclarée complète avec seulement des fichiers de code, des tests simulés ou un screenshot de maquette.

