# Mise à jour du portable — 14 octobre 2026

## Résultat

Le dépôt public `Qappyld/dbcodex-releases` est créé. Le code reste dans le dépôt privé. Le portable 0.1.1 intègre la recherche de version, le téléchargement vérifié, la fermeture avec conservation des brouillons, le remplacement externe, la sauvegarde et la relance.

La publication initiale 0.1.1 est effectuée manuellement sur GitHub. Le manifeste public a été relu sans authentification et sa signature ainsi que sa correspondance au manifeste local ont été vérifiées. Le digest du ZIP affiché par GitHub correspond au manifeste signé. Le workflow `.github/workflows/publish-portable.yml` est préparé localement pour les publications suivantes ; son activation requiert le dépôt privé à jour et les secrets `RELEASES_TOKEN` et `UPDATE_SIGNING_PRIVATE_KEY`. La clé privée locale est sous `.update-signing/`, ignoré par Git et hors des dossiers de build. Aucun secret n'est intégré au portable. Le guide embarqué initial mentionne encore l'ancien emplacement `build/update-signing/private.pem` ; l'emplacement local de référence est désormais `.update-signing/private.pem`.

## Vérifications

- TypeScript du portable : passe.
- Suite portable : 395 tests passent (41 fichiers). Les tests historiques de l'application de discussion ne font pas partie de cette suite, comme avant ce changement.
- Tests de signature et téléchargement : origine autorisée, modification après signature, mauvaise clé, versions numériques, taille/SHA-256, archives incomplètes, chemins personnels/traversée et doublons refusés.
- Programme PowerShell réellement exécuté dans des dossiers isolés : remplacement réussi, sauvegarde présente, projet et préférences inchangés, fichier verrouillé provoquant une restauration, entrée ZIP de traversée refusée, récupération après interruption à partir du journal.
- `scripts/verify-portable-update.mjs` : copie isolée du portable, prédécesseur simulé 0.1.0 équipé du module, manifeste et archive réels de 0.1.1 servis localement au test. Vérification depuis le menu, téléchargement, fermeture, remplacement complet de l'ASAR vérifié par hash, conservation du brouillon même invalide, thème et chemins récents conservés, nouvelle version réellement lançable. Aucun accès réseau réel durant cette simulation du téléchargement.
- Audit ASAR : uniquement les fichiers de distribution et package.json ; aucun projet, clé privée, test ou source map. Les bundles JavaScript restent analysables ; confidentialité du dépôt ne signifie pas opacité des exécutables.
- `scripts/audit-portable-release.mjs` : signature et archive vérifiées, chaque hash de fichier conforme à l'inventaire, bundle limité aux fichiers attendus, adaptateur de test et clé privée absents. Paquet final : 75 fichiers, 162 023 270 octets.

Le lancement direct d'un enfant depuis Electron ne survivait pas à sa fermeture sur cet hôte. Le lancement via PowerShell `Start-Process`, attendu avant la sortie d'Electron, a été validé en bout en bout. Le test lance son prédécesseur hors de `electron.launch` pour éviter la destruction automatique de ses enfants par le banc de test.

## Interface — skill ui-ux, Tiny change

Atelier Windows existant destiné à l'édition de schémas ; seules les commandes de mise à jour sont ajoutées dans l'en-tête. Le premier choix est de vérifier/télécharger, puis de redémarrer quand le travail est prêt. Les états d'attente, progression, disponibilité, erreur et récupération sont explicites. Les nouveautés sont repliées, les détails techniques restent dans la documentation. Le menu respecte le thème existant, se ferme au clic extérieur et par Échap et conserve un indicateur de nouvelle version. Vérification visuelle dans les captures `build/update-available.png`, `build/update-ready.png` et `build/update-complete.png`.

## Limites

Validation sur l'hôte Windows de développement ; pas de poste standard distinct ou de OneDrive. La reprise après coupure brutale est manuelle. Le rollback automatique traite les erreurs de remplacement, pas une panne fonctionnelle après démarrage. Les sauvegardes de versions précédentes restent présentes jusqu'à archivage manuel. Aucun format de projet n'est migré par le module de mise à jour.
