# Décisions, recommandations et ordre de priorité

## Hiérarchie à respecter

1. Demandes explicites de l’utilisateur dans la nouvelle conversation.
2. Intentions et recommandations les plus récentes reprises dans ce dossier.
3. Comportement existant qu’il faut préserver.
4. Spécifications historiques, lues avec leurs changements de périmètre.
5. Brouillons techniques incomplets du 13 octobre.

Le dossier ne transforme pas une hypothèse technique en capacité vérifiée.

## Tableau des choix

| Sujet | Choix de reprise | Statut |
| --- | --- | --- |
| Nom | DBCodex ; ne pas employer TB Codex | Confirmé explicitement |
| Produit | Application indépendante, avec sa fenêtre | Nouvelle direction retenue |
| Cible initiale | Windows | Recommandation adaptée au poste actuel |
| Éditeur/diagramme | Réutiliser CodeMirror et React Flow | Contrainte de continuité |
| Stockage du modèle | DBML exact comme vérité fonctionnelle ; projet SQLite .dbcd | Décision existante |
| UI générale | Éditeur gauche repliable, diagramme centre, discussions droite | Recommandation retenue pour spécifier |
| Discussions | Plusieurs discussions nommées par projet | Accord de principe utilisateur |
| Fournisseur | Assistant fixé par discussion | Recommandation présentée |
| Changer d’assistant | Nouvelle discussion ; pas de transfert implicite de l’historique | Recommandation présentée |
| Discussion | Lecture/analyse uniquement ; pas d’écriture du schéma | Exigence centrale |
| Préparation | Action explicite « Préparer une proposition » | Recommandation présentée |
| Application | Clic explicite après aperçu ; proposition appliquée en bloc | Recommandation présentée |
| Modification partielle | Réviser la proposition plutôt que décocher des opérations dépendantes | V1 recommandée |
| Périmètre envoyé | Vue active ou sélection visible, structure par défaut | Recommandation présentée |
| Données d’exemple | Exclues du contexte par défaut | Principe de confidentialité |
| Partage complet | Option explicite, avec aperçu du contenu | Recommandation |
| Proposition périmée | Bloquer, puis actualiser volontairement | Exigence de cohérence |
| Versions | Chaque application crée une révision | Décision de continuité |
| Restauration | Créer une nouvelle version ; conserver l’historique | Décision existante |
| Discussions portables | Avec le projet, idéalement dans le même .dbcd | Dernière recommandation fonctionnelle |
| Discussions lors d’une restauration | Conservées ; seul modèle+présentation sont restaurés | Recommandation de cohérence |
| Contexte IA lors d’un redémarrage | Reconstituer depuis les messages locaux et le projet actuel | Recommandation |
| Absence d’IA | L’éditeur reste utilisable | Exigence produit |
| Git | Aucun commit automatique | Contrainte utilisateur persistante |
| Licence et distribution | Toujours à décider avant publication | Décisions historiquement différées |

## Correction importante sur le stockage des discussions

Le code desktop partiel et le brouillon `2026-10-13-standalone-chat-design.md` supposent un compagnon `.dbcd.chat.sqlite`. Cette hypothèse a été choisie pendant le développement interrompu pour éviter de migrer le format.

**La dernière recommandation présentée à l’utilisateur privilégie un fichier projet unique.** La reprise doit donc étudier une évolution du .dbcd conservant les discussions dans le même conteneur. Cette préférence fonctionnelle n’autorise pas une migration destructive.

Si le fichier compagnon est conservé provisoirement, le mot « provisoire » et la procédure d’import ultérieure doivent être explicites. Ne pas simplement conserver l’architecture du brouillon parce qu’elle a déjà du code.

## Technologies : recommandation, pas dette obligatoire

Electron est le candidat principal : il permet de réutiliser la UI React dans une fenêtre native et de communiquer avec un moteur local. Les dépendances Electron ont déjà été ajoutées, mais aucune application autonome n’est achevée.

Comparer brièvement Electron avec une enveloppe Tauri et une application web locale. Electron privilégie la réutilisation ; Tauri demanderait une nouvelle couche Rust/interop ; une page de navigateur ne correspond pas à l’expérience demandée. Le choix technique doit rester au service du logiciel attendu.

## Ne pas rouvrir sans raison

Ne pas refaire les QCM de périmètre initial, proposer une réécriture du parser ou remettre le produit dans Codex Desktop. La migration peut conserver le plugin comme adaptateur secondaire, mais le parcours principal doit devenir l’application autonome.

