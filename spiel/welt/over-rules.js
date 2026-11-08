// Platzierungsregeln; das Spiel befuellt sie aus dem zentralen Tile-Katalog.
let overRules = { allowed: new Map(), half: new Map() };

function overRuleKey(def) {
  return `${def.category.toLowerCase()}/${def.file.toLowerCase()}`;
}

function overRuleRows(text, filename, columns) {
  const header = (parseCsv(text)[0] || []).map((value) => value.trim().toLowerCase());
  if (!columns.every((name) => header.includes(name))) {
    throw new Error(`${filename}: Spaltenkopf fehlt oder ist ungueltig`);
  }
  return parseCsvTable(text);
}

function parseOverRules(text, defs) {
  const filename = "tiles-over-regeln.csv";
  const known = new Map(defs.map((def) => [overRuleKey(def), def]));
  const allowed = new Map();
  const rows = overRuleRows(text, filename, ["kategorie", "dateiname", "over-kategorie", "over-dateiname"]);

  for (const [index, row] of rows.entries()) {
    const key = `${(row.kategorie || "").toLowerCase()}/${(row.dateiname || "").toLowerCase()}`;
    const def = known.get(key);
    const overKey = `${(row["over-kategorie"] || "").toLowerCase()}/${(row["over-dateiname"] || "").toLowerCase()}`;
    const over = known.get(overKey);
    if (!def || def.type !== "UNDER" || !over || over.type !== "OVER") {
      throw new Error(`${filename}, Zeile ${index + 2}: Regel braucht ein vorhandenes UNDER und ein vorhandenes OVER`);
    }
    if (!allowed.has(key)) allowed.set(key, new Set());
    allowed.get(key).add(overKey);
  }
  return allowed;
}

function parseHalfOverRules(text, defs) {
  const filename = "tiles-over-halb.csv";
  const known = new Map(defs.map((def) => [overRuleKey(def), def]));
  const half = new Map();
  const rows = overRuleRows(text, filename, ["kategorie", "dateiname", "position"]);

  for (const [index, row] of rows.entries()) {
    const key = `${(row.kategorie || "").toLowerCase()}/${(row.dateiname || "").toLowerCase()}`;
    const def = known.get(key);
    const position = (row.position || "").toLowerCase();
    if (!def || def.type !== "OVER" || !["vorn", "hinten"].includes(position) || half.has(key)) {
      throw new Error(`${filename}, Zeile ${index + 2}: Regel braucht ein vorhandenes OVER und eine eindeutige Position (vorn/hinten)`);
    }
    half.set(key, position);
  }
  return half;
}

async function loadOverRules() {
  const load = async (filename) => {
    const response = await fetch(`csv/archiv/${filename}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`${filename}: ${response.status}`);
    return response.text();
  };
  const [allowedText, halfText] = await Promise.all([load("tiles-over-regeln.csv"), load("tiles-over-halb.csv")]);
  overRules = {
    allowed: parseOverRules(allowedText, tileDefs),
    half: parseHalfOverRules(halfText, tileDefs),
  };
}

function halfOverPosition(image) {
  const def = defOfImage(image);
  return def ? overRules.half.get(overRuleKey(def)) : undefined;
}

function isOverAllowed(ground, overlay) {
  const groundDef = defOfImage(ground);
  const overDef = defOfImage(overlay);
  const allowed = groundDef && overRules.allowed.get(overRuleKey(groundDef));
  return !allowed || Boolean(overDef && allowed.has(overRuleKey(overDef)));
}
