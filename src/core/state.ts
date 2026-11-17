import { HELPERS, UPGRADES, type HelperId, type UpgradeId } from './content.ts';
import { BURIED, GW, GH, LITTER, SECTOR, START_SECTOR, sectorCol, sectorRow } from './world.ts';

export interface GameState {
  v: 2;
  coins: number;
  totalCoins: number;
  /** Dirt cells swept so far (all time). */
  cleaned: number;
  /** Litter pieces picked up (all time). */
  picked: number;
  tool: number;
  upgrades: Record<UpgradeId, number>;
  helpers: Record<HelperId, number>;
  boat: boolean;
  sectors: number[];
  done: number[];
  animals: string[];
  goal: number;
  sound: boolean;
  lastSeen: number;
  px: number;
  py: number;
  /** Dirt grid, 1 bit per cell (1 = dirty), base64. Empty string = all dirty. */
  dirt: string;
  /** Litter picked up, 1 bit per piece, base64. */
  litter: string;
  /** Buried treasure dug up, 1 bit per spot, base64. */
  dug: string;
  /** How many of each treasure kind you have found. */
  finds: Record<string, number>;
}

export function newState(now = Date.now()): GameState {
  const upgrades = {} as Record<UpgradeId, number>;
  for (const u of UPGRADES) upgrades[u.id] = 0;
  const helpers = {} as Record<HelperId, number>;
  for (const h of HELPERS) helpers[h.id] = 0;
  return {
    v: 2, coins: 0, totalCoins: 0, cleaned: 0, picked: 0, tool: 0, upgrades, helpers, boat: false,
    sectors: [START_SECTOR], done: [], animals: [], goal: 0, sound: true, lastSeen: now,
    px: (sectorCol(START_SECTOR) + 0.5) * SECTOR, py: (sectorRow(START_SECTOR) + 0.8) * SECTOR,
    dirt: '', litter: '', dug: '', finds: {},
  };
}

// ---- bitsets ---------------------------------------------------------------

export function encodeBits(bits: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3]! |= 1 << (i & 7);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function decodeBits(s: string, n: number, fill: number): Uint8Array {
  const out = new Uint8Array(n).fill(fill);
  if (!s) return out;
  try {
    const bin = atob(s);
    for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch {
    /* corrupt: start fresh */
  }
  return out;
}

export const DIRT_CELLS = GW * GH;
export const LITTER_N = LITTER.length;
export const BURIED_N = BURIED.length;

// ---- persistence -----------------------------------------------------------

const KEY = 'ocean-restoration-save-v2';

export function save(s: GameState): void {
  s.lastSeen = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the game still runs, just without saving */
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<GameState>;
    if (data.v !== 2) return null;
    const base = newState();
    return {
      ...base, ...data,
      upgrades: { ...base.upgrades, ...data.upgrades },
      helpers: { ...base.helpers, ...data.helpers },
    } as GameState;
  } catch {
    return null;
  }
}

export function wipe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
