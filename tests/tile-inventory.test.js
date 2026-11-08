const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { scanTileImages, compareInventory } = require("../tools/tile-inventory.js");

test("erkennt neue, fehlende, geaenderte und eindeutig verschobene Bilder", () => {
  const previous = [
    { path: "A/a.png", hash: "a" },
    { path: "A/b.png", hash: "b" },
    { path: "A/c.png", hash: "c" },
    { path: "A/d.png", hash: "d" },
  ];
  const current = [
    { path: "A/a.png", hash: "a" },
    { path: "A/b.png", hash: "neu" },
    { path: "B/c.png", hash: "c" },
    { path: "B/e.png", hash: "e" },
  ];
  const results = compareInventory(previous, current);
  assert.deepEqual(results.map((entry) => entry.status), ["unchanged", "changed", "moved", "new", "missing"]);
  assert.equal(results[2].previous.path, "A/c.png");
});

test("identische Bilder werden nicht willkuerlich zugeordnet", () => {
  const previous = [{ path: "a.png", hash: "x" }, { path: "b.png", hash: "x" }];
  const current = [{ path: "c.png", hash: "x" }];
  const results = compareInventory(previous, current);
  assert.deepEqual(results.map((entry) => entry.status), ["ambiguous", "missing", "missing"]);
  assert.equal(results[0].candidates.length, 2);
});

test("ein altes Bild mit mehreren neuen Kopien ist mehrdeutig", () => {
  const results = compareInventory(
    [{ path: "a.png", hash: "x" }],
    [{ path: "b.png", hash: "x" }, { path: "c.png", hash: "x" }]
  );
  assert.deepEqual(results.map((entry) => entry.status), ["ambiguous", "ambiguous", "missing"]);
});

test("gleiche Inhalte an unveraendertem Pfad verhindern eine sichere Zuordnung", () => {
  const results = compareInventory(
    [{ path: "a.png", hash: "x" }, { path: "b.png", hash: "x" }],
    [{ path: "a.png", hash: "x" }, { path: "c.png", hash: "x" }]
  );
  assert.deepEqual(results.map((entry) => entry.status), ["unchanged", "ambiguous", "missing"]);
});

test("Inventar liest PNGs rekursiv und ignoriert Kategorie-Icons", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tile-inventory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "Bäume"));
  await fs.writeFile(path.join(root, "Bäume", "Baum.png"), "image");
  await fs.writeFile(path.join(root, "Bäume", "ICON.png"), "icon");
  await fs.writeFile(path.join(root, "not-a-tile.txt"), "text");
  const result = await scanTileImages(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, "Bäume/Baum.png");
  assert.match(result[0].hash, /^[0-9a-f]{64}$/);
});

test("doppelte Pfade werden nicht stillschweigend ueberschrieben", () => {
  assert.throws(() => compareInventory([{ path: "a", hash: "x" }, { path: "a", hash: "y" }], []), /Doppelte/);
});
