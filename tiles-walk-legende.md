# Legende für `tiles-walk.csv`

Die Datei wird beim Laden des Spiels gelesen (`walk.js`). Tiles, die **nicht** drinstehen, verhalten sich wie bisher: freier UNDER-Boden ist begehbar, alles andere nicht.

## Spalten

```
Dateiname,Ebene,W,A,S,D,Hinweis
```

| Spalte | Bedeutung |
|---|---|
| `Dateiname` | Tile, z. B. `Oben_1.png` (Groß/Klein egal) |
| `Ebene` | `unten` (am Boden, z. B. unter der Brücke) oder `oben` (auf der Brücke). Nur zur Ordnung, siehe unten. |
| `W` | Laufen nach **oben rechts** ↗ |
| `A` | Laufen nach **oben links** ↖ |
| `S` | Laufen nach **unten links** ↙ |
| `D` | Laufen nach **unten rechts** ↘ |
| `Hinweis` | Freitext, wird ignoriert |

```
      W ↗
   A ↖   D ↘      W und S sind Gegenrichtungen, A und D auch
      S ↙
```

## Werte in den Richtungs-Zellen

Der Wert beschreibt, wie man **über dieses Tile in diese Richtung läuft**: Höhe beim Hineingehen `>` Höhe beim Herausgehen.

| Wert | Bedeutung |
|---|---|
| `-` oder leer | Richtung gesperrt |
| `0` | flach auf Bodenhöhe (gleich wie `0>0`) |
| `1` | flach auf Brückenhöhe (gleich wie `1>1`) |
| `0>1` | **Aufstieg**: man betritt das Tile unten und verlässt es oben |
| `1>0` | **Abstieg**: man betritt das Tile oben und verlässt es unten |

## Wie die Regeln zusammenspielen

- Ein Schritt von Tile A nach Tile B geht nur, wenn die **Austrittshöhe von A** gleich der **Eintrittshöhe von B** ist. Deshalb gibt es kein Hoch- oder Runterspringen: Eine Brücke ohne Auffahrt ist von der Seite nicht betretbar, und von der Brücke kommt man nur über einen Abstieg wieder runter.
- Auf einer Rampe steht der Charakter in der Mitte auf halber Höhe und wird beim Laufen langsam hoch- bzw. heruntergezogen. Auf der Rampe kann er nur in die Richtungen weiter, für die dort eine passende Zeile steht (hoch/runter), nicht seitlich.
- `Ebene` ist nur Ordnung: Ein Tile mit Weg unten **und** oben braucht zwei Zeilen. Die Höhe kommt aus den Zahlen.
- **Bei einem Overlay** (OVER, z. B. Brücke auf Straße) gilt: Läuft man unten durch (`0`), muss auch der Boden darunter begehbar sein. Ein Overlay mit Regel **ohne** `unten`-Zeile ist am Boden gesperrt (z. B. ein Pfeiler).
- Ein Overlay **ohne** Zeile in der Liste blockiert wie bisher.
- **Gesperrtes UNDER** (z. B. Wasser): eine Zeile mit vier `-`.
- Auf Bodenhöhe unter einem Overlay wird der Charakter automatisch **hinter** der Brücke gezeichnet, auf der Brücke davor und nach oben versetzt (`BRIDGE_HEIGHT` in `character.js`).
- Fehlerhafte Zeilen (ungültige Ebene oder ungültiger Wert) werden übersprungen. Die Browser-Konsole zeigt dann eine Warnung `tiles-walk.csv: Zeile uebersprungen`.
- Gibt es einen Dateinamen in mehreren Kategorien (z. B. `Altbau_1.png`), gilt die Regel für alle davon.

## Vorlagen zum Kopieren

```csv
Gesperrtes UNDER (z. B. Wasser):
Wasser_1.png,unten,-,-,-,-,nicht begehbar

Brücke gerade (Deck läuft W/S, unten durch A/D):
Oben_1.png,unten,-,0,-,0,drunter durch
Oben_1.png,oben,1,-,1,-,auf der Brücke

Auffahrt (hoch nach W, runter nach S):
Auffahrt_1.png,oben,0>1,-,1>0,-,Auf- und Abstieg

Nur in 3 Richtungen begehbar (D gesperrt):
Beispiel.png,unten,0,0,0,-,
```
