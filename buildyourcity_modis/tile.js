class Tile {
  constructor(x, y, img) {
    this.x = x;
    this.y = y;
    this.tiles = img;
    this.r = 64;
  }

  move() {
    this.x = this.x + random(-5, 5);
    this.y = this.y + random(-5, 5);
  }

  contains(px, py) {
    return px > this.x && px < this.x + 64 && py > this.y + 32 && py < this.y + 48;
  }

  setTile(newTileImage) {
    this.tiles = newTileImage;
  }

  show() {
    
    image(this.tiles, this.x, this.y, 64, 64);
  }

    bounding() {
  
      stroke(255,50);
      strokeWeight(1);
      noFill();

      rect(this.x, this.y + 32, 64, 16);
    }


}
