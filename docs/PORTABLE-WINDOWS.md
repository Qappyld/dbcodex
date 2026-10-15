# DBCodex — Windows portable, sans IA

## Lancement

Télécharger `DBCodex-X.Y.Z-win-x64.exe` dans un dossier accessible puis double-cliquer dessus. Ce fichier unique lance l’application sans installation, Node.js ou droit administrateur. Ses composants sont extraits temporairement puis supprimés à la fermeture normale ; le démarrage peut prendre quelques secondes. Il peut être renommé, y compris avec des espaces.

Le dossier `data/` est créé à côté de cet EXE pour conserver les préférences. Déplacer l’EXE avec ce dossier pour les retrouver sur un autre emplacement. Les projets `.dbcd` restent des fichiers distincts. Pour passer de l’ancienne version ZIP au fichier unique, placer le nouvel EXE dans l’ancien dossier portable : le même `data/` et les mêmes chemins récents seront réutilisés. L’ancien ZIP reste produit pour assurer les mises à jour des éditions déjà distribuées.

Créer un projet, ouvrir un `.dbcd` ou importer un `.dbml`. Enregistrer avec le bouton ou Ctrl+S. L’export DBML contient le modèle enregistré ; enregistrer les modifications avant l’export. Ouvrir un autre projet crée une autre fenêtre.

Clic simple : sélection graphique. Double-clic sur l’en-tête de table, une relation ou un groupe : définition DBML sélectionnée et éditeur ouvert. Avec un texte invalide, le dernier diagramme valide reste affiché ; la navigation refuse une plage incertaine.

Les vues et groupes restent dans le projet. La barre du bas propose disposition, relations, grille, mini-carte, routage, détail, recherche, groupe, couleur et note. La mini-carte se commande par son icône. Maj+clic sélectionne plusieurs tables ; **Groupe** ouvre le formulaire de création avec nom et couleur. Entrée crée le groupe, Échap annule. Les groupes se réduisent ou se développent depuis leur en-tête et leur couleur se règle depuis le diagramme. Le panneau **Vues** reste consacré aux vues et à la visibilité des tables. Les notes et couleurs de table sont enregistrées avec la présentation et les révisions. L’historique permet de restaurer dans une nouvelle révision.

## Gestion des vues — mise à jour du 14 octobre 2026

**Default View** existe toujours et inclut toutes les tables du schéma, y compris les nouvelles. Elle ne peut être ni renommée ni supprimée. Le sélecteur du panneau **Vues** permet de créer une **Nouvelle vue**, initialement vide. Toutes les tables restent proposées dans la liste, regroupée par schéma ou par groupe de tables.

Les cases de visibilité prévisualisent les tables et leurs relations. **Enregistrer la vue** valide cette sélection dans le travail courant ; **Réinitialiser** revient à la sélection validée. Le menu voisin propose **Enregistrer comme nouvelle vue**, qui copie la sélection affichée et sa présentation. Le bouton **Enregistrer** du projet reste nécessaire pour écrire le fichier et créer une révision ; il ne valide pas la visibilité encore en prévisualisation.

Changer de vue avec une sélection de visibilité non validée propose **Enregistrer / Abandonner / Annuler**. Le renommage se fait directement dans la liste, avec validation ou annulation. La suppression exige confirmation et ramène à Default View lorsque la vue active est supprimée. Elle conserve les tables du schéma.

La recherche filtre la liste. La case d’un schéma ou d’un groupe agit sur tous ses membres, même ceux exclus des résultats ; le compteur porte sur les résultats affichés. La case générale agit sur toutes les tables. Les positions, le zoom, les tracés et le niveau de détail restent propres à chaque vue. Le niveau de détail se règle uniquement dans la barre flottante.

## Routage des relations — mise à jour du 13 octobre 2026

Les relations se raccordent aux champs et contournent les tables. Les chemins parallèles sont espacés lorsque la disposition le permet ; les croisements présentent un petit pont. Survoler une relation met en évidence ses deux champs. Sélectionner une table permet de lire son voisinage.

Cliquer sur une relation affiche ses poignées : tirer un rond déplace un segment perpendiculairement ; tirer un petit point crée un détour. Les coudes se simplifient à l'alignement. Les poignées aux extrémités changent le côté de sortie en conservant le champ. Les flèches déplacent une poignée de 10 unités, Maj de 1 unité ; Alt désactive temporairement l'aimantation pendant un glissement. Échap annule le glissement. Chaque geste terminé peut être annulé et rétabli depuis la barre du haut.

Le bouton **Routage automatique** se trouve dans la barre flottante du bas : avec une relation sélectionnée, il recalcule cette relation ; sans sélection, il recalcule les chemins automatiques en conservant les chemins manuels. Son menu permet de recalculer toutes les relations, y compris les tracés manuels. Il ne déplace pas les tables.

Enregistrer conserve les tracés dans la vue courante du projet .dbcd, sans modifier le DBML. Les anciens tracés restent lisibles ; une ancienne version de DBCodex à validation stricte peut refuser les nouveaux attributs de routage. Une disposition où les tables se chevauchent peut empêcher un contournement complet : espacer les tables puis recalculer.

La mise à jour du 14 octobre ajuste les raccordements lorsque les tables bougent : le premier et le dernier coude suivent leurs champs, sans revenir à leur ancienne hauteur. Un petit détour devenu inutile se simplifie. Les tables empilées peuvent être reliées par un même côté extérieur ; un recalcul global adopte cette règle, tandis que les côtés choisis pour les tracés manuels restent conservés. Les détours créés depuis les petits points se forment autour du point saisi.

## Données et mise à jour

La livraison du 13 octobre inclut l'optimisation de la fluidité : React en mode production, raccordements limités aux relations utilisées, conservation des calculs valides et adaptation légère pendant les déplacements. Le recalcul global est réparti en petites étapes ; ses boutons sont temporairement désactivés pendant le calcul. Si la disposition change entre-temps, un résultat devenu obsolète est écarté.

Les préférences se trouvent dans `data/preferences.json` à côté de l’exécutable. Les projets placés sous ce dossier portable utilisent des chemins récents relatifs ; les projets extérieurs utilisent des chemins absolus. Déplacer toute l’arborescence conserve les références relatives. Les projets `.dbcd` restent à l’emplacement choisi.

À partir de la version 0.1.1, ouvrir **Mises à jour** dans l’en-tête : télécharger la nouvelle version, puis choisir **Mettre à jour et redémarrer**. Les fichiers sont vérifiés et remplacés automatiquement après conservation des brouillons. Fermer les autres instances avant le redémarrage. Les détails de publication et de récupération sont dans `UPDATES.md`.

Pour une mise à jour manuelle du fichier unique, fermer toutes les fenêtres puis remplacer uniquement l’EXE. **Conserver le sous-dossier `data/` et les projets**. L’EXE distribué ne contient pas de préférences préremplies. Les éditions ZIP continuent à recevoir leur format de mise à jour habituel ; le passage au fichier unique se fait manuellement.

Une configuration illisible ou de version inconnue est conservée intacte ; les changements de préférences restent alors dans la session. Si `data/` ne peut pas être créé, l’application essaie le dossier de préférences du compte Windows ; le repli est annoncé dans l’interface. Les caches Electron restent dans les données du compte Windows.

Un projet absent peut être réessayé, retrouvé ou retiré de la liste, sans supprimer de fichier. Une seconde ouverture du même fichier sur le même ordinateur reste en lecture seule jusqu’à sa fermeture ; rouvrir après fermeture du premier éditeur pour obtenir l’écriture.

## Récupération

Les brouillons sont conservés après un délai d’environ une seconde et lors d’une fermeture normale. À la réouverture, choisir Reprendre le brouillon ou Écarter le brouillon. Un arrêt forcé ne garantit que le dernier état effectivement écrit.

Après un conflit externe, conserver le travail local, comparer les versions et résoudre volontairement le conflit. **Enregistrer une copie** crée un nouveau `.dbcd` avec le texte courant valide et sa présentation, sans écraser l’original ; cette copie possède un nouvel historique. Si le texte est invalide, le corriger ou le copier avant d’abandonner la fenêtre. Une fermeture dont le brouillon n’a pas pu être conservé propose de rester dans l’atelier ; l’abandon demande une action explicite.

Les notes/couleurs enrichissent la présentation v1. Cette application ouvre les anciens projets ; une ancienne application avec un validateur strict peut refuser les projets contenant ces nouveaux champs. Garder une copie avant un retour à un ancien logiciel.

## Vérification sur votre poste

La version a été essayée sur l’hôte de développement Windows Server 2025 x64. Un compte Windows standard distinct, un PC sans outils de développement et OneDrive n’ont pas été testés.

1. Sous un compte standard, placer l’EXE unique dans Documents puis le lancer sans terminal. Vérifier l’absence de demande d’élévation.
2. Créer un projet fictif, importer un DBML, modifier un commentaire et une table, créer une vue et un groupe, changer leur couleur et ajouter une note. Enregistrer puis exporter le DBML.
3. Fermer et rouvrir ; vérifier texte, vues, groupe, couleur, note et historique. Restaurer une ancienne révision : les versions suivantes doivent rester consultables.
4. Lancer deux fois le même projet : la seconde fenêtre doit afficher Lecture seule. Ouvrir un autre projet : ses modifications doivent rester isolées.
5. Déplacer le dossier portable avec un projet dans un sous-dossier. Vérifier thème et ouverture du récent. Remplacer seulement les fichiers applicatifs en conservant `data/`.
6. Dans OneDrive, utiliser un projet disponible localement, tester déplacement, indisponibilité puis relocalisation. Modifier une copie du projet depuis un autre outil pendant une édition et vérifier le conflit et Enregistrer une copie.

Le verrou concerne uniquement les instances locales. Aucun verrou entre deux PC via OneDrive, aucune synchronisation ou fusion automatique de bases n’est promis. Aucune connexion IA, discussion ou proposition n’est livrée dans cette version.
