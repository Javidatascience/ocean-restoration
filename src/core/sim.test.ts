import { describe, expect, it } from 'vitest';
import { BOAT_COST, TOOLS } from './content.ts';
import * as sim from './sim.ts';
import { decodeBits, encodeBits, newState } from './state.ts';
import {
  CELLS_PER_SECTOR, LITTER, LITTER_TIER, SECTOR, SCOLS, START_SECTOR, isSeaSector, isWater, neighbours, sectorCol, sectorRow,
} from './world.ts';

const LAND = { land: true, sea: false };
const centre = (id: number) => ({ x: (sectorCol(id) + 0.5) * SECTOR, y: (sectorRow(id) + 0.5) * SECTOR });

describe('world', () => {
  it('everything starts dirty and only the start sector is open', () => {
    const s = newState(0);
    const f = new sim.Field(s);
    expect(sim.pct(f)).toBe(0);
    expect(f.left[START_SECTOR]).toBe(CELLS_PER_SECTOR);
    expect(s.sectors).toEqual([START_SECTOR]);
    expect(isSeaSector(START_SECTOR)).toBe(false);
    expect(isWater(centre(0).x, centre(0).y)).toBe(true);
  });

  it('the dirt grid survives a save and load', () => {
    const bits = new Uint8Array(1000).map((_, i) => (i % 3 === 0 ? 1 : 0));
    expect(Array.from(decodeBits(encodeBits(bits), 1000, 1))).toEqual(Array.from(bits));
  });
});

describe('sweeping', () => {
  it('cleans the cells inside the tool and pays for each', () => {
    const s = newState(0);
    const f = new sim.Field(s);
    const p = centre(START_SECTOR);
    const res = sim.sweep(s, f, p.x, p.y, 8, LAND);
    expect(res.cells).toBeGreaterThan(10);
    expect(s.coins).toBeCloseTo(res.cells * sim.cellValue(s, START_SECTOR));
    expect(sim.sweep(s, f, p.x, p.y, 8, LAND).cells).toBe(0); // already clean
  });

  it('does nothing in a locked sector', () => {
    const s = newState(0);
    const f = new sim.Field(s);
    const p = centre(START_SECTOR - SCOLS);
    expect(sim.sweep(s, f, p.x, p.y, 20, LAND).cells).toBe(0);
  });

  it('a nearly clean sector finishes itself and pays a bonus', () => {
    const s = newState(0);
    const f = new sim.Field(s);
    const x0 = sectorCol(START_SECTOR) * SECTOR;
    const y0 = sectorRow(START_SECTOR) * SECTOR;
    const events: sim.GameEvent[] = [];
    for (let y = y0 + 6; y < y0 + SECTOR; y += 14) for (let x = x0 + 6; x < x0 + SECTOR; x += 6) events.push(...sim.sweep(s, f, x, y, 10, LAND).events);
    expect(f.left[START_SECTOR]).toBe(0);
    expect(s.done).toContain(START_SECTOR);
    expect(events.filter((e) => e.kind === 'sector').length).toBe(1);
  });
});

describe('litter', () => {
  it('small litter is picked up, big litter needs a bigger tool', () => {
    const s = newState(0);
    s.sectors = Array.from({ length: 200 }, (_, i) => i);
    const f = new sim.Field(s);
    const small = LITTER.findIndex((l) => l.size === 0 && !l.water);
    const big = LITTER.findIndex((l) => l.size === 2 && !l.water);
    const a = sim.pickLitter(s, f, LITTER[small]!.x, LITTER[small]!.y, LAND);
    expect(a.picked).toContain(small);
    const b = sim.pickLitter(s, f, LITTER[big]!.x, LITTER[big]!.y, LAND);
    expect(b.picked).not.toContain(big);
    expect(b.tooBig).toContain(big);
    s.tool = LITTER_TIER[2]!;
    expect(sim.pickLitter(s, f, LITTER[big]!.x, LITTER[big]!.y, LAND).picked).toContain(big);
  });
});

describe('purchases', () => {
  it('tools are bought in order and grow the reach', () => {
    const s = newState(0);
    expect(sim.buyTool(s)).toBe(false);
    s.coins = TOOLS[1]!.cost;
    expect(sim.buyTool(s)).toBe(true);
    expect(sim.toolRadius(s)).toBe(TOOLS[1]!.radius);
    expect(s.coins).toBe(0);
  });

  it('sectors open next to your area; sea sectors need the boat', () => {
    const s = newState(0);
    const f = new sim.Field(s);
    s.coins = 1e12;
    expect(sim.sectorBlock(s, 0)).toBe('far');
    const up = START_SECTOR - SCOLS;
    expect(neighbours(START_SECTOR)).toContain(up);
    expect(sim.openSector(s, f, up)).toBe(true);
    expect(f.open[up]).toBe(1);
    // walk the column up to the first sea row
    let id = up;
    while (!isSeaSector(id - SCOLS)) { id -= SCOLS; expect(sim.openSector(s, f, id)).toBe(true); }
    expect(sim.sectorBlock(s, id - SCOLS)).toBe('boat');
    expect(sim.buyBoat(s)).toBe(true);
    expect(s.coins).toBe(1e12 - BOAT_COST - [...s.sectors].slice(1).reduce((a, x) => a + sim.sectorCost(x), 0));
    expect(sim.openSector(s, f, id - SCOLS)).toBe(true);
  });

  it('further sectors pay more per patch, and cost more to open', () => {
    expect(sim.cellBase(START_SECTOR - SCOLS)).toBeGreaterThan(sim.cellBase(START_SECTOR));
    expect(sim.sectorCost(0)).toBeGreaterThan(sim.sectorCost(START_SECTOR - SCOLS));
  });
});

describe('helpers and offline', () => {
  it('helpers clean while you are away, up to the cap', () => {
    const s = newState(0);
    const f = new sim.Field(s);
    s.helpers.bot = 3;
    const r = sim.applyOffline(s, f, 600, () => 0.37);
    expect(r.cells).toBeGreaterThan(0);
    expect(r.coins).toBeGreaterThan(0);
    expect(sim.applyOffline(s, f, 100 * 3600).capped).toBe(true);
  });

  it('goals are claimed in order', () => {
    const s = newState(0);
    const f = new sim.Field(s);
    expect(sim.claimGoal(s, f)).toBe(0);
    s.cleaned = 300;
    expect(sim.claimGoal(s, f)).toBeGreaterThan(0);
    expect(s.goal).toBe(1);
  });
});
