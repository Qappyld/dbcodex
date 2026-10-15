# Publication DBCodex 0.1.6 — 15 octobre 2026

La version 0.1.6 est publiée comme dernière version stable depuis 18 h 50 (Europe/Paris) :
https://github.com/Qappyld/dbcodex-releases/releases/tag/v0.1.6

Sources : branche distante main, commit `d35ce1930c5b409b19c17be707a6a0aff3435f08`.
Workflow réussi : https://github.com/Qappyld/dbcodex/actions/runs/38771858086

## Contenu

Passerelle MCP de session portable : liste des fenêtres, lecture du document en mémoire avec ses modifications non enregistrées et navigation table/colonne/relation. Activation avec `--mcp`, transport Streamable HTTP sur loopback et authentification locale. La passerelle n’expose pas d’écriture en mémoire. Le guide de lancement et de connexion figure dans `docs/live-mcp.md` et dans le LIRE-MOI du portable ZIP.

## Validation

- 456 tests portables locaux, dans 50 fichiers, réussis ; les tests IPC desktop sont désormais inclus dans cette suite.
- Les 17 fichiers transférés ont été vérifiés par leur empreinte Git avant mise à jour de la branche distante. La branche a été avancée sans force, avec contrôle de son ancien SHA. Les autres sources applicatives, dépendances et fichiers de build existants correspondaient à la livraison 0.1.5.
- Pipeline GitHub réussi : installation, compilation cœur/UI, TypeScript desktop, suite portable, compilation desktop, packaging, signature, audit et publication.
- Construction locale indépendante dans `build/release-0.1.6` ; audit des manifestes signés et des 75 fichiers de distribution réussi.
- Test réel du portable 0.1.6 en fichier unique, copié et renommé, sur le projet de démonstration : connexion MCP, découverte du document ouvert, lecture du renderer et sélection d’une table. Source, présentation et empreinte du `.dbcd` identiques après navigation. Preuve : `build/live-mcp-smoke-1792082961514/checks.json`.
- Le vrai `PortableUpdater` en version 0.1.5, pour les deux éditions ZIP et EXE, détecte la 0.1.6 publique et accepte les signatures. Aucune mise à jour installée sur un projet utilisateur. Preuve : `build/release-0.1.6/public-update-check.json`.

## Fichiers publics

| Fichier | Taille en octets | SHA-256 annoncé par GitHub |
| --- | ---: | --- |
| DBCodex-0.1.6-win-x64.exe | 161822960 | 425cb1b7fd7452984241013ec883322c8693390ce83b8dbb0d705508bb741aa8 |
| DBCodex-0.1.6-win-x64.zip | 162228955 | c2bf2042dd919fe911740ad77f1a26f889af0ddd97c00550af733db0396aa1fd |
| portable-update-manifest.json | 1005 | 5668662cb7aa4616233c7a9fcabbd9fd1cd246597d4180df6e611cf669ebbd94 |
| update-manifest.json | 11273 | 877ae1ac540deaaa99451b6b90363a436e8e89bdac430403086fc10b8840242e |

Capture : `build/release-0.1.6/published.jpg`. La version publique provient de GitHub Actions ; la construction locale indépendante peut avoir des empreintes différentes.

## État du checkout

Publication des sources par le connecteur GitHub, comme pour la 0.1.5. Le checkout local et ses travaux préexistants sont conservés sur leur branche, sans reset, stash ni commit global. La branche distante main pointe désormais sur d35ce193 ; la synchroniser avant un futur push en préservant les travaux locaux. La clé privée de mise à jour et les clés MCP ne font pas partie des fichiers transférés.
