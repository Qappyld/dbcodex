# Risques, arbitrages techniques et limites

## Points à résoudre pendant l’audit, sans refaire la découverte produit

### Fichier unique et compatibilité

La préférence est un .dbcd contenant les discussions. Il faut prouver la migration v1 et le comportement des anciens clients. Le code compagnon partiel peut fournir des idées, mais ne définit pas la cible.

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

Le store actuel comporte un seul brouillon. Plusieurs discussions ne signifient pas plusieurs éditeurs indépendants. Fixer un éditeur actif par projet en V1, ou concevoir explicitement une isolation de brouillons.

### Interruption et quotas

Les processus doivent être annulables et nettoyés. Aucun redémarrage automatique de requête susceptible de consommer le quota. Préserver messages/propositions et expliquer le résultat.

### SQLite embarqué

Tester le module de stockage avec le runtime choisi pour l’application et les binaires empaquetés. La présence de node:sqlite dans le Node de développement n’est pas une preuve pour un autre runtime.

### Packaging

Portable ou installateur sont des options à choisir après le prototype fonctionnel. Les signatures, mises à jour, associations de fichiers et désinstallation demandent une validation dédiée ; elles ne sont pas garanties par l’installation d’Electron.

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

