// The living beach: an isometric-flavoured scene drawn on a 2D canvas. It only reads the game state;
// taps are reported back through onCollect so the rules stay in core/sim.
import * as sim from '../core/sim.ts';
import { has, pct, storageCap } from '../core/sim.ts';
import type { GameState } from '../core/state.ts';
import { SECTOR_COLS, SECTOR_COUNT, SECTOR_ROWS, type UnitId } from '../core/content.ts';
import * as S from './sprites.ts';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Value multiplier per trash kind (see sprites.trash). */
export const KIND_VALUE = [1, 1, 1.5, 1, 4, 8, 3];

interface Trash { x: number; y: number; kind: number; water: boolean; age: number; rot: number; ph: number; sector: number; tide: boolean }
interface Fly { x0: number; y0: number; x1: number; y1: number; t: number; kind: number }
interface Popup { x: number; y: number; text: string; color: string; t: number; life: number; size: number }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; r: number; g: number; ring?: boolean }
interface Mover { x: number; y: number; tx: number; ty: number; wait: number; dir: number; ph: number; moving: boolean; trail: number }
interface Decor { x: number; y: number; at: number; kind: number; ph: number; s: number }

export interface CollectedItem { kind: number; x: number; y: number; sector: number; tide: boolean }

/** Seconds a message in a bottle stays before drifting away. */
const BOTTLE_LIFE = 45;
const VISIBLE_CAP: Record<UnitId, number> = { worker: 1, cleaner: 1, boat: 1, floater: 1, vessel: 1, drone: 1, robot: 1 };
const SPEED: Record<UnitId, number> = { worker: 26, cleaner: 36, boat: 30, floater: 0, vessel: 13, drone: 62, robot: 11 };
const WORKER_SHIRTS = ['#ff9f43', '#ff7aa2', '#7c9cf5', '#4cc27a', '#b58cf0', '#f2c14e'];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (x: number): number => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

export class Scene {
  onCollect: (items: CollectedItem[], x: number, y: number) => void = () => {};
  /** The player tapped a locked sector. */
  onSector: (id: number, sea: boolean) => void = () => {};
  onBottle: (x: number, y: number) => void = () => {};

  private c: C;
  private W = 390;
  private H = 560;
  private k = 1;
  private t = 0;
  private r = 0; // smoothed restoration 0..1
  private state: GameState;

  private trash: Trash[] = [];
  private spawnTimer = 0;
  private tideTimer = 3;
  private flies: Fly[] = [];
  private popups: Popup[] = [];
  private parts: Particle[] = [];
  private units: Record<UnitId, Mover[]> = { worker: [], cleaner: [], boat: [], floater: [], vessel: [], drone: [], robot: [] };
  private crabs: Mover[] = [];
  private pipers: Mover[] = [];
  private school: Mover | null = null;
  private turtleM: Mover | null = null;
  private mantaM: Mover | null = null;
  private dolphinJump = { x: 0, y: 0, t: 9, next: 3, dir: 1 };
  private pointer: { x: number; y: number } | null = null;
  private sectorFx: Record<number, number> = {};
  private sea: boolean[] = [];
  private player: Mover = { x: 0, y: 0, tx: 0, ty: 0, wait: 0, dir: 1, ph: 0, moving: false, trail: 0 };
  private bottle: { x: number; y: number; age: number; ph: number } | null = null;
  private bottleTimer = 45;
  private coinAcc = 0;
  private coinTimer = 0;

  // static decor, regenerated on resize
  private pebbles: Decor[] = [];
  private stains: Decor[] = [];
  private murk: Decor[] = [];
  private plants: Decor[] = [];
  private palms: Decor[] = [];
  private grass: Decor[] = [];
  private corals: Decor[] = [];
  private rocks: Decor[] = [];
  private waves: Decor[] = [];
  private sparkles: Decor[] = [];
  private starSpots: Decor[] = [];
  private station = { x: 0, y: 0 };
  private store = { x: 0, y: 0 };
  private pierPos = { x: 0, y: 0 };

  constructor(private cv: HTMLCanvasElement, state: GameState) {
    this.c = cv.getContext('2d')!;
    this.state = state;
    this.r = pct(state) / 100;
    this.resize();
    this.fillSectors(true);
    const at = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      const p = at(e);
      try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic pointer: nothing to capture */ }
      this.pointer = p;
      this.press(p.x, p.y);
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.pointer) this.pointer = at(e);
    });
    const up = () => { this.pointer = null; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  // ---- geometry ----------------------------------------------------------

  /** Screen y of the shoreline at screen x. Water is above the line, sand below. */
  shoreY(x: number): number {
    return this.H * 0.5 + (x - this.W * 0.5) * 0.5 + Math.sin(x * 0.018 / this.k + 1.3) * 7 * this.k;
  }
  private isWater(x: number, y: number): boolean {
    return y < this.shoreY(x);
  }
  private nearBuilding(x: number, y: number, d: number): boolean {
    const k = this.k;
    return Math.hypot(x - this.station.x, (y - this.station.y + 14 * k) * 1.6) < d * k * 1.25
      || Math.hypot(x - this.store.x, (y - this.store.y + 8 * k) * 1.6) < d * k;
  }
  private randSand(rand: () => number = Math.random, margin = 16): { x: number; y: number } {
    const k = this.k;
    for (let i = 0; i < 40; i++) {
      const x = (0.04 + rand() * 0.92) * this.W;
      const y = (0.1 + rand() * 0.87) * this.H;
      if (y > this.shoreY(x) + margin * k && !this.nearBuilding(x, y, 36)) return { x, y };
    }
    return { x: this.W * 0.3, y: this.H * 0.9 };
  }
  private randWater(rand: () => number = Math.random, minOff = 22, maxOff = 9999): { x: number; y: number } {
    const k = this.k;
    for (let i = 0; i < 40; i++) {
      const x = (0.05 + rand() * 0.9) * this.W;
      const y = (0.05 + rand() * 0.8) * this.H;
      const off = this.shoreY(x) - y;
      if (off > minOff * k && off < maxOff * k && !this.onPier(x, y)) return { x, y };
    }
    return { x: this.W * 0.7, y: this.H * 0.15 };
  }
  private onPier(x: number, y: number): boolean {
    const dx = x - this.pierPos.x;
    const dy = y - this.pierPos.y;
    const along = dx * 0.894 - dy * 0.447;
    const across = Math.abs(dx * 0.447 + dy * 0.894);
    return along > -6 * this.k && along < 70 * this.k && across < 14 * this.k;
  }

  // ---- sectors -------------------------------------------------------------

  private gridTop(): number {
    return this.H * 0.16;
  }
  sectorRect(id: number): { x: number; y: number; w: number; h: number } {
    const top = this.gridTop();
    const w = this.W / SECTOR_COLS;
    const h = (this.H - top) / SECTOR_ROWS;
    return { x: (id % SECTOR_COLS) * w, y: top + Math.floor(id / SECTOR_COLS) * h, w, h };
  }
  /** Sector under a screen point, or -1 above the grid. */
  sectorAt(x: number, y: number): number {
    const top = this.gridTop();
    if (y < top) return -1;
    const col = Math.min(SECTOR_COLS - 1, Math.max(0, Math.floor((x / this.W) * SECTOR_COLS)));
    const row = Math.min(SECTOR_ROWS - 1, Math.floor(((y - top) / (this.H - top)) * SECTOR_ROWS));
    return row * SECTOR_COLS + col;
  }
  private isOpen(id: number): boolean {
    return id >= 0 && this.state.sectors.includes(id);
  }
  private randIn(id: number, margin = 14): { x: number; y: number } {
    const k = this.k;
    const r = this.sectorRect(id);
    const sea = this.sea[id];
    for (let i = 0; i < 30; i++) {
      const x = r.x + (0.1 + Math.random() * 0.8) * r.w;
      const y = r.y + (0.1 + Math.random() * 0.8) * r.h;
      const off = this.shoreY(x) - y;
      if (sea ? off > margin * k : off < -margin * k) {
        if (!this.onPier(x, y) && !this.nearBuilding(x, y, 30)) return { x, y };
      }
    }
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth || 390;
    const h = this.cv.clientHeight || 560;
    const sx = w / this.W;
    const sy = h / this.H;
    this.W = w;
    this.H = h;
    this.k = Math.min(w / 320, h / 470);
    this.sea = Array.from({ length: SECTOR_COUNT }, (_, id) => {
      const r = this.sectorRect(id);
      return r.y + r.h / 2 < this.shoreY(r.x + r.w / 2);
    });
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const tr of this.trash) { tr.x *= sx; tr.y *= sy; }
    this.bottle = null;
    this.buildDecor();
    const reseat = (m: Mover, water: boolean) => {
      const p = water ? this.randWater() : this.randSand();
      m.x = m.tx = p.x;
      m.y = m.ty = p.y;
    };
    for (const id of Object.keys(this.units) as UnitId[]) for (const m of this.units[id]) reseat(m, id !== 'worker' && id !== 'cleaner');
    this.crabs = [];
    this.pipers = [];
    this.school = this.turtleM = this.mantaM = null;
    this.player.x = this.player.tx = w * 0.42;
    this.player.y = this.player.ty = h * 0.9;
  }

  private buildDecor(): void {
    const { W, H, k } = this;
    const rand = rng(20240607);
    this.station = { x: W * 0.25, y: Math.max(this.shoreY(W * 0.25) + 96 * k, H * 0.8) };
    this.store = { x: W * 0.6, y: Math.max(this.shoreY(W * 0.6) + 70 * k, H * 0.9) };
    this.pierPos = { x: W * 0.72, y: this.shoreY(W * 0.72) + 3 * k };
    const mk = (p: { x: number; y: number }, at = 0, kind = 0): Decor => ({ ...p, at, kind, ph: rand() * TAU, s: 0.7 + rand() * 0.6 });
    this.pebbles = Array.from({ length: 46 }, () => mk(this.randSand(rand, 6), 0, Math.floor(rand() * 3)));
    this.stains = Array.from({ length: 9 }, () => mk(this.randSand(rand, 10)));
    this.murk = Array.from({ length: 10 }, () => mk(this.randWater(rand, 10)));
    this.plants = Array.from({ length: 20 }, (_, i) => mk(this.randSand(rand, 34), 0.3 + (i / 20) * 0.6, i % 5 === 4 ? 2 : i % 3 === 1 ? 1 : 0));
    const palmAt = [0, 0.36, 0.48, 0.6, 0.72, 0.84];
    const palmX = [0.08, 0.2, 0.93, 0.06, 0.4, 0.8];
    const palmOff = [58, 150, 60, 190, 215, 120];
    this.palms = palmX.map((px, i) => {
      let x = px * W;
      let y = Math.min(H - 6 * k, this.shoreY(x) + palmOff[i] * k);
      // keep trees clear of the buildings on any screen shape
      for (let n = 0; n < 6 && this.nearBuilding(x, y, 58); n++) {
        x = (x + W * 0.13) % (W * 0.94);
        y = Math.min(H - 6 * k, this.shoreY(x) + palmOff[i] * k);
      }
      return { x, y, at: palmAt[i], kind: i, ph: rand() * TAU, s: 0.85 + rand() * 0.3 };
    });
    this.grass = Array.from({ length: 14 }, (_, i) => mk(this.randWater(rand, 14, 80), 0.42 + (i / 14) * 0.3));
    this.corals = Array.from({ length: 11 }, (_, i) => mk(this.randWater(rand, 26, 110), 0.62 + (i / 11) * 0.34, i));
    this.rocks = Array.from({ length: 4 }, () => mk(this.randWater(rand, 20, 90)));
    this.waves = Array.from({ length: 30 }, () => mk(this.randWater(rand, 12)));
    this.sparkles = Array.from({ length: 34 }, () => mk(this.randWater(rand, 14)));
    this.starSpots = [mk({ x: W * 0.34, y: this.shoreY(W * 0.34) + 14 * k }), mk(this.randWater(rand, 12, 40))];
  }

  // ---- trash -------------------------------------------------------------

  private visibleIn(id: number, tide: boolean): number {
    let n = 0;
    for (const tr of this.trash) if (tr.sector === id && tr.tide === tide) n++;
    return n;
  }

  private spawnIn(id: number, tide: boolean, initial: boolean): void {
    const sea = this.sea[id] ?? false;
    const p = this.randIn(id);
    let kind = Math.floor(Math.random() * 4);
    const roll = Math.random();
    if (roll < 0.03 && sea) kind = 5;
    else if (roll < 0.09) kind = 4;
    else if (roll < 0.15 && sea) kind = 6;
    this.trash.push({ x: p.x, y: p.y, kind, water: sea, age: initial ? 1 : 0, rot: (Math.random() - 0.5) * 0.8, ph: Math.random() * TAU, sector: id, tide });
  }

  /** Top up every open sector: its remaining mess (up to 8 pieces on screen) and a little tide trash once clean. */
  private fillSectors(all: boolean): void {
    const st = this.state;
    const tideCap = has(st, 'c2') ? 3 : 2;
    for (const id of st.sectors) {
      const left = st.sectorLeft[id] ?? 0;
      if (left > 0) {
        const want = Math.min(left, 8) - this.visibleIn(id, false);
        for (let i = 0; i < (all ? want : Math.min(1, want)); i++) this.spawnIn(id, false, all);
      } else if (all) {
        for (let i = this.visibleIn(id, true); i < tideCap; i++) this.spawnIn(id, true, true);
      }
    }
  }
  private spawnTide(): void {
    const st = this.state;
    const cap = has(st, 'c2') ? 3 : 2;
    const open = st.sectors.filter((id) => (st.sectorLeft[id] ?? 0) <= 0 && this.visibleIn(id, true) < cap);
    if (open.length) this.spawnIn(open[Math.floor(Math.random() * open.length)]!, true, false);
  }

  /** Finger down: buy a locked sector, grab a bottle, or start steering the sweeper. */
  private press(x: number, y: number): void {
    const k = this.k;
    const bt = this.bottle;
    if (bt && Math.hypot(bt.x - x, bt.y - 8 * k - y) < 34 * k) {
      this.bottle = null;
      this.bottleTimer = 100 + Math.random() * 60;
      this.burst(bt.x, bt.y - 8 * k, '255,226,130', 18, 110);
      this.onBottle(bt.x, bt.y);
      this.pointer = null;
      return;
    }
    const id = this.sectorAt(x, y);
    if (id >= 0 && !this.isOpen(id)) {
      this.pointer = null;
      this.onSector(id, this.sea[id] ?? false);
      return;
    }
    this.steer(x, y);
  }

  /** Point the player at a spot. They stay on the sand unless they own a boat. */
  private steer(x: number, y: number): void {
    const k = this.k;
    this.player.tx = Math.max(10 * k, Math.min(this.W - 10 * k, x));
    let ty = Math.min(this.H - 8 * k, Math.max(this.gridTop() + 6 * k, y + 4 * k));
    if (!sim.canSail(this.state)) ty = Math.max(ty, this.shoreY(this.player.tx) + 12 * k);
    this.player.ty = ty;
  }

  /** Playful feedback when a sector is bought. */
  sectorOpened(id: number): void {
    const r = this.sectorRect(id);
    this.sectorFx[id] = 0;
    for (let i = 0; i < 26; i++) this.burst(r.x + Math.random() * r.w, r.y + Math.random() * r.h, '255,244,200', 1, 50);
    this.fillSectors(true);
  }
  sectorCleaned(id: number): void {
    const r = this.sectorRect(id);
    this.sectorFx[id] = 0;
    for (let i = 0; i < 36; i++) this.burst(r.x + Math.random() * r.w, r.y + Math.random() * r.h, i % 2 ? '255,226,130' : '255,255,255', 1, 80);
  }
  isSea(id: number): boolean {
    return !!this.sea[id];
  }

  // ---- effects -----------------------------------------------------------

  popup(x: number, y: number, text: string, color = '#ffffff', size = 14): void {
    this.popups.push({ x, y, text, color, t: 0, life: 1.1, size });
    if (this.popups.length > 40) this.popups.shift();
  }
  burst(x: number, y: number, color: string, n: number, speed = 60): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.4 + Math.random() * 0.6) * speed * this.k;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20 * this.k, t: 0, life: 0.5 + Math.random() * 0.3, color, r: (1.5 + Math.random() * 1.8) * this.k, g: 120 * this.k });
    }
  }
  /** Coins earned by recycling; shown as a gentle pop over the station now and then. */
  addCoins(n: number): void {
    this.coinAcc += n;
  }
  purchaseFx(where: 'station' | 'store' | 'player'): void {
    const p = where === 'station' ? this.station : where === 'store' ? this.store : this.player;
    this.burst(p.x, p.y - 24 * this.k, '255,220,110', 14, 90);
  }
  celebrate(): void {
    const cols = ['255,138,128', '255,210,74', '110,220,170', '120,190,255', '200,160,255'];
    for (let i = 0; i < 120; i++) {
      this.parts.push({
        x: Math.random() * this.W, y: -10 - Math.random() * this.H * 0.4, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 80,
        t: 0, life: 3.5 + Math.random() * 2, color: cols[i % cols.length], r: (2 + Math.random() * 2.5) * this.k, g: 30,
      });
    }
  }
  stationPos(): { x: number; y: number } {
    return this.station;
  }

  // ---- update ------------------------------------------------------------

  private wander(m: Mover, dt: number, speed: number, pick: () => { x: number; y: number }, pause: number): void {
    const dx = m.tx - m.x;
    const dy = m.ty - m.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      m.moving = false;
      m.wait -= dt;
      if (m.wait <= 0) {
        const p = pick();
        m.tx = p.x;
        m.ty = p.y;
        m.wait = pause * (0.5 + Math.random());
      }
      return;
    }
    m.moving = true;
    const step = Math.min(d, speed * this.k * dt);
    m.x += (dx / d) * step;
    m.y += (dy / d) * step;
    if (Math.abs(dx) > 0.5) m.dir = dx > 0 ? 1 : -1;
  }

  private newMover(p: { x: number; y: number }): Mover {
    return { x: p.x, y: p.y, tx: p.x, ty: p.y, wait: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, ph: Math.random() * TAU, moving: false, trail: 0 };
  }

  update(dt: number, state: GameState): void {
    this.state = state;
    this.t += dt;
    const k = this.k;
    const target = pct(state) / 100;
    this.r += (target - this.r) * Math.min(1, dt * 1.5);

    // trash drifting in
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      this.fillSectors(false);
    }
    this.tideTimer -= dt;
    if (this.tideTimer <= 0) {
      this.tideTimer = has(state, 'c2') ? 1.6 : 3;
      this.spawnTide();
    }
    for (const key of Object.keys(this.sectorFx)) {
      const id = Number(key);
      this.sectorFx[id]! += dt;
      if (this.sectorFx[id]! > 1.2) delete this.sectorFx[id];
    }
    for (const tr of this.trash) tr.age = Math.min(1, tr.age + dt * 2.5);

    // message in a bottle: drifts in now and then and waits a good while to be picked up
    if (this.bottle) {
      this.bottle.age += dt;
      if (this.bottle.age > BOTTLE_LIFE) {
        this.bottle = null;
        this.bottleTimer = 100 + Math.random() * 60;
      }
    } else if (state.totalWaste > 30) {
      this.bottleTimer -= dt;
      if (this.bottleTimer <= 0) {
        const p = this.randWater(Math.random, 34, 170);
        this.bottle = { x: p.x, y: Math.max(40 * k, p.y), age: 0, ph: Math.random() * TAU };
      }
    }

    // player: follows the finger and sweeps up whatever is inside the tool's reach
    {
      const p = this.player;
      if (this.pointer) this.steer(this.pointer.x, this.pointer.y);
      const water = sim.canSail(state) && this.isWater(p.x, p.y);
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      p.moving = d > 2;
      if (p.moving) {
        const step = Math.min(d, sim.moveSpeed(state, water) * k * dt);
        const here = this.isOpen(this.sectorAt(p.x, p.y));
        const free = (x: number, y: number) => this.isOpen(this.sectorAt(x, y)) || !here;
        const nx = p.x + (dx / d) * step;
        const ny = p.y + (dy / d) * step;
        if (free(nx, ny)) { p.x = nx; p.y = ny; }
        else if (free(nx, p.y)) p.x = nx;
        else if (free(p.x, ny)) p.y = ny;
        else p.moving = false;
        if (Math.abs(dx) > 1) p.dir = dx > 0 ? 1 : -1;
      }
      p.trail -= dt;
      if (water && p.moving && p.trail <= 0) {
        p.trail = 0.22;
        this.parts.push({ x: p.x - p.dir * 16 * k, y: p.y, vx: 0, vy: 0, t: 0, life: 1.1, color: '255,255,255', r: 3 * k, g: 0, ring: true });
      }
      const reach = sim.sweepRadius(state, water) * k;
      const hit = this.trash.filter((tr) => tr.age > 0.5 && Math.hypot(tr.x - p.x, (tr.y - p.y) * 1.6) < reach);
      if (hit.length) {
        const items: CollectedItem[] = [];
        for (const tr of hit) {
          this.trash.splice(this.trash.indexOf(tr), 1);
          this.flies.push({ x0: tr.x, y0: tr.y, x1: this.store.x, y1: this.store.y - 16 * k, t: 0, kind: tr.kind });
          this.burst(tr.x, tr.y - 6 * k, tr.water ? '255,255,255' : '255,236,170', 5);
          items.push({ kind: tr.kind, x: tr.x, y: tr.y, sector: tr.sector, tide: tr.tide });
        }
        this.onCollect(items, p.x, p.y);
      }
    }

    // automated units: keep the visible sprites in sync with what the player owns
    for (const id of Object.keys(this.units) as UnitId[]) {
      const list = this.units[id];
      const want = Math.min(VISIBLE_CAP[id], state.units[id]);
      const water = id !== 'worker' && id !== 'cleaner';
      while (list.length < want) {
        const off = id === 'vessel' ? 70 : id === 'floater' ? 40 : 26;
        const m = this.newMover(water ? this.randWater(Math.random, off) : { x: this.station.x + 30 * k, y: this.station.y + 6 * k });
        list.push(m);
        this.burst(m.x, m.y - 10 * k, '255,255,255', 10, 70);
      }
      list.length = want;
      for (const m of list) {
        if (id === 'floater') continue;
        const off = id === 'vessel' ? 70 : 26;
        this.wander(m, dt, SPEED[id], () => (water ? this.randWater(Math.random, off) : this.randSand()), id === 'worker' ? 1.2 : id === 'drone' ? 0.8 : 0.4);
        if (id === 'worker' && !m.moving && m.wait > 0 && Math.random() < dt * 1.5) this.burst(m.x + m.dir * 6 * k, m.y - 2 * k, '255,236,170', 2, 25);
        if ((id === 'boat' || id === 'vessel') && m.moving) {
          m.trail -= dt;
          if (m.trail <= 0) {
            m.trail = 0.22;
            this.parts.push({ x: m.x - m.dir * (id === 'vessel' ? 30 : 16) * k, y: m.y, vx: 0, vy: 0, t: 0, life: 1.1, color: '255,255,255', r: 3 * k, g: 0, ring: true });
          }
        }
      }
    }

    // animals that move around
    const a = state.animals;
    if (a.includes('crab')) {
      while (this.crabs.length < 2) this.crabs.push(this.newMover(this.nearShoreSand()));
      for (const m of this.crabs) this.wander(m, dt, 20, () => this.nearShoreSand(), 2.2);
    }
    if (a.includes('sandpiper')) {
      while (this.pipers.length < 2) this.pipers.push(this.newMover(this.waterline()));
      for (const m of this.pipers) this.wander(m, dt, 46, () => this.waterline(), 1.6);
    }
    if (a.includes('sardine')) {
      if (!this.school) this.school = this.newMover(this.randWater(Math.random, 24, 120));
      this.wander(this.school, dt, 24, () => this.randWater(Math.random, 24, 120), 0.3);
    }
    if (a.includes('turtle')) {
      if (!this.turtleM) this.turtleM = this.newMover(this.randWater(Math.random, 30));
      this.wander(this.turtleM, dt, 12, () => this.randWater(Math.random, 30), 1);
    }
    if (a.includes('manta')) {
      if (!this.mantaM) this.mantaM = this.newMover(this.randWater(Math.random, 60));
      this.wander(this.mantaM, dt, 16, () => this.randWater(Math.random, 60), 0.2);
    }
    if (a.includes('dolphin')) {
      const j = this.dolphinJump;
      j.t += dt;
      j.next -= dt;
      if (j.next <= 0) {
        const p = this.randWater(Math.random, 70);
        j.x = p.x; j.y = p.y; j.t = 0; j.next = 5 + Math.random() * 6; j.dir = Math.random() < 0.5 ? 1 : -1;
        this.burst(p.x - j.dir * 16 * k, p.y, '255,255,255', 8, 50);
      }
      if (j.t > 1.0 && j.t - dt <= 1.0) this.burst(j.x + j.dir * 16 * k, j.y, '255,255,255', 10, 55);
    }

    // coin pops over the recycling station
    this.coinTimer += dt;
    if (this.coinTimer > 1.5) {
      this.coinTimer = 0;
      if (this.coinAcc >= 1) {
        this.popup(this.station.x + 10 * k, this.station.y - 44 * k, '+' + fmtShort(this.coinAcc), '#ffd24a', 13);
        this.coinAcc = 0;
      }
    }

    for (const f of this.flies) f.t += dt / 0.45;
    for (const f of this.flies) if (f.t >= 1) this.burst(f.x1, f.y1, '255,255,255', 3, 30);
    this.flies = this.flies.filter((f) => f.t < 1);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < p.life);
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life && p.y < this.H + 20);
  }

  private nearShoreSand(): { x: number; y: number } {
    const x = (0.08 + Math.random() * 0.84) * this.W;
    return { x, y: Math.min(this.H - 8, this.shoreY(x) + (18 + Math.random() * 50) * this.k) };
  }
  private waterline(): { x: number; y: number } {
    const x = (0.06 + Math.random() * 0.88) * this.W;
    return { x, y: Math.min(this.H - 6, this.shoreY(x) + (9 + Math.random() * 7) * this.k) };
  }

  // ---- draw --------------------------------------------------------------

  private at(x: number, y: number, s: number, fn: () => void, flip = 1): void {
    const c = this.c;
    c.save();
    c.translate(x, y);
    c.scale(s * flip, s);
    fn();
    c.restore();
  }

  private shorePath(off: number, wobble: number): void {
    const c = this.c;
    c.beginPath();
    for (let x = -12; x <= this.W + 12; x += 8) {
      const y = this.shoreY(x) + off + Math.sin(x * 0.045 / this.k + this.t * 1.4) * wobble;
      if (x === -12) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  }

  /** Fog over locked sectors (with their price), faint borders and a "left" counter on the ones being cleaned. */
  private drawSectors(): void {
    const { c, k, t, state } = this;
    const pill = (text: string, x: number, y: number, fg: string): void => {
      c.font = `800 ${Math.round(13 * k)}px ui-rounded, "Nunito", system-ui, sans-serif`;
      const w = c.measureText(text).width + 18 * k;
      c.fillStyle = 'rgba(20,50,62,0.72)';
      c.beginPath();
      c.roundRect(x - w / 2, y - 12 * k, w, 24 * k, 12 * k);
      c.fill();
      c.fillStyle = fg;
      c.fillText(text, x, y + 0.5 * k);
    };
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const cost = sim.sectorCost(state);
    for (let id = 0; id < SECTOR_COUNT; id++) {
      const r = this.sectorRect(id);
      const pad = 2 * k;
      if (!this.isOpen(id)) {
        const sea = this.sea[id];
        const block = sim.sectorBlock(state, id, !!sea);
        const afford = block === null;
        c.fillStyle = sea ? 'rgba(52,86,100,0.5)' : 'rgba(84,92,84,0.5)';
        c.beginPath();
        c.roundRect(r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, 10 * k);
        c.fill();
        c.setLineDash([6 * k, 5 * k]);
        c.strokeStyle = afford ? `rgba(255,226,130,${0.7 + 0.3 * Math.sin(t * 4)})` : 'rgba(255,255,255,0.35)';
        c.lineWidth = 1.6 * k;
        c.stroke();
        c.setLineDash([]);
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const blocked = sea && !sim.canSail(state);
        pill(block === 'far' ? '🔒' : blocked ? '⛵ Boat' : `🔒 ${fmtShort(cost)}`, cx, cy, blocked ? '#cfe9f2' : afford ? '#ffd24a' : '#ffffff');
      } else {
        const left = state.sectorLeft[id] ?? 0;
        c.setLineDash([3 * k, 7 * k]);
        c.strokeStyle = 'rgba(255,255,255,0.22)';
        c.lineWidth = 1 * k;
        c.strokeRect(r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2);
        c.setLineDash([]);
        if (left > 0) {
          c.font = `800 ${Math.round(10.5 * k)}px ui-rounded, "Nunito", system-ui, sans-serif`;
          c.fillStyle = 'rgba(255,255,255,0.85)';
          c.strokeStyle = 'rgba(30,70,85,0.5)';
          c.lineWidth = 2.4 * k;
          c.strokeText(`${left} left`, r.x + 28 * k, r.y + 13 * k);
          c.fillText(`${left} left`, r.x + 28 * k, r.y + 13 * k);
        } else {
          c.font = `800 ${Math.round(11 * k)}px ui-rounded, "Nunito", system-ui, sans-serif`;
          c.fillStyle = 'rgba(255,255,255,0.8)';
          c.fillText('✓', r.x + 12 * k, r.y + 13 * k);
        }
        const fx = this.sectorFx[id];
        if (fx !== undefined) {
          c.fillStyle = `rgba(255,248,214,${0.55 * (1 - fx / 1.2)})`;
          c.fillRect(r.x, r.y, r.w, r.h);
        }
      }
    }
  }

  draw(): void {
    const { c, W, H, k, t, r } = this;
    const state = this.state;
    const animals = state.animals;
    c.clearRect(0, 0, W, H);

    // --- water
    const gx = W * 0.4;
    const gy = this.shoreY(gx);
    const wg = c.createLinearGradient(gx, gy, gx + H * 0.3, gy - H * 0.62);
    wg.addColorStop(0, S.mix('#b3bfa6', '#9af0df', r));
    wg.addColorStop(0.35, S.mix('#93a79b', '#4fd8d0', r));
    wg.addColorStop(1, S.mix('#6f8a86', '#1ea7cf', r));
    c.fillStyle = wg;
    c.fillRect(0, 0, W, H);

    // murk patches fade away early on
    if (r < 0.32) {
      const al = 0.3 * (1 - r / 0.32);
      for (const m of this.murk) S.ell(c, m.x + Math.sin(t * 0.3 + m.ph) * 5, m.y, 30 * k * m.s, 12 * k * m.s, `rgba(74,82,60,${al})`);
    }

    // --- seabed life (under the surface)
    c.save();
    c.globalAlpha = 0.9;
    for (const rk of this.rocks) this.at(rk.x, rk.y, k * rk.s, () => S.rock(c));
    for (const g of this.grass) {
      const gs = smooth((r - g.at) / 0.08);
      if (gs > 0) this.at(g.x, g.y, k * g.s * gs, () => S.seagrass(c, t + g.ph));
    }
    for (const co of this.corals) {
      const cs = smooth((r - co.at) / 0.08);
      if (cs > 0) this.at(co.x, co.y, k * co.s * cs * 1.15, () => S.coral(c, co.kind));
    }
    if (animals.includes('octopus')) this.at(this.rocks[0].x + 9 * k, this.rocks[0].y - 1 * k, k * 0.95, () => S.octopus(c, t));
    if (animals.includes('seahorse')) this.at(this.grass[2].x + 7 * k, this.grass[2].y - 4 * k, k * 0.9, () => S.seahorse(c, t));
    if (animals.includes('starfish')) this.at(this.starSpots[1].x, this.starSpots[1].y, k * 0.9, () => S.starfish(c, t));
    if (animals.includes('clownfish')) {
      const home = this.corals[1];
      for (let i = 0; i < 2; i++) {
        const an = t * 0.9 + i * Math.PI;
        this.at(home.x + Math.cos(an) * 13 * k, home.y - 6 * k + Math.sin(an) * 6 * k, k * 0.85, () => S.fish(c, t + i, '#ff8a3d', true), Math.sin(an) > 0 ? -1 : 1);
      }
    }
    if (this.school && animals.includes('sardine')) {
      const m = this.school;
      for (let i = 0; i < 8; i++) {
        const ox = Math.cos(i * 2.4) * (10 + (i % 3) * 5) * k + Math.sin(t * 1.5 + i) * 3 * k;
        const oy = Math.sin(i * 1.7) * 9 * k + Math.cos(t * 1.2 + i) * 2 * k;
        this.at(m.x + ox, m.y + oy, k * 0.6, () => S.fish(c, t + i, '#e6f3f8'), m.dir);
      }
    }
    if (this.turtleM && animals.includes('turtle')) this.at(this.turtleM.x, this.turtleM.y, k, () => S.turtle(c, t), this.turtleM.dir);
    if (this.mantaM && animals.includes('manta')) {
      c.globalAlpha = 0.75;
      this.at(this.mantaM.x, this.mantaM.y, k * 1.25, () => S.manta(c, t), this.mantaM.dir);
    }
    for (const m of this.units.robot) this.at(m.x, m.y, k * 0.95, () => S.robot(c, t + m.ph), m.dir);
    c.restore();

    // --- surface: wave dashes and sparkles
    c.lineCap = 'round';
    for (const w of this.waves) {
      const al = (0.1 + 0.2 * r) * (0.5 + 0.5 * Math.sin(t * 0.9 + w.ph));
      const x = w.x + Math.sin(t * 0.35 + w.ph) * 7 * k;
      const L = 9 * k * w.s;
      c.beginPath();
      c.moveTo(x - L, w.y - L * 0.5);
      c.quadraticCurveTo(x, w.y - 1.5 * k, x + L, w.y + L * 0.5);
      c.strokeStyle = `rgba(255,255,255,${al})`;
      c.lineWidth = 1.4 * k;
      c.stroke();
    }
    if (r > 0.3) {
      for (const sp of this.sparkles) {
        const al = Math.max(0, Math.sin(t * 2.2 + sp.ph)) * Math.min(1, (r - 0.3) * 1.6);
        if (al < 0.05) continue;
        const s = 2.6 * k * sp.s;
        c.fillStyle = `rgba(255,255,255,${al})`;
        c.beginPath();
        c.moveTo(sp.x, sp.y - s);
        c.quadraticCurveTo(sp.x, sp.y, sp.x + s, sp.y);
        c.quadraticCurveTo(sp.x, sp.y, sp.x, sp.y + s);
        c.quadraticCurveTo(sp.x, sp.y, sp.x - s, sp.y);
        c.quadraticCurveTo(sp.x, sp.y, sp.x, sp.y - s);
        c.fill();
      }
    }

    // whale far offshore
    if (animals.includes('whale')) {
      const cyc = (t % 16) / 16;
      const up = smooth(cyc / 0.12) * (1 - smooth((cyc - 0.55) / 0.12));
      const spout = cyc > 0.14 && cyc < 0.3 ? 1 : 0;
      this.at(W * 0.74, H * 0.075, k * 0.9, () => S.whale(c, t, up, spout));
    }

    // --- sand
    this.shorePath(0, 1.5 * k);
    c.lineTo(W + 12, H + 12);
    c.lineTo(-12, H + 12);
    c.closePath();
    const sg = c.createLinearGradient(W * 0.5, this.shoreY(W * 0.5), W * 0.25, H);
    sg.addColorStop(0, S.mix('#c9bd9c', '#ecd9a4', r));
    sg.addColorStop(0.25, S.mix('#d2c7a8', '#f7e6b8', r));
    sg.addColorStop(1, S.mix('#cbbf9f', '#fbeec6', r));
    c.fillStyle = sg;
    c.fill();
    // wet sand + foam
    this.shorePath(5 * k, 1.5 * k);
    c.strokeStyle = 'rgba(170,140,95,0.28)';
    c.lineWidth = 11 * k;
    c.stroke();
    const foam = S.mix('#d6d2c0', '#ffffff', r);
    this.shorePath(-1 * k + Math.sin(t * 1.1) * 3 * k, 2 * k);
    c.strokeStyle = foam;
    c.globalAlpha = 0.92;
    c.lineWidth = 3.6 * k;
    c.stroke();
    this.shorePath(-9 * k + Math.sin(t * 1.1 + 1.2) * 3.5 * k, 2.5 * k);
    c.globalAlpha = 0.4;
    c.lineWidth = 2 * k;
    c.stroke();
    c.globalAlpha = 1;

    for (const p of this.pebbles) S.ell(c, p.x, p.y, 2.2 * k * p.s, 1.3 * k * p.s, ['rgba(160,135,95,0.35)', 'rgba(255,255,255,0.45)', 'rgba(140,150,150,0.3)'][p.kind]);
    if (r < 0.42) {
      const al = 0.22 * (1 - r / 0.42);
      for (const st of this.stains) S.ell(c, st.x, st.y, 20 * k * st.s, 8 * k * st.s, `rgba(70,62,50,${al})`);
    }
    if (animals.includes('starfish')) this.at(this.starSpots[0].x, this.starSpots[0].y, k * 0.95, () => S.starfish(c, t + 2));

    // --- everything standing on the world, sorted by depth
    const items: { y: number; d: () => void }[] = [];
    const add = (y: number, d: () => void) => items.push({ y, d });

    add(this.pierPos.y - 14 * k, () => this.at(this.pierPos.x, this.pierPos.y, k, () => S.pier(c, 62)));
    add(this.station.y, () => this.at(this.station.x, this.station.y, k * 1.05, () => S.recycler(c, state.recycler, t)));
    add(this.store.y, () => this.at(this.store.x, this.store.y, k, () => S.storage(c, state.waste / storageCap(state))));

    for (const p of this.palms) {
      const g = p.at === 0 ? 1 : smooth((r - p.at) / 0.1);
      if (g <= 0) continue;
      const health = p.at === 0 ? smooth((r - 0.15) / 0.35) : 1;
      add(p.y, () => this.at(p.x, p.y, k * p.s * g, () => S.palm(c, t + p.ph, health), p.kind % 2 ? -1 : 1));
    }
    for (const p of this.plants) {
      const g = smooth((r - p.at) / 0.08);
      if (g > 0) add(p.y, () => this.at(p.x, p.y, k * p.s * g, () => S.tuft(c, t + p.ph, p.kind)));
    }
    for (const tr of this.trash) {
      add(tr.y, () => {
        const bobY = tr.water ? Math.sin(t * 2 + tr.ph) * 1.6 * k : 0;
        if (tr.water) {
          c.beginPath();
          c.ellipse(tr.x, tr.y + 1 * k, (9 + Math.sin(t * 2 + tr.ph) * 1.5) * k, 3.4 * k, 0, 0, TAU);
          c.strokeStyle = 'rgba(255,255,255,0.55)';
          c.lineWidth = 1.1 * k;
          c.stroke();
        } else S.ell(c, tr.x, tr.y + 0.5 * k, 8 * k, 2.6 * k, 'rgba(60,50,40,0.2)');
        c.save();
        c.translate(tr.x, tr.y + bobY);
        const s = k * 1.3 * (0.4 + 0.6 * smooth(tr.age));
        c.scale(s, s);
        c.rotate(tr.rot + (tr.water ? Math.sin(t * 1.5 + tr.ph) * 0.12 : 0));
        c.globalAlpha = smooth(tr.age);
        S.trash(c, tr.kind);
        c.restore();
      });
    }
    if (this.bottle) {
      const b = this.bottle;
      const fade = Math.min(1, b.age / 0.8, (BOTTLE_LIFE - b.age) / 3);
      add(b.y, () => {
        c.save();
        c.globalAlpha = Math.max(0, fade);
        c.beginPath();
        c.ellipse(b.x, b.y + 1 * k, (12 + Math.sin(t * 2 + b.ph) * 2) * k, 4.2 * k, 0, 0, TAU);
        c.strokeStyle = 'rgba(255,255,255,0.7)';
        c.lineWidth = 1.2 * k;
        c.stroke();
        c.translate(b.x, b.y + Math.sin(t * 2 + b.ph) * 2 * k);
        c.scale(k * 1.35, k * 1.35);
        S.bottleNote(c, t);
        c.restore();
      });
    }
    this.units.worker.forEach((m, i) => add(m.y, () => this.at(m.x, m.y, k * 0.9, () => S.person(c, t + m.ph, { shirt: WORKER_SHIRTS[i % 6], hat: '#fff3c4', walk: m.moving, tool: true }), m.dir)));
    for (const m of this.units.cleaner) add(m.y, () => this.at(m.x, m.y, k * 0.95, () => S.cleaner(c, t), -m.dir));
    for (const m of this.units.boat) add(m.y, () => this.at(m.x, m.y + Math.sin(t * 2 + m.ph) * 1.2 * k, k * 0.95, () => S.boat(c, t + m.ph), m.dir));
    for (const m of this.units.floater) add(m.y, () => this.at(m.x, m.y + Math.sin(t * 1.6 + m.ph) * 1.5 * k, k, () => S.floater(c, t + m.ph)));
    for (const m of this.units.vessel) add(m.y, () => this.at(m.x, m.y + Math.sin(t * 1.2 + m.ph) * 1 * k, k * 0.9, () => S.vessel(c, t + m.ph), m.dir));
    if (animals.includes('crab')) for (const m of this.crabs) add(m.y, () => this.at(m.x, m.y, k * 0.85, () => S.crab(c, m.moving ? t : 0)));
    if (animals.includes('sandpiper')) for (const m of this.pipers) add(m.y, () => this.at(m.x, m.y, k * 0.85, () => S.sandpiper(c, t, m.moving), m.dir));
    {
      const p = this.player;
      const water = sim.canSail(state) && this.isWater(p.x, p.y);
      const reach = sim.sweepRadius(state, water) * k;
      // sweep area under the player's feet
      c.save();
      c.beginPath();
      c.ellipse(p.x, p.y, reach, reach / 1.6, 0, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.fill();
      c.setLineDash([5 * k, 5 * k]);
      c.lineDashOffset = -t * 8;
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 1.4 * k;
      c.stroke();
      c.restore();
      if (water) add(p.y, () => this.at(p.x, p.y + Math.sin(t * 2) * 1.2 * k, k * 1.05, () => S.boat(c, t), p.dir));
      else add(p.y, () => this.at(p.x, p.y, k * 1.12, () => S.person(c, t, { shirt: '#2fb7ae', hat: '#ffd98a', walk: p.moving, tool: true }), p.dir));
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.d();

    // dolphin leaping
    if (animals.includes('dolphin') && this.dolphinJump.t < 1.0) {
      const j = this.dolphinJump;
      const u = j.t / 1.0;
      const x = j.x + (u - 0.5) * 34 * k * j.dir;
      const y = j.y - Math.sin(u * Math.PI) * 26 * k;
      c.save();
      c.translate(x, y);
      c.scale(k * j.dir, k);
      c.rotate((u - 0.5) * 1.9);
      S.dolphin(c);
      c.restore();
    }

    // --- in the air
    if (animals.includes('gull')) {
      for (let i = 0; i < 2; i++) {
        const an = t * (0.32 + i * 0.07) + i * 2.6;
        const cx = W * (0.42 + i * 0.16);
        const cy = H * (0.3 + i * 0.16);
        const rx = W * (0.3 - i * 0.06);
        const ry = H * (0.13 + i * 0.03);
        const x = cx + Math.cos(an) * rx;
        const y = cy + Math.sin(an) * ry;
        S.ell(c, x + 10 * k, y + 34 * k, 9 * k, 3 * k, 'rgba(30,60,70,0.12)');
        c.save();
        c.translate(x, y);
        c.rotate(an + Math.PI);
        c.scale(k * 0.85, k * 0.85);
        S.gull(c, t + i);
        c.restore();
      }
    }
    for (const m of this.units.drone) {
      const hov = Math.sin(t * 3 + m.ph) * 2 * k;
      S.ell(c, m.x, m.y + 4 * k, 8 * k, 2.6 * k, 'rgba(30,60,70,0.16)');
      this.at(m.x, m.y - 26 * k + hov, k * 0.95, () => S.drone(c, t + m.ph));
    }

    // --- flying trash, particles, popups
    for (const f of this.flies) {
      const u = f.t;
      const x = f.x0 + (f.x1 - f.x0) * u;
      const y = f.y0 + (f.y1 - f.y0) * u - Math.sin(u * Math.PI) * 60 * k;
      c.save();
      c.translate(x, y);
      c.rotate(u * 5);
      c.scale(k * 1.1 * (1 - u * 0.4), k * 1.1 * (1 - u * 0.4));
      S.trash(c, f.kind);
      c.restore();
    }
    for (const p of this.parts) {
      const u = p.t / p.life;
      if (p.ring) {
        c.beginPath();
        c.ellipse(p.x, p.y, p.r * (1 + u * 2.2), p.r * (1 + u * 2.2) * 0.45, 0, 0, TAU);
        c.strokeStyle = `rgba(${p.color},${0.6 * (1 - u)})`;
        c.lineWidth = 1.5 * k;
        c.stroke();
      } else S.ell(c, p.x, p.y, p.r * (1 - u * 0.5), p.r * (1 - u * 0.5), `rgba(${p.color},${1 - u})`);
    }

    this.drawSectors();

    // pollution haze lifts as the beach recovers; warm sunlight grows
    if (r < 0.98) {
      c.fillStyle = `rgba(118,122,100,${0.2 * Math.pow(1 - r, 1.4)})`;
      c.fillRect(0, 0, W, H);
    }
    const sun = c.createRadialGradient(W * 0.05, 0, 0, W * 0.05, 0, H * 0.9);
    sun.addColorStop(0, `rgba(255,244,200,${0.1 + 0.2 * r})`);
    sun.addColorStop(1, 'rgba(255,244,200,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const p of this.popups) {
      const u = p.t / p.life;
      c.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      c.font = `800 ${Math.round(p.size * k * (1 + 0.25 * Math.max(0, 1 - u * 6)))}px ui-rounded, "Nunito", system-ui, sans-serif`;
      const y = p.y - u * 30 * k;
      c.strokeStyle = 'rgba(30,70,85,0.55)';
      c.lineWidth = 3 * k;
      c.strokeText(p.text, p.x, y);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, y);
    }
    c.globalAlpha = 1;
  }
}

function fmtShort(n: number): string {
  if (n < 1000) return String(Math.floor(n));
  const u = ['K', 'M', 'B', 'T', 'Q'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 1 : 0) + u[i];
}
