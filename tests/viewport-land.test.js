const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createViewGame({ editor = false, small = false } = {}) {
  const listeners = new Map();
  const frames = [];
  const observers = [];
  const resizes = [];
  const storage = new Map();
  const messages = [];
  const elements = new Map();
  const stageRect = { width: 800, height: 1000, top: 0, bottom: 1000 };
  const dockRect = { width: 780, height: 100, top: 900, bottom: 1000 };
  const element = () => {
    const classes = new Set();
    const events = new Map();
    return {
      hidden: false, disabled: false, value: "", children: [], dataset: {}, style: { removeProperty() {} },
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
        toggle(value, force = !classes.has(value)) {
          if (force) classes.add(value); else classes.delete(value);
        },
      },
      addEventListener: (type, callback) => events.set(type, callback),
      fire: (type, event) => events.get(type)(event),
      setAttribute() {},
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
      add(child) { this.children.push(child); },
      focus() { this.focused = true; context.document.activeElement = this; },
    };
  };
  for (const id of ["left-palette", "land-panel", "land-confirm", "land-cancel",
    "land-markers", "home-button", "menu-panel", "menu-toggle", "mode-meadow",
    "reset-panel", "reset-city", "reset-all", "reset-cancel", "reset-all-help",
    "sketch", "update-panel", "update-image", "update-confirm", "update-status"]) {
    elements.set(id, element());
  }
  elements.get("reset-panel").hidden = true;
  elements.get("update-panel").hidden = true;
  const app = element();
  const stage = element();
  stage.getBoundingClientRect = () => stageRect;
  elements.get("left-palette").getBoundingClientRect = () => app.classList.contains("expanding")
    ? { width: 0, height: 0, top: 0, bottom: 0 } : dockRect;
  const context = vm.createContext({
    URLSearchParams, setTimeout, clearTimeout,
    console: { log() {}, warn() {} },
    performance: { now: () => 1000 },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.elements = []; observers.push(this); }
      observe(target) { this.elements.push(target); }
    },
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    width: 800, height: 1000,
    resizeCanvas: (w, h, noRedraw) => {
      context.width = w;
      context.height = h;
      resizes.push([w, h, noRedraw]);
    },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    document: {
      readyState: "loading",
      querySelector: (selector) => selector === ".stage" ? stage : selector === ".app" ? app : null,
      querySelectorAll: () => [],
      getElementById: (id) => elements.get(id) || null,
      addEventListener() {},
      createElement: element,
    },
    window: {
      innerWidth: 800, innerHeight: 1000, location: { search: editor ? "?editor" : "" },
      addEventListener: (type, callback) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      visualViewport: { addEventListener: (type, callback) => listeners.set(`visual:${type}`, [callback]) },
    },
  });
  for (const file of ["daten/start-layout.js", "welt/land.js", "welt/camera.js", "welt/land-ui.js", "welt/grid.js",
    "welt/tile.js", "welt/walk.js", "welt/over-rules.js", "speichern/save-game.js", "game.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "spiel", file), "utf8"), context, { filename: file });
  }
  const run = (code) => vm.runInContext(code, context);
  context.testCanvas = { elt: element() };
  context.showToast = (message) => messages.push(message);
  run(`
    img = [{ width: 64, height: 64 }];
    tileDefs = [{ id: "meadow", category: "", file: "meadow.png", type: "UNDER", w: 1, h: 1 }];
    buildBoard(board, img[0], new WorldLand(${small ? "WorldLand.initialParcels()" : "WorldLand.legacyParcels()"}));
    gameCanvas = testCanvas;
    measureView();
    cam.scale = 2;
    CameraGeometry.moveCenter(cam, view, { x: 512, y: 512 });
    Object.assign(camTarget, cam);
  `);
  return { run, context, elements, app, stage, stageRect, dockRect, listeners, frames, observers, resizes, storage, messages };
}

test("Rotation aktualisiert Canvas und behaelt Weltmittelpunkt und Zoom", () => {
  const game = createViewGame();
  game.stageRect.width = 1000;
  game.stageRect.height = 800;
  game.stageRect.bottom = 800;
  game.dockRect.top = 700;
  game.dockRect.bottom = 800;
  game.run("updateViewportLayout()");
  assert.deepEqual(game.resizes, [[1000, 800, true]]);
  assert.equal(game.run("cam.scale"), 2);
  assert.equal(game.run("CameraGeometry.center(cam, view).x"), 512);
  assert.equal(game.run("CameraGeometry.center(cam, view).y"), 512);
  assert.equal(game.run("CameraGeometry.center(camTarget, view).y"), 512);
  assert.equal(game.run("board.land.parcels.size"), 9);
});

test("Container, Palette, Orientierung und VisualViewport nutzen gebuendelte Aktualisierung", () => {
  const game = createViewGame();
  game.run("observeViewport()");
  assert.equal(game.observers[0].elements[0], game.stage);
  assert.equal(game.observers[0].elements[1], game.elements.get("left-palette"));
  game.stageRect.width = 899;
  game.observers[0].callback();
  game.listeners.get("orientationchange")[0]();
  game.listeners.get("visual:resize")[0]();
  game.run("gameWindowResized()");
  assert.equal(game.frames.length, 1);
  game.frames[0]();
  assert.deepEqual(game.resizes, [[899, 1000, true]]);
  game.run("gameWindowResized()");
  assert.equal(game.frames.length, 2);
});

test("Ausrichten fuellt die sichtbare Flaeche ohne Ausblick auf gesperrtes Land", () => {
  const game = createViewGame();
  game.run(`
    board.unlockParcel(3, 1);
    measureView();
    cameraFitsWorld = true;
    updateViewportLayout();
  `);
  for (const [w, h] of [[390, 844], [844, 390], [1920, 1080]]) {
    Object.assign(game.stageRect, { width: w, height: h, bottom: h });
    Object.assign(game.dockRect, { top: h - 90, height: 90, bottom: h });
    game.run("updateViewportLayout()");
    assert.equal(game.run(`(() => {
      const b = board.land.bounds();
      return (b.minX - cam.x) * cam.scale <= 1e-8 &&
        (b.maxX - cam.x) * cam.scale >= view.w - 1e-8 &&
        (b.minY - cam.y) * cam.scale <= view.insetTop + 1e-8 &&
        (b.maxY - cam.y) * cam.scale >= view.h - view.insetBottom - 1e-8;
    })()`), true);
  }
});

test("Kamera bleibt auch bei L-foermiger Welt und extremem Verschieben am freigeschalteten Land", () => {
  const game = createViewGame();
  game.run(`
    for (let x = 3; x < 9; x++) board.unlockParcel(x, 0);
    for (let y = -1; y > -7; y--) board.unlockParcel(0, y);
    measureView();
    cam.scale = 2;
    CameraGeometry.moveCenter(cam, view, { x: 3200, y: 3200 });
    clampCamera(cam);
  `);
  const checkVisibleLand = `board.land.regions().some((r) =>
    Math.min(r.maxX, cam.x + view.w / cam.scale) - Math.max(r.minX, cam.x) >= 64 &&
    Math.min(r.maxY, cam.y + (view.h - view.insetBottom) / cam.scale) -
      Math.max(r.minY, cam.y + view.insetTop / cam.scale) >= 64)`;
  assert.equal(game.run(checkVisibleLand), true);
  for (const value of [-1e9, 1e9]) {
    game.run(`cam.x = ${value}; cam.y = ${value}; clampCamera(cam)`);
    assert.equal(game.run(checkVisibleLand), true);
  }
});

test("Mindestzoom begrenzt sich beim Formatwechsel um denselben Weltmittelpunkt", () => {
  const game = createViewGame();
  game.run(`
    CameraGeometry.fit(cam, board.land.bounds(), view);
    Object.assign(camTarget, cam);
  `);
  Object.assign(game.stageRect, { width: 1400, height: 1400, bottom: 1400 });
  Object.assign(game.dockRect, { top: 1300, bottom: 1400 });
  game.run("updateViewportLayout()");
  assert.equal(game.run("CameraGeometry.center(cam, view).x"), 512);
  assert.equal(game.run("CameraGeometry.center(cam, view).y"), 512);
  assert.equal(game.run("cam.scale >= view.minScale"), true);
});

test("Rand-Plus oeffnet nur die Bestaetigung; Abbrechen bleibt folgenlos", () => {
  const game = createViewGame();
  game.run("initLandExpansion()");
  assert.equal(game.run("landExpansion.active"), false);
  assert.equal(game.elements.get("land-markers").children.length, 9);
  game.run("landExpansion.markerButtons.find((m) => m.parcel.x === 3 && m.parcel.y === 1).button.fire('click')");
  assert.equal(game.app.classList.contains("expanding"), true);
  assert.equal(game.run("view.insetBottom"), 0);
  assert.equal(game.elements.get("land-confirm").disabled, false);
  game.run("handleTap(100, 100, false)");
  assert.equal(game.run("board.land.parcels.size"), 9);
  assert.equal(game.run("board.history.length"), 0);
  game.elements.get("land-cancel").fire("click");
  assert.equal(game.run("board.land.parcels.size"), 9);
  assert.equal(game.app.classList.contains("expanding"), false);
  assert.equal(game.elements.get("land-markers").children.length, 9);
  assert.equal(game.run("view.insetBottom"), 100);
});

test("Explizite Bestaetigung speichert Freischaltung und erlaubt die naechste Erweiterung", () => {
  const game = createViewGame();
  game.run("saveGame.enable(); initLandExpansion(); landExpansion.choose({ x: 3, y: 1 })");
  game.elements.get("land-confirm").fire("click");
  assert.equal(game.run("board.land.parcels.size"), 10);
  assert.equal(game.run("landExpansion.active"), false);
  assert.equal(JSON.parse(game.storage.get("nordi-savegame-v1")).parcels.length, 10);
  assert.deepEqual(game.messages, []);
  assert.equal(game.run("landExpansion.candidates.some((p) => p.x === 4 && p.y === 1)"), true);
  assert.equal(game.run("landExpansion.candidates.some((p) => p.x === 3 && p.y === 1)"), false);
  game.run("landExpansion.close()");
});

test("Startgebiet-Knopf beendet Vorschau und kehrt ohne Freischaltung zurueck", () => {
  const game = createViewGame();
  game.run("initLandExpansion(); landExpansion.choose({ x: 3, y: 1 })");
  game.elements.get("home-button").fire("click");
  assert.equal(game.run("landExpansion.active"), false);
  assert.equal(game.run("board.land.parcels.size"), 9);
  assert.equal(game.run("CameraGeometry.center(cam, view).x"), 256);
  assert.equal(game.run("CameraGeometry.center(cam, view).y"), 512);
});

test("Rand-Plus bleibt ohne erfolgloses Verschieben unsichtbar", () => {
  const game = createViewGame();
  game.context.testDrawContext = {
    save() {}, restore() {}, setLineDash() {}, fillRect() {}, strokeRect() {},
  };
  game.run("initLandExpansion(); CameraGeometry.fit(cam, cameraBounds(), view); landExpansion.draw(testDrawContext, cam, view, true)");
  assert.equal(game.run("landExpansion.markerButtons.filter((m) => !m.button.hidden).length"), 0);
  assert.equal(game.run("board.land.parcels.size"), 9);
  assert.equal(game.run("landExpansion.markerButtons.every((m) => !board.land.contains(m.markerX, m.markerY) && m.dy !== -1)"), true);
  game.run("landExpansion.draw(testDrawContext, cam, view, false)");
  assert.equal(game.elements.get("land-markers").hidden, true);
  game.run("landExpansion.close()");
});

test("Escape bricht eine Erweiterung ab, ohne sie zu speichern", () => {
  const game = createViewGame();
  game.run("initLandExpansion(); landExpansion.choose({ x: -1, y: 1 })");
  for (const listener of game.listeners.get("keydown")) listener({ key: "Escape" });
  assert.equal(game.run("landExpansion.active"), false);
  assert.equal(game.run("board.land.parcels.size"), 9);
  assert.equal(game.storage.size, 0);
});

test("Neue Stadt laedt CSV-Startlayout auf den zwei Startgrundstuecken", () => {
  const game = createViewGame();
  game.context.window.TILE_MANIFEST = { layout: [
    { category: "", file: "meadow.png", gx: 23, gy: 7, fixed: true },
  ] };
  game.run('tileDefs[0].category = ""; tileDefs[0].file = "meadow.png"; initializeCity(); saveGame.save()');
  assert.equal(game.run("initialCityLayout().length"), 1);
  assert.equal(game.run("board.cells.size"), 512);
  const saved = JSON.parse(game.storage.get("nordi-savegame-v1"));
  assert.deepEqual(saved.parcels, [[0, 1], [1, 1]]);
  assert.equal(saved.cells.length, 1);
  assert.equal(game.run("board.get(23, 7).locked"), true);
  assert.deepEqual(saved.buildings, []);
});

test("Editor nutzt dieselbe 1x2-Startflaeche und laedt das CSV-Startlayout", () => {
  const game = createViewGame({ editor: true });
  game.context.window.TILE_MANIFEST = { layout: [
    { category: "", file: "meadow.png", gx: 23, gy: 7, fixed: true },
  ] };
  game.run(`
    tileDefs[0].category = ""; tileDefs[0].file = "meadow.png";
    initializeCity();
    saveGame.save();
  `);
  assert.equal(game.run("initialCityLayout().length"), 1);
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.run("board.get(23, 7).locked"), true);
  assert.equal(game.storage.size, 0);
});

test("Gespeicherte grosse Stadt wird beim Start nicht verkleinert", () => {
  const game = createViewGame();
  game.run("board.unlockParcel(3, 1); saveGame.enable(); saveGame.save(); initializeCity(); saveGame.save()");
  assert.equal(game.run("board.land.parcels.size"), 10);
  assert.equal(game.run("board.cells.size"), 10 * 256);
  assert.equal(JSON.parse(game.storage.get("nordi-savegame-v1")).parcels.length, 10);
});

test("Kleine Stadt wird weiterhin schrittweise ueber Ja freigeschaltet", () => {
  const game = createViewGame({ small: true });
  game.run("saveGame.enable(); initLandExpansion()");
  assert.equal(game.elements.get("land-markers").children.length, 4);
  game.run("landExpansion.choose({ x: 2, y: 1 })");
  assert.equal(game.elements.get("land-panel").hidden, false);
  game.run("landExpansion.unlock(); landExpansion.choose({ x: 2, y: 0 })");
  assert.equal(game.run("board.land.parcels.size"), 3);
  assert.equal(game.elements.get("land-panel").hidden, false);
  game.run("landExpansion.unlock()");
  assert.equal(game.run("board.land.parcels.size"), 4);
  assert.equal(JSON.parse(game.storage.get("nordi-savegame-v1")).parcels.length, 4);
});

test("Stadt-Reset loescht Bebauung, kompletter Reset stellt CSV-Startlayout wieder her", () => {
  const game = createViewGame({ small: true });
  game.context.window.TILE_MANIFEST = { layout: [
    { category: "", file: "meadow.png", gx: 23, gy: 7, fixed: true },
  ] };
  game.run(`
    tileDefs[0].category = ""; tileDefs[0].file = "meadow.png";
    board.unlockParcel(2, 1);
    board.get(23, 7).locked = true;
    resetCity(false);
  `);
  assert.equal(game.run("board.get(23, 7).locked"), false);
  assert.equal(game.run("board.snapshot().cells.length"), 0);
  assert.equal(game.run("board.land.parcels.size"), 3);
  game.run("resetCity(true)");
  assert.equal(game.run("board.land.parcels.size"), 2);
  assert.equal(game.run("board.get(23, 7).locked"), true);
});

test("Tilegrenzen bleiben ungeclippt, ohne zusaetzliche Wiese oder graue Luft", () => {
  const game = createViewGame({ small: true });
  const images = [];
  const clips = [];
  const filters = [];
  let clipCount = 0;
  game.context.image = (...args) => images.push(args);
  game.context.testDrawContext = {
    save() {}, restore() {}, beginPath() {},
    rect: (...args) => clips.push(args),
    clip: () => { clipCount++; },
    fillRect() {},
    set filter(value) { filters.push(value); },
  };
  game.run("initLandExpansion(); landExpansion.revealed.add('1,0:0,1'); landExpansion.drawGround(testDrawContext, cameraBounds())");
  assert.ok(images.length > 0);
  assert.equal(images.length, 512);
  assert.equal(clipCount, 0);
  assert.equal(clips.length, 0);
  assert.equal(filters.length, 0);
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.run("board.snapshot().cells.length"), 0);
  assert.equal(game.run("board.history.length"), 0);
  assert.equal(game.storage.size, 0);
});

test("Erweiterungsbestaetigung enthaelt ausschliesslich Frage, Ja und zurueck", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const panel = html.match(/<section id="land-panel"[\s\S]*?<\/section>/)[0];
  const text = panel.replace(/<[^>]*>/g, " ").replace(/&uuml;/g, "\u00fc").replace(/\s+/g, " ").trim();
  assert.equal(text, "Stadtteil erweitern? Ja zur\u00fcck");
  assert.equal((panel.match(/<button /g) || []).length, 2);
  assert.equal(/land-progress|land-selection|Birbs|kostenlos/.test(panel), false);
  const css = fs.readFileSync(path.join(__dirname, "..", "spiel", "style.css"), "utf8");
  assert.match(css, /\.land-actions #land-cancel \{[^}]*font-size: 0\.75rem/);
});

test("Ohne bewusstes Aufdecken endet Scrollen exakt am freigeschalteten Land", () => {
  for (const [w, h] of [[800, 1000], [1000, 800], [390, 844], [844, 390]]) {
    const game = createViewGame({ small: true });
    Object.assign(game.stageRect, { width: w, height: h, bottom: h });
    Object.assign(game.dockRect, { top: h - 100, bottom: h, height: 100 });
    game.run("measureView()");
    for (const scale of [1, 1.25, 2]) {
      for (const [x, y] of [[-1e9, 512], [1e9, 512], [512, -1e9], [512, 1e9]]) {
        game.run(`cam.scale = ${scale}; cam.x = ${x}; cam.y = ${y}; clampCamera(cam)`);
        assert.equal(game.run(`(() => {
          const b = board.land.bounds();
          const area = CameraGeometry.area(view);
          const width = area.width / cam.scale;
          const height = area.height / cam.scale;
          const left = cam.x;
          const top = cam.y + view.insetTop / cam.scale;
          const epsilon = 1e-8;
          return left >= b.minX - epsilon && left + width <= b.maxX + epsilon &&
            top >= b.minY - epsilon && top + height <= b.maxY + epsilon;
        })()`), true, `${w}x${h}, scale ${scale}, direction ${x},${y}`);
        const stopped = game.run("JSON.stringify(cam)");
        game.run("clampCamera(cam)");
        assert.equal(game.run("JSON.stringify(cam)"), stopped);
      }
    }
  }
});

test("Weltgrenze waechst erst nach dem bestaetigten Freischalten", () => {
  const game = createViewGame({ small: true });
  game.run("initLandExpansion(); const previousBounds = JSON.stringify(cameraBounds()); landExpansion.choose({ x: 2, y: 1 })");
  assert.equal(game.run("JSON.stringify(cameraBounds()) === previousBounds"), true);
  game.run("landExpansion.close()");
  assert.equal(game.run("JSON.stringify(cameraBounds()) === previousBounds"), true);
  game.run("landExpansion.choose({ x: 2, y: 1 }); landExpansion.unlock()");
  assert.equal(game.run("cameraBounds().maxX"), 1280);
  assert.equal(game.run("cameraBounds().minX"), -256);
  assert.equal(game.run("board.land.bounds().maxX"), 1280);
});

test("Natuerliche Tilekanten schneiden weder Boden noch Gebaeude oder Overlays ab", () => {
  const game = createViewGame({ small: true });
  const draws = [];
  let clipDepth = 0;
  const depths = [];
  game.context.image = (image) => draws.push({ image, clipDepth });
  game.context.testDrawContext = {
    save: () => depths.push(clipDepth),
    restore: () => { clipDepth = depths.pop(); },
    beginPath() {}, rect() {},
    clip: () => { clipDepth++; },
    fillRect() {},
  };
  game.context.changedGround = { width: 64, height: 64 };
  game.context.overlay = { width: 64, height: 128 };
  game.context.houseImage = { width: 128, height: 256 };
  game.context.fullImage = { width: 64, height: 128 };
  game.run(`
    const tile = board.get(23, 7);
    tile.ground = changedGround;
    tile.overlay = overlay;
    const building = new Building(tile, 2, 2, houseImage);
    building.cells = [tile];
    initLandExpansion();
    landExpansion.revealed.add("1,0:0,1");
    landExpansion.drawGround(testDrawContext, cameraBounds());
    tile.show(true);
    building.show(true);
    const fullTile = new Tile(24, 7, fullImage);
    fullTile.groundType = "FULL";
    fullTile.show(true);
  `);
  assert.ok(draws.some((entry) => entry.image === game.context.changedGround && entry.clipDepth === 0));
  assert.equal(draws.filter((entry) => entry.image === game.context.changedGround).length, 1);
  assert.equal(draws.find((entry) => entry.image === game.context.overlay).clipDepth, 0);
  assert.equal(draws.find((entry) => entry.image === game.context.houseImage).clipDepth, 0);
  assert.equal(draws.find((entry) => entry.image === game.context.fullImage).clipDepth, 0);
  assert.equal(clipDepth, 0);
});

test("Tippen auf aufgedeckte Luft oeffnet Bestaetigung, ohne Bauzellen hinzuzufuegen", () => {
  const game = createViewGame({ small: true });
  game.run(`
    initLandExpansion();
    panBy(0, 1e6, true);
    const lockedPoint = { x: 512, y: 240 };
    const lockedGrid = screenToGrid(lockedPoint.x, lockedPoint.y);
    selectedPaletteIndex = 0;
    handleTap((lockedPoint.x - cam.x) * cam.scale, (lockedPoint.y - cam.y) * cam.scale, false);
  `);
  assert.equal(game.run("landExpansion.active"), true);
  assert.equal(game.run("landExpansion.selected.x"), 1);
  assert.equal(game.run("landExpansion.selected.y"), 0);
  assert.equal(game.run("board.get(lockedGrid.gx, lockedGrid.gy)"), undefined);
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.run("board.history.length"), 0);
  game.elements.get("land-cancel").fire("click");
  assert.equal(game.run("landExpansion.active"), false);
  assert.equal(game.run("board.cells.size"), 512);
});

test("Ein Klick jenseits der Vorschau gibt keine weitere leere Welt frei", () => {
  const game = createViewGame({ small: true });
  game.run("initLandExpansion()");
  assert.equal(game.run("landExpansion.chooseAt(512, -1000)"), false);
  game.run("handleTap((512 - cam.x) * cam.scale, (-1000 - cam.y) * cam.scale, false)");
  assert.equal(game.run("landExpansion.active"), false);
  assert.equal(game.run("board.land.parcels.size"), 2);
  assert.equal(game.run("board.cells.size"), 512);
});

test("Rand-Plus bleibt bei Rotation an derselben Weltposition und bewegt sich mit der Kamera", () => {
  const game = createViewGame({ small: true });
  game.context.testDrawContext = { save() {}, restore() {}, fillRect() {}, strokeRect() {} };
  game.run(`
    initLandExpansion();
    panBy(0, 1e6, true);
    landExpansion.draw(testDrawContext, cam, view, true);
    const marker = landExpansion.markerButtons.find((m) => m.parcel.x === 1 && m.parcel.y === 0);
  `);
  assert.equal(game.run("marker.button.hidden"), false);
  const worldX = game.run("marker.markerX");
  const worldY = game.run("marker.markerY");
  Object.assign(game.stageRect, { width: 1000, height: 800, bottom: 800 });
  Object.assign(game.dockRect, { top: 700, bottom: 800 });
  game.run("updateViewportLayout(); panBy(0, 1e6, true); landExpansion.draw(testDrawContext, cam, view, true)");
  assert.equal(game.run("marker.markerX"), worldX);
  assert.equal(game.run("marker.markerY"), worldY);
  assert.equal(game.run("marker.button.style.left === `${(marker.markerX - cam.x) * cam.scale}px`"), true);
  assert.equal(game.run("marker.button.style.top === `${(marker.markerY - cam.y) * cam.scale}px`"), true);
  assert.equal(game.run("marker.button.hidden"), false);
});

test("Randfreischaltung behaelt Zoom und erzeugt keine weitere graue Vorschau", () => {
  const game = createViewGame({ small: true });
  game.run(`
    initLandExpansion();
    const before = CameraGeometry.center(cam, view);
    const beforeScale = cam.scale;
    landExpansion.choose({ x: 1, y: 0 });
    landExpansion.unlock();
  `);
  assert.equal(game.run("cam.scale === beforeScale"), true);
  assert.equal(game.run("landExpansion.revealed.size"), 0);
  assert.equal(game.run("landExpansion.markerButtons.some((m) => m.parcel.x === 1 && m.parcel.y === 0)"), false);
  assert.equal(game.run("landExpansion.candidates.some((p) => p.x === 1 && p.y === -1)"), true);
  assert.equal(game.run("board.cells.size"), 768);
});

test("Erst Verschieben gegen eine erlaubte Grenze zeigt Plus mit eng begrenzter Luft am Tile-Rand", () => {
  for (const [w, h] of [[390, 844], [844, 390], [1920, 1080]]) {
    for (const [dx, dy] of [[1e6, 0], [-1e6, 0], [0, 1e6]]) {
      const game = createViewGame({ small: true });
      Object.assign(game.stageRect, { width: w, height: h, bottom: h });
      Object.assign(game.dockRect, { top: h - 100, bottom: h, height: 100 });
      game.context.testDrawContext = { save() {}, restore() {}, fillRect() {}, strokeRect() {} };
      game.run(`
        initLandExpansion();
        measureView();
        camTarget.scale = Math.max(2.5, view.minScale);
        CameraGeometry.moveCenter(camTarget, view, { x: 256, y: 512 });
        Object.assign(cam, camTarget);
        panBy(1, 1, true);
      `);
      assert.equal(game.run("landExpansion.revealed.size"), 0);
      game.run(`panBy(${dx}, ${dy}, true); landExpansion.draw(testDrawContext, cam, view, true)`);
      assert.ok(game.run("landExpansion.revealed.size") > 0);
      assert.ok(game.run("landExpansion.markerButtons.filter((m) => !m.button.hidden).length") > 0);
      assert.equal(game.run(`(() => {
        const b = board.land.bounds();
        const area = CameraGeometry.area(view);
        const left = cam.x;
        const top = cam.y + view.insetTop / cam.scale;
        const margin = Math.min(256, 64 + 64 / cam.scale) * cam.scale + 1e-6;
        return (b.minX - left) * cam.scale <= margin &&
          (left + area.width / cam.scale - b.maxX) * cam.scale <= margin &&
          (b.minY - top) * cam.scale <= margin &&
          top + area.height / cam.scale <= b.maxY + 1e-6;
      })()`), true);
      const stopped = game.run("JSON.stringify(camTarget)");
      game.run(`panBy(${dx}, ${dy}, true)`);
      assert.equal(game.run("JSON.stringify(camTarget)"), stopped);
      game.run("landExpansion.markerButtons.find((m) => !m.button.hidden).button.fire('click')");
      assert.equal(game.run("landExpansion.active"), true);
      assert.equal(game.run("board.land.parcels.size"), 2);
      game.run("landExpansion.close()");
    }
  }
});

test("Extremes Herauszoomen zeigt auch nach Randaufdeckung kein fremdes Land", () => {
  for (const [w, h] of [[390, 844], [844, 390], [1920, 1080]]) {
    const game = createViewGame({ small: true });
    Object.assign(game.stageRect, { width: w, height: h, bottom: h });
    Object.assign(game.dockRect, { top: h - 100, bottom: h, height: 100 });
    game.run("initLandExpansion(); updateViewportLayout(); panBy(0, 1e6, true); zoomAt(100, 100, 1e-9, true)");
    assert.equal(game.run("landExpansion.revealed.size"), 0);
    assert.equal(game.run("cam.scale"), game.run("view.minScale"));
    assert.equal(game.run(`(() => {
      const b = board.land.bounds();
      const area = CameraGeometry.area(view);
      const top = cam.y + view.insetTop / cam.scale;
      return cam.x >= b.minX - 1e-8 && cam.x + area.width / cam.scale <= b.maxX + 1e-8 &&
        top >= b.minY - 1e-8 && top + area.height / cam.scale <= b.maxY + 1e-8;
    })()`), true);
  }
});

test("Reset-Auswahl und Abbrechen aendern weder Stadt noch Spielstand und sperren Eingaben", () => {
  const game = createViewGame({ small: true });
  game.run("saveGame.enable(); initLandExpansion(); createModeSwitch(); bindResetChoice(); saveGame.save()");
  const before = game.storage.get("nordi-savegame-v1");
  const camera = game.run("JSON.stringify(cam)");
  game.elements.get("mode-meadow").fire("click");
  assert.equal(game.elements.get("reset-panel").hidden, false);
  assert.equal(game.elements.get("reset-city").focused, true);
  game.run("panBy(1000, 1000, true); zoomAt(100, 100, 4, true); handleTap(100, 100, false)");
  assert.equal(game.run("JSON.stringify(cam)"), camera);
  game.elements.get("reset-cancel").fire("click");
  assert.equal(game.elements.get("reset-panel").hidden, true);
  assert.equal(game.storage.get("nordi-savegame-v1"), before);
  game.elements.get("mode-meadow").fire("click");
  for (const listener of game.listeners.get("keydown")) listener({ key: "Escape" });
  assert.equal(game.elements.get("reset-panel").hidden, true);
  assert.equal(game.run("board.cells.size"), 512);
});

test("Nur gebaute Stadt loeschen behaelt Land und speichert leere Wiese sofort", () => {
  const game = createViewGame({ small: true });
  game.run(`
    saveGame.enable(); initLandExpansion(); createModeSwitch(); bindResetChoice();
    board.unlockParcel(2, 1);
    board.get(23, 7).locked = true;
    board.history.push(board.snapshot());
    saveGame.save();
  `);
  game.elements.get("mode-meadow").fire("click");
  game.elements.get("reset-city").fire("click");
  assert.equal(game.run("board.cells.size"), 768);
  assert.equal(game.run("board.snapshot().cells.length"), 0);
  assert.equal(game.run("board.history.length"), 0);
  const saved = JSON.parse(game.storage.get("nordi-savegame-v1"));
  assert.equal(saved.parcels.length, 3);
  assert.deepEqual(saved.cells, []);
  assert.deepEqual(saved.buildings, []);
  game.run("initializeCity()");
  assert.equal(game.run("board.land.parcels.size"), 3);
  assert.equal(game.run("board.snapshot().cells.length"), 0);
});

test("Gesamten Spielstand loeschen bleibt nach Autosave und Neuladen bei zwei Startgrundstuecken", async () => {
  const game = createViewGame();
  game.storage.set("anderes-spiel", "behalten");
  game.run(`
    saveGame.enable(); initLandExpansion(); createModeSwitch(); bindResetChoice();
    board.unlockParcel(3, 1);
    board.get(15, 15).locked = true;
    board.history.push(board.snapshot());
    saveGame.schedule();
  `);
  game.elements.get("mode-meadow").fire("click");
  game.elements.get("reset-all").fire("click");
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.run("board.history.length"), 0);
  assert.equal(game.run("board.snapshot().cells.length"), 0);
  await new Promise((resolve) => setTimeout(resolve, 450));
  const saved = JSON.parse(game.storage.get("nordi-savegame-v1"));
  assert.deepEqual(saved.parcels, [[0, 1], [1, 1]]);
  assert.deepEqual(saved.cells, []);
  assert.deepEqual(saved.buildings, []);
  assert.equal(game.storage.get("anderes-spiel"), "behalten");
  game.run("initializeCity()");
  assert.equal(game.run("board.land.parcels.size"), 2);
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.elements.get("reset-panel").hidden, true);
});

test("Reset-Auswahl haelt Tastaturfokus im Dialog und gibt ihn beim Abbrechen zurueck", () => {
  const game = createViewGame({ small: true });
  game.run("initLandExpansion(); createModeSwitch(); bindResetChoice()");
  game.elements.get("mode-meadow").fire("click");
  let prevented = 0;
  const tab = (shiftKey) => {
    for (const listener of game.listeners.get("keydown")) {
      listener({ key: "Tab", shiftKey, preventDefault() { prevented++; } });
    }
  };
  tab(true);
  assert.equal(game.context.document.activeElement, game.elements.get("reset-cancel"));
  tab(false);
  assert.equal(game.context.document.activeElement, game.elements.get("reset-city"));
  assert.equal(prevented, 2);
  game.elements.get("reset-cancel").fire("click");
  assert.equal(game.context.document.activeElement, game.elements.get("menu-toggle"));
});

test("Kompletter Editor-Reset erhaelt den Spielstand und stellt die 1x2-Startflaeche wieder her", () => {
  const game = createViewGame({ editor: true });
  game.storage.set("nordi-savegame-v1", "unangetastet");
  game.run(`
    saveGame.enable(); initLandExpansion(); createModeSwitch(); bindResetChoice();
    board.unlockParcel(3, 1);
  `);
  game.elements.get("mode-meadow").fire("click");
  game.elements.get("reset-all").fire("click");
  assert.equal(game.run("board.land.parcels.size"), 2);
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.storage.get("nordi-savegame-v1"), "unangetastet");
});

test("Strassen ersetzen Wiese einmalig in Bodentiefe, auch nach Undo und Neuladen", () => {
  const game = createViewGame({ small: true });
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "daten", "tile-catalog.json"), "utf8"));
  const road = catalog.tiles.find((tile) => tile.category === "10_Strassen" && tile.file === "Strasse_1.png");
  assert.equal(road.type, "UNDER");
  game.context.roadDef = road;
  game.context.roadImage = { width: 64, height: 64 };
  const draws = [];
  game.context.image = (image, x, y) => draws.push({ image, x, y });
  game.context.testDrawContext = {
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {},
  };
  game.run(`
    img.push(roadImage); tileDefs.push(roadDef);
    initLandExpansion(); saveGame.enable();
    const roadTile = board.get(23, 7);
    const frontTile = board.get(24, 7);
  `);
  const checkGround = (expectedImage) => {
    draws.length = 0;
    game.run("landExpansion.drawGround(testDrawContext, cameraBounds())");
    const x = game.run("roadTile.x");
    const y = game.run("roadTile.y");
    const sameCell = draws.filter((draw) => draw.x === x && draw.y === y);
    assert.equal(sameCell.length, 1, "Kein zusaetzliches Wiesenbild unter derselben Strasse");
    assert.equal(sameCell[0].image, expectedImage);
    const index = draws.indexOf(sameCell[0]);
    const front = draws.findIndex((draw) => draw.x === game.run("frontTile.x") && draw.y === game.run("frontTile.y"));
    assert.ok(front > index, "Vordere Wiese muss nach der Strasse zeichnen, nicht davor");
    const positions = draws.map((draw) => `${draw.x},${draw.y}`);
    assert.equal(new Set(positions).size, positions.length, "Auch an Grundstuecksgrenzen keine doppelten Boeden");
  };
  game.run("board.place(roadTile, roadImage, roadDef, img[0])");
  checkGround(game.context.roadImage);
  game.run("board.undo()");
  checkGround(game.run("img[0]"));
  game.run("board.place(roadTile, roadImage, roadDef, img[0]); saveGame.save(); saveGame.load()");
  game.run("landExpansion.refresh()");
  checkGround(game.context.roadImage);
});

test("Versetzte und innere Grundstueckskanten lassen sich nach Freischaltungen ebenfalls erweitern", () => {
  for (const [sourceX, sourceY, targetX, targetY, dx, dy] of [
    [2, 1, 2, 0, 0, 80],
    [1, 0, 2, 0, -80, 0],
    [1, 0, 0, 0, 80, 0],
  ]) {
    const game = createViewGame({ small: true });
    game.context.testDrawContext = { save() {}, restore() {}, fillRect() {}, strokeRect() {} };
    game.run(`
      saveGame.enable(); initLandExpansion();
      landExpansion.choose({ x: 2, y: 1 }); landExpansion.unlock();
      landExpansion.choose({ x: 1, y: 0 }); landExpansion.unlock();
      camTarget.scale = 2.5;
      const source = board.land.rect({ x: ${sourceX}, y: ${sourceY} });
      CameraGeometry.moveCenter(camTarget, view, { x: (source.minX + source.maxX) / 2, y: (source.minY + source.maxY) / 2 });
      clampCamera(camTarget); Object.assign(cam, camTarget);
    `);
    assert.equal(game.run("landExpansion.revealed.size"), 0);
    let visible = false;
    for (let i = 0; i < 12 && !visible; i++) {
      game.run(`panBy(${dx}, ${dy}, true); landExpansion.draw(testDrawContext, cam, view, true)`);
      visible = game.run(`landExpansion.markerButtons.some((m) =>
        m.parcel.x === ${targetX} && m.parcel.y === ${targetY} && !m.button.hidden)`);
    }
    assert.equal(visible, true, `Ziel ${targetX},${targetY} von ${sourceX},${sourceY} erreichbar`);
    game.run(`landExpansion.markerButtons.find((m) =>
      m.parcel.x === ${targetX} && m.parcel.y === ${targetY} && !m.button.hidden).button.fire("click")`);
    assert.equal(game.run("landExpansion.active"), true);
    game.elements.get("land-confirm").fire("click");
    assert.equal(game.run(`board.land.parcels.has("${targetX},${targetY}")`), true);
    assert.ok(JSON.parse(game.storage.get("nordi-savegame-v1")).parcels.some(([x, y]) => x === targetX && y === targetY));
  }
});

test("Das Thumbnail liegt nur auf der Intro-Kachel, nicht hinter dem transparenten Canvas", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "spiel", "style.css"), "utf8");
  const backdrop = css.match(/\.stage\s*\{([^}]+)\}/)[1];
  assert.match(backdrop, /background:\s*#0b1638/);
  assert.match(css, /#intro \.intro-home::before[\s\S]*?Thumbnail-small\.jpg/);
  assert.doesNotMatch(backdrop, /Thumbnail-small\.jpg/);
  const game = createViewGame({ small: true });
  const operations = [];
  for (const name of ["clear", "push", "pop", "scale", "translate", "image"]) {
    game.context[name] = () => operations.push(name);
  }
  game.context.background = () => assert.fail("Kein deckender Canvas-Hintergrund");
  game.context.drawingContext = {
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, strokeRect() {},
    moveTo() {}, lineTo() {}, stroke() {},
  };
  game.run("initLandExpansion(); gameDraw(); gameDraw()");
  assert.equal(operations.filter((name) => name === "clear").length, 2);
  assert.ok(operations.indexOf("clear") < operations.indexOf("image"));
});

test("Isometrisches Hintergrundraster folgt den Tilekanten ohne neue Bauzellen", () => {
  const game = createViewGame({ small: true });
  const lines = [];
  let start;
  game.context.testGridContext = {
    save() {}, restore() {}, beginPath() {}, stroke() {},
    moveTo(x, y) { start = { x, y }; },
    lineTo(x, y) { lines.push([start, { x, y }]); },
  };
  game.run("initLandExpansion()");
  for (const scale of [1, 2, 4]) {
    lines.length = 0;
    game.run(`landExpansion.drawGrid(testGridContext, { minX: -600, minY: -400, maxX: 1200, maxY: 1000 }, ${scale})`);
    assert.equal(game.context.testGridContext.lineWidth, 1 / scale);
    assert.ok(lines.length > 0 && lines.length < 160);
    for (const [a, b] of lines) {
      assert.equal(a.x, -600);
      assert.equal(b.x, 1200);
      assert.equal(Math.abs((b.y - a.y) / (b.x - a.x)), 0.5);
    }
    for (const [gx, gy] of [[0, 0], [23, 7], [-5, -2]]) {
      const vertices = game.run(`(() => {
        const p = gridToScreen(${gx}, ${gy});
        const x = p.x + CELL_CENTER_X, y = p.y + CELL_CENTER_Y;
        return [{x, y: y - CELL_H / 2}, {x: x + CELL_W / 2, y},
          {x, y: y + CELL_H / 2}, {x: x - CELL_W / 2, y}];
      })()`);
      for (let i = 0; i < vertices.length; i++) {
        const p = vertices[i], q = vertices[(i + 1) % vertices.length];
        assert.ok(lines.some(([a, b]) => {
          const slope = (b.y - a.y) / (b.x - a.x);
          return Math.abs(a.y + slope * (p.x - a.x) - p.y) < 1e-8 &&
            Math.abs(a.y + slope * (q.x - a.x) - q.y) < 1e-8;
        }), "Jede Tilekante liegt exakt auf einer Rasterlinie");
      }
    }
  }
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.run("board.history.length"), 0);
  assert.equal(game.run("board.land.canUnlock(1, 2)"), false);
  assert.equal(game.storage.size, 0);
});

test("Nach unten gibt es weder Plus noch Freischaltung, auch nicht durch direkte Aufrufe", () => {
  const game = createViewGame({ small: true });
  game.context.testDrawContext = {};
  game.run("initLandExpansion(); panBy(0, -1e6, true); landExpansion.draw(testDrawContext, cam, view, true)");
  assert.equal(game.run("landExpansion.revealed.size"), 0);
  assert.equal(game.run("landExpansion.markerButtons.some((m) => !m.button.hidden)"), false);
  assert.equal(game.run("landExpansion.markerButtons.some((m) => m.dy === -1)"), false);
  assert.equal(game.run("board.land.canUnlock(1, 2)"), false);
  assert.throws(() => game.run("board.unlockParcel(1, 2)"), /oberhalb oder seitlich/);
  game.run("landExpansion.choose({ x: 1, y: 2 })");
  assert.equal(game.run("landExpansion.active"), false);
  assert.equal(game.messages.length, 1);
  assert.equal(game.run("board.land.parcels.size"), 2);
});

test("Bisherige suedliche Freischaltungen bleiben ladbar, neue Erweiterungen nach unten sind gesperrt", () => {
  const game = createViewGame({ small: true });
  game.run(`
    buildBoard(board, img[0], new WorldLand([[0, 1], [1, 1], [1, 2]]));
    saveGame.enable(); saveGame.save(); initializeCity(); initLandExpansion();
  `);
  assert.equal(game.run("board.land.parcels.has('1,2')"), true);
  assert.equal(game.run("board.land.canUnlock(1, 3)"), false);
  assert.equal(game.run("board.land.canUnlock(0, 2)"), true);
  assert.equal(game.run("landExpansion.markerButtons.every((m) => m.dy !== -1)"), true);
});

test("Pluszeichen liegen mit kleinem Abstand ausserhalb der letzten Tile-Reihe, ohne Vorschauflaechen", () => {
  const game = createViewGame({ small: true });
  game.run("initLandExpansion(); landExpansion.setRevealScale(2)");
  assert.equal(game.run(`landExpansion.markerButtons.every((m) => {
    const r = board.land.rect(m.parcel);
    const distance = m.dx === 1 ? r.maxX - m.markerX :
      m.dx === -1 ? m.markerX - r.minX : r.maxY - m.markerY;
    const tileOverhang = CELL_W / 2;
    const gap = (distance - tileOverhang) * 2 - 22;
    return gap >= 0 && gap <= 10 && !board.land.contains(m.markerX, m.markerY);
  })`), true);
  game.run("landExpansion.choose({ x: 1, y: 0 }); landExpansion.draw({}, cam, view, true)");
  assert.equal(game.run("landExpansion.active"), true);
  game.run("landExpansion.unlock(); landExpansion.draw({}, cam, view, true)");
  assert.equal(game.run("board.cells.size"), 768);
});

function createPreUpdateGame() {
  const game = createViewGame();
  game.run("board.get(15, 15).locked = true; saveGame.enable(); saveGame.save()");
  const data = JSON.parse(game.storage.get("nordi-savegame-v1"));
  delete data.compatibility;
  game.storage.set("nordi-savegame-v1", JSON.stringify(data));
  game.original = game.storage.get("nordi-savegame-v1");
  game.run("initializeCity(); initLandExpansion(); bindUpdateNotice()");
  return game;
}

test("Inkompatibles Update sperrt Spiel und alle Speicherwege bis zur ausdruecklichen Bestaetigung", async () => {
  const game = createPreUpdateGame();
  assert.equal(game.run("saveGame.pendingReset"), true);
  assert.equal(game.run("saveGame.loaded"), true);
  assert.equal(game.run("saveGame.enabled"), false);
  assert.equal(game.run("board.cells.size"), 9 * 256);
  assert.equal(game.elements.get("update-panel").hidden, false);
  assert.equal(game.elements.get("sketch").inert, true);
  assert.equal(game.elements.get("left-palette").inert, true);
  const camera = game.run("JSON.stringify(cam)");
  game.run("handleTap(100, 100, false); resetCity(true); panBy(1000, 1000, true); zoomAt(100, 100, 4, true)");
  game.run("saveGame.enable(); saveGame.schedule(); saveGame.save()");
  for (const listener of game.listeners.get("pagehide")) listener();
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(game.run("JSON.stringify(cam)"), camera);
  assert.equal(game.run("board.cells.size"), 9 * 256);
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
  game.run("initializeCity()");
  assert.equal(game.run("saveGame.pendingReset"), true);
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
});

test("Updatebestaetigung speichert neues CSV-Startlayout und fragt nach Neuladen nicht erneut", () => {
  const game = createPreUpdateGame();
  game.storage.set("andere-daten", "behalten");
  game.context.window.TILE_MANIFEST = { layout: [
    { category: "", file: "meadow.png", gx: 23, gy: 7, fixed: true },
  ] };
  game.run('tileDefs[0].category = ""; tileDefs[0].file = "meadow.png"');
  game.elements.get("update-confirm").fire("click");
  const saved = JSON.parse(game.storage.get("nordi-savegame-v1"));
  assert.equal(saved.compatibility, game.run("SAVE_COMPATIBILITY_VERSION"));
  assert.deepEqual(saved.parcels, [[0, 1], [1, 1]]);
  assert.equal(saved.cells.length, 1);
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.run("board.get(23, 7).locked"), true);
  assert.equal(game.elements.get("update-panel").hidden, true);
  assert.equal(game.elements.get("sketch").inert, false);
  assert.equal(game.elements.get("left-palette").inert, false);
  assert.equal(game.run("saveGame.pendingReset"), false);
  assert.equal(game.run("saveGame.enabled"), true);
  assert.equal(game.storage.get("andere-daten"), "behalten");
  game.run("initializeCity(); bindUpdateNotice()");
  assert.equal(game.run("saveGame.pendingReset"), false);
  assert.equal(game.elements.get("update-panel").hidden, true);
});

test("Speicherfehler bei Updatebestaetigung behalten Original und alte sichtbare Stadt", () => {
  const game = createPreUpdateGame();
  game.context.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  game.elements.get("update-confirm").fire("click");
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
  assert.equal(game.run("board.cells.size"), 9 * 256);
  assert.equal(game.run("board.get(15, 15).locked"), true);
  assert.equal(game.run("saveGame.pendingReset"), true);
  assert.equal(game.run("saveGame.enabled"), false);
  assert.equal(game.elements.get("update-panel").hidden, false);
  assert.match(game.elements.get("update-status").textContent, /alter Stand bleibt erhalten/);
  assert.equal(game.messages.length, 1);
  game.context.localStorage.setItem = (key, value) => game.storage.set(key, value);
  game.elements.get("update-confirm").fire("click");
  assert.equal(game.run("saveGame.pendingReset"), false);
  assert.equal(game.run("board.cells.size"), 512);
});

test("Aktuelle Kompatibilitaetsversion, neue Spieler und Editor zeigen keine Updateaufforderung", () => {
  const fresh = createViewGame();
  fresh.run("initializeCity(); bindUpdateNotice(); saveGame.save()");
  assert.equal(fresh.run("saveGame.pendingReset"), false);
  assert.equal(fresh.elements.get("update-panel").hidden, true);
  fresh.run("initializeCity(); bindUpdateNotice()");
  assert.equal(fresh.elements.get("update-panel").hidden, true);
  const editor = createViewGame({ editor: true });
  editor.storage.set("nordi-savegame-v1", "alter-stand");
  editor.run("initializeCity(); bindUpdateNotice()");
  assert.equal(editor.storage.get("nordi-savegame-v1"), "alter-stand");
  assert.equal(editor.elements.get("update-panel").hidden, true);
});

test("Erhoehte Kompatibilitaetsanforderung sperrt auch strukturell gueltige v3-Spielstaende", () => {
  const game = createViewGame();
  game.run("saveGame.enable(); saveGame.save()");
  const saved = JSON.parse(game.storage.get("nordi-savegame-v1"));
  saved.compatibility = game.run("SAVE_COMPATIBILITY_VERSION - 1");
  game.storage.set("nordi-savegame-v1", JSON.stringify(saved));
  const original = game.storage.get("nordi-savegame-v1");
  game.run("initializeCity(); bindUpdateNotice(); saveGame.save()");
  assert.equal(game.run("saveGame.loaded"), true);
  assert.equal(game.run("saveGame.pendingReset"), true);
  assert.equal(game.storage.get("nordi-savegame-v1"), original);
});

test("Unlesbarer Altstand wird nicht ueberschrieben und meldet fehlenden Bildexport", () => {
  const game = createViewGame();
  game.storage.set("nordi-savegame-v1", "{kaputt");
  game.run("initializeCity(); initLandExpansion(); bindUpdateNotice(); saveGame.save()");
  assert.equal(game.storage.get("nordi-savegame-v1"), "{kaputt");
  assert.equal(game.elements.get("update-image").disabled, true);
  assert.match(game.elements.get("update-status").textContent, /nicht dargestellt/);
  game.elements.get("update-confirm").fire("click");
  assert.equal(game.run("saveGame.pendingReset"), false);
  assert.equal(game.run("board.cells.size"), 512);
});

test("Stadtbild exportiert ganze Altstadt ohne UI, inklusive hoher Overlays und mit begrenzter Bildgroesse", async () => {
  const game = createPreUpdateGame();
  const draws = [];
  const context = {
    fillRect() {}, scale() {}, translate() {},
    drawImage: (...args) => draws.push(args),
  };
  const canvas = {
    getContext: () => context,
    toBlob: (callback, mime) => callback(new Blob(["bild"], { type: mime })),
  };
  game.context.document.createElement = () => canvas;
  game.run(`
    img[0].canvas = { name: "meadow" };
    const highOverlay = { width: 64, height: 2048, canvas: { name: "tower" } };
    board.get(15, 15).overlay = highOverlay;
  `);
  const blob = await game.run("createCityImage(board)");
  assert.equal(blob.type, "image/png");
  assert.equal(draws.length, 9 * 256 + 1);
  assert.equal(context.fillStyle, "#0b1638");
  assert.equal(context.imageSmoothingEnabled, false);
  assert.ok(canvas.width > game.stageRect.width);
  assert.ok(canvas.height > game.stageRect.height);
  assert.ok(canvas.width <= 4096 && canvas.height <= 4096);
  assert.equal(draws.filter((draw) => draw[0].name === "tower").length, 1);
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
  game.run("for (let x = 3; x < 12; x++) board.unlockParcel(x, 1)");
  await game.run("createCityImage(board)");
  assert.equal(canvas.width, 4096);
  assert.ok(canvas.height <= 4096);
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
});

test("Bildexportfehler loescht nichts, sperrt Reset waehrend Export und erlaubt erneuten Versuch", async () => {
  const game = createPreUpdateGame();
  let finish;
  const context = { fillRect() {}, scale() {}, translate() {}, drawImage() {} };
  const canvas = { getContext: () => context, toBlob: (callback) => { finish = callback; } };
  const link = { click() { this.clicked = true; } };
  game.context.document.createElement = (tag) => tag === "canvas" ? canvas : link;
  game.context.URL = { createObjectURL: () => "blob:city", revokeObjectURL() {} };
  game.context.setTimeout = (callback) => callback();
  game.run("img[0].canvas = {}");
  const pending = game.elements.get("update-image").fire("click");
  assert.equal(game.elements.get("update-confirm").disabled, true);
  assert.equal(game.elements.get("update-image").disabled, true);
  finish(null);
  await pending;
  assert.match(game.elements.get("update-status").textContent, /nicht gespeichert/);
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
  assert.equal(game.elements.get("update-image").disabled, false);
  assert.equal(game.run("saveGame.pendingReset"), true);
  const retry = game.elements.get("update-image").fire("click");
  finish(new Blob(["bild"], { type: "image/png" }));
  await retry;
  assert.equal(link.clicked, true);
  assert.match(link.download, /^nordstadt-vor-update-\d{4}-\d{2}-\d{2}\.png$/);
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
  assert.equal(game.run("saveGame.pendingReset"), true);
});

test("Alle bisherigen Speicherformate verlangen denselben geschuetzten Update-Neustart", () => {
  for (const version of [1, 2, 3]) {
    const game = createViewGame();
    const data = {
      v: version, cells: [["15,15", "meadow", "UNDER", null, true]], buildings: [],
    };
    if (version === 3) data.parcels = game.run("board.land.snapshot()");
    const original = JSON.stringify(data);
    game.storage.set("nordi-savegame-v1", original);
    game.run("initializeCity(); initLandExpansion(); bindUpdateNotice(); saveGame.enable(); saveGame.save()");
    assert.equal(game.run("saveGame.loaded"), true);
    assert.equal(game.run("board.get(15, 15).locked"), true);
    assert.equal(game.run("saveGame.pendingReset"), true);
    assert.equal(game.storage.get("nordi-savegame-v1"), original);
    game.elements.get("update-confirm").fire("click");
    assert.equal(game.run("board.cells.size"), 512);
    assert.equal(JSON.parse(game.storage.get("nordi-savegame-v1")).compatibility, game.run("SAVE_COMPATIBILITY_VERSION"));
  }
});

test("Update-Dialog haelt Fokus und Escape bestaetigt oder schliesst ihn nicht", () => {
  const game = createPreUpdateGame();
  const panel = game.elements.get("update-panel");
  assert.equal(game.context.document.activeElement, game.elements.get("update-image"));
  let prevented = false;
  panel.fire("keydown", { key: "Tab", shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(game.context.document.activeElement, game.elements.get("update-confirm"));
  panel.fire("keydown", { key: "Escape" });
  assert.equal(panel.hidden, false);
  assert.equal(game.storage.get("nordi-savegame-v1"), game.original);
});

test("Fehlende Alt-Tiles werden vor unvollstaendigem Stadtbild sichtbar gemeldet", () => {
  const game = createViewGame();
  const old = JSON.stringify({
    v: 1, cells: [["15,15", "meadow", "UNDER", "fehlt", false]], buildings: [],
  });
  game.storage.set("nordi-savegame-v1", old);
  game.run("initializeCity(); initLandExpansion(); bindUpdateNotice(); saveGame.save()");
  assert.equal(game.run("saveGame.missingTiles"), 1);
  assert.match(game.elements.get("update-status").textContent, /unvollst/);
  assert.equal(game.storage.get("nordi-savegame-v1"), old);
});

test("Spiel zeichnet Boden, FULL und OVER gemeinsam nach Tiefe statt alle Objekte ueber die Wiese", () => {
  for (const type of ["UNDER", "FULL", "OVER"]) {
    const game = createViewGame({ small: true });
    const draws = [];
    game.context.objectImage = { width: 64, height: 128 };
    game.context.image = (image, x, y) => draws.push({ image, x, y });
    for (const name of ["clear", "push", "pop", "scale", "translate"]) game.context[name] = () => {};
    game.context.drawingContext = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    game.run(`
      const objectTile = board.get(23, 7);
      const frontTile = board.get(24, 7);
      board.place(objectTile, objectImage, { type: "${type}", w: 1, h: 1 }, img[0]);
      initLandExpansion(); gameDraw();
    `);
    const objectIndex = draws.findIndex((draw) => draw.image === game.context.objectImage);
    const frontIndex = draws.findIndex((draw) => draw.x === game.run("frontTile.x") && draw.y === game.run("frontTile.y"));
    assert.ok(objectIndex >= 0);
    assert.ok(frontIndex > objectIndex, `${type}: Vordere Nachbarwiese zeichnet nach dem Objekt`);
    assert.equal(draws.filter((draw) => draw.image === game.context.objectImage).length, 1);
  }
});

test("Hohe FULL- und OVER-Tiles bleiben sichtbar, wenn nur ihre Spitze im Ausschnitt liegt", () => {
  for (const type of ["FULL", "OVER"]) {
    const game = createViewGame({ small: true });
    game.context.tallImage = { width: 64, height: 256 };
    game.run(`
      const tallTile = board.get(23, 7);
      board.place(tallTile, tallImage, { type: "${type}", w: 1, h: 1 }, img[0]);
      const tipView = { minX: tallTile.x, maxX: tallTile.x + 64,
        minY: tallTile.y - 180, maxY: tallTile.y - 100 };
    `);
    assert.equal(game.run("board.drawOrder(null, tipView).includes(tallTile)"), true);
    assert.equal(game.run("renderBounds(tallTile).minY"), game.run("tallTile.y - 192"));
    assert.equal(game.run("renderBounds(tallTile).maxY"), game.run("tallTile.y + 64"));
  }
});
