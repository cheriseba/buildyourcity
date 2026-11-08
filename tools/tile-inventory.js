const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

async function scanTileImages(root) {
  const files = [];
  async function visit(directory, relative) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const current = path.join(directory, entry.name);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(current, name);
      } else if (entry.isFile() && /\.(png|gif)$/i.test(entry.name) && entry.name.toLowerCase() !== "icon.png") {
        const content = await fs.readFile(current);
        files.push({ path: name, hash: crypto.createHash("sha256").update(content).digest("hex") });
      }
    }
  }
  await visit(root, "");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// Exact paths take precedence; changed content always needs an explicit decision.
function compareInventory(previous, current) {
  const oldPaths = new Map(previous.map((item) => [item.path, item]));
  const newPaths = new Map(current.map((item) => [item.path, item]));
  if (oldPaths.size !== previous.length || newPaths.size !== current.length) {
    throw new Error("Doppelte Dateipfade im Inventar");
  }
  const result = [];
  const missing = previous.filter((item) => !newPaths.has(item.path));
  const added = current.filter((item) => !oldPaths.has(item.path));
  const matchingOld = (hash) => missing.filter((item) => item.hash === hash);
  const matchingNew = (hash) => added.filter((item) => item.hash === hash);
  const uniqueHash = (hash) =>
    previous.filter((item) => item.hash === hash).length === 1 &&
    current.filter((item) => item.hash === hash).length === 1;

  for (const item of current) {
    const old = oldPaths.get(item.path);
    if (old) {
      result.push({ status: old.hash === item.hash ? "unchanged" : "changed", current: item, previous: old });
      continue;
    }
    const candidates = matchingOld(item.hash);
    if (candidates.length === 1 && uniqueHash(item.hash)) {
      result.push({ status: "moved", current: item, previous: candidates[0] });
    } else {
      result.push({ status: candidates.length ? "ambiguous" : "new", current: item, candidates });
    }
  }
  for (const item of missing) {
    const matches = matchingNew(item.hash);
    if (!(matches.length === 1 && uniqueHash(item.hash))) {
      result.push({ status: "missing", previous: item, candidates: matches });
    }
  }
  return result;
}

module.exports = { scanTileImages, compareInventory };
