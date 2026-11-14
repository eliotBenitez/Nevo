Les modèles permettent de créer de nouvelles notes à partir d'un contenu de départ réutilisable et d'insérer le contenu d'un modèle dans une note en cours de rédaction.

## Utilisation

- Lorsque le plugin est activé, la création d'une note utilise votre modèle par défaut. Choisissez-le dans les réglages, sous **Modèle de nouvelle note**. Si le modèle comporte des champs, une fenêtre vous demande d'abord de les remplir.
- Pour insérer un modèle dans la note courante, tapez `/` et choisissez **Insérer un modèle**.
- Dans le sélecteur, vous pouvez rechercher des modèles, créer un **Nouveau modèle**, **dupliquer** ou **supprimer** vos propres modèles.

## Rédiger des modèles

- Un modèle comprend un nom, un identifiant, une icône, une description, un contenu et des champs facultatifs (texte, multiligne, date, sélection, case à cocher ; chacun peut être obligatoire).
- Le contenu peut utiliser des variables : `{{date}}`, `{{time}}`, `{{datetime}}`, `{{note.title}}`, `{{workspace.name}}`, `{{field.id}}` pour un champ personnalisé, et `{{cursor}}` pour placer le curseur après l'insertion.

## Remarques

- Les modèles intégrés ne peuvent être ni modifiés ni supprimés ; utilisez **Dupliquer pour modifier** pour en faire votre propre copie.
- Désactiver le plugin fait démarrer les nouvelles notes vierges et masque la commande **Insérer un modèle** ; vos modèles sont conservés.
