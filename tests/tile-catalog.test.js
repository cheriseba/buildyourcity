const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { validateTile, resolveRules } = require("../gemeinsam/tile-catalog-model.js");
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

test("Ein fehlerhaftes Tile wird uebersprungen, gueltige Tiles bleiben verfuegbar", async () => {
  const bytes = Buffer.from("test image");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const tile = (id, category, file) => ({
    id, category, file, hash, legacyIds: [`${category}/${file}`], name: id,
    type: "UNDER", w: 1, h: 1, tags: [], status: "ready", profile: null,
    rules: { half: null, allowed: null, walk: null },
  });
  const data = { version: 1, profiles: [], tiles: [tile("meadow", "", "meadow.png"), tile("broken", "A", "bad.png"), tile("ok", "A", "ok.png")] };
  data.tiles[1].type = "bad";
  const testContext = vm.createContext({
    TileCatalogModel: { resolveRules, validateTile },
    crypto: crypto.webcrypto, Blob,
    createImageBitmap: async () => ({ close() {} }),
    console,
    parseCsvTable: () => [],
    fetch: async (url) => {
      if (url === "daten/tile-catalog.json") return { ok: true, json: async () => data };
      if (String(url).includes("tile-check")) return { ok: true, arrayBuffer: async () => bytes };
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
});
