// Das Format v1 bleibt kompatibel mit bestehenden Staedten im Browser.
const SAVE_KEY = "nordi-savegame-v1";

class SaveGame {
  constructor({ board, getCatalog, editorMode }) {
    this.board = board;
    this.getCatalog = getCatalog;
    this.editorMode = editorMode;
    this.enabled = false;
    this.timer = null;
  }

  enable() {
    this.enabled = true;
  }

  schedule() {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 400);
  }

  save() {
    if (!this.enabled || this.editorMode) return;

    try {
      const { definitions, images, meadowIndex } = this.getCatalog();
      const tileId = (image) => {
        const def = definitions[images.indexOf(image)];
        return def ? def.id || `${def.category}/${def.file}` : null;
      };
      const snap = this.board.snapshot();
      const data = {
        v: definitions.some((def) => def.id) ? 2 : 1,
        cells: snap.cells
          .map(([key, ground, groundType, overlay, locked, overlayBack]) => [key, tileId(ground), groundType, overlay ? tileId(overlay) : null, locked, overlayBack ? tileId(overlayBack) : null])
          .filter(([, ground, , overlay, locked]) => ground !== tileId(images[meadowIndex]) || overlay || locked),
        buildings: snap.buildings.map(([gx, gy, w, h, image, locked]) => [gx, gy, w, h, tileId(image), locked]),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("Speichern fehlgeschlagen", error);
    }
  }

  load() {
    if (this.editorMode) return;

    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (![1, 2].includes(data.v) || !Array.isArray(data.cells) || !Array.isArray(data.buildings)) {
        throw new Error("Unbekanntes oder ungueltiges Spielstandformat");
      }
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
      const snap = this.board.snapshot();
      const meadow = images[meadowIndex];
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
        if (cell && lookup(ground)) {
          cell[1] = lookup(ground);
          cell[2] = groundType;
          cell[3] = overlay ? lookup(overlay) || null : null;
          cell[4] = locked;
          cell[5] = overlayBack ? lookup(overlayBack) || null : null;
        }
      }

      snap.buildings = data.buildings
        .filter(([gx, gy, , , id]) => this.board.get(gx, gy) && lookup(id))
        .map(([gx, gy, w, h, id, locked]) => [gx, gy, w, h, byId.get(id), locked]);

      this.board.restore(snap);
      this.board.history = [];
      if (missing.size) {
        const message = `Spielstand: ${missing.size} nicht verfuegbare Tiles uebersprungen. Autosave kann den Spielstand ohne diese Tiles ueberschreiben: ${[...missing].join(", ")}`;
        console.warn(message);
        if (typeof showCatalogWarnings === "function") showCatalogWarnings([message]);
      }
    } catch (error) {
      console.warn("Laden fehlgeschlagen", error);
      if (typeof showCatalogWarnings === "function") showCatalogWarnings([`Spielstand konnte nicht geladen werden: ${error.message}. Automatisches Speichern kann ihn ueberschreiben.`]);
    }
  }
}
