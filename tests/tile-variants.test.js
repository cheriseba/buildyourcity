const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Model = require("../gemeinsam/tile-catalog-model");
const TileVariants = require("../spiel/ui/tile-variants");

function fixture() {
  const tiles = ["white", "yellow", "red"].map((id) => ({
    id, name: id, category: "Houses", type: "FULL", w: 1, h: 1,
    rules: { half: null, allowed: null, walk: null },
  }));
  const family = {
    id: "house", name: "Altbau", category: "Houses", defaultTileId: "white",
    variants: tiles.map((tile) => ({ tileId: tile.id, label: tile.name, color: null })),
  };
  const catalog = { tiles, families: [family], profiles: [] };
  const storage = new Map();
  return {
    tiles, family, catalog, storage,
    validate: () => Model.validateFamily(family, catalog.families, new Map(tiles.map((tile) => [tile.id, tile])), []),
    selection: () => new TileVariants({ definitions: tiles, families: catalog.families,
      storage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } }),
  };
}

test("Farbvarianten behalten Identitaeten und werden in Palette und Suchtreffern zusammengefasst", () => {
  const { selection, tiles, validate } = fixture();
  const before = JSON.stringify(tiles);
  const variants = selection();
  assert.deepEqual(validate(), []);
  assert.deepEqual(variants.collapse([0, 1, 2]), [0]);
  assert.deepEqual(variants.collapse([2]), [0]);
  assert.match(variants.searchText(2), /Altbau red/);
  variants.remember(2);
  assert.deepEqual(variants.collapse([0, 1, 2]), [2]);
  assert.equal(variants.key(0), variants.key(2));
  assert.equal(JSON.stringify(tiles), before);
});

test("Kennfarben sind optional und unabhaengig von der konkreten Farbvariante", () => {
  const game = fixture();
  delete game.family.variants[0].color;
  assert.deepEqual(game.validate(), []);
  assert.equal(game.selection().representative(0), 0);
});

test("Eine vom Tutorial geschlossene Kategorie oeffnet keine schwebende Farbauswahl", () => {
  const variants = fixture().selection();
  variants.panel = { hidden: true };
  assert.doesNotThrow(() => variants.open({
    dataset: { tileIndex: "0" }, isConnected: true, getClientRects: () => [],
  }));
  assert.equal(variants.panel.hidden, true);
});

test("Die kompakte Farbleiste zeigt nur Vorschauen und bleibt beschriftet bedienbar", () => {
  const descendants = (element) => element.children.flatMap((child) => [child, ...descendants(child)]);
  const element = (tag) => ({
    tag, children: [], dataset: {}, style: {}, attributes: {}, events: {}, textContent: "",
    classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.events[name] = callback; },
    querySelectorAll() { return descendants(this).filter((child) => child.dataset.variantIndex !== undefined); },
  });
  const Controller = vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "spiel", "ui", "tile-variants.js"), "utf8") + "\nTileVariants;",
    { document: { createElement: element, querySelectorAll: () => [] } }
  );
  const game = fixture();
  game.family.variants[0].color = "#ffffff";
  const variants = new Controller({ definitions: game.tiles, families: game.catalog.families,
    storage: { getItem: () => null, setItem() {} } });
  let selected = 0;
  variants.panel = element("section");
  variants.getSelected = () => selected;
  variants.select = (index) => { selected = index; variants.remember(index); variants.updateButtons(); };
  variants.position = () => {};
  variants.open({ dataset: { tileIndex: "0" }, isConnected: true, getClientRects: () => [{}] });
  const contents = descendants(variants.panel);
  const choices = contents.filter((child) => child.tag === "button");
  assert.equal(choices.length, 3);
  assert.ok(contents.every((child) => child.textContent === ""));
  assert.deepEqual(choices.map((choice) => choice.attributes["aria-label"]), ["Altbau: white", "Altbau: yellow", "Altbau: red"]);
  choices[2].events.click();
  assert.equal(selected, 2);
  assert.equal(variants.representative(0), 2);
  assert.equal(choices[2].attributes["aria-pressed"], "true");
  assert.equal(variants.panel.hidden, false);
});

test("Letzte Farbe bleibt pro Familie gespeichert; entfernte Farben fallen auf gueltigen Standard zurueck", () => {
  const game = fixture();
  game.selection().remember(2);
  assert.equal(game.selection().representative(0), 2);
  const issues = [];
  const families = Model.resolveFamilies(game.catalog, game.tiles.slice(0, 2), issues);
  const selection = new TileVariants({ definitions: game.tiles.slice(0, 2), families,
    storage: { getItem: (key) => game.storage.get(key) } });
  assert.equal(selection.representative(0), 0);
  assert.deepEqual(issues, []);
});

test("Fehlendes Standardbild laesst Geschwister nutzbar; eine einzelne verbleibende Variante bleibt gruppiert", () => {
  const { catalog, tiles } = fixture();
  const issues = [];
  const families = Model.resolveFamilies(catalog, [tiles[2]], issues);
  assert.equal(families.length, 1);
  assert.equal(families[0].defaultTileId, "red");
  assert.equal(families[0].variants.length, 1);
  assert.equal(catalog.families[0].variants.length, 3);
  assert.deepEqual(Model.resolveFamilies(catalog, [], issues), []);
});

test("Ausgeblendete Familienvarianten werden nicht mehr angeboten", () => {
  const game = fixture();
  game.tiles[0].hiddenInPalette = true;
  const issues = [];
  const families = Model.resolveFamilies(game.catalog, game.tiles.filter((tile) => !tile.hiddenInPalette), issues);
  const selection = new TileVariants({ definitions: game.tiles, families, storage: { getItem: () => null } });
  assert.equal(families[0].defaultTileId, "yellow");
  assert.deepEqual(families[0].variants.map((variant) => variant.tileId), ["yellow", "red"]);
  assert.deepEqual(selection.collapse([1, 2]), [1]);
  assert.deepEqual(issues, []);
});

test("Grundflaechen, Kategorien und Typen muessen passen, Lauf- und Platzierungsregeln duerfen abweichen", () => {
  for (const change of [
    (tile) => { tile.w = 2; },
    (tile) => { tile.category = "Other"; },
    (tile) => { tile.type = "UNDER"; },
  ]) {
    const game = fixture();
    change(game.tiles[1]);
    assert.ok(game.validate().length);
    const issues = [];
    assert.deepEqual(Model.resolveFamilies(game.catalog, game.tiles, issues), []);
    assert.ok(issues.length);
  }

  const game = fixture();
  game.tiles.push({ id: "bridge", type: "OVER" });
  game.tiles[1].rules.allowed = ["bridge"];
  game.tiles[2].rules.walk = [{ level: "unten", dirs: { W: "0", A: "-", S: "-", D: "-" } }];
  assert.deepEqual(game.validate(), []);
  const issues = [];
  assert.equal(Model.resolveFamilies(game.catalog, game.tiles, issues).length, 1);
  assert.deepEqual(issues, []);
});

test("Geteilte Regelvorlagen und eigene identische Regeln sind als Farbvarianten kompatibel", () => {
  const game = fixture();
  game.tiles[1].profile = "house-rules";
  game.catalog.profiles.push({ id: "house-rules", rules: { half: null, allowed: null, walk: null } });
  assert.deepEqual(Model.validateFamily(game.family, game.catalog.families,
    new Map(game.tiles.map((tile) => [tile.id, tile])), game.catalog.profiles), []);
});

test("Doppelte Mitgliedschaften, fehlende Tiles, ungueltige Farben und Standards werden gemeldet", () => {
  for (const change of [
    (game) => game.family.variants.push({ ...game.family.variants[0] }),
    (game) => { game.family.variants[0].tileId = "missing"; },
    (game) => { game.family.variants[0].color = "red"; },
    (game) => { game.family.defaultTileId = "missing"; },
    (game) => { game.family.variants[0].label = ""; },
    (game) => game.catalog.families.push({ ...game.family, id: "other" }),
  ]) {
    const game = fixture();
    change(game);
    assert.ok(game.validate().length);
  }
});

test("Ungueltige Familien verhindern weder andere Familien noch einzelne Tiles", () => {
  const game = fixture();
  game.catalog.families.push(null);
  const issues = [];
  assert.equal(Model.resolveFamilies(game.catalog, game.tiles, issues).length, 1);
  assert.match(issues[0], /kein Objekt/);
  game.catalog.families = {};
  assert.deepEqual(Model.resolveFamilies(game.catalog, game.tiles, issues), []);
  assert.deepEqual(Model.resolveFamilies({ ...game.catalog, families: undefined }, game.tiles, []), []);
});

test("Beschaedigte oder gesperrte lokale Variantenauswahl wird gemeldet und verhindert die Auswahl nicht", () => {
  const game = fixture();
  const messages = [];
  const originalWarn = console.warn;
  console.warn = (...args) => messages.push(args);
  try {
    const selection = new TileVariants({ definitions: game.tiles, families: game.catalog.families,
      storage: { getItem: () => '{"broken":true}', setItem: () => { throw new Error("blocked"); } } });
    assert.equal(selection.representative(0), 0);
    selection.remember(2);
    assert.equal(selection.representative(0), 2);
    assert.equal(messages.length, 2);
  } finally { console.warn = originalWarn; }
});

test("Die erste Altbau-Familie umfasst ausschliesslich die drei bestaetigten Farbvarianten", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "daten", "tile-catalog.json"), "utf8"));
  const known = new Map(catalog.tiles.map((tile) => [tile.id, tile]));
  const family = catalog.families.find((item) => item.name === "Altbau");
  assert.deepEqual(Model.validateFamily(family, catalog.families, known, catalog.profiles), []);
  assert.deepEqual(family.variants.map((variant) => known.get(variant.tileId).file),
    ["Altbau_1.png", "Altbau_2.png", "Altbau_3.png"]);
});
