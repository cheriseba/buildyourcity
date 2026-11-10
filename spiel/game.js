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
    if (keysPressed.w) currentCharacter.startMovement("up-right");
    else if (keysPressed.s) currentCharacter.startMovement("down-left");
    else if (keysPressed.a) currentCharacter.startMovement("up-left");
    else if (keysPressed.d) currentCharacter.startMovement("down-right");
  }
  
  // Mobile: Touch-Controller (nur wenn nicht null)
  if (touchController && touchController.isMobile && !currentCharacter.isMoving) {
    const direction = touchController.getDirection();
    if (direction) {
      characterCameraFollowing = true;
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
    touchController = new TouchController(mainElement, 140, 140);
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
      '<p style="position:fixed;inset:0;margin:0;padding:24px;background:#222;color:#fff;font:16px sans-serif;z-index:99">Das Spiel konnte nicht gestartet werden. Bitte versuche es später erneut.</p>'
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
    { type: "reset", title: "Reset", text: "Klicke auf Reset und w\u00e4hle, ob du nur die gebaute Stadt oder den gesamten Spielstand zur\u00fccksetzen m\u00f6chtest." },
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
      ? "Die Stadt wurde entsprechend deiner Auswahl zur\u00fcckgesetzt. Klicke auf Fertig, um das Tutorial zu beenden."
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
