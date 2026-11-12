class TileVariants {
  constructor({ definitions, families, storage }) {
    this.definitions = definitions;
    this.storage = storage;
    this.byIndex = new Map();
    this.preferences = new Map();
    const indices = new Map(definitions.map((def, index) => [def.id, index]));
    for (const family of families) {
      const variants = family.variants.map((variant) => ({ ...variant, index: indices.get(variant.tileId) }))
        .filter((variant) => variant.index !== undefined);
      if (!variants.length) continue;
      const available = { ...family, variants };
      variants.forEach((variant) => this.byIndex.set(variant.index, available));
    }
    try {
      const raw = storage.getItem("nordstadt-tile-variants-v1");
      if (raw) {
        const values = JSON.parse(raw);
        if (!Array.isArray(values) || values.some((entry) => !Array.isArray(entry) ||
            entry.length !== 2 || entry.some((value) => typeof value !== "string"))) {
          throw new Error("Ungueltige Varianten-Auswahl");
        }
        this.preferences = new Map(values);
      }
    } catch (error) {
      console.warn("Varianten-Auswahl konnte nicht geladen werden:", error);
    }
  }

  key(index) {
    const family = this.byIndex.get(index);
    return family ? `family:${family.id}` : `tile:${index}`;
  }

  representative(index) {
    const family = this.byIndex.get(index);
    if (!family) return index;
    return (family.variants.find((variant) => variant.tileId === this.preferences.get(family.id)) ||
      family.variants.find((variant) => variant.tileId === family.defaultTileId) || family.variants[0]).index;
  }

  collapse(indices) {
    const seen = new Set();
    return indices.filter((index) => {
      const key = this.key(index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((index) => this.representative(index));
  }

  searchText(index) {
    const family = this.byIndex.get(index);
    return family ? `${family.name} ${family.variants.find((variant) => variant.index === index).label}` : "";
  }

  remember(index) {
    const family = this.byIndex.get(index);
    if (!family) return;
    this.preferences.set(family.id, this.definitions[index].id);
    try {
      this.storage.setItem("nordstadt-tile-variants-v1", JSON.stringify([...this.preferences]));
    } catch (error) {
      console.warn("Varianten-Auswahl konnte nicht gespeichert werden:", error);
    }
  }

  decorate(button, index) {
    const family = this.byIndex.get(index);
    if (!family) return;
    const active = this.representative(index);
    const def = this.definitions[active];
    const variant = family.variants.find((item) => item.index === active);
    button.dataset.familyId = family.id;
    button.dataset.tileIndex = String(active);
    button.dataset.tileCategory = def.category;
    button.dataset.tileFile = def.file;
    button.querySelector("img").src = def.url;
    button.title = `${family.name} · ${variant.label} · ${family.variants.length} Farben`;
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-controls", "tile-variant-panel");
    button.setAttribute("aria-expanded", String(this.anchor === button && !this.panel.hidden));
    let colors = button.querySelector(".tile-variant-colors");
    if (!colors) {
      colors = document.createElement("span");
      colors.className = "tile-variant-colors";
      colors.setAttribute("aria-hidden", "true");
      button.appendChild(colors);
    }
    colors.replaceChildren(...family.variants.map((item) => {
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = item.color || "#cbd4ff";
      return swatch;
    }));
  }

  mount({ select, getSelected }) {
    this.select = select;
    this.getSelected = getSelected;
    this.panel = document.createElement("section");
    this.panel.id = "tile-variant-panel";
    this.panel.className = "tile-variant-panel";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Farbvarianten");
    document.body.appendChild(this.panel);
    window.addEventListener("resize", () => this.position());
    document.addEventListener("scroll", (event) => {
      if (!this.panel.contains(event.target)) this.close();
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (this.panel.hidden || this.panel.contains(event.target) || this.anchor?.contains(event.target)) return;
      this.close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
      }
    }, true);
  }

  updateButtons() {
    document.querySelectorAll(".tile-button[data-family-id]").forEach((button) => {
      this.decorate(button, Number(button.dataset.tileIndex));
    });
    this.panel?.querySelectorAll("[data-variant-index]").forEach((button) => {
      const active = Number(button.dataset.variantIndex) === this.getSelected();
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("selected", active);
    });
  }

  open(button, focusChoice = false) {
    const family = this.byIndex.get(Number(button.dataset.tileIndex));
    if (!family || family.variants.length < 2 || !button.isConnected || !button.getClientRects().length) return;
    this.close();
    this.anchor = button;
    this.panel.replaceChildren();
    const choices = document.createElement("div");
    choices.className = "tile-variant-choices";
    for (const variant of family.variants) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.dataset.variantIndex = String(variant.index);
      choice.setAttribute("aria-label", `${family.name}: ${variant.label}`);
      const image = document.createElement("img");
      image.src = this.definitions[variant.index].url;
      image.alt = "";
      choice.append(image);
      if (variant.color) {
        const swatch = document.createElement("span");
        swatch.className = "tile-variant-swatch";
        swatch.style.backgroundColor = variant.color;
        swatch.setAttribute("aria-hidden", "true");
        choice.append(swatch);
      }
      choice.addEventListener("click", () => this.select(variant.index));
      choices.appendChild(choice);
    }
    this.panel.append(choices);
    this.panel.hidden = false;
    this.updateButtons();
    this.position();
    if (focusChoice) this.panel.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  position() {
    if (!this.panel || this.panel.hidden) return;
    if (!this.anchor?.isConnected) { this.close(); return; }
    const anchor = this.anchor.getBoundingClientRect();
    const panel = this.panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - panel.width - 8, anchor.left + anchor.width / 2 - panel.width / 2));
    const top = anchor.top - panel.height - 10;
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${Math.max(8, Math.min(window.innerHeight - panel.height - 8, top >= 8 ? top : anchor.bottom + 10))}px`;
  }

  close(restoreFocus = false) {
    if (!this.panel) return;
    this.panel.hidden = true;
    if (this.anchor) {
      this.anchor.setAttribute("aria-expanded", "false");
      if (restoreFocus && this.anchor.isConnected) this.anchor.focus({ preventScroll: true });
    }
    this.anchor = null;
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = TileVariants;
