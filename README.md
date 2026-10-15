# dbcodex

`dbcodex` est un atelier local intégré à Codex pour éditer un schéma DBML, organiser son diagramme et consulter son historique. Le fichier **`.dbcd` est le projet éditable** : il contient le texte DBML exact, la présentation, les brouillons et les révisions dans une base SQLite. **`.dbml` reste le format d’échange**, importé ou exporté sans réécriture du texte.

## Utilisation

### Création et édition par un assistant

Le MCP propose `read_dbcd`, `validate_dbcd_changes` et `update_dbcd` pour lire un projet, prévisualiser une proposition et enregistrer le DBML avec ses propriétés métier en une révision, sans interface MCP Apps obligatoire. `create_dbcd` accepte aussi un contenu initial. Les vues sont conservées ; les conflits, brouillons récupérables et changements de profil bloquent l’édition. Voir le [guide commun Codex / Claude](docs/assistant-mcp.md) pour les exemples, la connexion et les limites de validation dans chaque client.

### Version portable principale

Les sources incluent une passerelle de session portable pour lire le document ouvert, ses modifications en mémoire et sélectionner une table, une colonne ou une relation sans Computer Use. Dans une version construite avec cette évolution, le lancement `--mcp` expose un MCP HTTP local authentifié ; voir [connexion à la session portable](docs/live-mcp.md). Le MCP historique sur fichiers reste distinct.

La livraison locale de référence est **0.1.4**, désormais disponible en fichier unique : lancez `release/DBCodex-0.1.4-win-x64.exe`, sans extraction ni installation. Les préférences sont dans `release/data/`, à conserver avec l’EXE lors d’un déplacement. Cette version regroupe les vues, le routage, les mises à jour, les modes SharePoint, Dataverse et SQL et le nouvel historique détaillé. L’ancien dossier `release/DBCodex-win32-x64/` reste conservé pour la transition ; les sauvegardes et rapports sont dans `build/consolidation/`. Le ZIP est encore généré pour les mises à jour des éditions déjà distribuées. Les sources et compilations de développement ne constituent pas une seconde installation portable.

### Construction SharePoint, Dataverse et SQL

À la création d’un `.dbcd`, choisissez **SharePoint**, **Dataverse**, **SQL** (PostgreSQL, SQL Server, MySQL ou SQLite), ou **DBML générique**. Le type et ses paramètres restent fixes : il n’y a pas de conversion en cours de projet. Les fichiers existants sans profil restent génériques. Le formulaire est disponible dans le lanceur Codex et dans **Fichier → Nouveau projet** de l’application portable.

La barre gauche reste visible lorsque le panneau est fermé. **DBML** s’ouvre par défaut ; **SharePoint**, **Dataverse** ou **Construction** ouvre l’arbre des objets et leurs propriétés. Recliquez sur l’éditeur actif pour refermer son panneau. Les modifications valides entrent dans le brouillon ; **Enregistrer** crée une révision. **Annuler / Rétablir** couvre les commandes de construction et du diagramme. Dans une fenêtre étroite, le panneau se superpose au diagramme.

- **SharePoint** : listes et bibliothèques, colonnes système regroupées, types et options de colonnes, Lookup simple ou multiple vers une table existante, colonne affichée et colonnes supplémentaires. Les colonnes affichables sont limitées aux types compatibles. `Title` peut être renommée à l’affichage et rendue obligatoire ; les champs système techniques restent protégés dans Construction.
- **Dataverse** : préfixe d’éditeur, nom principal de table, colonnes et options, Lookup simple avec nom de relation, et relations N:N distinctes des colonnes. Le diagramme relie les Lookup à la table cible.
- **SQL** : catalogue de types adapté au moteur, clés primaires, champs obligatoires et relations vers une colonne cible.

Les noms techniques sont proposés automatiquement à la création. Un nom interne peut être personnalisé ; modifier ensuite le nom affiché conserve son nom interne. Le sélecteur **Noms** permet de montrer les noms affichés, techniques ou les deux dans le diagramme. En mode Dataverse, les noms techniques proposés utilisent le préfixe et les minuscules.

Un lien tracé depuis une colonne ou une table ouvre les options de relation dans Construction. Supprimer une table demande quoi faire des colonnes Lookup qui la ciblent : suppression ou conservation avec le statut **À résoudre**. Un DBML invalide conserve la dernière structure valide en consultation ; utilisez **Corriger le DBML** pour reprendre l’édition.

Le `.dbcd` conserve les propriétés métier, options et relations N:N dans les brouillons et révisions. Un export `.dbml` exporte le texte et les références DBML ; il ne constitue pas une sauvegarde des propriétés propres à SharePoint ou Dataverse. Gardez le `.dbcd` pour conserver le projet complet. Cet atelier conçoit les structures localement : il ne crée pas d’objets dans un tenant Microsoft ni ne déploie de base SQL ; les formules sont des définitions, sans moteur d’évaluation.

Références des catalogues : [colonnes SharePoint](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/list-and-library-column-types-and-options), [relations SharePoint](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-list-relationships-by-using-lookup-columns), [colonnes Dataverse](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/types-of-fields), [relations Dataverse](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-entity-relationships).

```text
Ouvre fixtures/demo-shop.dbcd avec dbcodex.
Importe fixtures/demo-shop.dbml dans fixtures/demo-shop.dbcd.
Exporte la version courante de fixtures/demo-shop.dbcd vers fixtures/demo-shop-export.dbml.
```

Ces exemples sont indépendants : l’import crée un nouveau projet et refuse d’écraser un fichier existant. Le projet de démonstration est déjà fourni ; choisissez un autre nom pour tester l’import. L’export refuse également d’écraser sa destination et exporte la version enregistrée, sans inclure le brouillon.

L’éditeur, le diagramme et l’inspecteur partagent une session. Déplacez les tables, créez une vue, réglez le détail (noms, clés, tous les champs), puis cliquez sur **Enregistrer**. Chaque enregistrement explicite accepté crée une révision ; le DBML invalide et les conflits de génération empêchent l’enregistrement. Les brouillons récupérables ne sont pas des révisions. Aucune écriture spéculative de schéma ou de disposition n’est effectuée.

**Ctrl+S** enregistre le travail courant depuis tous les panneaux de l’atelier. Dans l’application portable, **Fichier → Enregistrer sous…** ou **Ctrl+Maj+S** crée un nouveau `.dbcd` avec le DBML courant, les vues, la disposition et les propriétés métier, puis ouvre ce nouveau projet dans la même fenêtre. La copie démarre avec son propre historique ; le projet d’origine conserve le sien. Annuler conserve le projet courant. Choisissez une destination libre : un fichier existant n’est pas remplacé.

Dans **Historique**, les révisions apparaissent de la plus récente à la plus ancienne, avec date, résumé, libellé éventuel et identifiant court. Sélectionner une révision charge son contenu à la demande et affiche les différences **de cette révision vers le travail courant**, brouillon inclus. Épingler protège une révision de la rétention automatique (90 jours et cible de 500 révisions ; les révisions épinglées et courantes sont conservées). **Restaurer** remplace le travail courant par le contenu sélectionné et crée une nouvelle révision ; enregistrez d’abord les modifications à conserver. Aucun commit Git n’est créé par le plugin.

L’application peut demander le plein écran au client MCP Apps et revenir au mode intégré en conservant sa session. Le client peut refuser cette demande. Une association personnalisée de fichiers `.dbcd` au système d’exploitation, à l’éditeur ou au panneau latéral de Codex **n’est pas garantie**. L’ouverture prise en charge passe par l’outil du plugin et son composant MCP Apps.

## Intégration native — expérimentation du 9 octobre

Le plugin déclare une entrée de conversation **Atelier DBML**, une entrée globale **dbcodex** et un visualiseur pour `.dbcd` et `.dbml`, selon les extensions officielles utilisées par Bits & Bolts. Leur présence et leur persistance dans votre version de Codex Desktop doivent être validées : voir [rapport et procédure](docs/evidence/native-integration.md).

L’écran d’ouverture accepte un chemin relatif à l’espace de travail. Le projet ouvert réutilise l’éditeur existant. Les versions enregistrées ailleurs sont détectées par lectures MCP locales toutes les deux secondes lorsque le composant est visible ; un brouillon local provoque un conflit au lieu d’être remplacé. Les brouillons sont préservés lors d’une fermeture ordonnée si l’hôte attend la réponse `ui/resource-teardown`. Un arrêt brutal reste soumis à la dernière persistance périodique.

Codex peut appliquer une modification explicitement demandée avec `apply_dbcd_edits` : génération, révision et empreinte attendues, puis remplacements textuels correspondant exactement une fois. Le serveur refuse les brouillons récupérables et conserve la présentation. Les outils de sauvegarde de l’éditeur restent réservés au composant.

L’entrée de conversation possède une instance par chat. Le fichier `.dbcd` partage l’état enregistré ; il ne partage pas une session d’édition en mémoire. Ne travaillez pas sur plusieurs brouillons simultanément : le format existant contient un seul emplacement de brouillon. Le dernier chemin peut être mémorisé si le stockage local de l’hôte est disponible ; la réouverture automatique de l’onglet au redémarrage n’est pas garantie.

## Installation et contrôles locaux

Prérequis : **Node.js 22.13.0 ou plus récent**, npm et une version de Codex prenant en charge les plugins et MCP Apps. `node:sqlite` peut émettre un avertissement expérimental selon la version de Node.

```powershell
npm ci
npm run build
npm run typecheck
npm test
npm run verify:offline-ui
npm run verify:mcp
codex plugin marketplace add .
codex plugin add dbcodex@dbcodex-local
```

Après installation ou mise à jour, ouvrez une nouvelle tâche Codex dont l’espace de travail est ce dépôt, puis utilisez la première commande d’exemple. Un cache de plugin déjà installé doit être rafraîchi depuis ce checkout compilé pour charger les nouveaux outils et la nouvelle interface. Le serveur utilise les racines annoncées par le client ; sa configuration locale autorise le répertoire courant seulement si le client n’annonce pas cette capacité.

Pour régénérer **uniquement le projet de démonstration suivi par Git** (cela remplace ses éventuels essais locaux) :

```powershell
npm run build --workspace @dbcodex/core
node scripts/generate-dbcd-fixtures.mjs
```

Le générateur fixe l’identifiant `demo-shop`, la date `2026-09-26T00:00:00.000Z` et une présentation vide ; il vérifie le hash de la source via le store public. Le vérificateur MCP utilise une copie temporaire du projet et vérifie qu’un brouillon n’avance pas l’historique, puis qu’un enregistrement avance exactement une génération et une révision.

## Portée et confidentialité

Le cœur traite les fichiers localement ; l’interface embarque ses dépendances et ne charge aucune ressource réseau. L’ouverture de l’atelier garde le texte complet et les instantanés historiques dans les métadonnées privées du composant. L’outil explicite `read_dbcd` partage en revanche le schéma et les propriétés métier demandés avec l’assistant, donc avec le fournisseur utilisé par son client ; le contenu du brouillon nécessite `includeDraft:true`. Ne transmettez pas ces données à d’autres services externes. Les chemins sont relatifs à l’espace de travail et les opérations de fichier refusent les sorties de racine et les liens non autorisés.

Le mode historique `.dbml` (`open_dbml` et `save_layout`) reste disponible pour explorer un fichier et persister les mouvements explicites dans un sidecar. Pour l’édition et les révisions intégrées, importez dans `.dbcd`.

Ce dépôt reste un développement local, pas une version publique. La validation interactive dans Codex Desktop doit être consignée dans `docs/evidence/dbcd-workbench.md` avant de déclarer ce parcours validé. Les exports PNG/SVG, la couverture DBML complète, la licence et la distribution publique restent des sujets séparés de cet atelier.
