# dbcodex

`dbcodex` est un prototype de plugin Codex local pour ouvrir, valider et visualiser des fichiers DBML sans envoyer leur contenu à un service externe. Son interface SVG permet de déplacer les tables et conserve leur position dans un sidecar déterministe sous `.dbcodex/layouts/`.

## Développement local

Prérequis : Node.js 20.19 ou plus récent et une version de Codex prenant en charge les plugins et MCP Apps.

```powershell
npm ci
npm run build
npm run typecheck
npm test
codex plugin marketplace add .
codex plugin add dbcodex@dbcodex-local
```

Après une installation ou une modification du plugin, ouvrez une nouvelle tâche Codex dans le dépôt puis demandez : `Ouvre fixtures/basic.dbml avec dbcodex.`

## Portée actuelle

- lecture de fichiers `.dbml` relatifs à l’espace de travail ;
- diagramme interactif intégré à Codex via MCP Apps ;
- déplacement au pointeur ou au clavier ;
- persistance atomique des positions, sans modification du DBML ;
- aucune dépendance réseau dans l’interface.

Ce dépôt est un prototype de compatibilité, pas encore une version publique. La licence et le mode de distribution seront choisis ultérieurement.
