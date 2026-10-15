# Construction et modes fixes — 14 octobre 2026

## Décisions mises en œuvre

Le type de projet est choisi avant la création du fichier et reste fixe. Les anciens projets restent DBML générique. La conversion de mode de la maquette n’est pas intégrée. Les deux éditeurs sont accessibles par une barre persistante ; DBML est l’éditeur initial. Construction utilise un arbre et des fiches, avec modifications immédiates des propriétés et validation des changements structurels avant application au brouillon.

SharePoint modélise listes et bibliothèques, types de colonnes, champs système, Lookup simple/multiple et paramètres d’affichage. Dataverse possède son préfixe, sa colonne de nom principal et des relations N:N indépendantes des Lookup. SQL propose quatre catalogues et des relations de colonne à colonne.

## Conservation et sécurité du document

`PresentationDocument.model` est une extension optionnelle validée par Zod ; elle est incluse dans les empreintes et les charges des brouillons/révisions existants. Aucun changement de schéma SQLite n’est nécessaire, et les présentations historiques sans modèle conservent leur sérialisation. Les sauvegardes de brouillons et de révisions comparent le profil au profil enregistré dans la transaction et refusent tout changement ou retrait de mode métier.

Les commandes modifient les plages de déclaration du DBML et préservent le texte extérieur. Les renommages suivent références et appartenances ; les notes et noms des groupes/vues sont préservés. Le diagramme enrichi présente les Lookup métier comme des liens vers les tables sans changer les identifiants du graphe DBML. Les Lookup SQL conservent leur colonne cible. Les références DBML saisies à la main réconcilient la cible des Lookup.

Les modifications source/propriétés de Construction s’appliquent ensemble dans la session. L’annulation restaure le couple source/propriétés. Les résultats de validation devenus obsolètes ne remplacent pas une nouvelle saisie. Les recentrages programmatiques sont exclus des commandes d’annulation.

## Validation

- Compilation TypeScript du cœur, de l’interface, du MCP et de l’application portable.
- Tests du modèle, de la persistance, de l’immuabilité du profil et des commandes DBML.
- Tests des formulaires : création et conversion d’une colonne en Lookup sans duplication, options immédiates, protection des champs système et DBML invalide.
- `scripts/review-construction-ui.mjs` : application Electron réelle, projets temporaires `.dbcd`, trois modes, création de projet depuis le formulaire, sauvegarde sur disque, suppression/annulation, rail, thème sombre et fenêtre compacte.
- Captures et résultats : `build/construction-review/` ; rapport portable : `build/project-modes-portable-tests.txt`.

Résultat final : **44 fichiers de tests et 413 tests portables réussis**, puis 56 tests ciblés réussis après les derniers ajustements. Les contrôles TypeScript, MCP stdio et hors ligne sont réussis. Les neuf parcours interactifs ont également été exécutés dans le paquet final `build/project-modes-release/DBCodex-win32-x64/DBCodex.exe`, sans erreur JavaScript. Les fichiers `main.js`, `renderer.js` et `renderer.css` de son archive ASAR ont été comparés à la compilation finale.

Le paquet local se trouve dans `build/project-modes-release/DBCodex-0.1.1-win-x64.zip`. Il utilise la version locale déjà configurée, sans publication ni création de manifeste de mise à jour. Le dossier portable existant n’a pas été remplacé.

La suite générale inclut aussi des tests de la migration de l’application de chat : un module `desktop-service.js` absent, un matcher `toHaveAttribute` non installé et une fixture de brouillon sans `baseGeneration`. Ces éléments sont distincts des parcours portables examinés ici et n’ont pas été modifiés pour cette fonctionnalité.

## Limites explicites

Les règles propres aux plateformes sont des métadonnées de conception. Les expressions ne sont pas évaluées et il n’y a pas de déploiement externe. DBML standard ne transporte pas toutes les options métier ni les relations N:N du projet Dataverse : le `.dbcd` est le format complet. Les déclarations DBML complexes que les commandes ne peuvent modifier sans ambiguïté restent éditables dans DBML ; une proposition qui ne passe pas la validation ne remplace pas le brouillon.
