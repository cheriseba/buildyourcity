// Virtual Touch Controller für Mobile (nur auf Mobile anzeigen)
class TouchController {
  constructor(containerElement, width = 120, height = 120) {
    this.container = containerElement;
    this.width = width;
    this.height = height;
    this.radius = width / 2;
    
    this.direction = null;
    this.activePointerId = null;
    this.pad = null;
    this.isMobile = this.detectMobile();
    
    if (this.isMobile) {
      this.init();
    }
  }
  
  detectMobile() {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
    );
  }
  
  init() {
    // Rautenfoermige Anordnung passend zur isometrischen Ansicht
    const buttons = [
      { dir: "up-left", arrow: "↖", col: 1, row: 1 },
      { dir: "up-right", arrow: "↗", col: 2, row: 1 },
      { dir: "down-left", arrow: "↙", col: 1, row: 2 },
      { dir: "down-right", arrow: "↘", col: 2, row: 2 }
    ];
    
    this.pad = document.createElement("div");
    this.pad.classList.add("touch-controller");
    this.pad.setAttribute("role", "group");
    this.pad.setAttribute("aria-label", "Laufen");
    this.pad.style.width = `${this.width}px`;
    this.pad.style.height = `${this.height}px`;
    
    for (const { dir, arrow, col, row } of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("touch-controller-button");
      btn.textContent = arrow;
      btn.dataset.dir = dir;
      btn.setAttribute("aria-label", dir);
      btn.style.gridColumn = col;
      btn.style.gridRow = row;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.activePointerId = e.pointerId;
        this.direction = dir;
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add("active");
      });
      const release = (e) => {
        if (e.pointerId !== this.activePointerId) return;
        this.activePointerId = null;
        this.direction = null;
        btn.classList.remove("active");
      };
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      this.pad.appendChild(btn);
    }
    
    this.container.appendChild(this.pad);
  }
  
  // Aktuell gehaltene Richtung ("up-left", "up-right", "down-left", "down-right") oder null
  getDirection() {
    return this.isMobile ? this.direction : null;
  }
  
  destroy() {
    if (this.pad && this.pad.parentNode) {
      this.pad.parentNode.removeChild(this.pad);
    }
    this.pad = null;
    this.direction = null;
  }
}

// Mode Switch UI - Toggle mit Icons (Haus und Kopf), im Toolbar-Stil
class ModeSwitch {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentMode = "build"; // "build" oder "character"
    this.callbacks = [];
    this.init();
  }
  
  init() {
    const toolbar = document.createElement("div");
    toolbar.classList.add("mode-switch");
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Modus");
    
    const makeButton = (id, icon, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("mode-switch-button");
      btn.id = id;
      btn.title = label;
      btn.setAttribute("aria-label", label);
      const iconImg = document.createElement("img");
      iconImg.src = icon;
      iconImg.alt = "";
      iconImg.draggable = false;
      btn.appendChild(iconImg);
      return btn;
    };
    
    const buildBtn = makeButton("mode-button-build", "icons/Bauen.png", "Bauen");
    const charBtn = makeButton("mode-button-character", "icons/Erkunden.png", "Erkunden");
    
    buildBtn.addEventListener("click", () => this.setMode("build"));
    charBtn.addEventListener("click", () => this.setMode("character"));
    
    toolbar.appendChild(buildBtn);
    toolbar.appendChild(charBtn);
    this.container.appendChild(toolbar);
    
    this.buildBtn = buildBtn;
    this.charBtn = charBtn;

    const controlsHint = document.createElement("aside");
    controlsHint.classList.add("character-controls-hint");
    controlsHint.setAttribute("aria-label", "Steuerung im Entdeckermodus: W, A, S und D");

    const hintLabel = document.createElement("span");
    hintLabel.classList.add("character-controls-label");
    hintLabel.textContent = "Steuern mit";

    const keys = document.createElement("span");
    keys.classList.add("character-controls-keys");
    keys.setAttribute("aria-hidden", "true");
    for (const rowKeys of [["W"], ["A", "S", "D"]]) {
      const row = document.createElement("span");
      row.classList.add("character-controls-row");
      for (const key of rowKeys) {
        const keyTile = document.createElement("span");
        keyTile.classList.add("character-control-key");
        keyTile.textContent = key;
        row.appendChild(keyTile);
      }
      keys.appendChild(row);
    }

    controlsHint.append(hintLabel, keys);
    this.container.appendChild(controlsHint);
    this.controlsHint = controlsHint;

    this.updateDisplay();
  }
  
  setMode(mode) {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.updateDisplay();
      this.callbacks.forEach(cb => cb(mode));
    }
  }
  
  updateDisplay() {
    const isCharacterMode = this.currentMode === "character";
    if (this.currentMode === "build") {
      this.buildBtn.classList.add("active");
      this.charBtn.classList.remove("active");
    } else {
      this.charBtn.classList.add("active");
      this.buildBtn.classList.remove("active");
    }
    this.controlsHint.hidden = !isCharacterMode;
  }
  
  onChange(callback) {
    this.callbacks.push(callback);
  }
}

// "Choose your fighter": modaler Pixel-Dialog mit scrollbarer Charakterliste
class CharacterSelectionBar {
  constructor(containerElement, characters = []) {
    this.container = containerElement;
    this.characters = characters;
    this.selectedCharacter = null;
    this.onSelectCallback = null;
    this.onCancelCallback = null;
    this.barElement = null;
    this.isVisible = false;
    this.onKeyDown = (e) => {
      if (e.key === "Escape") {
        this.cancel();
      }
    };
  }
  
  showNotice(onContinue, onCancel) {
    this.hide();
    this.onCancelCallback = onCancel;
    
    const overlay = document.createElement("div");
    overlay.classList.add("char-select");
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "notice-title");
    
    const panel = document.createElement("div");
    panel.classList.add("char-select-panel", "notice-panel");
    
    const title = document.createElement("h2");
    title.id = "notice-title";
    title.classList.add("char-select-title");
    title.textContent = "Achtung";
    
    const text = document.createElement("p");
    text.classList.add("notice-text");
    text.textContent = "Der Erkunden-Modus ist noch im Aufbau und hat aktuell noch keine Funktion.";
    
    const actions = document.createElement("div");
    actions.classList.add("char-select-actions");
    
    const back = document.createElement("button");
    back.type = "button";
    back.classList.add("pixel-button");
    back.textContent = "Zurück";
    back.addEventListener("click", () => this.cancel());
    
    const ok = document.createElement("button");
    ok.type = "button";
    ok.classList.add("pixel-button", "primary");
    ok.textContent = "Verstanden";
    ok.addEventListener("click", () => {
      this.hide();
      onContinue();
    });
    
    actions.append(back, ok);
    panel.append(title, text, actions);
    overlay.appendChild(panel);
    
    this.barElement = overlay;
    this.container.appendChild(overlay);
    document.addEventListener("keydown", this.onKeyDown);
    this.isVisible = true;
    ok.focus({ preventScroll: true });
  }
  
  show(onSelect, onCancel) {
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;
    this.selectedCharacter = null;
    
    if (this.barElement) {
      this.barElement.remove();
    }
    
    const overlay = document.createElement("div");
    overlay.classList.add("char-select");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "char-select-title");
    
    const panel = document.createElement("div");
    panel.classList.add("char-select-panel");
    
    const title = document.createElement("h2");
    title.id = "char-select-title";
    title.classList.add("char-select-title");
    title.textContent = "Wähle deinen Charakter";
    
    const row = document.createElement("div");
    row.classList.add("char-select-row");
    
    const makeArrow = (dir, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("char-arrow");
      btn.setAttribute("aria-label", label);
      btn.textContent = dir < 0 ? "<" : ">";
      return btn;
    };
    const prev = makeArrow(-1, "Zurückblättern");
    const next = makeArrow(1, "Weiterblättern");
    
    const list = document.createElement("div");
    list.classList.add("char-select-list");
    
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.classList.add("pixel-button", "primary");
    confirm.textContent = "Los";
    confirm.disabled = true;
    
    const cards = [];
    for (const char of this.characters) {
      const card = document.createElement("button");
      card.classList.add("char-card");
      card.type = "button";
      card.setAttribute("aria-label", `Charakter: ${char.name}`);
      
      const img = document.createElement("img");
      img.src = char.previewImage;
      img.alt = "";
      img.draggable = false;
      
      card.appendChild(img);
      card.addEventListener("click", () => {
        card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      });
      
      cards.push(card);
      list.appendChild(card);
    }
    
    // Der Charakter, der der Listenmitte am naechsten ist, ist im Fokus und gewaehlt
    const updateFocus = () => {
      const rect = list.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((card, i) => {
        const r = card.getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      cards.forEach((card, i) => card.classList.toggle("focused", i === best));
      this.selectedCharacter = this.characters[best] || null;
      confirm.disabled = !this.selectedCharacter;
    };
    list.addEventListener("scroll", () => requestAnimationFrame(updateFocus), { passive: true });
    
    const scrollBy = (dir) => {
      const step = (cards[0] ? cards[0].offsetWidth : 120) + 12;
      list.scrollBy({ left: dir * step, behavior: "smooth" });
    };
    prev.addEventListener("click", () => scrollBy(-1));
    next.addEventListener("click", () => scrollBy(1));
    list.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        list.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
    
    const actions = document.createElement("div");
    actions.classList.add("char-select-actions");
    
    const back = document.createElement("button");
    back.type = "button";
    back.classList.add("pixel-button");
    back.textContent = "Zurück";
    back.addEventListener("click", () => this.cancel());
    
    confirm.addEventListener("click", () => {
      if (this.selectedCharacter) {
        this.selectCharacter(this.selectedCharacter);
      }
    });
    
    actions.append(back, confirm);
    row.append(prev, list, next);
    panel.append(title, row, actions);
    overlay.appendChild(panel);
    
    this.barElement = overlay;
    this.container.appendChild(overlay);
    const centerPadding = () => {
      const w = cards[0] ? cards[0].offsetWidth : 0;
      list.style.paddingInline = `${Math.max(0, (list.clientWidth - w) / 2)}px`;
      updateFocus();
    };
    this.onResize = centerPadding;
    window.addEventListener("resize", centerPadding);
    centerPadding();
    document.addEventListener("keydown", this.onKeyDown);
    this.isVisible = true;
  }
  
  cancel() {
    const callback = this.onCancelCallback;
    this.hide();
    if (callback) {
      callback();
    }
  }
  
  selectCharacter(char) {
    this.selectedCharacter = char;
    const callback = this.onSelectCallback;
    this.hide();
    if (callback) {
      callback(char.name);
    }
  }
  
  hide() {
    document.removeEventListener("keydown", this.onKeyDown);
    if (this.onResize) {
      window.removeEventListener("resize", this.onResize);
      this.onResize = null;
    }
    if (this.barElement) {
      this.barElement.remove();
      this.barElement = null;
    }
    this.isVisible = false;
  }
}
