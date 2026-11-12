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
- [land.js](spiel/welt/land.js) verwaltet geraeteunabhaengige, zusammenhaengende
  Grundstuecke. [land-ui.js](spiel/welt/land-ui.js) enthaelt ausgegraute Randwiesen,
  Pluszeichen und Bestaetigung. [camera.js](spiel/welt/camera.js) berechnet
  Ausschnitt, Ausrichten und Kameragrenzen ohne DOM- oder p5-Abhaengigkeit.
- [over-rules.js](spiel/welt/over-rules.js) und [walk.js](spiel/welt/walk.js) wenden Platzierungs-
  bzw. Laufregeln aus dem Katalog an. Die bisherigen Regel-CSV-Dateien liegen
  als Sicherung des importierten Ausgangsstands in [csv/archiv/](csv/archiv/)
  und werden vom Spiel nicht mehr fuer diese Regeln gelesen. Das aktive
  Startlayout bleibt unter [csv/start-layout.csv](csv/start-layout.csv).
- [save-game.js](spiel/speichern/save-game.js) speichert und laedt Board-Snapshots. [game.js](spiel/game.js) verbindet
  Spielfeld, Katalog, Speicherung, p5-Lebenszyklus und Benutzeroberflaeche.
- [character.js](spiel/charakter/character.js) und [character-ui.js](spiel/charakter/character-ui.js) enthalten Avatar und zugehoerige UI.
  [style.css](spiel/style.css) und [index.html](index.html) beschreiben Aussehen und Seitenstruktur.

Charakterordner heissen fortlaufend `character/char_1`, `char_2` usw. und
enthalten `animiert_vorn.gif` und `animiert_hinten.gif`. Das jeweils erste
GIF-Bild dient als Standbild; das vordere Standbild auch als Auswahlvorschau.
Fuer die Auswahl werden dessen sichtbare Pixel zentriert, ohne Bildgroesse
oder Darstellung des Charakters im Spiel zu veraendern.
Die Charaktererkennung endet beim ersten fehlenden `animiert_vorn.gif`.
Charakterbilder erhalten bei jedem Seitenaufruf eine neue Cache-Version. Der
Service Worker aktualisiert sie aus dem Netz und speichert sie ohne diese
Version, damit ein vorhandenes Bild bei Netzfehlern weiter nutzbar bleibt.

Die Dateien sind klassische Skripte und werden in der Reihenfolge in
`index.html` geladen. Es bestehen noch globale Abhaengigkeiten; insbesondere
enthaelt `game.js` weiterhin Kamera, Eingabe, Palette, Modi und Tutorial. Neue
Logik sollte nach Verantwortung ausgelagert werden, statt diese Datei weiter
zu vergroessern. Ein kompletter Modulumbau ist noch nicht erfolgt.

## Spielstaende und Erweiterungen

Staedte liegen unter `nordi-savegame-v1` im lokalen Browser-Speicher. Das
Spiel liest die alten Formate v1 mit Dateipfaden und v2 mit stabilen Tile-IDs.
Es speichert Format v3 mit stabilen Tile-IDs und expliziter Grundstuecksliste
unter demselben Schluessel. Alte Pfade stehen als
`legacyIds` im Katalog. Der Editor (`?editor`) liest und schreibt diesen
Spielstand nicht. Fehlende Tiles werden uebersprungen; spaetere automatische
Speicherung kann sie dauerhaft aus dem Spielstand entfernen. Technische
Hinweise erscheinen in der Browser-Konsole und im lokalen Debug-Modus;
Speicher- und Ladefehler zusaetzlich als Meldung im Spiel.
Vor Umbenennungen oder groesseren Updates
Browserdaten sichern. Aenderungen am Speicherformat brauchen Migration und Tests.
Reset oeffnet eine Auswahl: **Nur gebaute Stadt** stellt leere Wiese wieder her
und behaelt freigeschaltete Grundstuecke. **Gesamten Spielstand** setzt auch die
Freischaltungen auf die zwei Startgrundstuecke mit CSV-Startlayout zurueck. Beide Varianten leeren
den Bauverlauf und speichern sofort; ausstehendes Autosave kann den alten Stand
nicht wiederherstellen. Andere localStorage-Schluessel bleiben unberuehrt.
Abbrechen und Escape aendern nichts. Waehrend der Auswahl sind Kamera,
Bauen und Undo gesperrt.
Im Editor wird stattdessen das CSV-Startlayout wiederhergestellt; ein kompletter
Reset stellt dort auch die zwei Startgrundstuecke wieder her, ohne Spielstaende
zu veraendern. Bau-Undo behaelt freigeschaltete Grundstuecke.

Das Tutorial verwendet eine temporaere Uebungsstadt und deaktiviert deren
automatische Speicherung. Beim Beenden oder Abschluss werden Stadt, Bauverlauf,
Auswahl und Kamera wiederhergestellt. Die Uebung zeigt UNDER als Boden, OVER
als Objekt und das Entfernen beider Ebenen. Einzelne Aufgaben koennen uebersprungen
werden; die Bewegungshinweise folgen derselben Geraeteerkennung wie die
Touch-Steuerung. Das Tutorial ist ueber das Menue erneut erreichbar.

Neue Staedte und der Editor beginnen mit denselben zwei waagerechten
Grundstuecken: (0,1) und (1,1). Jedes Grundstueck umfasst 512x512
Weltpixel (256 Zellen), zusammen 512 Bauzellen. Der Start ist auf allen
Bildschirmen gleich gross und laedt das CSV-Startlayout.
Bestehende v3-Staedte behalten ihre gespeicherten
Freischaltungen, auch die bisherigen Ein-Grundstueck-Staedte. Die Validierung
verlangt das zentrale Grundstueck (1,1), nicht alle aktuellen Startgrundstuecke.
Alte v1/v2-Staedte erhalten die bisherige 3x3-Flaeche.
Die 3x3-Erzeugung bleibt ausschliesslich fuer diese alten Spielstaende erhalten,
nicht als Editor- oder Startflaeche. Sie wird noch fuer deren Bildexport vor
einem bestaetigten Update-Neustart benoetigt.

Spielstaende enthalten neben dem Datenformat `v: 3` eine separate
`compatibility`-Version. `SAVE_COMPATIBILITY_VERSION` in
[spiel/speichern/save-game.js](spiel/speichern/save-game.js) wird **nur** dann
erhoeht, wenn ein Update zwingend einen vollstaendigen Neustart erfordert.
Normale Code-, Katalog- oder Layoutaenderungen erhoehen sie nicht.
Die erste Version ist 1: Vorherige Spielstaende ohne dieses Feld benoetigen
beim aktuellen Update eine ausdrueckliche Bestaetigung.

Bei abweichender Kompatibilitaet wird die alte Stadt ausschliesslich zur
Vorschau geladen. Bauen, Kameraeingaben und alle normalen Speicherwege
(auch pagehide und visibilitychange) bleiben gesperrt. Der Update-Dialog
laesst sich nicht mit Escape wegklicken; die Seite kann ohne Datenverlust
verlassen und spaeter erneut geoeffnet werden.
**Alte Stadt als Bild speichern** rendert die gesamte Stadt mit Gebaeuden
und Overlays ohne UI auf einen separaten Canvas, mit blauem Hintergrund und
maximal 4096 Pixeln je Achse. Die Stadt selbst wird dabei nicht veraendert.
Ein gestarteter Download gilt nicht als gesicherte Nutzerbestaetigung;
der Dialog fordert dazu auf, das gespeicherte Bild vor dem Reset zu pruefen.

Erst **Zuruecksetzen und Update starten** speichert einen vorbereiteten neuen
1x2-Stand mit dem aktuellen CSV-Startlayout und der neuen Kompatibilitaet.
Nur nach erfolgreichem Schreiben wird die sichtbare alte Stadt ersetzt und
Autosave freigegeben. Bei Speicherfehlern bleiben alter Stand, Ansicht und
Dialog erhalten. Unlesbare Spielstaende werden ebenfalls nicht automatisch
ueberschrieben; ein nicht moeglicher oder unvollstaendiger Bildexport wird
ausdruecklich angezeigt. Neue Spieler, kompatible Spielstaende und der Editor
erhalten keine Updateaufforderung. Es wird kein separater Bestaetigungsmarker
gespeichert: Der neue Spielstand selbst belegt den erfolgreichen Wechsel.

Ein neues Startlayout erstellen:
1. Das Spiel mit `?editor` oeffnen und auf den zwei Startgrundstuecken bauen,
   ohne weitere Grundstuecke freizuschalten.
2. Im Menue **Layout exportieren** oder **Strg+Alt+Umschalt+L** verwenden.
3. Die heruntergeladene Datei als [csv/start-layout.csv](csv/start-layout.csv)
   im Projekt ersetzen; Koordinaten und Kopfzeile beibehalten.
4. Neue Spiele und ein kompletter Reset laden diese Vorlage. Ein vorhandener
   Spielstand hat Vorrang und wird durch eine neue CSV nicht ueberschrieben.
   `FIX` sperrt ein Tile im normalen Spiel, `FREI` erlaubt Aenderungen.
   In der aktuellen Startvorlage sind alle Eintraege `FIX`.
   Im Editor bleiben auch `FIX`-Tiles bearbeitbar. Die CSV speichert keine
   Freischaltungen; Eintraege ausserhalb der Startflaeche werden mit
   Konsolenwarnung uebersprungen.

Zusaetzliche Grundstuecke entstehen nur nach
ausdruecklicher Freischaltung oberhalb, links oder rechts von bestehendem Land.
Neue Erweiterungen nach unten sind in Modell und UI gesperrt. Seitliches
Schliessen von Luecken bleibt moeglich; bereits gespeicherte suedliche
Grundstuecke bleiben unveraendert ladbar. Die Zusammenhangspruefung von
Spielstaenden verwendet weiterhin alle vier Nachbarrichtungen. Es gibt keine
feste Anzahlgrenze, aber natuerlich Speicher- und Leistungsgrenzen des Browsers.
Mehrzellige Gebaeude brauchen ausschliesslich vorhandene Grundflaechenzellen;
ihre Grafik darf ueber den Weltrand ragen. Leere Grundstuecke werden unabhaengig
von ihren Tiles gespeichert und vor diesen wiederhergestellt.

Am Spielfeldrand sind zunaechst keine Erweiterungsbuttons sichtbar. Erst ein
Verschiebeversuch ueber eine erlaubte Grenze deckt Pluszeichen in der Luft
dicht neben der letzten Tile-Reihe auf. Es gibt keine grauen Vorschauwiesen,
Randpolster, rechteckigen Bodenausschnitte oder flaechigen Markierungen.
Nur tatsaechliche Board-Zellen werden gezeichnet. Strassen ersetzen die Wiese
ihrer Zelle; die aeussere Silhouette folgt den Tilegrafiken. Boden, FULL-Tiles,
Overlays, Gebaeude und Charaktere verwenden eine gemeinsame Tiefenreihenfolge,
keinen separaten Boden-Vorlauf. So verdecken vordere Nachbarfelder korrekt die
Basis hinterer Objekte. Auch der Stadtbildexport folgt dieser Reihenfolge.
Sichtbarkeit und Gebaeude-Ueberlappungen beruecksichtigen die volle Bildhoehe
aller Boden- und Overlaygrafiken, nicht nur das 64x64-Basisfeld.
Das Plus oder ein Tippen auf die aufgedeckte Luft oeffnet die Bestaetigung
direkt, ohne Menueeintrag oder separaten Erweiterungsmodus.
Die Luft ist weder bebaubar noch begehbar und wird nicht gespeichert.
Die Scrollgrenzen liegen normalerweise an der freigeschalteten Welt.
Bewusst aufgedeckte Kanten erlauben Platz fuer den Tile-Ueberhang und das Plus:
64 Weltpixel plus 64 Bildschirmpixel, maximal eine halbe Grundstuecksbreite.
Wiederholtes Ziehen gibt keinen weiteren Raum frei.
Nach dem Loslassen bleibt das Plus anklickbar. Zoom und Heimkehr verbergen
die aufgedeckten Kanten wieder; diese werden nicht gespeichert.
Die Bestaetigung zeigt ausschliesslich **Stadtteil erweitern?**, **Ja**
und einen kleineren **zurueck**-Button. **Ja** bestaetigt;
**zurueck** oder Escape schliesst
ohne Kauf. Beim Auswaehlen und Freischalten bleibt der betrachtete Weltpunkt
soweit moeglich erhalten; die Kamera springt nicht zum neuen Grundstueck.
Nach dem Freischalten werden die moeglichen Erweiterungen und Pluszeichen aktualisiert.
Die Randabfrage prueft jede gemeinsame Kante mit freigeschaltetem Land, nicht
nur die aeusseren Grenzen des Weltrechtecks. Dadurch bleiben auch versetzte
Erweiterungen und Luecken zwischen bereits gekauften Grundstuecken erreichbar.
Im Erkunden-Modus und bei ausgeblendeter Oberflaeche sind die Pluszeichen
ausgeblendet. Aktuell sind Freischaltungen
kostenlos. Spaetere Birbs-Preispruefung und Abbuchung gehoeren in den zentralen
Freischaltvorgang, nicht in einzelne UI-Handler. Ein voll bebautes Gebiet ist
keine Voraussetzung. Der Editor speichert auch Freischaltungen nicht.

Die Kamera bleibt an freigeschaltetem Land; auch in ungekauften Zwischenraeumen
unregelmaessiger Staedte muss Land im Ausschnitt bleiben. **Zum Startgebiet**
kehrt zum Ausgangsviertel zurueck. Der Mindestzoom fuellt die sichtbare Flaeche
mit Land (Maximum aus Breiten- und Hoehenverhaeltnis statt Komplettansicht).
**Ausrichten** zentriert mit diesem sicheren Zoom; je nach Bildschirmformat
bleibt ein Teil der Stadt ausserhalb des Ausschnitts.
`ResizeObserver`, p5-Fensterresize, Orientierungs- und
VisualViewport-Ereignisse werden pro Animationsframe gebuendelt. Beim
Formatwechsel bleiben Weltmittelpunkt und Zoom erhalten, soweit die
Kameragrenzen es erlauben. Im Ausrichten-Modus wird erneut eingepasst.
Zeichenreihenfolgen werden fuer den sichtbaren Ausschnitt berechnet; Undo
enthaelt keine unveraenderten leeren Wiesen.
Der Canvas wird pro Frame transparent geleert. Dahinter liegt ein einfarbiger,
tiefblauer CSS-Hintergrund (#0b1638), kein Thumbnail.
Ein dezentes isometrisches Linienraster wird vor dem Boden in Weltkoordinaten
gezeichnet. Es folgt exakt den 64x32-Tilekanten, bewegt und zoomt mit der Kamera
und deutet im freien Hintergrund weitere Zellen an. Die Linien bleiben einen
Bildschirmpixel breit; berechnet wird nur der sichtbare Ausschnitt.
Das Raster erzeugt weder Bauzellen noch zusaetzliche Freischaltmoeglichkeiten.

Waehrung, Gebaeudedrehung, Interaktionen und Minispiele sind noch nicht
implementiert.

### Groessen der Spieloberflaeche

Die Groessenvorgaben liegen in [style.css](spiel/style.css): `--tile` plus
16 Pixel bestimmt die Objekt-Klickflaeche, `--category-size` die Kategorie-
und Wiesen-Kacheln, `--btn` die Werkzeugknopfgroesse. `--dock-pad` und
`--dock-h` halten die unteren Abstaende und die Tutorial-Hoehen konsistent.
Die Kamera misst die echte Dockhoehe weiterhin direkt am DOM.

Mobil sind Kategorien 52 und Objekte 56 Pixel gross, in flachem Querformat
48 beziehungsweise 52 Pixel. Auf dem Desktop sind Kategorien und Objekte
gleich gross: jeweils 72 Pixel, in grossen Desktop-Ansichten jeweils
80 Pixel. Werkzeuge bleiben 48 Pixel gross; die Bildschirmaufloesung
vergroessert weder Schrift noch alle Knopfgroessen pauschal. Sichtbare
Modus-Icons sind kleiner als ihre mindestens 44 Pixel grossen Klickflaechen.
Die Bewegungstasten verwenden die 120-Pixel-Standardgroesse des
[TouchController](spiel/charakter/character-ui.js).

Die Objektleiste reserviert rechts Platz fuer die Suche. Tutorial und
Reset-Auswahl nutzen auf kleinen Bildschirmen mehr Breite statt kleinerer
Schrift oder unter 44 Pixel hoher Aktionsknopfe. Lange Tutorialtexte und
Figuren-Auswahlen bleiben scrollbar. Hinweise sind an die nutzbare
Bildschirmbreite begrenzt und duerfen umbrechen.

## Tests

Mit installiertem Node.js die automatisierten Kern- und Kompatibilitaetstests
aus dem Projektordner ausfuehren:

```text
node --test tests/*.test.js
```

Diese Tests ersetzen keinen Browser-Test von Grafik, Eingabe, Touch und
Avatarbewegung. [viewport-land.test.js](tests/viewport-land.test.js) prueft
Formatwechsel und Erweiterungsinteraktionen mit DOM-/p5-Testdoubles in Node,
ohne Browser. Visuell manuell pruefen: Hoch-/Querformat und Fenstergroesse
wechseln, ausgegraute Wiesenstreifen und Rand-Plus pruefen,
Erweiterung abbrechen/bestaetigen, neu laden, ueber eine
Grundstuecksgrenze bauen und zum Startgebiet zurueckkehren.

## Tile-Werkstatt

[Katalog/](Katalog/) enthaelt die Tile-Bilder. Die Datei
[tile-catalog.json](daten/tile-catalog.json) enthaelt dagegen deren IDs,
Eigenschaften und Regeln. `assetPath` bezeichnet den physischen Bildpfad,
waehrend `category` unabhaengig davon den UI-Ordner bestimmt. Tile- und
Ordnerreihenfolge sowie Ordner-Icons sind ebenfalls Katalogmetadaten. Neue
Bilder koennen daher direkt in `Katalog/` abgelegt und in der Werkstatt in
einen UI-Ordner gezogen werden; bestehende Unterordner muessen nicht
umorganisiert werden. Der Name des Bildordners ist nicht Teil einer Tile-ID
oder eines Spielstands.

Unter Windows [Tile-Werkstatt.cmd](Tile-Werkstatt.cmd) starten (Node.js muss
installiert sein). Alternativ im Projektordner
`node tools/tile-workshop-server.js` ausfuehren und
`http://127.0.0.1:8766/` im Browser oeffnen. Das Fenster mit dem Server muss
offen bleiben; Strg+C beendet ihn. Der Server lauscht nur lokal und braucht
keine zusaetzlichen Pakete. Die Werkstatt bearbeitet `daten/tile-catalog.json`;
erst **Aenderungen speichern** schreibt die Datei. Bei externen Aenderungen
waehrend der Bearbeitung wird das Speichern verweigert und ein erneutes
Einlesen verlangt.

Kategorien und Farbfamilien lassen sich ueber den Aufklapppfeil einzeln
einklappen. Die Detailabschnitte und die Tag-Sammlung sind ebenfalls
einklappbar. **Alles einklappen** und **Alles ausklappen** gelten fuer alle
Bereiche einschliesslich verschachtelter Familienmitglieder. Der Zustand bleibt
beim Bearbeiten und Filtern bis zum Neuladen erhalten, aendert aber nicht den
Katalog. Eingeklappte Ueberschriften bleiben Drag-and-drop-Ziele.
**Sichtbare Tiles auswaehlen** beruecksichtigt nur ausgeklappte Objekte.
Pruef- und Fehlermeldungen bleiben ausserhalb der einklappbaren Detailabschnitte.

Die Werkstatt zeigt PNG- und GIF-Bilder ausser Kategorie-Icons und dem
separaten `Katalog/Icons/`-Ordner. Tile-Bilder koennen zur vergroesserten
Vorschau angeklickt werden. Durch Ziehen lassen sich Tiles zwischen UI-Ordnern
verschieben und innerhalb eines Ordners sortieren; Ordner lassen sich ebenfalls
sortieren. Ordner-Icons koennen als PNG hinzugefuegt und zugeordnet werden. Die Werkstatt vergleicht
die Dateien mit den im Katalog gespeicherten SHA-256-Pruefsummen:

- Neue Dateien anlegen, Eigenschaften festlegen und auf **Freigegeben** setzen.
- Bei veraendertem Inhalt bewusst zwischen gleicher Tile-Identitaet und einem
  neuen Tile entscheiden. Bei einem neuen Tile werden alte Regeln nicht uebernommen.
- Bei Verschiebungen eine vorgeschlagene Zuordnung bestaetigen. Identische
  Dateien koennen mehrdeutig sein und erfordern eine manuelle Auswahl. Ein
  neues Bild kann auch manuell einem fehlenden Tile zugeordnet werden, wenn
  sich sowohl Pfad als auch Inhalt geaendert haben.
- Vorlagen speichern Regeln gemeinsam; Aenderungen daran gelten fuer alle
  zugeordneten Tiles. Beim Wechsel zu **Eigene Regeln** werden die vorherigen
  eigenen Regeln des Tiles wieder aktiv, nicht die Regeln der Vorlage kopiert.
  **Regeln dieses Tiles zuruecksetzen** loest die Vorlage und setzt eigene
  Regeln sowie Sonderregeln auf Standard; die geteilte Vorlage bleibt erhalten.
  Mit Checkboxen und **Vorlage auf Auswahl anwenden**
  koennen mehrere Tiles gleichzeitig zugeordnet werden. Unterschiedliche Typen
  koennen eine Vorlage ungueltig machen; die Pruefung zeigt dies an.
- **Im Spiel ausblenden** entfernt ein Tile einschliesslich seiner Farbvariante
  aus Palette und Suche, nicht aber aus dem Katalog oder bestehenden
  Spielstaenden. Es kann jederzeit wieder eingeblendet werden. Die Wiese
  bleibt immer verfuegbar. Das dauerhafte Loeschen von Bilddateien wird
  nicht angeboten.
- Neben der detaillierten Liste gibt es eine zoombare Kachelansicht mit
  farbigen Kategorien und Familien sowie eine kompakte Liste mit eingerueckten
  Bildern. Suche, Statusfilter und Auswahl gelten fuer alle Ansichten.
  In den bildlichen Ansichten verschiebt Ziehen eines Bilds ein einzelnes
  Tile; beim Wechsel der Kategorie loest es sich aus seiner Familie. Ziehen
  auf eine Familienbox ordnet es bei passendem Typ und Grundflaeche zu.
  Der Familiengriff verschiebt weiterhin die ganze Familie. Bleibt nach dem
  Herausloesen nur ein Mitglied uebrig, wird die Gruppierung aufgeloest.
- Die Suchbegriffe enthalten vorhandene CSV-Tags sowie aus Tile-Namen und
  Ordnern ergaenzte deutsche Synonyme. Sie koennen pro Tile weiter bearbeitet
  werden.
- Unter **Tags gemeinsam sammeln** kann ein eigenstaendiger HTML-Bilderbogen
  mit eingebetteten Tile-Bildern heruntergeladen werden. Mitwirkende ergaenzen
  dort Tags und laden eine JSON-Rueckmeldung herunter. Der Import fuegt neue
  Begriffe anhand stabiler Tile-IDs hinzu, behaelt vorhandene Tags bei und
  ignoriert unbekannte IDs.
- Erlaubte OVER-Tiles werden als anklickbare Bildauswahl bearbeitet; weitere
  Tiles lassen sich einzeln hinzufuegen, ohne Strg gedrueckt zu halten. Der
  Bereich **Sonderregeln fuer dieses Tile** kann unabhaengig von einer
  geteilten Regelvorlage einzelne OVER-Tiles erlauben oder ausschliessen.
  Sonderregeln bleiben beim Vorlagenwechsel erhalten und koennen dort separat
  zurueckgesetzt werden.
- Laufregeln zeigen die isometrischen Richtungen als Pfeile ueber dem
  Tile-Bild. Pro Richtung gibt es direkt waehlbare Zustandskaestchen fuer
  gesperrt, eben, Rampe hinauf und Rampe hinunter; Ebenen werden passend in
  die bisherigen numerischen Laufwerte uebersetzt.

## Farbvarianten

Der Katalog kann unter `families` Farbvarianten zusammenfassen. Eine Familie
hat eine stabile ID, einen Namen, einen UI-Ordner, eine `defaultTileId` und
eine geordnete Liste `variants` mit `tileId`, `label` und optionaler Kennfarbe
`color` (`null` oder sechsstelliger Hex-Farbwert). Die Bilddateien, Tile-IDs,
Suchbegriffe und Regeln bleiben unveraendert. Als erste Beispielgruppe sind
Altbau_1, Altbau_2 und Altbau_3 aus `1_Hauslinks` zusammengefasst; Altbau_4 und
Altbau_5 sind andere Objekte und bleiben einzeln.

In der Werkstatt im Tile-Detailbereich **Variantenfamilie** verwenden:

- **Farbfamilie anlegen**, danach ueber die suchbare Bildauswahl weitere
  kompatible Tiles hinzufuegen. Alternativ ein Tile einer bestehenden Familie
  im gleichen UI-Ordner zuordnen.
- Familienname, Standardvariante, Farbnamen, Kennfarben und Reihenfolge
  bearbeiten. Kennfarben koennen per Farbfeld oder Hexwert gesetzt und
  wieder entfernt werden; die Varianteneigenschaften lassen sich gemeinsam
  kompakt einklappen. Die Vorschau zeigt den Standard-Paletteneintrag; im Spiel
  uebersteuert die zuletzt gewaehlte Farbe diesen Standard.
- Die Uebersicht zeigt eine Familienzeile und eingerueckte Mitglieder. Der
  Statusfilter kann auf Familienmitglieder eingeschraenkt werden.
- Innerhalb derselben Farbfamilie lassen sich Mitglieder durch Ziehen auf ein
  anderes Mitglied umsortieren. Alternativ im Detailbereich **Nach vorn** und
  **Nach hinten** verwenden. **Aenderungen speichern** sichert die Reihenfolge
  fuer die Farbauswahl im Spiel; die Standardvariante bleibt unveraendert.
- Die Uebersicht bietet einen **↕**-Griff fuer Kategorien, ganze Familien und
  einzelne Objekte. Der Familiengriff verschiebt immer die gesamte Familie;
  der Objektgriff sortiert innerhalb derselben Familie die einzelne Variante.
  Familienkoepfe dienen ebenfalls als Ablageziel zum Einsortieren davor.
- **Aus Familie loesen** und **Familie aufloesen** entfernen nur die
  Gruppierung, keine Tiles oder Regeln. Eine speicherbare Familie braucht
  mindestens zwei Mitglieder. Wird ihr letztes Mitglied entfernt, wird
  auch die leere Familie entfernt.
- Der Familiengriff und die UI-Ordner-Auswahl im Detail verschieben die
  gesamte Familie. Die einzelnen Dateipfade bleiben erhalten.

Die gemeinsame Pruefung in
[tile-catalog-model.js](gemeinsam/tile-catalog-model.js) verlangt eindeutige
Mitgliedschaften, gleiche Typen und Grundflaechen. Platzierungs- und Laufregeln
duerfen sich zwischen Mitgliedern unterscheiden; Familien erben keine Regeln.
Ungueltige Familien koennen nicht ueber die Werkstatt gespeichert werden. Im
Spiel werden sie diagnostisch gemeldet und ihre verfuegbaren Tiles einzeln
angezeigt; sie blockieren den Spielstart nicht. Fehlende oder ungueltige
einzelne Bilder werden weiterhin uebersprungen; verbleibende Geschwister
bleiben nutzbar.

[tile-variants.js](spiel/ui/tile-variants.js) fasst Palette, Suche und
**Zuletzt benutzt** nach Familie zusammen. Die Suche beruecksichtigt
Mitgliedsnamen, Tags und Farbnamen. Ein Klick waehlt die zuletzt verwendete
Variante und oeffnet direkt am Icon eine kompakte, rein bildliche Leiste:
28-Pixel-Vorschauen in 44-Pixel-Klickflaechen, ohne sichtbare Beschriftung,
Ueberschrift oder Schliessen-Knopf. Optionale Farbstreifen unter den Bildern
helfen bei der Unterscheidung; Farbnamen bleiben fuer Screenreader erhalten.
Die Leiste verschiebt keine anderen Icons. Farbauswahl aendert nur das
Bauwerkzeug und die Familien-Icons, nie schon platzierte Objekte.
Tippen ausserhalb, Platzieren, Kategorie-/Moduswechsel, Scrollen und Escape
schliessen die Leiste.
Bei Tastaturauswahl erhaelt die aktive Farbe direkt den Fokus. Mit Tab sind
die weiteren Varianten erreichbar; Escape gibt den Fokus ans Icon zurueck.

Die letzte Farbe wird pro Familie unabhaengig vom Stadtspielstand unter
`nordstadt-tile-variants-v1` im lokalen Browser gespeichert. Nicht mehr
verfuegbare Farben fallen auf die Standardvariante oder das erste verfuegbare
Mitglied zurueck. Spielstaende speichern weiterhin konkrete Tile-IDs; fuer
diese Gruppierung ist keine Spielstandmigration erforderlich.

Familie und konkrete Variante sind getrennt und koennen spaeter um weitere
Auswahleigenschaften ergaenzt werden. Drehung, Spiegelung und echte
Einfaerbung/Instanztransformationen sind noch nicht implementiert. Insbesondere
ist eine isometrische Drehung nicht einfach eine CSS-Drehung des Bilds:
Grundflaeche, Laufrichtungen und passende Ansichten muessen mitgedacht werden.

## Fehlerbehandlung und Dateiaktualisierungen

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
