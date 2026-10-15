# Risques, arbitrages techniques et limites

## Points à résoudre pendant l’audit, sans refaire la découverte produit

### Fichier unique et compatibilité

Le fichier unique .dbcd contenant toutes les données du projet, dont les discussions et propositions, est confirmé. Il faut prouver la migration v1 et le comportement des anciens clients. Le code compagnon partiel peut fournir des idées, mais ne définit pas la cible.

### Patchs et contexte restreint

Le modèle reçoit par défaut une structure filtrée, pas le texte complet. Des patchs exacts nécessitent parfois des fragments supplémentaires. Concevoir une transformation locale par opérations ciblées ou demander explicitement un fragment. Interdire la sérialisation intégrale du DBML qui détruirait les commentaires.

### Permissions des moteurs

Certaines options de Codex/Claude dépendent de leur version. Une sandbox lecture seule et le retrait du shell ne remplacent pas une vérification de tous les outils et MCP hérités. Le projet réel ne doit pas être implicitement accessible en écriture.

### Authentification et offre d’abonnement

Plus/Pro, Business, compte Claude et Console API ne doivent pas être confondus. Détecter le mode actif et présenter ce qui est réellement disponible. Les conditions de distribution d’une application intégrant ces moteurs doivent être revalidées avant publication.

### Conversation longue

Définir pagination, limites, recherche et éventuel résumé de contexte. Garder le transcript local original. Une synthèse envoyée doit être identifiable ; ne pas annoncer une mémoire exhaustive si le contexte a été réduit.

### Modifications graphiques

La V1 peut limiter les propositions IA à la structure du modèle. Si positions, vues ou groupes sont proposés, les différencier du texte DBML et inclure leur état de base dans les vérifications. Ne pas annuler une disposition récente pour appliquer un changement de colonne.

### Brouillons et fenêtres multiples

Le store actuel comporte un seul brouillon. Plusieurs projets simultanés sont autorisés, avec une seule fenêtre éditable par projet. Les ouvertures supplémentaires sont en lecture seule. Spécifier le verrou entre instances, sa libération après arrêt et le transfert explicite du droit d’édition. Plusieurs discussions ne créent pas plusieurs éditeurs indépendants.

### Interruption et quotas

Les processus doivent être annulables et nettoyés. Aucun redémarrage automatique de requête susceptible de consommer le quota. Préserver messages/propositions et expliquer le résultat.

### SQLite embarqué

Tester le module de stockage avec le runtime choisi pour l’application et les binaires empaquetés. La présence de node:sqlite dans le Node de développement n’est pas une preuve pour un autre runtime.

### Packaging

La distribution locale portable en ZIP, sans installation ni droits administrateur, a été validée le 13 octobre 2026. Elle doit être démontrée sur un poste sans dépendances de développement. Les emplacements de données, le remplacement du dossier et la compatibilité SQLite embarquée demandent une validation dédiée. Les moteurs Codex/Claude et leur authentification doivent être qualifiés séparément sous compte standard. Les politiques d’entreprise peuvent bloquer l’exécution ou le réseau ; aucun contournement n’est prévu. Les signatures, mises à jour et associations de fichiers restent à qualifier ; l’association .dbcd n’est pas un prérequis.

### Répertoire portable synchronisé et préférences

Le thème et les projets récents sont conservés dans le répertoire portable, avec chemins relatifs lorsque possible. La validation doit couvrir OneDrive, les fichiers non disponibles localement, les préférences absentes/invalides et les permissions d’écriture. Définir le schéma versionné de préférences, le repli local et la coordination de leurs mises à jour entre instances. La disponibilité et le comportement sous synchronisation ne sont pas encore démontrés.

Le contrôle d’une seule fenêtre éditable sur le poste ne prouve pas une exclusion entre deux PC. Ne pas annoncer une édition simultanée sûre du même .dbcd par synchronisation : préciser le parcours de fermeture/reprise sur un autre poste et tester les conflits. Aucun verrou local ni copie en conflit ne doit être interprété comme une autorisation d’écraser un fichier distant.

## Décisions différées historiques

Licence open source et mode de distribution n’ont pas été définitivement choisis. Ne pas ajouter une licence par défaut ni annoncer une release publique.

## Points de dette conservés

Les alertes de dépendances connues, la couverture DBML exhaustive, les exports PNG/SVG et l’acceptation native de l’ancien plugin ne disparaissent pas. Ils ne doivent pas envahir la migration autonome ni être déclarés résolus.

## Ce qui n’est pas demandé

Aucun abonnement facturé par DBCodex, service cloud de stockage, télémétrie implicite, publication automatique ou capacité IA d’exécuter librement des commandes sur le poste. Toute évolution correspondante serait un nouveau choix produit.

## Priorité des arbitrages

1. Préservation et frontière d’écriture.
2. Format et migration.
3. Fenêtre réellement fonctionnelle.
4. Chat puis propositions.
5. Packaging.
6. Extension des fonctionnalités.

Présenter une difficulté concrète et une recommandation quand un choix manque. Ne pas redemander la permission pour chaque détail réversible déjà dans la mission, mais ne pas transformer une demande de spécification en autorisation de développer.

