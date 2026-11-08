const $ = (selector) => document.querySelector(selector);
let state;
let selected = null;
let dirty = false;
let checked = new Set();
let reloadArmed = false;

function message(text, error = false) {
  $("#message").textContent = text;
  $("#message").className = error ? "error" : "";
}
function changed() {
  dirty = true;
  reloadArmed = false;
  $("#reload").textContent = "Neu einlesen";
  message("Ungespeicherte Änderungen");
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function button(text, action) {
  const result = node("button", text);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}
function confirmButton(text, confirmText, action) {
  let armed = false;
  const result = button(text, () => {
    if (!armed) { armed = true; result.textContent = confirmText; return; }
    action();
  });
  return result;
}
function option(value, text) {
  const result = node("option", text);
  result.value = value;
  return result;
}
function pathOf(tile) { return tile.category ? `${tile.category}/${tile.file}` : tile.file; }
function assetUrl(path) { return `/assets/${path.split("/").map(encodeURIComponent).join("/")}`; }
function tileFor(entry) { return entry.previous && state.catalog.tiles.find((tile) => tile.id === entry.previous.id); }
function errors(tile) {
  const problems = TileCatalogModel.validateTile(tile, state.catalog.profiles, new Map(state.catalog.tiles.map((item) => [item.id, item])));
  const meadow = state.catalog.tiles.find((item) => item.category === "");
  if (tile.category === "" && meadow && tile.id !== meadow.id) problems.push("Nur die Wiese darf im Hauptordner liegen; bitte das Bild einer Kategorie zuordnen");
  return problems;
}
function status(entry) {
  const tile = tileFor(entry);
  if (entry.status !== "unchanged") return entry.status;
  return tile && errors(tile).length ? "invalid" : "ready";
}
const labels = { ready: "Fertig", invalid: "Regeln prüfen", changed: "Bild geändert", moved: "Verschoben", new: "Neu", missing: "Datei fehlt", ambiguous: "Mehrdeutig" };

async function load(force = false) {
  if (!force && dirty) throw new Error("Ungespeicherte Änderungen; zum Verwerfen erneut auf Neu einlesen klicken.");
  const response = await fetch("/api/state");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  state = result;
  selected = null;
  checked.clear();
  dirty = false;
  render();
  message("Bestand eingelesen. Änderungen zuerst prüfen und anschließend speichern.");
}
function entries() {
  const text = $("#search").value.toLocaleLowerCase();
  const filter = $("#filter").value;
  return state.inventory.filter((entry) => {
    const tile = tileFor(entry);
    const name = (entry.current || entry.previous).path;
    const matches = `${name} ${tile ? `${tile.name} ${tile.tags.join(" ")}` : ""}`.toLocaleLowerCase().includes(text);
    const type = status(entry);
    return matches && (filter === "all" || (filter === "attention" ? type !== "ready" : filter === type));
  });
}
function renderList() {
  const rows = $("#rows");
  rows.replaceChildren();
  const visible = entries();
  $("#count").textContent = `${visible.length} angezeigt · ${state.inventory.filter((entry) => status(entry) !== "ready").length} mit Prüfbedarf`;
  for (const entry of visible) {
    const tile = tileFor(entry);
    const tr = node("tr");
    if (entry === selected) tr.className = "active";
    const selectCell = node("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox"; checkbox.disabled = !tile; checkbox.checked = Boolean(tile && checked.has(tile.id));
    checkbox.setAttribute("aria-label", `${(entry.current || entry.previous).path} auswählen`);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => { if (checkbox.checked) checked.add(tile.id); else checked.delete(tile.id); });
    selectCell.append(checkbox);
    const imageCell = node("td");
    if (entry.current) {
      const image = document.createElement("img"); image.alt = ""; image.src = assetUrl(entry.current.path); imageCell.append(image);
    }
    const nameCell = node("td", tile ? tile.name : (entry.current || entry.previous).path.split("/").pop());
    nameCell.append(node("span", (entry.current || entry.previous).path, "sub"));
    const stateCell = node("td");
    const type = status(entry);
    stateCell.append(node("span", labels[type], `badge${type === "ready" ? "" : type === "invalid" || type === "missing" ? " error" : " warn"}`));
    tr.append(selectCell, imageCell, nameCell, stateCell);
    tr.addEventListener("click", () => { selected = entry; render(); });
    rows.append(tr);
  }
  const select = $("#bulk-profile");
  const previous = select.value;
  select.replaceChildren(option("", "Regelvorlage wählen"));
  state.catalog.profiles.forEach((profile) => select.append(option(profile.id, profile.name)));
  select.value = previous;
}
function field(container, title, element) {
  const label = node("label", title);
  label.append(element);
  container.append(label);
  return element;
}
function input(value, update, type = "text") {
  const element = document.createElement("input");
  element.type = type; element.value = value;
  element.addEventListener("input", () => { update(element.value); changed(); renderList(); });
  return element;
}
function selectField(value, values, update) {
  const element = document.createElement("select");
  values.forEach(([id, name]) => element.append(option(id, name)));
  element.value = value;
  element.addEventListener("change", () => { update(element.value); changed(); render(); });
  return element;
}
function makeNew(entry) {
  const parts = entry.current.path.split("/");
  const file = parts.pop();
  const tile = {
    id: crypto.randomUUID(), category: parts.join("/"), file, hash: entry.current.hash,
    legacyIds: [], name: file.replace(/\.[^.]+$/, ""), type: "FULL", w: 1, h: 1,
    tags: [], status: "draft", profile: null, rules: { half: null, allowed: null, walk: null },
  };
  state.catalog.tiles.push(tile);
  entry.previous = { path: entry.current.path, hash: entry.current.hash, id: tile.id };
  entry.status = "unchanged";
  changed(); render();
}
function moveTile(tile, entry) {
  const old = pathOf(tile);
  const parts = entry.current.path.split("/");
  tile.file = parts.pop(); tile.category = parts.join("/"); tile.hash = entry.current.hash;
  if (!tile.legacyIds.includes(old)) tile.legacyIds.push(old);
  entry.previous = { path: entry.current.path, hash: tile.hash, id: tile.id };
  entry.status = "unchanged";
  state.inventory = state.inventory.filter((item) => item === entry || !(item.status === "missing" && item.previous.id === tile.id));
  changed(); render();
}
function renderDetail() {
  const detail = $("#detail"); detail.replaceChildren();
  if (!selected) { detail.append(node("p", "Wähle ein Tile aus, um seine Eigenschaften zu bearbeiten.")); return; }
  let tile = tileFor(selected);
  detail.append(node("h2", (selected.current || selected.previous).path));
  if (selected.status !== "unchanged") {
    const box = node("div", undefined, "notice");
    const descriptions = {
      new: "Neue Datei: zuerst als neues Tile anlegen.",
      changed: "Der Bildinhalt hat sich geändert. Entscheide, ob es dasselbe Tile oder ein neues Objekt ist.",
      moved: `Identischer Bildinhalt wurde zuvor unter ${selected.previous ? selected.previous.path : "einem anderen Pfad"} gefunden. Bitte Zuordnung bestätigen.`,
      ambiguous: "Der Bildinhalt ist mehrfach vorhanden. Die Zuordnung ist nicht eindeutig.",
      missing: "Diese Datei fehlt. Bestehende Regeln bleiben erhalten, bis du sie zuordnest oder entfernst.",
    };
    box.append(node("p", descriptions[selected.status]));
    if (selected.status === "new") box.append(button("Als neues Tile anlegen", () => makeNew(selected)));
    if (selected.status === "changed" && tile) {
      box.append(button("Gleiches Tile – Bild bestätigen", () => {
        tile.hash = selected.current.hash; selected.previous.hash = tile.hash; selected.status = "unchanged"; changed(); render();
      }));
      box.append(confirmButton("Anderes Tile – neu anlegen", "Bestätigen: altes Tile entfernen", () => {
        state.catalog.tiles = state.catalog.tiles.filter((item) => item.id !== tile.id);
        selected.previous = null; makeNew(selected);
      }));
      box.append(node("p", "Ein neues Tile erhält keine alten Regeln. Alte Spielstände können das bisherige Tile dann nicht mehr zuordnen.", "hint"));
    }
    if (selected.status === "moved" && tile) box.append(button("Verschiebung bestätigen", () => moveTile(tile, selected)));
    if (selected.status === "ambiguous") {
      box.append(button("Als neues Tile anlegen", () => makeNew(selected)));
      for (const candidate of selected.candidates || []) {
        const old = state.catalog.tiles.find((item) => item.id === candidate.id);
        if (old) box.append(button(`Zuordnen: ${candidate.path}`, () => moveTile(old, selected)));
      }
    }
    if (selected.status === "new" || selected.status === "ambiguous") {
      const missing = state.inventory.filter((item) => item.status === "missing" && tileFor(item));
      if (missing.length) {
        const choices = document.createElement("select");
        choices.append(option("", "Fehlendes Tile auswählen"));
        missing.forEach((item) => choices.append(option(item.previous.id, item.previous.path)));
        field(box, "Manuell einem fehlenden Tile zuordnen", choices);
        box.append(button("Zuordnung übernehmen", () => {
          const original = state.catalog.tiles.find((item) => item.id === choices.value);
          if (!original) { message("Bitte ein fehlendes Tile auswählen.", true); return; }
          moveTile(original, selected);
        }));
        box.append(node("p", "Auch bei geändertem Bild möglich. Die alte Identität und ihre Regeln bleiben dabei erhalten.", "hint"));
      }
    }
    if (selected.status === "missing" && tile) {
      box.append(confirmButton("Fehlendes Tile entfernen", "Bestätigen: Tile entfernen", () => {
        state.catalog.tiles = state.catalog.tiles.filter((item) => item.id !== tile.id);
        state.inventory = state.inventory.filter((item) => item !== selected);
        checked.delete(tile.id); selected = null; changed(); render();
      }));
      box.append(node("p", "Nach dem Entfernen müssen verknüpfte Regeln und Spielstände geprüft werden.", "hint"));
    }
    detail.append(box);
  }
  if (!tile) return;
  const form = node("div");
  field(form, "Anzeigename", input(tile.name, (value) => { tile.name = value; }));
  const grid = node("div", undefined, "grid");
  field(grid, "Typ", selectField(tile.type, [["UNDER", "Boden (UNDER)"], ["OVER", "Objekt (OVER)"], ["FULL", "Vollständig (FULL)"]], (value) => { tile.type = value; }));
  field(grid, "Status", selectField(tile.status, [["draft", "Noch prüfen"], ["ready", "Freigegeben"]], (value) => { tile.status = value; }));
  field(grid, "Breite in Zellen", input(tile.w, (value) => { tile.w = Number(value); }, "number"));
  field(grid, "Tiefe in Zellen", input(tile.h, (value) => { tile.h = Number(value); }, "number"));
  form.append(grid);
  field(form, "Suchbegriffe (mit Komma trennen)", input(tile.tags.join(", "), (value) => { tile.tags = value.split(",").map((tag) => tag.trim()).filter(Boolean); }));
  const profiles = [["", "Eigene Regeln"], ...state.catalog.profiles.map((profile) => [profile.id, profile.name])];
  field(form, "Regelvorlage", selectField(tile.profile || "", profiles, (value) => {
    if (!value && tile.profile) {
      const profile = state.catalog.profiles.find((item) => item.id === tile.profile);
      if (profile) tile.rules = structuredClone(profile.rules);
    }
    tile.profile = value || null;
  }));
  const profileName = document.createElement("input");
  profileName.placeholder = "z. B. Bäume";
  field(form, "Name für neue Regelvorlage", profileName);
  form.append(button("Aktuelle Regeln als Vorlage speichern", () => {
    const name = profileName.value.trim();
    if (!name) { message("Bitte zuerst einen Namen für die Regelvorlage eingeben.", true); return; }
    const profile = { id: crypto.randomUUID(), name, rules: structuredClone(TileCatalogModel.resolveRules(tile, state.catalog.profiles)) };
    state.catalog.profiles.push(profile); tile.profile = profile.id; changed(); render();
  }));
  let rules;
  try { rules = TileCatalogModel.resolveRules(tile, state.catalog.profiles); }
  catch (error) { form.append(node("p", error.message, "notice")); detail.append(form); return; }
  if (tile.profile) form.append(node("p", "Diese Regeln gehören zur Vorlage. Änderungen gelten für alle zugeordneten Tiles.", "notice"));
  if (tile.type === "OVER") {
    field(form, "OVER-Position", selectField(rules.half || "", [["", "Ganzes Overlay"], ["vorn", "Halb: vorn"], ["hinten", "Halb: hinten"]], (value) => { rules.half = value || null; }));
  }
  if (tile.type === "UNDER") {
    field(form, "Erlaubte OVERs", selectField(rules.allowed === null ? "all" : "selected", [["all", "Alle erlaubt"], ["selected", "Nur ausgewählte"]], (value) => { rules.allowed = value === "all" ? null : []; }));
    if (rules.allowed !== null) {
      const list = document.createElement("select"); list.multiple = true;
      state.catalog.tiles.filter((item) => item.type === "OVER").forEach((item) => {
        const opt = option(item.id, `${item.category} / ${item.name}`); opt.selected = rules.allowed.includes(item.id); list.append(opt);
      });
      list.addEventListener("change", () => { rules.allowed = [...list.selectedOptions].map((item) => item.value); changed(); renderList(); });
      field(form, "Erlaubte Objekte (Strg für Mehrfachauswahl)", list);
    }
  }
  field(form, "Laufregeln", selectField(rules.walk === null ? "default" : "custom", [["default", "Standard (Boden begehbar, Objekte blockiert)"], ["custom", "Eigene Ebenen und Richtungen"]], (value) => {
    rules.walk = value === "default" ? null : [{ level: "unten", dirs: { W: "-", A: "-", S: "-", D: "-" } }];
  }));
  if (rules.walk) {
    form.append(node("p", "Eingang > Ausgang, z. B. 0, 0>1 oder - für gesperrt. W/A/S/D entsprechen den Laufrichtungen.", "hint"));
    const heading = node("div", undefined, "walk-row walk-head");
    ["Ebene", "W ↗", "A ↖", "S ↙", "D ↘", ""].forEach((text) => heading.append(node("span", text))); form.append(heading);
    rules.walk.forEach((row, index) => {
      const line = node("div", undefined, "walk-row");
      line.append(selectField(row.level, [["unten", "Unten"], ["oben", "Oben"]], (value) => { row.level = value; }));
      ["W", "A", "S", "D"].forEach((dir) => line.append(input(row.dirs[dir], (value) => { row.dirs[dir] = value; })));
      line.append(button("×", () => { rules.walk.splice(index, 1); changed(); render(); }));
      form.append(line);
    });
    form.append(button("Ebene hinzufügen", () => { rules.walk.push({ level: "oben", dirs: { W: "-", A: "-", S: "-", D: "-" } }); changed(); render(); }));
  }
  const problems = errors(tile);
  if (problems.length) {
    const box = node("div", undefined, "notice");
    box.append(node("strong", "Prüfung:"));
    const list = node("ul"); problems.forEach((error) => list.append(node("li", error))); box.append(list); form.append(box);
  }
  detail.append(form);
}
function render() { renderList(); renderDetail(); }

$("#search").addEventListener("input", renderList);
$("#filter").addEventListener("change", renderList);
$("#select-all").addEventListener("change", (event) => {
  entries().forEach((entry) => { const tile = tileFor(entry); if (tile) { if (event.target.checked) checked.add(tile.id); else checked.delete(tile.id); } });
  renderList();
});
$("#apply-profile").addEventListener("click", () => {
  const profile = $("#bulk-profile").value;
  if (!profile || !checked.size) return message("Bitte Vorlage und mindestens ein Tile auswählen.", true);
  state.catalog.tiles.filter((tile) => checked.has(tile.id)).forEach((tile) => { tile.profile = profile; });
  changed(); render();
});
$("#reload").addEventListener("click", () => {
  if (dirty && !reloadArmed) {
    reloadArmed = true;
    $("#reload").textContent = "Änderungen verwerfen und neu einlesen";
    message("Ungespeicherte Änderungen gehen verloren. Zum Bestätigen erneut klicken.", true);
    return;
  }
  load(true).then(() => { reloadArmed = false; $("#reload").textContent = "Neu einlesen"; }).catch((error) => message(error.message, true));
});
$("#save").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json", "X-Workshop-Token": state.token }, body: JSON.stringify({ catalog: state.catalog, revision: state.revision }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await load(true);
    reloadArmed = false;
    $("#reload").textContent = "Neu einlesen";
    message("Katalog gespeichert und Bestand neu eingelesen.");
  } catch (error) { message(`Speichern fehlgeschlagen: ${error.message}`, true); }
});
window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
load(true).catch((error) => message(`Laden fehlgeschlagen: ${error.message}`, true));
