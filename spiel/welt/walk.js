// Laufregeln aus dem zentralen Tile-Katalog.
// Pro Zelle und Laufrichtung gibt es eine Liste von Optionen { e, x }: Hoehe am Eingang (e) und am Ausgang (x)
// der Zelle. Die Hoehe in der Zellmitte ist der Mittelwert. Eine Bewegung von A nach B ist nur erlaubt, wenn der
// Charakter auf der Mittelhoehe einer Option von A steht und der Ausgang von A zum Eingang einer Option von B passt.
// Dadurch gibt es kein Runterspringen und kein Hochspringen; nur Rampen (z. B. 0>1) ueberbruecken Hoehen.

const WALK_DIRS = {
  "up-right": { col: "W", dx: 0, dy: -1 },
  "up-left": { col: "A", dx: -1, dy: 0 },
  "down-left": { col: "S", dx: 0, dy: 1 },
  "down-right": { col: "D", dx: 1, dy: 0 }
};
const WALK_EPS = 0.01;
const FLAT_OPTION = { e: 0, x: 0 };

// Dateiname (klein) -> Liste von { level, dirs: { W, A, S, D } }; dirs-Werte: null (gesperrt) oder { e, x }
let walkRules = new Map();
let defByImage = null;

function parseWalkValue(text) {
  const value = String(text || "").trim();
  if (value === "" || value === "-") {
    return { ok: true, value: null };
  }
  const match = value.match(/^(-?\d+(?:[.,]\d+)?)(?:\s*>\s*(-?\d+(?:[.,]\d+)?))?$/);
  if (!match) {
    return { ok: false, value: null };
  }
  const num = (s) => Number.parseFloat(s.replace(",", "."));
  const e = num(match[1]);
  return { ok: true, value: { e, x: match[2] !== undefined ? num(match[2]) : e } };
}

// Fehlerhafte Zeilen (von Hand gepflegt) werden uebersprungen und in der Konsole gemeldet.
function parseWalkRules(text) {
  const rules = new Map();
  const rows = parseCsv(text);
  rows.shift();

  for (const row of rows) {
    const cells = row.map((c) => c.trim());
    const file = cells[0];
    const level = (cells[1] || "").toLowerCase();

    if (!file || (level !== "unten" && level !== "oben")) {
      console.warn("tiles-walk.csv: Zeile uebersprungen (Ebene muss 'unten' oder 'oben' sein)", cells);
      continue;
    }

    const dirs = {};
    let valid = true;
    ["W", "A", "S", "D"].forEach((col, i) => {
      const parsed = parseWalkValue(cells[2 + i]);
      valid = valid && parsed.ok;
      dirs[col] = parsed.value;
    });

    if (!valid) {
      console.warn("tiles-walk.csv: Zeile uebersprungen (ungueltiger Wert)", cells);
      continue;
    }

    const key = file.toLowerCase();
    if (!rules.has(key)) {
      rules.set(key, []);
    }
    rules.get(key).push({ level, dirs });
  }

  return rules;
}

async function loadWalkRules() {
  try {
    const response = await fetch("csv/archiv/tiles-walk.csv", { cache: "no-cache" });
    walkRules = response.ok ? parseWalkRules(await response.text()) : new Map();
  } catch (error) {
    console.warn("tiles-walk.csv konnte nicht geladen werden; es gelten die Standardregeln", error);
    walkRules = new Map();
  }
}

function defOfImage(image) {
  if (!defByImage || defByImage.size === 0) {
    defByImage = new Map();
    img.forEach((im, i) => defByImage.set(im, tileDefs[i]));
  }
  return defByImage.get(image);
}

function imageWalkRules(image) {
  const def = image ? defOfImage(image) : null;
  return def ? walkRules.get(def.id || def.file.toLowerCase()) || null : null;
}

function rulesOptions(rules, col) {
  return rules.map((r) => r.dirs[col]).filter(Boolean);
}

const optionCenter = (o) => (o.e + o.x) / 2;
const isFlatOption = (o) => Math.abs(o.e) < WALK_EPS && Math.abs(o.x) < WALK_EPS;

// Optionen, die man in der Zelle in Richtung dir (WALK_DIRS-Eintrag) hat.
function walkOptions(cell, dir) {
  if (!cell) {
    return [];
  }

  if (cell.owner) {
    const rules = imageWalkRules(cell.owner.image);
    return rules ? rulesOptions(rules, dir.col) : [];
  }

  const groundRules = imageWalkRules(cell.ground);
  const ground = groundRules ? rulesOptions(groundRules, dir.col) : cell.groundType === "UNDER" ? [FLAT_OPTION] : [];

  if (!cell.overlay) {
    return ground;
  }

  // Overlay (z. B. Bruecke): nur mit eigener Regel begehbar; auf Bodenhoehe muss auch der Boden darunter begehbar sein.
  const groundFlat = ground.some(isFlatOption);
  const options = cell.overlays().map((overlay) => {
    const rules = imageWalkRules(overlay);
    return rules ? rulesOptions(rules, dir.col) : [];
  });
  return options[0].filter((o) =>
    (!isFlatOption(o) || groundFlat) &&
    options.slice(1).every((other) => other.some((p) => Math.abs(o.e - p.e) < WALK_EPS && Math.abs(o.x - p.x) < WALK_EPS))
  );
}

// Kann der Charakter auf Bodenhoehe in dieser Zelle stehen (Spawn, Nachbarpruefung)?
function canStandOnGround(cell) {
  return Object.values(WALK_DIRS).some((dir) => walkOptions(cell, dir).some((o) => Math.abs(optionCenter(o)) < WALK_EPS));
}

function hasElevatedWalkOptions(image) {
  const rules = imageWalkRules(image);
  return Boolean(rules && rules.some((rule) =>
    Object.values(rule.dirs).some((option) => option && !isFlatOption(option))
  ));
}

function hasUpperWalkLayer(image) {
  const rules = imageWalkRules(image);
  return Boolean(rules && rules.some((rule) => rule.level === "oben"));
}

// Ergebnis { fromH, toH } fuer einen Schritt von (gx, gy) in Richtung dir bei Hoehe height, sonst null.
function planWalkStep(gx, gy, dir, height) {
  const from = board.get(gx, gy);
  const to = board.get(gx + dir.dx, gy + dir.dy);
  if (!from || !to) {
    return null;
  }

  const starts = walkOptions(from, dir).filter((o) => Math.abs(optionCenter(o) - height) < WALK_EPS);
  const ends = walkOptions(to, dir);

  for (const a of starts) {
    const b = ends.find((o) => Math.abs(o.e - a.x) < WALK_EPS);
    if (b) {
      return { fromH: optionCenter(a), toH: optionCenter(b) };
    }
  }
  return null;
}

// Zellen, deren Overlay den Charakter verdecken soll (er laeuft auf Bodenhoehe unter einer Bruecke).
function coveringCells(gx, gy, height) {
  if (height > 0.005) {
    return [];
  }

  const xs = new Set([Math.floor(gx + 1e-6), Math.ceil(gx - 1e-6)]);
  const ys = new Set([Math.floor(gy + 1e-6), Math.ceil(gy - 1e-6)]);
  const result = [];
  for (const x of xs) {
    for (const y of ys) {
      const cell = board.get(x, y);
      if (
        cell &&
        cell.overlay &&
        !cell.owner &&
        cell.overlays().some((overlay) => hasElevatedWalkOptions(overlay) || hasUpperWalkLayer(overlay)) &&
        canStandOnGround(cell)
      ) {
        result.push(cell);
      }
    }
  }
  return result;
}

// ---- Spawn ----
// Bevorzugte Spawn-Boeden nach Kategorie (Tier 0 = beste). Die Strafe in px wird zur Entfernung zur Bildschirmmitte
// addiert: ein Weg, der weit weg liegt, verliert also gegen eine Strasse direkt in der Mitte.
const SPAWN_TIER_PENALTY = [0, 250, 700];
const SPAWN_MIN_REACHABLE = 25; // so viele Positionen muss man von dort aus erreichen koennen, sonst ist man "stuck"

function spawnTier(cell) {
  const def = cell.ground ? defOfImage(cell.ground) : null;
  const category = def ? def.category : "";
  if (/Wege/i.test(category)) {
    return 0;
  }
  if (/Strassen|Boden/i.test(category)) { // inkl. Stadtboden
    return 1;
  }
  return 2;
}

// Anzahl erreichbarer Positionen (Zelle + Hoehe) ab Bodenhoehe, bei limit abgebrochen.
function reachableCount(cell, limit) {
  const seen = new Set([`${cell.gx},${cell.gy},0`]);
  const queue = [{ gx: cell.gx, gy: cell.gy, h: 0 }];

  for (let i = 0; i < queue.length && seen.size < limit; i++) {
    const cur = queue[i];
    for (const dir of Object.values(WALK_DIRS)) {
      const step = planWalkStep(cur.gx, cur.gy, dir, cur.h);
      if (!step) {
        continue;
      }
      const next = { gx: cur.gx + dir.dx, gy: cur.gy + dir.dy, h: step.toH };
      const key = `${next.gx},${next.gy},${Math.round(next.h * 100)}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return seen.size;
}

// Bester Spawn: begehbar, nicht eingesperrt, nach Kategorie und Naehe zur Mitte (centerX/Y in Weltkoordinaten) bewertet.
// avoid: Zellen (Position und fruehere Spawns), die ausgelassen werden (Respawn).
function pickSpawnCell(centerX, centerY, avoid = []) {
  const candidates = [];
  for (const cell of board.cells.values()) {
    if (!canStandOnGround(cell) || avoid.some((a) => Math.abs(a.gx - cell.gx) + Math.abs(a.gy - cell.gy) <= 4)) {
      continue;
    }
    const dist = Math.hypot(cell.x + CELL_CENTER_X - centerX, cell.y + CELL_CENTER_Y - centerY);
    candidates.push({ cell, score: dist + SPAWN_TIER_PENALTY[spawnTier(cell)] });
  }
  candidates.sort((a, b) => a.score - b.score);

  let fallback = null;
  for (const { cell } of candidates) {
    const reach = reachableCount(cell, SPAWN_MIN_REACHABLE);
    if (reach >= SPAWN_MIN_REACHABLE) {
      return cell;
    }
    if (reach > 1 && !fallback) {
      fallback = cell;
    }
  }
  return fallback || (candidates[0] && candidates[0].cell) || null;
}
