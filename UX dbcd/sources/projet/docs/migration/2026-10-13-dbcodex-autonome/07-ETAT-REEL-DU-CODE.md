# État réel du code et preuves

## Dépôt et checkouts

Dépôt configuré : https://github.com/Qappyld/dbcodex.

| Checkout | Branche/HEAD local | Utilisation |
| --- | --- | --- |
| C:/Users/qcham/OneDrive - APPYLD/Documents/ChatGPT/dbcodex | main / bcd3ae2 | Documentation initiale ; README ancien |
| C:/Users/qcham/.codex/worktrees/compatibility-spike/dbcodex | codex/compatibility-spike / 2389170 | Prototype SVG/MCP |
| C:/Users/qcham/.codex/worktrees/dbcodex-workbench/dbcodex | codex/dbcodex-workbench / aa0f1ae | Atelier et changements locaux à reprendre |

HEAD complet du checkout d’implémentation : aa0f1ae9f87f98742c15718c58b1e3e0fe638dff, daté du 27 septembre 2026.

Le travail ajouté ensuite est non commité. Ne pas le perdre avec git reset/clean, un checkout forcé ou une reconstruction depuis main. Le relevé annexé décrit l’état au moment de constituer le dossier.

## Socle existant

- Parser DBML et diagnostics.
- Éditeur CodeMirror et diagramme React Flow.
- Vues, groupes, niveaux de détail, dispositions et navigation.
- Projet .dbcd SQLite v1 : source exacte, présentation, brouillon et révisions.
- Enregistrement explicite, détection de conflits, historique, épinglage et restauration.
- Import/export DBML.
- Serveur MCP local, empaquetage et skill.

Ne pas redévelopper cet atelier pour fabriquer la fenêtre autonome.

## Ajouts du 9 octobre — présents mais non commités

Entrées thread/global/file, lanceur de projet, patchs exacts via apply_dbcd_edits, rafraîchissement des versions enregistrées et flush du brouillon au teardown.

Le rapport docs/evidence/native-integration.md contient les commandes et résultats historiques. Il décrit 334 tests réussis, build/types, contrôle hors ligne et stdio du bundle installé. Ce n’est pas une acceptation de l’application autonome.

L’éditeur dans la conversation a été essayé par l’utilisateur, qui a jugé l’expérience peu satisfaisante. La demande de panneau droit a été envoyée et la navigation vers le chat a été effectuée ; aucun résultat visuel complet du panneau n’a été fourni. Le changement de direction produit vers une application indépendante prévaut désormais.

## Particularité vérifiée du plugin installé

Les outils de ce chat utilisaient leur dossier de cache comme racine locale. Le lanceur retournait une empreinte correspondant à :
C:/Users/qcham/.codex/plugins/cache/dbcodex-local/dbcodex/0.1.0-dev.0+codex.20261009.

Le projet fictif .dbcodex/test-boutique.dbcd a donc été créé dans ce cache. Import validé : 4 tables, 3 relations, aucun diagnostic. Cela ne justifie pas de stocker les futurs projets dans un cache de plugin : la nouvelle application doit choisir explicitement un fichier utilisateur stable.

## Début desktop interrompu — à auditer

| Fichier/groupe | État observé |
| --- | --- |
| packages/desktop/package.json | Déclaré ; pas de build/start desktop |
| src/shared/contracts.ts | Types de discussions, propositions, providers et API desktop |
| src/chat-store.ts | Début de store SQLite compagnon |
| src/chat-service.ts | Contexte structurel, préparation/application de patchs, réconciliation |
| src/renderer/DesktopApp.tsx | Début de UI desktop réutilisant l’atelier |
| test/chat-store.test.ts | Tests écrits, résultats non confirmés pour la livraison |
| test/chat-service.test.ts | Tests écrits, résultats non confirmés pour la livraison |
| test/renderer.test.tsx | Tests avec API simulée |
| test/desktop-service.test.ts | Importe src/desktop-service.js, actuellement absent |
| packages/ui/src/DbcdWorkbench.tsx | Callbacks de session/sélection ajoutés pendant le travail interrompu |
| package.json / package-lock.json | Electron 44.7.0 et @electron/packager 20.3.0 ajoutés |

Les providers, le service desktop complet, le processus principal Electron, le preload, l’entrée renderer, les styles dédiés, le packaging et la validation de fenêtre autonome ne sont pas livrés.

Les trois sous-agents ont été arrêtés lorsque l’utilisateur a précisé « spécification seulement ». Ne pas les relancer en conservant leurs anciennes consignes sans les adapter à la présente cible.

## Documents à lire avec réserve

Le brouillon docs/superpowers/specs/2026-10-13-standalone-chat-design.md affirme une autorisation de réaliser et suppose un compagnon SQLite. La correction de l’utilisateur révoque cette interprétation. Le plan correspondant n’est pas une autorisation autonome de poursuivre.

Le compagnon est une piste partiellement codée ; la dernière préférence fonctionnelle est de conserver les discussions avec le projet, idéalement dans le .dbcd. Le code existant ne tranche pas ce choix.

## Tests : ce que nous savons

1. Rapport du 27 septembre : 323 tests réussis.
2. Vérifications du 9 octobre : 334 tests réussis et contrôles techniques réussis.
3. Baseline relancée le 13 octobre avant les ajouts desktop : 334 tests, 33 fichiers, réussis.
4. Test desktop-service observé en échec attendu lors de sa création : module absent.
5. Après interruption et durant la rédaction du dossier : aucune suite complète relancée.

Les scripts build et typecheck actuels ciblent core/UI/MCP ; ils ne prouvent pas le bon fonctionnement du desktop même s’ils passent. npm test découvre aussi les nouveaux tests incomplets.

Deux alertes npm de sévérité haute avaient été observées ; elles sont documentées dans le rapport natif. Ne pas les déclarer corrigées ni faire un audit fix général sans analyser ses conséquences.

## Premier travail de la nouvelle conversation

Préserver l’état local et les données, séparer le socle des ajouts interrompus, établir une baseline actuelle et un plan de réparation. Toute réutilisation du code partial doit être revue et testée ; aucune fonctionnalité ne doit être marquée livrée parce qu’un fichier ou un test existe.

