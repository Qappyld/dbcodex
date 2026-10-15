# Publication du portable — 15 octobre 2026

Le lot de 77 fichiers préparé et approuvé explicitement par l'utilisateur (portable, vues, groupes, routage et mises à jour signées) a été commité dans `66f56ed`, intégré avec le document plus récent de `origin/main` dans `e8fe618`, puis poussé sur la branche principale du dépôt privé `Qappyld/dbcodex`. Les travaux locaux plus récents non indexés, notamment les modes de construction, sont conservés dans l'espace de travail.

Le secret Actions `UPDATE_SIGNING_PRIVATE_KEY` a été ajouté dans le dépôt privé. La clé privée locale reste sous `.update-signing/private.pem`, ignorée par Git. Le lot commité a été contrôlé pour vérifier l'absence de cette clé.

## Validation GitHub Actions

Le premier essai a révélé trois écarts propres à l'exécution sur un runner neuf : widget MCP non compilé, chemin temporaire Windows utilisant un alias 8.3, et démarrage PowerShell dépassant le délai de cinq secondes d'un test. Le workflow compile désormais aussi le widget, l'attendu du test utilise le chemin canonique et les tests Windows disposent de trente secondes. Aucun comportement applicatif n'a été changé pour ces corrections.

Le workflow compile, teste, package, signe et audite également en mode validation ; l'entrée `publish=false` désactive uniquement l'envoi de la release. Le commit `3adf335b1b1a598230ef2000ad196999ba2a911d` a été validé avec succès : 395 tests, packaging Windows, signature avec le secret réellement enregistré dans GitHub et audit de l'archive/inventaire. Aucune nouvelle release publique n'a été créée par cette validation.

- Exécution réussie : https://github.com/Qappyld/dbcodex/actions/runs/38698590716
- Job : https://github.com/Qappyld/dbcodex/actions/runs/38698590716/job/116300985914
- Première release publique existante : https://github.com/Qappyld/dbcodex-releases/releases/tag/v0.1.1

## Token de publication configuré

Après réauthentification et génération du token par l'utilisateur, `RELEASES_TOKEN` a été enregistré dans les secrets Actions du dépôt privé, sans afficher ni enregistrer sa valeur dans les fichiers locaux. Le token est limité à `Qappyld/dbcodex-releases` avec **Contents: Read and write** et Metadata en lecture seule. Son expiration est le **13 janvier 2027** ; il faudra renouveler le token et remplacer le secret avant cette date pour continuer les publications.

Le workflow ciblé `check-release-access.yml` a validé avec ce secret l'authentification, le dépôt configuré public et non archivé, ainsi que la permission de push retournée par GitHub. Il n'a créé aucune release ni modifié de fichier dans le dépôt public. Exécution réussie : https://github.com/Qappyld/dbcodex/actions/runs/38701040283. La configuration des deux secrets et du workflow est terminée ; une véritable publication future reste à déclencher avec une nouvelle version.

Une prochaine publication devra augmenter la version dans `release-config.json` ; la version publique 0.1.1 existante ne doit pas être remplacée. Le workflow refusera de recréer un tag déjà publié.
