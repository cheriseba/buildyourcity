function applyStartLayout(layout, board, definitions, images, meadowIndex) {
  for (const entry of layout) {
    const index = definitions.findIndex((def) => def.category === entry.category && def.file === entry.file);

    if (index === -1 || !board.placeLayout(entry.gx, entry.gy, images[index], definitions[index], images[meadowIndex], entry.fixed)) {
      console.warn("Startlayout: Eintrag uebersprungen", entry);
    }
  }

  board.history = [];
  board.refresh();
}

function resetToStartLayout(layout, board, definitions, images, meadowIndex) {
  const snapshot = board.snapshot();
  for (const cell of snapshot.cells) {
    cell[1] = images[meadowIndex];
    cell[2] = "UNDER";
    cell[3] = null;
    cell[4] = false;
    cell[5] = null;
  }
  snapshot.buildings = [];
  board.restore(snapshot);
  applyStartLayout(layout, board, definitions, images, meadowIndex);
}

function exportLayout(board, definitions, images, meadowIndex) {
  const rows = [["Kategorie", "Dateiname", "gx", "gy", "Fix"]];
  const add = (image, cell, locked) => {
    const def = definitions[images.indexOf(image)];
    if (def && images.indexOf(image) !== meadowIndex) {
      rows.push([def.category, def.file, cell.gx, cell.gy, locked ? "FIX" : "FREI"]);
    }
  };

  for (const cell of board.sorted()) {
    if (!cell.owner) {
      add(cell.ground, cell, cell.locked);
      cell.overlays().forEach((overlay) => add(overlay, cell, cell.locked));
    }
  }

  for (const building of board.buildings) {
    add(building.image, building.anchor, building.locked);
  }

  const quote = (value) => (/[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
  const csv = "\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "start-layout.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
