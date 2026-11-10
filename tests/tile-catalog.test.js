const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const TileCatalogModel = require("../gemeinsam/tile-catalog-model.js");
const { validateTile, resolveRules } = TileCatalogModel;
const { enrichTileTags } = require("../gemeinsam/tile-keywords.js");
const { buildCatalog } = require("../tools/import-tile-catalog.js");

const root = path.resolve(__dirname, "..");
let catalog;
test.before(async () => { catalog = await buildCatalog(); });
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "spiel", "daten", "csv.js"), "utf8"), context);
const table = (name) => context.parseCsvTable(fs.readFileSync(path.join(root, "csv", "archiv", name), "utf8"));

test("importierter Katalog ist eindeutig und Eintraege mit Bild sind validiert", () => {
  const known = new Map(catalog.tiles.map((tile) => [tile.id, tile]));
  assert.equal(known.size, catalog.tiles.length);
  assert.equal(new Set(catalog.tiles.map((tile) => `${tile.category}/${tile.file}`.toLowerCase())).size, catalog.tiles.length);
  for (const tile of catalog.tiles.filter((item) => item.status === "ready")) assert.deepEqual(validateTile(tile, catalog.profiles, known), [], `${tile.category}/${tile.file}`);
});

test("alle importierten Tiles haben Suchbegriffe, einen Bildpfad und eine UI-Reihenfolge", () => {
  assert.equal(catalog.folders.length, new Set(catalog.tiles.map((tile) => tile.category).values()).size - 1);
  assert.ok(catalog.tiles.every((tile) => tile.tags.length > 0 && tile.assetPath && Number.isInteger(tile.order)));
  for (const folder of catalog.folders) {
    const orders = catalog.tiles.filter((tile) => tile.category === folder.name).map((tile) => tile.order);
    assert.deepEqual(orders, orders.map((_, index) => index), folder.name);
  }
});

test("Asset-Pfad und UI-Ordner sind unabhaengig und Pfade bleiben sicher", () => {
  const tile = structuredClone(catalog.tiles.find((item) => item.category));
  tile.assetPath = "Neue Ablage/Bild.png";
  assert.equal(TileCatalogModel.assetPathOf(tile), "Neue Ablage/Bild.png");
  assert.equal(TileCatalogModel.encodedAssetPath(tile), "Neue%20Ablage/Bild.png");
  assert.deepEqual(validateTile(tile, catalog.profiles, new Map(catalog.tiles.map((item) => [item.id, item]))), []);
  tile.assetPath = "../ausserhalb.png";
  assert.match(validateTile(tile, catalog.profiles, new Map(catalog.tiles.map((item) => [item.id, item]))).join(" "), /Asset-Pfad/);
});

test("Suchbegriffe decken Tile-Namen, Kategorien und haeufige Synonyme ab", () => {
  assert.ok(enrichTileTags("10_Strassen", "Zebra_1.png").includes("Zebrastreifen"));
  assert.ok(enrichTileTags("30_Bahnhof", "Gleis_Brucke_2.png").includes("Brücke"));
  assert.ok(enrichTileTags("20_Naturdeko", "Baum_3.png").includes("Pflanze"));
  assert.ok(enrichTileTags("40_Wasser", "Halb_1.png").includes("Ufer"));
});

test("importierte Laufregeln bewahren auch alte namensgleiche Regeln", () => {
  const rows = table("tiles-walk.csv");
  for (const tile of catalog.tiles) {
    const old = rows.filter((row) => row.dateiname.toLowerCase() === tile.file.toLowerCase());
    const walk = resolveRules(tile, catalog.profiles).walk;
    assert.equal(walk ? walk.length : 0, old.length, tile.file);
    old.forEach((row, index) => {
      assert.equal(walk[index].level, row.ebene.toLowerCase());
      for (const dir of ["W", "A", "S", "D"]) assert.equal(walk[index].dirs[dir], row[dir.toLowerCase()] || "-");
    });
  }
});

test("importierte OVER-Regeln und halbe Positionen bleiben erhalten", () => {
  const half = table("tiles-over-halb.csv");
  const allowed = table("tiles-over-regeln.csv");
  const byId = new Map(catalog.tiles.map((tile) => [tile.id, tile]));
  for (const tile of catalog.tiles) {
    const rules = resolveRules(tile, catalog.profiles);
    const same = (row) => row.kategorie.toLowerCase() === tile.category.toLowerCase() && row.dateiname.toLowerCase() === tile.file.toLowerCase();
    assert.equal(rules.half, (half.find(same) || {}).position || null);
    const old = Array.from(allowed.filter(same), (row) => `${row["over-kategorie"]}/${row["over-dateiname"]}`.toLowerCase()).sort();
    const now = (rules.allowed || []).map((id) => `${byId.get(id).category}/${byId.get(id).file}`.toLowerCase()).sort();
    assert.deepEqual(now, old, tile.file);
  }
});

test("Vorlagen werden geteilt und fehlende Referenzen als Fehler erkannt", () => {
  const tile = structuredClone(catalog.tiles.find((item) => item.type === "OVER"));
  const profile = { id: "shared", rules: { half: "vorn", allowed: null, walk: null } };
  tile.profile = profile.id;
  assert.equal(resolveRules(tile, [profile]), profile.rules);
  assert.deepEqual(validateTile(tile, [profile], new Map([[tile.id, tile]])), []);
  tile.profile = "fehlend";
  assert.match(validateTile(tile, [profile], new Map([[tile.id, tile]])).join(" "), /fehlt/);
});

test("tile-spezifische OVER-Sonderregeln ergänzen und entfernen Einträge einer Vorlage", () => {
  const ground = structuredClone(catalog.tiles.find((tile) => tile.type === "UNDER" && tile.category));
  const overlays = catalog.tiles.filter((tile) => tile.type === "OVER" && tile.status === "ready").slice(0, 3);
  const profile = {
    id: "shared-over",
    rules: { half: null, allowed: [overlays[0].id, overlays[1].id], walk: null },
  };
  ground.profile = profile.id;
  ground.overrides = { allowed: { add: [overlays[2].id], remove: [overlays[0].id] } };
  const known = new Map([...catalog.tiles, ground].map((tile) => [tile.id, tile]));
  const effective = resolveRules(ground, [profile]);
  assert.deepEqual(effective.allowed, [overlays[1].id, overlays[2].id]);
  assert.deepEqual(validateTile(ground, [profile], known), []);

  profile.rules.allowed = null;
  ground.overrides = { allowed: { add: [], remove: [overlays[0].id] } };
  const unrestrictedBase = resolveRules(ground, [profile]);
  assert.equal(unrestrictedBase.allowed, null);
  assert.deepEqual(unrestrictedBase.excluded, [overlays[0].id]);
  assert.deepEqual(validateTile(ground, [profile], known), []);
});

test("Ein fehlerhaftes Tile wird uebersprungen, gueltige Tiles bleiben verfuegbar", async () => {
  const bytes = Buffer.from("test image");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const tile = (id, category, file) => ({
    id, category, file, hash, legacyIds: [`${category}/${file}`], name: id,
    type: "UNDER", w: 1, h: 1, tags: [], status: "ready", profile: null,
    rules: { half: null, allowed: null, walk: null },
  });
  const data = { version: 1, profiles: [], folders: [{ name: "A", order: 0, icon: "Icons/a.png" }], tiles: [tile("meadow", "", "meadow.png"), tile("broken", "A", "bad.png"), tile("ok", "A", "ok.png")] };
  data.tiles[1].type = "bad";
  data.tiles[2].assetPath = "flat/ok.png";
  const checkedPaths = [];
  const testContext = vm.createContext({
    TileCatalogModel,
    crypto: crypto.webcrypto, Blob,
    createImageBitmap: async () => ({ close() {} }),
    console,
    parseCsvTable: () => [],
    fetch: async (url) => {
      if (url === "daten/tile-catalog.json") return { ok: true, json: async () => data };
      if (String(url).includes("tile-check")) {
        checkedPaths.push(String(url));
        return { ok: true, arrayBuffer: async () => bytes };
      }
      return { ok: true, text: async () => "" };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "spiel", "daten", "catalog.js"), "utf8"), testContext);
  const result = await testContext.loadTileCatalog();
  assert.equal(result.root, "Katalog");
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /bad.png.*Ungueltiger Typ/);
  assert.equal(result.categories[0].tiles.length, 1);
  assert.equal(result.categories[0].tiles[0].id, "ok");
  assert.equal(result.categories[0].icon, "Icons/a.png");
  assert.ok(checkedPaths.includes("Katalog/flat/ok.png?tile-check=1"));
});
