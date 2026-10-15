# Routage et lisibilité des relations

Date : 13 octobre 2026.
Statut : périmètre validé puis implémenté sur autorisation explicite ; portable Windows livré localement. Voir ../../evidence/relation-routing-2026-10-13.md pour la validation et les limites.

## Objectif et parcours

Permettre de suivre une relation jusqu'à ses deux champs, puis de corriger son trajet par manipulation directe. Surface : atelier de diagramme existant. Référence d'interaction : dbdiagram, étudié sur son diagramme de démonstration. La comparaison visuelle doit se faire à zoom et taille de fenêtre identiques.

L'utilisateur sélectionne une relation, déplace une portion ou crée un détour, puis conserve ce tracé dans la vue courante. Annulation et retour au routage automatique constituent les chemins de récupération. L'interface reste compacte et utilise « relation », « tracé » et « routage automatique ».

Cette spécification précise les choix de la conversation. Les paramètres chiffrés (espacement, rayon, seuils de zoom et aimantation) seront ajustés lors de la validation visuelle. Aucune bibliothèque ni architecture d'implémentation n'est imposée.

## Référence observée et choix DBCodex

Observé dans dbdiagram : déplacement perpendiculaire d'un segment par son rond creux ; création d'un détour par un point intermédiaire ; ajout de coudes pour maintenir le raccordement à un champ ; disparition de coudes en ramenant un segment à l'alignement ; changement de côté de sortie ; réinitialisation d'un tracé.

La stabilité, la persistance, les croisements explicites, les aides d'alignement, le mode de lecture et la politique du bouton automatique décrits ci-dessous sont des décisions pour DBCodex. Leur présence dans dbdiagram n'a pas été vérifiée.

## Géométrie et calcul automatique

- Traits orthogonaux, avec angles légèrement arrondis.
- Extrémités attachées aux champs concernés, avec une courte sortie et entrée horizontale.
- Priorités de calcul : éviter les tables ; éviter les portions superposées ; réduire les croisements ; espacer les segments parallèles ; limiter les coudes et la longueur.
- Si les contraintes ne peuvent toutes être satisfaites, préserver la lisibilité des extrémités et choisir le trajet le moins ambigu. L'absence de tout croisement n'est pas une garantie.
- Prévoir des passages entre les tables et entre les groupes. Les fonds de groupe ne constituent pas des obstacles ; éviter les titres de groupe.
- Chaque relation conserve son identité et sa propre voie. Les relations multiples entre deux tables suivent un ordre cohérent avec leurs champs pour limiter les croisements.
- Le routage ne déplace pas les tables. La réorganisation des tables reste une action distincte.
- Un croisement présente un petit pont visuel sur l'un des traits, choisi de façon déterministe. Il ne doit jamais évoquer une jonction.

## Sélection, survol et lecture

- Au repos : traits fins, couleurs moins saturées que les en-têtes, cardinalités discrètes mais lisibles ; aucune poignée.
- Au survol d'une relation : renforcer tout son chemin et ses deux champs ; atténuer légèrement les autres relations.
- Au clic : conserver la mise en évidence et afficher ses commandes de manipulation.
- Un clic dans le fond quitte la sélection et masque les poignées.
- Sélectionner une table met en évidence ses relations et ses voisines directes ; les autres éléments restent visibles, atténués. Ce mode temporaire ne modifie ni la visibilité enregistrée ni la disposition.
- La mise en évidence ne repose pas uniquement sur la couleur : contraste et épaisseur la rendent perceptible.
- À faible zoom, masquer les détails secondaires et les commandes trop denses. À zoom rapproché, donner priorité aux champs et cardinalités. Une relation sélectionnée reste identifiable à chaque zoom.

## Manipulation directe

- Une poignée principale au milieu d'un segment suffisamment long permet de le déplacer perpendiculairement à son axe.
- Des petits points intermédiaires permettent de créer un détour par glissement. Ils sont des commandes d'insertion, pas une collection de coudes obligatoires.
- Le chemin est prévisualisé pendant le geste. Les portions voisines s'adaptent et les extrémités restent attachées aux mêmes champs.
- Une sortie peut changer de côté gauche/droit en conservant le champ concerné ; le geste ne change pas la relation métier.
- Les coudes nécessaires apparaissent automatiquement ; les portions alignées fusionnent et les segments nuls disparaissent.
- Le nombre de poignées dépend du tracé et de la place disponible. Éviter les poignées superposées sur les portions courtes.
- Les poignées restent petites visuellement ; leur zone de saisie est plus large et stable en pixels écran. Le curseur indique l'axe du déplacement.
- Une aimantation douce aide à aligner les segments tout en maintenant l'espacement entre relations ; un repère temporaire signale l'alignement. Ne pas attirer deux relations sur la même voie.
- Permettre de désactiver temporairement l'aimantation par un modificateur clavier, à préciser lors de l'implémentation.
- Prévoir l'accès clavier aux poignées, leur déplacement avec les flèches et une description accessible de leur fonction.
- Échap annule le geste en cours ; un glissement terminé constitue une seule action d'annulation/rétablissement.

## Stabilité et sauvegarde

- Un tracé modifié explicitement devient manuel ; les autres restent automatiques.
- Sauvegarder les tracés et leur état manuel/automatique dans la présentation de la vue, avec le cycle existant de brouillon et d'enregistrement du projet. Ne pas modifier le texte DBML.
- Réouverture et changement de vue retrouvent les tracés enregistrés de chaque vue.
- Déplacer une table adapte d'abord les portions proches de ses raccordements, puis préserve les détours manuels autant que possible. Les relations non concernées restent stables.
- Pour les chemins automatiques, préférer une adaptation locale ; éviter les changements brusques de voie pour des déplacements mineurs.
- Si une table déplacée rend un chemin manuel impossible, adapter le minimum nécessaire sans abandonner silencieusement son état manuel.
- Un échec du calcul laisse le dernier tracé valide disponible et permet une nouvelle tentative.

## Bouton en haut et récupération

Conserver « Routage automatique » en haut du diagramme. Sa portée doit être explicite dans son aide et ses options.

- Sans relation sélectionnée, l'action principale recalcule les relations automatiques de la vue, en conservant les tracés manuels.
- Avec une relation sélectionnée, l'action principale réinitialise cette relation et la remet en mode automatique. L'aide indique « Recalculer la relation sélectionnée ».
- Une option explicite « Recalculer toutes les relations, y compris les tracés manuels » remet toutes les relations concernées en mode automatique.
- Toutes ces actions conservent les positions des tables et sont annulables en une seule étape, y compris la restauration des états manuels.
- En lecture seule, la lecture et la mise en évidence restent disponibles ; les commandes de modification sont désactivées ou masquées selon les conventions de l'atelier.

## Critères d'acceptation

1. Sur le même modèle et au même zoom, suivre une relation ne nécessite pas de deviner sa destination après une portion commune.
2. Tirer un segment vertical le déplace horizontalement ; tirer un segment horizontal le déplace verticalement.
3. Tirer la première portion horizontale vers le haut crée les coudes nécessaires sans détacher le champ. La ramener à sa hauteur initiale simplifie le trajet.
4. Tirer un point intermédiaire ajoute un détour et les poignées adaptées ; les portions courtes ne produisent pas de commandes qui se recouvrent.
5. Deux relations parallèles restent distinctes ; un croisement n'est jamais présenté comme une connexion.
6. Le survol révèle la relation complète et ses deux champs. La sélection d'une table permet de lire son voisinage sans changer la vue enregistrée.
7. Déplacer légèrement une table ne modifie pas les chemins indépendants et conserve les détours manuels valides.
8. Enregistrer puis rouvrir le projet retrouve les tracés par vue ; le DBML reste identique.
9. Le bouton automatique conserve les chemins manuels par défaut hors sélection ; son option globale peut les remplacer. Annuler restaure exactement les chemins et états précédents.
10. Vérifier les relations multiples, autoréférences, tables très proches, champs masqués, zoom faible/fort, sélection clavier et lecture seule. Un champ masqué conserve un raccordement identifiable selon la convention de détail du diagramme.

## Ordre de réalisation futur

Tout le périmètre ci-dessus a été retenu. L'ordre prévu était : géométrie et séparation des chemins ; manipulation et stabilité ; sauvegarde et récupération ; lecture, zoom, alignement assisté et finition visuelle. La phase de spécification a été suivie d'une autorisation explicite d'implémentation et de déploiement local dans la même conversation.
