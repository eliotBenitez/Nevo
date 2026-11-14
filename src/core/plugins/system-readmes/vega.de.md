Vega-Lite-Diagramme verwandeln eine JSON-Spezifikation in ein interaktives Diagramm direkt in deiner Notiz.

## Verwendung

- Tippe `/` in eine leere Zeile und wähle **Diagramm**, um einen Diagrammblock einzufügen.
- Klicke auf den Block, um den Editor zu öffnen, füge eine Vega-Lite-Spezifikation (JSON) ein oder schreibe sie und wähle **Anwenden**. Mit **Löschen** entfernst du den Block.
- Eine typische Spezifikation legt `mark`, Daten in `data.values` und ein `encoding` fest:

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "bar",
  "data": { "values": [{ "a": "A", "b": 28 }] },
  "encoding": { "x": { "field": "a" }, "y": { "field": "b" } }
}
```

## Hinweise

- Das Diagramm folgt dem App-Design und wechselt zwischen hellen und dunklen Farben.
- Ist die Spezifikation ungültig, zeigt der Block eine Fehlermeldung statt des Diagramms; korrigiere das JSON, damit es wieder erscheint.
- Sehr große Spezifikationen (über 100.000 Zeichen) werden nicht gerendert, damit die App reaktionsfähig bleibt.
- Beim Deaktivieren des Plugins verschwinden der Einfügebefehl und die Darstellung des Blocks; die Spezifikation bleibt in der Notiz gespeichert.
