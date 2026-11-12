const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function createGame(editor = false) {
  const storage = new Map();
  const warnings = [];
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search: editor ? "?editor" : "" }, innerWidth: 1200 },
    console: { warn: (...args) => warnings.push(args) },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    setTimeout,
    clearTimeout,
  });
  for (const file of ["spiel/daten/csv.js", "spiel/daten/catalog.js", "spiel/daten/start-layout.js", "spiel/welt/land.js", "spiel/welt/camera.js", "spiel/welt/grid.js", "spiel/welt/tile.js", "spiel/welt/walk.js", "spiel/welt/over-rules.js", "spiel/speichern/save-game.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  vm.runInContext(`
    const BASE_CANVAS_SIZE = 1024;
    const meadow = { width: 64, height: 64 };
    const ground = { width: 64, height: 64 };
    const front = { width: 64, height: 64 };
    const back = { width: 64, height: 64 };
    const house = { width: 128, height: 128 };
    const img = [meadow, ground, front, back, house];
    const tileDefs = [
      { category: "", file: "meadow.png", type: "UNDER", w: 1, h: 1 },
      { category: "Boden", file: "ground.png", type: "UNDER", w: 1, h: 1 },
      { category: "Deko", file: "front.png", type: "OVER", w: 1, h: 1 },
      { category: "Deko", file: "back.png", type: "OVER", w: 1, h: 1 },
      { category: "Haus", file: "house.png", type: "FULL", w: 2, h: 2 }
    ];
    overRules.allowed = parseOverRules(
      "Kategorie,Dateiname,Over-Kategorie,Over-Dateiname\\nBoden,ground.png,Deko,front.png\\nBoden,ground.png,Deko,back.png",
      tileDefs
    );
    overRules.half = parseHalfOverRules(
      "Kategorie,Dateiname,Position\\nDeko,front.png,vorn\\nDeko,back.png,hinten",
      tileDefs
    );
    let changes = 0;
    const board = new Board(() => changes++);
    buildBoard(board, meadow, new WorldLand(WorldLand.legacyParcels()));
    const save = new SaveGame({
      board, getCatalog: () => ({ definitions: tileDefs, images: img, meadowIndex: 0 }),
      editorMode: EDITOR_MODE
    });
  `, context);
  return { context, storage, warnings, run: (code) => vm.runInContext(code, context) };
}

test("Katalog behaelt Reihenfolge, Kategorien und URL-Kodierung", () => {
  const { run } = createGame();
  const result = run(`buildTileDefs({
    root: "tiles sortiert",
    meadow: { file: "Wiese.png" },
    categories: [{ name: "Häuser", icon: null, tiles: [{ file: "Haus 1.png" }] }]
  })`);
  assert.equal(result.tileDefs[0].url, "tiles%20sortiert/Wiese.png");
  assert.equal(result.tileDefs[1].url, "tiles%20sortiert/H%C3%A4user/Haus%201.png");
  assert.equal(result.tileCategories[0].indices[0], 1);
  assert.equal(result.tileCategories[0].iconUrl, result.tileDefs[1].url);
});

test("Bildpfad, UI-Ordner und separates Ordner-Icon sind entkoppelt", () => {
  const { run } = createGame();
  const result = run(`buildTileDefs({
    root: "Katalog",
    meadow: { file: "Wiese.png", assetPath: "Wiese.png" },
    categories: [{ name: "Natur", icon: "Icons/Natur.png", tiles: [{ file: "Baum.png", assetPath: "Neue Bilder/Baum.png" }] }]
  })`);
  assert.equal(result.tileDefs[1].category, "Natur");
  assert.equal(result.tileDefs[1].url, "Katalog/Neue%20Bilder/Baum.png");
  assert.equal(result.tileCategories[0].iconUrl, "Katalog/Icons/Natur.png");
});

test("Platzierung, zwei Overlays, Undo, Gebaeude und feste Felder", () => {
  const { run } = createGame();
  run(`
    const cell = board.get(15, 15);
    board.place(cell, ground, tileDefs[1], meadow);
    board.place(cell, front, tileDefs[2], meadow);
    board.place(cell, back, tileDefs[3], meadow);
  `);
  assert.equal(run("cell.overlay"), run("front"));
  assert.equal(run("cell.overlayBack"), run("back"));
  assert.equal(run("board.undo()"), true);
  assert.equal(run("cell.overlay"), run("front"));
  assert.equal(run("cell.overlayBack"), null);
  assert.equal(run("board.place(board.get(20, 20), house, tileDefs[4], meadow)"), true);
  assert.equal(run("board.buildings.size"), 1);
  assert.equal(run("board.get(19, 19).owner === board.get(20, 20).owner"), true);
  assert.equal(run("board.undo()"), true);
  assert.equal(run("board.buildings.size"), 0);
  run("cell.locked = true");
  assert.equal(run("board.erase(cell, meadow)"), false);
  assert.ok(run("changes") > 1);
});

test("Nicht erlaubte Overlays veraendern das Spielfeld und den Verlauf nicht", () => {
  const { run } = createGame();
  run(`
    const cell = board.get(15, 15);
    board.place(cell, ground, tileDefs[1], meadow);
    overRules.allowed.get("boden/ground.png").delete("deko/front.png");
    const previousHistory = board.history.length;
  `);
  assert.equal(run("board.place(cell, front, tileDefs[2], meadow)"), "over-not-allowed");
  assert.equal(run("cell.overlay"), null);
  assert.equal(run("board.history.length"), run("previousHistory"));
});

test("Tile-spezifische OVER-Ausnahmen erlauben Ergänzungen und Ausschlüsse", () => {
  const game = createGame();
  game.context.TileCatalogModel = require("../gemeinsam/tile-catalog-model.js");
  const { run } = game;
  const result = run(`
    tileDefs.forEach((def) => { def.rules = { half: null, allowed: null, walk: null }; });
    tileDefs[1].id = "ground-id";
    tileDefs[2].id = "front-id";
    tileDefs[3].id = "back-id";
    const shared = { id: "shared", rules: { half: null, allowed: [tileDefs[2].id], walk: null } };
    tileDefs[1].profile = shared.id;
    tileDefs[1].overrides = { allowed: { add: [tileDefs[3].id], remove: [tileDefs[2].id] } };
    installCatalogRules(tileDefs, [shared]);
    [isOverAllowed(ground, front), isOverAllowed(ground, back)]
  `);
  assert.deepEqual(Array.from(result), [false, true]);
});

test("Startlayout wird angewendet und als CSV mit Overlays und Gebaeuden exportiert", async () => {
  const game = createGame();
  let exported;
  let clicked = false;
  const link = { click: () => { clicked = true; } };
  game.context.Blob = Blob;
  game.context.URL = { createObjectURL: (blob) => { exported = blob; return "blob:test"; }, revokeObjectURL: () => {} };
  game.context.document = { createElement: () => link };
  game.context.setTimeout = (callback) => { callback(); };
  game.run(`
    applyStartLayout([
      { category: "Boden", file: "ground.png", gx: 15, gy: 15, fixed: true },
      { category: "Deko", file: "front.png", gx: 15, gy: 15, fixed: true },
      { category: "Haus", file: "house.png", gx: 20, gy: 20, fixed: false },
      { category: "Fehlt", file: "missing.png", gx: 16, gy: 16, fixed: false }
    ], board, tileDefs, img, 0);
    tileDefs[1].file = 'ground,"test".png';
    exportLayout(board, tileDefs, img, 0);
  `);
  assert.equal(game.run("board.get(15, 15).overlay"), game.run("front"));
  assert.equal(game.run("board.get(15, 15).locked"), true);
  assert.equal(game.run("board.buildings.size"), 1);
  assert.equal(game.run("board.history.length"), 0);
  assert.equal(game.warnings.length, 1);
  assert.equal(clicked, true);
  assert.equal(link.download, "start-layout.csv");
  const text = await exported.text();
  assert.match(text, /^Kategorie,Dateiname,gx,gy,Fix\r\n/);
  assert.match(text, /Boden,"ground,""test""\.png",15,15,FIX\r\n/);
  assert.match(text, /Deko,front\.png,15,15,FIX\r\n/);
  assert.match(text, /Haus,house\.png,20,20,FREI\r\n/);
});

test("1x2-Startlayout laesst sich als CSV exportieren und mit Boden, Overlay und Gebaeude importieren", async () => {
  const game = createGame(true);
  let exported;
  game.context.Blob = Blob;
  game.context.URL = { createObjectURL: (blob) => { exported = blob; return "blob:test"; }, revokeObjectURL() {} };
  game.context.document = { createElement: () => ({ click() {} }) };
  game.context.setTimeout = (callback) => callback();
  game.run(`
    buildBoard(board, meadow);
    board.place(board.get(23, 7), ground, tileDefs[1], meadow);
    board.place(board.get(23, 7), front, tileDefs[2], meadow);
    board.get(23, 7).locked = true;
    board.place(board.get(26, 7), house, tileDefs[4], meadow);
    exportLayout(board, tileDefs, img, 0);
  `);
  game.context.exportedCsv = await exported.text();
  game.run(`
    const layout = parseCsvTable(exportedCsv).map((row) => ({
      category: row.kategorie, file: row.dateiname,
      gx: Number(row.gx), gy: Number(row.gy), fixed: row.fix === "FIX",
    }));
    buildBoard(board, meadow);
    applyStartLayout(layout, board, tileDefs, img, 0);
  `);
  assert.equal(game.run("board.cells.size"), 512);
  assert.equal(game.run("board.get(23, 7).ground === ground"), true);
  assert.equal(game.run("board.get(23, 7).overlay === front"), true);
  assert.equal(game.run("board.get(23, 7).locked"), true);
  assert.equal(game.run("board.buildings.size"), 1);
  assert.deepEqual(game.warnings, []);
});

test("Tutorial-Reset stellt das komplette Startlayout wieder her und speichert es", () => {
  for (const editorMode of [false, true]) {
    const game = createGame(editorMode);
    game.run(`
      const layout = [
        { category: "Boden", file: "ground.png", gx: 15, gy: 15, fixed: true },
        { category: "Deko", file: "front.png", gx: 15, gy: 15, fixed: true },
        { category: "Haus", file: "house.png", gx: 20, gy: 20, fixed: false }
      ];
      applyStartLayout(layout, board, tileDefs, img, 0);
      board.place(board.get(25, 25), ground, tileDefs[1], meadow);
      board.clearAll(meadow);
      resetToStartLayout(layout, board, tileDefs, img, 0);
    `);
    assert.equal(game.run("board.get(15, 15).ground"), game.run("ground"));
    assert.equal(game.run("board.get(15, 15).overlay"), game.run("front"));
    assert.equal(game.run("board.get(15, 15).locked"), true);
    assert.equal(game.run("board.get(20, 20).owner.image"), game.run("house"));
    assert.equal(game.run("board.get(25, 25).ground"), game.run("meadow"));
    assert.equal(game.run("board.buildings.size"), 1);
    assert.equal(game.run("board.history.length"), 0);
    game.run("save.enable(); save.save(); board.clearAll(meadow); save.load()");
    if (!editorMode) {
      assert.equal(game.run("board.get(15, 15).overlay"), game.run("front"));
      assert.equal(game.run("board.get(20, 20).owner.image"), game.run("house"));
    } else {
      assert.equal(game.storage.has("nordi-savegame-v1"), false);
    }
  }
});

test("v3-Spielstand speichert und laedt Overlays und mehrzellige Gebaeude", () => {
  const { run, storage } = createGame();
  run(`
    const cell = board.get(15, 15);
    board.place(cell, ground, tileDefs[1], meadow);
    board.place(cell, back, tileDefs[3], meadow);
    board.place(cell, front, tileDefs[2], meadow);
    board.place(board.get(20, 20), house, tileDefs[4], meadow);
    save.enable();
    save.save();
  `);
  const saved = JSON.parse(storage.get("nordi-savegame-v1"));
  assert.equal(saved.v, 3);
  assert.equal(saved.parcels.length, 9);
  assert.deepEqual(saved.cells.find((cell) => cell[0] === "15,15"), [
    "15,15", "Boden/ground.png", "UNDER", "Deko/front.png", false, "Deko/back.png",
  ]);
  assert.deepEqual(saved.buildings[0], [19, 19, 2, 2, "Haus/house.png", false]);
  run("board.clearAll(meadow); save.load()");
  assert.equal(run("board.get(15, 15).overlay"), run("front"));
  assert.equal(run("board.get(15, 15).overlayBack"), run("back"));
  assert.equal(run("board.get(20, 20).owner.image"), run("house"));
  assert.equal(run("board.history.length"), 0);
});

test("Aeltere v1-Spielstaende ohne hinteres Overlay und unbekannte Tiles", () => {
  const { run, storage } = createGame();
  storage.set("nordi-savegame-v1", JSON.stringify({
    v: 1,
    cells: [
      ["15,15", "Boden/ground.png", "UNDER", "Deko/front.png", true],
      ["16,16", "unbekannt.png", "FULL", null, false],
    ],
    buildings: [[19, 19, 2, 2, "unbekannt.png", false]],
  }));
  run("save.load()");
  assert.equal(run("board.get(15, 15).overlay"), run("front"));
  assert.equal(run("board.get(15, 15).overlayBack"), null);
  assert.equal(run("board.get(15, 15).locked"), true);
  assert.equal(run("board.get(16, 16).ground"), run("meadow"));
  assert.equal(run("board.buildings.size"), 0);
});

test("Fehlende Tiles alter Spielstaende melden, aber Original vor Updatebestaetigung nicht ueberschreiben", () => {
  const game = createGame();
  const issues = [];
  game.context.showCatalogWarnings = (messages) => issues.push(...messages);
  game.storage.set("nordi-savegame-v1", JSON.stringify({
    v: 1,
    cells: [["15,15", "Boden/ground.png", "UNDER", "Deko/fehlt.png", false]],
    buildings: [],
  }));
  const original = game.storage.get("nordi-savegame-v1");
  game.run("save.load(); save.enable(); save.save()");
  assert.match(issues[0], /Deko\/fehlt\.png/);
  assert.equal(game.run("board.get(15, 15).overlay"), null);
  assert.equal(game.storage.get("nordi-savegame-v1"), original);
  assert.equal(game.run("save.pendingReset"), true);
});

test("Editor greift nicht auf Spielstaende zu und Ladefehler werden gemeldet", () => {
  const editor = createGame(true);
  editor.storage.set("nordi-savegame-v1", "invalid");
  editor.run("save.enable(); save.load(); save.save()");
  assert.equal(editor.storage.get("nordi-savegame-v1"), "invalid");
  assert.equal(editor.warnings.length, 0);

  const game = createGame();
  game.storage.set("nordi-savegame-v1", "invalid");
  game.run("save.load()");
  assert.equal(game.warnings.length, 1);
  assert.match(game.warnings[0][0], /Laden fehlgeschlagen/);
});

test("Autosave wird erst nach der Freigabe und verzoegert ausgefuehrt", async () => {
  const { run, storage } = createGame();
  run("save.schedule()");
  assert.equal(storage.has("nordi-savegame-v1"), false);
  run(`
    save.enable();
    board.onChange = () => save.schedule();
    board.place(board.get(15, 15), ground, tileDefs[1], meadow);
  `);
  assert.equal(storage.has("nordi-savegame-v1"), false);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(JSON.parse(storage.get("nordi-savegame-v1")).cells[0][1], "Boden/ground.png");
});

test("Alte Spielstaende werden anhand alter IDs geladen und mit stabilen IDs gespeichert", () => {
  const { run, storage } = createGame();
  run(`tileDefs.forEach((def, i) => { def.id = "stable-" + i; def.legacyIds = [def.category + "/" + def.file]; })`);
  storage.set("nordi-savegame-v1", JSON.stringify({
    v: 3, compatibility: run("SAVE_COMPATIBILITY_VERSION"), parcels: run("board.land.snapshot()"),
    cells: [["15,15", "Boden/ground.png", "UNDER", "Deko/front.png", false]], buildings: [],
  }));
  run("save.load(); save.enable(); save.save()");
  const result = JSON.parse(storage.get("nordi-savegame-v1"));
  assert.equal(result.v, 3);
  assert.equal(result.cells[0][1], "stable-1");
  assert.equal(result.cells[0][3], "stable-2");
});

test("Welt und Baugrenzen sind unabhaengig von Bildschirm und Ausrichtung", () => {
  const { run } = createGame();
  const original = run("JSON.stringify([...board.cells.keys()])");
  assert.equal(run("board.cells.size"), 9 * 256);
  for (const width of [390, 844, 900, 1920]) {
    run(`window.innerWidth = ${width}; buildBoard(board, meadow, new WorldLand(WorldLand.legacyParcels()))`);
    assert.equal(run("JSON.stringify([...board.cells.keys()])"), original);
    assert.equal(run("board.place(board.get(20, 20), house, tileDefs[4], meadow)"), true);
  }
  assert.equal(run("[...board.cells.values()].every((cell) => board.land.contains(cell.x + CELL_CENTER_X, cell.y + CELL_CENTER_Y))"), true);
});

test("Nur angrenzende Grundstuecke werden additiv und ohne doppelte Zellen freigeschaltet", () => {
  const { run } = createGame();
  run("const previousCell = board.get(15, 15); const originalKeys = [...board.cells.keys()]");
  assert.equal(run("board.land.frontier().length"), 9);
  assert.equal(run("board.land.canUnlock(3, 1)"), true);
  assert.equal(run("board.land.canUnlock(3, 3)"), false);
  assert.throws(() => run("board.unlockParcel(5, 5)"), /angrenzende/);
  assert.throws(() => run("board.unlockParcel(1.5, 1)"), /angrenzende/);
  run("board.unlockParcel(3, 1)");
  assert.equal(run("board.cells.size"), 10 * 256);
  assert.equal(run("board.get(15, 15) === previousCell"), true);
  assert.equal(run("originalKeys.every((key) => board.cells.has(key))"), true);
  assert.equal(run("board.land.frontier().some((p) => p.x === 3 && p.y === 1)"), false);
  assert.throws(() => run("board.unlockParcel(3, 1)"), /angrenzende/);
  run("board.unlockParcel(-1, 0); board.unlockParcel(-1, -1)");
  assert.equal(run("board.cells.size"), 12 * 256);
  assert.equal(run("[...board.cells.values()].every((c) => board.land.contains(c.x + CELL_CENTER_X, c.y + CELL_CENTER_Y))"), true);
});

test("Gebaeude duerfen eine Grundstuecksgrenze erst nach Freischaltung ueberqueren", () => {
  const { run } = createGame();
  run(`
    const edge = [...board.cells.values()].find((c) =>
      c.x + CELL_CENTER_X === 1248 && c.y + CELL_CENTER_Y > 300 && c.y + CELL_CENTER_Y < 700);
  `);
  assert.equal(run("board.place(edge, house, tileDefs[4], meadow)"), "space");
  assert.equal(run("board.buildings.size"), 0);
  assert.equal(run('planWalkStep(edge.gx, edge.gy, WALK_DIRS["down-right"], 0)'), null);
  run("board.unlockParcel(3, 1)");
  assert.equal(run('planWalkStep(edge.gx, edge.gy, WALK_DIRS["down-right"], 0) !== null'), true);
  assert.equal(run("board.place(edge, house, tileDefs[4], meadow)"), true);
  assert.equal(run("board.buildings.size"), 1);
});

test("Bau-Undo und beide Resets behalten Freischaltungen, auch nach alten Undo-Snapshots", () => {
  const { run } = createGame();
  run(`
    board.place(board.get(15, 15), ground, tileDefs[1], meadow);
    const oldSnapshot = board.history[0];
    board.unlockParcel(3, 1);
    const newCell = [...board.cells.values()].find((c) => c.x + CELL_CENTER_X >= 1280);
    board.place(newCell, ground, tileDefs[1], meadow);
    board.undo();
  `);
  assert.equal(run("newCell.ground === meadow"), true);
  assert.equal(run("board.get(15, 15).ground === ground"), true);
  assert.equal(run("board.undo()"), true);
  assert.equal(run("board.get(15, 15).ground === meadow"), true);
  assert.equal(run("board.land.parcels.size"), 10);
  assert.equal(run("oldSnapshot.cells.length"), 0);
  run("board.place(newCell, ground, tileDefs[1], meadow); board.clearAll(meadow); board.undo()");
  assert.equal(run("newCell.ground === ground"), true);
  run("resetToStartLayout([], board, tileDefs, img, 0)");
  assert.equal(run("newCell.ground === meadow"), true);
  assert.equal(run("board.land.parcels.size"), 10);
  assert.equal(run("board.cells.size"), 10 * 256);
});

test("Leere und bebaute Erweiterungen werden beim Neuladen wiederhergestellt", () => {
  const { run, storage } = createGame();
  run(`
    board.unlockParcel(3, 1);
    board.unlockParcel(4, 1);
    const expandedCell = [...board.cells.values()].find((c) => c.x + CELL_CENTER_X > 1300);
    const expandedKey = expandedCell.key;
    board.place(expandedCell, ground, tileDefs[1], meadow);
    const expandedHouseCell = [...board.cells.values()].find((c) =>
      c.x + CELL_CENTER_X >= 1450 && c.y + CELL_CENTER_Y > 400 && c.y + CELL_CENTER_Y < 600);
    const expandedHouseKey = expandedHouseCell.key;
    board.place(expandedHouseCell, house, tileDefs[4], meadow);
    save.enable(); save.save();
  `);
  const saved = JSON.parse(storage.get("nordi-savegame-v1"));
  assert.equal(saved.v, 3);
  assert.equal(saved.parcels.length, 11);
  assert.equal(saved.cells.length, 1);
  assert.equal(saved.buildings.length, 1);
  run("buildBoard(board, meadow); save.load()");
  assert.equal(run("board.land.parcels.size"), 11);
  assert.equal(run("board.cells.size"), 11 * 256);
  assert.equal(run("board.cells.get(expandedKey).ground === ground"), true);
  assert.equal(run("board.cells.get(expandedHouseKey).owner.image === house"), true);
  assert.equal(run("board.land.contains(2000, 512)"), true);
  assert.equal(run("board.history.length"), 0);
});

test("Mehrfache Erweiterung hat keine feste Weltrand-Grenze", () => {
  const { run } = createGame();
  run("for (let x = 3; x < 35; x++) board.unlockParcel(x, 1)");
  assert.equal(run("board.land.parcels.size"), 41);
  assert.equal(run("board.cells.size"), 41 * 256);
  assert.equal(run("board.land.bounds().maxX"), -256 + 35 * 512);
  assert.equal(run("board.land.canUnlock(35, 1)"), true);
});

test("Ungueltige Freischaltungen werden vor Veraenderung der Stadt abgewiesen", () => {
  for (const extra of [[[5, 5]], [[1, 1]], [[3.5, 1]], [[Number.MAX_SAFE_INTEGER, 1]]]) {
    const { run, storage, warnings } = createGame();
    storage.set("nordi-savegame-v1", JSON.stringify({
      v: 3, parcels: [...run("board.land.snapshot()"), ...extra], cells: [], buildings: [],
    }));
    run("board.place(board.get(15, 15), ground, tileDefs[1], meadow); save.load()");
    assert.equal(run("board.get(15, 15).ground === ground"), true);
    assert.equal(run("board.land.parcels.size"), 9);
    assert.match(warnings[0][0], /Laden fehlgeschlagen/);
  }
  for (const parcels of [undefined, [], [[0, 0]]]) {
    const { run, storage, warnings } = createGame();
    storage.set("nordi-savegame-v1", JSON.stringify({ v: 3, parcels, cells: [], buildings: [] }));
    run("save.load()");
    assert.equal(warnings.length, 1);
    assert.equal(run("board.cells.size"), 9 * 256);
  }
});

test("Speicherfehler liefern keinen Erfolg und werden sichtbar gemeldet", () => {
  const { run, context, warnings } = createGame();
  const messages = [];
  context.showToast = (message) => messages.push(message);
  context.localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(run("save.enable(); save.save()"), false);
  assert.match(warnings[0][0], /Speichern fehlgeschlagen/);
  assert.match(messages[0], /Speichern fehlgeschlagen/);
});

test("Zeichenreihenfolge fuer den Ausschnitt enthaelt keine weit entfernten Objekte", () => {
  const { run } = createGame();
  run(`
    board.place(board.get(20, 20), house, tileDefs[4], meadow);
    const visible = { minX: 0, minY: 400, maxX: 200, maxY: 700 };
    const ordered = board.drawOrder(null, visible);
  `);
  assert.equal(run("ordered.some((item) => item instanceof Building)"), true);
  assert.equal(run("ordered.every((t) => t.x + t.drawW >= visible.minX && t.x <= visible.maxX && t.y + t.drawH >= visible.minY && t.y <= visible.maxY)"), true);
  assert.ok(run("ordered.length") < run("board.cells.size") / 10);
});

test("Die CSV-Startvorlage passt auf die gemeinsame 1x2-Startflaeche", () => {
  const { run, context, warnings } = createGame();
  context.TileCatalogModel = require("../gemeinsam/tile-catalog-model.js");
  context.realCatalog = JSON.parse(fs.readFileSync(path.join(root, "daten", "tile-catalog.json"), "utf8"));
  context.realLayoutCsv = fs.readFileSync(path.join(root, "csv", "start-layout.csv"), "utf8");
  run(`
    const realDefs = realCatalog.tiles;
    const realImages = realDefs.map(() => ({ width: 64, height: 64 }));
    defByImage = new Map(realImages.map((image, index) => [image, realDefs[index]]));
    const realMeadowIndex = realDefs.findIndex((def) => def.category === "");
    const realLayout = parseCsvTable(realLayoutCsv).map((row) => ({
      category: row.kategorie, file: row.dateiname,
      gx: Number(row.gx), gy: Number(row.gy), fixed: row.fix === "FIX",
    }));
    installCatalogRules(realDefs, realCatalog.profiles);
    buildBoard(board, realImages[realMeadowIndex]);
    applyStartLayout(realLayout, board, realDefs, realImages, realMeadowIndex);
  `);
  assert.ok(run("realLayout.length") > 0);
  assert.deepEqual(warnings, []);
  assert.equal(run("realLayout.every((entry) => entry.fixed && board.get(entry.gx, entry.gy).locked)"), true);
  assert.equal(run("[...board.buildings].every((building) => building.locked && building.cells.every((cell) => cell.locked))"), true);
  assert.equal(run("board.erase(board.get(realLayout[0].gx, realLayout[0].gy), realImages[realMeadowIndex])"), false);
  assert.equal(run("board.place(board.get(realLayout[0].gx, realLayout[0].gy), realImages[realMeadowIndex], realDefs[realMeadowIndex], realImages[realMeadowIndex])"), "locked");
  assert.equal(run("board.land.parcels.size"), 2);
  assert.equal(run(`board.get(20, 28).ground === realImages[realDefs.findIndex(
    (def) => def.category === "10_Strassen" && def.file === "Strasse_2.png"
  )]`), true);
  assert.equal(run(`board.get(20, 28) === [...board.cells.values()]
    .filter((cell) => cell.x === board.land.bounds().minX)
    .sort((a, b) => b.y - a.y)[0]`), true);
});

test("Neue Welt beginnt mit zwei waagerechten Grundstuecken und vier Erweiterungen ohne Sueden", () => {
  const { run } = createGame();
  run("buildBoard(board, meadow)");
  assert.equal(run("board.cells.size"), 512);
  assert.equal(run("board.land.parcels.size"), 2);
  assert.equal(run("JSON.stringify(board.land.snapshot())"), JSON.stringify([[0, 1], [1, 1]]));
  assert.equal(run("board.land.parcels.has('1,1')"), true);
  assert.equal(run("board.land.frontier().length"), 4);
  assert.equal(run("board.snapshot().cells.length"), 0);
  assert.equal(run("board.buildings.size"), 0);
  assert.equal(run("board.land.canUnlock(2, 2)"), false);
  run("board.unlockParcel(2, 1)");
  assert.equal(run("board.cells.size"), 768);
  assert.equal(run("board.land.canUnlock(2, 2)"), false);
  assert.equal(run("board.land.canUnlock(2, 0)"), true);
});

test("Kleines Startgebiet und einzelne Freischaltungen bleiben im v3-Spielstand erhalten", () => {
  const { run, storage } = createGame();
  run("buildBoard(board, meadow); save.enable(); save.save()");
  assert.deepEqual(JSON.parse(storage.get("nordi-savegame-v1")).parcels, [[0, 1], [1, 1]]);
  run("buildBoard(board, meadow, new WorldLand(WorldLand.legacyParcels())); save.load()");
  assert.equal(run("board.cells.size"), 512);
  run("board.unlockParcel(2, 1); save.save(); buildBoard(board, meadow); save.load()");
  assert.equal(run("board.land.parcels.size"), 3);
  assert.equal(run("board.cells.size"), 768);
  assert.equal(run("board.land.parcels.has('0,0')"), false);
});

test("Bisherige Ein-Grundstueck-Staedte bleiben gueltige Spielstaende", () => {
  const { run } = createGame();
  run("buildBoard(board, meadow, new WorldLand([[1, 1]])); save.enable(); save.save(); buildBoard(board, meadow); save.load()");
  assert.equal(run("board.land.parcels.size"), 1);
  assert.equal(run("board.cells.size"), 256);
});

test("Die obere Luft wird erst nach Freischaltung begehbares Land", () => {
  const { run } = createGame();
  run(`
    buildBoard(board, meadow);
    const upperEdge = [...board.cells.values()].find((c) =>
      c.y + CELL_CENTER_Y === 264 && c.x + CELL_CENTER_X > 400 && c.x + CELL_CENTER_X < 600);
  `);
  assert.equal(run('planWalkStep(upperEdge.gx, upperEdge.gy, WALK_DIRS["up-right"], 0)'), null);
  run("board.unlockParcel(1, 0)");
  assert.equal(run('planWalkStep(upperEdge.gx, upperEdge.gy, WALK_DIRS["up-right"], 0) !== null'), true);
});
