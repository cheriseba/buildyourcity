# Architektur

Das Spiel ist eine statische Browser-Anwendung ohne Build-Schritt. Ein Webserver
ist notwendig, damit CSV-Dateien und Bilder geladen werden koennen. Lokal zum
Beispiel `python -m http.server` aus dem Projektordner starten und die angezeigte
Adresse im Browser oeffnen. p5.js wird ueber das in `index.html` angegebene CDN
geladen.

Der Browser- und Installationsname sowie die Icons sind in `index.html` und
[manifest.webmanifest](manifest.webmanifest) hinterlegt. Die Nordstadt-Icons
basieren auf der vorhandenen Hausgrafik im Tile-Katalog. Ob und wie ein
Desktop- oder Startbildschirm-Icon angelegt wird, haengt vom Browser ab.

## Aktuelle Verantwortlichkeiten

- [tile-catalog.json](daten/tile-catalog.json) ist die zentrale Datenquelle fuer
  Tile-Eigenschaften und Regeln. [catalog.js](spiel/daten/catalog.js) validiert sie beim
  Spielstart, prueft die Bilder und bereitet Kategorien fuer die Palette auf.
  Index 0 ist die Wiese. [tile-catalog-model.js](gemeinsam/tile-catalog-model.js)
  enthaelt die von Spiel und Werkstatt gemeinsam genutzte Regelpruefung.
  [csv.js](spiel/daten/csv.js) liest weiterhin das Startlayout;
  [start-layout.js](spiel/daten/start-layout.js) wendet es an und exportiert
  das Spielfeld als CSV. Die Eingaben werden ausdruecklich uebergeben.
  [diagnostics.js](spiel/daten/diagnostics.js) zeigt technische Hinweise nur
  im ausdruecklich aktivierten lokalen Debug-Modus an.
- [grid.js](spiel/welt/grid.js) verwaltet das Spielfeld, mehrzellige Gebaeude, Platzierung,
  Zeichenreihenfolge und Undo. [tile.js](spiel/welt/tile.js) enthaelt die darstellbaren Zellen und
  Gebaeude. `Board` benachrichtigt seinen Aufrufer bei Aenderungen ueber einen
  Callback; es speichert nicht selbst.
- [over-rules.js](spiel/welt/over-rules.js) und [walk.js](spiel/welt/walk.js) wenden Platzierungs-
  bzw. Laufregeln aus dem Katalog an. Die bisherigen Regel-CSV-Dateien liegen
  als Sicherung des importierten Ausgangsstands in [csv/archiv/](csv/archiv/)
  und werden vom Spiel nicht mehr fuer diese Regeln gelesen. Das aktive
  Startlayout bleibt unter [csv/start-layout.csv](csv/start-layout.csv).
- [save-game.js](spiel/speichern/save-game.js) speichert und laedt Board-Snapshots. [game.js](spiel/game.js) verbindet
  Spielfeld, Katalog, Speicherung, p5-Lebenszyklus und Benutzeroberflaeche.
- [character.js](spiel/charakter/character.js) und [character-ui.js](spiel/charakter/character-ui.js) enthalten Avatar und zugehoerige UI.
  [style.css](spiel/style.css) und [index.html](index.html) beschreiben Aussehen und Seitenstruktur.

Die Dateien sind klassische Skripte und werden in der Reihenfolge in
`index.html` geladen. Es bestehen noch globale Abhaengigkeiten; insbesondere
enthaelt `game.js` weiterhin Kamera, Eingabe, Palette, Modi und Tutorial. Neue
Logik sollte nach Verantwortung ausgelagert werden, statt diese Datei weiter
zu vergroessern. Ein kompletter Modulumbau ist noch nicht erfolgt.

## Spielstaende und Erweiterungen

Staedte liegen unter `nordi-savegame-v1` im lokalen Browser-Speicher. Das
Spiel liest das alte Format v1 mit Dateipfaden und speichert das neue Format
v2 mit stabilen Tile-IDs unter demselben Schluessel. Alte Pfade stehen als
`legacyIds` im Katalog. Der Editor (`?editor`) liest und schreibt diesen
Spielstand nicht. Fehlende Tiles werden uebersprungen; spaetere automatische
Speicherung kann sie dauerhaft aus dem Spielstand entfernen. Technische
Hinweise erscheinen in der Browser-Konsole und im lokalen Debug-Modus, nicht
in der normalen Spieloberflaeche. Vor Umbenennungen oder groesseren Updates
Browserdaten sichern. Aenderungen am Speicherformat brauchen Migration und Tests.
Der bestaetigte Reset im letzten Tutorial-Schritt stellt das Startlayout wieder
her; der normale Reset ausserhalb dieses Schritts behaelt sein Verhalten.

Fuer spaetere Erweiterungen sollten Katalogdaten, Platzierungsentscheidungen,
Spielzustand und UI getrennt bleiben. Drehung benoetigt unter anderem eindeutig
definierte Ausrichtungen, Footprints und passende Grafiken; Waehrung und
Freischaltungen benoetigen einen eigenen dauerhaft gespeicherten Zustand.
Interaktionen und Minispiele sollten erst mit geklaerten Regeln und einer
klaren Schnittstelle zur Welt eingebaut werden. Diese Funktionen sind hier
bewusst noch nicht implementiert.

## Tests

Mit installiertem Node.js die automatisierten Kern- und Kompatibilitaetstests
aus dem Projektordner ausfuehren:

```text
node --test tests/*.test.js
```

Diese Tests ersetzen keinen Browser-Test von Grafik, Eingabe, Touch und
Avatarbewegung. Bei Aenderungen daran zusaetzlich im Browser pruefen.

## Tile-Werkstatt

[Katalog/](Katalog/) enthaelt die Tile-Bilder. Die Datei
[tile-catalog.json](daten/tile-catalog.json) enthaelt dagegen deren IDs,
Eigenschaften und Regeln. Der Name des Bildordners ist nicht Teil einer
Tile-ID oder eines Spielstands.

Unter Windows [Tile-Werkstatt.cmd](Tile-Werkstatt.cmd) starten (Node.js muss
installiert sein). Alternativ im Projektordner
`node tools/tile-workshop-server.js` ausfuehren und
`http://127.0.0.1:8766/` im Browser oeffnen. Das Fenster mit dem Server muss
offen bleiben; Strg+C beendet ihn. Der Server lauscht nur lokal und braucht
keine zusaetzlichen Pakete. Die Werkstatt bearbeitet `daten/tile-catalog.json`;
erst **Aenderungen speichern** schreibt die Datei. Bei externen Aenderungen
waehrend der Bearbeitung wird das Speichern verweigert und ein erneutes
Einlesen verlangt.

Die Werkstatt zeigt PNG- und GIF-Bilder ausser Kategorie-Icons. Sie vergleicht
die Dateien mit den im Katalog gespeicherten SHA-256-Pruefsummen:

- Neue Dateien anlegen, Eigenschaften festlegen und auf **Freigegeben** setzen.
- Bei veraendertem Inhalt bewusst zwischen gleicher Tile-Identitaet und einem
  neuen Tile entscheiden. Bei einem neuen Tile werden alte Regeln nicht uebernommen.
- Bei Verschiebungen eine vorgeschlagene Zuordnung bestaetigen. Identische
  Dateien koennen mehrdeutig sein und erfordern eine manuelle Auswahl. Ein
  neues Bild kann auch manuell einem fehlenden Tile zugeordnet werden, wenn
  sich sowohl Pfad als auch Inhalt geaendert haben.
- Vorlagen speichern Regeln gemeinsam; Aenderungen daran gelten fuer alle
  zugeordneten Tiles. Mit Checkboxen und **Vorlage auf Auswahl anwenden**
  koennen mehrere Tiles gleichzeitig zugeordnet werden. Unterschiedliche Typen
  koennen eine Vorlage ungueltig machen; die Pruefung zeigt dies an.

Ein ungueltiges, nicht freigegebenes oder fehlendes Tile wird beim Spielstart
uebersprungen und diagnostisch gemeldet. Auch ein Boden, der ein nicht verfuegbares
Overlay ausdruecklich voraussetzt, wird vorsichtshalber uebersprungen. Die
Wiese ist fuer das gesamte Spielfeld erforderlich; fehlt sie, kann das Spiel
nicht starten. Ist der Katalog als Ganzes defekt oder nicht ladbar, ist
ebenfalls kein Spielstart moeglich.

Zur Diagnose das Spiel ueber `http://localhost:8000/?debug` (oder die lokal
verwendete Portnummer) aufrufen und den Hinweis oben rechts aufklappen. Im
Editor koennen Parameter kombiniert werden: `?editor&debug`. Die Anzeige ist
nur fuer `localhost`, `127.0.0.1` und `::1` aktiviert; auf veroeffentlichten
Seiten auch mit `?debug` nicht. Diagnoseausgaben bleiben in der Browser-Konsole
sichtbar. Dies ist keine Sicherheitsfunktion: Spielcode und Konsole sind auch
fuer Besucher zugaenglich.

Dateinamen muessen nicht dauerhaft gleich bleiben. Eine reine Umbenennung
oder Verschiebung kann anhand identischen Inhalts erkannt werden. Werden
Bildinhalt und Pfad gleichzeitig geaendert, kann das Werkzeug die Identitaet
nicht sicher selbst erkennen. Vor dem Austausch eines Bildes sollte die
Entscheidung in der Werkstatt bewusst getroffen werden.
