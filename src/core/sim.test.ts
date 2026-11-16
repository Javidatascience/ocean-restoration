import { describe, expect, it } from 'vitest';
import { ANIMALS, RECYCLERS, UNITS, UPGRADES } from './content.ts';
import * as sim from './sim.ts';
import { newState } from './state.ts';

describe('economy', () => {
  it('starts empty and a tap collects waste', () => {
    const s = newState(0);
    expect(sim.autoRate(s)).toBe(0);
    sim.collect(s, sim.tapPower(s));
    expect(s.waste).toBe(1);
    expect(sim.pct(s)).toBeGreaterThan(0);
  });

  it('recycles waste into coins, limited by throughput', () => {
    const s = newState(0);
    s.waste = 50;
    const res = sim.advance(s, 10);
    expect(res.coins).toBeCloseTo(RECYCLERS[0].throughput * 10 * RECYCLERS[0].value);
    expect(s.waste).toBeCloseTo(50 - RECYCLERS[0].throughput * 10);
  });

  it('never stores more than the storage capacity', () => {
    const s = newState(0);
    sim.collect(s, 1e6);
    expect(s.waste).toBe(sim.storageCap(s));
  });

  it('costs grow with every purchase', () => {
    const s = newState(0);
    s.coins = 1e9;
    for (const u of UPGRADES.filter((x) => x.unlockAt === 0)) {
      const before = sim.upgradeCost(s, u.id);
      expect(sim.buyUpgrade(s, u.id)).toBe(true);
      expect(sim.upgradeCost(s, u.id)).toBeGreaterThan(before);
    }
    const before = sim.unitCost(s, 'worker');
    expect(sim.buyUnit(s, 'worker')).toBe(true);
    expect(sim.unitCost(s, 'worker')).toBeGreaterThan(before);
    expect(sim.autoRate(s)).toBeCloseTo(UNITS[0].rate * sim.collectMult(s));
  });

  it('refuses purchases that are locked or unaffordable', () => {
    const s = newState(0);
    expect(sim.buyUnit(s, 'worker')).toBe(false);
    s.coins = 1e12;
    expect(sim.buyUnit(s, 'robot')).toBe(false); // needs restoration first
    expect(sim.buyResearch(s, 'c2')).toBe(false); // needs c1 and reputation
  });
});

describe('progression', () => {
  it('restoration reaches exactly 100% at the target and brings every animal home', () => {
    const s = newState(0);
    const events = sim.collect(s, sim.TARGET);
    expect(sim.pct(s)).toBe(100);
    expect(s.animals.length).toBe(ANIMALS.length);
    expect(s.beachRewarded).toBe(true);
    expect(events.filter((e) => e.kind === 'milestone').length).toBe(4);
    expect(s.rep).toBeGreaterThan(100);
  });

  it('research needs its prerequisite', () => {
    const s = newState(0);
    s.rep = 100;
    expect(sim.buyResearch(s, 'a2')).toBe(false);
    expect(sim.buyResearch(s, 'a1')).toBe(true);
    expect(sim.buyResearch(s, 'a2')).toBe(true);
  });
});

describe('offline progress', () => {
  it('uses real elapsed time, at reduced efficiency, up to the cap', () => {
    const s = newState(0);
    s.units.worker = 10;
    const rate = sim.autoRate(s);
    const hour = sim.applyOffline(s, 3600);
    expect(hour.capped).toBe(false);
    expect(hour.waste).toBeCloseTo(rate * 3600 * 0.5);
    expect(hour.coins).toBeGreaterThan(0);
    expect(hour.pctGain).toBeGreaterThan(0);

    const long = sim.applyOffline(newStateWithWorkers(), 100 * 3600);
    expect(long.capped).toBe(true);
    expect(long.seconds).toBe(8 * 3600);
  });

  it('Night Crew extends the cap and efficiency', () => {
    const s = newStateWithWorkers();
    s.research.push('a3');
    expect(sim.offlineCapSeconds(s)).toBe(16 * 3600);
    expect(sim.offlineEfficiency(s)).toBe(1);
  });
});

function newStateWithWorkers() {
  const s = newState(0);
  s.units.worker = 10;
  return s;
}
