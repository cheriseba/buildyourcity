// Wandelt das Tile-Manifest in die von Palette und Bildverwaltung genutzten Listen um.
function buildTileDefs(manifest) {
  const data = manifest || { root: "Katalog", meadow: null, categories: [] };
  const url = (relativePath) => [data.root, ...relativePath.split("/")].map(encodeURIComponent).join("/");
  const imagePath = (tile, category = "") => tile.assetPath || [tile.category || category, tile.file].filter(Boolean).join("/");
  const defs = [];
  const categories = [];

  if (data.meadow) {
    defs.push({ ...data.meadow, category: "", url: url(imagePath(data.meadow)) + (data.meadow.hash ? `?v=${data.meadow.hash}` : "") });
  }

  for (const category of data.categories) {
    if (!category.tiles.length) continue;
    const indices = category.tiles.map((tile) => defs.push({ ...tile, category: category.name, url: url(imagePath(tile, category.name)) + (tile.hash ? `?v=${tile.hash}` : "") }) - 1);
    const firstTile = defs[indices[0]];
    categories.push({
      name: category.name, indices,
      iconUrl: category.icon ? url(category.icon) : firstTile.url,
    });
  }

  return { tileDefs: defs, tileCategories: categories };
}

  async function loadTileCatalog() {
    const response = await fetch("daten/tile-catalog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Tile-Katalog: HTTP ${response.status}`);
    const catalog = await response.json();
    if (catalog.version !== 1 || !Array.isArray(catalog.tiles) || !Array.isArray(catalog.profiles)) {
      throw new Error("Tile-Katalog hat ein unbekanntes Format");
    }
    const issues = [];
    const counts = new Map();
    const paths = new Map();
    const aliases = new Map();
    for (const tile of catalog.tiles) if (tile && typeof tile === "object") counts.set(tile.id, (counts.get(tile.id) || 0) + 1);
    for (const tile of catalog.tiles) {
      if (!tile || typeof tile !== "object") continue;
      const path = TileCatalogModel.assetPathOf(tile).toLowerCase();
      paths.set(path, (paths.get(path) || 0) + 1);
      if (Array.isArray(tile.legacyIds)) for (const alias of new Set(tile.legacyIds)) aliases.set(alias, (aliases.get(alias) || 0) + 1);
    }
    const known = new Map(catalog.tiles.filter((tile) => tile && typeof tile === "object").map((tile) => [tile.id, tile]));
    const candidates = [];
    for (const tile of catalog.tiles) {
      const errors = TileCatalogModel.validateTile(tile, catalog.profiles, known);
      if (tile && counts.get(tile.id) !== 1) errors.push("Tile-ID ist nicht eindeutig");
      if (tile && paths.get(TileCatalogModel.assetPathOf(tile).toLowerCase()) !== 1) errors.push("Bildpfad ist nicht eindeutig");
      if (tile && Array.isArray(tile.legacyIds) && tile.legacyIds.some((id) => aliases.get(id) !== 1)) errors.push("Alte Tile-ID ist nicht eindeutig");
      if (errors.length) issues.push(`${tile && tile.category || "(ohne Kategorie)"}/${tile && tile.file || "?"}: ${errors.join(", ")}`);
      else candidates.push(tile);
    }
    const checked = await Promise.all(candidates.map(async (tile) => {
      const imagePath = TileCatalogModel.encodedAssetPath(tile);
      try {
        const result = await fetch(`Katalog/${imagePath}?tile-check=1`, { cache: "no-cache" });
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        const bytes = await result.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
        if (hash !== tile.hash) throw new Error("Bildinhalt geaendert; bitte in der Tile-Werkstatt pruefen");
        const bitmap = await createImageBitmap(new Blob([bytes]));
        bitmap.close();
        return tile;
      } catch (error) {
        issues.push(`${imagePath}: ${error.message}`);
        return null;
      }
    }));
    let valid = checked.filter(Boolean);
    // Invalid dependencies cannot silently turn a restrictive ground into an unrestricted one.
    let changed;
    do {
      const validIds = new Set(valid.map((tile) => tile.id));
      changed = false;
      valid = valid.filter((tile) => {
        const rules = TileCatalogModel.resolveRules(tile, catalog.profiles);
        if (rules.allowed && rules.allowed.some((id) => !validIds.has(id))) {
          issues.push(`${tile.category}/${tile.file}: erlaubtes OVER nicht verfuegbar`);
          changed = true;
          return false;
        }
        return true;
      });
    } while (changed);
    const meadow = valid.find((tile) => tile.category === "");
    if (!meadow) throw new Error("Die Wiese fehlt oder ist ungueltig. Ohne Wiese kann das Spielfeld nicht erstellt werden.");
    for (const tile of valid.filter((item) => item.category === "" && item !== meadow)) {
      issues.push(`${tile.file}: Nur die Wiese darf im Hauptordner liegen; bitte einer Kategorie zuordnen`);
    }
    const categories = [];
    const folders = Array.isArray(catalog.folders) ? [...catalog.folders].sort((a, b) => a.order - b.order) : [];
    for (const folder of folders) {
      const tiles = valid.filter((tile) => tile.category === folder.name);
      if (!tiles.length) continue;
      categories.push({
        name: folder.name,
        icon: folder.icon || null,
        tiles: tiles.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      });
    }
    for (const name of new Set(valid.filter((tile) => tile.category !== "").map((tile) => tile.category))) {
      if (categories.some((category) => category.name === name)) continue;
      categories.push({
        name, icon: null,
        tiles: valid.filter((tile) => tile.category === name).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      });
    }
    await Promise.all(categories.map(async (category) => {
      if (!category.icon) {
        const legacyPath = `${category.name}/ICON.png`;
        try {
          if ((await fetch(["Katalog", ...legacyPath.split("/")].map(encodeURIComponent).join("/"), { method: "HEAD" })).ok) {
            category.icon = legacyPath;
          }
        } catch (error) { console.warn(`Kategorie-Icon ${category.name}:`, error); }
      }
    }));
    let layout = [];
    const layoutResponse = await fetch("csv/start-layout.csv", { cache: "no-cache" });
    if (layoutResponse.ok) {
      layout = parseCsvTable(await layoutResponse.text()).map((row) => ({
        category: row.kategorie, file: row.dateiname || row.datei,
        gx: Number.parseInt(row.gx, 10), gy: Number.parseInt(row.gy, 10),
        fixed: /^(fix|fest|ja|1|true)$/i.test(row.fix || ""),
      })).filter((row) => Number.isInteger(row.gx) && Number.isInteger(row.gy));
    } else console.warn(`Startlayout nicht geladen: HTTP ${layoutResponse.status}`);
    return { root: "Katalog", meadow, categories, layout, issues, profiles: catalog.profiles };
  }

  function installCatalogRules(defs, profiles) {
    const allowed = new Map();
    const excluded = new Map();
    const half = new Map();
    const walks = new Map();
    const byId = new Map(defs.map((def) => [def.id, def]));
    for (const def of defs) {
      const rules = TileCatalogModel.resolveRules(def, profiles);
      const key = overRuleKey(def);
      if (rules.half) half.set(key, rules.half);
      if (rules.allowed) allowed.set(key, new Set(rules.allowed.map((id) => overRuleKey(byId.get(id)))));
      if (rules.excluded && rules.excluded.length) excluded.set(key, new Set(rules.excluded.map((id) => overRuleKey(byId.get(id)))));
      if (rules.walk) walks.set(def.id, rules.walk.map((row) => ({
        level: row.level,
        dirs: Object.fromEntries(Object.entries(row.dirs).map(([dir, value]) => [dir, parseWalkValue(value).value])),
      })));
    }
    overRules = { allowed, excluded, half };
    walkRules = walks;
  }
