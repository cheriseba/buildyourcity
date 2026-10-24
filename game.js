img = [];

let tiles = [];
let selectedBoardTileIndices = new Set();
let selectedPaletteButton = null;
let selectedPaletteIndex = null;

const TILE_BATCH_SIZE = 16;
let discoveredTileCount = 63;
const BASE_CANVAS_SIZE = 1024;
const MEADOW_TILE_INDEX = 10;

let gameCanvas;
let currentCanvasSize = BASE_CANVAS_SIZE;
let meadowTileImage = null;
let applyMeadowAfterSetup = false;
let applyRandomAfterSetup = false;

// Ermittelt per Image-Probe, wie viele tiles/tileN.png fortlaufend existieren (p5-Preload bricht bei 404 ab).
function probeTile(index) {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(true);
    probe.onerror = () => resolve(false);
    probe.src = `tiles/tile${index}.png`;
  });
}

async function discoverTileCount() {
  let count = 0;

  for (;;) {
    const results = await Promise.all(Array.from({ length: TILE_BATCH_SIZE }, (_, k) => probeTile(count + k)));
    const gap = results.indexOf(false);

    if (gap !== -1) {
      return count + gap;
    }

    count += TILE_BATCH_SIZE;
  }
}

function gamePreload() {
  for (let i = 0; i < discoveredTileCount; i++) {
    img[i] = loadImage(`tiles/tile${i}.png`);
  }

  meadowTileImage = loadImage(`tiles/tile${MEADOW_TILE_INDEX}.png`);
}

function gameSetup() {
  measureView();
  gameCanvas = createCanvas(view.w, view.h);
  gameCanvas.parent("sketch");

  let t = random(img);

  let g = 0;
  let ug = -0.5;
  let size = 64;
  let row = 16;

  for (i = 1; i <= 17; i++) {
    let x = ug * size;
    ug = ug + 1;

    t = random(img);
    tiles[i] = new Tile(x, -48, t);
  }

  for (i = 18; i <= 33; i++) {
    let x = g * size;
    g = g + 1;
    t = random(img);
    tiles[i] = new Tile(x, -32, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 34; i <= 50; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, -16, t);
  }

  for (i = 51; i <= 66; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, 0, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 67; i <= 83; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row, t);
  }

  for (i = 84; i <= 99; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 2, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 100; i <= 116; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 3, t);
  }

  for (i = 117; i <= 132; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 4, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 133; i <= 149; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 5, t);
  }

  for (i = 150; i <= 165; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 6, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 166; i <= 182; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 7, t);
  }

  for (i = 183; i <= 198; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 8, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 199; i <= 215; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 9, t);
  }

  for (i = 216; i <= 231; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 10, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 232; i <= 248; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 11, t);
  }

  for (i = 249; i <= 264; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 12, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 265; i <= 281; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 13, t);
  }

  for (i = 282; i <= 297; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 14, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 298; i <= 314; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 15, t);
  }

  for (i = 315; i <= 330; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 16, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 331; i <= 347; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 17, t);
  }

  for (i = 348; i <= 363; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 18, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 364; i <= 380; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 19, t);
  }

  for (i = 381; i <= 396; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 20, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 397; i <= 413; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 21, t);
  }

  for (i = 414; i <= 429; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 22, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 430; i <= 446; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 23, t);
  }

  for (i = 447; i <= 462; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 24, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 463; i <= 479; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 25, t);
  }

  for (i = 480; i <= 495; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 26, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 496; i <= 512; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 27, t);
  }

  for (i = 513; i <= 528; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 28, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 529; i <= 545; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 29, t);
  }

  for (i = 546; i <= 561; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 30, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 562; i <= 578; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 31, t);
  }

  for (i = 579; i <= 594; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 32, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 595; i <= 611; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 33, t);
  }

  for (i = 612; i <= 627; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 34, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 628; i <= 644; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 35, t);
  }

  for (i = 645; i <= 660; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 36, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 661; i <= 677; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 37, t);
  }

  for (i = 678; i <= 693; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 38, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 694; i <= 710; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 39, t);
  }

  for (i = 711; i <= 726; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 40, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 727; i <= 743; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 41, t);
  }

  for (i = 744; i <= 759; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 42, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 760; i <= 776; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 43, t);
  }

  for (i = 777; i <= 792; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 44, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 793; i <= 809; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 45, t);
  }

  for (i = 810; i <= 825; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 46, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 826; i <= 842; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 47, t);
  }

  for (i = 843; i <= 858; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 48, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 859; i <= 875; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 49, t);
  }

  for (i = 876; i <= 891; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 50, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 892; i <= 908; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 51, t);
  }

  for (i = 909; i <= 924; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 52, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 925; i <= 941; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 53, t);
  }

  for (i = 942; i <= 957; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 54, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 958; i <= 974; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 55, t);
  }

  for (i = 975; i <= 990; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 56, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 991; i <= 1007; i++) {
    let x = ug * size;
    ug = ug + 1;
    t = random(img);
    tiles[i] = new Tile(x, row * 57, t);
  }

  for (i = 1008; i <= 1023; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 58, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 1024; i <= 1040; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 59, t);
  }

  for (i = 1041; i <= 1056; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 60, t);
  }

  ug = -0.5;
  g = 0;

  for (i = 1057; i <= 1073; i++) {
    let x = ug * size;
    ug++;
    t = random(img);
    tiles[i] = new Tile(x, row * 61, t);
  }

  for (i = 1074; i <= 1089; i++) {
    let x = g * size;
    g++;
    t = random(img);
    tiles[i] = new Tile(x, row * 62, t);
  }

  noSmooth();
  createTilePalette();
  createModeSwitch();
  updateViewportLayout();
  initCamera();

  if (applyMeadowAfterSetup) {
    applyMeadowAfterSetup = false;
    makeAllMeadow();
  }

  if (applyRandomAfterSetup) {
    applyRandomAfterSetup = false;
    makeAllRandom();
  }
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
  view.minScale = Math.max(view.w, view.h) / BASE_CANVAS_SIZE;
}

function clampCamera(c) {
  c.scale = Math.min(Math.max(MAX_SCALE, view.minScale), Math.max(view.minScale, c.scale));
  c.x = Math.min(BASE_CANVAS_SIZE - view.w / c.scale, Math.max(0, c.x));
  c.y = Math.min(BASE_CANVAS_SIZE - (view.h - view.insetBottom) / c.scale, Math.max(-view.insetTop / c.scale, c.y));
}

function startScale() {
  return Math.max(view.minScale, window.innerWidth >= 900 ? 1.5 : 1.25);
}

function resetCamera() {
  camTarget.scale = startScale();
  camTarget.x = (BASE_CANVAS_SIZE - view.w / camTarget.scale) / 2;
  camTarget.y = (BASE_CANVAS_SIZE - view.h / camTarget.scale) / 2;
  clampCamera(camTarget);
}

function zoomAt(px, py, newScale, immediate) {
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

function panBy(dx, dy, immediate) {
  camTarget.x -= dx / camTarget.scale;
  camTarget.y -= dy / camTarget.scale;
  clampCamera(camTarget);

  if (immediate) {
    Object.assign(cam, camTarget);
  }
}

function gameDraw() {
  const ease = 0.25;
  cam.x += (camTarget.x - cam.x) * ease;
  cam.y += (camTarget.y - cam.y) * ease;
  cam.scale += (camTarget.scale - cam.scale) * ease;

  background(70);

  push();
  scale(cam.scale);
  translate(-cam.x, -cam.y);

  const viewW = view.w / cam.scale;
  const viewH = view.h / cam.scale;

  for (let i = 1; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.x + 64 < cam.x || t.x > cam.x + viewW || t.y + 64 < cam.y || t.y > cam.y + viewH) {
      continue;
    }
    t.show();
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
  const worldX = cam.x + px / cam.scale;
  const worldY = cam.y + py / cam.scale;

  for (let i = tiles.length - 1; i >= 1; i--) {
    if (tiles[i].contains(worldX, worldY)) {
      if (selectedPaletteIndex !== null && img[selectedPaletteIndex]) {
        tiles[i].setTile(img[selectedPaletteIndex]);
        return;
      }

      if (withCtrl) {
        if (selectedBoardTileIndices.has(i)) {
          selectedBoardTileIndices.delete(i);
        } else {
          selectedBoardTileIndices.add(i);
        }
      } else {
        selectedBoardTileIndices.clear();
        selectedBoardTileIndices.add(i);
      }
      return;
    }
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
    if (!pointers.has(event.pointerId)) {
      return;
    }

    pointers.delete(event.pointerId);
    pinch = null;

    if (pointers.size === 0) {
      canvasElement.classList.remove("dragging");

      if (!cancelled && !moved && !wasMultiTouch) {
        const point = canvasPoint(event);
        handleTap(point.x, point.y, event.ctrlKey);
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
    if (event.target instanceof HTMLElement && event.target.closest("button, input")) {
      return;
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


  for (let i = 0; i < img.length; i++) {
    const button = document.createElement("button");
    button.className = "tile-button";
    button.type = "button";
    button.dataset.tileIndex = String(i);

    const imageElement = document.createElement("img");
    imageElement.src = `tiles/tile${i}.png`;
    imageElement.alt = `Tile ${i}`;
    imageElement.loading = "lazy";
    imageElement.draggable = false;
    button.appendChild(imageElement);
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
      const wasSelected = selectedPaletteButton === button;

      if (selectedPaletteButton) {
        selectedPaletteButton.classList.remove("selected");
        selectedPaletteButton.setAttribute("aria-pressed", "false");
      }

      if (wasSelected) {
        selectedPaletteButton = null;
        selectedPaletteIndex = null;
        return;
      }

      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      selectedPaletteButton = button;
      selectedPaletteIndex = i;
      button.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });

    leftPalette.appendChild(button);
  }
}

function createModeSwitch() {
  const meadowButton = document.getElementById("mode-meadow");
  const allRandomButton = document.getElementById("mode-all-random");

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
    });
    menuToggle.dataset.bound = "1";
  }

  const infoToggle = document.getElementById("info-toggle");
  const infoOverlay = document.getElementById("info");

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
      pulseButton(menuToggle || button);
      closeMenu();
    });
    button.dataset.bound = "1";
  };

  bindConfirm(meadowButton, makeAllMeadow);
  bindConfirm(allRandomButton, makeAllRandom);

  document.addEventListener("pointerdown", (event) => {
    if (menuPanel && !menuPanel.hidden && !event.target.closest(".menu")) {
      closeMenu();
    }
  });
}

function enableDockDrag() {
  const dock = document.getElementById("left-palette");

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

function makeAllMeadow() {
  const meadowImage = meadowTileImage || img[MEADOW_TILE_INDEX];

  if (tiles.length <= 1) {
    applyMeadowAfterSetup = true;
    return;
  }

  if (!meadowImage) {
    loadImage(`tiles/tile${MEADOW_TILE_INDEX}.png`, (loadedImage) => {
      meadowTileImage = loadedImage;
      makeAllMeadow();
    });
    return;
  }

  meadowTileImage = meadowImage;

  for (let i = 1; i < tiles.length; i++) {
    if (tiles[i]) {
      tiles[i].setTile(meadowImage);
    }
  }

  selectedBoardTileIndices.clear();
}

function makeAllRandom() {
  if (tiles.length <= 1) {
    applyRandomAfterSetup = true;
    return;
  }

  const loadedTileImages = img.filter((tileImage) => Boolean(tileImage));

  if (loadedTileImages.length === 0) {
    applyRandomAfterSetup = true;
    return;
  }

  for (let i = 1; i < tiles.length; i++) {
    if (tiles[i]) {
      const randomIndex = Math.floor(Math.random() * loadedTileImages.length);
      tiles[i].setTile(loadedTileImages[randomIndex]);
    }
  }

  selectedBoardTileIndices.clear();
}

function initializeUiFallback() {
  createTilePalette();
  createModeSwitch();
  enableDockDrag();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeUiFallback);
} else {
  initializeUiFallback();
}


// p5 startet erst nach der Tile-Suche, damit preload nur existierende Dateien laedt.
discoverTileCount()
  .then((count) => {
    if (count > 0) {
      discoveredTileCount = count;
    }
  })
  .catch(() => {})
  .then(() => {
    window.preload = gamePreload;
    window.setup = gameSetup;
    window.draw = gameDraw;
    window.windowResized = gameWindowResized;

    if (!p5.instance) {
      new p5();
    }
  });

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

  intro.addEventListener("click", hide);

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

  const startButton = document.getElementById("intro-start");
  if (startButton) {
    startButton.focus({ preventScroll: true });
  }
})();

// Speichert den Canvas (ohne Menue/Dock) als PNG auf dem Geraet.
(function initSaveImage() {
  const saveButton = document.getElementById("save-image");

  if (!saveButton) {
    return;
  }

  saveButton.addEventListener("click", () => {
    const panel = document.getElementById("menu-panel");
    const toggle = document.getElementById("menu-toggle");
    if (panel) {
      panel.hidden = true;
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
    }

    try {
      gameCanvas.elt.toBlob((blob) => {
        if (!blob) {
          return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `nordstadt-${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }, "image/png");
    } catch (error) {
      alert("Speichern nicht moeglich. Bitte die Seite ueber einen Webserver oeffnen.");
    }
  });
})();
