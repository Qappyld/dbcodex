# Intégration native dbcodex — audit, choix et validation

Date : 9 octobre 2026. Branche : `codex/dbcodex-workbench`, base `aa0f1ae`. Changements non commités ; aucune fusion ni modification de `main` pendant cette mission.

## Verdict

**Implémentation et protocole local testés ; acceptation visuelle native encore à effectuer.** Les points d’entrée officiels sont déclarés, mais leur seule présence dans `tools/list` ne prouve ni un panneau visible ni sa persistance dans cette version de Codex Desktop.

## Audit de l’existant

`packages/core` fournit parsing DBML, confinement des chemins et transactions SQLite avec générations, révisions, brouillons et restauration. `packages/mcp` expose ces opérations par stdio ; `open_dbcd` réserve le texte complet aux métadonnées privées du composant. `packages/ui` contient déjà CodeMirror, React Flow, vues, groupes, historique, conflits et demande de plein écran. Ces composants sont réutilisés.

Avant modification, le plugin n’annonçait aucun point d’entrée `global`, `thread` ou `file`. L’ouverture dépendait d’un appel d’outil avec un chemin. La session recevait les nouveaux résultats d’ouverture, mais ne relisait pas spontanément les enregistrements externes. Le délai de brouillon pouvait être annulé à la destruction du composant.

Le fichier `.dbcd` reste une base SQLite au format existant. Aucun remplacement d’éditeur, changement de format, nouvelle infrastructure distante ou travail sur les exports PNG/SVG.

## Sources officielles et portée des affirmations

La [page des extensions OpenAI](https://developers.openai.com/plugins/build/extensions) décrit les entrées et insiste sur ChatGPT. Elle ne suffit pas à déduire une compatibilité universelle Codex.

Le [README officiel Bits & Bolts](https://github.com/openai/mcp-extensions/blob/main/plugins/bits-and-bolts/README.md) mentionne explicitement Codex ; son [enregistrement serveur](https://github.com/openai/mcp-extensions/blob/main/plugins/bits-and-bolts/src/server/register.ts) fournit des exemples des trois entrées, de métadonnées de ressource et de chemin fourni par l’hôte. Cela établit une voie officielle à expérimenter, pas une preuve sur notre installation.

La [spécification des entrées](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#mcp-app-entrypoints) distingue l’onglet global et l’instance par conversation. La [section des fichiers](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#filesystem-access) précise que les URI sont opaques et que les appels provenant du composant reçoivent un chemin dans les métadonnées de l’hôte. Sa matrice décrit un support attendu au lancement ; elle ne remplace pas des essais locaux.

SDK utilisé : `@openai/mcp-extensions@0.1.0`, helpers de schéma d’entrée fichier et `getResourcePath`, avec le mécanisme existant `@modelcontextprotocol/ext-apps@2.0.0`. Les appels UI suivent le protocole MCP Apps déjà employé par le projet.

## Tableau de faisabilité

| Mode ou besoin | Documenté | Résultat de notre expérimentation | Limite |
| --- | --- | --- | --- |
| Panneau de conversation `thread` | Exemple officiel, instance par chat | Déclaration et lancement `{}` testés au niveau MCP | Apparition et maintien visuels non vérifiés |
| Entrée globale `global` | Onglet permanent sur desktop selon la spécification | Déclaration et lancement sans chemin implémentés | Persistance réelle entre conversations non vérifiée |
| Fichiers `.dbcd` / `.dbml` | Entrée fichier et chemin injecté par l’hôte | Chaîne entrée → appel app → confinement testée | Association effective dans l’hôte non vérifiée ; hors workspace refusé |
| Visualiseur déclenché par `open_dbcd` | Ressource MCP Apps du projet | Protocole testé, ancien parcours conservé | Rendu natif de cette livraison non vérifié |
| Plein écran | Métadonnées et requête documentées | Modes annoncés et traitement du refus conservé | L’hôte choisit le mode ; comportement natif non vérifié |
| Une même session mémoire dans tous les chats | Pas de contrat relevé ; `thread` crée des instances distinctes | Non implémenté | Partage des versions enregistrées via le fichier, pas du brouillon en mémoire |
| Restauration automatique des onglets au redémarrage | Pas de garantie relevée | Non vérifiable ici | Aucun patch interne ni hook de lancement ajouté |
| Retrouver projet, positions, vues et zoom | Persistance du projet existante | Stores et tests de réouverture conservés | Dernier chemin seulement si stockage local de l’hôte disponible |
| Conserver la sélection d’une table | État React existant | Conservée dans la même instance | Sélection non sauvegardée dans le fichier ni garantie après destruction |
| Modifications enregistrées par Codex | Nouvel outil local | Éditions exactes et conflits testés | Un brouillon récupérable doit être enregistré/résolu d’abord |
| Fermeture ordonnée | Requête standard `ui/resource-teardown` | Flush du brouillon et attente d’une sauvegarde testés | L’hôte doit attendre ; arrêt brutal limité au dernier brouillon déjà écrit |

« Non vérifié » ne signifie pas « non supporté ». Aucun panneau impossible n’est affirmé sur la seule base d’une absence de preuve.

## Architecture retenue

Priorité au **panneau de conversation**, puis à l’**entrée globale**. Les deux réutilisent `ui://dbcodex/diagram-v1.html` et un écran d’ouverture de projet. Le visualiseur invoqué par outil reste la solution de repli intégrée.

- `open_dbcd_workbench` : entrée `thread`, titre « Atelier DBML ».
- `open_dbcd_app` : entrée `global`, titre « dbcodex ».
- `open_dbcd_file` : reçoit l’URI opaque de l’hôte et prépare le composant. L’app appelle ensuite `resolve_dbcd_file`, réservé à l’app, afin que l’hôte injecte son chemin. Le serveur revérifie les racines et utilise les lecteurs existants. Il ne décode jamais l’URI en chemin.
- `apply_dbcd_edits` : remplacements textuels exacts, avec génération, révision et empreinte attendues. Chaque recherche doit correspondre une fois. La sauvegarde SQLite refuse aussi les brouillons à l’intérieur de la transaction, couvrant leur création après la première lecture.

L’éditeur relit le projet via MCP toutes les deux secondes lorsqu’il est visible et à la reprise du focus. Un état propre adopte une nouvelle révision ; un état modifié conserve le travail local et affiche un conflit. Les réponses démarrées avant une sauvegarde plus récente sont ignorées.

Les abonnements de ressources existent dans le protocole officiel, mais leur disponibilité effective et leurs notifications ne sont pas prouvées ici. Pour cette expérimentation, une lecture locale fonctionne aussi avec le visualiseur historique ; elle évite une dépendance à ces notifications. Le fichier SQLite n’est jamais réécrit comme un blob à travers l’API de ressources.

Les brouillons restent distincts des révisions. La fermeture ordonnée attend la sauvegarde en cours puis écrit le travail restant comme brouillon. Le format existant contient un seul emplacement de brouillon : plusieurs éditeurs avec des modifications non enregistrées simultanées ne disposent pas d’une isolation par utilisateur/instance. Privilégier une instance active par projet.

## Tests et preuves

Environnement : Windows, Node `v24.13.1`, Codex CLI `0.162.0-alpha.2`. Cette version CLI n’identifie pas la version du client graphique.

### Avant les changements

| Commande | Résultat observé |
| --- | --- |
| `npm ci` | PASS ; avertissements npm sur les dépendances consignés ci-dessous |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 323 tests, 32 fichiers |
| `npm run verify:offline-ui` | PASS |
| `npm run verify:mcp` | PASS — ouverture 22,5 ms, sauvegarde 13,6 ms |

Les nouveaux tests ont été exécutés en échec avant l’implémentation, puis corrigés par les changements correspondants. Ils couvrent les entrées, le lancement, les chemins, les patchs exacts, les conflits, les réponses périmées, le brouillon à la fermeture et les modifications saisies pendant une sauvegarde.

Un premier contrôle de types a signalé le type Zod imbriqué du SDK ; le schéma public utilise désormais le Zod du projet, puis le SDK valide l’entrée fichier au traitement. Le contrôle hors ligne dépendait aussi d’une résolution accidentelle depuis la racine npm : il importe maintenant le marqueur MIME depuis le package MCP qui déclare cette dépendance.

Les résultats finaux et l’installation sont consignés à la fin de ce document.

### Essai dans ce chat natif

L’outil installé `open_dbcd` a réellement été appelé avec `dbcodex-native-test.dbcd`, une copie préparée dans le répertoire d’artefacts de ce chat. Résultat : **« The project path does not exist. »** Le serveur ne voit pas ce répertoire comme une racine de projet autorisée. Ce chat est attaché au dépôt principal, pas au checkout d’implémentation. Aucun accès hors racine ni copie sur `main` n’a été utilisé pour contourner ce refus.

Il ne s’agit donc pas d’un essai réussi de rendu. Aucun test navigateur ou hôte simulé n’a été ajouté ou présenté comme acceptation native pendant cette mission. Les tests UI automatisés utilisent jsdom ; le contrôle stdio exerce le vrai serveur avec un client de test.

## Installation ou actualisation

Depuis `C:/Users/qcham/.codex/worktrees/dbcodex-workbench/dbcodex` :

```powershell
npm ci
npm run build
codex plugin marketplace add .
codex plugin add dbcodex@dbcodex-local --json
codex plugin list --marketplace dbcodex-local --json
```

Version de cette expérimentation : `0.1.0-dev.0+codex.20261009`. La compilation reste locale ; les téléchargements npm servent au développement, pas à l’exécution de l’interface.

Ouvrir ensuite **une nouvelle conversation dont le dossier de travail est le checkout d’implémentation**. Si l’application conserve les anciennes entrées, la relancer après sauvegarde des travaux en cours. Ne pas utiliser `main` pour ce parcours.

## Mode d’emploi et validation humaine

Une copie de démonstration est préparée sous `.dbcodex/native-acceptance.dbcd` dans le checkout. Les fixtures originales restent intactes. Si la copie existe déjà, elle est conservée.

1. Dans la nouvelle conversation, chercher l’entrée « Atelier DBML » du panneau de contenu. Si elle n’apparaît pas, chercher l’entrée globale « dbcodex ». Si aucune n’apparaît, demander : `Ouvre .dbcodex/native-acceptance.dbcd avec dbcodex.`
2. Dans le lanceur, saisir `.dbcodex/native-acceptance.dbcd`. Vérifier que CodeMirror, les tables React Flow et les commandes existantes sont visibles dans Codex, sans navigateur externe.
3. Ajouter un commentaire DBML, vérifier le diagramme puis enregistrer avec `Ctrl+S`. Déplacer une table, changer le zoom ou la vue et enregistrer. Fermer/réouvrir : vérifier source, historique et disposition.
4. Laisser l’éditeur ouvert et envoyer une demande dans la conversation. Vérifier que le panneau reste visible. Avec l’éditeur enregistré, demander à Codex de remplacer exactement le commentaire par `apply_dbcd_edits`. Observer le changement dans l’éditeur sous environ deux secondes, lorsque la vue est visible.
5. Modifier sans enregistrer puis demander une modification à Codex : l’outil doit refuser si le brouillon a été persisté. Si une autre version est enregistrée avant la persistance du brouillon local, l’éditeur doit afficher un conflit en gardant le texte local.
6. Tester le bouton plein écran puis le retour. Un refus explicite de l’hôte est acceptable et doit être relevé.
7. Fermer le composant juste après une saisie, puis rouvrir et vérifier la proposition de récupération. Distinguer fermeture normale et arrêt brutal.
8. Cliquer un lien vers un fichier `.dbcd` du workspace : vérifier l’association native. Si le chemin injecté par l’hôte est indisponible, utiliser le lanceur relatif ; ne pas affirmer l’association validée.
9. Changer de conversation puis revenir. Enfin, enregistrer les travaux, redémarrer Codex et relever si l’onglet réapparaît automatiquement ou nécessite une ouverture manuelle.
10. Observer les communications réseau du composant avec les moyens de diagnostic de l’hôte si disponibles. Le contrôle statique et la CSP sont validables automatiquement ; l’observation native à l’exécution reste une preuve séparée.

À transmettre pour compléter l’acceptation : version de Codex Desktop, entrées visibles, mode utilisé, résultat d’édition/sauvegarde/synchronisation/conflit, fermeture et récupération, changement de chat, redémarrage, éventuelles erreurs et captures du composant. Aucune étape non observée ne doit être marquée PASS.

## Limites restantes

- Persistance des panneaux et des onglets contrôlée par l’hôte ; pas d’API relevée garantissant une ouverture automatique au redémarrage.
- Instances distinctes par conversation ; pas de collaboration temps réel ou fusion automatique de brouillons.
- Source, présentation, vues et zoom récupérables depuis le projet ; sélection temporaire non persistée.
- File handler limité aux fichiers locaux des racines autorisées, pas aux pièces jointes distantes ni aux chemins arbitraires.
- Synchronisation par lecture toutes les deux secondes ; suspension lorsque le document est masqué. Pas de promesse de notification instantanée.
- Le flush dépend d’un teardown ordonné et d’un transport disponible. Une terminaison brutale peut perdre les changements postérieurs au dernier brouillon enregistré.
- `npm audit` a signalé des vulnérabilités dans le SDK MCP existant et `source-map-js`. Aucune mise à niveau générale n’a été faite ; ce chantier local stdio ne met pas en œuvre le flux OAuth client concerné. Ces alertes ne sont pas présentées comme corrigées.

## Résultats finaux

| Contrôle final exécuté le 9 octobre | Résultat |
| --- | --- |
| `npm ci` sur le lockfile actualisé | PASS ; 251 packages installés, 2 alertes npm de sévérité haute |
| `npm run build` | PASS — core, UI, MCP |
| `npm run typecheck` | PASS |
| `npm test` | PASS — **334 tests dans 33 fichiers**, contre 323 au départ |
| `npm run verify:offline-ui` | PASS — aucune dépendance réseau UI détectée |
| `npm run verify:mcp` | PASS — ouverture 6,7 ms, sauvegarde 7,9 ms |
| Vérification stdio du bundle installé dans le cache | PASS — ouverture 16,0 ms, sauvegarde 16,9 ms |
| `git diff --check` | PASS ; Git signale seulement la conversion LF/CRLF prévue par la configuration |
| Fixtures originales | Aucun changement suivi par Git |
| `main` | Toujours `bcd3ae2` ; seul le résumé non suivi créé avant cette mission reste présent |

Le contrôle stdio couvre les métadonnées `thread/global/file`, le lancement `{}`, la résolution de fichier avec métadonnées d’hôte, les drafts, les sauvegardes, les patchs exacts, les conflits de génération et les lectures privées de révision. Il ne mesure pas le rendu dans Codex Desktop.

Installation réussie par `codex plugin add dbcodex@dbcodex-local --json`, puis présence et activation confirmées par `codex plugin list`. Version : **`0.1.0-dev.0+codex.20261009`**, cache : `C:/Users/qcham/.codex/plugins/cache/dbcodex-local/dbcodex/0.1.0-dev.0+codex.20261009`. Le bundle de ce cache a ensuite passé le contrôle stdio complet.

**Acceptation humaine native : NON EXÉCUTÉE.** Panneau visible, plein écran, ouverture par association fichier, changement de chat et redémarrage restent à observer dans une nouvelle session sur le checkout d’implémentation. Aucun commit ni fusion n’a été créé.
