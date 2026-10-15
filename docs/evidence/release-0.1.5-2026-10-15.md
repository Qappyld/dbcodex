# Publication DBCodex 0.1.5 — 15 octobre 2026

La version 0.1.5 est publiée comme dernière version stable :
https://github.com/Qappyld/dbcodex-releases/releases/tag/v0.1.5

Sources privées : main, commit d52e244d97d8a4d0d5e9335dfa1fe2f849c281a5.
Workflow réussi : https://github.com/Qappyld/dbcodex/actions/runs/38764320109

La publication contient l’EXE unique, le ZIP de compatibilité et les deux manifestes signés. Le contrôle public effectué avec PortableUpdater confirme que les éditions ZIP et EXE en 0.1.4 voient la 0.1.5 disponible et acceptent sa signature. Aucune mise à jour n’a été installée sur les projets de l’utilisateur pendant cette vérification.

Validation : 441 tests portables locaux réussis, TypeScript cœur/UI/MCP/desktop portable réussi, pipeline GitHub complet réussi (compilation, tests, packaging, signature, audit, publication). Les empreintes des 59 fichiers transférés ont été comparées entre le poste et GitHub avant publication ; l’icône binaire est également identique.

Un premier lancement a échoué sur un transfert incomplet du fichier de dépendances. Les sources ont été corrigées et vérifiées avant le lancement réussi ; aucun paquet de ce premier lancement n’a été publié.

Important pour les prochaines modifications : le transfert a utilisé le connecteur GitHub car le Git local ne contient pas son assistant HTTPS. Le checkout local reste sur codex/dbcodex-workbench, au commit 782ce0b, avec ses modifications préexistantes conservées. La référence distante main est désormais d52e244 ; la synchroniser avant un futur push, sans écraser les autres travaux locaux.

Preuves locales : build/release-0.1.5/public-update-check.json et published.png.
