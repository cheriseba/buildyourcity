# OVER-Platzierungsregeln

> Archiv: Das Spiel liest diese Regeln inzwischen aus dem zentralen
> [Tile-Katalog](../../daten/tile-catalog.json). Bitte Regeln in der
> [Tile-Werkstatt](../../ARCHITEKTUR.md#tile-werkstatt) bearbeiten; Änderungen
> an den CSV-Dateien wirken sich nicht mehr auf das Spiel aus. Die folgenden
> Erklärungen zum Verhalten gelten weiterhin.

Die früheren Regeln stehen im Archiv: [tiles-over-regeln.csv](../archiv/tiles-over-regeln.csv)
für Einschränkungen des Bodens und [tiles-over-halb.csv](../archiv/tiles-over-halb.csv)
für halbe OVERs. Die Angaben beziehen sich auf Kategorie **und** Dateiname aus
[tiles-tags.csv](../archiv/tiles-tags.csv); Groß- und Kleinschreibung war egal.
Ein exportiertes `start-layout.csv` wird vom Browser heruntergeladen und muss
zum Verwenden weiterhin in den Ordner `csv` verschoben werden.

## Einschränkung eines UNDER

In `tiles-over-regeln.csv` für jedes erlaubte OVER eine Zeile mit Kategorie und Dateiname des
UNDER sowie des OVER eintragen. Sobald mindestens eine Zeile für ein UNDER
existiert, sind dort **nur** die aufgelisteten OVERs erlaubt. Ohne Zeile
gelten die bisherigen Regeln.

```csv
Kategorie,Dateiname,OVER-Kategorie,OVER-Dateiname
40_Wasser,Andere_2.png,14_Brucke,Oben_1.png
40_Wasser,Andere_2.png,14_Brucke,Oben_2.png
```

Wird ein nicht erlaubtes OVER ausgewählt, erscheint ein Hinweis und das
Spielfeld bleibt unverändert. Wird dagegen ein eingeschränktes UNDER unter
vorhandene OVERs gesetzt, werden nur die nicht erlaubten OVERs entfernt.
Die Änderung lässt sich rückgängig machen.

Das Beispiel erlaubt auf `40_Wasser/Andere_2.png` die vier `Oben`-Brücken
aus `14_Brucke`. Weitere Wasser-Tiles bleiben zunächst uneingeschränkt.

## Halbe OVER-Tiles

Eine Zeile in `tiles-over-halb.csv` kennzeichnet ein OVER, das mit einem
weiteren OVER auf derselben Zelle kombiniert werden darf. `Position` ist
`hinten` oder `vorn` und bestimmt die Zeichenreihenfolge,
unabhängig davon, welches Tile zuerst gesetzt wird.

```csv
Kategorie,Dateiname,Position
32_Zaune,Zaun_1.png,hinten
```

Pro Zelle sind höchstens zwei OVERs möglich; mindestens eines muss als
halbes OVER eingetragen sein. Wird ein weiteres OVER gesetzt, ersetzt es bei
einem Paar normalerweise das Tile derselben Art (halbes bzw. normales
OVER). Zwei normale OVERs ersetzen sich weiterhin wie bisher. Zwei halbe
OVERs sind ebenfalls möglich; bei gleicher Position entscheidet die
Setzreihenfolge. Doppelklick entfernt zuerst das vordere OVER.

Die UNDER-Einschränkung gilt für **beide** OVERs einzeln. Laufregeln gelten
ebenfalls für beide: Eine Bewegung muss auf beiden OVERs erlaubt sein.
Spielstände und Layout-Export enthalten beide OVERs; alte Spielstände mit
einem OVER bleiben lesbar.

Das Beispiel kennzeichnet `32_Zaune/Zaun_1.png` als halbes OVER im
Hintergrund.

Fehlerhafte Regeln oder eine fehlende der beiden Dateien verhindern den Spielstart; die
Browser-Konsole enthält die betroffene Zeile und eine Fehlermeldung. So
werden Einschränkungen nicht versehentlich ignoriert.