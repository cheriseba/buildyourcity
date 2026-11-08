const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { scanTileImages, compareInventory } = require("./tile-inventory");

const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "daten", "tile-catalog.json");
const assetRoot = path.join(root, "Katalog");
const port = Number(process.env.TILE_WORKSHOP_PORT || 8766);
const token = crypto.randomBytes(24).toString("hex");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".gif": "image/gif" };

function respond(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
async function state() {
  const raw = await fs.readFile(catalogPath, "utf8");
  const catalog = JSON.parse(raw);
  if (catalog.version !== 1 || !Array.isArray(catalog.tiles) || !Array.isArray(catalog.profiles)) throw new Error("Ungueltiger Katalog");
  const previous = catalog.tiles.map((tile) => ({
    path: tile.category ? `${tile.category}/${tile.file}` : tile.file, hash: tile.hash, id: tile.id,
  }));
  const current = await scanTileImages(assetRoot);
  return { catalog, inventory: compareInventory(previous, current), revision: crypto.createHash("sha256").update(raw).digest("hex") };
}
async function handle(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/api/state") {
    const data = await state();
    return respond(res, 200, { ...data, token });
  }
  if (req.method === "POST" && url.pathname === "/api/save") {
    if (req.headers.origin !== `http://127.0.0.1:${port}` || req.headers["x-workshop-token"] !== token) return respond(res, 403, { error: "Zugriff verweigert" });
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 5_000_000) return respond(res, 413, { error: "Daten zu gross" });
    }
    const input = JSON.parse(body);
    const current = await state();
    if (input.revision !== current.revision) return respond(res, 409, { error: "Katalog wurde zwischenzeitlich geaendert. Bitte neu laden." });
    const catalog = input.catalog;
    if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.tiles) || !Array.isArray(catalog.profiles)) return respond(res, 400, { error: "Ungueltiger Katalog" });
    const ids = new Set();
    const paths = new Set();
    for (const tile of catalog.tiles) {
      const tilePath = tile.category ? `${tile.category}/${tile.file}` : tile.file;
      if (!tile.id || ids.has(tile.id) || paths.has(tilePath.toLowerCase())) return respond(res, 400, { error: `Doppelte ID oder Dateipfad: ${tilePath}` });
      ids.add(tile.id);
      paths.add(tilePath.toLowerCase());
    }
    const temp = `${catalogPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(catalog, null, 2) + "\n", { flag: "wx" });
      await fs.rename(temp, catalogPath);
    } finally {
      await fs.rm(temp, { force: true });
    }
    return respond(res, 200, { ok: true });
  }
  if (req.method !== "GET") return respond(res, 405, { error: "Methode nicht erlaubt" });
  const files = {
    "/": "tools/workshop/index.html",
    "/workshop.js": "tools/workshop/workshop.js",
    "/workshop.css": "tools/workshop/workshop.css",
    "/tile-catalog-model.js": "gemeinsam/tile-catalog-model.js",
  };
  let file;
  if (files[url.pathname]) file = path.join(root, files[url.pathname]);
  else if (url.pathname.startsWith("/assets/")) {
    const relative = decodeURIComponent(url.pathname.slice("/assets/".length));
    file = path.resolve(assetRoot, relative);
    if (!file.startsWith(assetRoot + path.sep) || !/\.(png|gif)$/i.test(file)) return respond(res, 403, { error: "Ungueltiger Pfad" });
  } else return respond(res, 404, { error: "Nicht gefunden" });
  const data = await fs.readFile(file);
  return respond(res, 200, data, types[path.extname(file).toLowerCase()] || "application/octet-stream");
}

http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    if (error.code !== "ENOENT") console.error(error);
    if (!res.headersSent) respond(res, error.code === "ENOENT" ? 404 : 500, { error: error.message });
    else res.destroy();
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Tile-Werkstatt: http://127.0.0.1:${port}/`);
  console.log("Mit Strg+C beenden.");
  if (process.argv.includes("--open") && process.platform === "win32") {
    const browser = spawn("cmd.exe", ["/c", `start "" "http://127.0.0.1:${port}/"`], { windowsHide: true, stdio: "ignore" });
    browser.on("error", (error) => console.error("Browser konnte nicht geöffnet werden:", error.message));
    browser.unref();
  }
});
