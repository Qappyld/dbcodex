# Créer et modifier un .dbcd avec un assistant

Le serveur MCP fournit des opérations communes aux clients Codex et Claude. Les outils `read_dbcd`, `validate_dbcd_changes` et `update_dbcd` renvoient du JSON dans `structuredContent` **et dans le contenu texte MCP** : ils ne nécessitent pas MCP Apps. Leur fonctionnement est testé avec un client MCP sans capacité d’interface ; le parcours dans chaque application Codex/Claude reste à vérifier manuellement.

## Format et transport

Un `.dbcd` est une base SQLite, pas un document texte. Ne pas le modifier avec un éditeur de texte, des substitutions binaires ou des requêtes SQL improvisées. Le serveur utilise le store du cœur pour les transactions, empreintes, contrôles de version et révisions. Le DBML décrit la structure ; `model` conserve les noms affichés, options, Lookup et relations N:N. Les vues et positions restent gérées par l’atelier.

Après installation des dépendances, `npm run build` compile le serveur `packages/mcp/dist/index.js` et son interface. Le transport est **stdio**, lancé avec Node.js 22.13 ou supérieur :

```text
node <chemin-absolu-du-dépôt>/packages/mcp/dist/index.js
```

Le serveur utilise les racines de fichiers annoncées par le client. Pour un client sans capacité `roots`, lancer depuis le dossier de projets autorisé et ajouter `--trust-cwd-as-workspace`. Cet argument autorise explicitement le dossier de travail du processus ; il ne contourne pas une liste de racines vide ou inaccessible annoncée par le client. Tous les chemins d’outils restent relatifs à ces racines. La création utilise la première racine ; lecture et modification cherchent le fichier dans les racines autorisées.

La déclaration locale du plugin est dans `.mcp.json`. `${PLUGIN_ROOT}` est un emplacement du plugin : pour une configuration manuelle, remplacer cet emplacement par un chemin absolu. La configuration du client doit définir le bon dossier de travail si le repli sur ce dossier est utilisé. Les réglages de connexion propres à chaque client ne sont pas installés par ce changement.

## Outils accessibles à l’assistant

| Outil | Usage |
| --- | --- |
| `create_dbcd` | Créer un nouveau projet avec profil et, facultativement, DBML et modèle métier. Refuse tout écrasement. |
| `read_dbcd` | Lire le DBML enregistré, le graphe, le modèle, les diagnostics et l’identité de version. |
| `validate_dbcd_changes` | Valider une proposition sans écrire et annoncer les tables ajoutées/supprimées. |
| `update_dbcd` | Revalider et enregistrer DBML et modèle en une seule révision. |
| `apply_dbcd_edits` | Effectuer des remplacements textuels exacts et uniques en conservant la présentation. |
| `import_dbml`, `export_dbml` | Échanger le DBML ; l’export ne sauvegarde pas les propriétés métier du projet complet. |
| `open_dbcd` | Afficher l’atelier dans un client compatible MCP Apps. |

Les outils d’édition interactive, de brouillon et de restauration restent réservés au composant MCP Apps. L’assistant ne doit pas les utiliser pour contourner un conflit.

## Création

`profile` est obligatoire et reste fixe :

```json
{"mode":"generic"}
{"mode":"sql","dialect":"postgresql"}
{"mode":"sharepoint"}
{"mode":"dataverse","publisherPrefix":"app"}
```

Les autres dialectes SQL sont `sqlserver`, `mysql` et `sqlite`. Sans `sourceText`, un projet vide est créé. Sans `model`, le modèle initial contient le profil et des tables de métadonnées vides. Une création avec contenu est atomique : la définition est validée avant la création du fichier.

Exemple d’arguments de `create_dbcd` :

```json
{
  "path": "clients.dbcd",
  "profile": {"mode": "sharepoint"},
  "sourceText": "Table clients {\n ID Number [pk]\n Title Text [not null]\n}\n",
  "model": {
    "version": 1,
    "profile": {"mode": "sharepoint"},
    "tables": {
      "public.clients": {
        "displayName": "Clients",
        "kind": "list",
        "columns": {
          "ID": {"displayName": "ID", "type": "Number", "system": true, "readOnly": true},
          "Title": {"displayName": "Nom du client", "type": "Text", "options": {"maxLength": 120}}
        }
      }
    }
  }
}
```

Les clés des tables sont les identifiants du graphe (`public.clients` pour la table `clients` du schéma public). Les clés des colonnes sont leurs noms techniques DBML. Le DBML reste nécessaire : les métadonnées seules ne créent pas de colonnes. Les champs système propres à un profil ne sont pas ajoutés automatiquement par cet outil ; leur définition doit être fournie si elle est nécessaire au projet.

## Lecture, proposition et enregistrement

1. Appeler `read_dbcd` avec `{"path":"clients.dbcd"}`.
2. Reprendre `projectId`, `currentRevisionId` et `generation` sous les noms attendus ci-dessous.
3. Préparer `sourceText`, `model` ou les deux. Valider avec `validate_dbcd_changes`.
4. Si la proposition correspond à la demande de l’utilisateur et que `valid` vaut `true`, appeler `update_dbcd` avec la même proposition. Pas de confirmation supplémentaire pour une modification déjà demandée.
5. Vérifier `saved` et la nouvelle génération. Relire avant la modification suivante.

Exemple de proposition pour les deux outils, après lecture de la version courante :

```json
{
  "path": "clients.dbcd",
  "expectedProjectId": "IDENTIFIANT_RETOURNE_PAR_READ",
  "expectedRevisionId": "REVISION_RETOURNEE_PAR_READ",
  "expectedGeneration": 1,
  "sourceText": "Table clients {\n ID Number [pk]\n Title Text [not null]\n email Text\n}\n",
  "label": "Ajouter une adresse email"
}
```

`expectedGeneration: 1` n’est qu’un exemple : utiliser la valeur réellement lue. `sourceText` remplace le texte DBML complet. `model` remplace **le modèle métier complet**, pas un patch : reprendre toutes les propriétés à conserver depuis `read_dbcd`. Un champ `model` omis conserve les métadonnées ; les cibles Lookup sont réconciliées avec les nouvelles références DBML. Un champ `sourceText` omis conserve le texte exact. `null` ne signifie pas « conserver » et est refusé. Au moins l’un des deux champs doit être fourni.

Pour renommer/supprimer une table ou une colonne avec métadonnées, adapter aussi les clés correspondantes du modèle complet. La validation refuse les métadonnées orphelines et les relations N:N vers des tables inexistantes. Les vues, positions, panneaux et réglages de noms sont conservés par `update_dbcd` ; cet outil ne les édite pas et ne redistribue pas les tables.

La prévisualisation renvoie les diagnostics, `sourceChanged`, `modelChanged`, `addedTables` et `removedTables`. Ce résumé ne remplace pas un diff détaillé du contenu fourni. Les avertissements peuvent être enregistrés ; les erreurs bloquent l’écriture. `update_dbcd` refait la validation et les contrôles de version, même après une prévisualisation réussie.

## Propriétés métier

Le schéma d’entrée MCP expose la définition complète de `model` ; la référence du code est `packages/core/src/project-model.ts`.

- Tables : `displayName`, `pluralName`, `kind` (`table`, `list`, `library`), `description`, `primaryNameColumn`, `columns`.
- Colonnes : `displayName`, `type`, `description`, `system`, `readOnly`, `options`, `lookup`.
- Options : choix, valeur par défaut, longueur, bornes, décimales, formule et autres propriétés du catalogue. Ces options ne déclenchent pas de calcul ni de déploiement.
- Lookup : cible `targetTableId`, colonne cible `targetColumn`, colonne affichée `displayColumn`, colonnes supplémentaires et indicateur `multiple`. Créer aussi la référence DBML correspondante. En Dataverse, un Lookup multiple est refusé : utiliser une relation N:N.
- N:N : `relationships` contient `{id, name, sourceTableId, targetTableId, kind:"many-to-many"}`. Les identifiants doivent être uniques et les deux tables doivent exister.

Les contrôles réutilisent les diagnostics métier existants ; ils ne constituent pas une certification exhaustive du schéma par Microsoft ou par un moteur SQL.

## Conflits et confidentialité

`read_dbcd` lit l’état enregistré, indique `hasDraft` et n’inclut pas le contenu du brouillon par défaut. `includeDraft:true` permet une consultation explicite du brouillon. Toute prévisualisation ou modification refuse un brouillon récupérable : l’utilisateur doit d’abord le résoudre dans l’éditeur. Ne jamais le supprimer automatiquement.

Une version périmée ou un autre identifiant de projet provoque un conflit. Relire puis réévaluer la demande ; ne pas simplement remplacer les valeurs attendues pour forcer la proposition précédente. Le store vérifie à nouveau la génération, l’identité et l’absence de brouillon dans la transaction. Une sauvegarde acceptée ajoute une révision ; la prévisualisation n’en crée aucune.

`read_dbcd` transmet explicitement le contenu demandé au contexte de l’assistant et donc au fournisseur utilisé par le client. Les ouvertures de l’atelier continuent de garder le texte complet dans les métadonnées du composant. Le serveur ne contacte aucun service distant ; ne pas envoyer les fichiers à d’autres services pour les traiter.

## Instructions pour Codex et Claude

Pour Codex, le skill `skills/dbcodex/SKILL.md` décrit ce parcours. Pour un client Claude, fournir le guide présent ou ajouter les instructions suivantes aux consignes du projet ; elles sont également utilisables dans Codex sans skill :

```text
Pour les projets .dbcd, utiliser le serveur MCP dbcodex et ses schémas d’outils.
Ne jamais écrire directement dans la base SQLite du projet.
Pour une création, utiliser create_dbcd avec profil, DBML et modèle métier utiles.
Pour une édition demandée, lire avec read_dbcd, préserver les propriétés existantes,
valider avec validate_dbcd_changes puis enregistrer avec update_dbcd.
Reprendre l’identité de la dernière lecture. model est un remplacement complet.
Résoudre les conflits et brouillons sans les effacer automatiquement.
N’appeler read_dbcd que pour une demande nécessitant de partager le schéma avec l’assistant.
Ne pas déployer le schéma ni transmettre son contenu à d’autres services.
```

## Vérification

`packages/mcp/test/assistant.test.ts` couvre le parcours d’un client MCP sans Apps, la confidentialité du brouillon, la prévisualisation sans écriture, l’historique, la conservation des vues, les profils et les refus d’écriture. `npm run verify:mcp` vérifie le serveur compilé sur stdio.

Pour une validation manuelle dans chaque client : connecter le serveur compilé, créer un projet de test dans une racine autorisée, lire son contenu, ajouter une colonne et ses options, vérifier la révision dans l’atelier, puis vérifier qu’un brouillon ouvert bloque l’édition externe. La présence des outils en test de protocole ne prouve pas l’installation dans un client réel.
