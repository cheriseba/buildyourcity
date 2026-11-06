// Virtual Touch Controller für Mobile (nur auf Mobile anzeigen)
class TouchController {
  constructor(containerElement, width = 120, height = 120) {
    this.container = containerElement;
    this.width = width;
    this.height = height;
    this.radius = width / 2;
    
    this.isDragging = false;
    this.centerX = 0;
    this.centerY = 0;
    this.currentX = 0;
    this.currentY = 0;
    
    // Startposition = Mitte, sonst laeuft der Character sofort los (Eingabe waere -1/-1)
    this.centerX = width / 2;
    this.centerY = height / 2;
    this.currentX = this.centerX;
    this.currentY = this.centerY;

    this.canvas = null;
    this.ctx = null;
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
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.classList.add("touch-controller");
    this.canvas.style.cssText = `
      position: fixed;
      bottom: calc(24px + env(safe-area-inset-bottom, 0px));
      right: calc(24px + env(safe-area-inset-right, 0px));
      width: ${this.width}px;
      height: ${this.height}px;
      z-index: 3;
      touch-action: none;
      image-rendering: pixelated;
    `;
    
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    
    const opts = { passive: false };
    this.canvas.addEventListener("touchstart", this.onTouchStart.bind(this), opts);
    this.canvas.addEventListener("touchmove", this.onTouchMove.bind(this), opts);
    this.canvas.addEventListener("touchend", this.onTouchEnd.bind(this), opts);
    this.canvas.addEventListener("touchcancel", this.onTouchEnd.bind(this), opts);
    
    this.draw();
  }
  
  onTouchStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.touchId = e.changedTouches[0].identifier;
    this.updatePosition(e.changedTouches[0]);
  }
  
  onTouchMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    const touch = Array.from(e.touches).find((t) => t.identifier === this.touchId);
    if (touch) this.updatePosition(touch);
  }
  
  onTouchEnd(e) {
    e.preventDefault();
    this.isDragging = false;
    this.currentX = this.centerX;
    this.currentY = this.centerY;
  }
  
  updatePosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > this.radius) {
      const angle = Math.atan2(dy, dx);
      this.currentX = this.centerX + Math.cos(angle) * this.radius;
      this.currentY = this.centerY + Math.sin(angle) * this.radius;
    } else {
      this.currentX = x;
      this.currentY = y;
    }
  }
  
  getInput() {
    if (!this.isMobile) return { x: 0, y: 0 };
    
    const dx = this.currentX - this.centerX;
    const dy = this.currentY - this.centerY;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    
    if (magnitude === 0) {
      return { x: 0, y: 0 };
    }
    
    const normalizedX = dx / this.radius;
    const normalizedY = dy / this.radius;
    
    return {
      x: Math.max(-1, Math.min(1, normalizedX)),
      y: Math.max(-1, Math.min(1, normalizedY))
    };
  }
  
  draw() {
    if (!this.canvas) return;
    
    const ctx = this.ctx;
    const px = 4;
    const snap = (v) => Math.round(v / px) * px;
    ctx.clearRect(0, 0, this.width, this.height);
    
    // Pixel-Platte: dunkler Rahmen, heller Innenrand
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#eef1ff";
    ctx.fillRect(px, px, this.width - 2 * px, this.height - 2 * px);
    ctx.fillStyle = "#1b1f45";
    ctx.fillRect(2 * px, 2 * px, this.width - 4 * px, this.height - 4 * px);
    
    // Fadenkreuz
    ctx.fillStyle = "rgba(238, 241, 255, 0.25)";
    ctx.fillRect(snap(this.centerX) - px / 2, 3 * px, px, this.height - 6 * px);
    ctx.fillRect(3 * px, snap(this.centerY) - px / 2, this.width - 6 * px, px);
    
    // Knopf
    const size = snap(this.radius * 0.6);
    const kx = snap(this.currentX - size / 2);
    const ky = snap(this.currentY - size / 2);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(kx - px, ky - px, size + 2 * px, size + 2 * px);
    ctx.fillStyle = this.isDragging ? "#b46cff" : "#7c9cff";
    ctx.fillRect(kx, ky, size, size);
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.fillRect(kx, ky, size, px);
    ctx.fillRect(kx, ky, px, size);
    
    requestAnimationFrame(() => this.draw());
  }
  
  destroy() {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
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
    if (this.currentMode === "build") {
      this.buildBtn.classList.add("active");
      this.charBtn.classList.remove("active");
    } else {
      this.charBtn.classList.add("active");
      this.buildBtn.classList.remove("active");
    }
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

