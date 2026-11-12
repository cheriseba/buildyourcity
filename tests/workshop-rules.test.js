const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const TileCatalogModel = require("../gemeinsam/tile-catalog-model.js");

function createWorkshop(tile, profiles, otherTiles = [], families = []) {
  function element(tag) {
    return {
      tag, value: "", children: [], events: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(type, callback) { this.events[type] = callback; },
      setAttribute(name, value) { this[name] = value; },
      focus() {},
      isConnected: true,
    };
  }
  const elements = new Map();
  const document = {
    createElement: element,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element("div"));
      return elements.get(selector);
    },
  };
  const context = vm.createContext({ document, TileCatalogModel, structuredClone, console, crypto: require("node:crypto") });
  const source = fs.readFileSync(path.join(__dirname, "..", "tools", "workshop", "workshop.js"), "utf8");
  vm.runInContext(source.slice(0, source.indexOf('$("#search").addEventListener')), context);
  context.testTile = tile;
  context.testProfiles = profiles;
  context.otherTiles = otherTiles;
  context.testFamilies = families;
  vm.runInContext(`
    state = { catalog: { tiles: [testTile, ...otherTiles], profiles: testProfiles, folders: [], families: testFamilies }, inventory: [] };
    selected = { status: "unchanged", previous: { id: testTile.id, path: testTile.file } };
    render = () => renderDetail();
    renderDetail();
  `, context);
  function findElement(tag, text) {
    const visit = (item) => {
      if (item.tag === tag && item.textContent === text) return item;
      for (const child of item.children) {
        const found = visit(child);
        if (found) return found;
      }
    };
    return visit(elements.get("#detail"));
  }
  return {
    choose(value, caption = "Regelvorlage") {
      const label = findElement("label", caption);
      assert.ok(label);
      const select = label.children[0];
      select.value = value;
      select.events.change?.();
    },
    click(text) {
      const button = findElement("button", text);
      assert.ok(button, text);
      button.events.click();
    },
    isDirty: () => vm.runInContext("dirty", context),
    run: (code) => vm.runInContext(code, context),
  };
}

test("Wechsel zu eigenen Regeln stellt die vorherigen Regeln wieder her", () => {
  const originalRules = { half: null, allowed: null, walk: null };
  const tile = {
    id: "halle", name: "Halle", category: "Haus", file: "Halle.png",
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null, rules: originalRules,
  };
  const profile = { id: "water", name: "Wasser", rules: { half: null, allowed: [], walk: null } };
  const workshop = createWorkshop(tile, [profile]);
  const known = new Map([[tile.id, tile]]);
  workshop.choose("water");
  assert.match(TileCatalogModel.validateTile(tile, [profile], known).join(" "), /OVER-Auswahl nur/);
  workshop.choose("");
  assert.equal(tile.profile, null);
  assert.equal(tile.rules, originalRules);
  assert.deepEqual(TileCatalogModel.validateTile(tile, [profile], known), []);
  assert.deepEqual(profile.rules.allowed, []);
});

test("Regeln eines Tiles lassen sich nach Bestaetigung auf Standard zuruecksetzen", () => {
  const tile = {
    id: "halle", name: "Halle", category: "Haus", file: "Halle.png",
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: "water",
    rules: { half: null, allowed: ["overlay"], walk: null },
    overrides: { allowed: { add: [], remove: ["overlay"] } },
  };
  const profile = { id: "water", name: "Wasser", rules: { half: null, allowed: ["overlay"], walk: null } };
  const workshop = createWorkshop(tile, [profile]);
  workshop.click("Regeln dieses Tiles zurücksetzen");
  assert.equal(tile.profile, "water");
  assert.ok(tile.overrides);
  workshop.click("Bestätigen: Regeln dieses Tiles zurücksetzen");
  assert.equal(tile.profile, null);
  assert.equal(JSON.stringify(tile.rules), JSON.stringify({ half: null, allowed: null, walk: null }));
  assert.equal(tile.overrides, undefined);
  assert.deepEqual(profile.rules.allowed, ["overlay"]);
  assert.equal(workshop.isDirty(), true);
  assert.deepEqual(TileCatalogModel.validateTile(tile, [profile], new Map([[tile.id, tile]])), []);
});

test("Sonderregeln lassen sich separat entfernen und uebersteuern Vorlagen bis dahin", () => {
  const tile = {
    id: "ground", name: "Boden", category: "Boden", file: "Boden.png",
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "UNDER", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
    overrides: { allowed: { add: [], remove: ["overlay"] } },
  };
  const overlay = { id: "overlay", name: "Baum", category: "Natur", file: "Baum.png", type: "OVER", status: "ready" };
  const profile = { id: "water", name: "Wasser", rules: { half: null, allowed: ["overlay"], walk: null } };
  const workshop = createWorkshop(tile, [profile], [overlay]);
  workshop.choose("water");
  assert.deepEqual(TileCatalogModel.resolveRules(tile, [profile]).allowed, []);
  workshop.click("Sonderregeln zurücksetzen");
  assert.ok(tile.overrides);
  workshop.click("Bestätigen: Sonderregeln zurücksetzen");
  assert.equal(tile.overrides, undefined);
  assert.deepEqual(TileCatalogModel.resolveRules(tile, [profile]).allowed, ["overlay"]);
  assert.equal(tile.profile, "water");
  assert.equal(workshop.isDirty(), true);
});

test("Halle_2 im gespeicherten Katalog ist gueltig", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "daten", "tile-catalog.json"), "utf8"));
  const tile = catalog.tiles.find((item) => item.category === "3_Spezialhaus" && item.file === "Halle_2.png");
  assert.ok(tile);
  assert.deepEqual(TileCatalogModel.validateTile(tile, catalog.profiles, new Map(catalog.tiles.map((item) => [item.id, item]))), []);
});

test("Werkstatt legt eine Familie an und loest sie ohne Tile- oder Regelverlust wieder auf", () => {
  const tile = {
    id: "red", name: "Haus_1", category: "Haus", file: "Haus_1.png",
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
  };
  const before = JSON.stringify(tile);
  const families = [];
  const workshop = createWorkshop(tile, [], [], families);
  workshop.click("Farbfamilie anlegen");
  assert.equal(families.length, 1);
  assert.equal(families[0].variants[0].tileId, tile.id);
  workshop.click("Familie auflösen");
  workshop.click("Bestätigen: Familie auflösen");
  assert.equal(workshop.run("state.catalog.families.length"), 0);
  assert.equal(JSON.stringify(tile), before);
  assert.equal(workshop.isDirty(), true);
});

test("Verschieben einer Familie nimmt alle Mitglieder mit, aber keine anderen Tiles", () => {
  const tile = {
    id: "red", name: "Haus rot", category: "Haus", file: "rot.png",
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
  };
  const yellow = { ...tile, id: "yellow", file: "gelb.png", name: "Haus gelb", order: 1 };
  const other = { ...tile, id: "other", file: "anders.png", name: "Anderes Haus", order: 2 };
  const family = {
    id: "house", name: "Haus", category: "Haus", defaultTileId: tile.id,
    variants: [tile, yellow].map((item) => ({ tileId: item.id, label: item.name, color: null })),
  };
  const workshop = createWorkshop(tile, [], [yellow, other], [family]);
  workshop.run('placeTile(state.catalog.tiles[0], "Neu")');
  assert.equal(tile.category, "Neu");
  assert.equal(yellow.category, "Neu");
  assert.equal(other.category, "Haus");
  assert.equal(family.category, "Neu");
  assert.equal(tile.order, 0);
  assert.equal(yellow.order, 1);
});

test("Familienmitglieder lassen sich in beide Richtungen umsortieren, ohne Standard oder Tiles zu aendern", () => {
  const tile = {
    id: "red", name: "Haus rot", category: "Haus", file: "rot.png", order: 0,
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
  };
  const yellow = { ...tile, id: "yellow", file: "gelb.png", name: "Haus gelb", order: 1 };
  const blue = { ...tile, id: "blue", file: "blau.png", name: "Haus blau", order: 2 };
  const other = { ...tile, id: "other", file: "anders.png", name: "Anderes Haus", order: 3 };
  const family = {
    id: "house", name: "Haus", category: "Haus", defaultTileId: yellow.id,
    variants: [tile, yellow, blue].map((item) => ({ tileId: item.id, label: item.name, color: null })),
  };
  const before = JSON.stringify([tile, yellow, blue, other]);
  const workshop = createWorkshop(tile, [], [yellow, blue, other], [family]);
  workshop.run('placeTile(state.catalog.tiles[0], "Haus", "red")');
  assert.equal(workshop.isDirty(), false);
  workshop.run('placeTile(state.catalog.tiles[0], "Haus", "blue")');
  assert.deepEqual(family.variants.map((item) => item.tileId), ["yellow", "blue", "red"]);
  assert.equal(workshop.isDirty(), true);
  workshop.run('placeTile(state.catalog.tiles[0], "Haus", "yellow")');
  assert.deepEqual(family.variants.map((item) => item.tileId), ["red", "yellow", "blue"]);
  workshop.click("Nach hinten");
  assert.deepEqual(family.variants.map((item) => item.tileId), ["yellow", "red", "blue"]);
  workshop.click("Nach vorn");
  assert.deepEqual(family.variants.map((item) => item.tileId), ["red", "yellow", "blue"]);
  assert.equal(family.defaultTileId, yellow.id);
  assert.equal(JSON.stringify([tile, yellow, blue, other]), before);
  assert.deepEqual(workshop.run("familyErrors(state.catalog.families[0])"), []);
});

test("Griffe verschieben einzelne Varianten, ganze Familien und Kategorien getrennt", () => {
  const tile = {
    id: "red", name: "Haus rot", category: "Haus", file: "rot.png", order: 0,
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
  };
  const yellow = { ...tile, id: "yellow", name: "Haus gelb", file: "gelb.png", order: 1 };
  const other = { ...tile, id: "other", name: "Anderes Haus", file: "anders.png", category: "Neu" };
  const family = {
    id: "house", name: "Haus", category: "Haus", defaultTileId: tile.id,
    variants: [tile, yellow].map((item) => ({ tileId: item.id, label: item.name, color: null })),
  };
  const workshop = createWorkshop(tile, [], [yellow, other], [family]);
  workshop.run(`
    state.catalog.folders = [{ name: "Haus", order: 0 }, { name: "Neu", order: 1 }];
    state.inventory = state.catalog.tiles.map(tile => ({
      status: "unchanged", previous: { id: tile.id, path: tile.file },
      current: { path: tile.file, hash: tile.hash }
    }));
    document.querySelector("#filter").value = "all";
    render = () => { renderList(); renderDetail(); };
    function findHandle(title, root = document.querySelector("#rows")) {
      if (root.title === title) return root;
      for (const child of root.children) {
        const found = findHandle(title, child);
        if (found) return found;
      }
    }
    function tileRow(name) {
      return document.querySelector("#rows").children.find(row => row.children[2]?.textContent === name);
    }
    const dragEvent = { stopPropagation() {}, preventDefault() {}, dataTransfer: { setData() {} } };
    render();
    findHandle("Neu verschieben").events.dragstart(dragEvent);
    document.querySelector("#rows").children.find(row => row.dataset.folder === "Haus").events.drop(dragEvent);
    findHandle("Haus rot verschieben").events.dragstart(dragEvent);
    tileRow("Haus gelb").events.drop(dragEvent);
  `);
  assert.deepEqual(family.variants.map((item) => item.tileId), ["yellow", "red"]);
  workshop.run(`
    findHandle("Familie Haus verschieben").events.dragstart(dragEvent);
    tileRow("Haus rot").events.drop(dragEvent);
  `);
  assert.deepEqual(family.variants.map((item) => item.tileId), ["yellow", "red"]);
  workshop.run(`
    findHandle("Familie Haus verschieben").events.dragstart(dragEvent);
    tileRow("Anderes Haus").events.drop(dragEvent);
  `);
  assert.equal(tile.category, "Neu");
  assert.equal(yellow.category, "Neu");
  assert.equal(family.category, "Neu");
  assert.ok(tile.order < other.order);
  assert.ok(yellow.order < other.order);
  assert.equal(workshop.run("state.catalog.folders[0].name"), "Neu");
  assert.deepEqual(family.variants.map((item) => item.tileId), ["yellow", "red"]);
  assert.equal(family.defaultTileId, tile.id);
});

function createCollapsingWorkshop() {
  const tile = {
    id: "red", name: "Haus rot", category: "Haus", file: "rot.png", order: 0,
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
  };
  const yellow = { ...tile, id: "yellow", name: "Haus gelb", file: "gelb.png", order: 1 };
  const other = { ...tile, id: "other", name: "Anderes Haus", file: "anders.png", category: "Neu" };
  const family = {
    id: "house", name: "Haus", category: "Haus", defaultTileId: tile.id,
    variants: [tile, yellow].map((item) => ({ tileId: item.id, label: item.name, color: null })),
  };
  const workshop = createWorkshop(tile, [], [yellow, other], [family]);
  workshop.run(`
    state.catalog.folders = [{ name: "Haus", order: 0 }, { name: "Neu", order: 1 }];
    state.inventory = state.catalog.tiles.map(tile => ({
      status: "unchanged", previous: { id: tile.id, path: tile.file },
      current: { path: tile.file, hash: tile.hash }
    }));
    document.querySelector("#filter").value = "all";
    render = () => { renderList(); renderDetail(); };
    function findCollapse(key, root = document.querySelector("#rows")) {
      if (root.dataset.collapseKey === key) return root;
      for (const child of root.children) {
        const found = findCollapse(key, child);
        if (found) return found;
      }
    }
    const collapseEvent = { stopPropagation() {} };
    render();
  `);
  return { workshop, tile, yellow, other, family };
}

test("Kategorien und Familien klappen unabhaengig ein und bleiben als Ablageziel nutzbar", () => {
  const { workshop, other } = createCollapsingWorkshop();
  workshop.run('findCollapse("family:house").events.click(collapseEvent)');
  assert.equal(workshop.run("expandedEntries().length"), 1);
  assert.equal(workshop.run('findCollapse("family:house")["aria-expanded"]'), "false");
  workshop.run('findCollapse("folder:Haus").events.click(collapseEvent)');
  assert.equal(workshop.run('document.querySelector("#rows").children.length'), 3);
  workshop.run('findCollapse("folder:Haus").events.click(collapseEvent); renderList()');
  assert.equal(workshop.run("expandedEntries().length"), 1);
  assert.equal(workshop.run('findCollapse("family:house")["aria-expanded"]'), "false");
  assert.equal(workshop.isDirty(), false);
  workshop.run(`
    findCollapse("folder:Haus").events.click(collapseEvent);
    dragged = { type: "tile", id: "other" };
    const target = document.querySelector("#rows").children.find(row => row.dataset.folder === "Haus");
    target.events.drop({ preventDefault() {} });
  `);
  assert.equal(other.category, "Haus");
  assert.equal(workshop.run('isCollapsed("folder:Haus")'), true);
});

test("Alles ein- und ausklappen gilt auch fuer verschachtelte Details, ohne Katalogaenderung", () => {
  const { workshop } = createCollapsingWorkshop();
  const before = workshop.run("JSON.stringify(state.catalog)");
  workshop.run(`
    const properties = findCollapse("detail:properties", document.querySelector("#detail"));
    properties.open = false;
    properties.events.toggle();
    renderDetail();
  `);
  assert.equal(workshop.run('findCollapse("detail:properties", document.querySelector("#detail")).open'), false);
  workshop.run("setAllCollapsed(true)");
  assert.equal(workshop.run("expandedEntries().length"), 0);
  assert.equal(workshop.run('document.querySelector("#rows").children.length'), 2);
  assert.equal(workshop.run('findCollapse("detail:variant:red", document.querySelector("#detail")).open'), false);
  assert.equal(workshop.run('document.querySelector("#tag-sharing").open'), false);
  workshop.run('findCollapse("folder:Neu").events.click(collapseEvent)');
  assert.equal(workshop.run("expandedEntries().length"), 1);
  workshop.run("setAllCollapsed(false)");
  assert.equal(workshop.run("expandedEntries().length"), 3);
  assert.equal(workshop.run('findCollapse("detail:properties", document.querySelector("#detail")).open'), true);
  assert.equal(workshop.run('findCollapse("detail:variant:red", document.querySelector("#detail")).open'), true);
  assert.equal(workshop.run('document.querySelector("#tag-sharing").open'), true);
  assert.equal(workshop.run("JSON.stringify(state.catalog)"), before);
  assert.equal(workshop.isDirty(), false);
});

test("Zuordnung zu einer Familie weist andere Regeln ab und erlaubt kompatible Mitglieder", () => {
  const tile = {
    id: "red", name: "Haus rot", category: "Haus", file: "rot.png",
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
  };
  const yellow = { ...tile, id: "yellow", file: "gelb.png", name: "Haus gelb" };
  const other = { ...tile, id: "other", w: 2 };
  const family = {
    id: "house", name: "Haus", category: "Haus", defaultTileId: tile.id,
    variants: [tile, yellow].map((item) => ({ tileId: item.id, label: item.name, color: null })),
  };
  const workshop = createWorkshop(other, [], [tile, yellow], [family]);
  workshop.choose(family.id, "Bestehender Familie zuordnen");
  workshop.click("Zur Familie hinzufügen");
  assert.equal(family.variants.length, 2);
  assert.equal(workshop.isDirty(), false);
  assert.match(workshop.run('document.querySelector("#message").textContent'), /Grundflaeche/);
  other.w = 1;
  workshop.click("Zur Familie hinzufügen");
  assert.equal(family.variants.length, 3);
  assert.equal(family.variants[2].tileId, other.id);
  assert.equal(workshop.isDirty(), true);
});

test("Beschaedigte Familienreferenzen blockieren nicht die uebrige Tile-Bearbeitung", async () => {
  const tile = {
    id: "red", name: "Haus rot", category: "Haus", file: "rot.png",
    hash: "a".repeat(64), legacyIds: [], tags: [], status: "ready",
    type: "FULL", w: 1, h: 1, profile: null,
    rules: { half: null, allowed: null, walk: null },
  };
  const workshop = createWorkshop(tile, [], [], [null, { category: "Haus", variants: [null, { tileId: tile.id }] }]);
  assert.equal(workshop.run("familyOf(state.catalog.tiles[0])"), undefined);
  assert.match(workshop.run("familyErrors(state.catalog.families[0]).join()"), /kein Objekt/);
  workshop.click("Farbfamilie anlegen");
  assert.equal(workshop.run("familyOf(state.catalog.tiles[0]).variants[0].tileId"), tile.id);
  workshop.run('state.catalog.families = null; fetch = async () => ({ ok: true, json: async () => state });');
  await assert.rejects(workshop.run("load(true)"), /Variantenfamilien sind kein Array/);
});
