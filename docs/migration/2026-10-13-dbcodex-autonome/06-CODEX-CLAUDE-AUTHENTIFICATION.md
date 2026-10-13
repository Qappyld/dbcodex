# Codex, Claude Code et authentification

## Fonctionnement attendu

DBCodex possède sa propre interface de chat. Elle échange avec un moteur local :
- Codex app-server pour Codex ;
- Claude Code programmatique ou Agent SDK pour Claude.

Les moteurs peuvent être démarrés par DBCodex. Leur fenêtre desktop n’a pas besoin de rester ouverte. Installation, connexion authentifiée et accès Internet aux modèles sont nécessaires. L’éditeur doit rester utilisable hors ligne sans assistant.

MCP peut fournir des outils contrôlés ; il ne remplace pas le transport de conversation.

## Abonnement et frais : ne pas promettre trop

Pour le chemin « Sign in with ChatGPT » dans une application tierce, la documentation consultée le 13 octobre cite explicitement les utilisateurs Plus et Pro éligibles. L’usage partage les limites du compte. Business inclut Codex, mais son usage par ce chemin tiers n’a pas été confirmé dans cette conversation. Ne pas présenter l’ensemble des offres comme interchangeables.

Les connexions app-server d’applications locales/open source et le flux Sign in with ChatGPT doivent être distingués. Revalider les conditions au moment de l’implémentation et de la distribution. Le login ne doit pas être construit en recopiant des fichiers de tokens ni en utilisant un endpoint non documenté.

Pour Claude, les documents consultés indiquent l’authentification de Claude Code par les offres Pro/Max et Team/Enterprise, et l’usage du SDK/programmatique avec les limites d’abonnement à cette date. Les règles d’organisation et les conditions peuvent évoluer. Vérifier la méthode effectivement active : une clé API dans l’environnement peut changer le mode de facturation.

Une clé API ne doit pas être imposée. Un mode API peut être ajouté volontairement, avec affichage clair de la facturation distincte. Aucune consommation additionnelle silencieuse pour contourner un quota.

## Installation et diagnostic

Afficher séparément :
- moteur absent ;
- moteur trouvé, version connue ;
- connexion absente/expirée ;
- compte connecté ;
- accès au modèle refusé ;
- quota atteint ;
- requête en cours ou interrompue.

La simple présence d’un exécutable ne prouve pas une session valide ni un droit à un modèle.

Sur le poste actuel, Codex CLI a été observé en version 0.162.0-alpha.2 ; la commande résolvait un exécutable natif sous AppData/Local/OpenAI/Codex/bin. Claude Code n’a pas été trouvé. Ce sont des observations locales antérieures, pas des chemins à coder en dur.

## Adaptateur Codex

Prévoir handshake, démarrage/reprise de discussion, envoi de tour, messages progressifs, annulation et fin de session. Générer ou contrôler les schémas compatibles avec la version installée ; ne pas se fier uniquement à un exemple de documentation plus récent.

Les schémas avaient été générés sous .dbcodex/codex-protocol/v2 ; ce répertoire ignoré n’est pas nécessaire au dossier source et peut être régénéré.

Les mécanismes de désactivation d’outils doivent être vérifiés. Une option shell désactivé ne prouve pas à elle seule qu’apply_patch, les MCP hérités ou une autre capacité ne peuvent pas écrire. Refuser toute demande d’élévation et tester les accès réels au projet.

## Adaptateur Claude

Utiliser un mode programmatique documenté avec réponses structurées/progressives, reprise et interruption. Le SDK et le CLI ne doivent pas recevoir de permission d’écriture du projet pendant le chat.

Les options de restriction d’outils, les logins et les différences entre compte d’abonnement et Console doivent être testés avec la version installée. DBCodex n’installe pas Claude ni ne choisit une clé API silencieusement.

## Données partagées

Une requête envoie uniquement le message, l’historique autorisé de cette discussion et le contexte présenté à l’utilisateur. Les providers ne reçoivent pas implicitement toutes les conversations d’un projet.

Ne stocker aucun token fournisseur dans le .dbcd, dans les messages ou dans les journaux. Ne pas réutiliser une réponse du mauvais fournisseur/discussion après changement de projet.

## Sources officielles à reconsulter

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Sign in with ChatGPT — intégration](https://developers.openai.com/siwc/quickstart)
- [Sign in with ChatGPT — fonctionnement utilisateur](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)
- [Claude Code — authentification](https://code.claude.com/docs/en/authentication)
- [Claude Code — mode programmatique](https://code.claude.com/docs/en/headless)
- [Claude Agent SDK et abonnement](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)

La disponibilité technique, les conditions d’utilisation et la facturation sont trois vérifications distinctes. Ne pas interpréter ce dossier comme une garantie permanente de gratuité ou de compatibilité.

