(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TileTagSharing = api;
})(globalThis, function () {
  "use strict";

  const FORMAT = "nordstadt-tile-tags";

  function merge(catalogTiles, response) {
    if (!response || response.format !== FORMAT || response.version !== 1 || !Array.isArray(response.tiles)) {
      throw new Error("Die Datei ist keine gültige Tag-Rückmeldung aus der Tile-Werkstatt.");
    }

    const tilesById = new Map(catalogTiles.map((tile) => [tile.id, tile]));
    const additionsById = new Map();
    let unknownTiles = 0;

    for (const record of response.tiles) {
      if (!record || typeof record.id !== "string" || !Array.isArray(record.tags)) {
        throw new Error("Die Tag-Rückmeldung enthält einen ungültigen Eintrag.");
      }
      if (!tilesById.has(record.id)) {
        unknownTiles += 1;
        continue;
      }
      for (const value of record.tags) {
        if (typeof value !== "string" || value.length > 120) {
          throw new Error("Tags müssen Text mit höchstens 120 Zeichen sein.");
        }
        const tag = value.trim();
        if (!tag) continue;
        const additions = additionsById.get(record.id) || new Map();
        const key = tag.toLocaleLowerCase();
        if (!additions.has(key)) additions.set(key, tag);
        additionsById.set(record.id, additions);
      }
    }

    let added = 0;
    for (const [id, additions] of additionsById) {
      const tile = tilesById.get(id);
      if (!Array.isArray(tile.tags)) tile.tags = [];
      const existing = new Set((Array.isArray(tile.tags) ? tile.tags : []).map((tag) => tag.toLocaleLowerCase()));
      for (const [key, tag] of additions) {
        if (existing.has(key)) continue;
        tile.tags.push(tag);
        existing.add(key);
        added += 1;
      }
    }
    return { added, unknownTiles };
  }

  return { merge };
});
