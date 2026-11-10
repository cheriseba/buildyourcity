// Derselbe Speicherschluessel fuer v1/v2 (Tiles) und v3 (Tiles plus Grundstuecke).
const SAVE_KEY = "nordi-savegame-v1";
// Nur bei Updates erhoehen, die einen bestaetigten Neustart benoetigen.
const SAVE_COMPATIBILITY_VERSION = 1;

class SaveGame {
  constructor({ board, getCatalog, editorMode }) {
    this.board = board;
    this.getCatalog = getCatalog;
    this.editorMode = editorMode;
    this.enabled = false;
    this.timer = null;
    this.pendingReset = false;
    this.loaded = false;
    this.loadError = null;
    this.missingTiles = 0;
  }

  enable() {
    if (!this.pendingReset) this.enabled = true;
  }

  disable() {
    clearTimeout(this.timer);
    this.timer = null;
    this.enabled = false;
  }

  schedule() {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 400);
  }

  save() {
    if (!this.enabled || this.editorMode || this.pendingReset) return false;
    clearTimeout(this.timer);
    return this.write(this.board);
  }

  acceptReset(newBoard) {
    if (this.editorMode || !this.pendingReset) return false;
    if (!this.write(newBoard)) return false;
    this.pendingReset = false;
    this.loadError = null;
    this.missingTiles = 0;
    this.loaded = true;
    this.enable();
    return true;
  }

  write(board) {
    try {
      const { definitions, images, meadowIndex } = this.getCatalog();
      const tileId = (image) => {
        const def = definitions[images.indexOf(image)];
        return def ? def.id || `${def.category}/${def.file}` : null;
      };
      const snap = board.snapshot();
      const data = {
        v: 3,
        compatibility: SAVE_COMPATIBILITY_VERSION,
        parcels: board.land.snapshot(),
        cells: snap.cells
          .map(([key, ground, groundType, overlay, locked, overlayBack]) => [key, tileId(ground), groundType, overlay ? tileId(overlay) : null, locked, overlayBack ? tileId(overlayBack) : null])
          .filter(([, ground, , overlay, locked]) => ground !== tileId(images[meadowIndex]) || overlay || locked),
        buildings: snap.buildings.map(([gx, gy, w, h, image, locked]) => [gx, gy, w, h, tileId(image), locked]),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn("Speichern fehlgeschlagen", error);
      if (typeof showToast === "function") showToast("Speichern fehlgeschlagen. Bitte Browser-Speicher pr\u00fcfen.");
      return false;
    }
  }

  load() {
    if (this.editorMode) return;
    const wasEnabled = this.enabled;
    this.disable();
    this.pendingReset = false;
    this.loaded = false;
    this.loadError = null;
    this.missingTiles = 0;

    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      this.pendingReset = data.compatibility !== SAVE_COMPATIBILITY_VERSION;
      if (![1, 2, 3].includes(data.v) || !Array.isArray(data.cells) || !Array.isArray(data.buildings)) {
        throw new Error("Unbekanntes oder ungueltiges Spielstandformat");
      }
      if (data.v === 3) WorldLand.validate(data.parcels);
      const land = new WorldLand(data.v === 3 ? data.parcels : WorldLand.legacyParcels());
      const { definitions, images, meadowIndex } = this.getCatalog();
      const byId = new Map();
      definitions.forEach((def, i) => {
        if (def.id) byId.set(def.id, images[i]);
        const aliases = def.legacyIds || [`${def.category}/${def.file}`];
        aliases.forEach((id) => {
          if (byId.has(id) && byId.get(id) !== images[i]) {
            throw new Error(`Mehrdeutige alte Tile-ID: ${id}`);
          }
          byId.set(id, images[i]);
        });
      });
      const meadow = images[meadowIndex];
      const loadedBoard = new Board();
      buildBoard(loadedBoard, meadow, land);
      const snap = loadedBoard.snapshot(true);
      const missing = new Set();
      const lookup = (id) => {
        if (id && !byId.has(id)) missing.add(id);
        return byId.get(id);
      };

      for (const cell of snap.cells) {
        cell[1] = meadow;
        cell[2] = "UNDER";
        cell[3] = null;
        cell[4] = false;
        cell[5] = null;
      }
      const cellMap = new Map(snap.cells.map((cell) => [cell[0], cell]));

      for (const [key, ground, groundType, overlay, locked, overlayBack] of data.cells) {
        const cell = cellMap.get(key);
        if (!cell && data.v === 3) throw new Error("Tile liegt ausserhalb der freigeschalteten Grundstuecke");
        if (cell && lookup(ground)) {
          cell[1] = lookup(ground);
          cell[2] = groundType;
          cell[3] = overlay ? lookup(overlay) || null : null;
          cell[4] = locked;
          cell[5] = overlayBack ? lookup(overlayBack) || null : null;
        }
      }

      snap.buildings = data.buildings
        .filter(([gx, gy, w, h, id]) => {
          if (!Number.isSafeInteger(gx) || !Number.isSafeInteger(gy) ||
              !Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1) {
            throw new Error("Ungueltige Gebaeudekoordinaten im Spielstand");
          }
          const anchor = loadedBoard.get(gx, gy);
          if (!anchor || !loadedBoard.footprint(anchor, w, h)) {
            throw new Error("Gebaeude liegt ausserhalb der freigeschalteten Grundstuecke");
          }
          return lookup(id);
        })
        .map(([gx, gy, w, h, id, locked]) => [gx, gy, w, h, byId.get(id), locked]);

      loadedBoard.restore(snap);
      buildBoard(this.board, meadow, land);
      this.board.restore(loadedBoard.snapshot());
      this.board.history = [];
      this.loaded = true;
      this.missingTiles = missing.size;
      if (missing.size) {
        const notice = this.pendingReset
          ? "Der Originalstand bleibt bis zur Updatebestaetigung erhalten. Das Stadtbild ist ohne diese Tiles unvollstaendig"
          : "Autosave kann den Spielstand ohne diese Tiles ueberschreiben";
        const message = `Spielstand: ${missing.size} nicht verfuegbare Tiles uebersprungen. ${notice}: ${[...missing].join(", ")}`;
        console.warn(message);
        if (typeof showCatalogWarnings === "function") showCatalogWarnings([message]);
      }
    } catch (error) {
      this.pendingReset = true;
      this.loadError = error.message;
      console.warn("Laden fehlgeschlagen", error);
      if (typeof showToast === "function") showToast("Spielstand konnte nicht geladen werden.");
      if (typeof showCatalogWarnings === "function") showCatalogWarnings([`Spielstand konnte nicht geladen werden: ${error.message}. Automatisches Speichern ist bis zur Bestaetigung gesperrt.`]);
    } finally {
      if (wasEnabled) this.enable();
    }
  }
}
