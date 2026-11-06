img = [];

let tiles = []; // alle Boden-Tiles, nach Zeichenreihenfolge sortiert
const board = new Board();
let selectedBoardTileIndices = new Set();
let selectedPaletteIndex = null;

const BASE_CANVAS_SIZE = 1024;

let gameCanvas;
let currentCanvasSize = BASE_CANVAS_SIZE;

// Tile-Liste aus tiles-tags.csv (siehe csv.js, startGame am Dateiende).
// Index 0 ist immer die Wiese; img[i] gehoert zu tileDefs[i].
const MEADOW_TILE_INDEX = 0;
let tileDefs = [];
let tileCategories = [];
let lastOverlayTap = null;
const RECENT_CATEGORY_NAME = "Zuletzt benutzt";
const RECENT_LIMIT = 24;
let recentTileIndices = [];
let tutorialActionHandler = null;

// Character-Mode
let gameMode = "build"; // "build" oder "character"
let modeSwitch = null;
let touchController = null;
let characterManager = null;
let currentCharacter = null;
let characterSelectionScreen = null;
let characterCameraFollowing = true;
const CHARACTER_TILE_SIZE = 32; // Gleicher Maßstab wie Tiles
const CHARACTER_MOVE_SPEED = 0.5; // Bewegungsverzögerung: höhere Werte = langsamer, min. 0.1 (10 frames pro Schritt)

function notifyTutorialAction(action, detail) {
  if (tutorialActionHandler) {
    tutorialActionHandler(action, detail);
  }
}

function buildTileDefs(manifest) {
  const data = manifest || { root: "tiles_sortiert", meadow: null, categories: [] };
  const url = (...parts) => [data.root, ...parts].map(encodeURIComponent).join("/");
  const defs = [];
  const categories = [];

  if (data.meadow) {
    defs.push({ ...data.meadow, category: "", url: url(data.meadow.file) });
  }

  for (const category of data.categories) {
    const indices = category.tiles.map((tile) => defs.push({ ...tile, category: category.name, url: url(category.name, tile.file) }) - 1);
    categories.push({ name: category.name, indices, iconUrl: category.icon ? url(category.name, category.icon) : defs[indices[0]].url });
  }

  return { tileDefs: defs, tileCategories: categories };
}

function gamePreload() {
  tileDefs.forEach((def, i) => {
    img[i] = loadImage(def.url);
  });
  
  // Lade Character-Assets
  if (characterManager) {
    characterManager.preloadAll();
  }
}

function gameSetup() {
  // Create a debug console overlay
  const debugConsole = document.createElement("div");
  debugConsole.id = "debug-console";
  debugConsole.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    width: 400px;
    height: 200px;
    background: rgba(0,0,0,0.8);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 10px;
    border: 1px solid #0f0;
    z-index: 10000;
    overflow-y: auto;
    display: none;
  `;
  document.body.appendChild(debugConsole);
  
  // Override console.log
  const originalLog = console.log;
  console.log = function(...args) {
    originalLog.apply(console, args);
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      try { return JSON.stringify(arg); } catch(e) { return String(arg); }
    }).join(' ');
    const line = document.createElement("div");
    line.textContent = new Date().toLocaleTimeString() + ": " + message;
    debugConsole.appendChild(line);
    debugConsole.scrollTop = debugConsole.scrollHeight;
  };
  
  // Show debug console on Ctrl+Shift+D
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === "KeyD") {
      debugConsole.style.display = debugConsole.style.display === "none" ? "block" : "none";
    }
  });
  
  measureView();
  gameCanvas = createCanvas(view.w, view.h);
  gameCanvas.parent("sketch");

  buildBoard(img[MEADOW_TILE_INDEX]);
  applyStartLayout();
  loadSavedGame();
  saveEnabled = true;

  noSmooth();
  createTilePalette();
  createModeSwitch();
  initCharacterMode();
  updateViewportLayout();
  initCamera();
  bindUndo();
  bindUiHide();
  enableDockDrag();
}

// Kamera: Canvas fuellt die ganze Buehne, das Board (1024x1024) wird per Scale/Offset betrachtet.
const MAX_SCALE = 4;
const DRAG_THRESHOLD = 6;

const view = { w: 1024, h: 1024, insetTop: 0, insetBottom: 0, minScale: 1 };
let cam = { x: 0, y: 0, scale: 1 };
let camTarget = { x: 0, y: 0, scale: 1 };

function measureView() {
  const stage = document.querySelector(".stage");
  const rect = stage ? stage.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
  const topbar = document.querySelector(".topbar");
  const dock = document.getElementById("left-palette");

  view.w = Math.max(1, Math.floor(rect.width));
  view.h = Math.max(1, Math.floor(rect.height));
  view.insetTop = topbar && getComputedStyle(topbar).display !== "none" ? Math.max(0, topbar.getBoundingClientRect().bottom - rect.top) : 0;
  view.insetBottom = dock ? Math.max(0, rect.bottom - dock.getBoundingClientRect().top) : 0;
  view.minScale = Math.max(view.w / (BASE_CANVAS_SIZE + 2 * worldPad()), view.h / (BASE_CANVAS_SIZE + 2 * worldPad()));
}

function clampCamera(c) {
  c.scale = Math.min(Math.max(MAX_SCALE, view.minScale), Math.max(view.minScale, c.scale));
  const pad = worldPad();
  c.x = Math.min(BASE_CANVAS_SIZE + pad - view.w / c.scale, Math.max(-pad, c.x));
  c.y = Math.min(BASE_CANVAS_SIZE + pad - (view.h - view.insetBottom) / c.scale, Math.max(-pad - view.insetTop / c.scale, c.y));
}

function startScale() {
  // Desktop: deutlich hineingezoomt, damit man in alle Richtungen scrollen kann
  return window.innerWidth >= 900 ? Math.max(2, view.minScale * 1.5) : Math.max(view.minScale, 1.25);
}

function resetCamera() {
  camTarget.scale = startScale();
  camTarget.x = (BASE_CANVAS_SIZE - view.w / camTarget.scale) / 2;
  camTarget.y = (BASE_CANVAS_SIZE - view.h / camTarget.scale) / 2;
  clampCamera(camTarget);
}

function zoomAt(px, py, newScale, immediate) {
  setUiHidden(false);
  const t = camTarget;
  const worldX = t.x + px / t.scale;
  const worldY = t.y + py / t.scale;
  t.scale = newScale;
  clampCamera(t);
  t.x = worldX - px / t.scale;
  t.y = worldY - py / t.scale;
  clampCamera(t);

  if (immediate) {
    Object.assign(cam, t);
  }
}

// Oberflaeche ausblenden; jede Kamerabewegung (Verschieben, Zoomen) blendet sie wieder ein.
function setUiHidden(hidden) {
  const app = document.querySelector(".app");
  if (app) {
    app.classList.toggle("ui-hidden", hidden);
  }
}

function panBy(dx, dy, immediate) {
  setUiHidden(false);
  camTarget.x -= dx / camTarget.scale;
  camTarget.y -= dy / camTarget.scale;
  clampCamera(camTarget);

  if (immediate) {
    Object.assign(cam, camTarget);
  }
}

function gameDraw() {
  const ease = 0.25;
  const following = gameMode === "character" && currentCharacter && characterCameraFollowing;
  if (following) {
    updateCharacterMovement();
    currentCharacter.display();
    camTarget.x = currentCharacter.x + currentCharacter.drawW / 2 - view.w / (2 * camTarget.scale);
    camTarget.y = currentCharacter.y + currentCharacter.drawH / 2 - view.h / (2 * camTarget.scale);
    clampCamera(camTarget);
  }
  cam.scale += (camTarget.scale - cam.scale) * ease;
  if (following) {
    // Position ohne Verzoegerung, damit der Charakter exakt zentriert bleibt
    cam.x = camTarget.x;
    cam.y = camTarget.y;
  } else {
    cam.x += (camTarget.x - cam.x) * ease;
    cam.y += (camTarget.y - cam.y) * ease;
  }

  background(70);

  push();
  scale(cam.scale);
  translate(-cam.x, -cam.y);

  const viewW = view.w / cam.scale;
  const viewH = view.h / cam.scale;

  // Update Character-Bewegung (wenn im Character-Modus)
  if (gameMode === "character" && currentCharacter) {
    // WICHTIG: display() aufrufen BEVOR drawOrder() berechnet wird!
    // Das aktualisiert x, y, drawW, drawH für die korrekte Tiefensortierung
    currentCharacter.display();


    // Rebuild tiles mit Character eingebunden für korrekte z-order Sortierung
    const drawList = board.drawOrder(currentCharacter);
    for (const t of drawList) {
      if (t.x + t.drawW < cam.x || t.x > cam.x + viewW || t.y + t.drawH < cam.y || t.y > cam.y + viewH) {
        continue;
      }
      
      if (t === currentCharacter) {
        // Character ist bereits in drawList eingefügt, aber wir rendern ihn nicht nochmal
        // Die x, y, drawW, drawH sind schon aktualisiert von display() oben
        const currentImage = currentCharacter.getDisplayImage();
        if (currentImage && currentImage.width > 0 && currentImage.height > 0) {
          image(currentImage, currentCharacter.x, currentCharacter.y, currentCharacter.drawW, currentCharacter.drawH);
        }
      } else {
        t.show();
      }
    }
  } else {
    // Build Mode - nur Tiles
    for (const t of tiles) {
      if (t.x + t.drawW < cam.x || t.x > cam.x + viewW || t.y + t.drawH < cam.y || t.y > cam.y + viewH) {
        continue;
      }
      t.show();
    }
  }

  pop();
}

function gameWindowResized() {
  updateViewportLayout();
}

function updateViewportLayout() {
  if (!gameCanvas) {
    return;
  }

  measureView();
  resizeCanvas(view.w, view.h);
  gameCanvas.elt.style.removeProperty("width");
  gameCanvas.elt.style.removeProperty("height");
  clampCamera(camTarget);
  clampCamera(cam);
}

function canvasPoint(event) {
  const rect = gameCanvas.elt.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function handleTap(px, py, withCtrl) {
  console.log(`[handleTap] Click at canvas (${px}, ${py}), gameMode=${gameMode}`);
  
  const worldX = cam.x + px / cam.scale;
  const worldY = cam.y + py / cam.scale;
  console.log(`[handleTap] World coords: (${worldX}, ${worldY})`);

  const cell = screenToGrid(worldX, worldY);
  console.log(`[handleTap] Grid cell from screenToGrid: (${cell.gx}, ${cell.gy})`);
  
  const tile = board.get(cell.gx, cell.gy);
  console.log(`[handleTap] Tile at grid position:`, tile ? `(${tile.gx}, ${tile.gy})` : 'NOT FOUND');

  if (!tile) {
    console.log(`[handleTap] No tile at grid position`);
    return;
  }

  // CHARACTER-MODUS: Taps auf das Board haben keine Wirkung
  if (gameMode !== "build") {
    return;
  }

  // Doppelklick entfernt schrittweise: erst das Overlay (Katze), dann den Boden/das Gebaeude (zurueck auf Wiese)
  const now = performance.now();
  const hasObject = Boolean(tile.overlay || tile.owner || tile.ground !== img[MEADOW_TILE_INDEX]);
  if (
    hasObject &&
    lastOverlayTap &&
    lastOverlayTap.key === tile.key &&
    now - lastOverlayTap.time <= 350
  ) {
    lastOverlayTap = null;
    if (tile.overlay) {
      const result = board.eraseOverlay(tile);
      if (result === "locked") {
        showToast("Dieses Tile ist fest");
      } else if (result) {
        notifyTutorialAction("overlay-removed", { tile });
      }
    } else if (!board.erase(tile, img[MEADOW_TILE_INDEX])) {
      showToast("Dieses Tile ist fest");
    }
    return;
  }
  lastOverlayTap = hasObject ? { key: tile.key, time: now } : null;

  if (selectedPaletteIndex !== null && img[selectedPaletteIndex]) {
    // Die Wiese ist der "Radierer": entfernt auch ein Overlay
    if (selectedPaletteIndex === MEADOW_TILE_INDEX) {
      lastOverlayTap = null;
      if (!board.erase(tile, img[MEADOW_TILE_INDEX])) {
        showToast("Dieses Tile ist fest");
      } else {
        notifyTutorialAction("meadow-placed", { tile });
      }
    } else {
      const def = tileDefs[selectedPaletteIndex];
      const selectedImage = img[selectedPaletteIndex];
      if (def.type === "OVER" && tile.overlay === selectedImage) {
        return;
      }

      const result = board.place(tile, selectedImage, def, img[MEADOW_TILE_INDEX]);
      if (result === "locked") {
        showToast("Dieses Tile ist fest");
      } else if (result !== true) {
        showToast("Hier ist nicht genug Platz");
      } else {
        notifyTutorialAction("tile-placed", { tile, def });
      }
    }
    return;
  }

  const key = tile.key;

  if (withCtrl) {
    if (selectedBoardTileIndices.has(key)) {
      selectedBoardTileIndices.delete(key);
    } else {
      selectedBoardTileIndices.add(key);
    }
  } else {
    selectedBoardTileIndices.clear();
    selectedBoardTileIndices.add(key);
  }
}

function initCamera() {
  const canvasElement = gameCanvas && gameCanvas.elt;

  if (!canvasElement || canvasElement.dataset.cameraBound === "1") {
    return;
  }

  canvasElement.dataset.cameraBound = "1";
  measureView();
  resetCamera();
  Object.assign(cam, camTarget);

  const pointers = new Map();
  let moved = false;
  let wasMultiTouch = false;
  let pinch = null;

  const centerX = () => view.w / 2;
  const centerY = () => (view.h - view.insetBottom + view.insetTop) / 2;

  canvasElement.addEventListener("pointerdown", (event) => {
    canvasElement.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });

    if (pointers.size === 1) {
      moved = false;
      wasMultiTouch = false;
    } else if (pointers.size === 2) {
      wasMultiTouch = true;
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: camTarget.scale };
    }
  });

  canvasElement.addEventListener("pointermove", (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) {
      return;
    }

    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;

    if (pointers.size === 1) {
      if (!moved && Math.hypot(event.clientX - p.startX, event.clientY - p.startY) > DRAG_THRESHOLD) {
        moved = true;
        canvasElement.classList.add("dragging");
      }
      if (moved) {
        panBy(dx, dy, true);
      }
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = canvasPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomAt(mid.x, mid.y, pinch.scale * (dist / pinch.dist), true);
      panBy(dx / 2, dy / 2, true);
    }
  });

  const endPointer = (event, cancelled) => {
    console.log(`[endPointer] cancelled=${cancelled}, moved=${moved}, wasMultiTouch=${wasMultiTouch}`);
    if (!pointers.has(event.pointerId)) {
      console.log(`[endPointer] pointer not found`);
      return;
    }

    pointers.delete(event.pointerId);
    pinch = null;

    if (pointers.size === 0) {
      canvasElement.classList.remove("dragging");

      if (!cancelled && !moved && !wasMultiTouch) {
        console.log(`[endPointer] calling handleTap`);
        const point = canvasPoint(event);
        handleTap(point.x, point.y, event.ctrlKey);
      } else {
        console.log(`[endPointer] NOT calling handleTap: cancelled=${cancelled}, moved=${moved}, wasMultiTouch=${wasMultiTouch}`);
      }
    }
  };

  canvasElement.addEventListener("pointerup", (event) => endPointer(event, false));
  canvasElement.addEventListener("pointercancel", (event) => endPointer(event, true));

  canvasElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = canvasPoint(event);
      zoomAt(point.x, point.y, camTarget.scale * Math.exp(-event.deltaY * 0.0015), false);
    },
    { passive: false }
  );

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("input")) {
      return;
    }

    if (gameMode === "character" && event.key.startsWith("Arrow")) {
      characterCameraFollowing = false;
    }

    const step = 80;
    const keyActions = {
      ArrowLeft: () => panBy(step, 0, false),
      ArrowRight: () => panBy(-step, 0, false),
      ArrowUp: () => panBy(0, step, false),
      ArrowDown: () => panBy(0, -step, false),
      "+": () => zoomAt(centerX(), centerY(), camTarget.scale * 1.3, false),
      "-": () => zoomAt(centerX(), centerY(), camTarget.scale / 1.3, false),
    };

    if (keyActions[event.key]) {
      event.preventDefault();
      keyActions[event.key]();
    }
  });

  const zoomButtons = {
    "zoom-in": () => zoomAt(centerX(), centerY(), camTarget.scale * 1.4, false),
    "zoom-out": () => zoomAt(centerX(), centerY(), camTarget.scale / 1.4, false),
    "zoom-fit": () => {
      camTarget.scale = view.minScale;
      camTarget.x = 0;
      camTarget.y = 0;
      clampCamera(camTarget);
    },
  };

  Object.entries(zoomButtons).forEach(([id, action]) => {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener("click", action);
    }
  });
}

function createTilePalette() {
  const leftPalette = document.getElementById("left-palette");

  if (!leftPalette || leftPalette.childElementCount > 0) {
    return;
  }


  const normalize = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const makeTileButton = (index) => {
    const def = tileDefs[index];
    const button = document.createElement("button");
    button.className = "tile-button";
    button.type = "button";
    button.dataset.tileIndex = String(index);
    button.dataset.tileCategory = def.category;
    button.dataset.tileFile = def.file;
    button.title = def.name;
    button.setAttribute("aria-label", def.name);
    button.setAttribute("aria-pressed", "false");

    const imageElement = document.createElement("img");
    imageElement.src = def.url;
    imageElement.alt = "";
    imageElement.draggable = false;
    button.appendChild(imageElement);

    button.addEventListener("click", () => selectPaletteTile(index));
    return button;
  };

  // Fixiert links: Wiese (zugleich "Rueckgaengig"-Kachel)
  const fixed = document.createElement("div");
  fixed.className = "dock-fixed";

  if (tileDefs.length > 0) {
    const meadowButton = makeTileButton(MEADOW_TILE_INDEX);
    meadowButton.classList.add("dock-meadow");
    meadowButton.title = "Wiese (zum Zurücksetzen einzelner Felder)";
    fixed.appendChild(meadowButton);
  }

  // Suche: kleines Icon ueber der Slidebar (rechts), klappt ein Eingabefeld auf
  const searchBar = document.createElement("div");
  searchBar.className = "dock-search";

  const searchButton = document.createElement("button");
  searchButton.className = "search-toggle";
  searchButton.type = "button";
  searchButton.title = "Suchen";
  searchButton.setAttribute("aria-label", "Suchen");
  searchButton.setAttribute("aria-expanded", "false");
  searchButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

  const searchInput = document.createElement("input");
  searchInput.className = "tile-search";
  searchInput.type = "search";
  searchInput.placeholder = "Suchen …";
  searchInput.autocomplete = "off";
  searchInput.hidden = true;

  searchBar.append(searchInput, searchButton);

  const scroller = document.createElement("div");
  scroller.className = "dock-scroll";
  scroller.id = "palette-scroll";

  const groups = tileCategories.map((category) => {
    const el = document.createElement("div");
    el.className = "cat-group";

    const head = document.createElement("button");
    head.className = "tile-button cat-button";
    head.type = "button";
    head.title = category.name;
    head.setAttribute("aria-label", category.name);
    head.setAttribute("aria-expanded", "false");
    head.innerHTML =
      '<img alt="" draggable="false"><span class="cat-chevron"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    head.querySelector("img").src = category.iconUrl;

    const items = document.createElement("div");
    items.className = "cat-items";
    items.hidden = true;
    category.indices.forEach((index) => items.appendChild(makeTileButton(index)));

    el.append(head, items);
    return { el, head, items };
  });

  // "Zuletzt benutzt": Reihenfolge wird nur beim Oeffnen eingefroren, nicht waehrend der Nutzung
  const recentEl = document.createElement("div");
  recentEl.className = "cat-group cat-recent";

  const recentHead = document.createElement("button");
  recentHead.className = "tile-button cat-button cat-button-recent";
  recentHead.type = "button";
  recentHead.title = RECENT_CATEGORY_NAME;
  recentHead.setAttribute("aria-label", RECENT_CATEGORY_NAME);
  recentHead.setAttribute("aria-expanded", "false");
  recentHead.innerHTML =
    '<svg class="recent-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg><span class="cat-chevron"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

  const recentItems = document.createElement("div");
  recentItems.className = "cat-items";
  recentItems.hidden = true;

  recentEl.append(recentHead, recentItems);
  const recentGroup = {
    el: recentEl,
    head: recentHead,
    items: recentItems,
    refresh: () => {
      if (recentTileIndices.length === 0) {
        const empty = document.createElement("span");
        empty.className = "palette-empty";
        empty.textContent = "Noch nichts benutzt";
        recentItems.replaceChildren(empty);
      } else {
        recentItems.replaceChildren(...recentTileIndices.map(makeTileButton));
        syncPaletteSelection();
      }
    }
  };
  groups.unshift(recentGroup);

  // Geoeffnete Kategorie: Tiles erscheinen in einer Reihe ueber der Leiste
  const flyout = document.createElement("div");
  flyout.className = "cat-flyout";
  flyout.hidden = true;

  const setOpen = (group, open) => {
    group.el.classList.toggle("open", open);
    group.items.hidden = !open;
    group.head.setAttribute("aria-expanded", String(open));
    if (open) {
      if (group.refresh) {
        group.refresh();
      }
      flyout.replaceChildren(group.items);
      flyout.hidden = false;
      flyout.scrollLeft = 0;
    } else if (group.items.parentElement !== group.el) {
      group.el.appendChild(group.items);
    }
  };

  const closeAll = () => {
    groups.forEach((group) => setOpen(group, false));
    flyout.hidden = true;
  };

  groups.forEach((group) => {
    group.head.addEventListener("click", () => {
      if (!searchInput.hidden) {
        toggleSearch(false);
      }
      const open = !group.el.classList.contains("open");
      closeAll();
      if (open) {
        setOpen(group, true);
      }
    });
  });

  const render = () => {
    const query = normalize(searchInput.value.trim());
    const terms = query.split(/\s+/).filter(Boolean);

    if (query) {
      closeAll();
    }

    if (!query) {
      scroller.replaceChildren(...groups.map((group) => group.el));
      return;
    }

    const hits = tileDefs
      .map((def, index) => ({ def, index }))
      .filter(({ def, index }) => index !== MEADOW_TILE_INDEX && terms.every((term) => normalize(`${def.name} ${def.category} ${(def.tags || []).join(" ")}`).includes(term)));

    if (hits.length === 0) {
      const empty = document.createElement("span");
      empty.className = "palette-empty";
      empty.textContent = "Nichts gefunden";
      scroller.replaceChildren(empty);
      return;
    }

    scroller.replaceChildren(...hits.map(({ index }) => makeTileButton(index)));
    scroller.scrollLeft = 0;
    syncPaletteSelection();
  };

  const toggleSearch = (show) => {
    searchInput.hidden = !show;
    searchButton.setAttribute("aria-expanded", String(show));
    searchButton.classList.toggle("selected", show);

    if (show) {
      closeAll();
      searchInput.focus();
    } else {
      searchInput.value = "";
      render();
    }
  };

  searchButton.addEventListener("click", () => toggleSearch(searchInput.hidden));
  searchInput.addEventListener("input", render);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleSearch(false);
    }
  });

  leftPalette.append(searchBar, flyout, fixed, scroller);
  render();
}

function syncPaletteSelection() {
  document.querySelectorAll(".tile-button[data-tile-index]").forEach((button) => {
    const on = Number(button.dataset.tileIndex) === selectedPaletteIndex;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

function selectPaletteTile(index) {
  lastOverlayTap = null;
  selectedPaletteIndex = selectedPaletteIndex === index ? null : index;
  if (selectedPaletteIndex !== null && index !== MEADOW_TILE_INDEX) {
    recentTileIndices = [index, ...recentTileIndices.filter((i) => i !== index)].slice(0, RECENT_LIMIT);
  }
  syncPaletteSelection();
  notifyTutorialAction("palette-selected", { index, def: tileDefs[index] });
}

// === CHARACTER-MODE FUNKTIONEN ===

let characterSelectionBar = null;

function initCharacterMode() {
  // Initialisiere Character Manager
  if (!characterManager) {
    characterManager = new CharacterManager();
  }
  
  const mainElement = document.querySelector("main.app");
  if (mainElement) {
    modeSwitch = new ModeSwitch(mainElement);
    modeSwitch.onChange((mode) => switchGameMode(mode));
  }
  
  // Keyboard input für WASD
  document.addEventListener("keydown", handleCharacterMovementKey);
  document.addEventListener("keyup", handleCharacterMovementKeyUp);
}

let keysPressed = { w: false, a: false, s: false, d: false };

function handleCharacterMovementKey(event) {
  if (gameMode !== "character" || !currentCharacter) return;
  
  const key = event.key.toLowerCase();
  if (key === 'w') {
    keysPressed.w = true;
    event.preventDefault();
    characterCameraFollowing = true;
  }
  if (key === 's') {
    keysPressed.s = true;
    event.preventDefault();
    characterCameraFollowing = true;
  }
  if (key === 'a') {
    keysPressed.a = true;
    event.preventDefault();
    characterCameraFollowing = true;
  }
  if (key === 'd') {
    keysPressed.d = true;
    event.preventDefault();
    characterCameraFollowing = true;
  }
}

function handleCharacterMovementKeyUp(event) {
  const key = event.key.toLowerCase();
  if (key === 'w') keysPressed.w = false;
  if (key === 's') keysPressed.s = false;
  if (key === 'a') keysPressed.a = false;
  if (key === 'd') keysPressed.d = false;
}

function updateCharacterMovement() {
  if (gameMode !== "character" || !currentCharacter) {
    return;
  }
  
  // Update laufende Bewegungs-Animation
  currentCharacter.updateMovement();
  
  // Desktop: WASD - aber nur Bewegung starten wenn nicht bereits in Bewegung
  if (!currentCharacter.isMoving) {
    if (keysPressed.w) currentCharacter.startMovement("up-right");
    else if (keysPressed.s) currentCharacter.startMovement("down-left");
    else if (keysPressed.a) currentCharacter.startMovement("up-left");
    else if (keysPressed.d) currentCharacter.startMovement("down-right");
  }
  
  // Mobile: Touch-Controller (nur wenn nicht null)
  if (touchController && touchController.isMobile && !currentCharacter.isMoving) {
    const mobileInput = touchController.getInput();
    
    if (Math.abs(mobileInput.x) > 0.3 || Math.abs(mobileInput.y) > 0.3) {
      characterCameraFollowing = true;
      // Bestimme die Richtung basierend auf Joystick-Input
      let direction;
      if (Math.abs(mobileInput.y) > Math.abs(mobileInput.x)) {
        // Vertikal hat Vorrang
        direction = mobileInput.y < 0 ? "up-right" : "down-left";
      } else {
        // Horizontal
        direction = mobileInput.x < 0 ? "up-left" : "down-right";
      }
      currentCharacter.startMovement(direction);
    }
  }
}

// Charakterordner muessen fortlaufend char_1, char_2, ... heissen.
async function loadCharacters() {
  let index = 1;
  while (true) {
    const folder = `char_${index}`;
    const response = await fetch(`character/${folder}/vorn.png`, {
      method: "HEAD",
      cache: "no-cache"
    });

    if (response.status === 404) {
      break;
    }
    if (!response.ok) {
      throw new Error(`character/${folder}/vorn.png: ${response.status}`);
    }

    characterManager.addCharacter(`Charakter ${index}`, `character/${folder}`);
    index += 1;
  }

  if (index === 1) {
    throw new Error("Keine Charakterordner gefunden. Erwartet wird character/char_1/.");
  }
}

function switchGameMode(newMode) {
  gameMode = newMode;
  characterCameraFollowing = true;
  
  if (gameMode === "build") {
    enableBuildMode();
    if (characterSelectionBar) {
      characterSelectionBar.hide();
    }
    currentCharacter = null;
    keysPressed = { w: false, a: false, s: false, d: false };
    if (touchController) {
      touchController.destroy();
      touchController = null;
    }
  } else if (gameMode === "character") {
    disableBuildMode();
    showCharacterSelection();
    // Im Erkunden-Modus standardmaessig nah heranzoomen (manuell weiter aenderbar)
    camTarget.scale = Math.max(window.innerWidth >= 900 ? 4 : 3, view.minScale);
    clampCamera(camTarget);
  }
}

function enableBuildMode() {
  const leftPalette = document.getElementById("left-palette");
  if (leftPalette) {
    leftPalette.style.display = "";
  }
  selectedBoardTileIndices.clear();
}

function disableBuildMode() {
  const leftPalette = document.getElementById("left-palette");
  if (leftPalette) {
    leftPalette.style.display = "none";
  }
  selectedBoardTileIndices.clear();
  selectedPaletteIndex = null;
}

// Der Charakter ist nach der Wahl fest; ein Wechsel geht nur ueber Bauen -> Erkunden.
function showCharacterSelection() {
  const characters = Array.from(characterManager.characters, ([name, character]) => ({
    name,
    previewImage: `${character.characterPath}/vorn.png`
  }));
  
  const mainElement = document.querySelector("main.app");
  if (!characterSelectionBar) {
    characterSelectionBar = new CharacterSelectionBar(mainElement, characters);
  }
  
  const backToBuild = () => {
    if (modeSwitch) {
      modeSwitch.setMode("build");
    }
  };
  
  // Warnhinweis zuerst; erst nach "Verstanden" folgt die Charakterauswahl
  characterSelectionBar.showNotice(
    () =>
      characterSelectionBar.show((selectedName) => placeCharacterAtViewCenter(selectedName), backToBuild),
    backToBuild
  );
}

// Begehbares Tile (UNDER, ohne Overlay/Gebaeude) moeglichst nah an der Mitte des sichtbaren Bereichs
function findSpawnTile(character) {
  const centerX = cam.x + view.w / cam.scale / 2;
  const centerY = cam.y + view.h / cam.scale / 2;
  const hasWalkableNeighbor = (tile) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => character.canWalkOn(tile.gx + dx, tile.gy + dy));
  
  let best = null;
  let bestIsolated = null;
  let bestDist = Infinity;
  let bestIsolatedDist = Infinity;
  
  for (const tile of board.cells.values()) {
    if (!character.canWalkOn(tile.gx, tile.gy)) {
      continue;
    }
    const dist = Math.hypot(tile.x + CELL_CENTER_X - centerX, tile.y + CELL_CENTER_Y - centerY);
    if (hasWalkableNeighbor(tile)) {
      if (dist < bestDist) {
        bestDist = dist;
        best = tile;
      }
    } else if (dist < bestIsolatedDist) {
      bestIsolatedDist = dist;
      bestIsolated = tile;
    }
  }
  
  return best || bestIsolated;
}

function placeCharacterAtViewCenter(characterName) {
  if (!characterManager.selectCharacter(characterName)) {
    return;
  }
  
  const character = characterManager.currentCharacter;
  const spawn = findSpawnTile(character);
  
  if (!spawn) {
    showToast("Kein begehbares Feld gefunden!");
    if (modeSwitch) {
      modeSwitch.setMode("build");
    }
    return;
  }
  
  currentCharacter = character;
  currentCharacter.init(CHARACTER_TILE_SIZE, spawn.gx, spawn.gy);
  
  const mainElement = document.querySelector("main.app");
  if (mainElement) {
    if (touchController) {
      touchController.destroy();
    }
    touchController = new TouchController(mainElement, 120, 120);
  }
}

function createModeSwitch() {
  const meadowButton = document.getElementById("mode-meadow");

  const menuToggle = document.getElementById("menu-toggle");
  const menuPanel = document.getElementById("menu-panel");

  const closeMenu = () => {
    if (menuPanel) {
      menuPanel.hidden = true;
    }
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", "false");
    }
  };

  if (menuToggle && menuToggle.dataset.bound !== "1") {
    menuToggle.addEventListener("click", () => {
      const open = menuPanel.hidden;
      menuPanel.hidden = !open;
      menuToggle.setAttribute("aria-expanded", String(open));
      notifyTutorialAction("menu-toggled", { open });
    });
    menuToggle.dataset.bound = "1";
  }

  const infoToggle = document.getElementById("info-toggle");
  const infoOverlay = document.getElementById("info");
  const tutorialButton = document.getElementById("tutorial-open");

  if (tutorialButton && tutorialButton.dataset.bound !== "1") {
    tutorialButton.addEventListener("click", () => {
      closeMenu();
      openTutorial();
    });
    tutorialButton.dataset.bound = "1";
  }

  if (infoToggle && infoOverlay && infoToggle.dataset.bound !== "1") {
    const closeInfo = () => {
      infoOverlay.hidden = true;
    };

    infoToggle.addEventListener("click", () => {
      closeMenu();
      infoOverlay.hidden = false;
    });
    infoOverlay.addEventListener("click", closeInfo);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeInfo();
        closeMenu();
      }
    });
    infoToggle.dataset.bound = "1";
  }

  // Zweiter Klick innerhalb von 3s bestaetigt, weil das ganze Board ueberschrieben wird.
  const bindConfirm = (button, action) => {
    if (!button || button.dataset.bound === "1") {
      return;
    }

    const label = button.querySelector("span");
    const original = label.textContent;
    let timer = null;

    const disarm = () => {
      clearTimeout(timer);
      button.classList.remove("armed");
      label.textContent = original;
    };

    button.addEventListener("click", () => {
      if (!button.classList.contains("armed")) {
        button.classList.add("armed");
        label.textContent = "Sicher?";
        timer = setTimeout(disarm, 3000);
        return;
      }

      disarm();
      action();
      notifyTutorialAction("reset-confirmed");
      pulseButton(menuToggle || button);
      closeMenu();
    });
    button.dataset.bound = "1";
  };

  bindConfirm(meadowButton, makeAllMeadow);

  document.addEventListener("pointerdown", (event) => {
    if (menuPanel && !menuPanel.hidden && !event.target.closest(".menu")) {
      closeMenu();
    }
  });
}
function enableDockDrag() {
  enableDragScroll(document.getElementById("palette-scroll"));
  enableDragScroll(document.querySelector("#left-palette .cat-flyout"));
}

function enableDragScroll(dock) {
  if (!dock || dock.dataset.dragBound === "1") {
    return;
  }

  dock.dataset.dragBound = "1";
  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  let suppressClick = false;

  dock.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    dragging = true;
    suppressClick = false;
    startX = event.clientX;
    startScroll = dock.scrollLeft;
  });

  window.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 5) {
      suppressClick = true;
      dock.classList.add("dragging");
    }
    if (suppressClick) {
      dock.scrollLeft = startScroll - delta;
    }
  });

  window.addEventListener("pointerup", () => {
    dragging = false;
    dock.classList.remove("dragging");
  });

  dock.addEventListener(
    "click",
    (event) => {
      if (suppressClick) {
        event.stopPropagation();
        event.preventDefault();
        suppressClick = false;
      }
    },
    true
  );

  dock.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        dock.scrollLeft += event.deltaY;
      }
    },
    { passive: false }
  );
}

function pulseButton(button) {
  button.classList.remove("pulse");
  void button.offsetWidth;
  button.classList.add("pulse");
}

function applyStartLayout() {
  const layout = (window.TILE_MANIFEST && window.TILE_MANIFEST.layout) || [];

  for (const entry of layout) {
    const index = tileDefs.findIndex((def) => def.category === entry.category && def.file === entry.file);

    if (index === -1 || !board.placeLayout(entry.gx, entry.gy, img[index], tileDefs[index], img[MEADOW_TILE_INDEX], entry.fixed)) {
      console.warn("Startlayout: Eintrag uebersprungen", entry);
    }
  }

  board.history = [];
  board.refresh();
}

// Admin-Tool: aktuelles Spielfeld als start-layout.csv herunterladen
function exportLayout() {
  const rows = [["Kategorie", "Dateiname", "gx", "gy", "Fix"]];
  const add = (image, cell, locked) => {
    const def = tileDefs[img.indexOf(image)];
    if (def && img.indexOf(image) !== MEADOW_TILE_INDEX) {
      rows.push([def.category, def.file, cell.gx, cell.gy, locked ? "FIX" : "FREI"]);
    }
  };

  for (const cell of board.sorted()) {
    if (!cell.owner) {
      add(cell.ground, cell, cell.locked);
      if (cell.overlay) {
        add(cell.overlay, cell, cell.locked);
      }
    }
  }

  for (const building of board.buildings) {
    add(building.image, building.anchor, building.locked);
  }

  const quote = (value) => (/[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
  const csv = "\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "start-layout.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Autosave im Browser (localStorage): bleibt erhalten, solange der Browser-Speicher nicht geloescht wird
const SAVE_KEY = "nordi-savegame-v1";
let saveEnabled = false;
let saveTimer = null;

function tileId(image) {
  const def = tileDefs[img.indexOf(image)];
  return def ? `${def.category}/${def.file}` : null;
}

function saveGame() {
  if (!saveEnabled || EDITOR_MODE) {
    return;
  }

  try {
    const snap = board.snapshot();
    const data = {
      v: 1,
      cells: snap.cells
        .map(([key, ground, groundType, overlay, locked]) => [key, tileId(ground), groundType, overlay ? tileId(overlay) : null, locked])
        .filter(([, ground, , overlay, locked]) => ground !== tileId(img[MEADOW_TILE_INDEX]) || overlay || locked),
      buildings: snap.buildings.map(([gx, gy, w, h, image, locked]) => [gx, gy, w, h, tileId(image), locked]),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Speichern fehlgeschlagen", e);
  }
}

function scheduleSave() {
  if (!saveEnabled) {
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveGame, 400);
}

function loadSavedGame() {
  if (EDITOR_MODE) {
    return;
  }

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return;
    }

    const data = JSON.parse(raw);
    const byId = new Map(tileDefs.map((def, i) => [`${def.category}/${def.file}`, img[i]]));
    const snap = board.snapshot();
    const meadow = img[MEADOW_TILE_INDEX];

    for (const cell of snap.cells) {
      cell[1] = meadow;
      cell[2] = "UNDER";
      cell[3] = null;
      cell[4] = false;
    }
    const cellMap = new Map(snap.cells.map((c) => [c[0], c]));

    for (const [key, ground, groundType, overlay, locked] of data.cells) {
      const cell = cellMap.get(key);
      if (cell && byId.has(ground)) {
        cell[1] = byId.get(ground);
        cell[2] = groundType;
        cell[3] = overlay ? byId.get(overlay) || null : null;
        cell[4] = locked;
      }
    }

    snap.buildings = data.buildings
      .filter(([gx, gy, , , id]) => board.get(gx, gy) && byId.has(id))
      .map(([gx, gy, w, h, id, locked]) => [gx, gy, w, h, byId.get(id), locked]);

    board.restore(snap);
    board.history = [];
  } catch (e) {
    console.warn("Laden fehlgeschlagen", e);
  }
}

window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveGame();
  }
});

function makeAllMeadow() {
  board.clearAll(img[MEADOW_TILE_INDEX]);
  selectedBoardTileIndices.clear();
}

let toastTimer = null;

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function bindUiHide() {
  const button = document.getElementById("ui-hide");
  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    const panel = document.getElementById("menu-panel");
    const toggle = document.getElementById("menu-toggle");
    if (panel) {
      panel.hidden = true;
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
    }
    button.blur();
    setUiHidden(true);
  });
}

function bindUndo() {
  const button = document.getElementById("undo-button");
  if (!button) {
    return;
  }

  const sync = () => {
    button.disabled = board.history.length === 0;
  };

  button.addEventListener("click", () => {
    const undone = board.undo();
    selectedBoardTileIndices.clear();
    sync();
    if (undone) {
      notifyTutorialAction("undo");
    }
  });

  // Verlauf aendert sich bei jedem Tap auf dem Spielfeld und beim Reset
  document.addEventListener("pointerup", () => setTimeout(sync, 0));
  document.addEventListener("click", () => setTimeout(sync, 0));
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      button.click();
    }
  });
  sync();
}

// Admin-Tool: Strg+Alt+Umschalt+L laedt das aktuelle Spielfeld als start-layout.csv herunter.
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.altKey && event.shiftKey && event.code === "KeyL") {
    event.preventDefault();
    exportLayout();
    showToast("start-layout.csv exportiert");
  }
});

// Die CSV-Dateien muessen vor p5 geladen sein; p5 wird deshalb erst danach gestartet.
async function startGame() {
  // Initialisiere Character-Manager früh, damit Assets in gamePreload geladen werden
  characterManager = new CharacterManager();
  
  try {
    await loadCharacters();
    const manifest = await loadManifest();
    ({ tileDefs, tileCategories } = buildTileDefs(manifest));
    window.TILE_MANIFEST = manifest;
  } catch (error) {
    console.error(error);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<p style="position:fixed;inset:0;margin:0;padding:24px;background:#222;color:#fff;font:16px sans-serif;z-index:99">Charaktere oder Tiles konnten nicht geladen werden. Das Spiel muss über einen Webserver laufen (GitHub Pages oder <code>python -m http.server</code>), nicht per Doppelklick.</p>'
    );
    return;
  }

  window.preload = gamePreload;
  window.setup = gameSetup;
  window.draw = gameDraw;
  window.windowResized = gameWindowResized;
  new p5();
}

if (document.readyState === "complete") {
  startGame();
} else {
  // p5 prueft beim load-Event, ob setup existiert; erst danach darf es gesetzt werden
  window.addEventListener("load", () => setTimeout(startGame, 0));
}

// Intro beim Start und nach Inaktivitaet; Tippen blendet es aus, ohne ein Tile zu setzen.
(function initIntro() {
  const IDLE_MS = 45000;
  const intro = document.getElementById("intro");

  if (!intro) {
    return;
  }

  let idleTimer = null;
  let visible = true;

  const hide = () => {
    visible = false;
    intro.classList.add("fading");
    scheduleIdle();
  };

  const show = () => {
    visible = true;
    intro.classList.add("idle");
    intro.classList.remove("fading");
  };

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(show, IDLE_MS);
  }

  const startButton = document.getElementById("intro-start");
  const skipButton = document.getElementById("intro-skip");

  if (startButton) {
    startButton.addEventListener("click", (event) => {
      event.stopPropagation();
      hide();
      openTutorial();
    });
  }

  if (skipButton) {
    skipButton.addEventListener("click", (event) => {
      event.stopPropagation();
      hide();
    });
  }

  intro.addEventListener("click", (event) => {
    if (event.target === intro) {
      hide();
    }
  });

  ["pointerdown", "keydown", "wheel"].forEach((type) => {
    window.addEventListener(
      type,
      (event) => {
        if (type === "keydown" && event.key === "Escape" && visible) {
          hide();
          return;
        }
        if (!visible) {
          scheduleIdle();
        }
      },
      { capture: true, passive: true }
    );
  });

  if (startButton) {
    startButton.focus({ preventScroll: true });
  }
})();

function openTutorial() {
  const tutorial = document.getElementById("tutorial");
  if (tutorial && !tutorial.hidden) {
    return;
  }

  // Das Tutorial arbeitet mit der Tile-Leiste; die gibt es nur im Baumodus
  if (gameMode !== "build" && modeSwitch) {
    modeSwitch.setMode("build");
  }
  const palette = document.getElementById("left-palette");
  const scroller = document.getElementById("palette-scroll");
  const focus = document.getElementById("tutorial-focus");
  const card = tutorial && tutorial.querySelector(".tutorial-card");
  const title = document.getElementById("tutorial-title");
  const copy = document.getElementById("tutorial-copy");
  const progress = document.getElementById("tutorial-progress");
  const next = document.getElementById("tutorial-next");
  const close = document.getElementById("tutorial-close");
  const menuToggle = document.getElementById("menu-toggle");
  const menuPanel = document.getElementById("menu-panel");
  const canvas = document.querySelector("#sketch canvas");

  if (!tutorial || !palette || !scroller || !focus || !card || !canvas || !menuPanel) {
    return;
  }

  const steps = [
    { type: "category", category: "1_Hauslinks", title: "Kategorie \u00f6ffnen", text: "\u00d6ffne eine Tile-Kategorie in der Leiste. Die Tiles klappen dar\u00fcber auf." },
    { type: "scroll", title: "Leiste scrollen", text: "Schiebe die aufgeklappte Leiste seitlich weiter. Am PC kannst du ziehen oder das Mausrad nutzen." },
    { type: "tile", category: "1_Hauslinks", file: "Altbau_1.png", title: "Haus ausw\u00e4hlen", text: "W\u00e4hle das markierte Haus aus." },
    { type: "board", point: "center", title: "Haus platzieren", text: "Setze das Haus auf ein freies Feld." },
    { type: "meadow", title: "Wiese ausw\u00e4hlen", text: "W\u00e4hle links die Wiese. Sie setzt ein Feld zur\u00fcck." },
    { type: "board", point: "house", title: "Durch Wiese ersetzen", text: "Klicke auf dasselbe Feld, um das Haus durch Wiese zu ersetzen." },
    { type: "undo", title: "R\u00fcckg\u00e4ngig", text: "Dr\u00fccke den markierten Pfeil, um das Haus wiederherzustellen." },
    { type: "tile", category: "21_Tiere", file: "Katze_1.png", title: "Katze ausw\u00e4hlen", text: "Auf B\u00f6den kannst du auch Objekte und Tiere platzieren. Die passende Kategorie \u00f6ffnet sich automatisch." },
    { type: "board", point: "cat", title: "Katze platzieren", text: "Setze die Katze auf ein freies Feld." },
    { type: "tile", category: "13_Stadtboden", file: "Asphalt_1.png", title: "Parkplatz-Untergrund w\u00e4hlen", text: "W\u00e4hle Asphalt. Ein UNDER-Tile \u00e4ndert den Boden unter der Katze." },
    { type: "board", point: "cat", title: "Untergrund \u00e4ndern", text: "Klicke auf dasselbe Katzenfeld, um den Untergrund zu \u00e4ndern." },
    { type: "board", point: "cat", title: "Katze entfernen", text: "Doppelklicke oder doppeltippe auf das Feld. Die Katze verschwindet, der Asphalt bleibt. Ein weiterer Doppelklick setzt das Feld auf Wiese." },
    { type: "menu", title: "Men\u00fc \u00f6ffnen", text: "\u00d6ffne das Men\u00fc oben rechts." },
    { type: "save", title: "Speichern", text: "Klicke auf Speichern, um deine Stadt zu teilen oder als Bild herunterzuladen." },
    { type: "reset", title: "Reset", text: "Klicke zweimal auf Reset, um das Spielfeld wirklich zur\u00fcckzusetzen." },
  ];

  let step = 0;
  let houseTile = null;
  let catTile = null;
  let resetDone = false;
  let activeTarget = null;
  let scrollStart = 0;
  let scrollIntent = false;
  let scrollTarget = null;
  let pointerStart = null;
  const flyout = palette.querySelector(".cat-flyout");
  const scrollables = [flyout, scroller].filter(Boolean);
  const overflows = (el) => el.scrollWidth > el.clientWidth + 8;
  const pickScrollTarget = () => scrollables.find((el) => !el.hidden && overflows(el)) || null;

  // Altes Auswahl-Toggle darf das Tutorial nicht blockieren
  selectedPaletteIndex = null;
  syncPaletteSelection();

  const categoryButton = (name) =>
    [...palette.querySelectorAll(".cat-button")].find((button) => button.title === name) || null;
  const tileButton = (category, file) =>
    [...palette.querySelectorAll(".tile-button[data-tile-index]")].find(
      (button) => button.dataset.tileCategory === category && button.dataset.tileFile === file
    ) || null;

  const openCategory = (name) => {
    const button = categoryButton(name);
    if (button && button.getAttribute("aria-expanded") !== "true") {
      button.click();
    }
  };

  const tilePoint = (tile) => {
    if (!tile) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / view.w;
    const scaleY = rect.height / view.h;
    return {
      x: rect.left + (tile.x + CELL_CENTER_X - cam.x) * cam.scale * scaleX,
      y: rect.top + (tile.y + CELL_CENTER_Y - cam.y) * cam.scale * scaleY,
    };
  };

  const placeCard = (target, point) => {
    const margin = 10;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = target ? target.getBoundingClientRect() : null;
    let left;
    let top;

    if (rect && rect.top > viewportHeight * 0.58) {
      left = window.matchMedia("(max-width: 600px)").matches
        ? margin
        : rect.left + rect.width / 2 - width / 2;
      top = rect.top - height - margin;
    } else if (window.matchMedia("(max-width: 600px)").matches) {
      left = margin;
      if (point) {
        top = margin + 4;
      } else {
        top = rect ? rect.bottom + margin : margin;
      }
    } else if (point) {
      const markerRadius = 34;
      left =
        point.x + markerRadius + width + margin <= viewportWidth - margin
          ? point.x + markerRadius + margin
          : point.x - markerRadius - width - margin;
      top = point.y - height / 2;
    } else if (rect) {
      left = rect.right + width + margin <= viewportWidth - margin ? rect.right + margin : rect.left - width - margin;
      top = rect.top + rect.height / 2 - height / 2;
    } else {
      left = margin;
      top = margin;
    }

    card.style.left = `${Math.max(margin, Math.min(viewportWidth - width - margin, left))}px`;
    card.style.top = `${Math.max(margin, Math.min(viewportHeight - height - margin, top))}px`;
  };

  const render = () => {
    // Scroll-Schritt entfaellt, wenn nichts zu scrollen ist (z. B. grosse Bildschirme)
    while (steps[step].type === "scroll" && !pickScrollTarget()) {
      step++;
    }
    const current = steps[step];
    if (activeTarget) {
      activeTarget.classList.remove("tutorial-target");
      activeTarget = null;
    }
    focus.hidden = true;
    title.textContent = current.title;
    copy.textContent = current.type === "reset" && resetDone
      ? "Das Spielfeld wurde zur\u00fcckgesetzt. Klicke auf Fertig, um das Tutorial zu beenden."
      : current.text;
    progress.textContent = `${step + 1} / ${steps.length}`;
    next.textContent = step === steps.length - 1 ? "Fertig" : "Weiter";
    next.disabled = step !== steps.length - 1 || (current.type === "reset" && !resetDone);

    let target = null;
    let point = null;
    if (current.type === "category") {
      target = categoryButton(current.category);
      if (target && target.getAttribute("aria-expanded") === "true") {
        target.click();
      }
    } else if (current.type === "scroll") {
      target = pickScrollTarget();
      scrollTarget = target;
      scrollStart = target.scrollLeft;
      scrollIntent = false;
    } else if (current.type === "tile") {
      openCategory(current.category);
      target = tileButton(current.category, current.file);
    } else if (current.type === "meadow") {
      target = palette.querySelector(".dock-meadow");
    } else if (current.type === "board") {
      point = current.point === "house" ? tilePoint(houseTile) : current.point === "cat" && catTile ? tilePoint(catTile) : (() => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: rect.left + rect.width * 0.5 + (current.point === "cat" ? 110 : 0),
          y: rect.top + rect.height * 0.5,
        };
      })();
    } else if (current.type === "undo") {
      target = document.getElementById("undo-button");
    } else if (current.type === "menu") {
      target = menuToggle;
    } else if (current.type === "save" || current.type === "reset") {
      if (!resetDone && menuPanel.hidden) {
        menuPanel.hidden = false;
        menuToggle.setAttribute("aria-expanded", "true");
      }
      if (!resetDone) {
        target = document.getElementById(current.type === "save" ? "save-image" : "mode-meadow");
      }
    }

    if (target) {
      if (!current.noFocus) {
        activeTarget = target;
        target.classList.add("tutorial-target");
        target.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
        if (current.type !== "save" && current.type !== "reset") {
          const rect = target.getBoundingClientRect();
          focus.style.left = `${rect.left - 5}px`;
          focus.style.top = `${rect.top - 5}px`;
          focus.style.width = `${rect.width + 10}px`;
          focus.style.height = `${rect.height + 10}px`;
          focus.hidden = false;
        }
        placeCard(target, null);
      } else {
        placeCard(null, null);
      }
    } else if (point) {
      const size = 68;
      focus.style.left = `${point.x - size / 2}px`;
      focus.style.top = `${point.y - size / 2}px`;
      focus.style.width = `${size}px`;
      focus.style.height = `${size}px`;
      focus.hidden = false;
      placeCard(null, point);
    } else {
      placeCard(null, null);
    }
  };

  const finish = () => {
    tutorial.hidden = true;
    focus.hidden = true;
    if (activeTarget) {
      activeTarget.classList.remove("tutorial-target");
      activeTarget = null;
    }
    tutorialActionHandler = null;
    close.removeEventListener("click", finish);
    next.removeEventListener("click", finish);
    palette.removeEventListener("click", onPaletteClick);
    scrollables.forEach((el) => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
    });
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("click", onDocumentClick);
    window.removeEventListener("resize", render);
    window.removeEventListener("keydown", onKeydown);
  };

  const onPaletteClick = (event) => {
    const current = steps[step];
    const button = event.target.closest(".cat-button");
    if (current.type === "category" && button === categoryButton(current.category) && button.getAttribute("aria-expanded") === "true") {
      step++;
      render();
    }
  };

  const onPointerDown = (event) => {
    scrollStart = scrollTarget ? scrollTarget.scrollLeft : 0;
    pointerStart = { x: event.clientX, y: event.clientY };
    scrollIntent = false;
  };
  const onPointerMove = (event) => {
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 10) {
      scrollIntent = true;
    }
  };
  const onPointerUp = () => {
    pointerStart = null;
  };
  const onWheel = () => {
    scrollIntent = true;
  };
  const onScroll = (event) => {
    if (steps[step].type === "scroll" && scrollIntent && event.target === scrollTarget && Math.abs(scrollTarget.scrollLeft - scrollStart) > 24) {
      step++;
      scrollIntent = false;
      render();
    }
  };
  const onDocumentClick = (event) => {
    if (steps[step].type === "save" && event.target.closest("#save-image")) {
      step++;
      render();
    }
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      finish();
    }
  };

  tutorialActionHandler = (action, detail = {}) => {
    const current = steps[step];
    let completed = false;

    if (current.type === "tile" && action === "palette-selected" && detail.def && detail.def.category === current.category && detail.def.file === current.file) {
      step++;
      completed = true;
    } else if (current.type === "meadow" && action === "palette-selected" && detail.index === MEADOW_TILE_INDEX) {
      step++;
      completed = true;
    } else if (current.type === "board" && current.point === "center" && action === "tile-placed" && detail.def && detail.def.file === "Altbau_1.png") {
      houseTile = detail.tile;
      step++;
      completed = true;
    } else if (current.type === "board" && current.point === "house" && action === "meadow-placed" && detail.tile.key === houseTile.key) {
      step++;
      completed = true;
    } else if (current.type === "undo" && action === "undo") {
      step++;
      completed = true;
    } else if (current.type === "board" && current.point === "cat" && action === "tile-placed" && detail.def && detail.def.file === "Katze_1.png" && detail.tile.key !== houseTile.key) {
      catTile = detail.tile;
      step++;
      completed = true;
    } else if (current.type === "board" && current.point === "cat" && action === "tile-placed" && detail.def && detail.def.file === "Asphalt_1.png" && detail.tile.key === catTile.key) {
      step++;
      completed = true;
    } else if (current.type === "board" && current.point === "cat" && action === "overlay-removed" && detail.tile.key === catTile.key) {
      step++;
      completed = true;
    } else if (current.type === "menu" && action === "menu-toggled" && detail.open) {
      step++;
      completed = true;
    } else if (current.type === "reset" && action === "reset-confirmed") {
      resetDone = true;
      completed = true;
    }

    if (completed) {
      render();
    }
  };

  tutorial.hidden = false;
  render();
  close.addEventListener("click", finish);
  next.addEventListener("click", finish);
  palette.addEventListener("click", onPaletteClick);
  scrollables.forEach((el) => {
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
  });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("resize", render);
  window.addEventListener("keydown", onKeydown);
}

// Speichert den Canvas (ohne Menue/Dock) als PNG auf dem Geraet.
(function initSaveImage() {
  const saveButton = document.getElementById("save-image");

  if (!saveButton) {
    return;
  }

  const downloadImage = (blob, filename) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  saveButton.addEventListener("click", async () => {
    const panel = document.getElementById("menu-panel");
    const toggle = document.getElementById("menu-toggle");
    if (panel) {
      panel.hidden = true;
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
    }

    const filename = `nordstadt-${new Date().toISOString().slice(0, 10)}.png`;

    try {
      const blob = await new Promise((resolve, reject) => {
        try {
          gameCanvas.elt.toBlob(resolve, "image/png");
        } catch (error) {
          reject(error);
        }
      });
      if (!blob) {
        alert("Das Bild konnte nicht erstellt werden.");
        return;
      }

      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Meine Nordstadt" });
        } catch (error) {
          if (error.name === "AbortError") {
            return;
          }
          alert("Teilen nicht moeglich. Das Bild wird stattdessen heruntergeladen.");
          downloadImage(blob, filename);
        }
        return;
      }

      downloadImage(blob, filename);
    } catch (error) {
      alert("Speichern nicht moeglich. Bitte die Seite ueber einen Webserver oeffnen.");
    }
  });
})();
