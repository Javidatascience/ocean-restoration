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

import { TREASURES } from './content.ts';

// ---- sector themes: every sector has its own name, look, litter and landmark ----------

export type Landmark = 'castle' | 'umbrella' | 'hut' | 'tower' | 'logs' | 'boulders' | 'fence' | 'surf' | 'pier' | 'pool' | 'wreck' | 'buoy' | 'reef' | 'none';

export interface ThemeDef {
  id: string;
  name: string;
  icon: string;
  zone: 'land' | 'shore' | 'sea';
  /** Base colour of the grime. */
  dirt: [number, number, number];
  /** Litter sprite kinds for small and big pieces (see sprites.trash). */
  small: number[];
  big: number[];
  litter: number;
  /** Ground decoration kinds (0 shell, 1 pebble, 2 grass, 3-5 coral, 6 seagrass, 7 rock) and how many. */
  decor: number[];
  decorN: number;
  palms: number;
  landmark: Landmark;
}

export const THEMES: ThemeDef[] = [
  { id: 'castle', name: 'Castillos de Arena', icon: '🏰', zone: 'land', dirt: [134, 116, 90], small: [0, 1, 2, 3], big: [4, 5], litter: 7, decor: [0, 0, 1, 2], decorN: 16, palms: 0, landmark: 'castle' },
  { id: 'picnic', name: 'Cala del Picnic', icon: '🧺', zone: 'land', dirt: [128, 106, 80], small: [1, 3, 3, 2, 1], big: [4], litter: 11, decor: [0, 1], decorN: 14, palms: 1, landmark: 'umbrella' },
  { id: 'dunes', name: 'Dunas del Viento', icon: '🌾', zone: 'land', dirt: [150, 132, 100], small: [1, 0], big: [4], litter: 6, decor: [2, 2, 2, 1], decorN: 30, palms: 0, landmark: 'fence' },
  { id: 'rocks', name: 'Punta Rocosa', icon: '🪨', zone: 'land', dirt: [112, 108, 100], small: [2, 0], big: [5, 4], litter: 7, decor: [1, 1, 7, 7], decorN: 24, palms: 0, landmark: 'boulders' },
  { id: 'grove', name: 'Palmeral', icon: '🌴', zone: 'land', dirt: [116, 104, 76], small: [0, 2, 1], big: [4], litter: 7, decor: [2, 0, 1], decorN: 16, palms: 4, landmark: 'none' },
  { id: 'bar', name: 'Chiringuito', icon: '🍹', zone: 'land', dirt: [126, 104, 86], small: [0, 2, 0, 3], big: [5], litter: 11, decor: [0, 1], decorN: 12, palms: 1, landmark: 'hut' },
  { id: 'drift', name: 'Bahía de los Troncos', icon: '🪵', zone: 'land', dirt: [98, 84, 66], small: [1, 0, 2], big: [4, 5], litter: 8, decor: [1, 2, 1], decorN: 16, palms: 0, landmark: 'logs' },
  { id: 'guard', name: 'Puesto de Socorrista', icon: '🛟', zone: 'land', dirt: [130, 114, 88], small: [3, 1, 0], big: [4], litter: 8, decor: [0, 1], decorN: 14, palms: 1, landmark: 'tower' },
  { id: 'pools', name: 'Pozas de Marea', icon: '🦀', zone: 'shore', dirt: [104, 104, 92], small: [0, 2], big: [6, 4], litter: 7, decor: [7, 7, 0, 6, 1], decorN: 22, palms: 0, landmark: 'pool' },
  { id: 'surf', name: 'Punta Surf', icon: '🏄', zone: 'shore', dirt: [126, 112, 90], small: [0, 3, 1], big: [4], litter: 8, decor: [0, 1, 6], decorN: 14, palms: 1, landmark: 'surf' },
  { id: 'pier', name: 'Muelle Viejo', icon: '🎣', zone: 'shore', dirt: [110, 96, 76], small: [0, 2], big: [6, 5], litter: 8, decor: [1, 6, 7], decorN: 14, palms: 0, landmark: 'pier' },
  { id: 'shallows', name: 'Aguas Turquesa', icon: '🐠', zone: 'sea', dirt: [80, 96, 76], small: [0, 1], big: [6], litter: 7, decor: [6, 6, 7], decorN: 14, palms: 0, landmark: 'none' },
  { id: 'coral', name: 'Jardín de Coral', icon: '🪸', zone: 'sea', dirt: [84, 92, 80], small: [1, 0], big: [6], litter: 7, decor: [3, 4, 5, 3, 4, 5, 6], decorN: 28, palms: 0, landmark: 'reef' },
  { id: 'kelp', name: 'Bosque de Algas', icon: '🌿', zone: 'sea', dirt: [62, 90, 58], small: [1, 0, 2], big: [6], litter: 7, decor: [6, 6, 6, 7], decorN: 32, palms: 0, landmark: 'none' },
  { id: 'wreck', name: 'Arrecife del Naufragio', icon: '⚓', zone: 'sea', dirt: [70, 76, 70], small: [2, 0], big: [5, 6], litter: 9, decor: [7, 3, 6], decorN: 14, palms: 0, landmark: 'wreck' },
  { id: 'fishing', name: 'Caladero', icon: '🐟', zone: 'sea', dirt: [76, 88, 74], small: [1, 0], big: [6, 6, 4], litter: 9, decor: [6, 7], decorN: 10, palms: 0, landmark: 'buoy' },
];

/** Theme of every sector: fixed for everyone, neighbours never share one. */
export const THEME_OF: number[] = (() => {
  const rand = rng(2468);
  const out: number[] = [];
  const pick = (zone: ThemeDef['zone']) => THEMES.map((t, i) => (t.zone === zone ? i : -1)).filter((i) => i >= 0);
  for (let id = 0; id < SECTOR_N; id++) {
    const row = Math.floor(id / SCOLS);
    const zone = row >= SEA_ROWS ? 'land' : row === SEA_ROWS - 1 ? 'shore' : 'sea';
    const options = pick(zone);
    let t = options[Math.floor(rand() * options.length)]!;
    for (let k = 0; k < 6; k++) {
      const left = id % SCOLS > 0 ? out[id - 1] : -1;
      const up = row > 0 ? out[id - SCOLS] : -1;
      if (t !== left && t !== up) break;
      t = options[Math.floor(rand() * options.length)]!;
    }
    out.push(t);
  }
  out[START_SECTOR] = 0;
  return out;
})();
export const theme = (id: number): ThemeDef => THEMES[THEME_OF[id]!]!;

export interface LandmarkSpot { x: number; y: number; sector: number; kind: Landmark; flip: number }

/** One landmark per sector that has one, placed on the right terrain. */
export const LANDMARKS: LandmarkSpot[] = (() => {
  const rand = rng(1357);
  const out: LandmarkSpot[] = [];
  for (let id = 0; id < SECTOR_N; id++) {
    const th = theme(id);
    if (th.landmark === 'none') continue;
    const x0 = (id % SCOLS) * SECTOR;
    const y0 = Math.floor(id / SCOLS) * SECTOR;
    const flip = rand() < 0.5 ? -1 : 1;
    for (let k = 0; k < 20; k++) {
      const x = x0 + 70 + rand() * (SECTOR - 140);
      let y = y0 + 70 + rand() * (SECTOR - 140);
      if (th.zone === 'shore') {
        if (th.landmark === 'pier') y = shoreY(x) + 8;
        else y = shoreY(x) + (th.landmark === 'pool' ? 22 : 40) + rand() * 30;
        if (y > y0 + SECTOR - 10) continue;
      } else if (th.zone === 'sea' ? !isWater(x, y - 30) : isWater(x, y)) continue;
      if (id === START_SECTOR && Math.hypot(x - (x0 + SECTOR / 2), y - (y0 + SECTOR * 0.8)) < 60) continue;
      out.push({ x, y, sector: id, kind: th.landmark, flip });
      break;
    }
  }
  return out;
})();

export interface MissionSpot { x: number; y: number; sector: number; variant: number; water: boolean }

/** Where each sector's errand item lies: on the right terrain, away from its landmark. */
export const MISSION_SPOTS: MissionSpot[] = (() => {
  const rand = rng(8642);
  const out: MissionSpot[] = [];
  for (let id = 0; id < SECTOR_N; id++) {
    const th = theme(id);
    const x0 = (id % SCOLS) * SECTOR;
    const y0 = Math.floor(id / SCOLS) * SECTOR;
    const mark = LANDMARKS.find((l) => l.sector === id);
    const variant = rand() < 0.5 ? 0 : 1;
    for (let k = 0; k < 30; k++) {
      const x = x0 + 40 + rand() * (SECTOR - 80);
      const y = y0 + 40 + rand() * (SECTOR - 80);
      const water = isWater(x, y);
      if (Math.abs(y - shoreY(x)) < 20) continue;
      if (th.zone === 'land' && water) continue;
      if (th.zone === 'sea' && !water) continue;
      if (th.zone === 'shore' && water !== (th.id === 'surf')) continue;
      if (mark && Math.hypot(mark.x - x, mark.y - y) < 80) continue;
      out.push({ x, y, sector: id, variant, water });
      break;
    }
  }
  return out;
})();

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
    const th = theme(id);
    for (let i = 0; i < th.litter; i++) {
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
      const list = size === 0 ? th.small : th.big;
      const kind = size === 3 ? (water ? 6 : 5) : list[Math.floor(rand() * list.length)]!;
      out.push({ x, y, sector: id, size, kind, rot: (rand() - 0.5) * 1.2, water });
    }
  }
  return out;
})();

// ---- treasure buried under the dirt -------------------------------------------

export interface Buried {
  x: number;
  y: number;
  sector: number;
  kind: number;
  water: boolean;
}

export const BURIED: Buried[] = (() => {
  const rand = rng(31337);
  const total = TREASURES.reduce((a, t) => a + t.weight, 0);
  const out: Buried[] = [];
  for (let id = 0; id < SECTOR_N; id++) {
    for (let i = 0; i < 2; i++) {
      const x = (id % SCOLS) * SECTOR + 20 + rand() * (SECTOR - 40);
      const y = Math.floor(id / SCOLS) * SECTOR + 20 + rand() * (SECTOR - 40);
      let roll = rand() * total;
      if (Math.abs(y - shoreY(x)) < 12) continue;
      let kind = 0;
      while (kind < TREASURES.length - 1 && roll > TREASURES[kind]!.weight) { roll -= TREASURES[kind]!.weight; kind++; }
      out.push({ x, y, sector: id, kind, water: isWater(x, y) });
    }
  }
  return out;
})();
