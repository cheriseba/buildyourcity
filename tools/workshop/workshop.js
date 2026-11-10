const $ = (selector) => document.querySelector(selector);
let state;
let selected = null;
let dirty = false;
let checked = new Set();
let reloadArmed = false;
let dragged = null;

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
function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}
async function assetDataUrl(path) {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`Bild konnte nicht geladen werden: ${path}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Bild konnte nicht eingebettet werden: ${path}`));
    reader.readAsDataURL(blob);
  });
}
function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportTagSheet() {
  const currentById = new Map(state.inventory
    .filter((entry) => entry.previous && entry.current)
    .map((entry) => [entry.previous.id, entry]));
  const folderOrders = new Map(state.catalog.folders.map((folder) => [folder.name, folder.order]));
  const tiles = state.catalog.tiles
    .filter((tile) => currentById.has(tile.id))
    .sort((a, b) => (folderOrders.get(a.category) ?? Number.MAX_SAFE_INTEGER) -
        (folderOrders.get(b.category) ?? Number.MAX_SAFE_INTEGER) ||
      (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "de"));
  const cards = [];
  for (let index = 0; index < tiles.length; index += 12) {
    const batch = tiles.slice(index, index + 12);
    cards.push(...await Promise.all(batch.map(async (tile) => {
      const entry = currentById.get(tile.id);
      return { tile, image: await assetDataUrl(entry.current.path) };
    })));
  }
  const responseData = JSON.stringify(tiles.map(({ id }) => ({ id, tags: [] })))
    .replace(/</g, "\\u003c");
  const cardMarkup = cards.map(({ tile, image }) => `
    <article class="tile" data-id="${htmlEscape(tile.id)}">
      <img src="${htmlEscape(image)}" alt="${htmlEscape(tile.name)}">
      <h2>${htmlEscape(tile.name)}</h2>
      <p>${htmlEscape(tile.category || "Ohne Ordner")}</p>
      <label>Tags und Assoziationen
        <textarea rows="3" placeholder="Mit Komma trennen">${htmlEscape((tile.tags || []).join(", "))}</textarea>
      </label>
    </article>`).join("");
  const documentText = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tile-Assoziationen sammeln</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#edf1f7;color:#243049;font:16px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;margin:-24px -24px 20px;padding:16px 24px;background:#1d2b45;color:white;box-shadow:0 2px 8px #15233b33}
h1{margin:0;font-size:1.35rem}header p{margin:4px 0 12px;color:#d5e0f0}
button,textarea{font:inherit}button{padding:10px 14px;border:0;border-radius:6px;background:#83a6f2;color:#15233b;font-weight:700;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.tile{min-width:0;padding:14px;border:1px solid #d5deeb;border-radius:10px;background:white;box-shadow:0 2px 8px #24304912}
.tile img{display:block;width:100%;height:160px;object-fit:contain;image-rendering:pixelated;background:#f3f6fa;border-radius:6px}
.tile h2{margin:10px 0 0;font-size:1rem}.tile p{margin:2px 0 10px;color:#657187;font-size:.85rem}
label{display:block;font-weight:650}textarea{display:block;width:100%;margin-top:5px;padding:8px;border:1px solid #bdc9d9;border-radius:6px;resize:vertical}
@media(max-width:520px){body{padding:12px}header{margin:-12px -12px 14px;padding:12px}.grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.tile{padding:9px}.tile img{height:120px}}
</style>
</head>
<body>
<header><h1>Tile-Assoziationen</h1><p>Ergänze die Tags pro Bild. Bestehende Tags können stehen bleiben; ergänze deine Begriffe mit Komma getrennt.</p><button id="download">Ausgefüllte Tags zurückgeben</button></header>
<main class="grid">${cardMarkup}</main>
<script id="tile-data" type="application/json">${responseData}</script>
<script>
const tiles=JSON.parse(document.getElementById("tile-data").textContent);
document.getElementById("download").addEventListener("click",()=>{
  const result={format:"nordstadt-tile-tags",version:1,tiles:tiles.map(tile=>{
    const card=[...document.querySelectorAll(".tile")].find(element=>element.dataset.id===tile.id);
    const input=card.querySelector("textarea");
    return{id:tile.id,tags:input.value.split(/[,\\n]/).map(tag=>tag.trim()).filter(Boolean)};
  })};
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download="tile-tags-rueckmeldung.json";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
</script>
</body>
</html>`;
  downloadFile("tile-assoziationen.html", documentText, "text/html;charset=utf-8");
  message(`Bilderbogen mit ${tiles.length} Tiles heruntergeladen. Die ausgefüllte Rückmeldung lässt sich anschließend als JSON importieren.`);
}
function pathOf(tile) { return TileCatalogModel.assetPathOf(tile); }
function assetUrl(path) { return `/assets/${path.split("/").map(encodeURIComponent).join("/")}`; }
function baseRulesOf(tile) {
  return TileCatalogModel.resolveRules({ ...tile, overrides: undefined }, state.catalog.profiles);
}
function folderOrder() {
  state.catalog.folders.sort((a, b) => a.order - b.order);
}
function folderForEntry(entry) {
  const tile = tileFor(entry);
  if (tile) return tile.category;
  const filePath = entry.current ? entry.current.path : entry.previous.path;
  const assetFolder = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
  return state.catalog.folders.some((folder) => folder.name === assetFolder) ? assetFolder : "";
}
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
    const matches = `${name} ${tile ? `${tile.name} ${tile.category} ${tile.tags.join(" ")}` : ""}`.toLocaleLowerCase().includes(text);
    const type = status(entry);
    return matches && (filter === "all" || (filter === "attention" ? type !== "ready" : filter === type));
  });
}
function preview(imageUrl, title) {
  $("#preview-title").textContent = title;
  $("#preview-image").src = imageUrl;
  $("#image-preview").showModal();
}
function normalizeTileOrder(categories) {
  for (const category of new Set(categories)) {
    state.catalog.tiles.filter((tile) => tile.category === category)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((tile, index) => { tile.order = index; });
  }
}
function placeTile(tile, folderName, beforeId = null) {
  if (tile.file.toLocaleLowerCase() === "wiese.png" && tile.category === "") return;
  const oldCategory = tile.category;
  const siblings = state.catalog.tiles.filter((item) => item.category === folderName && item.id !== tile.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const index = beforeId ? siblings.findIndex((item) => item.id === beforeId) : -1;
  siblings.splice(index < 0 ? siblings.length : index, 0, tile);
  tile.category = folderName;
  siblings.forEach((item, order) => { item.order = order; });
  normalizeTileOrder([oldCategory]);
  changed();
}
function handleFolderDrop(event, folderName) {
  event.preventDefault();
  if (!dragged) return;
  if (dragged.type === "folder") {
    const folders = state.catalog.folders;
    const from = folders.findIndex((folder) => folder.name === dragged.name);
    const to = folders.findIndex((folder) => folder.name === folderName);
    if (from < 0 || to < 0 || from === to) return;
    const [folder] = folders.splice(from, 1);
    folders.splice(to, 0, folder);
    folders.forEach((item, order) => { item.order = order; });
    dragged = null;
    changed();
    render();
    return;
  }
  const entry = state.inventory.find((item) => item.previous && item.previous.id === dragged.id);
  if (!entry || folderName === "") return;
  let tile = tileFor(entry);
  if (!tile && entry.status === "new") {
    makeNew(entry);
    tile = tileFor(entry);
  }
  if (!tile) return;
  placeTile(tile, folderName);
  dragged = null;
  render();
}
function renderList() {
  const rows = $("#rows");
  rows.replaceChildren();
  const visible = entries();
  $("#count").textContent = `${visible.length} angezeigt · ${state.inventory.filter((entry) => status(entry) !== "ready").length} mit Prüfbedarf`;
  folderOrder();
  const groups = [...state.catalog.folders, { name: "", order: Number.MAX_SAFE_INTEGER, icon: null }];
  for (const folder of groups) {
    const folderEntries = visible.filter((entry) => folderForEntry(entry) === folder.name)
      .sort((a, b) => {
        const aTile = tileFor(a); const bTile = tileFor(b);
        return (aTile?.order ?? Number.MAX_SAFE_INTEGER) - (bTile?.order ?? Number.MAX_SAFE_INTEGER) ||
          (a.current || a.previous).path.localeCompare((b.current || b.previous).path, "de");
      });
    if (!folderEntries.length) continue;
    const heading = node("tr", undefined, "folder-row");
    heading.dataset.folder = folder.name;
    const headerCell = node("td");
    headerCell.colSpan = 4;
    const header = node("div", undefined, "folder-heading");
    const label = node("strong", folder.name || "Ohne UI-Ordner");
    if (folder.name) {
      const handle = button("↕", () => {});
      handle.classList.add("folder-drag-handle");
      handle.draggable = true;
      handle.setAttribute("aria-label", `${folder.name} verschieben`);
      handle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        dragged = { type: "folder", name: folder.name };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `folder:${folder.name}`);
      });
      handle.addEventListener("dragend", () => { dragged = null; });
      handle.addEventListener("click", (event) => event.stopPropagation());
      header.append(handle);
    }
    header.append(label, node("span", `${folderEntries.length} Tiles`, "sub"));
    if (folder.name) {
      if (folder.icon) {
        const icon = document.createElement("img");
        icon.src = assetUrl(folder.icon);
        icon.alt = "";
        icon.className = "folder-icon";
        icon.addEventListener("click", (event) => { event.stopPropagation(); preview(icon.src, `${folder.name} – Icon`); });
        header.append(icon);
      }
      const upload = document.createElement("input");
      upload.type = "file";
      upload.accept = "image/png";
      upload.className = "icon-file";
      upload.setAttribute("aria-label", `${folder.name}: separates PNG-Icon auswählen`);
      upload.addEventListener("change", () => uploadFolderIcon(folder, upload.files[0]));
      const uploadButton = button(folder.icon ? "Icon ersetzen" : "Icon hinzufügen", () => upload.click());
      uploadButton.addEventListener("click", (event) => event.stopPropagation());
      header.append(uploadButton, upload);
    }
    heading.addEventListener("dragover", (event) => { event.preventDefault(); heading.classList.add("drop-target"); });
    heading.addEventListener("dragleave", () => heading.classList.remove("drop-target"));
    heading.addEventListener("drop", (event) => {
      heading.classList.remove("drop-target");
      handleFolderDrop(event, folder.name);
    });
    headerCell.append(header);
    heading.append(headerCell);
    rows.append(heading);
    for (const entry of folderEntries) {
      const tile = tileFor(entry);
      const tr = node("tr");
      if (entry === selected) tr.className = "active";
      tr.draggable = Boolean(tile || entry.status === "new");
      if (tr.draggable) {
        tr.addEventListener("dragstart", (event) => {
          if (!tile && entry.status !== "new") { event.preventDefault(); return; }
          dragged = { type: "tile", id: tile ? tile.id : entry.previous?.id };
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", `tile:${dragged.id || entry.current.path}`);
          tr.classList.add("dragging");
        });
        tr.addEventListener("dragend", () => { dragged = null; tr.classList.remove("dragging"); });
        tr.addEventListener("dragover", (event) => { event.preventDefault(); tr.classList.add("drop-target"); });
        tr.addEventListener("dragleave", () => tr.classList.remove("drop-target"));
        tr.addEventListener("drop", (event) => {
          tr.classList.remove("drop-target");
          event.preventDefault();
          if (!dragged || dragged.type !== "tile" || !tile) return;
          const draggedEntry = state.inventory.find((item) => item.previous && item.previous.id === dragged.id);
          let draggedTile = draggedEntry && tileFor(draggedEntry);
          if (!draggedTile && draggedEntry && draggedEntry.status === "new") {
            makeNew(draggedEntry);
            draggedTile = tileFor(draggedEntry);
          }
          if (draggedTile) {
            placeTile(draggedTile, tile.category, tile.id);
            dragged = null;
            render();
          }
        });
      }
      const selectCell = node("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox"; checkbox.disabled = !tile; checkbox.checked = Boolean(tile && checked.has(tile.id));
      checkbox.setAttribute("aria-label", `${(entry.current || entry.previous).path} auswählen`);
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => { if (checkbox.checked) checked.add(tile.id); else checked.delete(tile.id); });
      selectCell.append(checkbox);
      const imageCell = node("td");
      if (entry.current) {
        const image = document.createElement("img");
        image.alt = "";
        image.src = assetUrl(entry.current.path);
        image.className = "tile-thumb";
        image.title = "Klicken zum Vergrößern";
        image.addEventListener("click", (event) => {
          event.stopPropagation();
          preview(image.src, tile ? tile.name : entry.current.path);
        });
        imageCell.append(image);
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
function renderOverPicker(container, isSelected, toggle, label) {
  const picker = node("div", undefined, "rule-picker");
  state.catalog.tiles.filter((item) => item.type === "OVER")
    .sort((a, b) => a.category.localeCompare(b.category, "de") || (a.order ?? 0) - (b.order ?? 0))
    .forEach((item) => {
      const selectedNow = isSelected(item);
      const card = button("", () => {
        if (item.status !== "ready" && !isSelected(item)) {
          message("Nur freigegebene OVER-Tiles können als erlaubt hinzugefügt werden.", true);
          return;
        }
        toggle(item);
      });
      card.classList.add("rule-card");
      const image = document.createElement("img");
      image.src = assetUrl(TileCatalogModel.assetPathOf(item));
      image.alt = "";
      const caption = node("span", `${item.name}${item.status === "ready" ? "" : " · nicht freigegeben"}`);
      card.append(image, caption);
      card.disabled = item.status !== "ready" && !selectedNow;
      card.classList.toggle("selected", selectedNow);
      card.setAttribute("aria-pressed", String(selectedNow));
      card.setAttribute("aria-label", `${selectedNow ? "Erlaubt" : "Nicht erlaubt"}: ${item.name}`);
      picker.append(card);
    });
  field(container, label, picker);
}
const WALK_DIRECTIONS = [
  { key: "W", arrow: "↗", name: "nach Nordosten" },
  { key: "A", arrow: "↖", name: "nach Nordwesten" },
  { key: "S", arrow: "↙", name: "nach Südwesten" },
  { key: "D", arrow: "↘", name: "nach Südosten" },
];
const WALK_STATES = [
  { id: "blocked", icon: "×", name: "Gesperrt", value: "-" },
  { id: "flat", icon: "↔", name: "Gerade", value: null },
  { id: "up", icon: "↑", name: "Hoch", value: "0>1" },
  { id: "down", icon: "↓", name: "Runter", value: "1>0" },
];
function walkState(value, level) {
  if (value === "-") return "blocked";
  if (value === (level === "oben" ? "1" : "0")) return "flat";
  if (value === "0>1") return "up";
  if (value === "1>0") return "down";
  return "custom";
}
function walkValue(stateId, level) {
  const state = WALK_STATES.find((item) => item.id === stateId);
  if (!state) return null;
  return state.id === "flat" ? (level === "oben" ? "1" : "0") : state.value;
}
function selectField(value, values, update) {
  const element = document.createElement("select");
  values.forEach(([id, name]) => element.append(option(id, name)));
  element.value = value;
  element.addEventListener("change", () => { update(element.value); changed(); render(); });
  return element;
}
function makeNew(entry) {
  const file = entry.current.path.split("/").pop();
  const tile = {
    id: crypto.randomUUID(), category: "", assetPath: entry.current.path,
    order: state.catalog.tiles.filter((item) => item.category === "").length, file, hash: entry.current.hash,
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
  tile.assetPath = entry.current.path;
  tile.file = entry.current.path.split("/").pop();
  tile.hash = entry.current.hash;
  if (!tile.legacyIds.includes(old)) tile.legacyIds.push(old);
  entry.previous = { path: entry.current.path, hash: tile.hash, id: tile.id };
  entry.status = "unchanged";
  state.inventory = state.inventory.filter((item) => item === entry || !(item.status === "missing" && item.previous.id === tile.id));
  changed(); render();
}
async function uploadFolderIcon(folder, file) {
  if (!file) return;
  if (file.type !== "image/png") {
    message("Bitte ein PNG-Bild als Ordner-Icon auswählen.", true);
    return;
  }
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Icon-Datei konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    });
    const response = await fetch("/api/icons", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Workshop-Token": state.token },
      body: JSON.stringify({ name: file.name, data }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    folder.icon = result.path;
    changed();
    render();
    message(`Icon für „${folder.name}“ hinzugefügt. Änderungen speichern.`);
  } catch (error) {
    message(`Icon konnte nicht gespeichert werden: ${error.message}`, true);
  }
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
  const folderValues = [["", "Noch keinem UI-Ordner zugeordnet"], ...state.catalog.folders
    .sort((a, b) => a.order - b.order).map((folder) => [folder.name, folder.name])];
  field(form, "UI-Ordner", selectField(tile.category, folderValues, (value) => {
    const oldCategory = tile.category;
    tile.category = value;
    normalizeTileOrder([oldCategory, value]);
    tile.order = state.catalog.tiles.filter((item) => item.category === value && item.id !== tile.id).length;
  }));
  form.append(node("p", `Bilddatei: ${pathOf(tile)}`, "hint"));
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
    const profile = { id: crypto.randomUUID(), name, rules: structuredClone(baseRulesOf(tile)) };
    state.catalog.profiles.push(profile); tile.profile = profile.id; changed(); render();
  }));
  let rules;
  try { rules = baseRulesOf(tile); }
  catch (error) { form.append(node("p", error.message, "notice")); detail.append(form); return; }
  if (tile.profile) form.append(node("p", "Diese Regeln gehören zur Vorlage. Änderungen gelten für alle zugeordneten Tiles.", "notice"));
  if (tile.type === "OVER") {
    field(form, "OVER-Position", selectField(rules.half || "", [["", "Ganzes Overlay"], ["vorn", "Halb: vorn"], ["hinten", "Halb: hinten"]], (value) => { rules.half = value || null; }));
  }
  if (tile.type === "UNDER") {
    field(form, "Basisregel für OVERs", selectField(rules.allowed === null ? "all" : "selected", [["all", "Alle erlaubt"], ["selected", "Nur ausgewählte"]], (value) => { rules.allowed = value === "all" ? null : []; }));
    if (rules.allowed !== null) {
      renderOverPicker(
        form,
        (item) => rules.allowed.includes(item.id),
        (item) => {
          const index = rules.allowed.indexOf(item.id);
          if (index >= 0) rules.allowed.splice(index, 1);
          else rules.allowed.push(item.id);
          changed();
          render();
        },
        "Basis-Auswahl – erlaubte Objekte anklicken",
      );
    }
    const effectiveRules = TileCatalogModel.resolveRules(tile, state.catalog.profiles);
    const baseAllowed = rules.allowed;
    const specialRules = node("section", undefined, "special-rules");
    specialRules.append(node("h3", "Sonderregeln für dieses Tile"));
    specialRules.append(node("p", "Diese Ausnahmen gelten nur für dieses Tile und ändern keine geteilte Regelvorlage. Klicke Tiles an, um sie zusätzlich zu erlauben oder aus der Basisregel auszuschließen.", "hint"));
    renderOverPicker(
      specialRules,
      (item) => effectiveRules.allowed === null
        ? !effectiveRules.excluded?.includes(item.id)
        : effectiveRules.allowed.includes(item.id),
      (item) => {
        const currentlyAllowed = effectiveRules.allowed === null
          ? !effectiveRules.excluded?.includes(item.id)
          : effectiveRules.allowed.includes(item.id);
        const shouldAllow = !currentlyAllowed;
        tile.overrides = tile.overrides || {};
        tile.overrides.allowed = tile.overrides.allowed || { add: [], remove: [] };
        const exception = tile.overrides.allowed;
        exception.add = exception.add.filter((id) => id !== item.id);
        exception.remove = exception.remove.filter((id) => id !== item.id);
        const allowedByBase = baseAllowed === null || baseAllowed.includes(item.id);
        if (shouldAllow !== allowedByBase) {
          (shouldAllow ? exception.add : exception.remove).push(item.id);
        }
        if (!exception.add.length && !exception.remove.length) delete tile.overrides.allowed;
        if (!Object.keys(tile.overrides).length) delete tile.overrides;
        changed();
        render();
      },
      "Tile-spezifische Auswahl – blau markiert bedeutet erlaubt",
    );
    form.append(specialRules);
  }
  field(form, "Laufregeln", selectField(rules.walk === null ? "default" : "custom", [["default", "Standard (Boden begehbar, Objekte blockiert)"], ["custom", "Eigene Ebenen und Richtungen"]], (value) => {
    rules.walk = value === "default" ? null : [{ level: "unten", dirs: { W: "-", A: "-", S: "-", D: "-" } }];
  }));
  if (rules.walk) {
    form.append(node("p", "Jedes Kästchen beschreibt eine Laufrichtung. Klicke den passenden Zustand: gesperrt, eben, Rampe hinauf oder hinunter. Die Pfeile zeigen die Richtung auf dem isometrischen Spielfeld.", "hint"));
    const legend = node("div", undefined, "walk-legend");
    WALK_STATES.forEach((stateOption) => {
      const item = node("span", undefined, "walk-legend-item");
      item.append(node("strong", stateOption.icon), node("span", stateOption.name));
      legend.append(item);
    });
    form.append(legend);
    const directions = node("div", undefined, "walk-directions");
    const corner = node("div", undefined, "walk-corner");
    corner.append(node("span", "Ebene"));
    directions.append(corner);
    WALK_DIRECTIONS.forEach((direction) => {
      const heading = node("div", undefined, "walk-direction-heading");
      const tileIcon = document.createElement("span");
      tileIcon.className = "walk-icon";
      const image = document.createElement("img");
      image.src = assetUrl(TileCatalogModel.assetPathOf(tile));
      image.alt = "";
      const arrow = node("span", direction.arrow, "walk-arrow");
      arrow.setAttribute("aria-hidden", "true");
      tileIcon.append(image, arrow);
      heading.append(tileIcon, node("strong", direction.key), node("span", direction.name, "walk-direction-name"));
      directions.append(heading);
    });
    rules.walk.forEach((row, index) => {
      const level = node("div", undefined, "walk-level");
      level.append(selectField(row.level, [["unten", "Unten"], ["oben", "Oben"]], (value) => { row.level = value; }));
      level.append(button("×", () => { rules.walk.splice(index, 1); changed(); render(); }));
      directions.append(level);
      WALK_DIRECTIONS.forEach((direction) => {
        const cell = node("div", undefined, "walk-cell");
        const currentState = walkState(row.dirs[direction.key], row.level);
        const choices = node("div", undefined, "walk-state-choices");
        WALK_STATES.forEach((stateOption) => {
          const choice = button(stateOption.icon, () => {
            row.dirs[direction.key] = walkValue(stateOption.id, row.level);
            changed();
            render();
          });
          choice.classList.toggle("active", currentState === stateOption.id);
          choice.setAttribute("aria-pressed", String(currentState === stateOption.id));
          choice.setAttribute("aria-label", `${direction.key}, ${stateOption.name}`);
          choice.title = stateOption.name;
          choices.append(choice);
        });
        if (currentState === "custom") {
          const custom = input(row.dirs[direction.key], (value) => { row.dirs[direction.key] = value; });
          custom.classList.add("walk-custom-value");
          custom.setAttribute("aria-label", `${direction.key}: eigener Wert Eingang zu Ausgang`);
          cell.append(custom);
        }
        cell.append(choices);
        directions.append(cell);
      });
    });
    form.append(directions);
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
$("#new-folder").addEventListener("click", () => {
  const name = window.prompt("Name des neuen UI-Ordners");
  if (name === null) return;
  const normalized = name.trim();
  if (!normalized || /[\\/]/.test(normalized) || normalized === "." || normalized === "..") {
    return message("Bitte einen gültigen Ordnernamen ohne Schrägstriche eingeben.", true);
  }
  if (state.catalog.folders.some((folder) => folder.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    return message("Ein UI-Ordner mit diesem Namen existiert bereits.", true);
  }
  state.catalog.folders.push({ name: normalized, order: state.catalog.folders.length, icon: null });
  changed();
  render();
});
$("#preview-close").addEventListener("click", () => $("#image-preview").close());
$("#image-preview").addEventListener("click", (event) => {
  if (event.target === $("#image-preview")) $("#image-preview").close();
});
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
$("#export-tag-sheet").addEventListener("click", async (event) => {
  const control = event.currentTarget;
  control.disabled = true;
  message("Bilderbogen wird mit den Tile-Bildern vorbereitet …");
  try {
    await exportTagSheet();
  } catch (error) {
    message(`Bilderbogen konnte nicht erstellt werden: ${error.message}`, true);
  } finally {
    control.disabled = false;
  }
});
$("#import-tag-response").addEventListener("click", () => $("#tag-response-file").click());
$("#tag-response-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Die Rückmeldungsdatei ist größer als 5 MB.");
    const response = JSON.parse(await file.text());
    const result = TileTagSharing.merge(state.catalog.tiles, response);
    if (result.added) {
      changed();
      render();
    }
    message(`${result.added} neue Tags ergänzt.${result.unknownTiles ? ` ${result.unknownTiles} unbekannte Tile-Einträge übersprungen.` : ""}${result.added ? " Änderungen anschließend speichern." : ""}`);
  } catch (error) {
    message(`Rückmeldung konnte nicht importiert werden: ${error.message}`, true);
  }
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
