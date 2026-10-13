# dbcodex

`dbcodex` est un atelier local intégré à Codex pour éditer un schéma DBML, organiser son diagramme et consulter son historique. Le fichier **`.dbcd` est le projet éditable** : il contient le texte DBML exact, la présentation, les brouillons et les révisions dans une base SQLite. **`.dbml` reste le format d’échange**, importé ou exporté sans réécriture du texte.

## Utilisation

```text
Ouvre fixtures/demo-shop.dbcd avec dbcodex.
Importe fixtures/demo-shop.dbml dans fixtures/demo-shop.dbcd.
Exporte la version courante de fixtures/demo-shop.dbcd vers fixtures/demo-shop-export.dbml.
```

Ces exemples sont indépendants : l’import crée un nouveau projet et refuse d’écraser un fichier existant. Le projet de démonstration est déjà fourni ; choisissez un autre nom pour tester l’import. L’export refuse également d’écraser sa destination et exporte la version enregistrée, sans inclure le brouillon.

L’éditeur, le diagramme et l’inspecteur partagent une session. Déplacez les tables, créez une vue, réglez le détail (noms, clés, tous les champs), puis cliquez sur **Enregistrer**. Chaque enregistrement explicite accepté crée une révision ; le DBML invalide et les conflits de génération empêchent l’enregistrement. Les brouillons récupérables ne sont pas des révisions. Aucune écriture spéculative de schéma ou de disposition n’est effectuée.

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

Le cœur traite les fichiers localement ; l’interface embarque ses dépendances et ne charge aucune ressource réseau. Ne transmettez jamais le DBML, les graphes, les dispositions ou les révisions à un service externe. Le texte complet et les instantanés historiques sont réservés aux métadonnées privées du composant. Les chemins sont relatifs à l’espace de travail et les opérations de fichier refusent les sorties de racine et les liens non autorisés.

Le mode historique `.dbml` (`open_dbml` et `save_layout`) reste disponible pour explorer un fichier et persister les mouvements explicites dans un sidecar. Pour l’édition et les révisions intégrées, importez dans `.dbcd`.

Ce dépôt reste un développement local, pas une version publique. La validation interactive dans Codex Desktop doit être consignée dans `docs/evidence/dbcd-workbench.md` avant de déclarer ce parcours validé. Les exports PNG/SVG, la couverture DBML complète, la licence et la distribution publique restent des sujets séparés de cet atelier.
