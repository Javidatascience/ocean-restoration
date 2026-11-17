// World geometry: a big coast seen from above, split into sectors and covered in a fine grid of dirt.
// Pure functions only, shared by the rules, the renderer and the tests.

/** World pixels per dirt cell. */
export const CELL = 4;
/** World pixels per sector side. */
export const SECTOR = 320;
export const SCOLS = 10;
export const SROWS = 20;
export const WORLD_W = SCOLS * SECTOR;
export const WORLD_H = SROWS * SECTOR;
export const GW = WORLD_W / CELL;
export const GH = WORLD_H / CELL;
export const SECTOR_N = SCOLS * SROWS;
export const CELLS_PER_SECTOR = (SECTOR / CELL) ** 2;
/** Rows 0..SEA_ROWS-1 are sea (the last of them holds the shoreline). Rows below are sand. */
export const SEA_ROWS = 7;
/** You start at the bottom of the map, in the middle. */
export const START_SECTOR = (SROWS - 1) * SCOLS + 4;
/** A sector counts as clean (and the last specks are swept for you) below this much dirt. */
export const DONE_FRACTION = 0.03;

/** World y of the shoreline at world x. Water above, sand below. Always inside the last sea row. */
export function shoreY(x: number): number {
  const mid = (SEA_ROWS - 0.5) * SECTOR;
  return mid + Math.sin(x * 0.0042 + 0.6) * 70 + Math.sin(x * 0.013 + 2.1) * 26 + Math.sin(x * 0.041) * 8;
}

export const sectorCol = (id: number): number => id % SCOLS;
export const sectorRow = (id: number): number => Math.floor(id / SCOLS);
export const isSeaSector = (id: number): boolean => sectorRow(id) < SEA_ROWS;

export function sectorAt(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return -1;
  return Math.floor(y / SECTOR) * SCOLS + Math.floor(x / SECTOR);
}
export function sectorOfCell(gx: number, gy: number): number {
  return Math.floor((gy * CELL) / SECTOR) * SCOLS + Math.floor((gx * CELL) / SECTOR);
}

/** Distance (in sectors) from the starting sector: further away is dirtier and pays more. */
export function ring(id: number): number {
  return Math.abs(sectorCol(id) - sectorCol(START_SECTOR)) + Math.abs(sectorRow(id) - sectorRow(START_SECTOR));
}

export function neighbours(id: number): number[] {
  const c = sectorCol(id);
  const r = sectorRow(id);
  const out: number[] = [];
  if (c > 0) out.push(id - 1);
  if (c < SCOLS - 1) out.push(id + 1);
  if (r > 0) out.push(id - SCOLS);
  if (r < SROWS - 1) out.push(id + SCOLS);
  return out;
}

/** "C7"-style name: column letter, row number counted from the bottom. */
export function sectorName(id: number): string {
  return String.fromCharCode(65 + sectorCol(id)) + (SROWS - sectorRow(id));
}

/** Shoreline per cell column, in cell rows: cells with gy below this are water. */
export const SHORE_CELL: Float32Array = (() => {
  const a = new Float32Array(GW);
  for (let gx = 0; gx < GW; gx++) a[gx] = shoreY(gx * CELL + CELL / 2) / CELL;
  return a;
})();
export const isWaterCell = (gx: number, gy: number): boolean => gy + 0.5 < SHORE_CELL[gx]!;
export const isWater = (x: number, y: number): boolean => y < shoreY(x);

// ---- litter: bigger pieces scattered on top of the dirt ---------------------

export interface Litter {
  x: number;
  y: number;
  sector: number;
  /** 0 = small … 3 = huge. Bigger pieces need a bigger tool. */
  size: number;
  /** Sprite kind (see sprites.trash). */
  kind: number;
  rot: number;
  water: boolean;
}

export const LITTER_RADIUS = [5, 9, 15, 24];
/** Tool tier needed to pick up each litter size. */
export const LITTER_TIER = [0, 2, 4, 6];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same litter for everyone, every time: generated from a fixed seed. */
export const LITTER: Litter[] = (() => {
  const rand = rng(77001);
  const out: Litter[] = [];
  for (let id = 0; id < SECTOR_N; id++) {
    const d = ring(id);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = (id % SCOLS) * SECTOR + 18 + rand() * (SECTOR - 36);
      const y = Math.floor(id / SCOLS) * SECTOR + 18 + rand() * (SECTOR - 36);
      const water = isWater(x, y);
      if (Math.abs(y - shoreY(x)) < 14) continue;
      const roll = rand();
      // Far sectors hold bigger junk.
      const bigness = Math.min(0.85, d * 0.07);
      let size = 0;
      if (roll < bigness * 0.25) size = 3;
      else if (roll < bigness * 0.55) size = 2;
      else if (roll < bigness) size = 1;
      const kind = size === 0 ? Math.floor(rand() * 4) : size === 1 ? (water ? 6 : 4) : size === 2 ? (water ? 6 : 5) : 5;
      out.push({ x, y, sector: id, size, kind, rot: (rand() - 0.5) * 1.2, water });
    }
  }
  return out;
})();
