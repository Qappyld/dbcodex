# Panneau Construction — 15 octobre 2026

Livraison principale : 0.1.3, `release/DBCodex-win32-x64/DBCodex.exe`. Une seule installation dans `release`, avec son ZIP 0.1.3. ZIP 0.1.2 conservé dans les anciennes archives de consolidation.

Améliorations : titre et nombre d’objets, recherche des noms affichés et techniques (insensible aux accents), récupération des résultats vides et touche Échap, indentation et types dans l’arbre, sélection visible des colonnes système, fiche contextualisée, nom technique en police monospace et suppression en pied de fiche. Barre DBML/Construction conservée.

Vérifications : TypeScript core/UI/MCP et desktop ; 4 tests du formulaire et de la recherche, 10 tests Workbench ; absence de dépendances UI distantes ; intégration MCP stdio. Dix scénarios Electron réussis sur les sources puis sur l’exécutable principal : création, persistance, Lookup multivaleur, glisser-déposer réutilisant la colonne, recherche technique et récupération, barre persistante, thèmes clair/sombre et fenêtre compacte sans débordement, suppression/annulation, DBML invalide, Dataverse et SQL, création d’un projet au mode fixe.

Captures : `build/construction-review/sharepoint-desktop.png`, `sharepoint-dark.png`, `sharepoint-compact.png`, `dataverse.png`, `sql.png`. Résultat automatisé : `build/construction-review/checks.json`.

Préférences sauvegardées avant essais, restaurées puis comparées par SHA-256. Archive ASAR 0.1.2 conservée dans `build/interface-review-2026-10-15/`. Données de la principale conservées par le packaging. Aucun déploiement distant.
