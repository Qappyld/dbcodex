# DBCodex autonome avec discussions et propositions

Date : 13 octobre 2026. Autorisation : l’utilisateur demande de choisir et réaliser les meilleurs choix après validation du parcours discussion → proposition → application et discussions multiples. Aucun nouveau commit, aucune fusion ni modification de main.

## Choix

Application Electron Windows, réutilisant CodeMirror, React Flow et le store `.dbcd` existant. Un fichier compagnon `.dbcd.chat.sqlite` conserve discussions, messages et propositions localement à côté du projet ; le format `.dbcd` reste compatible. Copier les deux fichiers transporte le projet et ses discussions. Changer d’assistant se fait en créant une nouvelle discussion, pour éviter une transmission implicite de l’historique à un autre fournisseur.

Le panneau droit comporte les discussions et le chat ; un mode Discussion et une action Préparer une proposition sont explicites. Le contexte montre les tables choisies. Par défaut seules les métadonnées structurelles sont envoyées, sans Records, commentaires, notes ni valeurs par défaut. Une option explicite partage le DBML source complet lorsque nécessaire. Un envoi de message est la seule action déclenchant une requête au fournisseur.

Codex app-server et Claude Code sont lancés localement, avec les outils d’écriture et d’exécution désactivés. Le renderer n’a aucun accès Node ni réseau, via un preload IPC restreint. Les assistants ne sauvegardent jamais de projet : ils renvoient du texte ou une proposition structurée. Seul un clic de l’utilisateur appelle l’application transactionnelle.

Une proposition conserve avant/après et les patchs exacts, l’identité de la révision et la génération. Elle est appliquée en bloc ; une proposition invalide, périmée ou un projet comportant un brouillon sont refusés. L’application conserve les commentaires et dispositions et crée une révision. La restauration de l’atelier crée une autre révision et conserve l’historique. Les échecs de l’IA sont des messages interrompus/réessayables, sans modification du schéma.

Les propositions appliquées sont identifiées par un libellé de révision stable afin de réconcilier le fichier compagnon après interruption entre la sauvegarde du projet et son marquage dans le chat. Les conversations ne sont pas une seconde source de vérité du modèle.

## Première livraison

Ouvrir/créer/importer un projet par dialogue natif, atelier existant, plusieurs discussions, assistant fixe par discussion, sélection de contexte, interruption de requête, propositions validées et comparées, application explicite, détection des conflits, historique et reprise des conversations. Livraison locale exécutable Windows ; aucun service distant ni backend hébergé ajouté. L’IA utilise la connexion du CLI choisi et ses limites ; pas de clé API imposée ni de requête de test facturable silencieuse.

## Validation

Tests du store de discussions et de l’application de propositions ; transports fournisseurs simulés avec assertions sur les outils désactivés ; tests de composants et des actions explicites ; compilation et tests existants ; contrôle Electron réel de démarrage, UI, persistance et fenêtre native. Les échanges réellement inférés avec un compte utilisateur restent distingués des simulations et du handshake sans inférence.
