// Minimaler CSV-Parser (Komma oder Semikolon, Anfuehrungszeichen, BOM).
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  // Google Sheets exportiert mit Komma, deutsches Excel mit Semikolon
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Liefert die Zeilen als Objekte; Spaltennamen kleingeschrieben, ohne Umlaut-Varianten-Probleme.
function parseCsvTable(text) {
  const rows = parseCsv(text);
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name, (row[i] || "").trim()])));
}

// Laedt tiles-tags.csv und start-layout.csv und baut daraus das Manifest.
// Eine Zeile pro Tile; Kategorie leer = Wiese (liegt direkt in tiles_sortiert/).
async function loadManifest() {
  const root = "tiles_sortiert";
  const fetchText = async (url, optional) => {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      if (optional) {
        return "";
      }
      throw new Error(`${url}: ${response.status}`);
    }
    return response.text();
  };

  const [tagsText, layoutText] = await Promise.all([fetchText("tiles-tags.csv", false), fetchText("start-layout.csv", true)]);
  const pick = (r, ...names) => names.map((n) => r[n]).find((v) => v !== undefined) || "";
  const TYPES = ["OVER", "UNDER", "FULL"];
  let meadow = null;
  const categories = [];

  for (const r of parseCsvTable(tagsText)) {
    const category = pick(r, "kategorie");
    const file = pick(r, "dateiname", "datei");
    if (!file) {
      continue;
    }

    const suffix = file.replace(/\.[^.]+$/, "").match(/_(UNDER|OVER)$/i);
    const type = pick(r, "type", "typ").toUpperCase();
    const size = pick(r, "größe", "groesse", "grosse", "size").toLowerCase();
    const [w, h] = /^\d+x\d+$/.test(size) ? size.split("x").map(Number) : [1, 1];
    const tile = {
      file,
      w: Math.max(1, w),
      h: Math.max(1, h),
      name: file.replace(/\.[^.]+$/, "").replace(/_(UNDER|OVER)$/i, ""),
      type: TYPES.includes(type) ? type : suffix ? suffix[1].toUpperCase() : "FULL",
      tags: pick(r, "tags").split(/[,;]/).map((t) => t.trim()).filter(Boolean),
    };

    if (!category) {
      meadow = meadow || tile;
      continue;
    }

    let entry = categories.find((c) => c.name === category);
    if (!entry) {
      entry = { name: category, icon: null, tiles: [] };
      categories.push(entry);
    }
    entry.tiles.push(tile);
  }

  // ICON.png je Kategorie pruefen, sonst dient das erste Tile als Icon
  await Promise.all(
    categories.map(async (category) => {
      const url = [root, category.name, "ICON.png"].map(encodeURIComponent).join("/");
      try {
        category.icon = (await fetch(url, { method: "HEAD" })).ok ? "ICON.png" : null;
      } catch (error) {
        category.icon = null;
      }
    })
  );

  const layout = [];
  for (const r of parseCsvTable(layoutText)) {
    const gx = Number.parseInt(r.gx, 10);
    const gy = Number.parseInt(r.gy, 10);
    const category = pick(r, "kategorie");
    const file = pick(r, "dateiname", "datei");
    const known = categories.some((c) => c.name === category && c.tiles.some((t) => t.file === file));

    if (known && !Number.isNaN(gx) && !Number.isNaN(gy)) {
      layout.push({ category, file, gx, gy, fixed: /^(fix|fest|ja|1|true)$/i.test(pick(r, "fix")) });
    } else {
      console.warn("start-layout.csv: Zeile uebersprungen", r);
    }
  }

  return { root, meadow, categories, layout };
}
