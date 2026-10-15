# Publication DBCodex 0.1.7 — 15 octobre 2026

Sources : branche distante main, commit `5649a586f551af3427d57124c378a626fd8ae14a`, arbre `30776b3ce3305c007fa6138f35cac69f80aae42c`.
Workflow : https://github.com/Qappyld/dbcodex/actions/runs/38776278957

## Correctif et diagnostic

Le contrôle des chemins du programme de mise à jour reconnaît désormais les marqueurs Windows Cloud Files CLOUD à CLOUD_F, dont CLOUD_6 (`0x9000601A`) signalé sur le Bureau OneDrive de l'autre poste. Le contrôle natif vérifie aussi le chemin résolu ; les jonctions, liens symboliques et marqueurs inconnus restent refusés.

L'application conserve des journaux locaux avec rotation, un journal par tentative de mise à jour et le résultat du dernier remplacement. Le panneau Mises à jour affiche les détails du dernier échec et permet d'ouvrir les journaux. Les champs sensibles et contenus de projets sont exclus des événements structurés ; les textes de diagnostic sont filtrés et bornés.

La première installation du correctif sur le poste actuellement en 0.1.4 nécessite de fermer normalement DBCodex puis de remplacer manuellement uniquement l'EXE, en conservant data/ et les projets.

## Validation locale

- Suite portable : 52 fichiers, 466 tests réussis ; TypeScript desktop valide.
- Tests ciblés : classification des 16 marqueurs Cloud, contrôle natif d'un chemin ordinaire, refus d'une vraie jonction Windows sans modification de la cible, erreur de vérification conservée, journaux du programme de remplacement, rotation et rétention, filtrage et accès aux journaux depuis l'interface.
- Construction locale et audit de distribution : signatures valides, 75 fichiers inventoriés.
- Test réel de l'EXE portable 0.1.7 copié et renommé : connexion MCP HTTP authentifiée, découverte du document, lecture du renderer et sélection d'une table, sans modification de source, présentation ou fichier projet. Preuve : `build/live-mcp-smoke-1792084767509/checks.json`.
- Le journal de ce test contient `app.started` avec la version 0.1.7 : `build/live-mcp-smoke-1792084767509/data/logs/application.jsonl`.
- Interface vérifiée visuellement avec des données simulées : `build/logging-ui/diagnostics.jpg`.

Le correctif n'a pas été exécuté sur le vrai dossier OneDrive de l'autre ordinateur. Cette validation reste à effectuer après remplacement manuel de son EXE.

## Publication vérifiée

La version stable v0.1.7 est publiée : https://github.com/Qappyld/dbcodex-releases/releases/tag/v0.1.7
Le workflow 38776278957 s'est terminé avec succès. Les contrôles du vrai PortableUpdater simulant la version 0.1.6 acceptent la signature publique et détectent la 0.1.7 pour les éditions EXE et ZIP, sans installer de mise à jour. Preuve : `build/release-0.1.7/public-update-check.json`. Capture de la page publique : `build/release-0.1.7/published.jpg`.

| Fichier | Taille en octets | SHA-256 annoncé par GitHub |
| --- | ---: | --- |
| DBCodex-0.1.7-win-x64.exe | 161829395 | 22d732f857e7a7ccd607092fc3ab8d5b0179ad81cd299a36b3a494d060f7533c |
| DBCodex-0.1.7-win-x64.zip | 162234444 | d5589166a255c10e0d0ad07bde3d1898b149a61e491c08964d9ceb7b1cddc57b |
| portable-update-manifest.json | 1069 | 36ae1d6f0b4168f8407e523d33cf6c51e552ec5c37fc70533cd84ff6089ad77c |
| update-manifest.json | 11333 | 69932a783b0290495952f61474c24be41633d332a29f98b867a65ab1902cd985 |

La compilation publique provient de GitHub Actions ; ses empreintes peuvent différer de celles de la compilation locale indépendante.

## État du checkout

Les 15 fichiers de la correction ont été transférés par le connecteur GitHub ; leur empreinte Git a été vérifiée avant d'avancer main sans force avec contrôle de son ancien SHA. Le checkout local et ses modifications préexistantes sont conservés, sans reset, stash, commit global ni push de son ancien historique. Synchroniser les historiques avant un futur push. Aucune clé privée ni donnée utilisateur n'a été publiée.
