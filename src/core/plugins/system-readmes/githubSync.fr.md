La synchronisation GitHub sauvegarde votre espace de travail dans un dépôt GitHub. C'est un envoi à sens unique : Nevo ne récupère ni ne fusionne jamais de modifications dans votre espace.

## Configuration

- Ouvrez le plugin et choisissez **Configurer**, puis renseignez les paramètres ci-dessous.
- **Dépôt** : au format `owner/name`.
- **Branche** : la branche de sauvegarde (`main` si le champ est vide). Utilisez une branche ou un dépôt dédié.
- **Jeton d'accès** : un jeton d'accès personnel avec la portée `repo`. Il est conservé dans le stockage sécurisé de votre système, pas dans l'espace de travail.
- **Message de commit** : le message de chaque commit de sauvegarde (`Nevo backup` si le champ est vide).
- **Synchronisation automatique** et **Intervalle (minutes)** : envoi périodique, de 1 minute à 24 heures. La première synchronisation automatique a lieu après un intervalle complet.

## Utilisation

- Choisissez **Tester la connexion** pour vérifier le dépôt et le jeton.
- Choisissez **Synchroniser** pour envoyer immédiatement. L'état indique l'heure de la dernière synchronisation et le nombre de fichiers.

## Contenu envoyé

- Notes, dossiers, ressources, tableaux, bases de données, modèles et historique, comme dans un export de l'espace. Les plugins installés ne sont pas inclus.
- Les fichiers déjà identiques dans le dépôt ne sont pas renvoyés.
- Les fichiers de plus de 25 Mo sont ignorés, et l'ensemble de l'espace doit rester sous 512 Mo.

## Remarques

- La branche est remplacée par une copie de l'espace de travail : les fichiers absents de l'espace sont supprimés de la branche, mais l'historique des commits est conservé.
- Une seule synchronisation peut s'exécuter à la fois pour un espace de travail.
