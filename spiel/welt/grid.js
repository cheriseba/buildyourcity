// Isometrisches Gitter: eine Zelle ist eine Raute von 64x32 px, das Tile-Bild ist 64x64 px.
// Logische Koordinaten (gx, gy): gx laeuft nach rechts unten, gy nach links unten.
const TILE_IMG = 64;
const CELL_W = 64;
const CELL_H = 32;
const GRID_ORIGIN_X = 0;
const GRID_ORIGIN_Y = -64;
// Mittelpunkt der Zelle relativ zur oberen linken Ecke des Bildes
const CELL_CENTER_X = 32;
const CELL_CENTER_Y = 40;

const HISTORY_LIMIT = 50;

function renderBounds(item) {
  const height = item instanceof Tile
    ? Math.max(...[item.ground, ...item.overlays()].map((image) => image.height * TILE_IMG / image.width))
    : item.drawH;
  const y = item instanceof Tile ? item.y + TILE_IMG - height : item.y;
  return { minX: item.x, minY: y, maxX: item.x + item.drawW, maxY: y + height };
}
// ?editor in der URL: feste Tiles sind aenderbar und das Menue bietet "Layout exportieren"
const EDITOR_MODE = new URLSearchParams(window.location.search).has("editor");

// Obere linke Bildposition einer Zelle in Weltkoordinaten
function gridToScreen(gx, gy) {
  return {
    x: GRID_ORIGIN_X + ((gx - gy) * CELL_W) / 2,
    y: GRID_ORIGIN_Y + ((gx + gy) * CELL_H) / 2,
  };
}

// Zelle unter einem Punkt in Weltkoordinaten (kann ausserhalb des Boards liegen)
function screenToGrid(wx, wy) {
  const d = (wx - CELL_CENTER_X - GRID_ORIGIN_X) / (CELL_W / 2);
  const s = (wy - CELL_CENTER_Y - GRID_ORIGIN_Y) / (CELL_H / 2);
  return { gx: Math.round((s + d) / 2), gy: Math.round((s - d) / 2) };
}

function createGroundTiles(rect, initialImage) {
  const cells = [];
  const minRow = Math.ceil((rect.minY - GRID_ORIGIN_Y - CELL_CENTER_Y) / (CELL_H / 2)) - 1;
  const maxRow = Math.ceil((rect.maxY - GRID_ORIGIN_Y - CELL_CENTER_Y) / (CELL_H / 2)) - 1;
  for (let row = minRow; row < maxRow; row++) {
    const even = row % 2 === 0;
    const offsetX = even ? 0 : CELL_W / 2;
    const minCol = Math.ceil((rect.minX - offsetX) / CELL_W);
    const maxCol = Math.ceil((rect.maxX - offsetX) / CELL_W);
    for (let k = minCol; k < maxCol; k++) {
      const gx = even ? row / 2 + k : (row + 1) / 2 + k;
      const gy = even ? row / 2 + 1 - k : (row + 1) / 2 - k;
      cells.push(new Tile(gx, gy, initialImage));
    }
  }
  return cells;
}

class Board {
  constructor(onChange = () => {}) {
    this.cells = new Map();
    this.buildings = new Set();
    this.history = [];
    this.onChange = onChange;
    this.land = new WorldLand();
    this.initialImage = null;
    this.sortedCells = null;
  }

  static key(gx, gy) {
    return `${gx},${gy}`;
  }

  get(gx, gy) {
    return this.cells.get(Board.key(gx, gy));
  }

  set(tile) {
    this.cells.set(tile.key, tile);
    this.sortedCells = null;
  }

  // Zeichenreihenfolge: hinten (kleine Tiefe) zuerst, vorne zuletzt
  sorted() {
    if (!this.sortedCells) {
      this.sortedCells = [...this.cells.values()].sort((a, b) => a.gx + a.gy - (b.gx + b.gy) || a.gx - b.gx);
    }
    return this.sortedCells;
  }

  // Zeichenliste mit Gebaeuden: Basis ist die Tiefensortierung der freien Zellen. Fuer Gebaeude gilt zusaetzlich:
  // a liegt hinter b, wenn a komplett kleinere gx- oder gy-Werte hat. Diese Paare (nur bei sich ueberlappenden
  // Bildern) werden per topologischer Sortierung erzwungen.
  drawOrder(characterToRender = null, visible = null) {
    const depth = (o) => {
      // Character: vorderste Zelle, die er gerade beruehrt (aufrunden) plus Offset. So steht er beim Laufen
      // zwischen zwei Zellen vor beiden Tiles und wird von keinem Nachbar-Tile ueberdeckt.
      if (characterToRender && o === characterToRender) {
        return Math.ceil(o.gx - 1e-6) + Math.ceil(o.gy - 1e-6) + 0.5;
      }
      return o.maxX + o.maxY;
    };
    const inView = (item) => {
      if (!visible) return true;
      const bounds = renderBounds(item);
      return bounds.maxX >= visible.minX && bounds.minX <= visible.maxX &&
        bounds.maxY >= visible.minY && bounds.minY <= visible.maxY;
    };
    const drawItems = [...this.sorted().filter((tile) => !tile.owner && inView(tile)), ...[...this.buildings].filter(inView)];
    
    // Füge den Character hinzu
    if (characterToRender) {
      drawItems.push(characterToRender);
    }
    
    const items = drawItems.sort(
      (a, b) => depth(a) - depth(b) || a.minX - b.minX || a.minY - b.minY
    );
    const n = items.length;
    const out = items.map(() => []);
    const indeg = new Array(n).fill(0);
    const behind = (a, b) => a.maxX < b.minX || a.maxY < b.minY;
    const overlaps = (a, b) => {
      const ra = renderBounds(a), rb = renderBounds(b);
      return ra.minX < rb.maxX && ra.maxX > rb.minX && ra.minY < rb.maxY && ra.maxY > rb.minY;
    };

    items.forEach((b, j) => {
      if (!(b instanceof Building)) {
        return;
      }

      items.forEach((a, i) => {
        if (i === j || (a instanceof Building && i > j) || !overlaps(a, b)) {
          return;
        }

        const ab = behind(a, b);
        const ba = behind(b, a);
        // bei widerspruechlichen oder fehlenden Regeln entscheidet die Basisreihenfolge (kleiner Index zuerst)
        const aFirst = ab !== ba ? ab : i < j;
        const [from, to] = aFirst ? [i, j] : [j, i];
        out[from].push(to);
        indeg[to]++;
      });
    });

    const result = [];
    const done = new Array(n).fill(false);
    let next = 0;

    while (result.length < n) {
      let pick = -1;
      for (let i = next; i < n; i++) {
        if (!done[i] && indeg[i] === 0) {
          pick = i;
          break;
        }
      }

      if (pick === -1) {
        // Zyklus: kleinsten noch offenen Index nehmen
        pick = done.indexOf(false);
      }

      done[pick] = true;
      result.push(items[pick]);
      out[pick].forEach((to) => indeg[to]--);
      while (next < n && done[next]) {
        next++;
      }
    }

    return result;
  }

  refresh() {
    this.onChange(this);
  }

  // Feste Tiles (Startlayout) lassen sich nicht aendern; im Editor-Modus (?editor) schon.
  isLocked(cell) {
    return cell.locked && !EDITOR_MODE;
  }

  removeBuilding(building) {
    building.cells.forEach((cell) => {
      cell.owner = null;
      if (building.locked) {
        cell.locked = false;
      }
    });
    this.buildings.delete(building);
  }

  // Rueckgaengig: Zustand vor jeder Aenderung merken (max. HISTORY_LIMIT Schritte)
  snapshot(includeEmpty = false) {
    return {
      cells: [...this.cells.values()]
        .filter((c) => includeEmpty || c.ground !== this.initialImage || c.groundType !== "UNDER" || c.overlay || c.overlayBack || c.locked)
        .map((c) => [c.key, c.ground, c.groundType, c.overlay, c.locked, c.overlayBack]),
      buildings: [...this.buildings].map((b) => [b.anchor.gx, b.anchor.gy, b.w, b.h, b.image, b.locked]),
    };
  }

  record(snap) {
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) {
      this.history.shift();
    }
  }

  undo() {
    const snap = this.history.pop();
    if (!snap) {
      return false;
    }

    this.restore(snap);
    return true;
  }

  restore(snap) {
    this.buildings.clear();
    // Freischaltungen gehoeren nicht zum Bau-Undo. Neue Zellen bleiben als Wiese erhalten.
    for (const cell of this.cells.values()) {
      cell.reset(this.initialImage);
      cell.locked = false;
      cell.owner = null;
    }
    for (const [key, ground, groundType, overlay, locked, overlayBack] of snap.cells) {
      const cell = this.cells.get(key);
      cell.ground = ground;
      cell.groundType = groundType;
      cell.overlay = overlay;
      cell.overlayBack = overlayBack || null;
      cell.locked = locked;
      cell.owner = null;
    }

    for (const [gx, gy, w, h, image, locked] of snap.buildings) {
      this.addBuilding(this.get(gx, gy), w, h, image, locked);
    }

    this.refresh();
  }

  addBuilding(anchor, w, h, image, locked = false) {
    const building = new Building(anchor, w, h, image);
    building.locked = locked;
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const cell = this.get(anchor.gx + dx, anchor.gy + dy);
        building.cells.push(cell);
        cell.owner = building;
        cell.locked = locked;
      }
    }
    this.buildings.add(building);
    return building;
  }

  addParcelCells(parcel) {
    for (const tile of createGroundTiles(this.land.rect(parcel), this.initialImage)) this.set(tile);
  }

  unlockParcel(x, y) {
    this.land.unlock(x, y);
    this.addParcelCells({ x, y });
    this.refresh();
  }

  // Alles auf Wiese zuruecksetzen, ausser feste Tiles (auch rueckgaengig machbar)
  clearAll(meadow) {
    this.record(this.snapshot());
    for (const building of [...this.buildings]) {
      if (!(building.locked && !EDITOR_MODE)) {
        this.removeBuilding(building);
      }
    }
    for (const cell of this.cells.values()) {
      if (!this.isLocked(cell)) {
        cell.owner = null;
        cell.locked = false;
        cell.reset(meadow);
      }
    }
    this.refresh();
  }

  // Zelle leeren (Wiese als Radierer): entfernt auch ein Gebaeude, das die Zelle belegt.
  // false, wenn die Zelle fest ist.
  erase(tile, meadow) {
    if (this.isLocked(tile)) {
      return false;
    }

    this.record(this.snapshot());
    if (tile.owner) {
      this.removeBuilding(tile.owner);
    }
    tile.locked = false;
    tile.reset(meadow);
    this.refresh();
    return true;
  }

  eraseOverlay(tile) {
    if (this.isLocked(tile)) {
      return "locked";
    }
    if (!tile.overlay) {
      return false;
    }

    this.record(this.snapshot());
    tile.setOverlays(tile.overlays().slice(0, -1));
    this.refresh();
    return true;
  }

  // Tile aus dem Startlayout setzen (ohne Verlauf). (gx, gy) ist bei Gebaeuden die hinterste Zelle.
  placeLayout(gx, gy, image, def, meadow, locked) {
    const anchor = this.get(gx, gy);
    const w = def.w || 1;
    const h = def.h || 1;

    if (!anchor || !this.footprint(anchor, w, h)) {
      return false;
    }

    const overGround = anchor.owner || anchor.groundType === "FULL" ? meadow : anchor.ground;
    if (def.type === "OVER" && (w * h !== 1 || (anchor.overlay && !halfOverPosition(anchor.overlay) && !halfOverPosition(image)) || anchor.overlayBack || !isOverAllowed(overGround, image))) {
      return false;
    }

    if (w * h === 1) {
      if (def.type === "OVER") {
        if (anchor.owner) {
          this.removeBuilding(anchor.owner);
        }
        if (anchor.groundType === "FULL") {
          anchor.reset(meadow);
        }
      }
      anchor.place(image, def.type);
      anchor.locked = locked;
    } else {
      for (const cell of this.footprint(anchor, w, h)) {
        cell.reset(meadow);
      }
      this.addBuilding(anchor, w, h, image, locked);
    }

    return true;
  }

  // Platziert ein Tile. Mehrzellige Tiles werden an ihrer vordersten Zelle (angeklickt) verankert.
  // Ergebnis: true, "space", "locked" oder "over-not-allowed".
  place(tile, image, def, meadow) {
    const w = def.w || 1;
    const h = def.h || 1;

    if (def.type === "OVER" && w * h !== 1) {
      return "space";
    }

    if (w * h === 1) {
      if (this.isLocked(tile)) {
        return "locked";
      }
      const overGround = tile.owner || tile.groundType === "FULL" ? meadow : tile.ground;
      if (def.type === "OVER" && !isOverAllowed(overGround, image)) {
        return "over-not-allowed";
      }
      const snap = this.snapshot();
      tile.locked = false;
      if (tile.owner) {
        this.removeBuilding(tile.owner);
      }
      if (def.type === "OVER" && tile.groundType === "FULL") {
        tile.reset(meadow);
      }
      tile.place(image, def.type);
      this.record(snap);
      this.refresh();
      return true;
    }

    const anchor = this.get(tile.gx - w + 1, tile.gy - h + 1);

    const cells = anchor && this.footprint(anchor, w, h);

    if (!cells) {
      return "space";
    }

    if (cells.some((cell) => this.isLocked(cell))) {
      return "locked";
    }

    const snap = this.snapshot();
    this.record(snap);
    for (const cell of cells) {
      if (cell.owner) {
        this.removeBuilding(cell.owner);
      }
      cell.locked = false;
      cell.reset(meadow);
    }

    this.addBuilding(anchor, w, h, image);
    this.refresh();
    return true;
  }

  // Alle Zellen des Footprints oder null, wenn eine fehlt
  footprint(anchor, w, h) {
    const cells = [];
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const cell = this.get(anchor.gx + dx, anchor.gy + dy);
        if (!cell) {
          return null;
        }
        cells.push(cell);
      }
    }
    return cells;
  }
}
function buildBoard(board, initialImage, land = new WorldLand()) {
  board.cells.clear();
  board.buildings.clear();
  board.history = [];
  board.sortedCells = null;
  board.initialImage = initialImage;
  board.land = land;
  for (const parcel of land.parcels.values()) board.addParcelCells(parcel);
  board.refresh();
}
