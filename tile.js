class Tile {
  constructor(gx, gy, img) {
    this.gx = gx;
    this.gy = gy;
    this.key = Board.key(gx, gy);
    const pos = gridToScreen(gx, gy);
    this.x = pos.x;
    this.y = pos.y;
    this.drawW = TILE_IMG;
    this.drawH = TILE_IMG;
    this.minX = this.maxX = gx;
    this.minY = this.maxY = gy;
    this.ground = img;
    this.groundType = "UNDER";
    this.overlay = null;
    this.owner = null; // Building, das diese Zelle belegt
    this.locked = false; // fest (Startlayout), nicht veraenderbar
  }

  // UNDER setzt den Boden und laesst ein Overlay stehen, OVER legt ein Overlay auf den Boden,
  // FULL ersetzt das ganze Feld (Boden + Overlay).
  place(image, type) {
    if (type === "OVER") {
      this.overlay = image;
    } else if (type === "UNDER") {
      this.ground = image;
      this.groundType = "UNDER";
    } else {
      this.ground = image;
      this.groundType = "FULL";
      this.overlay = null;
    }
  }

  // Zurueck auf Ausgangszustand: nur Boden, kein Overlay
  reset(groundImage) {
    this.ground = groundImage;
    this.groundType = "UNDER";
    this.overlay = null;
  }

  // Skaliert nach Breite (Seitenverhaeltnis bleibt), Unterkante bleibt auf der Zelle:
  // hoehere Bilder ragen nach oben ueber das Tile hinaus statt gestaucht zu werden.
  drawImage(img) {
    const h = (img.height * TILE_IMG) / img.width;
    image(img, this.x, this.y + TILE_IMG - h, TILE_IMG, h);
  }

  show() {
    this.drawImage(this.ground);

    if (this.overlay) {
      this.drawImage(this.overlay);
    }
  }

  bounding() {
    stroke(255, 50);
    strokeWeight(1);
    noFill();

    const cx = this.x + CELL_CENTER_X;
    const cy = this.y + CELL_CENTER_Y;
    quad(cx, cy - CELL_H / 2, cx + CELL_W / 2, cy, cx, cy + CELL_H / 2, cx - CELL_W / 2, cy);
  }
}

// Mehrzelliges Gebaeude (FULL): w Zellen entlang gx, h Zellen entlang gy.
// anchor ist die hinterste Zelle (kleinstes gx/gy). Das Bild ist (w+h)*32 px breit, die Unterkante liegt
// auf der Unterkante der vordersten Zelle (wie bei 1x1-Tiles inkl. 8 px Bodendicke).
class Building {
  constructor(anchor, w, h, image) {
    this.anchor = anchor;
    this.w = w;
    this.h = h;
    this.image = image;
    this.minX = anchor.gx;
    this.maxX = anchor.gx + w - 1;
    this.minY = anchor.gy;
    this.maxY = anchor.gy + h - 1;
    this.cells = [];

    this.drawW = ((w + h) * CELL_W) / 2;
    this.drawH = (image.height * this.drawW) / image.width;
    this.x = anchor.x - ((h - 1) * CELL_W) / 2;
    this.y = anchor.y + ((w + h - 2) * CELL_H) / 2 + TILE_IMG - this.drawH;
  }

  show() {
    for (const cell of this.cells) {
      cell.drawImage(cell.ground);
    }

    image(this.image, this.x, this.y, this.drawW, this.drawH);
  }
}
