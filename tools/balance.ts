// Greedy bot that plays the economy and prints a timeline. Run: npm run balance
// Used to check there are no progression walls and that a full restoration takes a sensible time.
import { RECYCLERS, RESEARCH, UNITS, UPGRADES } from '../src/core/content.ts';
import * as sim from '../src/core/sim.ts';
import { newState } from '../src/core/state.ts';

if (process.env.NOLOCK) { for (const u of UNITS) u.unlockAt = 0; for (const u of UPGRADES) u.unlockAt = 0; }

function run(label: string, activeFraction: number): void {
  const first: Record<string, boolean> = {};
  const s = newState(0);
  const dt = 1;
  let t = 0;
  let lastBuy = 0;
  let worstGap = 0;
  let worstGapAt = 0;
  const marks = [10, 25, 50, 75, 100];
  console.log(`\n== ${label} ==`);
  while (sim.pct(s) < 100 && t < 60 * 3600) {
    t += dt;
    sim.advance(s, dt);
    // Tapping: limited by how fast trash drifts in.
    const active = (t % 600) < 600 * activeFraction || t < 180;
    if (active) {
      const spawn = sim.has(s, 'c2') ? 3.3 : 1.66;
      const taps = Math.min(1.5, spawn);
      const perTap = sim.tapPower(s) * 1.3 * (1 + 0.5 * s.upgrades.sweeper) + sim.tapBonus(s);
      sim.collect(s, taps * perTap * dt);
    }
    // Research: cheapest available.
    for (const r of [...RESEARCH].sort((a, b) => a.cost - b.cost)) sim.buyResearch(s, r.id);
    // Purchases: best "production per coin" among the affordable, else cheapest.
    let bought = true;
    while (bought) {
      bought = false;
      const bottleneck = sim.autoRate(s) > sim.throughput(s) * 0.8 || s.waste > sim.storageCap(s) * 0.9;
      if (sim.canBuyRecycler(s)) bought = sim.buyRecycler(s);
      else if (bottleneck && sim.canBuyUpgrade(s, 'conveyor')) bought = sim.buyUpgrade(s, 'conveyor');
      if (bought) { lastBuy = t; continue; }
      const next = RECYCLERS[s.recycler + 1];
      // Save up for the next recycler when it's close.
      if (next && bottleneck && sim.upgradeCost(s, 'conveyor') > next.cost * 0.3) break;
      const units = UNITS.filter((u) => sim.canBuyUnit(s, u.id))
        .sort((a, b) => sim.unitCost(s, a.id) / sim.unitRate(s, a.id) - sim.unitCost(s, b.id) / sim.unitRate(s, b.id));
      if (units[0]) {
        bought = sim.buyUnit(s, units[0].id);
        if (bought && !first[units[0].id]) {
          first[units[0].id] = true;
          console.log(`   first ${units[0].id} at ${(t / 60).toFixed(1)} min, ${sim.pct(s).toFixed(1)}%, total waste ${s.totalWaste.toExponential(2)}`);
        }
      }
      else {
        const ups = UPGRADES.filter((u) => u.id !== 'conveyor' && sim.canBuyUpgrade(s, u.id))
          .sort((a, b) => sim.upgradeCost(s, a.id) - sim.upgradeCost(s, b.id));
        if (ups[0] && sim.upgradeCost(s, ups[0].id) < s.coins * 0.5) bought = sim.buyUpgrade(s, ups[0].id);
      }
      if (bought) lastBuy = t;
    }
    if (t - lastBuy > worstGap) { worstGap = t - lastBuy; worstGapAt = t; }
    while (marks.length && sim.pct(s) >= marks[0]!) {
      const m = marks.shift()!;
      console.log(
        `${String(m).padStart(3)}% at ${(t / 60).toFixed(1).padStart(7)} min | auto ${sim.autoRate(s).toFixed(1)}/s thr ${sim.throughput(s).toFixed(0)}/s ` +
        `tap ${sim.tapPower(s).toFixed(0)} | coins ${s.coins.toFixed(0)} rep ${s.rep.toFixed(0)} research ${s.research.length} | ` +
        `units ${UNITS.map((u) => s.units[u.id]).join('/')} recycler ${s.recycler}`,
      );
    }
  }
  console.log(`longest wait between purchases: ${(worstGap / 60).toFixed(1)} min (at ${(worstGapAt / 60).toFixed(0)} min)`);
}

run('active player (always tapping)', 1);
run('casual (tapping 20% of the time)', 0.2);
run('idle (taps only the first 3 minutes)', 0);
