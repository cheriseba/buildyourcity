const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const TileCatalogModel = require("../gemeinsam/tile-catalog-model.js");

function createWorkshop(tile, profiles, otherTiles = []) {
  function element(tag) {
    return {
      tag, children: [], events: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(type, callback) { this.events[type] = callback; },
      setAttribute() {},
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
  const context = vm.createContext({ document, TileCatalogModel, structuredClone, console });
  const source = fs.readFileSync(path.join(__dirname, "..", "tools", "workshop", "workshop.js"), "utf8");
  vm.runInContext(source.slice(0, source.indexOf('$("#search").addEventListener')), context);
  context.testTile = tile;
  context.testProfiles = profiles;
  context.otherTiles = otherTiles;
  vm.runInContext(`
    state = { catalog: { tiles: [testTile, ...otherTiles], profiles: testProfiles, folders: [] }, inventory: [] };
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
    choose(value) {
      const label = findElement("label", "Regelvorlage");
      assert.ok(label);
      const select = label.children[0];
      select.value = value;
      select.events.change();
    },
    click(text) {
      const button = findElement("button", text);
      assert.ok(button, text);
      button.events.click();
    },
    isDirty: () => vm.runInContext("dirty", context),
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
