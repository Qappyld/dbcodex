# Portable en fichier unique — 15 octobre 2026

La version locale 0.1.4 est disponible dans `release/DBCodex-0.1.4-win-x64.exe`. Elle utilise le lanceur portable NSIS d’electron-builder 26.15.3, sans installation et avec niveau d’exécution utilisateur. Chaque lancement extrait Electron dans un dossier temporaire distinct, supprimé à la fermeture normale.

Le processus Electron utilise `PORTABLE_EXECUTABLE_FILE` pour retrouver le dossier de l’EXE d’origine. Les préférences, chemins récents, verrous et résultats de mise à jour sont donc rattachés au dossier portable, jamais à l’extraction temporaire. Le nom du fichier choisi par l’utilisateur est conservé lors des mises à jour.

Le nouveau canal `portable-update-manifest.json` contient un manifeste Ed25519 de schéma 2. Le téléchargement EXE est contrôlé par taille et SHA-256 avant remplacement. Le helper attend la fermeture d’Electron et du lanceur, sauvegarde l’ancien EXE, journalise le remplacement et conserve la récupération après interruption. Les éditions ZIP utilisent toujours leur canal de schéma 1 ; les canaux incompatibles sont refusés. Le workflow prépare les quatre fichiers autorisés des deux canaux, sans publication effectuée pendant cette intervention.

La fabrication travaille dans `build/portable-package/` puis dans un dossier distinct pour electron-builder. Elle ne remplace pas le portable déjà présent dans `release/DBCodex-win32-x64/`. Les données locales de cet ancien portable ont été copiées dans `release/data/` : 21 récents conservés, projets importés recopiés, originaux préservés. Les nouveaux téléchargements ne contiennent aucune donnée locale.

Vérifications effectuées :

- TypeScript desktop sans erreur.
- 35 tests ciblés réussis : signatures, origine, canaux, téléchargements altérés, remplacement Windows d’un EXE renommé, sauvegarde, échec d’écriture, récupération et protection des données.
- Suite portable complète : 48 fichiers, 441 tests réussis.
- Fabrication Windows réussie ; signature des deux manifestes et audit public réussis (75 fichiers dans le canal ZIP, contrôle du bundle et de l’EXE).
- Test réel du livrable final avec `scripts/verify-single-exe.mjs` : copie de l’EXE seul sous le nom `Mon DBCodex portable.exe`, ouverture d’un `.dbcd` en argument, thème sombre et chemins récents relatifs repris depuis le dossier adjacent `data/`, version 0.1.4 confirmée, fermeture normale du lanceur. Preuves et capture dans `build/single-exe-smoke-1792064233139/`.

Le test s’exécute via Chromium CDP : le lanceur NSIS ne transmet pas la sortie standard requise par `electron.launch`. Le script accepte `DBCODEX_PLAYWRIGHT_MODULE` pour utiliser le Playwright de l’environnement. Un compte Windows standard distinct et une machine vierge n’ont pas été testés.

## Icône DBCodex

L’icône retenue par l’utilisateur est son image de base de données aux couleurs arc-en-ciel. L’original est conservé intact dans `assets/dbcodex-source.png` ; le PNG de prévisualisation et l’ICO Windows (16 à 256 pixels, neuf tailles) sont générés par `scripts/generate-app-icon.py` avec Pillow, en conservant le dessin, les proportions et la transparence. Ces fichiers sont conservés dans les sources ; aucune dépendance Python n’est nécessaire au packaging. Cette image remplace la première proposition de tables blanches et turquoise.

Le packaging applique cet ICO à l’application Electron et au lanceur portable NSIS. Les icônes ont été extraites des deux EXE finaux et inspectées à 32 pixels (`build/icon-review/application.png` et `portable.png`). Après reconstruction avec l’image fournie par l’utilisateur, les deux manifestes ont été signés à nouveau et l’audit a réussi. Le test réel de lancement, ouverture de projet, préférences et fermeture a été répété avec succès : `build/single-exe-smoke-1792071651486/checks.json`.
