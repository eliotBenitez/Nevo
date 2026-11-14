Vorlagen erstellen neue Notizen aus wiederverwendbarem Startinhalt und fügen Vorlageninhalt in eine Notiz ein, an der du gerade arbeitest.

## Verwendung

- Bei aktiviertem Plugin verwendet jede neue Notiz deine Standardvorlage. Wähle sie in den Einstellungen unter **Vorlage für neue Notizen**. Hat die Vorlage Felder, bittest dich zuerst ein Auswahldialog, sie auszufüllen.
- Um eine Vorlage in die aktuelle Notiz einzufügen, tippe `/` und wähle **Vorlage einfügen**.
- Im Auswahldialog kannst du Vorlagen suchen, eine **Neue Vorlage** erstellen sowie eigene Vorlagen **duplizieren** oder **löschen**.

## Vorlagen schreiben

- Eine Vorlage hat Name, Kennung, Symbol, Beschreibung, Inhalt und optionale Felder (Text, mehrzeilig, Datum, Auswahl, Checkbox; jedes kann erforderlich sein).
- Der Inhalt kann Platzhalter nutzen: `{{date}}`, `{{time}}`, `{{datetime}}`, `{{note.title}}`, `{{workspace.name}}`, `{{field.id}}` für ein eigenes Feld und `{{cursor}}`, um den Cursor nach dem Einfügen zu platzieren.

## Hinweise

- Integrierte Vorlagen lassen sich weder bearbeiten noch löschen; mit **Zum Bearbeiten duplizieren** erstellst du deine eigene Kopie.
- Wird das Plugin deaktiviert, beginnen neue Notizen leer und der Befehl **Vorlage einfügen** verschwindet; deine Vorlagen bleiben erhalten.
