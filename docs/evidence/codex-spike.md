# Preuve de compatibilité Codex — prototype dbcodex

Date : 25 septembre 2026

## Environnement

- Codex CLI : `0.155.0-alpha.16.4`
- Plugin installé : `dbcodex@dbcodex-local`, version `0.1.0-dev.0+codex.20260925133941`
- Système : Microsoft Windows 11 Professionnel `10.0.26200` (build 26200)
- Node.js : `v24.13.1`
- npm : `11.8.0`
- Fixture : `fixtures/basic.dbml`

## Résultats observés

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| Validation du manifeste Codex | PASS | Le validateur `plugin-creator` accepte `.codex-plugin/plugin.json`. |
| Installation locale | PASS | `codex plugin add dbcodex@dbcodex-local --json` installe et active le plugin. |
| Démarrage MCP depuis le cache Codex | PASS | Handshake stdio, liste des outils et ressource MCP Apps validés depuis le chemin installé. |
| Appel par une nouvelle session Codex | PASS | `codex exec --ephemeral` a appelé `dbcodex.open_dbml` et obtenu 3 tables et 2 relations sans commande shell. |
| Ressource UI | PASS automatisé | URI `ui://dbcodex/diagram-v1.html`, MIME `text/html;profile=mcp-app`, HTML autonome et CSP sans domaine autorisé. |
| Ouverture MCP installée | PASS | 26,0 ms, budget inférieur à 2 s. |
| Sauvegarde MCP installée | PASS | 8,9 ms, budget inférieur à 100 ms. |
| Persistance | PASS automatisé | `public.posts` sauvegardée à `{ x: 170, y: 130 }`, puis retrouvée exactement après réouverture. |
| Dépendances UI distantes | PASS statique | `verify:offline-ui` ne trouve aucun `src`/`href` distant, `fetch`, XHR, WebSocket ou EventSource. |
| Rendu dans Codex desktop | NON EXÉCUTÉ | Le plugin a été installé après le démarrage de la tâche courante ; une nouvelle tâche desktop est nécessaire. |
| Glisser-déposer dans Codex desktop | NON EXÉCUTÉ | Couvert par test de composant, mais pas encore observé dans l’hôte desktop réel. |
| Observation réseau pendant l’interaction | NON EXÉCUTÉ | La CSP et le bundle sont hors ligne, mais une observation runtime desktop reste requise. |
| Plus longue tâche UI desktop | NON MESURÉ | Impossible à mesurer sans rendu dans une nouvelle tâche desktop. |

## Incident d’empaquetage corrigé

Le premier essai Codex chargeait le skill mais fermait le serveur MCP au handshake. La copie en cache ne matérialisait pas la jonction npm workspace `@dbcodex/core`. Le serveur est désormais livré comme bundle Node autonome. Un pont ESM explicite fournit `require` et `__filename` au module CommonJS `write-file-atomic`. Le même vérificateur MCP passe maintenant depuis le dossier installé par Codex, y compris la sauvegarde atomique.

## Verdict

**FAIL — barrière de compatibilité desktop encore fermée.** Aucun défaut MCP restant n’est connu, mais le verdict ne peut devenir PASS qu’après observation du diagramme interactif dans une nouvelle tâche Codex desktop, déplacement de `public.posts`, réouverture et contrôle réseau runtime.

Commande d’acceptation restante : `Ouvre fixtures/basic.dbml avec dbcodex.`
