# Livraison du routage — 13 octobre 2026

## Résultat

La version Windows portable sous release/DBCodex-win32-x64 et son archive release/DBCodex-0.1.0-win-x64.zip ont été reconstruits. Le composant UI intégré a également été compilé. Le rafraîchissement d'un plugin Codex déjà mis en cache n'est pas confirmé par ce travail ; l'exécutable portable constitue la livraison locale vérifiée.

Raccordements aux champs (ou aux champs masqués via leur zone récapitulative), chemins orthogonaux arrondis, contournement des tables et titres de groupe, pénalités de superposition et de croisement, voies parallèles, petits ponts aux croisements, survol des deux champs, lecture du voisinage d'une table, commandes adaptées au zoom.

Les ronds déplacent des segments ; les petits points créent des détours. Les raccordements peuvent changer de côté. Les poignées offrent une zone de saisie plus grande que leur représentation. Aimantation, repères temporaires, Alt pour la désactiver, flèches et Maj pour le déplacement au clavier, Échap pour annuler un glissement. Les coudes inutiles se simplifient.

Les routes manuelles sont conservées par défaut. Le bouton supérieur recalcule la relation sélectionnée, ou les routes automatiques sans sélection ; le menu propose un recalcul incluant les routes manuelles. Ces actions ne déplacent pas les tables et passent par l'historique d'annulation existant.

## Données et stabilité

Les nouveaux attributs optionnels d'arête dans la présentation v1 sont format, mode, sourceSide et targetSide. Les routes anciennes ne possédant que points restent acceptées. Les commandes de manipulation enregistrent les sommets orthogonaux et l'état manuel dans la vue ; le DBML ne change pas. Les routes automatiques recalculées explicitement sont aussi enregistrées, pour préserver leur état à l'annulation et à la réouverture.

Les mesures des raccordements sont arrondies au centième d'unité afin de prévenir les petits écarts dus au zoom. Le cache conserve les routes indépendantes et encore valides lorsqu'une table bouge. Un chemin manuel gêné par un nouvel obstacle est réparé sur ses portions obstruées, sans changer son état manuel. Les fonds de groupe ne sont pas des obstacles.

L'ancien app.asar est conservé sous build/routing-review/app-before-routing.asar. Le packaging sauvegarde puis rétablit le dossier data du portable. Les préférences du portable sont sauvegardées et restaurées autour du contrôle de l'exécutable livré. Les fixtures originales ne sont pas modifiées : les tests utilisent des copies dans build/routing-review.

## Vérification

- Types core/UI/MCP et desktop portable : réussis.
- Suite portable : **353 tests, 36 fichiers, zéro échec**.
- UI hors ligne : aucune dépendance distante.
- Intégration MCP stdio : réussie.
- Application Electron compilée puis véritable exécutable livré : contrôles réussis, aucune erreur JavaScript observée.
- Gestes vérifiés : déplacement de segment au clavier, annulation/rétablissement, conservation des tracés manuels lors du recalcul par défaut, sauvegarde du mode manuel, recalcul global explicite et annulation, création de détour à la souris, Échap pendant un glissement, déplacement d'une table conservant l'orthogonalité.
- Archive extraite et paquet app.asar comparé au portable vérifié : SHA-256 identique, F277B63EE86BB7C5BC5FE8812FC652AD2DF24BFD261F11B3938F0869ADE7555C.

La suite générale a également été exécutée avant actualisation des anciens tests de poignées. Elle a confirmé des échecs déjà documentés dans le desktop/chat interrompu : module desktop-service absent, scénario de brouillon chat-service, libellé de partage et matcher renderer. Ces composants ne font pas partie de la livraison portable. Les tests du diagramme ont été actualisés pour la manipulation des segments et repassent dans la suite portable ; les tests chat n'ont pas été supprimés ni modifiés.

Preuves générées : build/routing-review/result.json, overview-light.png et pointer-detour-light.png. Le script scripts/review-routing-ui.mjs permet de répéter le contrôle sur une copie du modèle Compliance.

## Limites pratiques

Le calcul optimise les chemins sans promettre l'absence de tout croisement. Des tables qui se chevauchent ou bloquent la sortie d'un champ peuvent empêcher un contournement complet ; un chemin connecté de repli reste disponible. Les paramètres de confort ont été vérifiés sur le modèle Compliance, pas sur tous les grands modèles possibles.

Une ancienne application à validation stricte peut refuser les nouveaux attributs de routage. Les fichiers existants restent lisibles dans la nouvelle version. Aucune publication distante ni installation du plugin dans un cache Codex externe n'a été effectuée.
