# Livraison Windows portable sans IA — 13 octobre 2026

Première version utilisable : `release/DBCodex-0.1.0-win-x64.zip` (162 236 269 octets). Extraire puis lancer `DBCodex.exe`. Guide : [PORTABLE-WINDOWS.md](../PORTABLE-WINDOWS.md).

## Base préservée

Branche `codex/dbcodex-workbench`, HEAD `196e86c9f93c38bc761b430718ae59a2f9bb503b`. Les modifications locales initiales du dossier de migration et de son ZIP sont conservées. Aucun reset, nettoyage global, commit, push, fusion ou publication.

Les packages actifs ont été réutilisés : SQLite `.dbcd`, source DBML exacte, CodeMirror, React Flow, vues, groupes, brouillons et révisions. Les copies sous `sources/` ne sont ni compilées ni utilisées comme implémentation. Electron 44.7.0 embarque le runtime ; les fichiers IA partiels sont conservés dans le dépôt mais exclus du point d’entrée livré. Aucune détection, invocation ou connexion de fournisseur IA.

Le portable ajoute une fenêtre sécurisée avec preload isolé, dialogues de fichiers, préférences dans `data/`, chemins récents relatifs pour les projets internes, repli annoncé, verrou Windows local par projet, sauvegarde d’une copie de récupération et fermeture avec flush du brouillon. Notes et couleurs de table sont des champs optionnels de la présentation v1, sans migration destructive. Les couleurs des groupes restent dans le DBML.

## Résultats

| Contrôle | Résultat |
| --- | --- |
| Baseline générale après installation | 33 fichiers passent, 4 échouent ; 343 tests passent, 2 échouent ; deux suites ne chargent pas |
| Suite finale du périmètre portable | **342 tests passent, 34 fichiers**, zéro échec |
| Suite générale finale, IA interrompue comprise | 353 tests passent, 3 échouent ; 35 fichiers passent, 3 échouent |
| Types core/UI/MCP et desktop portable | Réussis |
| Build desktop et packaging ZIP | Réussis |
| Contrôle UI hors ligne | Réussi : aucune dépendance UI distante |
| Intégration MCP stdio | Réussie |
| Contrôle visuel | Capture réelle : diagramme dominant, éditeur/panneau Vues repliables, barre flottante, palette, groupes, note ; chevauchement zoom/outils corrigé |

Les échecs généraux restants appartiennent au desktop interrompu : `desktop-service.test.ts` importe un module absent ; `chat-service.test.ts` échoue sur le brouillon récupérable ; deux tests `renderer.test.tsx` échouent sur un libellé de partage et un matcher Chai absent. Le chargement de cette dernière suite a été rétabli par la dépendance de test déjà utilisée par la UI, révélant ses échecs internes. Aucun de ces tests n’a été supprimé. Le test d’asset UI initialement en échec passe après construction du widget. Les tests de navigation et de libellés ont été actualisés pour le comportement explicitement demandé ; des assertions de conservation du texte et de refus de fermeture en conflit ont été ajoutées.

## Application réelle

Le ZIP a été extrait dans `build/zip-verification`, puis son **exécutable extrait** a été piloté par Playwright Electron. Les tests ont utilisé des projets fictifs dans `build/smoke`, sans toucher aux fixtures originales. Résultats :

- lancement de la fenêtre et ouverture d’un `.dbcd` ;
- clic simple sans focus DBML, double-clic avec sélection et focus ;
- édition du texte, sauvegarde et vérification directe du fichier SQLite ;
- DBML invalide : dernier diagramme valide conservé, sauvegarde refusée ;
- couleur de table et création de groupe depuis la barre flottante ;
- note conservée après fermeture/réouverture ;
- deux instances du même fichier : seconde en lecture seule ;
- historique consulté et restauration créant une nouvelle révision ;
- écriture externe simulée par le store réel : conflit affiché, texte local conservé et copie `.dbcd` récupérée ;
- deux projets distincts dans deux fenêtres éditables.

Zéro erreur JavaScript observée. La sélection du fichier de récupération a été simulée en remplaçant le retour du dialogue ; le fichier a été réellement créé et relu. Les autres ouvertures ont utilisé un chemin de lancement ou l’API locale, pas une action manuelle dans le dialogue Windows. L’import/export dispose des tests du socle ; leur parcours manuel dans les dialogues est inclus dans le guide utilisateur.

Preuves locales : `build/smoke/result.json`, `build/smoke/atelier.png`, `final-delivered-tests.txt`, `final-all-tests.txt`, `recovery-tests.txt`, `baseline-tests.txt`, `baseline-types.txt`. Ces artefacts générés sont ignorés par Git. Le ZIP ne contient aucun projet, historique récent ni préférences de test.

## Environnement et limites

Hôte d’exécution : Windows Server 2025 Standard, processus x64, Node de développement 24.19.0, pnpm 11.25.0. Le runtime Node embarqué par Electron a exécuté SQLite et le parser lors du parcours réel. `npm` n’étant pas disponible dans le shell initial, les dépendances ont été installées avec pnpm ; son verrou est ajouté et les métadonnées desktop du verrou npm sont synchronisées.

Pas de validation effectuée sur un compte Windows standard distinct, un PC sans outils de développement ou OneDrive. Le guide contient le parcours précis restant à effectuer. Le verrou est local au PC ; aucune exclusion entre deux PC ni fusion de `.dbcd` via OneDrive. Un arrêt forcé ne récupère que les données effectivement écrites. Une copie de récupération crée un nouvel historique. Les anciens validateurs stricts peuvent refuser les champs optionnels notes/couleurs ajoutés à la présentation.

## Reproduire

Depuis la racine, avec Node et pnpm sur le poste de développement :

```text
pnpm install --frozen-lockfile
pnpm exec tsc -b packages/core packages/ui packages/mcp
pnpm exec tsc -p packages/desktop/tsconfig.portable.json --noEmit
pnpm --filter @dbcodex/ui build
pnpm exec vitest run --config vitest.portable.config.ts
node scripts/build-desktop.mjs
node scripts/package-desktop.mjs
node scripts/check-offline-ui.mjs
node scripts/check-mcp.mjs
```

`scripts/smoke-desktop.mjs` utilise le Playwright du runtime de cette session. `DBCODEX_EXECUTABLE` permet de sélectionner l’exécutable extrait du ZIP. La suite générale reste `pnpm exec vitest run`, avec les échecs du desktop interrompu décrits ci-dessus.
