// Shared by the game and the local tile workshop.
(function (root) {
  function assetPathOf(tile) {
    if (typeof tile.assetPath === "string" && tile.assetPath) return tile.assetPath;
    return [tile.category, tile.file].filter(Boolean).join("/");
  }

  function encodedAssetPath(tile) {
    return assetPathOf(tile).split("/").map(encodeURIComponent).join("/");
  }

  function resolveRules(tile, profiles) {
    let rules = tile.rules;
    if (tile.profile) {
      const matches = profiles.filter((item) => item && item.id === tile.profile);
      if (matches.length !== 1) throw new Error(`Regelvorlage "${tile.profile}" fehlt oder ist nicht eindeutig`);
      rules = matches[0].rules;
    }

    const allowedOverrides = tile.overrides && tile.overrides.allowed;
    if (!allowedOverrides) return rules;
    const add = allowedOverrides.add || [];
    const remove = allowedOverrides.remove || [];
    if (rules.allowed === null) {
      return { ...rules, excluded: [...new Set(remove)] };
    }
    const removed = new Set(remove);
    return {
      ...rules,
      allowed: [...new Set([...rules.allowed, ...add])].filter((id) => !removed.has(id)),
      excluded: [],
    };
  }

  function validateTile(tile, profiles, known) {
    const errors = [];
    if (!tile || typeof tile !== "object") return ["Tile ist kein Objekt"];
    if (typeof tile.id !== "string" || !tile.id) errors.push("ID fehlt");
    if (typeof tile.name !== "string" || !tile.name.trim()) errors.push("Name fehlt");
    if (typeof tile.hash !== "string" || !/^[0-9a-f]{64}$/.test(tile.hash)) errors.push("Bildpruefsumme fehlt oder ist ungueltig");
    if (!Array.isArray(tile.legacyIds) || tile.legacyIds.some((id) => typeof id !== "string")) errors.push("Ungueltige alte IDs");
    if (typeof tile.category !== "string" || typeof tile.file !== "string" || !tile.file ||
        /[\\/]/.test(tile.file) || tile.category.split("/").some((part) => part === "." || part === ".." || part.includes("\\"))) {
      errors.push("Ungueltiger Bildpfad");
    }
    if (tile.assetPath !== undefined &&
        (typeof tile.assetPath !== "string" || !tile.assetPath || tile.assetPath.startsWith("/") ||
         tile.assetPath.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\")))) {
      errors.push("Ungueltiger Asset-Pfad");
    }
    if (tile.order !== undefined && (!Number.isInteger(tile.order) || tile.order < 0)) errors.push("Ungueltige Tile-Reihenfolge");
    if (!["UNDER", "OVER", "FULL"].includes(tile.type)) errors.push("Ungueltiger Typ");
    if (!Number.isInteger(tile.w) || !Number.isInteger(tile.h) || tile.w < 1 || tile.h < 1 || tile.w > 64 || tile.h > 64) errors.push("Ungueltige Groesse");
    if (tile.type === "OVER" && tile.w * tile.h !== 1) errors.push("OVER muss 1x1 sein");
    if (!Array.isArray(tile.tags) || tile.tags.some((tag) => typeof tag !== "string")) errors.push("Ungueltige Suchbegriffe");
    if (tile.status !== "ready") errors.push("Tile ist noch nicht freigegeben");
    let rules;
    try { rules = resolveRules(tile, profiles); } catch (error) { errors.push(error.message); }
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) return [...errors, "Regeln fehlen"];
    if (![null, "vorn", "hinten"].includes(rules.half)) errors.push("Ungueltige OVER-Position");
    if (rules.half && tile.type !== "OVER") errors.push("Halbe Position nur bei OVER");
    if (rules.allowed !== null) {
      if (tile.type !== "UNDER" || !Array.isArray(rules.allowed)) {
        errors.push("OVER-Auswahl nur fuer UNDER");
      } else if (rules.allowed.some((id) => !known.has(id) || known.get(id).type !== "OVER")) {
        errors.push("Erlaubtes OVER existiert nicht oder hat falschen Typ");
      }
    }
    if (rules.excluded && rules.excluded.some((id) => !known.has(id) || known.get(id).type !== "OVER")) {
      errors.push("Ausgeschlossenes OVER existiert nicht oder hat falschen Typ");
    }
    if (tile.overrides !== undefined) {
      const allowedOverrides = tile.overrides && tile.overrides.allowed;
      if (!tile.overrides || typeof tile.overrides !== "object" || Array.isArray(tile.overrides) ||
          (allowedOverrides !== undefined &&
            (tile.type !== "UNDER" || !allowedOverrides || typeof allowedOverrides !== "object" || Array.isArray(allowedOverrides) ||
             !Array.isArray(allowedOverrides.add) || !Array.isArray(allowedOverrides.remove) ||
             [...allowedOverrides.add, ...allowedOverrides.remove].some((id) =>
               typeof id !== "string" || !known.has(id) || known.get(id).type !== "OVER") ||
             allowedOverrides.add.some((id) => allowedOverrides.remove.includes(id))))) {
        errors.push("Ungueltige tile-spezifische OVER-Sonderregeln");
      }
    }
    if (rules.walk !== null) {
      if (!Array.isArray(rules.walk) || !rules.walk.length) {
        errors.push("Ungueltige Laufregeln");
      } else {
        for (const row of rules.walk) {
          if (!row || !["unten", "oben"].includes(row.level) || !row.dirs ||
              ["W", "A", "S", "D"].some((dir) => typeof row.dirs[dir] !== "string" ||
                !/^(-|-?\d+(?:[.,]\d+)?(?:\s*>\s*-?\d+(?:[.,]\d+)?)?)$/.test(row.dirs[dir].trim()))) {
            errors.push("Ungueltige Laufregel");
          }
        }
      }
    }
    return errors;
  }

  const api = { assetPathOf, encodedAssetPath, resolveRules, validateTile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TileCatalogModel = api;
})(globalThis);
