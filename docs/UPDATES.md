# Mises à jour de DBCodex portable

Le code reste dans le dépôt privé `Qappyld/dbcodex`. Seuls les fichiers compilés, les notes publiques et un manifeste signé sont distribués dans `Qappyld/dbcodex-releases`.

## Utilisation

Dans l'en-tête, ouvrir **Mises à jour**. La vérification se fait aussi quelques secondes après le lancement. Choisir **Télécharger la mise à jour**, puis **Mettre à jour et redémarrer**. Les nouveautés sont consultables avant le téléchargement. L'application conserve les brouillons avec son mécanisme normal de fermeture. Si un brouillon ne peut pas être conservé, la mise à jour est reportée.

Fermer les autres instances de DBCodex avant de redémarrer. Toutes les fenêtres d'une même instance sont fermées. La mise à jour nécessite un dossier accessible en écriture, une connexion GitHub et PowerShell Windows. Aucun token GitHub n'est embarqué et aucune donnée de projet n'est envoyée : les requêtes concernent uniquement les fichiers de distribution.

La version 0.1.1 est la première équipée de ce système. Les anciennes versions doivent recevoir une première mise à jour manuelle. Le téléchargement contient toute l'application, y compris Electron, pour permettre les mises à jour de son moteur. Les fichiers sont vérifiés avant remplacement (signature Ed25519 du manifeste, taille et SHA-256 du téléchargement, SHA-256 de chaque fichier extrait pour les ZIP).

L’édition à fichier unique utilise `portable-update-manifest.json` (schéma 2) et remplace uniquement son EXE après fermeture, en conservant son nom actuel. Le lanceur et les processus Electron doivent avoir quitté. L’édition ZIP conserve `update-manifest.json` (schéma 1) et son remplacement par inventaire. Les canaux sont distincts pour éviter qu’une ancienne application reçoive un format qu’elle ne sait pas installer. Pour passer du ZIP au fichier unique, télécharger l’EXE manuellement et le placer à côté de l’ancien dossier `data/`.

Les projets `.dbcd`, `data/` et les fichiers personnels ne figurent jamais parmi les cibles. Les dossiers contenant des liens symboliques ou jonctions ne sont pas mis à jour. Les anciens fichiers applicatifs devenus inutiles sont conservés. La version précédente est sauvegardée dans `.dbcodex-update-previous-*` ; ces sauvegardes peuvent être archivées manuellement après validation. Un échec de remplacement déclenche une restauration. Le lancement réussi du processus n'est pas une garantie du bon fonctionnement de la nouvelle version ; aucune restauration automatique sur panne fonctionnelle n'est encore prévue.

## Publication depuis le dépôt privé

### Compatibilité OneDrive à partir de la 0.1.7

Les marqueurs Windows Cloud Files de OneDrive (`IO_REPARSE_TAG_CLOUD` à `CLOUD_F`) sont distingués des jonctions et liens symboliques. La balise est lue via Windows et le chemin résolu doit correspondre au chemin attendu ; les points de réanalyse inconnus et les redirections restent refusés. Cela corrige le refus systématique d’un EXE placé dans un Bureau OneDrive portant le marqueur `0x9000601A`. Les refus réels de lecture ou d’écriture du système restent possibles et sont journalisés. Ce correctif ne fournit ni verrou distribué ni synchronisation de projets entre ordinateurs.

Pour installer ce correctif depuis une version antérieure dont le programme de remplacement refuse déjà OneDrive, fermer normalement l’application puis remplacer manuellement l’EXE par la 0.1.7 en conservant `data/` et les projets. Les mises à jour lancées ensuite utiliseront le contrôle corrigé et les journaux persistants. La présence d’une nouvelle version sur GitHub ne modifie pas le programme de remplacement de la version actuellement installée.

1. Sauvegarder `.update-signing/private.pem` dans un emplacement sûr. Ce fichier est ignoré par Git, hors des dossiers de build, et ne doit jamais être inclus dans une release, un log ou le dépôt. La clé publique correspondante figure dans `release-config.json`. Ne pas régénérer la clé après distribution : les applications existantes ne feraient plus confiance aux mises à jour.
2. Dans les secrets GitHub Actions du dépôt **privé**, ajouter `UPDATE_SIGNING_PRIVATE_KEY` avec le contenu PEM de cette clé.
3. Créer un token GitHub à permissions fines, limité au dépôt **public** `dbcodex-releases`, permission **Contents: Read and write**. Le stocker dans le secret `RELEASES_TOKEN` du dépôt privé. Prévoir son renouvellement avant expiration. Le `GITHUB_TOKEN` du dépôt privé ne suffit pas pour écrire dans un autre dépôt.
4. Augmenter `version` dans `release-config.json` (versions stables `X.Y.Z`), puis compiler/tester et pousser le code validé dans le dépôt privé. Les versions des workspaces npm restent des versions internes ; celle du portable vient uniquement de `release-config.json`.
5. Exécuter manuellement **Publier DBCodex portable** dans Actions, avec les nouveautés destinées au public. Le workflow compile, teste, package, signe puis publie quatre fichiers autorisés : l’EXE portable, `portable-update-manifest.json`, le ZIP de compatibilité et `update-manifest.json`. Le téléchargement recommandé pour une nouvelle utilisation est l’EXE. Les sources ZIP/TAR générées par GitHub concernent le dépôt public de distribution, jamais le dépôt privé.

Le workflow ne publie pas les sources, les projets de test, les données locales, la clé privée ou les fichiers de diagnostic. Le packaging accepte uniquement un inventaire précis des fichiers Electron et de l'application. Le bundle applicatif reste analysable comme tout logiciel JavaScript distribué ; un dépôt privé ne constitue pas une protection contre l'analyse du binaire.

En local : compiler le cœur, puis `node scripts/build-desktop.mjs`, `node scripts/package-desktop.mjs`, puis `node scripts/sign-update.mjs`. La signature lit la clé locale ignorée ou la variable `UPDATE_SIGNING_PRIVATE_KEY`. L'audit public s'exécute avec `node scripts/audit-portable-release.mjs` en renseignant `DBCODEX_RELEASE_OUT` si les fichiers ne sont pas dans `build/update-release`. L'hébergement public n'est utilisable qu'après publication d'une première release.

## Récupération après interruption brutale

### Journaux de diagnostic

Dans une version construite avec la journalisation, **Mises à jour → Ouvrir les journaux** ouvre le dossier utilisé par l’application. Il se trouve normalement dans `data/logs/` à côté de l’EXE. Si ce dossier n’est pas accessible en écriture, l’application utilise `logs/` dans son dossier local de données utilisateur. Si aucun emplacement n’est disponible, le panneau le signale et l’application reste utilisable.

`application.jsonl` enregistre les démarrages, incidents du renderer, erreurs de démarrage MCP et étapes de recherche/téléchargement/redémarrage d’une mise à jour. La rotation conserve trois fichiers d’environ 1 Mio chacun. Chaque ligne contient une date UTC, la version, le processus, l’événement et les informations de diagnostic utiles.

Chaque tentative possède une référence commune entre le téléchargement et le programme de remplacement Windows. Son fichier `update-<référence>.jsonl` conserve les étapes, les processus qui bloquent la fermeture, les chemins refusés, l’erreur et sa ligne, ainsi que le résultat d’une restauration. Les vingt tentatives les plus récentes sont conservées au prochain démarrage ; chaque fichier est limité à environ 256 Kio. Une copie de secours `update-helper.jsonl` reste dans le dossier temporaire de cette tentative, même si le dossier des journaux du portable est inaccessible ou que le job est illisible.

Le résultat du remplacement est archivé dans `last-update-result.json` **avant** la suppression du message temporaire. S’il ne peut pas être archivé, l’original `.dbcodex-update-result.json` est conservé. **Détails du dernier échec** reste consultable dans le panneau après un redémarrage et après une nouvelle vérification des mises à jour.

Ces fichiers restent locaux : aucune transmission automatique. Le contenu DBML, les modèles et les arguments MCP ne sont pas journalisés ; les identifiants d’authentification usuels sont masqués dans les diagnostics. Les journaux peuvent contenir des chemins locaux et le nom du compte Windows : les relire avant de les partager.

Cette évolution ne peut pas récupérer un diagnostic déjà supprimé par la 0.1.4. Elle doit être installée une première fois pour tracer les tentatives suivantes ; une mise à jour lancée depuis une ancienne version utilise encore son ancien programme de remplacement.

### Procédure de récupération

Si `.dbcodex-update.lock` existe, l'application refuse de démarrer pour éviter d'ouvrir un projet pendant le remplacement. Patienter d'abord et fermer les autres instances. Le fichier lock contient le chemin du fichier temporaire `job.json`.

Si le remplacement avait commencé, `.dbcodex-update-backup/journal.json` contient l'inventaire sauvegardé. Fermer toutes les instances puis lancer PowerShell avec le script situé à côté de ce `job.json` :

```powershell
$jobPath = Get-Content -LiteralPath 'C:\chemin\DBCodex\.dbcodex-update.lock' -Raw
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path (Split-Path -Parent $jobPath) 'apply-update.ps1') -JobPath $jobPath -Recover
```

La récupération restaure les fichiers applicatifs et relance DBCodex. Elle ne restaure pas les données de projet : les mises à jour actuelles ne les migrent pas. Si les fichiers temporaires ont été supprimés, conserver `data/` et les projets, puis réinstaller les fichiers applicatifs depuis une release vérifiée. Si aucun journal n'existe et qu'aucun programme de mise à jour n'est en cours, le remplacement n'avait pas commencé : déplacer le lock hors du dossier pour reprendre. Archiver le dossier de sauvegarde après récupération, avant une nouvelle tentative.

Une coupure de courant ou un arrêt du programme de mise à jour peut demander cette intervention. Avant toute future migration du format `.dbcd` ou des préférences, ajouter une sauvegarde et une stratégie de compatibilité des données ; revenir à une ancienne application ne doit pas réutiliser aveuglément des données migrées.
