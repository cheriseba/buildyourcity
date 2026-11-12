img = [];

let tiles = [];
let drawnView = null;
const board = new Board(() => {
  drawnView = null;
  saveGame.schedule();
});
let selectedBoardTileIndices = new Set();
let selectedPaletteIndex = null;

const START_WORLD_BOUNDS = new WorldLand().bounds();

let gameCanvas;
let landExpansion = null;
let cameraFitsWorld = false;

// Tile-Liste aus dem zentralen Katalog (siehe spiel/daten/catalog.js).
// Index 0 ist immer die Wiese; img[i] gehoert zu tileDefs[i].
const MEADOW_TILE_INDEX = 0;
let tileDefs = [];
let tileCategories = [];
let lastOverlayTap = null;
const RECENT_CATEGORY_NAME = "Zuletzt benutzt";
const RECENT_LIMIT = 24;
let recentTileIndices = [];
let tileVariants = null;
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

const saveGame = new SaveGame({
  board,
  getCatalog: () => ({ definitions: tileDefs, images: img, meadowIndex: MEADOW_TILE_INDEX }),
  editorMode: EDITOR_MODE,
});

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
    font-family: var(--copy-font);
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
    if (debugConsole.style.display === "none") return;
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
  // Pixel-Art braucht keine 3x-Aufloesung; spart auf Handys etwa die Haelfte der Zeichenarbeit
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  gameCanvas = createCanvas(view.w, view.h);
  gameCanvas.parent("sketch");

  initializeCity();

  noSmooth();
  createTilePalette();
  createModeSwitch();
  initCharacterMode();
  updateViewportLayout();
  initCamera();
  initLandExpansion();
  bindResetChoice();
  observeViewport();
  bindUndo();
  bindRespawn();
  bindUiHide();
  enableDockDrag();
  bindUpdateNotice();
}

function initialCityLayout() {
  return (window.TILE_MANIFEST && window.TILE_MANIFEST.layout) || [];
}

function initializeCity() {
  const land = new WorldLand();
  buildBoard(board, img[MEADOW_TILE_INDEX], land);
  applyStartLayout(initialCityLayout(), board, tileDefs, img, MEADOW_TILE_INDEX);
  saveGame.load();
  saveGame.enable();
  saveGame.schedule();
}

// Canvas und Kamera sind unabhaengig von der freigeschalteten Weltgroesse.
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
  const dockRect = dock && dock.getBoundingClientRect();
  view.insetBottom = dockRect && dockRect.height > 0
    ? Math.min(view.h - 1, Math.max(0, rect.bottom - dockRect.top)) : 0;
  view.minScale = CameraGeometry.fitScale(board.land.bounds(), view);
}

function cameraBounds() {
  const bounds = board.land.bounds();
  if (landExpansion) {
    for (const { rect } of landExpansion.revealRegions()) {
      bounds.minX = Math.min(bounds.minX, rect.minX);
      bounds.minY = Math.min(bounds.minY, rect.minY);
      bounds.maxX = Math.max(bounds.maxX, rect.maxX);
      bounds.maxY = Math.max(bounds.maxY, rect.maxY);
    }
  }
  return bounds;
}

function clampCamera(c) {
  CameraGeometry.clamp(c, view, cameraBounds(), board.land.regions());
}

function startScale() {
  // Desktop: deutlich hineingezoomt, damit man in alle Richtungen scrollen kann
  return window.innerWidth >= 900 ? Math.max(2, view.minScale * 1.5) : Math.max(view.minScale, 1.25);
}

function resetCamera() {
  if (landExpansion) landExpansion.clearReveal();
  cameraFitsWorld = false;
  camTarget.scale = startScale();
  CameraGeometry.moveCenter(camTarget, view, {
    x: (START_WORLD_BOUNDS.minX + START_WORLD_BOUNDS.maxX) / 2,
    y: (START_WORLD_BOUNDS.minY + START_WORLD_BOUNDS.maxY) / 2,
  });
  clampCamera(camTarget);
}

function zoomAt(px, py, newScale, immediate) {
  if (resetChoiceOpen()) return;
  if (landExpansion) landExpansion.clearReveal();
  cameraFitsWorld = false;
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
  if (resetChoiceOpen() || (landExpansion && landExpansion.active)) return;
  cameraFitsWorld = false;
  setUiHidden(false);
  const previous = { ...camTarget };
  camTarget.x -= dx / camTarget.scale;
  camTarget.y -= dy / camTarget.scale;
  const attempted = { ...camTarget };
  clampCamera(camTarget);
  if (landExpansion && gameMode === "build" && !landExpansion.active) {
    landExpansion.revealAttempt(camTarget, view, attempted, previous);
    Object.assign(camTarget, attempted);
    clampCamera(camTarget);
  }

  if (immediate) {
    Object.assign(cam, camTarget);
  }
}

// Im Ruhezustand (Bauen, keine Eingabe, Kamera still) nur 10 statt 60 Bilder pro Sekunde zeichnen.
let lastInputAt = 0;
let currentFps = 60;
["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach((type) => {
  window.addEventListener(type, () => { lastInputAt = performance.now(); }, { passive: true, capture: true });
});

function updateFrameRate() {
  const settled =
    Math.abs(camTarget.x - cam.x) < 0.05 && Math.abs(camTarget.y - cam.y) < 0.05 && Math.abs(camTarget.scale - cam.scale) < 0.001;
  const idle = gameMode !== "character" && settled && performance.now() - lastInputAt > 1500;
  const fps = idle ? 10 : 60;
  if (fps !== currentFps) {
    currentFps = fps;
    frameRate(fps);
  }
}

function gameDraw() {
  updateFrameRate();
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
  if (!cameraFitsWorld) clampCamera(cam);

  clear();

  push();
  scale(cam.scale);
  translate(-cam.x, -cam.y);

  const viewW = view.w / cam.scale;
  const viewH = view.h / cam.scale;
  const visible = { minX: cam.x, minY: cam.y, maxX: cam.x + viewW, maxY: cam.y + viewH };
  if (landExpansion) {
    landExpansion.drawGrid(drawingContext, visible, cam.scale);
  }

  // Update Character-Bewegung (wenn im Character-Modus)
  if (gameMode === "character" && currentCharacter) {
    // WICHTIG: display() aufrufen BEVOR drawOrder() berechnet wird!
    // Das aktualisiert x, y, drawW, drawH für die korrekte Tiefensortierung
    currentCharacter.display();


    // Rebuild tiles mit Character eingebunden für korrekte z-order Sortierung
    const drawList = board.drawOrder(currentCharacter, visible);
    for (const t of drawList) {
      
      if (t === currentCharacter) {
        // Character ist bereits in drawList eingefügt, aber wir rendern ihn nicht nochmal
        // Die x, y, drawW, drawH sind schon aktualisiert von display() oben
        const currentImage = currentCharacter.getDisplayImage();
        if (currentImage && currentImage.width > 0 && currentImage.height > 0) {
          image(currentImage, currentCharacter.x, currentCharacter.y, currentCharacter.drawW, currentCharacter.drawH);
        }
        // Unter einer Bruecke nur den Charakterbereich erneut zeichnen, damit keine Tile-Raender aufblitzen.
        const context = drawingContext;
        context.save();
        context.beginPath();
        context.rect(currentCharacter.x, currentCharacter.y, currentCharacter.drawW, currentCharacter.drawH);
        context.clip();
        for (const cell of coveringCells(currentCharacter.gx, currentCharacter.gy, currentCharacter.height)) {
          const overlays = cell.overlays();
          const firstCover = overlays.findIndex((overlay) => hasElevatedWalkOptions(overlay) || hasUpperWalkLayer(overlay));
          overlays.slice(firstCover).forEach((overlay) => cell.drawImage(overlay));
        }
        context.restore();
      } else {
        t.show();
      }
    }
  } else {
    // Build Mode - nur Tiles
    if (!drawnView || Object.keys(visible).some((key) => drawnView[key] !== visible[key])) {
      tiles = board.drawOrder(null, visible);
      drawnView = visible;
    }
    for (const t of tiles) {
      t.show();
    }
  }

  if (landExpansion) landExpansion.draw(drawingContext, cam, view, gameMode === "build");
  pop();
}

function gameWindowResized() {
  scheduleViewportLayout();
}

let viewportFrame = null;
function scheduleViewportLayout() {
  if (viewportFrame !== null) return;
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = null;
    updateViewportLayout();
  });
}

function observeViewport() {
  const observer = new ResizeObserver(scheduleViewportLayout);
  observer.observe(document.querySelector(".stage"));
  observer.observe(document.getElementById("left-palette"));
  window.addEventListener("orientationchange", scheduleViewportLayout);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleViewportLayout);
}

function updateViewportLayout() {
  if (!gameCanvas) {
    return;
  }

  const center = CameraGeometry.center(cam, view);
  const targetCenter = CameraGeometry.center(camTarget, view);
  measureView();
  // resizeCanvas zeichnet synchron neu; erst nach der Kameraanpassung weiterzeichnen.
  if (width !== view.w || height !== view.h) resizeCanvas(view.w, view.h, true);
  gameCanvas.elt.style.removeProperty("width");
  gameCanvas.elt.style.removeProperty("height");
  if (cameraFitsWorld) {
    CameraGeometry.fit(camTarget, board.land.bounds(), view);
    Object.assign(cam, camTarget);
  } else {
    CameraGeometry.moveCenter(cam, view, center);
    CameraGeometry.moveCenter(camTarget, view, targetCenter);
    clampCamera(camTarget);
    clampCamera(cam);
  }
  if (landExpansion) {
    landExpansion.setRevealScale(camTarget.scale);
    clampCamera(camTarget);
    clampCamera(cam);
  }
}

function initLandExpansion() {
  landExpansion = new LandExpansion({
    board,
    onSelect: () => {
      setUiHidden(false);
      lastOverlayTap = null;
      cameraFitsWorld = false;
      updateViewportLayout();
    },
    onClose: () => {
      updateViewportLayout();
    },
    onUnlock: () => {
      cameraFitsWorld = false;
      updateViewportLayout();
      if (!EDITOR_MODE) saveGame.save();
    },
  });
  document.getElementById("home-button").addEventListener("click", () => {
    landExpansion.close(false);
    characterCameraFollowing = false;
    setUiHidden(false);
    resetCamera();
    Object.assign(cam, camTarget);
  });
}

function canvasPoint(event) {
  const rect = gameCanvas.elt.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function handleTap(px, py, withCtrl) {
  if (resetChoiceOpen()) return;
  if (landExpansion && landExpansion.active) return;
  if (tileVariants) tileVariants.close();
  console.log(`[handleTap] Click at canvas (${px}, ${py}), gameMode=${gameMode}`);
  
  const worldX = cam.x + px / cam.scale;
  const worldY = cam.y + py / cam.scale;
  console.log(`[handleTap] World coords: (${worldX}, ${worldY})`);
  if (!board.land.contains(worldX, worldY)) {
    if (gameMode === "build" && landExpansion) landExpansion.chooseAt(worldX, worldY);
    return;
  }

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
      if (def.type === "OVER" && tile.overlays().includes(selectedImage)) {
        return;
      }

      const result = board.place(tile, selectedImage, def, img[MEADOW_TILE_INDEX]);
      if (result === "locked") {
        showToast("Dieses Tile ist fest");
      } else if (result === "over-not-allowed") {
        showToast("Dieses OVER ist auf diesem Boden nicht erlaubt");
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
    if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable]")) {
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

}

function createTilePalette() {
  const leftPalette = document.getElementById("left-palette");

  if (!leftPalette || leftPalette.childElementCount > 0) {
    return;
  }

  tileVariants = new TileVariants({
    definitions: tileDefs, families: window.TILE_MANIFEST.families || [],
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
  });
  tileVariants.mount({
    select: (index) => selectPaletteTile(index, true),
    getSelected: () => selectedPaletteIndex,
  });

  const normalize = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const makeTileButton = (index) => {
    index = tileVariants.representative(index);
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

    tileVariants.decorate(button, index);
    button.addEventListener("click", (event) => {
      const current = Number(button.dataset.tileIndex);
      selectPaletteTile(current, Boolean(button.dataset.familyId));
      if (selectedPaletteIndex === current && button.closest("#left-palette") &&
          (button.closest(".cat-flyout") || button.closest(".dock-scroll"))) tileVariants.open(button, event.detail === 0);
    });
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
  const searchIcon = document.createElement("img");
  searchIcon.src = "icons/Lupe.png";
  searchIcon.alt = "";
  searchButton.appendChild(searchIcon);

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
    tileVariants.collapse(category.indices).forEach((index) => items.appendChild(makeTileButton(index)));

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
    '<img class="recent-icon" src="icons/zuletzt.png" alt=""><span class="cat-chevron"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

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
        recentItems.replaceChildren(...tileVariants.collapse(recentTileIndices).map(makeTileButton));
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
    tileVariants.close();
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
      .filter(({ def, index }) => index !== MEADOW_TILE_INDEX && !def.hiddenInPalette && terms.every((term) => normalize(`${def.name} ${def.category} ${(def.tags || []).join(" ")} ${tileVariants.searchText(index)}`).includes(term)));

    if (hits.length === 0) {
      const empty = document.createElement("span");
      empty.className = "palette-empty";
      empty.textContent = "Nichts gefunden";
      scroller.replaceChildren(empty);
      return;
    }

    scroller.replaceChildren(...tileVariants.collapse(hits.map(({ index }) => index)).map(makeTileButton));
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
  if (tileVariants) tileVariants.updateButtons();
  document.querySelectorAll(".tile-button[data-tile-index]").forEach((button) => {
    const on = Number(button.dataset.tileIndex) === selectedPaletteIndex;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

function selectPaletteTile(index, force = false) {
  lastOverlayTap = null;
  if (tileVariants && !force) tileVariants.close();
  selectedPaletteIndex = selectedPaletteIndex === index && !force ? null : index;
  if (selectedPaletteIndex !== null && index !== MEADOW_TILE_INDEX) {
    if (tileVariants) tileVariants.remember(index);
    recentTileIndices = [index, ...recentTileIndices.filter((i) => tileVariants ? tileVariants.key(i) !== tileVariants.key(index) : i !== index)].slice(0, RECENT_LIMIT);
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
  if (resetChoiceOpen()) return;
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
  if (resetChoiceOpen()) return;
  if (gameMode !== "character" || !currentCharacter) {
    return;
  }
  
  // Update laufende Bewegungs-Animation
  currentCharacter.updateMovement();
  
  // Desktop: WASD - aber nur Bewegung starten wenn nicht bereits in Bewegung
  if (!currentCharacter.isMoving) {
    if (keysPressed.w) startCharacterMovement("up-right");
    else if (keysPressed.s) startCharacterMovement("down-left");
    else if (keysPressed.a) startCharacterMovement("up-left");
    else if (keysPressed.d) startCharacterMovement("down-right");
  }
  
  // Mobile: Touch-Controller (nur wenn nicht null)
  if (touchController && touchController.isMobile && !currentCharacter.isMoving) {
    const direction = touchController.getDirection();
    if (direction) {
      characterCameraFollowing = true;
      startCharacterMovement(direction);
    }
  }
}

function startCharacterMovement(direction) {
  const wasMoving = currentCharacter.isMoving;
  currentCharacter.startMovement(direction);
  if (!wasMoving && currentCharacter.isMoving) {
    notifyTutorialAction("character-moved", { direction });
  }
}

// Charakterordner muessen fortlaufend char_1, char_2, ... heissen.
async function loadCharacters() {
  let index = 1;
  while (true) {
    const folder = `char_${index}`;
    const response = await fetch(`character/${folder}/animiert_vorn.gif`, {
      method: "HEAD",
      cache: "no-cache"
    });

    if (response.status === 404) {
      break;
    }
    if (!response.ok) {
      throw new Error(`character/${folder}/animiert_vorn.gif: ${response.status}`);
    }

    characterManager.addCharacter(`Charakter ${index}`, `character/${folder}`);
    index += 1;
  }

  if (index === 1) {
    throw new Error("Keine Charakterordner gefunden. Erwartet wird character/char_1/.");
  }
}

function switchGameMode(newMode) {
  if (tileVariants) tileVariants.close();
  if (landExpansion) landExpansion.close(false);
  gameMode = newMode;
  characterCameraFollowing = true;
  setUiHidden(false);
  const app = document.querySelector(".app");
  if (app) {
    app.classList.toggle("explore-mode", gameMode === "character");
  }
  
  if (gameMode === "build") {
    enableBuildMode();
    if (characterSelectionBar) {
      characterSelectionBar.hide();
    }
    currentCharacter = null;
    setRespawnButtonVisible(false);
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

  notifyTutorialAction("mode-changed", { mode: gameMode });
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
    previewImage: character.images.idleFront ? centeredCharacterPreview(character.images.idleFront) : null
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
    () => {
      characterSelectionBar.show((selectedName) => placeCharacterAtViewCenter(selectedName), backToBuild);
      notifyTutorialAction("explore-confirmed");
    },
    backToBuild
  );
}

// Spawn-Punkt: Wege bevorzugt, dann Strassen/Boden, nah an der Mitte des sichtbaren Bereichs (siehe walk.js)
let spawnHistory = [];

function findSpawnTile(avoid = []) {
  const centerX = cam.x + view.w / cam.scale / 2;
  const centerY = cam.y + view.h / cam.scale / 2;
  return pickSpawnCell(centerX, centerY, avoid);
}

// Respawn-Knopf: Charakter an einer anderen Stelle neu platzieren, falls er festsitzt
function respawnCharacter() {
  if (gameMode !== "character" || !currentCharacter) {
    return;
  }
  const here = { gx: Math.round(currentCharacter.targetGx), gy: Math.round(currentCharacter.targetGy) };
  const spawn = findSpawnTile([here, ...spawnHistory]);
  if (!spawn) {
    showToast("Kein anderes begehbares Feld gefunden!");
    return;
  }
  spawnHistory = [...spawnHistory.slice(-4), here, { gx: spawn.gx, gy: spawn.gy }];
  currentCharacter.init(CHARACTER_TILE_SIZE, spawn.gx, spawn.gy);
  characterCameraFollowing = true;
}

function setRespawnButtonVisible(visible) {
  const button = document.getElementById("respawn-button");
  if (button) {
    button.hidden = !visible;
  }
  const app = document.querySelector("main.app");
  if (app) {
    app.classList.toggle("has-respawn", visible && gameMode === "character");
  }
}

function placeCharacterAtViewCenter(characterName) {
  if (!characterManager.selectCharacter(characterName)) {
    return;
  }
  
  const character = characterManager.currentCharacter;
  const spawn = findSpawnTile();
  
  if (!spawn) {
    showToast("Kein begehbares Feld gefunden!");
    if (modeSwitch) {
      modeSwitch.setMode("build");
    }
    return;
  }
  
  currentCharacter = character;
  currentCharacter.init(CHARACTER_TILE_SIZE, spawn.gx, spawn.gy);
  spawnHistory = [{ gx: spawn.gx, gy: spawn.gy }];
  setRespawnButtonVisible(true);
  
  const mainElement = document.querySelector("main.app");
  if (mainElement) {
    if (touchController) {
      touchController.destroy();
    }
    touchController = new TouchController(mainElement);
  }

  notifyTutorialAction("character-ready");
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

  meadowButton.addEventListener("click", () => {
    closeMenu();
    if (landExpansion) landExpansion.close(false);
    document.getElementById("reset-panel").hidden = false;
    document.querySelector(".app").classList.add("resetting");
    keysPressed = { w: false, a: false, s: false, d: false };
    document.getElementById("reset-city").focus();
  });

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

window.addEventListener("pagehide", () => saveGame.save());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveGame.save();
  }
});

function resetChoiceOpen() {
  const panel = document.getElementById("reset-panel");
  return saveGame.pendingReset || Boolean(panel && !panel.hidden);
}

function resetCity(entireSave) {
  if (saveGame.pendingReset) return;
  if (gameMode !== "build" && modeSwitch) modeSwitch.setMode("build");
  if (landExpansion) {
    landExpansion.close(false);
    landExpansion.clearReveal();
  }
  lastOverlayTap = null;
  spawnHistory = [];
  if (entireSave) {
    const land = new WorldLand();
    buildBoard(board, img[MEADOW_TILE_INDEX], land);
    recentTileIndices = [];
    selectedPaletteIndex = null;
    syncPaletteSelection();
  }
  resetToStartLayout(entireSave || EDITOR_MODE ? initialCityLayout() : [], board, tileDefs, img, MEADOW_TILE_INDEX);
  selectedBoardTileIndices.clear();
  if (landExpansion) landExpansion.refresh();
  updateViewportLayout();
  resetCamera();
  Object.assign(cam, camTarget);
  if (!EDITOR_MODE) saveGame.save();
  notifyTutorialAction("reset-confirmed");
}

function bindResetChoice() {
  const panel = document.getElementById("reset-panel");
  const close = () => {
    panel.hidden = true;
    document.querySelector(".app").classList.remove("resetting");
    document.getElementById("menu-toggle").focus();
  };
  document.getElementById("reset-city").addEventListener("click", () => {
    close();
    resetCity(false);
  });
  document.getElementById("reset-all").addEventListener("click", () => {
    close();
    resetCity(true);
  });
  document.getElementById("reset-cancel").addEventListener("click", close);
  window.addEventListener("keydown", (event) => {
    if (panel.hidden) return;
    if (event.key === "Escape") close();
    if (event.key === "Tab") {
      const buttons = ["reset-city", "reset-all", "reset-cancel"].map((id) => document.getElementById(id));
      const index = buttons.indexOf(document.activeElement);
      event.preventDefault();
      buttons[(index + (event.shiftKey ? 2 : 1)) % buttons.length].focus();
    }
  });
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

function bindRespawn() {
  const button = document.getElementById("respawn-button");
  if (button) {
    button.addEventListener("click", () => {
      respawnCharacter();
      button.blur();
    });
  }
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
    if (gameMode === "build" && !resetChoiceOpen() && !(landExpansion && landExpansion.active) && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement)) {
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
    exportLayout(board, tileDefs, img, MEADOW_TILE_INDEX);
    showToast("start-layout.csv exportiert");
  }
});

// Der Katalog muss vor p5 geladen sein; p5 wird deshalb erst danach gestartet.
async function startGame() {
  // Initialisiere Character-Manager früh, damit Assets in gamePreload geladen werden
  characterManager = new CharacterManager();
  
  try {
    await loadCharacters();
    const manifest = await loadTileCatalog();
    ({ tileDefs, tileCategories } = buildTileDefs(manifest));
    window.TILE_MANIFEST = manifest;
    installCatalogRules(tileDefs, manifest.profiles);
    if (manifest.issues.length) showCatalogWarnings(manifest.issues);
  } catch (error) {
    console.error(error);
    showCatalogWarnings([`Spielstart fehlgeschlagen: ${error.message}`]);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<p style="position:fixed;inset:0;margin:0;padding:24px;background:#222;color:#fff;font:16px var(--copy-font);z-index:99">Das Spiel konnte nicht gestartet werden. Bitte versuche es später erneut.</p>'
    );
    return;
  }

  window.preload = gamePreload;
  window.setup = gameSetup;
  let loaderHidden = false;
  window.draw = () => {
    gameDraw();
    if (!loaderHidden) {
      loaderHidden = true;
      const loader = document.getElementById("loader");
      if (loader) {
        loader.classList.add("done");
        setTimeout(() => loader.remove(), 600);
      }
    }
  };
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
    if (event.target === intro || (intro.classList.contains("idle") && !event.target.closest("button"))) {
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
  if (saveGame.pendingReset) return;
  if (landExpansion) landExpansion.close(false);
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
  const visual = document.getElementById("tutorial-visual");
  const title = document.getElementById("tutorial-title");
  const copy = document.getElementById("tutorial-copy");
  const next = document.getElementById("tutorial-next");
  const close = document.getElementById("tutorial-close");
  const menuToggle = document.getElementById("menu-toggle");
  const menuPanel = document.getElementById("menu-panel");
  const canvas = document.querySelector("#sketch canvas");
  const app = document.querySelector(".app");

  if (!tutorial || !palette || !scroller || !focus || !card || !visual || !title || !copy || !next || !close || !canvas || !menuToggle || !menuPanel || !app) {
    return;
  }

  const isTouch = TouchController.prototype.detectMobile();
  const tap = isTouch ? "Tippe" : "Klicke";
  const steps = [
    { type: "category", category: "1_Hauslinks", title: "Deine Stadt beginnt", text: `Lass uns eine Stadt bauen! ${tap} dafür zuerst auf die Haus-Kategorie.` },
    { type: "tile", category: "1_Hauslinks", title: "Haus auswählen", text: `Wähle ein Haus. ${isTouch ? "Wische" : "Ziehe"} seitlich, um mehr Häuser zu entdecken.` },
    { type: "board", title: "Haus bauen", text: `${tap} auf ein freies Feld.` },
    { type: "undo", title: "Upsi", text: `Wenn du mal einen Fehler machst, ist das nicht schlimm. ${tap} auf den Pfeil, um den Bau rückgängig zu machen.` },
    { type: "tile", category: "13_Stadtboden", file: "Asphalt_1.png", title: "Den Boden gestalten", text: "Du kannst den Boden verändern. Das geht zum Beispiel mit Asphalt." },
    { type: "ground", title: "Boden verlegen", text: `${tap} auf ein freies Feld um den Boden zu verändern.` },
    { type: "tile", category: "21_Tiere", file: "Katze_1.png", title: "Spaß haben!", text: "Du kannst die Stadt neben Häusern und Böden mit vielen verschiedenen Objekten gestalten. Was wäre eine Stadt ohne eine Katze?" },
    { type: "overlay", title: "Objekt platzieren", text: `${tap} auf den Asphalt, um die Katze draufzusetzen.` },
    { type: "remove-overlay", title: "Objekt entfernen", text: `${isTouch ? "Tippe zweimal schnell" : "Klicke zweimal schnell"} auf ein Objekt, um es wieder zu entfernen` },
    { type: "erase", title: "Feld zurücksetzen", text: `Nutze die Wiese um deine Felder wieder zurückzusetzen.` },
    { type: "explore", title: "Stadt erkunden", text: `${tap} oben links auf die Figur um in den Entdecker Modus zu wechseln. Wähle dort eine Figur, mit der du deinen Stadtteil erkunden möchtest.` },
    { type: "move", title: "Unterwegs", text: isTouch ? "Nutze die Richtungspfeile um deine Figur zu bewegen." : "Nutze W A S D, um deine Figur zu bewegen." },
    { type: "menu", title: "fast geschafft!", text: `${tap} oben rechts auf das Menü um weitere Aktionen zu entdecken.` },
    { type: "menu-info", title: "Deine Möglichkeiten", text: `Im Menü kannst du ein Foto deiner Stadt speichern oder sie komplett zurücksetzen.` },
    { type: "done", title: "Jetzt bist du dran!", text: "Beende das Tutorial und starte den Ausbau deiner Nordstadt mit Häusern, Tieren und noch ganz vielem weiteren zum Entdecken." },
  ];

  let step = 0;
  let houseDef = null;
  let groundDef = null;
  let overlayDef = null;
  let lessonCell = null;
  let tutorialHouseCell = null;
  let activeTarget = null;
  let activePoint = null;
  let focusFrame = null;
  let cardBottom = null;
  let positionedToast = null;
  let renderedStep = -1;
  const savedState = {
    land: board.land.snapshot(),
    board: board.snapshot(true),
    history: board.history.slice(),
    recentTileIndices: recentTileIndices.slice(),
    selectedPaletteIndex,
    selectedBoardTileIndices: [...selectedBoardTileIndices],
    cameraFitsWorld,
    cam: { ...cam },
    camTarget: { ...camTarget },
    lastOverlayTap,
    saveEnabled: saveGame.enabled,
  };
  let tutorialBoardActive = false;
  const flyout = palette.querySelector(".cat-flyout");

  const startTutorialBoard = () => {
    saveGame.save();
    saveGame.disable();
    buildBoard(board, img[MEADOW_TILE_INDEX], new WorldLand());
    resetToStartLayout(initialCityLayout(), board, tileDefs, img, MEADOW_TILE_INDEX);
    board.history = [];
    recentTileIndices = [];
    selectedBoardTileIndices.clear();
    selectedPaletteIndex = null;
    syncPaletteSelection();
    const undoButton = document.getElementById("undo-button");
    if (undoButton) {
      undoButton.disabled = true;
    }
    cameraFitsWorld = false;
    if (landExpansion) {
      landExpansion.refresh();
    }
    updateViewportLayout();
    resetCamera();
    Object.assign(cam, camTarget);
    tutorialBoardActive = true;
  };

  const restoreTutorialBoard = () => {
    if (!tutorialBoardActive) {
      return;
    }
    if (gameMode !== "build" && modeSwitch) {
      modeSwitch.setMode("build");
    }
    if (characterSelectionBar) {
      characterSelectionBar.hide();
    }
    const resetPanel = document.getElementById("reset-panel");
    const app = document.querySelector(".app");
    if (resetPanel) {
      resetPanel.hidden = true;
    }
    if (app) {
      app.classList.remove("resetting");
    }
    menuPanel.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    buildBoard(board, img[MEADOW_TILE_INDEX], new WorldLand(savedState.land));
    board.restore(savedState.board);
    board.history = savedState.history;
    recentTileIndices = savedState.recentTileIndices;
    selectedPaletteIndex = savedState.selectedPaletteIndex;
    if (selectedPaletteIndex !== null && tileVariants) tileVariants.remember(selectedPaletteIndex);
    selectedBoardTileIndices = new Set(savedState.selectedBoardTileIndices);
    lastOverlayTap = savedState.lastOverlayTap;
    cameraFitsWorld = savedState.cameraFitsWorld;
    if (landExpansion) {
      landExpansion.refresh();
    }
    updateViewportLayout();
    Object.assign(camTarget, savedState.camTarget);
    Object.assign(cam, savedState.cam);
    const undoButton = document.getElementById("undo-button");
    if (undoButton) {
      undoButton.disabled = board.history.length === 0;
    }
    syncPaletteSelection();
    if (savedState.saveEnabled) {
      saveGame.enable();
    }
    tutorialBoardActive = false;
  };

  // Altes Auswahl-Toggle darf das Tutorial nicht blockieren
  selectedPaletteIndex = null;
  syncPaletteSelection();

  const categoryButton = (name) =>
    [...palette.querySelectorAll(".cat-button")].find((button) => button.title === name) || null;
  const tileButton = (category, file) =>
    [...palette.querySelectorAll(".tile-button[data-tile-index]")].find(
      (button) => button.dataset.tileCategory === category && button.dataset.tileFile === file
    ) || null;
  const findFreeHouseCell = (def) => {
    const w = def.w || 1;
    const h = def.h || 1;
    const centerX = cam.x + view.w / cam.scale / 2;
    const canvasRect = canvas.getBoundingClientRect();
    const cardBottom = card.getBoundingClientRect().bottom;
    const visibleY = Math.max(0.5, Math.min(0.75, (cardBottom - canvasRect.top + 70) / canvasRect.height));
    const centerY = cam.y + view.h * visibleY / cam.scale;
    return board.sorted()
      .filter((cell) => {
        const anchor = board.get(cell.gx - w + 1, cell.gy - h + 1);
        const footprint = anchor && board.footprint(anchor, w, h);
        return footprint && footprint.every((part) =>
          !board.isLocked(part) &&
          !part.owner &&
          part.ground === img[MEADOW_TILE_INDEX] &&
          part.groundType === "UNDER" &&
          !part.overlay &&
          !part.overlayBack
        );
      })
      .sort((a, b) => {
        const aDistance = Math.hypot(a.x + CELL_CENTER_X - centerX, a.y + CELL_CENTER_Y - centerY);
        const bDistance = Math.hypot(b.x + CELL_CENTER_X - centerX, b.y + CELL_CENTER_Y - centerY);
        return aDistance - bDistance;
      })[0] || null;
  };

  const drawVisual = (current, target) => {
    visual.replaceChildren();
    if (current.type === "move") {
      const keys = document.createElement("span");
      keys.classList.add("tutorial-visual-keys");
      for (const key of (isTouch ? ["↖", "↗", "↙", "↘"] : ["W", "A", "S", "D"])) {
        const keyTile = document.createElement("span");
        keyTile.classList.add("tutorial-visual-key");
        keyTile.textContent = key;
        keys.appendChild(keyTile);
      }
      visual.appendChild(keys);
      return;
    }

    const image = target && target.querySelector("img");
    if (image && image.src) {
      const picture = document.createElement("img");
      picture.src = image.src;
      picture.alt = "";
      visual.appendChild(picture);
      return;
    }

    const symbols = {
      category: "▦",
      board: "⌖",
      ground: "⌖",
      overlay: "⌖",
      "remove-overlay": "⌖",
      erase: "⌖",
      "menu-info": "✦",
      done: "✓",
    };
    visual.textContent = symbols[current.type] || "●";
  };

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

  const render = () => {
    const current = steps[step];
    if (!current) {
      return;
    }
    if (activeTarget) {
      activeTarget.classList.remove("tutorial-target");
      activeTarget = null;
    }
    focus.hidden = true;
    activePoint = null;
    if (renderedStep !== step && copy.parentElement) copy.parentElement.scrollTop = 0;
    renderedStep = step;
    title.textContent = current.title;
    copy.textContent = current.text;
    next.textContent = current.type === "done" ? "Fertig" : current.type === "menu-info" ? "Weiter" : "Auslassen";

    let target = null;
    if (current.type === "category") {
      target = categoryButton(current.category);
    } else if (current.type === "tile") {
      openCategory(current.category);
      target = current.file ? tileButton(current.category, current.file) : flyout;
      if (!target) copy.textContent = "Diese Übungskachel ist nicht verfügbar. Wähle „Auslassen“.";
    } else if (current.type === "board") {
      tutorialHouseCell = findFreeHouseCell(houseDef);
      activePoint = tutorialHouseCell;
    } else if (current.type === "ground") {
      activePoint = findFreeHouseCell(groundDef);
    } else if (current.type === "overlay" || current.type === "remove-overlay") {
      activePoint = lessonCell;
    } else if (current.type === "erase") {
      if (selectedPaletteIndex === MEADOW_TILE_INDEX) {
        activePoint = lessonCell;
      } else {
        target = palette.querySelector(".dock-meadow");
      }
    } else if (current.type === "undo") {
      target = document.getElementById("undo-button");
    } else if (current.type === "menu") {
      target = menuToggle;
    } else if (current.type === "explore") {
      target = document.getElementById("character-notice-continue") ||
        document.querySelector(".char-select-list") ||
        document.getElementById("mode-button-character");
    } else if (current.type === "move") {
      target = (touchController && touchController.pad) || document.querySelector(".character-controls-hint:not([hidden])");
    }

    drawVisual(current, target);

    if (target) {
      activeTarget = target;
      target.classList.add("tutorial-target");
      if (current.type === "category" || (current.type === "tile" && current.file)) {
        target.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
      }
    }
  };

  const updateFocus = () => {
    const point = activePoint && tilePoint(activePoint);
    if (activeTarget && activeTarget.isConnected) {
      const rect = activeTarget.getBoundingClientRect();
      focus.style.left = `${rect.left - 5}px`;
      focus.style.top = `${rect.top - 5}px`;
      focus.style.width = `${rect.width + 10}px`;
      focus.style.height = `${rect.height + 10}px`;
      focus.hidden = false;
    } else if (point) {
      focus.style.left = `${point.x - 34}px`;
      focus.style.top = `${point.y - 34}px`;
      focus.style.width = "68px";
      focus.style.height = "68px";
      focus.hidden = false;
    } else {
      focus.hidden = true;
    }
    const bottom = card.getBoundingClientRect().bottom;
    const toast = document.getElementById("toast");
    if (toast && (toast !== positionedToast || bottom !== cardBottom)) {
      toast.style.setProperty("--tutorial-bottom", `${bottom}px`);
      positionedToast = toast;
    }
    if (bottom !== cardBottom) {
      cardBottom = bottom;
      app.style.setProperty("--tutorial-bottom", `${bottom}px`);
    }
    focusFrame = requestAnimationFrame(updateFocus);
  };

  const finish = () => {
    tutorial.hidden = true;
    focus.hidden = true;
    if (activeTarget) {
      activeTarget.classList.remove("tutorial-target");
      activeTarget = null;
    }
    tutorialActionHandler = null;
    cancelAnimationFrame(focusFrame);
    if (positionedToast) positionedToast.style.removeProperty("--tutorial-bottom");
    app.classList.remove("tutorial-active");
    app.style.removeProperty("--tutorial-bottom");
    restoreTutorialBoard();
    close.removeEventListener("click", finish);
    next.removeEventListener("click", onNextClick);
    palette.removeEventListener("click", onPaletteClick);
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

  const onNextClick = () => {
    if (steps[step].type === "menu-info") {
      step++;
      render();
    } else if (steps[step].type === "done") {
      finish();
    } else {
      const current = steps[step].type;
      if (current === "category") {
        step++;
      } else if ((current === "tile" && !steps[step].file) || current === "board" || current === "undo") {
        step = steps.findIndex((item) => item.type === "tile" && item.file === "Asphalt_1.png");
      } else if (["tile", "ground", "overlay", "remove-overlay", "erase"].includes(current)) {
        step = steps.findIndex((item) => item.type === "explore");
      } else {
        if (gameMode === "character" && modeSwitch) modeSwitch.setMode("build");
        step = steps.findIndex((item) => item.type === "menu-info");
      }
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

    if (
      current.type === "tile" &&
      action === "palette-selected" &&
      detail.def &&
      detail.def.category === current.category &&
      (!current.file || detail.def.file === current.file) &&
      selectedPaletteIndex === detail.index
    ) {
      if (!current.file) houseDef = detail.def;
      else if (detail.def.type === "UNDER") groundDef = detail.def;
      else if (detail.def.type === "OVER") overlayDef = detail.def;
      step++;
      const openButton = categoryButton(current.category);
      if (openButton && openButton.getAttribute("aria-expanded") === "true") openButton.click();
      completed = true;
    } else if (current.type === "board" && action === "tile-placed" && detail.def === houseDef) {
      step++;
      completed = true;
    } else if (current.type === "undo" && action === "undo") {
      step++;
      completed = true;
    } else if (current.type === "ground" && action === "tile-placed" && detail.def === groundDef) {
      lessonCell = detail.tile;
      step++;
      completed = true;
    } else if (current.type === "overlay" && action === "tile-placed" && detail.def === overlayDef && detail.tile.key === lessonCell.key) {
      lastOverlayTap = null;
      step++;
      completed = true;
    } else if (current.type === "remove-overlay" && action === "overlay-removed" && detail.tile.key === lessonCell.key) {
      step++;
      completed = true;
    } else if (current.type === "erase" && action === "meadow-placed" && detail.tile.key === lessonCell.key) {
      step++;
      completed = true;
    } else if (current.type === "erase" && action === "palette-selected") {
      completed = true;
    } else if (current.type === "menu" && action === "menu-toggled" && detail.open) {
      step++;
      completed = true;
    } else if (current.type === "explore" && action === "character-ready") {
      step++;
      completed = true;
    } else if (current.type === "explore" && (action === "explore-confirmed" || action === "mode-changed")) {
      completed = true;
    } else if (current.type === "move" && action === "character-moved") {
      step++;
      completed = true;
    } else if (current.type === "move" && action === "mode-changed" && detail.mode === "build") {
      step = steps.findIndex((tutorialStep) => tutorialStep.type === "explore");
      completed = true;
    }

    if (completed) {
      render();
    }
  };

  startTutorialBoard();
  tutorial.hidden = false;
  app.classList.add("tutorial-active");
  const searchButton = palette.querySelector(".search-toggle");
  if (searchButton && searchButton.getAttribute("aria-expanded") === "true") searchButton.click();
  const initialCategory = categoryButton(steps[0].category);
  if (initialCategory && initialCategory.getAttribute("aria-expanded") === "true") initialCategory.click();
  render();
  updateFocus();
  close.addEventListener("click", finish);
  next.addEventListener("click", onNextClick);
  palette.addEventListener("click", onPaletteClick);
  window.addEventListener("resize", render);
  window.addEventListener("keydown", onKeydown);
}

function downloadImage(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function createCityImage(city) {
  const items = city.drawOrder();
  const bounds = city.land.bounds();
  for (const item of items) {
    bounds.minX = Math.min(bounds.minX, item.x);
    bounds.minY = Math.min(bounds.minY, item.y);
    bounds.maxX = Math.max(bounds.maxX, item.x + item.drawW);
    bounds.maxY = Math.max(bounds.maxY, item.y + item.drawH);
  }
  for (const tile of city.sorted()) {
    for (const image of [tile.ground, ...tile.overlays()]) {
      bounds.minY = Math.min(bounds.minY, tile.y + TILE_IMG - image.height * TILE_IMG / image.width);
    }
  }
  const padding = 32;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const scale = Math.min(1, 4096 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Bildexport wird von diesem Browser nicht unterstuetzt.");
  context.fillStyle = "#0b1638";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.scale(scale, scale);
  context.translate(padding - bounds.minX, padding - bounds.minY);
  const drawImage = (image, x, y, w, h) => {
    if (!image.canvas) throw new Error("Ein Tile-Bild ist fuer den Export nicht verfuegbar.");
    context.drawImage(image.canvas, x, y, w, h);
  };
  const drawTileImage = (tile, image) => {
    const height = image.height * TILE_IMG / image.width;
    drawImage(image, tile.x, tile.y + TILE_IMG - height, TILE_IMG, height);
  };
  for (const item of items) {
    if (item instanceof Building) {
      for (const cell of item.cells) drawTileImage(cell, cell.ground);
      drawImage(item.image, item.x, item.y, item.drawW, item.drawH);
    } else {
      drawTileImage(item, item.ground);
      item.overlays().forEach((image) => drawTileImage(item, image));
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Das Stadtbild konnte nicht erstellt werden."));
    }, "image/png");
  });
}

function bindUpdateNotice() {
  if (!saveGame.pendingReset) return;
  const panel = document.getElementById("update-panel");
  const imageButton = document.getElementById("update-image");
  const confirmButton = document.getElementById("update-confirm");
  const status = document.getElementById("update-status");
  const app = document.querySelector(".app");
  const sketch = document.getElementById("sketch");
  const palette = document.getElementById("left-palette");
  panel.hidden = false;
  app.classList.add("update-required");
  sketch.inert = true;
  palette.inert = true;
  imageButton.disabled = !saveGame.loaded;
  if (!saveGame.loaded) status.textContent =
    "Dein alter Spielstand konnte nicht dargestellt werden. Ein Stadtbild ist deshalb nicht verf\u00fcgbar. Der gespeicherte Stand bleibt bis zu deiner Best\u00e4tigung unver\u00e4ndert.";
  else if (saveGame.missingTiles) status.textContent =
    "Einige alte Tiles sind nicht mehr verf\u00fcgbar. Das Stadtbild ist deshalb unvollst\u00e4ndig. Dein gespeicherter Originalstand bleibt bis zur Best\u00e4tigung erhalten.";
  imageButton.addEventListener("click", async () => {
    imageButton.disabled = true;
    confirmButton.disabled = true;
    status.textContent = "Stadtbild wird erstellt \u2026";
    try {
      const blob = await createCityImage(board);
      downloadImage(blob, `nordstadt-vor-update-${new Date().toISOString().slice(0, 10)}.png`);
      status.textContent = "Bilddownload gestartet. Pr\u00fcfe bitte, ob du das Bild gespeichert hast, bevor du zur\u00fccksetzt.";
    } catch (error) {
      console.warn("Stadtbild vor Update fehlgeschlagen", error);
      status.textContent = `Das Stadtbild konnte nicht gespeichert werden: ${error.message}`;
      showToast("Stadtbild konnte nicht gespeichert werden. Dein Spielstand bleibt erhalten.");
    } finally {
      imageButton.disabled = false;
      confirmButton.disabled = false;
      imageButton.focus();
    }
  });
  confirmButton.addEventListener("click", () => {
    const newCity = new Board();
    buildBoard(newCity, img[MEADOW_TILE_INDEX]);
    applyStartLayout(initialCityLayout(), newCity, tileDefs, img, MEADOW_TILE_INDEX);
    if (!saveGame.acceptReset(newCity)) {
      status.textContent = "Der neue Spielstand konnte nicht gespeichert werden. Dein alter Stand bleibt erhalten. Bitte pr\u00fcfe den Browser-Speicher und versuche es erneut.";
      return;
    }
    buildBoard(board, img[MEADOW_TILE_INDEX], newCity.land);
    board.restore(newCity.snapshot());
    board.history = [];
    selectedBoardTileIndices.clear();
    selectedPaletteIndex = null;
    lastOverlayTap = null;
    syncPaletteSelection();
    landExpansion.refresh();
    panel.hidden = true;
    sketch.inert = false;
    palette.inert = false;
    app.classList.remove("update-required");
    updateViewportLayout();
    resetCamera();
    Object.assign(cam, camTarget);
    document.getElementById("menu-toggle").focus();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const buttons = [imageButton, confirmButton].filter((button) => !button.disabled);
    event.preventDefault();
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
  });
  (imageButton.disabled ? confirmButton : imageButton).focus();
}

// Speichert den Canvas (ohne Menue/Dock) als PNG auf dem Geraet.
(function initSaveImage() {
  const saveButton = document.getElementById("save-image");

  if (!saveButton) {
    return;
  }

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
