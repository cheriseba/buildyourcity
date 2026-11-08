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
  for (const file of ["spiel/daten/csv.js", "spiel/daten/catalog.js", "spiel/daten/start-layout.js", "spiel/welt/grid.js", "spiel/welt/tile.js", "spiel/welt/walk.js", "spiel/welt/over-rules.js", "spiel/speichern/save-game.js"]) {
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
    buildBoard(board, meadow);
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

test("v1-Spielstand speichert und laedt Overlays und mehrzellige Gebaeude", () => {
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
  assert.equal(saved.v, 1);
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

test("Fehlende Tiles melden und beim weiteren Speichern ueberspringen", () => {
  const game = createGame();
  const issues = [];
  game.context.showCatalogWarnings = (messages) => issues.push(...messages);
  game.storage.set("nordi-savegame-v1", JSON.stringify({
    v: 1,
    cells: [["15,15", "Boden/ground.png", "UNDER", "Deko/fehlt.png", false]],
    buildings: [],
  }));
  game.run("save.load(); save.enable(); save.save()");
  assert.match(issues[0], /Deko\/fehlt\.png/);
  assert.equal(game.run("board.get(15, 15).overlay"), null);
  assert.equal(JSON.parse(game.storage.get("nordi-savegame-v1")).cells[0][3], null);
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
    v: 1, cells: [["15,15", "Boden/ground.png", "UNDER", "Deko/front.png", false]], buildings: [],
  }));
  run("save.load(); save.enable(); save.save()");
  const result = JSON.parse(storage.get("nordi-savegame-v1"));
  assert.equal(result.v, 2);
  assert.equal(result.cells[0][1], "stable-1");
  assert.equal(result.cells[0][3], "stable-2");
});
