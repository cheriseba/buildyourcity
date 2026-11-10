const test = require("node:test");
const assert = require("node:assert/strict");
const { merge } = require("../tools/workshop/tag-sharing");

const response = (tiles) => ({ format: "nordstadt-tile-tags", version: 1, tiles });

test("Tag-Rückmeldungen ergänzen Tags ohne vorhandene Tags zu überschreiben oder zu duplizieren", () => {
  const tiles = [{ id: "haus", tags: ["Haus", "rot"] }];
  const result = merge(tiles, response([
    { id: "haus", tags: ["Haus", "Dach", " dach ", ""] },
  ]));

  assert.deepEqual(result, { added: 1, unknownTiles: 0 });
  assert.deepEqual(tiles[0].tags, ["Haus", "rot", "Dach"]);
});

test("unbekannte Tile-IDs werden übersprungen und gültige Tags trotzdem ergänzt", () => {
  const tiles = [{ id: "haus", tags: [] }];
  const result = merge(tiles, response([
    { id: "nicht-mehr-vorhanden", tags: ["neu"] },
    { id: "haus", tags: ["Zuhause"] },
  ]));

  assert.deepEqual(result, { added: 1, unknownTiles: 1 });
  assert.deepEqual(tiles[0].tags, ["Zuhause"]);
});

test("ungültige Tag-Rückmeldungen werden vor Änderungen vollständig abgewiesen", () => {
  const tiles = [{ id: "haus", tags: ["Haus"] }];

  assert.throws(() => merge(tiles, response([
    { id: "haus", tags: ["neu"] },
    { id: "haus", tags: [42] },
  ])), /Tags müssen Text/);
  assert.deepEqual(tiles[0].tags, ["Haus"]);
  assert.throws(() => merge(tiles, { format: "anderes-format", version: 1, tiles: [] }), /keine gültige Tag-Rückmeldung/);
});
