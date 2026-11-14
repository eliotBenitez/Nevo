Die GitHub-Synchronisierung sichert deinen Arbeitsbereich in einem GitHub-Repository. Es ist ein einseitiger Upload: Nevo lädt nie Änderungen zurück und führt sie auch nicht mit deinem Arbeitsbereich zusammen.

## Einrichtung

- Öffne das Plugin und wähle **Konfigurieren**; fülle dann die folgenden Einstellungen aus.
- **Repository**: im Format `owner/name`.
- **Branch**: der Branch für die Sicherung (`main`, wenn leer). Verwende einen eigenen Branch oder ein eigenes Repository.
- **Zugriffstoken**: ein persönlicher Zugriffstoken mit Umfang `repo`. Er wird im sicheren Speicher deines Betriebssystems abgelegt, nicht im Arbeitsbereich.
- **Commit-Nachricht**: die Nachricht für jeden Sicherungs-Commit (`Nevo backup`, wenn leer).
- **Automatische Synchronisierung** und **Intervall (Minuten)**: zeitgesteuerter Upload, von 1 Minute bis 24 Stunden. Die erste automatische Synchronisierung läuft nach einem vollen Intervall.

## Verwendung

- Wähle **Verbindung testen**, um Repository und Token zu prüfen.
- Wähle **Jetzt synchronisieren**, um sofort hochzuladen. Der Status zeigt den Zeitpunkt der letzten Synchronisierung und die Anzahl der Dateien.

## Was hochgeladen wird

- Notizen, Ordner, Assets, Boards, Datenbanken, Vorlagen und Verlauf, wie bei einem Export des Arbeitsbereichs. Installierte Plugins sind nicht enthalten.
- Dateien, die im Repository bereits identisch vorliegen, werden nicht erneut hochgeladen.
- Dateien über 25 MiB werden übersprungen, und der gesamte Arbeitsbereich muss unter 512 MiB bleiben.

## Hinweise

- Der Branch wird durch eine Kopie des Arbeitsbereichs ersetzt: Dateien, die nicht im Arbeitsbereich sind, werden aus dem Branch entfernt, der Commit-Verlauf bleibt aber erhalten.
- Pro Arbeitsbereich kann nur eine Synchronisierung gleichzeitig laufen.
