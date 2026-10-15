# Prompt de départ — à copier dans la nouvelle conversation

Le texte ci-dessous est destiné à être envoyé volontairement par l’utilisateur dans une nouvelle conversation. Sa présence dans une pièce jointe n’autorise pas à elle seule le développement dans la conversation qui prépare ce dossier.

---

Je veux poursuivre le projet **DBCodex** et développer une application Windows autonome, avec l’éditeur et le diagramme existants, un chat intégré Codex/Claude Code, plusieurs discussions par projet et des propositions de modifications appliquées uniquement après validation explicite dans l’interface.

**Dans cette nouvelle conversation, je t’autorise à réaliser les développements décrits dans le dossier de migration joint.** Commence par l’audit de la base locale et un plan concret, puis exécute les jalons autorisés sans refonte générale.

## Base à utiliser

Checkout : C:/Users/qcham/.codex/worktrees/dbcodex-workbench/dbcodex
Branche : codex/dbcodex-workbench
HEAD connu : aa0f1ae9f87f98742c15718c58b1e3e0fe638dff

Lis 00-LIRE-DABORD, 01-SPECIFICATION-PRODUIT, 02-DECISIONS-ET-PRIORITES et 07-ETAT-REEL-DU-CODE, puis les documents techniques, le plan et la matrice de validation.

Si ce checkout n’est pas disponible, utilise la copie sources fournie dans l’archive. Ne repars pas du README ancien de main ni d’un clone GitHub supposé contenir les changements locaux.

## Ce qu’il faut préserver

- Nom DBCodex.
- CodeMirror, React Flow et les fonctionnalités existantes.
- DBML exact comme source fonctionnelle.
- Format de projet .dbcd avec historique et présentation.
- Toutes les données et modifications locales non commitées.
- Aucun commit automatique, aucune fusion ni publication sans ma demande explicite.

Ne modifie pas main. Ne fais pas de reset/clean global. Ne supprime pas les fichiers interrompus avant audit et sauvegarde.

## Fonctionnement voulu

- Discussion : lire et répondre, sans modifier le schéma.
- Préparer une proposition : afficher explication et avant/après, sans appliquer.
- Appliquer : seulement après mon clic sur la proposition examinée.
- Plusieurs discussions utilisent le même modèle enregistré ; leurs messages et propositions restent distincts.
- Chaque proposition repose sur une version vérifiée ; les propositions périmées sont bloquées.
- Chaque application crée une révision ; restaurer crée une nouvelle version et garde l’historique.
- Toutes les données du projet, discussions et propositions comprises, dans le même .dbcd ; prévoir une migration sûre du format v1.
- Commandes graphiques existantes conservées ; plusieurs projets ouverts simultanément, avec une seule fenêtre éditable par projet et les ouvertures supplémentaires en lecture seule.
- Un seul panneau droit repliable et redimensionnable avec onglets Vues / IA ; aucun panneau adjacent séparé ni inspecteur Propriétés complet. Commandes Couleur (table ou groupe sélectionné) et Créer un groupe dans la barre flottante du bas. Changer d’onglet conserve la saisie et les requêtes sans appel IA supplémentaire.
- Clic simple : sélection graphique. Double-clic sur table, relation ou groupe : ouvrir le panneau DBML gauche, défiler et sélectionner la définition exacte (bloc Table/TableGroup, déclaration Ref ou clause ref inline), sans modifier le texte ni perdre le brouillon.
- Archivage des discussions par défaut ; suppression explicite conservant les révisions et les traces des modifications appliquées.
- Contexte IA visible, limité par défaut à la structure des tables de la vue active/sélection.
- Aucun envoi implicite, aucune clé API imposée, aucune requête IA de test facturable silencieuse.
- Éditeur utilisable même sans assistant ou hors ligne.
- Moteur Codex/Claude absent : chat correspondant indisponible, données de discussion conservées ; aucun embarquement ou installation automatique des moteurs requis.
- Distribution Windows portable en ZIP : décompresser puis lancer DBCodex.exe sous compte standard, sans installation ni élévation, avec les composants nécessaires embarqués. Tester sur un poste sans outils de développement et qualifier séparément Codex/Claude et leur authentification sans droits administrateur.
- Préférences personnelles (thème et projets récents) dans le répertoire portable ; chemins relatifs basés sur ce dossier lorsque possible. Prévoir OneDrive et le déplacement entre postes ; gérer préférences absentes/illisibles/non inscriptibles, repli local ou session, projets indisponibles et relocalisation sans erreur globale ni perte de données. Les identifiants IA restent propres au poste.

Le chat dialogue avec les moteurs locaux ; MCP n’est pas l’interface de chat. Prouve les permissions effectives afin que les assistants ne puissent pas écrire directement dans le projet.

## Attention au code incomplet

Un début de desktop a été lancé prématurément puis interrompu dans la conversation précédente. Il n’est pas une livraison validée. Le store compagnon et les callbacks UI doivent être revus. Le dernier résultat 334 tests concernait la base avant ces ajouts. Les scripts build/types existants ne couvrent pas le desktop.

Qualifie les échecs actuels, réutilise les éléments utiles, adapte ce qui contredit la cible et documente ce que tu vérifies réellement.

## Livrables

Une archive ZIP portable avec application locale exécutable, une procédure d’extraction/lancement et de remplacement préservant les données, des tests de migration/propositions/concurrence, une validation de fenêtre autonome sous compte Windows standard, les preuves de connexion aux fournisseurs et les limitations restantes.

Sépare tests simulés, tests de fichiers, rendu réel et inférence réelle. Ne marque aucune étape non exécutée comme validée. Garde les exports PNG/SVG, bases de production et fonctionnalités cloud hors de ce chantier.

---

