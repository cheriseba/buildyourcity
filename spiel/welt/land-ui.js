class LandExpansion {
  constructor({ board, onSelect, onClose, onUnlock }) {
    this.board = board;
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.onUnlock = onUnlock;
    this.active = false;
    this.selected = null;
    this.revealed = new Set();
    this.revealWidth = LAND_SCROLL_MARGIN;
    this.panel = document.getElementById("land-panel");
    this.confirm = document.getElementById("land-confirm");
    this.markers = document.getElementById("land-markers");
    this.confirm.addEventListener("click", () => this.unlock());
    document.getElementById("land-cancel").addEventListener("click", () => this.close());
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.active) this.close();
    });
    this.refresh();
  }

  refresh() {
    if (this.land === this.board.land && this.parcelCount === this.board.land.parcels.size) return;
    this.land = this.board.land;
    this.parcelCount = this.land.parcels.size;
    this.revealed.clear();
    this.candidates = this.land.frontier();
    this.markers.replaceChildren();
    this.markerButtons = [];
    for (const parcel of this.candidates) {
      const rect = this.land.rect(parcel);
      for (const [dx, dy] of LAND_UNLOCK_NEIGHBORS) {
        if (!this.land.parcels.has(WorldLand.key(parcel.x + dx, parcel.y + dy))) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "land-marker";
        button.textContent = "+";
        button.hidden = true;
        button.setAttribute("aria-label", `Grundst\u00fcck (${parcel.x - 1}, ${parcel.y - 1}) freischalten`);
        button.addEventListener("click", () => this.choose(parcel));
        this.markers.appendChild(button);
        this.markerButtons.push({
          button, parcel,
          dx, dy,
          markerX: (rect.minX + rect.maxX + dx * (PARCEL_SIZE - LAND_SCROLL_MARGIN)) / 2,
          markerY: (rect.minY + rect.maxY + dy * (PARCEL_SIZE - LAND_SCROLL_MARGIN)) / 2,
        });
      }
    }
    this.setRevealScale(1);
  }

  choose(parcel) {
    if (!this.board.land.canUnlock(parcel.x, parcel.y)) {
      showToast("Dieses Grundst\u00fcck ist nicht mehr zum Freischalten verf\u00fcgbar.");
      return;
    }
    this.selected = parcel;
    this.active = true;
    this.panel.hidden = false;
    this.confirm.disabled = false;
    document.querySelector(".app").classList.add("expanding");
    document.getElementById("left-palette").inert = true;
    for (const marker of this.markerButtons) {
      marker.button.classList.toggle("selected", marker.parcel.x === parcel.x && marker.parcel.y === parcel.y);
    }
    this.onSelect();
    this.confirm.focus();
  }

  chooseAt(wx, wy) {
    const preview = this.revealRegions().find(({ rect }) =>
      wx >= rect.minX && wx < rect.maxX && wy >= rect.minY && wy < rect.maxY);
    if (!preview) return false;
    this.choose(preview.parcel);
    return true;
  }

  clearReveal() {
    this.revealed.clear();
    for (const { button } of this.markerButtons) button.hidden = true;
  }

  revealRegions() {
    return this.markerButtons.filter((m) => this.revealed.has(WorldLand.key(m.parcel.x, m.parcel.y) + `:${m.dx},${m.dy}`))
      .map((m) => {
        const rect = this.land.rect(m.parcel);
        if (m.dx === -1) rect.maxX = rect.minX + this.revealWidth;
        if (m.dx === 1) rect.minX = rect.maxX - this.revealWidth;
        if (m.dy === -1) rect.maxY = rect.minY + this.revealWidth;
        if (m.dy === 1) rect.minY = rect.maxY - this.revealWidth;
        return { parcel: m.parcel, rect };
      });
  }

  setRevealScale(scale) {
    this.revealWidth = Math.min(PARCEL_SIZE / 2, CELL_W + LAND_SCROLL_MARGIN / scale);
    for (const m of this.markerButtons) {
      const rect = this.land.rect(m.parcel);
      m.markerX = (rect.minX + rect.maxX + m.dx * (PARCEL_SIZE - this.revealWidth)) / 2;
      m.markerY = (rect.minY + rect.maxY + m.dy * (PARCEL_SIZE - this.revealWidth)) / 2;
    }
  }

  revealAttempt(camera, view, attempted, previous) {
    this.setRevealScale(camera.scale);
    const area = CameraGeometry.area(view);
    const left = camera.x;
    const right = left + area.width / camera.scale;
    const top = camera.y + view.insetTop / camera.scale;
    const bottom = top + area.height / camera.scale;
    for (const m of this.markerButtons) {
      const rect = this.land.rect(m.parcel);
      const horizontal = m.dx !== 0 && rect.maxY > top && rect.minY < bottom &&
        (m.dx === 1 ? attempted.x < previous.x - 0.01 && left <= rect.maxX + 0.01 && right > rect.maxX :
          attempted.x > previous.x + 0.01 && right >= rect.minX - 0.01 && left < rect.minX);
      const vertical = m.dy !== 0 && rect.maxX > left && rect.minX < right &&
        (m.dy === 1 ? attempted.y < previous.y - 0.01 && top <= rect.maxY + 0.01 && bottom > rect.maxY :
          attempted.y > previous.y + 0.01 && bottom >= rect.minY - 0.01 && top < rect.minY);
      if (horizontal || vertical) this.revealed.add(WorldLand.key(m.parcel.x, m.parcel.y) + `:${m.dx},${m.dy}`);
    }
  }

  close(restoreFocus = true) {
    if (!this.active) return;
    const selected = this.selected;
    this.active = false;
    this.selected = null;
    this.panel.hidden = true;
    document.querySelector(".app").classList.remove("expanding");
    document.getElementById("left-palette").inert = false;
    for (const marker of this.markerButtons) marker.button.classList.remove("selected");
    this.onClose();
    if (restoreFocus) {
      const marker = this.markerButtons.find(({ parcel, button }) =>
        !button.hidden && parcel.x === selected.x && parcel.y === selected.y);
      (marker ? marker.button : document.getElementById("home-button")).focus();
    }
  }

  unlock() {
    if (!this.active || !this.selected) return;
    const { x, y } = this.selected;
    if (!this.board.land.canUnlock(x, y)) {
      showToast("Dieses Grundst\u00fcck ist nicht mehr zum Freischalten verf\u00fcgbar.");
      return;
    }
    this.board.unlockParcel(x, y);
    this.close(false);
    this.refresh();
    this.onUnlock();
    document.getElementById("home-button").focus();
  }

  drawGrid(context, visible, scale) {
    const origin = gridToScreen(0, 0);
    const vertexX = origin.x + CELL_CENTER_X;
    const vertexY = origin.y + CELL_CENTER_Y - CELL_H / 2;
    context.save();
    context.strokeStyle = "rgba(124, 156, 255, 0.18)";
    context.lineWidth = 1 / scale;
    context.beginPath();
    for (const slope of [-CELL_H / CELL_W, CELL_H / CELL_W]) {
      const base = vertexY - slope * vertexX;
      const min = visible.minY - Math.max(slope * visible.minX, slope * visible.maxX);
      const max = visible.maxY - Math.min(slope * visible.minX, slope * visible.maxX);
      for (let row = Math.ceil((min - base) / CELL_H); row <= Math.floor((max - base) / CELL_H); row++) {
        const intercept = base + row * CELL_H;
        context.moveTo(visible.minX, slope * visible.minX + intercept);
        context.lineTo(visible.maxX, slope * visible.maxX + intercept);
      }
    }
    context.stroke();
    context.restore();
  }

  drawGround(context, visible) {
    this.refresh();
    for (const tile of this.board.sorted()) {
      if (tile.groundType === "UNDER" && tile.x + tile.drawW >= visible.minX && tile.x <= visible.maxX &&
          tile.y + tile.drawH >= visible.minY && tile.y <= visible.maxY) tile.drawImage(tile.ground);
    }
  }

  draw(context, camera, view, interactive) {
    this.markers.hidden = !interactive;
    if (interactive) {
      for (const { button, markerX, markerY, parcel, dx, dy } of this.markerButtons) {
        const rect = this.land.rect(parcel);
        const minX = Math.max(22, (rect.minX - camera.x) * camera.scale + 22);
        const maxX = Math.min(view.w - 22, (rect.maxX - camera.x) * camera.scale - 22);
        const minY = Math.max(view.insetTop + 22, (rect.minY - camera.y) * camera.scale + 22);
        const maxY = Math.min(view.h - view.insetBottom - 22, (rect.maxY - camera.y) * camera.scale - 22);
        const x = dy ? Math.max(minX, Math.min(maxX, (markerX - camera.x) * camera.scale)) :
          (markerX - camera.x) * camera.scale;
        const y = dx ? Math.max(minY, Math.min(maxY, (markerY - camera.y) * camera.scale)) :
          (markerY - camera.y) * camera.scale;
        button.hidden = !this.revealed.has(WorldLand.key(parcel.x, parcel.y) + `:${dx},${dy}`) ||
          minX > maxX || minY > maxY ||
          x < 22 || x > view.w - 22 || y < view.insetTop + 22 || y > view.h - view.insetBottom - 22;
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
      }
    }
  }
}
