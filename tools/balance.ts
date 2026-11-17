// Bot that plays the real rules on the real dirt grid and prints a timeline. Run: npm run balance
// It sweeps sectors in lanes, picks up litter, buys tools / upgrades / helpers / sectors greedily.
import { HELPERS, TOOLS, UPGRADES } from '../src/core/content.ts';
import * as sim from '../src/core/sim.ts';
import { newState } from '../src/core/state.ts';
import { SECTOR, SECTOR_N, SCOLS, isSeaSector } from '../src/core/world.ts';

const s = newState(0);
const f = new sim.Field(s);
const dt = 0.25;
let t = 0;
let target = -1;
let lane = 0;
let dir = 1;
let x = s.px;
let y = s.py;
let lastBuy = 0;
let worstGap = 0;
const marks = [1, 5, 10, 25, 50, 75, 90, 100];
const log = (msg: string) => console.log(`${(t / 60).toFixed(1).padStart(6)} min  ${sim.pct(f).toFixed(1).padStart(5)}%  ${msg}`);

function pickTarget(): void {
  const open = s.sectors.filter((id) => !s.done.includes(id));
  open.sort((a, b) => sim.cellBase(b) - sim.cellBase(a));
  const next = open[0] ?? -1;
  if (next !== target) {
    if (next >= 0) {
      const nx = (next % SCOLS) * SECTOR;
      const ny = Math.floor(next / SCOLS) * SECTOR;
      t += Math.hypot(nx - x, ny - y) / sim.moveSpeed(s); // walk there
      x = nx; y = ny;
    }
    target = next;
    lane = 0;
    dir = 1;
  }
}

function buy(): void {
  let again = true;
  while (again) {
    again = false;
    if (sim.buyTool(s)) { log(`tool → ${TOOLS[s.tool]!.name}`); again = true; continue; }
    const nextToolCost = sim.nextTool(s)?.cost ?? Infinity;
    if (!s.boat && s.tool >= 3 && sim.buyBoat(s)) { log('boat'); again = true; continue; }
    for (const u of UPGRADES) {
      if (sim.upgradeCost(s, u.id) < Math.min(s.coins * 0.3, nextToolCost * 0.25) && sim.buyUpgrade(s, u.id)) again = true;
    }
    for (const h of HELPERS) {
      if (sim.helperCost(s, h.id) < Math.min(s.coins * 0.2, nextToolCost * 0.15) && sim.buyHelper(s, h.id)) again = true;
    }
    const undone = s.sectors.filter((id) => !s.done.includes(id)).length;
    if (undone < 2) {
      const options = Array.from({ length: SECTOR_N }, (_, id) => id).filter((id) => sim.sectorBlock(s, id) === null);
      options.sort((a, b) => sim.sectorCost(a) - sim.sectorCost(b));
      if (options[0] !== undefined && sim.openSector(s, f, options[0])) again = true;
    }
    if (again) lastBuy = t;
  }
}

while (sim.pct(f) < 99.9 && t < 12 * 3600) {
  pickTarget();
  if (target >= 0) {
    // Lane sweep inside the target sector.
    const r = sim.toolRadius(s);
    const x0 = (target % SCOLS) * SECTOR;
    const y0 = Math.floor(target / SCOLS) * SECTOR;
    const step = sim.moveSpeed(s, isSeaSector(target)) * dt;
    x += dir * step;
    if (x > x0 + SECTOR || x < x0) {
      dir = -dir;
      x = Math.max(x0, Math.min(x0 + SECTOR, x));
      lane++;
      if (lane * r * 1.6 > SECTOR + r) lane = 0;
    }
    y = y0 + Math.min(SECTOR, lane * r * 1.6 + r * 0.5);
    const reach = { land: true, sea: s.boat };
    sim.sweep(s, f, x, y, r, reach);
    sim.pickLitter(s, f, x, y, reach);
  }
  // Helpers, as a budget of cells per tick.
  for (const h of HELPERS) {
    let budget = sim.helperRate(s, h.id) * dt * 0.8;
    let misses = 0;
    while (budget > 0 && misses < 5) {
      const p = sim.helperTarget(s, f, h.sea);
      if (!p) break;
      const res = sim.sweep(s, f, p.x, p.y, sim.helperRadius(s), { land: !h.sea, sea: h.sea });
      if (!res.cells) { misses++; continue; }
      budget -= res.cells;
    }
  }
  buy();
  if (t - lastBuy > worstGap) worstGap = t - lastBuy;
  while (marks.length && sim.pct(f) >= marks[0]!) log(`=== ${marks.shift()}% · sectors ${s.sectors.length} done ${sim.doneCount(s)} · helpers ${s.helpers.bot}/${s.helpers.drone} · ups ${UPGRADES.map((u) => s.upgrades[u.id]).join('/')}`);
  t += dt;
}
log(`end · longest wait between purchases ${(worstGap / 60).toFixed(1)} min · coins ${s.coins.toExponential(2)}`);
