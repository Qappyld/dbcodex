# Installation principale consolidée — 15 octobre 2026

## Résultat

La livraison de référence est `release/DBCodex-win32-x64/DBCodex.exe`, version fichier et application **0.1.2**. `release/` ne contient plus que ce dossier et l’archive `DBCodex-0.1.2-win-x64.zip`.

Les dix installations réelles trouvées ont été comparées par archive ASAR et fonctionnalités. La compilation actuelle comprend Construction et les modes fixes, les vues, le routage et le système de mise à jour. Elle remplace la principale 0.1.0. Aucun déploiement GitHub ou manifeste de mise à jour public n’a été publié.

## Données conservées

- Préférences de la principale conservées, dont le thème clair.
- 20 projets récents réunis, dédupliqués par chemin absolu ; les chemins relatifs ont été recalculés pour la principale.
- Un projet situé à l’intérieur d’une ancienne installation a été copié dans `release/DBCodex-win32-x64/data/imported/`, avec comparaison SHA-256 et réécriture de son entrée récente.
- Les autres projets sont restés à leur emplacement.
- Données originales et archives ASAR des dix versions sauvegardées dans `build/consolidation/2026-10-15/`. Le plan et les empreintes sont dans `plan.json` et le bilan dans `summary.json`.

Les neuf anciennes installations ont été déplacées, sans suppression, dans `anciennes-copies/`. Les anciennes archives ZIP et l’ancien manifeste local de mise à jour ont été rangés dans `anciennes-archives/`. Le contrôle automatique avait refusé une suppression récursive large : l’archivage réversible a été retenu à la place. Les faux exécutables des fixtures de tests n’ont pas été traités comme des installations.

## Vérifications

- Compilation TypeScript du cœur, de l’interface, du MCP et de l’application portable.
- Vérification de l’interface hors ligne et intégration MCP stdio réussies.
- Neuf parcours interactifs exécutés directement sur le nouvel exécutable principal : création, Lookup par formulaire et tracé, sauvegarde, barre persistante, affichage compact, annulation de suppression, DBML invalide, Dataverse, SQL et formulaire de création de projet.
- Version de fichier et produit de l’exécutable : 0.1.2.
- Fusion et copies de données contrôlées avant archivage des anciennes installations.
