# Plan de migration et développement

Ce plan organise les futurs développements ; il n’a pas été exécuté pendant la préparation du dossier. Les cases vides sont des travaux restant à faire. Aucun commit automatique n’est prévu.

## Jalon 0 — Préserver et qualifier la base

- [ ] Ouvrir le checkout d’implémentation, lire état Git et ce dossier.
- [ ] Sauvegarder les données utilisateur et le travail non commité.
- [ ] Identifier les fichiers incomplets ; ne pas nettoyer globalement le dépôt.
- [ ] Relancer les contrôles actuels et qualifier les échecs.
- [ ] Vérifier les versions locales, sans requête IA facturable.
- [ ] Documenter le delta entre baseline et ajouts desktop.

Sortie : état initial reproductible, anomalies classées, aucun travail perdu.

## Jalon 1 — Stabiliser les frontières de la nouvelle application

- [ ] Choisir/confirmer l’enveloppe desktop par un prototype technique ciblé.
- [ ] Définir une API UI locale validée runtime.
- [ ] Définir les sessions projet, discussion, proposition et fournisseur.
- [ ] Séparer opérations de discussion, préparation et application.
- [ ] Définir les événements, annulations et erreurs.
- [ ] Ajouter le desktop aux contrôles build/types.

Sortie : contrat documenté ; aucun assistant ne détient l’écriture du projet.

## Jalon 2 — Fenêtre autonome sans IA

- [ ] Processus principal et preload sécurisé.
- [ ] Dialogue natif ouvrir/créer/importer.
- [ ] Chargement du fichier utilisateur avec confinement.
- [ ] Réutilisation du ProjectWorkbench.
- [ ] Réorganiser le panneau droit en onglets Vues / IA et ajouter la commande Couleur à la barre flottante du bas pour la table ou le groupe sélectionné, sans inspecteur Propriétés complet.
- [ ] Séparer clic simple et double-clic ; ce dernier ouvre le DBML, défile et sélectionne la définition exacte d’une table, relation ou groupe dans le texte courant.
- [ ] Sauvegarde, brouillon, historique et restauration.
- [ ] Projets récents et fermeture ordonnée.
- [ ] Sauvegarder thème et projets récents dans le répertoire portable ; chemins relatifs basés sur sa racine, chemins absolus extérieurs et relocalisation explicite.
- [ ] Gérer préférences absentes, illisibles, de version future ou non inscriptibles : valeurs par défaut, original préservé, repli local ou session et information discrète.
- [ ] Gérer les fichiers récents indisponibles et la perte d’accès pendant l’édition sans blocage global ni perte du travail en mémoire.
- [ ] Ouvrir plusieurs projets simultanément ; garantir entre instances une seule fenêtre éditable par projet et afficher les ouvertures supplémentaires en lecture seule.
- [ ] Test réel de lancement et réouverture.

Sortie : le logiciel est utile sans Codex ni Claude installés.

## Jalon 3 — Données de discussions et migration

- [ ] Spécifier l’évolution du .dbcd pour les discussions portables.
- [ ] Protéger sauvegarde préalable et migration transactionnelle.
- [ ] Tester la préservation des projets v1 et la lecture des formats futurs.
- [ ] Ajouter discussions, messages, paramètres et brouillons de chat.
- [ ] Ajouter l’archivage par défaut et la suppression explicite des discussions ; préserver les révisions et traces des modifications appliquées.
- [ ] Revoir ou migrer le compagnon partiel existant.
- [ ] Garantir que les messages ne font pas avancer la génération de modèle.

Sortie : discussions persistantes ; source et anciennes révisions intactes.

## Jalon 4 — Providers en lecture seule

- [ ] Détection/connexion Codex, états de compte et permissions effectives.
- [ ] Protocole app-server compatible avec la version installée.
- [ ] Adaptateur Claude quand disponible ; erreur claire sinon.
- [ ] Annulation, timeout, streaming et nettoyage des processus.
- [ ] Vérification des outils hérités et des restrictions d’écriture.
- [ ] Contrôle du mode d’authentification et de facturation.
- [ ] Tests simulés avant inférence réelle volontaire.

Sortie : une discussion répond, mais ne peut pas changer le projet.

## Jalon 5 — Chat multi-discussions et contexte

- [ ] Discussions nommées et fournisseur fixe.
- [ ] Messages et saisies isolés par discussion.
- [ ] Contexte par vue/sélection, aperçu exact et partage explicite.
- [ ] Messages progressifs, interruption, reprise et quotas.
- [ ] Reconstitution des sessions sans transférer les autres discussions.
- [ ] Aucun envoi au provider à la simple ouverture/changement d’onglet.

Sortie : plusieurs discussions cohérentes, aucune écriture de schéma.

## Jalon 6 — Préparation et inspection des propositions

- [ ] Format strict de proposition et validation des limites.
- [ ] Patchs ciblés ou opérations structurelles locales vérifiables.
- [ ] Préservation des commentaires et syntaxe non rendue.
- [ ] Diff avant/après, résumé des suppressions et détails utiles.
- [ ] Réviser/rejeter et conserver la trace.
- [ ] Refuser une proposition tronquée, malformée, ambiguë ou DBML invalide.

Sortie : une proposition lisible et non appliquée.

## Jalon 7 — Application et concurrence

- [ ] Clic utilisateur seul point d’application.
- [ ] Vérifier identité, génération, révision, empreintes et brouillon sous verrou.
- [ ] Transaction source+présentation+révision+statut de proposition.
- [ ] Idempotence et récupération après interruption.
- [ ] Synchroniser les autres discussions et rendre les propositions anciennes périmées.
- [ ] Empêcher application pendant une édition non enregistrée.

Sortie : zéro application silencieuse ou écrasement de brouillon.

## Jalon 8 — Restauration et reprise

- [ ] Restaurer modèle+présentation sans effacer le chat ni l’historique.
- [ ] Requalifier les propositions après restauration.
- [ ] Préserver les dernières saisies lors d’une fermeture ordonnée.
- [ ] Distinguer arrêt forcé et récupération d’un état réellement persisté.
- [ ] Tester les cas fenêtre double, processus interrompu et fichier remplacé.

Sortie : reprise compréhensible et vérifiable.

## Jalon 9 — Packaging et acceptation Windows

- [ ] Build reproductible et exécutable local.
- [ ] Produire une archive ZIP portable contenant l’exécutable et ses dépendances, sans installation de Node.js ni d’outils de développement sur le poste cible.
- [ ] Tester extraction et lancement sous compte Windows standard sur un poste sans dépendances de développement ; aucune demande d’élévation.
- [ ] Vérifier les emplacements accessibles pour paramètres, caches et projets ; préserver les données lors du remplacement du dossier applicatif.
- [ ] Tester le dossier portable dans OneDrive : déplacement et changement de racine entre postes, fichier disponible/non disponible localement, conflit ou remplacement externe ; pas de fusion automatique de .dbcd.
- [ ] Qualifier séparément les moteurs Codex/Claude et l’authentification sans droits administrateur ; documenter les restrictions du poste et conserver le mode éditeur sans IA.
- [ ] Tester SQLite et les CLI avec les versions embarquées.
- [ ] Vérifier lancement sans terminal et absence de navigateur externe.
- [ ] Associer .dbcd seulement si testé et documenté.
- [ ] Tests clavier, thèmes, grande fenêtre/petite fenêtre.
- [ ] Démonstration sur copie de projet, pas sur une fixture originale.
- [ ] Documenter l’installation, la désinstallation et les limites.

Sortie : version portable réellement utilisable sans installation ni droits administrateur, preuves séparées des simulations.

## Livraison et hors périmètre

Les exports PNG/SVG, connexions bases, collaboration cloud et anciens chantiers V1 restent séparés. Ne pas élargir ce plan pour cacher une difficulté d’intégration.

Avant une publication : décider licence, gouvernance, distribution, conditions de connexion fournisseurs et politique de mises à jour. L’implémentation locale n’autorise pas automatiquement une publication commerciale.

## Discipline des tests

Pour chaque changement de comportement : cas qui échoue, correction minimale, vérification ciblée, puis contrôle du jalon. Conserver les tests existants. La documentation de preuve doit préciser version, commandes, résultat observé et limites.

Ne pas présenter une simulation comme une preuve de dialogue réel avec un compte ni un rendu navigateur comme une preuve de fenêtre autonome.

