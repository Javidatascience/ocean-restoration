import { SECTOR_START, SECTOR_TRASH, UPGRADES, UNITS, type UpgradeId, type UnitId } from './content.ts';

export interface GameState {
  v: 1;
  coins: number;
  waste: number;
  rep: number;
  /** Accumulated restoration points (waste cleaned × ecology multipliers). */
  restorePts: number;
  /** Whole restoration percent already paid out as reputation. */
  repAwardedPct: number;
  totalWaste: number;
  totalCoins: number;
  upgrades: Record<UpgradeId, number>;
  units: Record<UnitId, number>;
  recycler: number;
  research: string[];
  animals: string[];
  milestones: number[];
  beachRewarded: boolean;
  reefCharted: boolean;
  /** Index of the current goal in GOALS. */
  goal: number;
  /** Open sector ids, trash still lying in each, and the ones swept completely clean. */
  sectors: number[];
  sectorLeft: Record<number, number>;
  sectorsCleared: number[];
  sound: boolean;
  lastSeen: number;
}

export function newState(now = Date.now()): GameState {
  const upgrades = {} as Record<UpgradeId, number>;
  for (const u of UPGRADES) upgrades[u.id] = 0;
  const units = {} as Record<UnitId, number>;
  for (const u of UNITS) units[u.id] = 0;
  return {
    v: 1, coins: 0, waste: 0, rep: 0, restorePts: 0, repAwardedPct: 0, totalWaste: 0, totalCoins: 0,
    upgrades, units, recycler: 0, research: [], animals: [], milestones: [],
    beachRewarded: false, reefCharted: false, goal: 0, sound: true, lastSeen: now,
    sectors: [...SECTOR_START], sectorLeft: Object.fromEntries(SECTOR_START.map((id) => [id, SECTOR_TRASH])), sectorsCleared: [],
  };
}

const KEY = 'ocean-restoration-save-v1';

export function save(s: GameState): void {
  s.lastSeen = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode): the game still runs, just without saving */
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<GameState>;
    if (data.v !== 1) return null;
    // Merge over a fresh state so saves from older builds pick up newly added fields.
    const base = newState();
    return {
      ...base, ...data,
      upgrades: { ...base.upgrades, ...data.upgrades },
      units: { ...base.units, ...data.units },
      sectorLeft: data.sectors ? { ...data.sectorLeft } : base.sectorLeft,
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
