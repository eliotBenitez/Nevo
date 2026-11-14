Les graphiques Vega-Lite transforment une spécification JSON en graphique interactif intégré à votre note.

## Utilisation

- Tapez `/` sur une ligne vide et choisissez **Graphique** pour insérer un bloc de graphique.
- Cliquez sur le bloc pour ouvrir son éditeur, collez ou écrivez une spécification Vega-Lite (JSON), puis choisissez **Appliquer**. **Supprimer** retire le bloc.
- Une spécification typique définit `mark`, des données `data.values` et un `encoding` :

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "bar",
  "data": { "values": [{ "a": "A", "b": 28 }] },
  "encoding": { "x": { "field": "a" }, "y": { "field": "b" } }
}
```

## Remarques

- Le graphique suit le thème de l'application et alterne entre couleurs claires et sombres.
- Si la spécification est invalide, le bloc affiche une erreur au lieu du graphique ; corrigez le JSON pour le faire réapparaître.
- Les spécifications très volumineuses (plus de 100 000 caractères) ne sont pas rendues, afin de garder l'application réactive.
- Désactiver le plugin masque la commande d'insertion et le rendu du bloc ; la spécification reste enregistrée dans la note.
