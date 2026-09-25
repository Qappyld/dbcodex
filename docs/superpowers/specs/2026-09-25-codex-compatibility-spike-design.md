# Prototype de compatibilité Codex — conception

## Statut

- **Date :** 25 septembre 2026.
- **Validation utilisateur :** architecture, flux de données, gestion des erreurs, tests et critères de sortie approuvés.
- **Portée :** jalon zéro précédant la V1 de dbcodex.
- **Décisions différées :** licence open source et canal de distribution.

## Objectif

Prouver qu'un plugin local peut ouvrir un fichier DBML du workspace, afficher un diagramme interactif directement dans Codex, déplacer une table et restaurer sa position après rechargement. Le prototype doit fonctionner sans réseau et sans modifier le fichier DBML.

Le prototype est réussi uniquement si l'expérience interactive est rendue dans Codex. Une application ouverte dans un navigateur externe ou un SVG statique ne satisfait pas ce critère.

## Portée du prototype

### Inclus

- installation locale d'un plugin Codex de développement ;
- serveur MCP local connecté par `stdio` ;
- ouverture d'un fichier `.dbml` situé dans le workspace ;
- parsing avec `@dbml/core` en mode `dbmlv2` ;
- représentation minimale des tables, colonnes et relations ;
- interface React rendue par MCP Apps dans Codex ;
- diagramme SVG avec déplacement des tables ;
- sauvegarde et restauration des positions dans un sidecar local ;
- diagnostics explicites et résultats structurés ;
- fonctionnement hors ligne et absence de télémétrie ;
- tests unitaires, de contrat, d'intégration, d'interface et validation réelle dans Codex.

### Exclus

- édition ou sauvegarde du texte DBML ;
- édition structurelle depuis le diagramme ;
- couverture visuelle complète des groupes, notes, vues, lignage, métadonnées et `Records` ;
- recherche, filtres, auto-layout et export PNG/SVG de production ;
- historique et restauration Git ;
- publication du plugin ;
- choix du moteur graphique définitif de la V1.

Les syntaxes DBML hors du sous-ensemble rendu restent analysées par le parseur lorsque celui-ci les prend en charge, mais le prototype ne les réécrit jamais.

## Approches comparées

Trois architectures ont été comparées dans le registre des décisions : plugin local avec skill, MCP et UI ; skill avec CLI et navigateur autonome ; MCP HTTPS distant avec UI. Le choix validé est le plugin local-first avec MCP `stdio` et UI intégrée. Il conserve les données sur la machine, crée une frontière testable entre Codex et le modèle, et vérifie directement le risque principal : le rendu interactif dans Codex.

Le prototype utilise un SVG React et des interactions natives plutôt qu'un moteur de graphe. Ce choix réduit le nombre de variables pendant le test de compatibilité. Le moteur de production sera comparé seulement après la réussite du jalon.

## Architecture

Le dépôt devient un workspace npm TypeScript comprenant quatre unités indépendantes :

1. **Plugin** — manifeste portable `plugin.json`, skill dbcodex et déclaration portable `mcp.json` pour lancer le serveur local. Le format de compatibilité `.codex-plugin/plugin.json` / `.mcp.json` n'est pas utilisé par le nouveau projet.
2. **Core** — contrats du modèle `SchemaGraph`, adaptateur `@dbml/core`, diagnostics, politique de chemins et stockage des dispositions.
3. **MCP** — outils locaux, ressource UI et traduction entre contrats MCP et core.
4. **UI** — application React/Vite autonome, sans accès direct au système de fichiers, rendue dans la surface MCP Apps.

Les dépendances sont orientées vers le core : la UI et le serveur MCP consomment ses contrats publics, mais le core ne dépend ni de React ni du transport MCP.

## Contrats principaux

### `open_dbml`

Entrée : chemin relatif au workspace. Le serveur résout le chemin, vérifie qu'il reste sous la racine autorisée, lit le texte puis appelle l'adaptateur DBML.

Sortie structurée :

- identifiant et chemin relatif du document ;
- tables, colonnes et relations normalisées ;
- diagnostics avec niveau, message et localisation lorsqu'elle est disponible ;
- positions restaurées pour la vue système `View All` ;
- URI de la ressource UI associée.

Le contenu de `Records` n'est jamais transmis à l'interface du prototype.

### `save_layout`

Entrée : chemin relatif du document, nom de vue, identifiant de table, coordonnées finies `x` et `y`.

Le serveur revalide le chemin et l'identifiant, fusionne la position dans le sidecar puis effectue une écriture atomique. La sortie confirme la version du format et la position enregistrée.

### `SchemaGraph`

Le modèle minimal contient des identifiants canoniques, noms de schéma/table, colonnes, marqueurs de clé et relations avec cardinalités. Les détails propres à `@dbml/core` restent confinés à l'adaptateur afin de pouvoir remplacer le parseur sans modifier la UI.

## Persistance des dispositions

Pour un fichier `schemas/main.dbml`, le sidecar est `.dbcodex/layouts/schemas/main.dbml.layout.json`. Il est relatif à la racine du workspace et ne peut jamais sortir de `.dbcodex/layouts`.

Format initial :

```json
{
  "version": 1,
  "source": "schemas/main.dbml",
  "views": {
    "View All": {
      "nodes": {
        "public.users": { "x": 120, "y": 80 }
      }
    }
  }
}
```

Les clés sont triées avant écriture et aucun horodatage n'est stocké, afin de produire des diffs Git stables. Une table renommée perd sa position dans ce prototype ; la stratégie de migration d'identité appartient à la conception de la V1.

L'écriture se fait dans un fichier temporaire adjacent, suivie d'un remplacement atomique. En cas d'échec, l'ancien sidecar reste intact.

## Flux d'exécution

1. L'utilisateur demande l'ouverture d'un fichier DBML dans Codex.
2. Codex appelle `open_dbml` sur le serveur MCP local.
3. Le serveur applique la politique de chemins, lit le fichier et le transmet à l'adaptateur.
4. L'adaptateur produit `SchemaGraph` et les diagnostics sans réécrire la source.
5. Le serveur charge les positions du sidecar et renvoie le résultat structuré avec la ressource UI.
6. Codex affiche l'interface MCP Apps.
7. La UI rend le graphe SVG et applique les positions connues.
8. À la fin d'un déplacement, la UI appelle `save_layout`.
9. Le serveur enregistre la position et confirme la nouvelle valeur.
10. Un rechargement complet doit reproduire la même disposition.

## Gestion des erreurs

- **DBML invalide :** renvoyer les diagnostics disponibles et ne rien écrire.
- **Fichier absent :** signaler le chemin relatif demandé sans exposer d'autres fichiers du système.
- **Chemin absolu ou traversée de répertoire :** refuser avant toute lecture.
- **Import hors workspace :** refuser la résolution et identifier l'import concerné.
- **Sidecar absent :** utiliser une disposition initiale déterministe.
- **Sidecar invalide :** avertir, ignorer son contenu et ne pas l'écraser lors de l'ouverture.
- **Position invalide :** refuser les valeurs non finies ou les identifiants inconnus.
- **Échec d'écriture :** conserver le sidecar précédent et afficher un diagnostic exploitable.
- **UI non rendue dans Codex :** déclarer le jalon non concluant et documenter la capacité manquante ; ne pas substituer automatiquement un navigateur externe.
- **Crash du parseur ou du serveur :** convertir l'échec en erreur MCP stable sans inclure le texte DBML dans les journaux.

## Sécurité et confidentialité

- aucune requête réseau nécessaire au parsing, au rendu ou à la persistance ;
- aucune télémétrie ;
- chemins relatifs uniquement et vérification après résolution canonique ;
- imports limités à la racine du workspace ;
- contenu DBML absent des logs par défaut ;
- valeurs de `Records` exclues du contrat UI ;
- texte et libellés rendus comme contenu, jamais injectés comme HTML ;
- politique de contenu de l'interface interdisant les ressources distantes.

## Interface du prototype

La surface contient une barre compacte avec le nom du fichier, le statut de validation et une commande de recentrage. Le diagramme occupe le reste de l'espace. Les tables sont des groupes SVG focalisables avec un titre et une liste courte de colonnes ; les relations sont tracées derrière elles.

Le déplacement fonctionne au pointeur et au clavier. Le focus est visible, les états ne reposent pas uniquement sur la couleur et la palette s'adapte aux thèmes clair et sombre de l'hôte. Le prototype ne comprend pas de panneau latéral, de minimap ou d'éditeur texte.

## Stratégie de tests

Le développement suit une boucle TDD. Chaque comportement du core et du serveur commence par un test en échec, puis l'implémentation minimale le fait passer.

### Tests unitaires

- acceptation et refus des chemins ;
- transformation vers `SchemaGraph` ;
- validation des coordonnées ;
- sérialisation déterministe du sidecar ;
- conservation de l'ancien fichier en cas d'échec simulé.

### Tests de contrat MCP

- initialisation du serveur `stdio` ;
- schémas d'entrée et de sortie des deux outils ;
- association de `open_dbml` à la ressource UI ;
- conversion stable des erreurs internes en erreurs MCP.

### Tests d'intégration

- fixture valide avec au moins trois tables et deux relations ;
- syntaxe invalide ;
- fichier et import absents ;
- traversée de répertoire ;
- sidecar absent, valide puis corrompu ;
- sauvegarde suivie d'une réouverture reproduisant les coordonnées.

### Tests de l'interface

- rendu des tables et relations ;
- déplacement au pointeur et au clavier ;
- appel de `save_layout` en fin de déplacement ;
- diagnostics visibles et accessibles ;
- focus, contraste, thèmes clair/sombre et absence de dépendance exclusive à la couleur ;
- aucune requête réseau pendant le parcours.

### Validation dans Codex

Le test décisif est exécuté avec le plugin installé localement dans Codex : ouvrir la fixture, déplacer une table, fermer la surface, la rouvrir et constater la restauration exacte. Ce contrôle réel complète les tests automatisés du bridge et de la UI.

Sur la fixture de référence, l'ouverture interactive doit prendre moins de deux secondes après l'appel de l'outil et aucune interaction ne doit produire de tâche bloquante supérieure à 100 ms. Les mesures et la version de Codex sont consignées avec le résultat du jalon.

## Critères de sortie

Le jalon est réussi lorsque tous les contrôles automatisés passent et que le parcours réel fonctionne dans Codex, hors ligne, avec persistance exacte de la position. La preuve comprend les sorties de tests, la configuration utilisée et le résultat du test manuel Codex.

Si Codex ne rend pas la ressource interactive locale ou empêche le rappel d'outil depuis la UI, le jalon échoue. L'équipe documente alors le point de rupture et réévalue uniquement les surfaces officiellement prises en charge dans Codex avant de planifier la V1.

## Suite après réussite

La réussite autorise la conception puis l'implémentation de la V1 complète. Le prototype fournit les contrats et la preuve d'intégration, mais ne décide pas à lui seul du moteur de graphe, de l'éditeur, du modèle complet ni de la stratégie de round-trip.
