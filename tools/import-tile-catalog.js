// One-time import of the existing CSV rules; refuses to overwrite a catalog.
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { scanTileImages } = require("./tile-inventory");
const { enrichTileTags } = require("../gemeinsam/tile-keywords");

const root = path.resolve(__dirname, "..");
async function buildCatalog() {
  const source = await fs.readFile(path.join(root, "spiel", "daten", "csv.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const readTable = async (name) => {
    const text = await fs.readFile(path.join(root, "csv", "archiv", name), "utf8");
    return context.parseCsvTable(text);
  };
  const [tags, walk, allowed, half, images] = await Promise.all([
    readTable("tiles-tags.csv"), readTable("tiles-walk.csv"),
    readTable("tiles-over-regeln.csv"), readTable("tiles-over-halb.csv"),
    scanTileImages(path.join(root, "Katalog")),
  ]);
  const files = new Map(images.map((entry) => [entry.path.toLowerCase(), entry]));
  const uniqueTags = new Map();
  for (const row of tags) {
    const key = `${row.kategorie || ""}/${row.dateiname || row.datei}`.toLowerCase();
    if (uniqueTags.has(key)) {
      const previous = uniqueTags.get(key);
      if (previous.type !== row.type || previous["größe"] !== row["größe"]) {
        throw new Error(`Widerspruechliche Tile-Eintraege: ${key}`);
      }
      previous.tags = [previous.tags, row.tags].filter(Boolean).join(",");
      console.warn(`Doppelter Eintrag zusammengefuehrt: ${key}`);
    } else uniqueTags.set(key, row);
  }
  const categoryOrders = new Map();
  const tileOrders = new Map();
  const tiles = [...uniqueTags.values()].map((row) => {
    const category = row.kategorie || "";
    const file = row.dateiname || row.datei;
    const imagePath = category ? `${category}/${file}` : file;
    const image = files.get(imagePath.toLowerCase());
    if (!categoryOrders.has(category)) {
      categoryOrders.set(category, category ? [...categoryOrders.keys()].filter(Boolean).length : Number.MAX_SAFE_INTEGER);
    }
    const order = tileOrders.get(category) || 0;
    tileOrders.set(category, order + 1);
    const size = row["größe"] || row.groesse || row.grosse || row.size || "1x1";
    const match = /^(\d+)x(\d+)$/i.exec(size);
    const suffix = /_(UNDER|OVER)\.[^.]+$/i.exec(file);
    const type = (row.type || row.typ || (suffix ? suffix[1] : "FULL")).toUpperCase();
    const walkRows = walk.filter((item) => item.dateiname.toLowerCase() === file.toLowerCase());
    return {
      id: crypto.randomUUID(), category, file, assetPath: imagePath, order, hash: image ? image.hash : null,
      legacyIds: [`${category}/${file}`], name: file.replace(/\.[^.]+$/, "").replace(/_(UNDER|OVER)$/i, ""),
      type, w: match ? Number(match[1]) : 1, h: match ? Number(match[2]) : 1,
      tags: enrichTileTags(category, file, (row.tags || "").split(/[,;]/).map((tag) => tag.trim()).filter(Boolean)),
      status: image ? "ready" : "missing", profile: null,
      rules: {
        half: (half.find((item) => item.kategorie.toLowerCase() === category.toLowerCase() && item.dateiname.toLowerCase() === file.toLowerCase()) || {}).position || null,
        allowed: null,
        walk: walkRows.length ? walkRows.map((item) => ({
          level: item.ebene.toLowerCase(),
          dirs: Object.fromEntries(["W", "A", "S", "D"].map((dir) => [dir, item[dir.toLowerCase()] || "-"])),
        })) : null,
      },
    };
  });
  const byPath = new Map(tiles.map((tile) => [`${tile.category}/${tile.file}`.toLowerCase(), tile]));
  for (const row of allowed) {
    const under = byPath.get(`${row.kategorie}/${row.dateiname}`.toLowerCase());
    const over = byPath.get(`${row["over-kategorie"]}/${row["over-dateiname"]}`.toLowerCase());
    if (!under || !over) throw new Error(`Ungueltige OVER-Regel: ${JSON.stringify(row)}`);
    if (!under.rules.allowed) under.rules.allowed = [];
    under.rules.allowed.push(over.id);
  }
  const folders = await Promise.all([...categoryOrders].filter(([name]) => name).map(async ([name, order]) => {
    let icon = null;
    try {
      await fs.access(path.join(root, "Katalog", name, "ICON.png"));
      icon = `${name}/ICON.png`;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return { name, order, icon };
  }));
  return { version: 1, profiles: [], folders, tiles };
}

async function importCatalog() {
  const catalog = await buildCatalog();
  await fs.writeFile(path.join(root, "daten", "tile-catalog.json"), JSON.stringify(catalog, null, 2) + "\n", { flag: "wx" });
  console.log(`${catalog.tiles.length} Tiles importiert. CSV-Dateien bleiben als Sicherung erhalten.`);
}

if (require.main === module) importCatalog().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { buildCatalog };
