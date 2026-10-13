# Dossier de migration — DBCodex autonome

**Date : 13 octobre 2026. Produit : DBCodex. Destination : une nouvelle conversation de développement.**

## Pourquoi ce dossier

Le projet a commencé comme plugin Codex avec interface intégrée. Après essais, l’utilisateur souhaite désormais un logiciel Windows indépendant, conservant l’éditeur DBML et le diagramme, avec un chat Codex ou Claude Code. Plusieurs discussions peuvent traiter le même projet. L’assistant prépare des propositions ; l’utilisateur décide lesquelles appliquer et peut restaurer des versions.

Ce dossier sert à reprendre le travail sans perdre les décisions ni confondre un prototype avec une fonctionnalité livrée.

## Instruction prioritaire pour la reprise

**La conversation précédente devait rester en spécification.** L’expression « fais les meilleurs choix pour moi » signifiait présenter les recommandations, pas lancer leur développement. Un début de développement a malgré tout eu lieu, puis a été interrompu à la demande de l’utilisateur. Les éléments partiels sont conservés et signalés.

La présente mission consiste exclusivement à rédiger et empaqueter ce dossier. Elle ne relance aucun développement. Dans la nouvelle conversation, le prompt de départ fourni permet à l’utilisateur de demander explicitement l’implémentation.

## Ordre de lecture

1. **11-PROMPT-NOUVELLE-CONVERSATION.md** : mission prête à copier.
2. **01-SPECIFICATION-PRODUIT.md** : objectif et parcours attendus.
3. **02-DECISIONS-ET-PRIORITES.md** : décisions et recommandations à respecter.
4. **07-ETAT-REEL-DU-CODE.md** : état local, preuves et travaux incomplets.
5. **03-ARCHITECTURE-CIBLE.md**, **04-DONNEES-ET-MIGRATION.md**, **05-INTERFACE-ET-PARCOURS.md**.
6. **06-CODEX-CLAUDE-AUTHENTIFICATION.md**, **08-PLAN-DE-DEVELOPPEMENT.md**, **09-VALIDATION-ET-ACCEPTATION.md**, **10-RISQUES-ET-POINTS-OUVERTS.md**.

**DOSSIER-COMPLET.md** rassemble ces documents pour une seule pièce jointe.

## Où reprendre

Checkout à utiliser :
`C:/Users/qcham/.codex/worktrees/dbcodex-workbench/dbcodex`

Branche : `codex/dbcodex-workbench`.
HEAD observé : `aa0f1ae9f87f98742c15718c58b1e3e0fe638dff`.

Le `main` local est resté à `bcd3ae2` et ne contient pas l’atelier développé. **Un clone de GitHub ou un changement vers main ne suffit pas à récupérer le travail local non commité.** Aucune vérification de l’état distant n’a été faite pour ce dossier.

## Ce qui est réellement disponible

- Un atelier DBML/.dbcd existant avec édition, diagramme, vues, groupes, brouillons et révisions.
- Un plugin local installé en version `0.1.0-dev.0+codex.20261009`.
- Des ajouts d’intégration native non commités.
- Un début de package desktop, sans application exécutable achevée ni connexion IA fonctionnelle livrée.

Les 334 tests du socle ont été observés réussis avant l’ajout des fichiers desktop incomplets. Cela ne signifie pas que la suite actuelle entière passe.

## Archive et pièces techniques

Le dossier peut contenir :
- `annexes/etat-git.txt` : relevé des modifications locales ;
- `annexes/modifications-suivies.patch` : diff contre HEAD ;
- `annexes/manifest-sources.json` : inventaire et empreintes des fichiers copiés ;
- `sources/` : copie de travail sélectionnée, y compris les fichiers non suivis indispensables ;
- `exemples/test-boutique.dbml` : exemple fictif créé pendant les essais.

La copie source exclut Git, node_modules, dist, les caches, les identifiants de connexion, .env et les bases de travail personnelles. Les fixtures de démonstration suivies par Git sont conservées. L’archive n’est pas un installeur et ne garantit pas un build.

Sur le même poste, travailler dans le checkout existant. Sur un autre poste, reconstruire à partir de `sources/`, lire le manifeste puis installer les dépendances. Ne pas appliquer le patch par-dessus la copie source : elle contient déjà ces changements.

