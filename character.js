// Character-Klasse für den Character-Modus
class GameCharacter {
  constructor(characterDefPath) {
    this.characterPath = characterDefPath; // z.B. "character/char_1"
    this.gx = 0;      // Float Position X
    this.gy = 0;      // Float Position Y
    this.targetGx = 0;  // Ziel-Tile X
    this.targetGy = 0;  // Ziel-Tile Y
    
    // Animation State
    this.isMoving = false;  // Gerade in Bewegung?
    this.moveProgress = 0;  // 0 bis 1 (0 = start, 1 = ziel erreicht)
    this.lastDirection = "front"; // "front" oder "back"
    
    // Assets
    this.images = {};
    this.tileSize = 32;
  }
  
  // Preload Assets
  preloadAssets() {
    const paths = {
      idleFront: `${this.characterPath}/vorn.png`,
      idleBack: `${this.characterPath}/hinten.png`,
      animFront: `${this.characterPath}/animiert_vorn.gif`,
      animBack: `${this.characterPath}/animiert_hinten.gif`
    };

    for (const [key, path] of Object.entries(paths)) {
      this.images[key] = loadImage(path, undefined, (error) => {
        console.error(`Charakterbild konnte nicht geladen werden: ${path}`, error);
        this.images[key] = null;
      });
    }
  }
  
  // Initialisierung - Platziere Character auf dem Grid
  init(tileSize, gridX, gridY) {
    this.tileSize = tileSize;
    this.gx = gridX;
    this.gy = gridY;
    this.targetGx = gridX;
    this.targetGy = gridY;
    this.isMoving = false;
    this.moveProgress = 0;
    this.lastDirection = "front";
  }
  
  // Setze Ziel-Tile basierend auf Input (WASD)
  startMovement(direction) {
    if (this.isMoving) return;  // Bereits in Bewegung
    
    let newGx = this.targetGx;
    let newGy = this.targetGy;
    
    // Die vier visuellen Nachbarn im isometrischen Grid:
    // Oben-links: gx++, gy (unverändert)
    // Oben-rechts: gx--, gy (unverändert)
    // Unten-links: gx (unverändert), gy++
    // Unten-rechts: gx (unverändert), gy--
    
    switch (direction) {
      case "up-right":   newGy--; break;   // Oben-rechts
      case "up-left":    newGx--; break;   // Oben-links
      case "down-left":  newGy++; break;   // Unten-links
      case "down-right": newGx++; break;   // Unten-rechts
    }
    
    // Prüfe ob Ziel-Tile begehbar ist
    if (!this.canWalkOn(newGx, newGy)) {
      return;  // Kann nicht dahin gehen
    }
    
    // Setze lastDirection für Animation
    if (direction === "up-left" || direction === "up-right") {
      this.lastDirection = "back";
    } else {
      this.lastDirection = "front";
    }
    
    // Starte Bewegung zum Ziel-Tile
    this.targetGx = newGx;
    this.targetGy = newGy;
    this.isMoving = true;
    this.moveProgress = 0;
  }
  
  // Update Animation - interpoliere zwischen aktuellem und Ziel-Tile
  updateMovement() {
    if (!this.isMoving) return;
    
    // Erhöhe Progress um 1/54 pro Frame (54 Frames = eine komplette Bewegung)
    this.moveProgress += 1 / 54;
    
    if (this.moveProgress >= 1) {
      // Bewegung abgeschlossen
      this.gx = this.targetGx;
      this.gy = this.targetGy;
      this.isMoving = false;
      this.moveProgress = 0;
    } else {
      // Interpoliere zwischen aktuellem und Ziel-Tile
      const startGx = this.targetGx - (this.targetGx > this.gx ? 1 : this.targetGx < this.gx ? -1 : 0);
      const startGy = this.targetGy - (this.targetGy > this.gy ? 1 : this.targetGy < this.gy ? -1 : 0);
      
      this.gx = startGx + (this.targetGx - startGx) * this.moveProgress;
      this.gy = startGy + (this.targetGy - startGy) * this.moveProgress;
    }
  }
  
  // Prüfe ob man auf diesem Tile laufen kann (UNDER Tiles, kein blockierendes OVER, kein Building)
  canWalkOn(gridX, gridY) {
    // Hole das Tile vom Board
    const tile = board.get(gridX, gridY);
    
    // Nur begehbar wenn:
    // 1. UNDER Tile (der Grund)
    // 2. Kein Overlay (OVER Tile darauf)
    // 3. Nicht von einem Building besetzt
    return tile && 
           tile.groundType === "UNDER" && 
           !tile.overlay && 
           !tile.owner;  // Gebäude/Buildings blockieren
  }
  
  // Properties für Tiefensortierung (z-order) wie Buildings
  get minX() { return this.gx; }
  get maxX() { return this.gx; }
  get minY() { return this.gy; }
  get maxY() { return this.gy; }

  getDisplayImage() {
    const direction = this.lastDirection === "front" ? "Front" : "Back";
    const idleImage = this.images[`idle${direction}`];
    if (!this.isMoving) {
      return idleImage;
    }

    const animatedImage = this.images[`anim${direction}`];
    return animatedImage && animatedImage.width > 0 && animatedImage.height > 0
      ? animatedImage
      : idleImage;
  }

  // Zeichne den Character
  display() {
    const screenPos = gridToScreen(this.gx, this.gy);
    const pixelX = screenPos.x + CELL_CENTER_X - this.tileSize / 2;
    const pixelY = screenPos.y + CELL_CENTER_Y - this.tileSize / 2;
    
    // Diese Properties werden für das Rendering-System benötigt (z-order sorting)
    this.x = pixelX;
    this.y = pixelY;
    this.drawW = this.tileSize;
    this.drawH = this.tileSize;
    
    // WICHTIG: Nicht hier rendern! Das wird in der Render-Loop in game.js gemacht
    // Hier aktualisieren wir nur die Position für die z-order Sortierung
  }
}

// Character-Manager
class CharacterManager {
  constructor() {
    this.characters = new Map(); // name -> GameCharacter
    this.currentCharacter = null;
  }
  
  addCharacter(name, path) {
    const char = new GameCharacter(path);
    this.characters.set(name, char);
    return char;
  }
  
  selectCharacter(name) {
    if (this.characters.has(name)) {
      this.currentCharacter = this.characters.get(name);
      return true;
    }
    return false;
  }
  
  getAvailableCharacters() {
    return Array.from(this.characters.keys());
  }
  
  // Preload alle Character-Assets
  preloadAll() {
    for (const [name, char] of this.characters) {
      char.preloadAssets();
    }
  }
}
