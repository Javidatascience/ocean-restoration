// Pure game rules: no DOM, no timers. Used by the game loop, offline progress, tests and the balance tool.
import {
  ANIMALS, GOALS, MILESTONES, RECYCLERS, REEF_ROUTE_COST, RESEARCH, UNITS, UNIT_GROWTH, UPGRADES,
  type GoalDef, type ResearchDef, type UnitId, type UpgradeId,
} from './content.ts';
import type { GameState } from './state.ts';

// Restoration is logarithmic in waste cleaned: each quarter of the bar needs far more than the previous one,
// which keeps pace with the exponential growth of the player's production.
const K = 100;
export const TARGET = 1e11;
const LOG_T = Math.log(1 + TARGET / K);

export type GameEvent =
  | { kind: 'animal'; id: string }
  | { kind: 'milestone'; pct: number };

export const has = (s: GameState, id: string): boolean => s.research.includes(id);

export function rawPct(s: GameState): number {
  return (100 * Math.log(1 + s.restorePts / K)) / LOG_T;
}
export function pct(s: GameState): number {
  return Math.min(100, rawPct(s));
}

// ---- derived stats -------------------------------------------------------

export function collectMult(s: GameState): number {
  return (1 + 0.1 * s.upgrades.net) * (has(s, 'c5') ? 1.5 : 1);
}

export function unitMult(s: GameState, id: UnitId): number {
  let m = collectMult(s);
  if ((id === 'worker' || id === 'cleaner') && has(s, 'a1')) m *= 3;
  if ((id === 'boat' || id === 'floater' || id === 'vessel') && has(s, 'c4')) m *= 2;
  if ((id === 'drone' || id === 'robot') && has(s, 'a5')) m *= 3;
  if (has(s, 'a4')) m *= 1 + 0.05 * Math.floor(totalUnits(s) / 10);
  return m;
}

export function totalUnits(s: GameState): number {
  let n = 0;
  for (const u of UNITS) n += s.units[u.id];
  return n;
}

/** Waste per second produced by a single unit of this type. */
export function unitRate(s: GameState, id: UnitId): number {
  const def = UNITS.find((u) => u.id === id)!;
  return def.rate * unitMult(s, id);
}

/** Total automated waste per second. */
export function autoRate(s: GameState): number {
  let total = 0;
  for (const u of UNITS) if (s.units[u.id] > 0) total += s.units[u.id] * u.rate * unitMult(s, u.id);
  return total;
}

/** Waste collected by tapping one ordinary piece of trash. */
export function tapPower(s: GameState): number {
  const g = s.upgrades.grabber;
  let p = (1 + g) * Math.pow(2, Math.floor(g / 10));
  p *= 1 + 0.1 * s.upgrades.bag;
  p *= 1 + 0.2 * s.upgrades.cart;
  if (has(s, 'c1')) p *= 2;
  if (has(s, 'c2')) p *= 1.5;
  return p * collectMult(s);
}

/** Flat bonus added to each tap by Helping Hands. */
export function tapBonus(s: GameState): number {
  return has(s, 'c3') ? autoRate(s) * 1.5 : 0;
}

export function storageCap(s: GameState): number {
  return Math.round(80 * Math.pow(1.5, s.upgrades.bag) * (has(s, 'c5') ? 5 : 1));
}

/** Waste per second the recycler can process. */
export function throughput(s: GameState): number {
  return RECYCLERS[s.recycler]!.throughput * (1 + 0.3 * s.upgrades.conveyor) * (has(s, 'a2') ? 2 : 1);
}

/** Coins per unit of recycled waste. */
export function coinValue(s: GameState): number {
  let v = RECYCLERS[s.recycler]!.value;
  if (has(s, 'e2')) v *= 1 + pct(s) / 100;
  if (has(s, 'e5')) v *= 1.5;
  if (s.beachRewarded) v *= 1.5;
  if (s.reefCharted) v *= 1.25;
  return v;
}

export function restoreMult(s: GameState): number {
  return (has(s, 'e1') ? 1.3 : 1) * (has(s, 'e4') ? 1.6 : 1);
}
export function repMult(s: GameState): number {
  return (has(s, 'e3') ? 1.5 : 1) * (has(s, 'e5') ? 2 : 1);
}
export function offlineCapSeconds(s: GameState): number {
  return (has(s, 'a3') ? 16 : 8) * 3600;
}
export function offlineEfficiency(s: GameState): number {
  return has(s, 'a3') ? 1 : 0.5;
}

/** Waste actually being recycled per second right now. */
export function recycleRate(s: GameState): number {
  const thr = throughput(s);
  return s.waste > 1 ? thr : Math.min(thr, autoRate(s));
}
export function coinsPerMinute(s: GameState): number {
  return recycleRate(s) * coinValue(s) * 60;
}
export function wastePerMinute(s: GameState): number {
  return autoRate(s) * 60;
}
/** True when collection outpaces recycling and storage is overflowing. */
export function isBottlenecked(s: GameState): boolean {
  return s.waste >= storageCap(s) * 0.98 && autoRate(s) > throughput(s);
}

// ---- costs & purchases ---------------------------------------------------

export function upgradeCost(s: GameState, id: UpgradeId): number {
  const d = UPGRADES.find((u) => u.id === id)!;
  return Math.ceil(d.baseCost * Math.pow(d.growth, s.upgrades[id]));
}
export function unitCost(s: GameState, id: UnitId): number {
  const d = UNITS.find((u) => u.id === id)!;
  return Math.ceil(d.baseCost * Math.pow(UNIT_GROWTH, s.units[id]));
}
export function isUnlocked(s: GameState, unlockAt: number): boolean {
  return pct(s) >= unlockAt;
}

export function canBuyUpgrade(s: GameState, id: UpgradeId): boolean {
  const d = UPGRADES.find((u) => u.id === id)!;
  return isUnlocked(s, d.unlockAt) && s.upgrades[id] < d.max && s.coins >= upgradeCost(s, id);
}
export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  if (!canBuyUpgrade(s, id)) return false;
  s.coins -= upgradeCost(s, id);
  s.upgrades[id]++;
  return true;
}

export function canBuyUnit(s: GameState, id: UnitId): boolean {
  const d = UNITS.find((u) => u.id === id)!;
  return isUnlocked(s, d.unlockAt) && s.coins >= unitCost(s, id);
}
/** How many units a "buy xN" press gets and what it costs. 'max' = as many as the coins allow (at least 1). */
export function unitBulk(s: GameState, id: UnitId, qty: number | 'max'): { n: number; cost: number } {
  const d = UNITS.find((u) => u.id === id)!;
  const want = qty === 'max' ? 1000 : qty;
  let n = 0;
  let cost = 0;
  let next = d.baseCost * Math.pow(UNIT_GROWTH, s.units[id]);
  while (n < want) {
    const c = Math.ceil(next);
    if (qty === 'max' && n > 0 && cost + c > s.coins) break;
    cost += c;
    n++;
    next *= UNIT_GROWTH;
  }
  return { n, cost };
}
export function buyUnit(s: GameState, id: UnitId, qty: number | 'max' = 1): boolean {
  const d = UNITS.find((u) => u.id === id)!;
  const b = unitBulk(s, id, qty);
  if (!isUnlocked(s, d.unlockAt) || s.coins < b.cost) return false;
  s.coins -= b.cost;
  s.units[id] += b.n;
  return true;
}

export function canBuyRecycler(s: GameState): boolean {
  const next = RECYCLERS[s.recycler + 1];
  return !!next && s.coins >= next.cost;
}
export function buyRecycler(s: GameState): boolean {
  if (!canBuyRecycler(s)) return false;
  s.coins -= RECYCLERS[s.recycler + 1]!.cost;
  s.recycler++;
  return true;
}

export function researchState(s: GameState, d: ResearchDef): 'done' | 'ready' | 'short' | 'locked' {
  if (has(s, d.id)) return 'done';
  const prev = RESEARCH.find((x) => x.branch === d.branch && x.tier === d.tier - 1);
  if (prev && !has(s, prev.id)) return 'locked';
  return s.rep >= d.cost ? 'ready' : 'short';
}
export function buyResearch(s: GameState, id: string): boolean {
  const d = RESEARCH.find((x) => x.id === id);
  if (!d || researchState(s, d) !== 'ready') return false;
  s.rep -= d.cost;
  s.research.push(id);
  return true;
}

export function canChartReef(s: GameState): boolean {
  return !s.reefCharted && pct(s) >= 100 && has(s, 'e5') && s.rep >= REEF_ROUTE_COST;
}
export function chartReef(s: GameState): boolean {
  if (!canChartReef(s)) return false;
  s.rep -= REEF_ROUTE_COST;
  s.reefCharted = true;
  return true;
}

// ---- goals & bonuses -----------------------------------------------------

export interface GoalStatus { def: GoalDef; cur: number; done: boolean }

export function goalStatus(s: GameState): GoalStatus | null {
  const def = GOALS[s.goal];
  if (!def) return null;
  let cur = 0;
  if (def.type === 'waste') cur = s.totalWaste;
  else if (def.type === 'upgrade') cur = s.upgrades[def.id as UpgradeId];
  else if (def.type === 'unit') cur = s.units[def.id as UnitId];
  else if (def.type === 'research') cur = s.research.length;
  else if (def.type === 'recycler') cur = s.recycler;
  else if (def.type === 'pct') cur = pct(s);
  else if (def.type === 'animals') cur = s.animals.length;
  else cur = s.reefCharted ? 1 : 0;
  return { def, cur: Math.min(cur, def.n), done: cur >= def.n };
}
/** Claims the current goal if it is complete. Returns the coins granted (0 if nothing to claim). */
export function claimGoal(s: GameState): number {
  const g = goalStatus(s);
  if (!g || !g.done) return 0;
  s.coins += g.def.reward;
  s.totalCoins += g.def.reward;
  s.goal++;
  return g.def.reward;
}

/** Coins inside a message in a bottle: 45 seconds of current income, never less than 25. */
export function bottleReward(s: GameState): number {
  return Math.max(25, Math.round(coinsPerMinute(s) * 0.75));
}
export function grantBottle(s: GameState): number {
  const amount = bottleReward(s);
  s.coins += amount;
  s.totalCoins += amount;
  return amount;
}

// ---- progression ---------------------------------------------------------

function checkProgress(s: GameState, events: GameEvent[]): void {
  const whole = Math.floor(rawPct(s));
  if (whole > s.repAwardedPct) {
    s.rep += (whole - s.repAwardedPct) * repMult(s);
    s.repAwardedPct = whole;
  }
  const p = pct(s);
  for (const a of ANIMALS) {
    if (p >= a.at && !s.animals.includes(a.id)) {
      s.animals.push(a.id);
      s.rep += 3 * repMult(s);
      events.push({ kind: 'animal', id: a.id });
    }
  }
  for (const m of MILESTONES) {
    if (p >= m.pct && !s.milestones.includes(m.pct)) {
      s.milestones.push(m.pct);
      s.rep += m.rep * repMult(s);
      if (m.pct === 100) s.beachRewarded = true;
      events.push({ kind: 'milestone', pct: m.pct });
    }
  }
}

/** Manual collection (a tap). Overflow beyond storage still cleans the beach, it just earns no coins. */
export function collect(s: GameState, amount: number): GameEvent[] {
  const events: GameEvent[] = [];
  s.waste = Math.min(storageCap(s), s.waste + amount);
  s.totalWaste += amount;
  s.restorePts += amount * restoreMult(s);
  checkProgress(s, events);
  return events;
}

export interface AdvanceResult {
  collected: number;
  coins: number;
  events: GameEvent[];
}

/**
 * Advance automation + recycling by dt seconds. Exact for any dt, so the very same function
 * drives the frame loop and offline progress.
 */
export function advance(s: GameState, dt: number, efficiency = 1): AdvanceResult {
  const events: GameEvent[] = [];
  if (dt <= 0) return { collected: 0, coins: 0, events };
  const collected = autoRate(s) * efficiency * dt;
  const available = s.waste + collected;
  const recycled = Math.min(available, throughput(s) * dt);
  const coins = recycled * coinValue(s);
  s.waste = Math.min(storageCap(s), available - recycled);
  s.coins += coins;
  s.totalCoins += coins;
  s.totalWaste += collected;
  s.restorePts += collected * restoreMult(s);
  checkProgress(s, events);
  return { collected, coins, events };
}

export interface OfflineReport {
  seconds: number;
  capped: boolean;
  waste: number;
  coins: number;
  pctGain: number;
  events: GameEvent[];
}

export function applyOffline(s: GameState, elapsedSeconds: number): OfflineReport {
  const cap = offlineCapSeconds(s);
  const seconds = Math.max(0, Math.min(elapsedSeconds, cap));
  const before = pct(s);
  const res = advance(s, seconds, offlineEfficiency(s));
  return {
    seconds, capped: elapsedSeconds > cap, waste: res.collected, coins: res.coins,
    pctGain: pct(s) - before, events: res.events,
  };
}
