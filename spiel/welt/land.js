const PARCEL_SIZE = 512;
const LAND_ORIGIN = -256;
const LAND_SCROLL_MARGIN = 64;
const LAND_NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const LAND_UNLOCK_NEIGHBORS = LAND_NEIGHBORS.filter(([, dy]) => dy !== -1);

class WorldLand {
  constructor(parcels = WorldLand.initialParcels()) {
    WorldLand.validate(parcels);
    this.parcels = new Map(parcels.map(([x, y]) => [WorldLand.key(x, y), { x, y }]));
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  static initialParcels() {
    return [[0, 1], [1, 1]];
  }

  static legacyParcels() {
    return Array.from({ length: 9 }, (_, i) => [i % 3, Math.floor(i / 3)]);
  }

  static validCoordinate(value) {
    return Number.isSafeInteger(value) && Number.isSafeInteger(LAND_ORIGIN + value * PARCEL_SIZE) &&
      Number.isSafeInteger(LAND_ORIGIN + (value + 1) * PARCEL_SIZE);
  }

  static validate(parcels) {
    if (!Array.isArray(parcels) || !parcels.length || parcels.some((p) =>
      !Array.isArray(p) || p.length !== 2 || !p.every(WorldLand.validCoordinate))) {
      throw new Error("Ungueltige Grundstuecke im Spielstand");
    }
    const remaining = new Set(parcels.map(([x, y]) => WorldLand.key(x, y)));
    if (remaining.size !== parcels.length || !remaining.has("1,1")) {
      throw new Error("Startgebiet fehlt oder Grundstuecke sind doppelt");
    }
    const queue = [[1, 1]];
    remaining.delete("1,1");
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of LAND_NEIGHBORS) {
        if (remaining.delete(WorldLand.key(x + dx, y + dy))) queue.push([x + dx, y + dy]);
      }
    }
    if (remaining.size) throw new Error("Grundstuecke muessen zusammenhaengen");
  }

  snapshot() {
    return [...this.parcels.values()].map(({ x, y }) => [x, y]);
  }

  rect({ x, y }) {
    return {
      minX: LAND_ORIGIN + x * PARCEL_SIZE,
      minY: LAND_ORIGIN + y * PARCEL_SIZE,
      maxX: LAND_ORIGIN + (x + 1) * PARCEL_SIZE,
      maxY: LAND_ORIGIN + (y + 1) * PARCEL_SIZE,
    };
  }

  regions() {
    return [...this.parcels.values()].map((parcel) => this.rect(parcel));
  }

  bounds() {
    const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const rect of this.regions()) {
      result.minX = Math.min(result.minX, rect.minX);
      result.minY = Math.min(result.minY, rect.minY);
      result.maxX = Math.max(result.maxX, rect.maxX);
      result.maxY = Math.max(result.maxY, rect.maxY);
    }
    return result;
  }

  contains(wx, wy) {
    return this.parcels.has(WorldLand.key(
      Math.floor((wx - LAND_ORIGIN) / PARCEL_SIZE),
      Math.floor((wy - LAND_ORIGIN) / PARCEL_SIZE)
    ));
  }

  canUnlock(x, y) {
    return WorldLand.validCoordinate(x) && WorldLand.validCoordinate(y) &&
      !this.parcels.has(WorldLand.key(x, y)) &&
      LAND_UNLOCK_NEIGHBORS.some(([dx, dy]) => this.parcels.has(WorldLand.key(x + dx, y + dy)));
  }

  frontier() {
    const candidates = new Map();
    for (const { x, y } of this.parcels.values()) {
      for (const [dx, dy] of LAND_NEIGHBORS) {
        if (this.canUnlock(x + dx, y + dy)) {
          candidates.set(WorldLand.key(x + dx, y + dy), { x: x + dx, y: y + dy });
        }
      }
    }
    return [...candidates.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  unlock(x, y) {
    if (!this.canUnlock(x, y)) throw new Error("Nur angrenzende, freie Grundstuecke oberhalb oder seitlich koennen freigeschaltet werden");
    this.parcels.set(WorldLand.key(x, y), { x, y });
  }
}
