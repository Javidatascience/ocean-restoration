// Pure game rules: no DOM, no timers. Shared by the game loop, offline progress, tests and the balance tool.
import { ANIMALS, BOAT_COST, GOALS, HELPERS, TOOLS, UPGRADES, type GoalDef, type HelperId, type UpgradeId } from './content.ts';
import { DIRT_CELLS, LITTER_N, decodeBits, encodeBits, type GameState } from './state.ts';
import {
  CELL, CELLS_PER_SECTOR, DONE_FRACTION, GH, GW, LITTER, LITTER_RADIUS, LITTER_TIER, SECTOR, SECTOR_N, SEA_ROWS, SCOLS,
  isSeaSector, isWaterCell, neighbours, ring, sectorOfCell, sectorRow,
} from './world.ts';

export type GameEvent =
  | { kind: 'animal'; id: string }
  | { kind: 'sector'; id: number; bonus: number }
  | { kind: 'complete' };

// ---- the field: live dirt + litter --------------------------------------------

/** Runtime copy of the dirt grid and litter, with per-sector counters. Serialised into the save. */
export class Field {
  readonly dirt: Uint8Array;
  readonly picked: Uint8Array;
  readonly left = new Int32Array(SECTOR_N);
  totalLeft = 0;
  readonly open = new Uint8Array(SECTOR_N);
  /** Called for every cell that becomes clean (the renderer repaints it). */
  onCell: ((gx: number, gy: number) => void) | null = null;

  constructor(s: GameState) {
    this.dirt = decodeBits(s.dirt, DIRT_CELLS, 1);
    this.picked = decodeBits(s.litter, LITTER_N, 0);
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        if (this.dirt[gy * GW + gx]) { this.left[sectorOfCell(gx, gy)]!++; this.totalLeft++; }
      }
    }
    this.syncOpen(s);
  }
  syncOpen(s: GameState): void {
    this.open.fill(0);
    for (const id of s.sectors) this.open[id] = 1;
  }
  store(s: GameState): void {
    s.dirt = encodeBits(this.dirt);
    s.litter = encodeBits(this.picked);
  }
  /** Fraction of a sector already clean, 0..1. */
  sectorClean(id: number): number {
    return 1 - this.left[id]! / CELLS_PER_SECTOR;
  }
}

/** Percent of the whole coast that is clean. */
export function pct(f: Field): number {
  return 100 * (1 - f.totalLeft / DIRT_CELLS);
}

// ---- derived stats --------------------------------------------------------------

export const tool = (s: GameState) => TOOLS[s.tool]!;
export const toolRadius = (s: GameState): number => tool(s).radius;

export function moveSpeed(s: GameState, onWater = false): number {
  const v = 42 * tool(s).speed * (1 + 0.12 * s.upgrades.boots);
  return onWater ? v * 0.95 : v;
}
export function coinMult(s: GameState): number {
  return 1 + 0.15 * s.upgrades.sorting;
}
/** Base coins per dirt cell in a sector, before Sorting Skills. Further and wetter pays more. */
export function cellBase(id: number): number {
  return Math.pow(1.25, ring(id)) * (isSeaSector(id) ? 1.5 : 1);
}
export function cellValue(s: GameState, id: number): number {
  return cellBase(id) * coinMult(s);
}
export function sectorValue(id: number): number {
  return CELLS_PER_SECTOR * cellBase(id);
}
export function litterValue(s: GameState, i: number): number {
  const l = LITTER[i]!;
  return cellValue(s, l.sector) * [10, 50, 240, 1000][l.size]!;
}
/** Extra pick-up reach from the Trash Magnet, in world pixels. */
export function magnetRange(s: GameState): number {
  return s.upgrades.magnet * (5 + toolRadius(s) * 0.5);
}
export function helperRadius(s: GameState): number {
  return 3 + toolRadius(s) * 0.25;
}
export const HELPER_SPEED = 26;
/** Approximate cells per second a sweeper of this radius and speed clears while working. */
export function sweepRate(radius: number, speed: number, efficiency = 0.6): number {
  return (2 * radius * speed * efficiency) / (CELL * CELL);
}
export function playerRate(s: GameState): number {
  return sweepRate(toolRadius(s), moveSpeed(s));
}
export function helperRate(s: GameState, id: HelperId): number {
  return s.helpers[id] * sweepRate(helperRadius(s), HELPER_SPEED, 0.7);
}

// ---- costs & purchases ------------------------------------------------------------

export function nextTool(s: GameState) {
  return TOOLS[s.tool + 1];
}
export function canBuyTool(s: GameState): boolean {
  const t = nextTool(s);
  return !!t && s.coins >= t.cost;
}
export function buyTool(s: GameState): boolean {
  if (!canBuyTool(s)) return false;
  s.coins -= nextTool(s)!.cost;
  s.tool++;
  return true;
}

export function upgradeCost(s: GameState, id: UpgradeId): number {
  const d = UPGRADES.find((u) => u.id === id)!;
  return Math.ceil(d.baseCost * Math.pow(d.growth, s.upgrades[id]));
}
export function canBuyUpgrade(s: GameState, id: UpgradeId): boolean {
  const d = UPGRADES.find((u) => u.id === id)!;
  return s.upgrades[id] < d.max && s.coins >= upgradeCost(s, id);
}
export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  if (!canBuyUpgrade(s, id)) return false;
  s.coins -= upgradeCost(s, id);
  s.upgrades[id]++;
  return true;
}

export function helperCost(s: GameState, id: HelperId): number {
  const d = HELPERS.find((h) => h.id === id)!;
  return Math.ceil(d.baseCost * Math.pow(d.growth, s.helpers[id]));
}
export function helperLocked(s: GameState, id: HelperId): boolean {
  return HELPERS.find((h) => h.id === id)!.sea && !s.boat;
}
export function canBuyHelper(s: GameState, id: HelperId): boolean {
  const d = HELPERS.find((h) => h.id === id)!;
  return !helperLocked(s, id) && s.helpers[id] < d.max && s.coins >= helperCost(s, id);
}
export function buyHelper(s: GameState, id: HelperId): boolean {
  if (!canBuyHelper(s, id)) return false;
  s.coins -= helperCost(s, id);
  s.helpers[id]++;
  return true;
}

export function canBuyBoat(s: GameState): boolean {
  return !s.boat && s.coins >= BOAT_COST;
}
export function buyBoat(s: GameState): boolean {
  if (!canBuyBoat(s)) return false;
  s.coins -= BOAT_COST;
  s.boat = true;
  return true;
}

export function sectorCost(id: number): number {
  return Math.round(sectorValue(id) * 0.35);
}
export type SectorBlock = 'owned' | 'far' | 'boat' | 'coins' | null;
export function sectorBlock(s: GameState, id: number): SectorBlock {
  if (s.sectors.includes(id)) return 'owned';
  if (!neighbours(id).some((n) => s.sectors.includes(n))) return 'far';
  if (isSeaSector(id) && !s.boat) return 'boat';
  return s.coins >= sectorCost(id) ? null : 'coins';
}
export function openSector(s: GameState, f: Field | null, id: number): boolean {
  if (sectorBlock(s, id) !== null) return false;
  s.coins -= sectorCost(id);
  s.sectors.push(id);
  f?.syncOpen(s);
  return true;
}

// ---- sweeping ---------------------------------------------------------------------

export interface SweepOut {
  cells: number;
  coins: number;
  events: GameEvent[];
}
export interface Reach {
  land: boolean;
  sea: boolean;
}

/** Sweep a circle: every dirty cell inside it (in an open sector, on terrain you can reach) becomes clean and pays. */
export function sweep(s: GameState, f: Field, x: number, y: number, r: number, reach: Reach): SweepOut {
  const out: SweepOut = { cells: 0, coins: 0, events: [] };
  const gx0 = Math.max(0, Math.floor((x - r) / CELL));
  const gx1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
  const gy0 = Math.max(0, Math.floor((y - r) / CELL));
  const gy1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
  const r2 = r * r;
  const touched: number[] = [];
  for (let gy = gy0; gy <= gy1; gy++) {
    const cy = gy * CELL + CELL / 2 - y;
    for (let gx = gx0; gx <= gx1; gx++) {
      const i = gy * GW + gx;
      if (!f.dirt[i]) continue;
      const cx = gx * CELL + CELL / 2 - x;
      if (cx * cx + cy * cy > r2) continue;
      const sec = sectorOfCell(gx, gy);
      if (!f.open[sec]) continue;
      if (isWaterCell(gx, gy) ? !reach.sea : !reach.land) continue;
      f.dirt[i] = 0;
      f.left[sec]!--;
      f.totalLeft--;
      out.cells++;
      out.coins += cellValue(s, sec);
      f.onCell?.(gx, gy);
      if (!touched.includes(sec)) touched.push(sec);
    }
  }
  for (const sec of touched) finishSector(s, f, sec, out);
  s.cleaned += out.cells;
  s.coins += out.coins;
  s.totalCoins += out.coins;
  checkProgress(s, f, out.events);
  return out;
}

/** Nearly clean: sweep the last specks for the player and pay a completion bonus. */
function finishSector(s: GameState, f: Field, sec: number, out: SweepOut): void {
  if (s.done.includes(sec) || f.left[sec]! > CELLS_PER_SECTOR * DONE_FRACTION) return;
  const x0 = ((sec % SCOLS) * SECTOR) / CELL;
  const y0 = (Math.floor(sec / SCOLS) * SECTOR) / CELL;
  const n = SECTOR / CELL;
  for (let gy = y0; gy < y0 + n; gy++) {
    for (let gx = x0; gx < x0 + n; gx++) {
      const i = gy * GW + gx;
      if (!f.dirt[i]) continue;
      f.dirt[i] = 0;
      f.totalLeft--;
      out.cells++;
      out.coins += cellValue(s, sec);
      f.onCell?.(gx, gy);
    }
  }
  f.left[sec] = 0;
  s.done.push(sec);
  const bonus = Math.round(sectorValue(sec) * 0.25 * coinMult(s));
  out.coins += bonus;
  out.events.push({ kind: 'sector', id: sec, bonus });
}

export interface PickOut {
  coins: number;
  picked: number[];
  /** Pieces in reach that need a bigger tool. */
  tooBig: number[];
}

/** Pick up litter around a point. */
export function pickLitter(s: GameState, f: Field, x: number, y: number, reach: Reach): PickOut {
  const out: PickOut = { coins: 0, picked: [], tooBig: [] };
  const r = toolRadius(s) + magnetRange(s);
  for (let i = 0; i < LITTER.length; i++) {
    if (f.picked[i]) continue;
    const l = LITTER[i]!;
    const d = Math.hypot(l.x - x, l.y - y);
    if (d > r + LITTER_RADIUS[l.size]!) continue;
    if (!f.open[l.sector] || (l.water ? !reach.sea : !reach.land)) continue;
    if (s.tool < LITTER_TIER[l.size]!) {
      if (d < toolRadius(s) + LITTER_RADIUS[l.size]!) out.tooBig.push(i);
      continue;
    }
    f.picked[i] = 1;
    s.picked++;
    out.coins += litterValue(s, i);
    out.picked.push(i);
  }
  s.coins += out.coins;
  s.totalCoins += out.coins;
  return out;
}

function checkProgress(s: GameState, f: Field, events: GameEvent[]): void {
  const p = pct(f);
  for (const a of ANIMALS) {
    if (p >= a.at && !s.animals.includes(a.id)) {
      s.animals.push(a.id);
      events.push({ kind: 'animal', id: a.id });
    }
  }
  if (f.totalLeft === 0 && events.length >= 0 && !s.done.includes(-1)) {
    s.done.push(-1);
    events.push({ kind: 'complete' });
  }
}

/** Sectors cleaned, not counting the "everything clean" marker. */
export function doneCount(s: GameState): number {
  return s.done.filter((id) => id >= 0).length;
}

// ---- helpers working (live and offline) ---------------------------------------------

/** Sectors a helper can work in: open, not finished, with terrain it can clean. */
export function helperSectors(s: GameState, f: Field, sea: boolean): number[] {
  return s.sectors.filter((id) => !s.done.includes(id) && f.left[id]! > 0 && (sea ? sectorRow(id) < SEA_ROWS : sectorRow(id) >= SEA_ROWS - 1));
}

/** Pick a random dirty cell (world position) in one of the sectors a helper works in. */
export function helperTarget(s: GameState, f: Field, sea: boolean, rand: () => number = Math.random): { x: number; y: number } | null {
  const secs = helperSectors(s, f, sea);
  if (!secs.length) return null;
  for (let tries = 0; tries < 60; tries++) {
    const sec = secs[Math.floor(rand() * secs.length)]!;
    const gx = ((sec % SCOLS) * SECTOR) / CELL + Math.floor(rand() * (SECTOR / CELL));
    const gy = (Math.floor(sec / SCOLS) * SECTOR) / CELL + Math.floor(rand() * (SECTOR / CELL));
    if (f.dirt[gy * GW + gx] && isWaterCell(gx, gy) === sea) return { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 };
  }
  return null;
}

export interface OfflineReport {
  seconds: number;
  capped: boolean;
  cells: number;
  coins: number;
  events: GameEvent[];
}
export const OFFLINE_CAP = 8 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;

/** Helpers keep cleaning while you are away: random patches in their sectors, at half speed, for up to 8 hours. */
export function applyOffline(s: GameState, f: Field, elapsedSeconds: number, rand: () => number = Math.random): OfflineReport {
  const seconds = Math.max(0, Math.min(elapsedSeconds, OFFLINE_CAP));
  const report: OfflineReport = { seconds, capped: elapsedSeconds > OFFLINE_CAP, cells: 0, coins: 0, events: [] };
  const r = helperRadius(s);
  for (const h of HELPERS) {
    let budget = helperRate(s, h.id) * seconds * OFFLINE_EFFICIENCY;
    let misses = 0;
    while (budget > 0 && misses < 200) {
      const p = helperTarget(s, f, h.sea, rand);
      if (!p) break;
      const res = sweep(s, f, p.x, p.y, r, { land: !h.sea, sea: h.sea });
      if (res.cells === 0) { misses++; continue; }
      budget -= res.cells;
      report.cells += res.cells;
      report.coins += res.coins;
      report.events.push(...res.events);
    }
  }
  return report;
}

// ---- goals -------------------------------------------------------------------------

export interface GoalStatus { def: GoalDef; cur: number; done: boolean }

export function goalStatus(s: GameState, f: Field): GoalStatus | null {
  const def = GOALS[s.goal];
  if (!def) return null;
  let cur = 0;
  switch (def.type) {
    case 'cleaned': cur = s.cleaned; break;
    case 'tool': cur = s.tool; break;
    case 'upgrade': cur = s.upgrades[def.id as UpgradeId]; break;
    case 'sectors': cur = s.sectors.length; break;
    case 'done': cur = doneCount(s); break;
    case 'helper': cur = s.helpers[def.id as HelperId]; break;
    case 'boat': cur = s.boat ? 1 : 0; break;
    case 'pct': cur = pct(f); break;
    case 'items': cur = s.picked; break;
  }
  return { def, cur: Math.min(cur, def.n), done: cur >= def.n };
}
export function claimGoal(s: GameState, f: Field): number {
  const g = goalStatus(s, f);
  if (!g || !g.done) return 0;
  s.coins += g.def.reward;
  s.totalCoins += g.def.reward;
  s.goal++;
  return g.def.reward;
}
