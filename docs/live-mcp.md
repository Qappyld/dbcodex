# Connexion MCP à la version portable ouverte

La passerelle donne accès au document **en mémoire** de l’application portable, sans souris, clavier ni installation de Node.js. Elle est indépendante du serveur MCP historique qui lit les fichiers `.dbcd` sur disque.

## Démarrage

Depuis PowerShell, lancez la nouvelle version portable avec :

```powershell
& 'C:\chemin\DBCodex.exe' --mcp
```

On peut aussi fournir le chemin d’un projet à ouvrir, ou ouvrir ensuite un projet dans l’application. L’application et sa fenêtre restent ouvertes normalement. Le MCP utilise **Streamable HTTP**, sur `http://127.0.0.1:31425/mcp`. Pour un autre port, ajouter `--mcp-port=31426`.

Le lanceur du portable en fichier unique ne relaie pas stdout : **ne pas configurer cet EXE comme un serveur MCP stdio**. Le client doit accepter Streamable HTTP et un en-tête d’authentification. Un client exécuté sur un autre ordinateur ou dans le cloud ne peut pas joindre cette adresse locale directement. Cette livraison ne fournit pas de tunnel distant.

## Paramètres de connexion

Au premier démarrage, DBCodex crée une clé dans le profil Windows de l’utilisateur. Au démarrage avec `--mcp`, il écrit les paramètres correspondants dans :

```text
%USERPROFILE%\.dbcodex\live\<identifiant>.json
```

Le JSON contient `applicationRoot`, `url` et `httpHeaders.Authorization`. Choisir celui dont `applicationRoot` correspond au dossier de l’EXE. Reporter l’URL et l’en-tête dans la connexion MCP du client. Ces fichiers contiennent une clé privée locale : ne pas les joindre à une conversation ni les committer.

La clé et le chemin du canal sont propres à l’utilisateur et au dossier de l’application. Renommer l’EXE dans ce dossier conserve la connexion. Déplacer l’EXE dans un autre dossier crée une autre connexion ; reprendre le nouveau JSON. Pour changer de poste, démarrer DBCodex avec `--mcp` et configurer le client sur ce poste.

Le service écoute uniquement sur `127.0.0.1`, exige `Authorization: Bearer …`, vérifie l’en-tête Host et refuse les requêtes portant un Origin de navigateur. Les fichiers de clé héritent des permissions du profil Windows ; sur les systèmes Unix, ils sont créés avec des permissions privées. Le canal interne utilise aussi la clé.

## Outils

| Outil | Usage |
| --- | --- |
| `list_live_dbcd_sessions` | Lister les fenêtres avec un projet chargé : identifiant de session, chemin, lecture seule. Aucun contenu du schéma. |
| `read_live_dbcd_session` | Lire explicitement la source courante, modifications non enregistrées comprises, la présentation, le graphe, les diagnostics, les révisions résumées et la sélection. |
| `navigate_live_dbcd_session` | Sélectionner et centrer une table, une colonne ou une relation visible, par son identifiant du graphe. |

Commencer par lister les sessions ; ne pas deviner leur identifiant. Lire ensuite la session choisie par l’utilisateur, puis utiliser les identifiants du graphe pour naviguer. Lire une session transmet son contenu à l’assistant et à son fournisseur.

La source est celle de l’éditeur au moment de la demande. Le graphe peut être la dernière structure valide : vérifier `validating`, `graphIsLastValid` et les diagnostics. Une récupération de brouillon en attente est signalée par `recovery` ; le contenu du brouillon non repris n’est pas présenté comme le document courant.

La navigation ne change ni le DBML, ni les vues, ni la disposition enregistrée. Une cible masquée, située hors de la vue courante ou dans un groupe replié est refusée. Le retour `accepted` confirme la transmission de la sélection ; le rendu et le cadrage s’effectuent ensuite dans React. Relire la session pour vérifier sa sélection.

## Limites de cette livraison

- La passerelle est en lecture et navigation. Elle n’expose pas d’écriture en mémoire, d’enregistrement, de restauration ou de suppression.
- Les outils historiques `update_dbcd` et `apply_dbcd_edits` restent séparés : ils agissent sur les fichiers et conservent leurs protections contre les brouillons et conflits.
- Plusieurs fenêtres du même processus sont prises en charge. Pour des processus distincts, utiliser des copies dans des dossiers différents et des ports distincts. Un second processus dans le même dossier ne vole pas la connexion du premier ; démarrer la première instance avec `--mcp`.
- Une version déjà lancée avant cette évolution doit être fermée normalement puis remplacée et relancée pour charger le nouveau code. Ne pas fermer un projet contenant des modifications sans les conserver.
- Fermer l’application arrête la connexion. Le JSON conservé n’indique pas que le serveur est encore actif.

## Vérification de développement

`packages/mcp/test/live-session.test.ts` vérifie le canal local et le transport HTTP avec un vrai client MCP, l’authentification et les refus. `packages/ui/test/DbcdWorkbench.test.tsx` vérifie la lecture de l’état en mémoire et la navigation sans appel d’écriture. `scripts/check-live-portable.mjs <exe>` vérifie un EXE portable copié dans un dossier temporaire, sur un projet de démonstration ; il ne se connecte pas aux fenêtres utilisateur.
