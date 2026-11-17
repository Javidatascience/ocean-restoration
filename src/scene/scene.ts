// The coast seen from above. A camera follows the player; the dirt is a fine grid painted into an offscreen
// canvas, one pixel per cell, so sweeping it away reveals the clean sand and water underneath.
import { ANIMALS, POWERS, TOOLS, TREASURES, type PowerId } from '../core/content.ts';
import * as sim from '../core/sim.ts';
import type { GameState } from '../core/state.ts';
import {
  BURIED, CELL, GH, GW, LITTER, LITTER_RADIUS, LITTER_TIER, SECTOR, SECTOR_N, SCOLS, SROWS, WORLD_H, WORLD_W,
  LANDMARKS, isWater, isWaterCell, sectorAt, sectorName, sectorOfCell, shoreY, theme, type LandmarkSpot,
} from '../core/world.ts';
import * as S from './sprites.ts';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; r: number }
interface Popup { x: number; y: number; text: string; color: string; t: number; size: number }
interface Flyer { i: number; x: number; y: number; t: number }
interface Helper { x: number; y: number; tx: number; ty: number; sea: boolean; ph: number; dir: number; idle: number; sec: number; lane: number; turning: boolean; skip: number }
interface Critter { id: string; x: number; y: number; tx: number; ty: number; ph: number; dir: number; wait: number }
interface Decor { x: number; y: number; kind: number; s: number; ph: number }

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
function noise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
  const b = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

const LAND_DIRT =[[128, 112, 88], [120, 104, 80], [134, 118, 94], [112, 98, 76], [126, 114, 90], [118, 108, 84]];
const SEA_DIRT = [[78, 92, 72], [72, 86, 66], [84, 94, 74], [82, 86, 66], [74, 88, 72]];
const PLASTIC = [[232, 87, 79], [79, 163, 232], [242, 242, 242], [92, 198, 160], [246, 185, 59], [255, 138, 190]];

/** Ground decoration revealed as the dirt goes: shells and pebbles on the sand, seagrass and coral underwater. */
const DECOR: Decor[] = (() => {
  const rand = rng(4242);
  const out: Decor[] = [];
  for (let id = 0; id < SECTOR_N; id++) {
    const x0 = (id % SCOLS) * SECTOR;
    const y0 = Math.floor(id / SCOLS) * SECTOR;
    const th = theme(id);
    const wet = th.decor.filter((k) => k >= 3);
    const dry = th.decor.filter((k) => k <= 2 || k === 7);
    for (let i = 0; i < th.decorN; i++) {
      const x = x0 + rand() * SECTOR;
      const y = y0 + rand() * SECTOR;
      const off = shoreY(x) - y;
      if (Math.abs(off) < 10) continue;
      const list = off > 0 ? (wet.length ? wet : [6, 7]) : (dry.length ? dry : [0, 1]);
      out.push({ x, y, kind: list[Math.floor(rand() * list.length)]!, s: 0.7 + rand() * 0.6, ph: rand() * TAU });
    }
  }
  return out;
})();
/** Palms dotted along the sand. kind = the sector they stand in. */
const PALMS: Decor[] = (() => {
  const rand = rng(99);
  const out: Decor[] = [];
  for (let id = 0; id < SECTOR_N; id++) {
    const n = theme(id).palms;
    for (let i = 0; i < n; i++) {
      const x = (id % SCOLS) * SECTOR + 40 + rand() * (SECTOR - 80);
      const y = Math.floor(id / SCOLS) * SECTOR + 40 + rand() * (SECTOR - 80);
      if (isWater(x, y - 20)) continue;
      out.push({ x, y, kind: id, s: 0.95 + rand() * 0.35, ph: rand() * TAU });
    }
  }
  return out;
})();

/** A seamless tile of grime and small debris, 64 world px wide, drawn at 4 px per world px. */
function dirtPattern(c: C, sea: boolean): CanvasPattern {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d')!;
  const rand = rng(sea ? 515 : 717);
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy);
  };
  const dot = (x: number, y: number, r: number, col: string) => wrap((ox, oy) => {
    g.beginPath();
    g.arc(x + ox, y + oy, r, 0, TAU);
    g.fillStyle = col;
    g.fill();
  });
  for (let i = 0; i < 1100; i++) {
    const dark = rand() < 0.62;
    const col = sea
      ? (dark ? `rgba(40,58,40,${0.25 + rand() * 0.35})` : `rgba(190,215,170,${0.12 + rand() * 0.2})`)
      : (dark ? `rgba(70,54,36,${0.25 + rand() * 0.4})` : `rgba(235,220,185,${0.15 + rand() * 0.25})`);
    dot(rand() * N, rand() * N, 0.8 + rand() * rand() * 4, col);
  }
  // twigs / seaweed strands
  for (let i = 0; i < 16; i++) {
    const x = rand() * N;
    const y = rand() * N;
    const a = rand() * TAU;
    const len = 10 + rand() * 22;
    wrap((ox, oy) => {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + Math.cos(a + 0.6) * len * 0.5, y + oy + Math.sin(a + 0.6) * len * 0.5, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      g.strokeStyle = sea ? 'rgba(52,110,60,0.75)' : 'rgba(96,70,44,0.8)';
      g.lineWidth = 1.6 + rand();
      g.lineCap = 'round';
      g.stroke();
    });
  }
  // bits of plastic, caps and butts
  for (let i = 0; i < 22; i++) {
    const x = rand() * N;
    const y = rand() * N;
    const a = rand() * TAU;
    const p = PLASTIC[Math.floor(rand() * PLASTIC.length)]!;
    const kind = rand();
    wrap((ox, oy) => {
      g.save();
      g.translate(x + ox, y + oy);
      g.rotate(a);
      if (kind < 0.5) {
        g.fillStyle = `rgba(${p[0]},${p[1]},${p[2]},0.9)`;
        g.fillRect(-4 - rand() * 3, -1.5 - rand() * 1.5, 8 + rand() * 4, 3 + rand() * 2);
      } else if (kind < 0.75) {
        g.beginPath();
        g.arc(0, 0, 2.6, 0, TAU);
        g.fillStyle = `rgba(${p[0]},${p[1]},${p[2]},0.95)`;
        g.fill();
      } else if (!sea) {
        g.fillStyle = '#f4efe6';
        g.fillRect(-4, -1.1, 6, 2.2);
        g.fillStyle = '#d98a3a';
        g.fillRect(2, -1.1, 2.5, 2.2);
      } else {
        g.beginPath();
        g.ellipse(0, 0, 5, 2.4, 0, 0, TAU);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fill();
      }
      g.restore();
    });
  }
  const pat = c.createPattern(cv, 'repeat')!;
  pat.setTransform(new DOMMatrix().scale(64 / N));
  return pat;
}

export class Scene {
  /** Sweep at a point; returns what got cleaned. Wired to the rules by main. */
  sweepAt: (x: number, y: number, r: number, reach: sim.Reach, mult?: number) => sim.SweepOut = () => ({ cells: 0, coins: 0, events: [] });
  pickAt: (x: number, y: number, reach: sim.Reach, extra: number) => sim.PickOut = () => ({ coins: 0, picked: [], tooBig: [] });
  digAt: (x: number, y: number, reach: sim.Reach, extra: number) => sim.DigOut = () => ({ coins: 0, found: [], firstOfKind: [] });
  onSector: (id: number) => void = () => {};
  onTooBig: (i: number) => void = () => {};
  onPower: (id: PowerId) => void = () => {};

  // power-ups lying on the ground, and the ones running now
  private powers: { id: PowerId; x: number; y: number; age: number }[] = [];
  private active: Partial<Record<PowerId, number>> = {};
  private powerTimer = 35;
  /** Current sweep radius (tool, or doubled by the Mega Brush). */
  private curR = 4;
  /** Size boost for animals when zoomed far out. */
  private comp = 1;
  /** Name banner shown for a moment when you walk into another sector. */
  private here = -1;
  private banner = { text: '', t: 9 };

  private c: C;
  private W = 390;
  private H = 600;
  private dpr = 1;
  private t = 0;
  private camX = 0;
  private camY = 0;
  private zoom = 2;

  // dirt layer
  private dirtCv: HTMLCanvasElement;
  private buf = document.createElement('canvas');
  private bctx = this.buf.getContext('2d')!;
  private landPat: CanvasPattern;
  private seaPat: CanvasPattern;
  private dirtCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private dx0 = GW;
  private dy0 = GH;
  private dx1 = -1;
  private dy1 = -1;

  private parts: Particle[] = [];
  private popups: Popup[] = [];
  private flyers: Flyer[] = [];
  private helpers: Helper[] = [];
  private critters: Critter[] = [];
  private critterTimer = 0;
  private coinAcc = 0;
  private coinTimer = 0;
  private dir = 1;
  private moving = false;
  private tooBigShown = -1;

  // input
  private stick: { ox: number; oy: number; x: number; y: number; id: number; t0: number; dragged: boolean } | null = null;
  private keys = new Set<string>();
  private target: { x: number; y: number } | null = null;

  constructor(private cv: HTMLCanvasElement, private s: GameState, private f: sim.Field) {
    this.c = cv.getContext('2d')!;
    this.landPat = dirtPattern(this.c, false);
    this.seaPat = dirtPattern(this.c, true);
    this.dirtCv = document.createElement('canvas');
    this.dirtCv.width = GW;
    this.dirtCv.height = GH;
    this.dirtCtx = this.dirtCv.getContext('2d')!;
    this.img = this.dirtCtx.createImageData(GW, GH);
    this.paintDirt();
    f.onCell = (gx, gy) => {
      this.img.data[(gy * GW + gx) * 4 + 3] = 0;
      if (gx < this.dx0) this.dx0 = gx;
      if (gy < this.dy0) this.dy0 = gy;
      if (gx > this.dx1) this.dx1 = gx;
      if (gy > this.dy1) this.dy1 = gy;
    };
    this.camX = s.px;
    this.camY = s.py;
    this.resize();
    this.zoom = this.targetZoom();
    this.bindInput();
  }

  // ---- dirt texture --------------------------------------------------------

  private paintDirt(): void {
    const d = this.img.data;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const i = gy * GW + gx;
        const o = i * 4;
        const h = hash(gx, gy);
        const sea = isWaterCell(gx, gy);
        const th = theme(sectorOfCell(gx, gy));
        const col = sea ? (th.zone === 'sea' ? th.dirt : SEA_DIRT[0]!) : (th.zone === 'sea' ? LAND_DIRT[0]! : th.dirt);
        // soft large-scale blotches; the fine detail comes from the texture drawn on top
        const blot = 0.8 + 0.3 * (0.75 * noise(gx / 9, gy / 9) + 0.25 * h);
        d[o] = Math.min(255, col[0]! * blot);
        d[o + 1] = Math.min(255, col[1]! * blot);
        d[o + 2] = Math.min(255, col[2]! * blot);
        d[o + 3] = this.f.dirt[i] ? (sea ? 215 : 245) : 0;
      }
    }
    this.dirtCtx.putImageData(this.img, 0, 0);
  }
  private flushDirt(): void {
    if (this.dx1 < 0) return;
    this.dirtCtx.putImageData(this.img, 0, 0, this.dx0, this.dy0, this.dx1 - this.dx0 + 1, this.dy1 - this.dy0 + 1);
    this.dx0 = GW; this.dy0 = GH; this.dx1 = -1; this.dy1 = -1;
  }

  // ---- input ----------------------------------------------------------------

  private bindInput(): void {
    const cv = this.cv;
    const pos = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (this.stick) return;
      const p = pos(e);
      try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      this.stick = { ox: p.x, oy: p.y, x: p.x, y: p.y, id: e.pointerId, t0: performance.now(), dragged: false };
    });
    cv.addEventListener('pointermove', (e) => {
      const st = this.stick;
      if (!st || e.pointerId !== st.id) return;
      const p = pos(e);
      st.x = p.x;
      st.y = p.y;
      if (Math.hypot(p.x - st.ox, p.y - st.oy) > 10) { st.dragged = true; this.target = null; }
    });
    const end = (e: PointerEvent) => {
      const st = this.stick;
      if (!st || e.pointerId !== st.id) return;
      this.stick = null;
      if (!st.dragged && performance.now() - st.t0 < 350) this.tap(st.ox, st.oy);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    window.addEventListener('keydown', (e) => { this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.camX + (sx - this.W / 2) / this.zoom, y: this.camY + (sy - this.H / 2) / this.zoom };
  }
  private toScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.camX) * this.zoom + this.W / 2, y: (y - this.camY) * this.zoom + this.H / 2 };
  }

  private tap(sx: number, sy: number): void {
    const w = this.toWorld(sx, sy);
    if (isWater(w.x, w.y) && !this.s.boat) {
      this.onSector(sectorAt(w.x, w.y));
      return;
    }
    if (this.allowed(w.x, w.y)) this.target = w;
  }

  /** Walk / sail to a point (used by the map). */
  goTo(x: number, y: number): void {
    this.target = { x, y };
  }

  private allowed(x: number, y: number): boolean {
    const id = sectorAt(x, y);
    if (id < 0 || !this.f.open[id]) return false;
    return !isWater(x, y) || this.s.boat;
  }

  // ---- geometry -------------------------------------------------------------

  resize(): void {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = this.cv.clientWidth || 390;
    this.H = this.cv.clientHeight || 600;
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
  }
  /** Close-up with a tiny tool; the camera pulls back as the tool grows. */
  private targetZoom(): number {
    const viewW = 120 + sim.toolRadius(this.s) * 11;
    return Math.max(this.W / viewW, Math.min(this.W / WORLD_W, this.H / WORLD_H) * 1.02);
  }

  // ---- effects --------------------------------------------------------------

  popup(x: number, y: number, text: string, color = '#ffffff', size = 15): void {
    this.popups.push({ x, y, text, color, t: 0, size });
    if (this.popups.length > 30) this.popups.shift();
  }
  burst(x: number, y: number, color: string, n: number, speed = 40): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.3 + Math.random() * 0.7) * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.4, color, r: 0.8 + Math.random() * 1.4 });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }
  playerPos(): { x: number; y: number } {
    return { x: this.s.px, y: this.s.py };
  }
  sectorFx(id: number, color = '255,236,160'): void {
    const x0 = (id % SCOLS) * SECTOR;
    const y0 = Math.floor(id / SCOLS) * SECTOR;
    for (let i = 0; i < 70; i++) this.burst(x0 + Math.random() * SECTOR, y0 + Math.random() * SECTOR, color, 1, 30 + Math.random() * 40);
  }
  celebrate(): void {
    const cols = ['255,138,128', '255,210,74', '110,220,170', '120,190,255', '200,160,255'];
    const p = this.playerPos();
    const span = this.W / this.zoom;
    for (let i = 0; i < 140; i++) this.burst(p.x + (Math.random() - 0.5) * span, p.y + (Math.random() - 0.5) * span * 1.5, cols[i % 5]!, 1, 60);
  }

  // ---- update ---------------------------------------------------------------

  update(dt: number): void {
    const s = this.s;
    this.t += dt;
    const r = sim.toolRadius(s) * (this.active.mega ? 2 : 1);
    this.curR = r;

    // movement input: joystick, keys, or walking to a tapped point
    let vx = 0;
    let vy = 0;
    if (this.stick?.dragged) {
      const dx = this.stick.x - this.stick.ox;
      const dy = this.stick.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      const mag = Math.min(1, d / 48);
      if (d > 4) { vx = (dx / d) * mag; vy = (dy / d) * mag; }
    } else {
      const k = this.keys;
      vx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
      vy = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
      const m = Math.hypot(vx, vy);
      if (m > 0) { vx /= m; vy /= m; this.target = null; }
      else if (this.target) {
        const dx = this.target.x - s.px;
        const dy = this.target.y - s.py;
        const d = Math.hypot(dx, dy);
        if (d < 2) this.target = null;
        else { vx = dx / d; vy = dy / d; }
      }
    }
    const onWater = s.boat && isWater(s.px, s.py);
    const speed = sim.moveSpeed(s, onWater) * (this.active.turbo ? 2 : 1);
    this.moving = vx !== 0 || vy !== 0;
    const reach = { land: true, sea: s.boat };
    if (this.moving) {
      if (Math.abs(vx) > 0.05) this.dir = vx > 0 ? 1 : -1;
      const total = speed * dt;
      const steps = Math.max(1, Math.ceil(total / Math.max(2, r * 0.8)));
      for (let i = 0; i < steps; i++) {
        const nx = s.px + (vx * total) / steps;
        const ny = s.py + (vy * total) / steps;
        if (this.allowed(nx, ny)) { s.px = nx; s.py = ny; }
        else if (this.allowed(nx, s.py)) s.px = nx;
        else if (this.allowed(s.px, ny)) s.py = ny;
        else { this.target = null; break; }
        this.sweepHere(r, reach);
      }
    } else this.sweepHere(r, reach);

    // camera
    const zt = this.targetZoom();
    this.zoom += (zt - this.zoom) * Math.min(1, dt * 2);
    this.camX += (s.px - this.camX) * Math.min(1, dt * 6);
    this.camY += (s.py - this.camY) * Math.min(1, dt * 6);
    const hw = this.W / 2 / this.zoom;
    const hh = this.H / 2 / this.zoom;
    this.camX = hw * 2 >= WORLD_W ? WORLD_W / 2 : Math.max(hw, Math.min(WORLD_W - hw, this.camX));
    this.camY = hh * 2 >= WORLD_H ? WORLD_H / 2 : Math.max(hh, Math.min(WORLD_H - hh, this.camY));

    // coin pops gathered over a short window
    this.coinTimer += dt;
    if (this.coinTimer > 0.4) {
      this.coinTimer = 0;
      if (this.coinAcc > 0) {
        this.popup(s.px + (Math.random() - 0.5) * r, s.py - r - 6, '+' + fmtShort(this.coinAcc), '#ffe08a', 13);
        this.coinAcc = 0;
      }
    }

    this.updatePowers(dt);
    const here = sectorAt(s.px, s.py);
    if (here !== this.here) {
      if (this.here >= 0 && here >= 0) {
        const th = theme(here);
        this.banner = { text: `${th.icon} ${th.name}`, t: 0 };
      }
      this.here = here;
    }
    this.banner.t += dt;
    this.updateHelpers(dt);
    this.updateCritters(dt);

    for (const fl of this.flyers) fl.t += dt / 0.35;
    this.flyers = this.flyers.filter((fl) => fl.t < 1);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.1);
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
  }

  private sweepHere(r: number, reach: sim.Reach): void {
    const s = this.s;
    const mult = this.active.gold ? 3 : 1;
    const res = this.sweepAt(s.px, s.py, r, reach, mult);
    if (res.cells > 0) {
      this.coinAcc += res.coins;
      const n = Math.min(3, 1 + (res.cells >> 3));
      const sea = isWater(s.px, s.py);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        this.parts.push({
          x: s.px + Math.cos(a) * r * 0.9, y: s.py + Math.sin(a) * r * 0.9, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18 - 6,
          t: 0, life: 0.45, color: sea ? '220,245,255' : '150,128,96', r: 0.6 + Math.random() * Math.max(0.8, r * 0.08),
        });
      }
    }
    const extra = 0;
    const dig = this.digAt(s.px, s.py, reach, extra);
    for (const i of dig.found) {
      const b = BURIED[i]!;
      this.burst(b.x, b.y, '255,226,130', 18, 45);
      this.popup(b.x, b.y - 12, `${TREASURES[b.kind]!.icon} +${fmtShort(sim.treasureValue(s, i))}`, '#ffd24a', 18);
    }
    const pk = this.pickAt(s.px, s.py, reach, extra);
    for (const i of pk.picked) {
      const l = LITTER[i]!;
      this.flyers.push({ i, x: l.x, y: l.y, t: 0 });
      this.burst(l.x, l.y, '255,236,170', 6, 30);
      this.popup(l.x, l.y - 8, '+' + fmtShort(sim.litterValue(s, i)), '#ffd24a', 16);
    }
    if (pk.tooBig.length && pk.tooBig[0] !== this.tooBigShown) {
      this.tooBigShown = pk.tooBig[0]!;
      this.onTooBig(pk.tooBig[0]!);
    }
  }

  private updatePowers(dt: number): void {
    const s = this.s;
    for (const k of Object.keys(this.active) as PowerId[]) {
      this.active[k]! -= dt;
      if (this.active[k]! <= 0) delete this.active[k];
    }
    this.powerTimer -= dt;
    if (this.powerTimer <= 0 && this.powers.length === 0 && s.cleaned > 300) {
      this.powerTimer = 40 + Math.random() * 35;
      const ids = Object.keys(POWERS) as PowerId[];
      const viewW = this.W / this.zoom;
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * TAU;
        const d = viewW * (0.22 + Math.random() * 0.2);
        const x = s.px + Math.cos(a) * d;
        const y = s.py + Math.sin(a) * d;
        if (!this.allowed(x, y)) continue;
        this.powers.push({ id: ids[Math.floor(Math.random() * ids.length)]!, x, y, age: 0 });
        break;
      }
    }
    for (const p of this.powers) {
      p.age += dt;
      if (Math.hypot(p.x - s.px, p.y - s.py) < this.curR + 10) {
        this.active[p.id] = POWERS[p.id].seconds;
        this.burst(p.x, p.y, '255,236,140', 24, 60);
        this.onPower(p.id);
        p.age = 999;
      }
    }
    this.powers = this.powers.filter((p) => p.age < 35);
  }

  private updateHelpers(dt: number): void {
    const s = this.s;
    for (const sea of [false, true]) {
      const want = sea ? s.helpers.drone : s.helpers.bot;
      let have = this.helpers.filter((h) => h.sea === sea).length;
      while (have < want) {
        const p = sim.helperTarget(s, this.f, sea) ?? { x: s.px, y: s.py };
        this.helpers.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, sea, ph: Math.random() * TAU, dir: 1, idle: 0, sec: -1, lane: 0, turning: false, skip: -1 });
        have++;
      }
    }
    const r = sim.helperRadius(s);
    for (const h of this.helpers) {
      const dx = h.tx - h.x;
      const dy = h.ty - h.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) {
        h.idle -= dt;
        if (h.idle <= 0) this.nextLane(h, r);
      } else {
        const step = Math.min(d, sim.HELPER_SPEED * dt);
        h.x += (dx / d) * step;
        h.y += (dy / d) * step;
        if (Math.abs(dx) > 0.5) h.dir = dx > 0 ? 1 : -1;
      }
      this.sweepAt(h.x, h.y, r, { land: !h.sea, sea: h.sea });
    }
  }

  /** Helpers comb a sector in tidy back-and-forth lanes, then move on to the next unfinished one. */
  private nextLane(h: Helper, r: number): void {
    const s = this.s;
    const needSector = h.sec < 0 || s.done.includes(h.sec) || this.f.left[h.sec]! <= 0;
    if (needSector) {
      const taken = new Set(this.helpers.filter((o) => o !== h && o.sea === h.sea).map((o) => o.sec));
      const options = sim.helperSectors(s, this.f, h.sea).filter((id) => id !== h.skip);
      const sec = options.find((id) => !taken.has(id)) ?? options[0];
      if (sec === undefined) { h.idle = 2; h.sec = -1; return; }
      h.sec = sec;
      h.lane = 0;
      h.turning = false;
    }
    const ys = sim.lanes(h.sec, r);
    const x0 = (h.sec % SCOLS) * SECTOR;
    if (h.turning) {
      // reached the lane start: sweep across to the other side
      h.turning = false;
      h.tx = h.dir > 0 ? x0 + SECTOR - 1 : x0 + 1;
      return;
    }
    // finished a lane (or just arrived): find the next lane that still has dirt for us
    let lane = needSector ? 0 : h.lane + 1;
    while (lane < ys.length && !sim.laneDirty(this.f, h.sec, ys[lane]!, r, h.sea)) lane++;
    if (lane >= ys.length) {
      // nothing left we can clean here (maybe only the other terrain): try another sector
      h.skip = h.sec;
      h.sec = -1;
      h.idle = 0.2;
      return;
    }
    h.lane = lane;
    h.dir = Math.abs(h.x - x0) < Math.abs(h.x - (x0 + SECTOR)) ? 1 : -1;
    h.tx = h.dir > 0 ? x0 + 1 : x0 + SECTOR - 1;
    h.ty = ys[lane]!;
    h.turning = true;
  }

  private cleanAt(x: number, y: number): boolean {
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(y / CELL);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return false;
    return !this.f.dirt[gy * GW + gx];
  }

  /** Animals that have returned show up around you, on clean sand or in clean water. */
  private updateCritters(dt: number): void {
    const s = this.s;
    const back = ANIMALS.filter((a) => s.animals.includes(a.id) && a.id !== 'gull' && a.id !== 'whale');
    const hw = this.W / 2 / this.zoom;
    const hh = this.H / 2 / this.zoom;
    this.critters = this.critters.filter((c) => Math.abs(c.x - this.camX) < hw * 2.5 && Math.abs(c.y - this.camY) < hh * 2.5);
    this.critterTimer -= dt;
    if (back.length && this.critterTimer <= 0 && this.critters.length < 6) {
      this.critterTimer = 0.8;
      const a = back[Math.floor(Math.random() * back.length)]!;
      for (let i = 0; i < 8; i++) {
        const x = this.camX + (Math.random() - 0.5) * hw * 2.2;
        const y = this.camY + (Math.random() - 0.5) * hh * 2.2;
        if (isWater(x, y) !== a.sea || !this.cleanAt(x, y)) continue;
        this.critters.push({ id: a.id, x, y, tx: x, ty: y, ph: Math.random() * TAU, dir: 1, wait: Math.random() * 2 });
        break;
      }
    }
    const speeds: Record<string, number> = { crab: 10, sandpiper: 26, starfish: 0, sardine: 22, clownfish: 14, seahorse: 5, turtle: 9, octopus: 6, dolphin: 34, manta: 14 };
    for (const c of this.critters) {
      const sp = speeds[c.id] ?? 10;
      const dx = c.tx - c.x;
      const dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5 || sp === 0) {
        c.wait -= dt;
        if (c.wait <= 0 && sp > 0) {
          const a = ANIMALS.find((x) => x.id === c.id)!;
          for (let i = 0; i < 6; i++) {
            const nx = c.x + (Math.random() - 0.5) * 80;
            const ny = c.y + (Math.random() - 0.5) * 80;
            if (isWater(nx, ny) === a.sea && this.cleanAt(nx, ny)) { c.tx = nx; c.ty = ny; break; }
          }
          c.wait = 0.5 + Math.random() * 2;
        }
      } else {
        const step = Math.min(d, sp * dt);
        c.x += (dx / d) * step;
        c.y += (dy / d) * step;
        if (Math.abs(dx) > 0.3) c.dir = dx > 0 ? 1 : -1;
      }
    }
  }

  // ---- draw -----------------------------------------------------------------

  private at(x: number, y: number, s: number, fn: () => void, flip = 1): void {
    const c = this.c;
    c.save();
    c.translate(x, y);
    c.scale(s * flip, s);
    fn();
    c.restore();
  }

  draw(): void {
    this.flushDirt();
    const { c, W, H, dpr, zoom: z, t, s } = this;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#2a9fc4';
    c.fillRect(0, 0, W, H);
    c.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - this.camX * z), dpr * (H / 2 - this.camY * z));
    const vx0 = this.camX - W / 2 / z;
    const vy0 = this.camY - H / 2 / z;
    const vx1 = this.camX + W / 2 / z;
    const vy1 = this.camY + H / 2 / z;
    const px = 1 / z; // one screen pixel in world units
    // animals keep a minimum on-screen size when the camera pulls back
    this.comp = Math.max(1, px / 0.8);

    // --- water
    const wg = c.createLinearGradient(0, 0, 0, shoreY(WORLD_W / 2));
    wg.addColorStop(0, '#1d86b8');
    wg.addColorStop(0.7, '#2fb5cf');
    wg.addColorStop(1, '#7fe3dc');
    c.fillStyle = wg;
    c.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);

    // --- sand
    const step = Math.max(4, 8 / z);
    const shore = (off: number, wob: number) => {
      c.beginPath();
      let first = true;
      for (let x = vx0 - step; x <= vx1 + step; x += step) {
        const y = shoreY(x) + off + Math.sin(x * 0.05 + t * 1.4) * wob;
        if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
      }
    };
    shore(0, 1.2);
    c.lineTo(vx1 + step, vy1 + 10);
    c.lineTo(vx0 - step, vy1 + 10);
    c.closePath();
    const sg = c.createLinearGradient(0, shoreY(WORLD_W / 2), 0, WORLD_H);
    sg.addColorStop(0, '#f1dca5');
    sg.addColorStop(0.15, '#f7e6b8');
    sg.addColorStop(1, '#fbeec6');
    c.fillStyle = sg;
    c.fill();
    shore(4, 1.2);
    c.strokeStyle = 'rgba(190,150,95,0.3)';
    c.lineWidth = 7;
    c.stroke();
    c.lineCap = 'round';

    // --- decoration under the dirt
    for (const d of DECOR) {
      if (d.x < vx0 - 20 || d.x > vx1 + 20 || d.y < vy0 - 20 || d.y > vy1 + 20) continue;
      this.drawDecor(d);
    }

    // --- dirt: the cell grid is the mask (soft edges), a detailed texture of grime and debris fills it
    {
      const b = this.buf;
      const bc = this.bctx;
      if (b.width !== this.cv.width || b.height !== this.cv.height) { b.width = this.cv.width; b.height = this.cv.height; }
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.globalCompositeOperation = 'source-over';
      bc.clearRect(0, 0, b.width, b.height);
      bc.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - this.camX * z), dpr * (H / 2 - this.camY * z));
      bc.imageSmoothingEnabled = true;
      const gx0 = Math.max(0, Math.floor(vx0 / CELL) - 1);
      const gy0 = Math.max(0, Math.floor(vy0 / CELL) - 1);
      const gx1 = Math.min(GW, Math.ceil(vx1 / CELL) + 1);
      const gy1 = Math.min(GH, Math.ceil(vy1 / CELL) + 1);
      if (gx1 > gx0 && gy1 > gy0) bc.drawImage(this.dirtCv, gx0, gy0, gx1 - gx0, gy1 - gy0, gx0 * CELL, gy0 * CELL, (gx1 - gx0) * CELL, (gy1 - gy0) * CELL);
      bc.globalCompositeOperation = 'source-atop';
      const half = (edgeY: number, pat: CanvasPattern) => {
        bc.save();
        bc.beginPath();
        bc.moveTo(vx0 - 10, edgeY);
        for (let x = vx0 - 10; x <= vx1 + step + 10; x += step) bc.lineTo(x, shoreY(x));
        bc.lineTo(vx1 + step + 10, edgeY);
        bc.closePath();
        bc.clip();
        bc.fillStyle = pat;
        bc.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
        bc.restore();
      };
      half(vy0 - 10, this.seaPat);
      half(vy1 + 10, this.landPat);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(b, 0, 0);
      c.restore();
    }

    // foam on top of the dirt so the shoreline always reads
    shore(-1, 2);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 2.4;
    c.stroke();
    shore(-7 + Math.sin(t * 1.1) * 2, 2.5);
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1.5;
    c.stroke();

    // --- the sea stays hazy until you have a boat
    if (!s.boat && shoreY(this.camX) > vy0 - 200) {
      c.beginPath();
      c.moveTo(vx0 - 10, vy0 - 10);
      for (let x = vx0 - 10; x <= vx1 + step + 10; x += step) c.lineTo(x, shoreY(x) - 3);
      c.lineTo(vx1 + step + 10, vy0 - 10);
      c.closePath();
      c.fillStyle = 'rgba(28,46,56,0.3)';
      c.fill();
    }

    // --- sector borders: a dotted line, so you always know where one sector ends and the next begins
    const sc0 = Math.max(0, Math.floor(vx0 / SECTOR));
    const sc1 = Math.min(SCOLS - 1, Math.floor(vx1 / SECTOR));
    const sr0 = Math.max(0, Math.floor(vy0 / SECTOR));
    const sr1 = Math.min(SROWS - 1, Math.floor(vy1 / SECTOR));
    c.lineCap = 'round';
    for (const [col, width] of [['rgba(30,50,60,0.35)', 4.2], ['rgba(255,255,255,0.9)', 2.4]] as const) {
      c.setLineDash([0.01, 9 * px]);
      c.strokeStyle = col;
      c.lineWidth = width * px;
      c.beginPath();
      for (let cx = sc0; cx <= sc1 + 1; cx++) { if (cx === 0 || cx === SCOLS) continue; c.moveTo(cx * SECTOR, vy0); c.lineTo(cx * SECTOR, vy1); }
      for (let ry = sr0; ry <= sr1 + 1; ry++) { if (ry === 0 || ry === SROWS) continue; c.moveTo(vx0, ry * SECTOR); c.lineTo(vx1, ry * SECTOR); }
      c.stroke();
    }
    c.setLineDash([]);

    // --- things standing in the world, sorted by depth
    const items: { y: number; d: () => void }[] = [];
    const add = (y: number, d: () => void) => items.push({ y, d });
    const inView = (x: number, y: number, m: number) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    for (let i = 0; i < LITTER.length; i++) {
      if (this.f.picked[i]) continue;
      const l = LITTER[i]!;
      if (!inView(l.x, l.y, 40)) continue;
      add(l.y, () => this.drawLitter(i));
    }
    for (const l of LANDMARKS) {
      if (!inView(l.x, l.y, 140)) continue;
      add(l.y, () => this.drawLandmark(l));
    }
    for (const p of PALMS) {
      if (!inView(p.x, p.y, 90)) continue;
      const health = s.done.includes(p.kind) ? 1 : 0.15 + 0.7 * this.f.sectorClean(p.kind);
      add(p.y, () => this.at(p.x, p.y, p.s, () => S.palm(c, t + p.ph, health), p.kind % 2 ? -1 : 1));
    }
    for (const h of this.helpers) {
      if (!inView(h.x, h.y, 30)) continue;
      const hs = Math.max(0.35, sim.helperRadius(s) / 9);
      if (h.sea) add(h.y, () => this.at(h.x, h.y + Math.sin(t * 2 + h.ph) * 0.6, hs, () => S.floater(c, t + h.ph)));
      else add(h.y, () => this.at(h.x, h.y, hs * 0.8, () => S.robot(c, t + h.ph), h.dir));
    }
    for (const cr of this.critters) {
      if (!inView(cr.x, cr.y, 30)) continue;
      add(cr.y, () => this.drawCritter(cr));
    }
    add(s.py, () => this.drawPlayer());
    // treasure that has been uncovered but not picked up yet: it twinkles
    for (let i = 0; i < BURIED.length; i++) {
      if (this.f.dug[i]) continue;
      const b = BURIED[i]!;
      if (!inView(b.x, b.y, 20) || !sim.uncovered(this.f, i)) continue;
      add(b.y, () => this.drawIcon(b.x, b.y - 2, TREASURES[b.kind]!.icon, 16, true));
    }
    for (const p of this.powers) {
      if (!inView(p.x, p.y, 30)) continue;
      add(p.y, () => this.drawPowerUp(p.x, p.y, p.id, p.age));
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.d();

    // litter flying into the bag
    for (const fl of this.flyers) {
      const l = LITTER[fl.i]!;
      const u = fl.t;
      const x = fl.x + (s.px - fl.x) * u;
      const y = fl.y + (s.py - fl.y) * u - Math.sin(u * Math.PI) * 14;
      const sc = (LITTER_RADIUS[l.size]! / 8) * (1 - u * 0.6);
      this.at(x, y, sc, () => { c.rotate(u * 6); S.trash(c, l.kind); });
    }
    for (const p of this.parts) {
      const u = p.t / p.life;
      S.ell(c, p.x, p.y, p.r * (1 - u * 0.5), p.r * (1 - u * 0.5), `rgba(${p.color},${1 - u})`);
    }

    // seagulls: now and then a pair glides across the view, high above the beach, with a soft shadow below
    if (s.animals.includes('gull')) {
      const viewW = vx1 - vx0;
      const viewH = vy1 - vy0;
      const period = 22;
      const cycle = Math.floor(t / period);
      const u = (t % period) / period; // 0..1 across the screen, then a pause
      if (u < 0.7) {
        const dir = hash(cycle, 7) < 0.5 ? 1 : -1;
        const lane = 0.15 + hash(cycle, 3) * 0.5;
        const gs = 0.75 * this.comp;
        for (let i = 0; i < 2; i++) {
          const k = (u / 0.7) * (viewW + 160 * gs) - 80 * gs - i * 22 * gs;
          const x = dir > 0 ? vx0 + k : vx1 - k;
          const y = vy0 + viewH * lane + i * 14 * gs + Math.sin(t * 0.9 + i) * 6 * gs;
          S.ell(c, x + 10 * gs, y + 46 * gs, 8 * gs, 2.6 * gs, 'rgba(30,60,70,0.14)');
          c.save();
          c.translate(x, y);
          c.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          c.scale(gs, gs);
          S.gull(c, t * 1.3 + i);
          c.restore();
        }
      }
    }
    // the whale surfaces now and then out in deep, clean water
    if (s.animals.includes('whale')) {
      const wx = this.camX + (vx1 - vx0) * 0.22;
      const wy = vy0 + (vy1 - vy0) * 0.28;
      if (isWater(wx, wy) && shoreY(wx) - wy > 250 && this.cleanAt(wx, wy)) {
        const cyc = (t % 18) / 18;
        const up = Math.min(1, cyc / 0.1) * (1 - Math.max(0, Math.min(1, (cyc - 0.5) / 0.1)));
        const spout = cyc > 0.14 && cyc < 0.3 ? 1 : 0;
        if (up > 0) this.at(wx, wy, 1.6 * this.comp, () => S.whale(c, t, up, spout));
      }
    }

    // --- screen space: sector signs, popups, joystick
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSigns(sc0, sc1, sr0, sr1);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const p of this.popups) {
      const u = p.t / 1.1;
      const sp = this.toScreen(p.x, p.y);
      c.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      c.font = `800 ${p.size}px ui-rounded, "Nunito", system-ui, sans-serif`;
      const y = sp.y - u * 26;
      c.strokeStyle = 'rgba(30,60,70,0.6)';
      c.lineWidth = 3;
      c.strokeText(p.text, sp.x, y);
      c.fillStyle = p.color;
      c.fillText(p.text, sp.x, y);
    }
    c.globalAlpha = 1;
    this.drawBoosts();
    if (this.banner.t < 2.4) {
      const u = this.banner.t;
      const a = Math.min(1, u / 0.25, (2.4 - u) / 0.5);
      c.globalAlpha = Math.max(0, a);
      c.font = '800 18px ui-rounded, "Nunito", system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const w = c.measureText(this.banner.text).width + 32;
      const y = 92 - (1 - a) * 8;
      c.fillStyle = 'rgba(255,250,240,0.95)';
      c.beginPath();
      c.roundRect(this.W / 2 - w / 2, y - 19, w, 38, 19);
      c.fill();
      c.fillStyle = '#23404d';
      c.fillText(this.banner.text, this.W / 2, y + 1);
      c.globalAlpha = 1;
    }
    if (this.stick?.dragged) {
      const st = this.stick;
      const dx = st.x - st.ox;
      const dy = st.y - st.oy;
      const d = Math.hypot(dx, dy);
      const k = d > 48 ? 48 / d : 1;
      c.beginPath();
      c.arc(st.ox, st.oy, 48, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.arc(st.ox + dx * k, st.oy + dy * k, 20, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fill();
    }
  }

  /** An emoji at a fixed on-screen size, standing at a world position. */
  private drawIcon(x: number, y: number, icon: string, px: number, twinkle = false): void {
    const c = this.c;
    this.at(x, y, 1 / this.zoom, () => {
      if (twinkle) {
        const a = 0.35 + 0.35 * Math.sin(this.t * 5 + x);
        const g = c.createRadialGradient(0, -px * 0.4, 0, 0, -px * 0.4, px * 1.1);
        g.addColorStop(0, `rgba(255,240,170,${a})`);
        g.addColorStop(1, 'rgba(255,240,170,0)');
        c.fillStyle = g;
        c.fillRect(-px * 1.2, -px * 1.6, px * 2.4, px * 2.4);
      }
      c.font = `${px}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillText(icon, 0, 0);
    });
  }

  private drawPowerUp(x: number, y: number, id: PowerId, age: number): void {
    const c = this.c;
    const bob = Math.sin(this.t * 3) * 3;
    const fade = age > 30 ? Math.max(0, 1 - (age - 30) / 5) : 1;
    this.at(x, y, 1 / this.zoom, () => {
      c.globalAlpha = fade;
      c.beginPath();
      c.ellipse(0, 2, 16, 6, 0, 0, TAU);
      c.fillStyle = 'rgba(30,60,70,0.25)';
      c.fill();
      c.beginPath();
      c.arc(0, -16 + bob, 17 + Math.sin(this.t * 6) * 1.5, 0, TAU);
      c.fillStyle = 'rgba(255,214,90,0.95)';
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = '#fff';
      c.stroke();
      c.font = '20px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(POWERS[id].icon, 0, -15 + bob);
      c.globalAlpha = 1;
    });
  }

  /** Bottom of the screen: the power-ups running now. */
  private drawBoosts(): void {
    const c = this.c;
    const chips: { text: string; fill: string; frac: number }[] = [];
    for (const id of Object.keys(this.active) as PowerId[]) {
      const left = this.active[id]!;
      chips.push({ text: `${POWERS[id].icon} ${POWERS[id].name} ${Math.ceil(left)}s`, fill: '#4fc3f7', frac: left / POWERS[id].seconds });
    }
    if (!chips.length) return;
    c.font = '800 13px ui-rounded, "Nunito", system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    const widths = chips.map((ch) => c.measureText(ch.text).width + 26);
    let x = this.W / 2 - (widths.reduce((a, w) => a + w, 0) + (chips.length - 1) * 8) / 2;
    const y = this.H - 46;
    chips.forEach((ch, i) => {
      const w = widths[i]!;
      c.fillStyle = 'rgba(255,250,240,0.94)';
      c.beginPath();
      c.roundRect(x, y, w, 30, 15);
      c.fill();
      c.save();
      c.beginPath();
      c.roundRect(x, y, w, 30, 15);
      c.clip();
      c.fillStyle = ch.fill;
      c.globalAlpha = 0.45;
      c.fillRect(x, y + 24, w * ch.frac, 6);
      c.restore();
      c.fillStyle = '#23404d';
      c.fillText(ch.text, x + w / 2, y + 14);
      x += w + 8;
    });
  }

  /** The thing that makes each sector recognisable. Sizes are in world pixels. */
  private drawLandmark(l: LandmarkSpot): void {
    const { c, t } = this;
    const sh = (rx: number, ry: number) => S.ell(c, 0, 1, rx, ry, 'rgba(50,40,30,0.22)');
    this.at(l.x, l.y, 1, () => {
      switch (l.kind) {
        case 'castle': {
          sh(36, 9);
          S.rr(c, -30, -18, 60, 18, 3, '#e2c486');
          for (const [x, h] of [[-32, 32], [18, 32], [-8, 42]] as const) {
            S.rr(c, x, -h, 14, h, 2, '#ebd198');
            for (let k = 0; k < 3; k++) S.rr(c, x + k * 5, -h - 4, 3.4, 4, 0.6, '#ebd198');
          }
          S.rr(c, -4, -12, 8, 12, 4, '#b8975c');
          S.line(c, [-1, -46, -1, -62], '#7a5a3a', 1.4);
          const wave = Math.sin(t * 4) * 1.5;
          S.poly(c, [-1, -62, 11, -58 + wave, -1, -54], '#ff6b6b');
          for (const [x, y] of [[-22, -6], [26, -8], [10, -24]] as const) S.ell(c, x, y, 2, 1.4, '#ffd6c9');
          break;
        }
        case 'umbrella': {
          c.save();
          c.rotate(-0.25 * l.flip);
          S.rr(c, -10, -6, 34, 14, 2, '#5cc6e8');
          for (let k = 0; k < 4; k++) S.rr(c, -10 + k * 9, -6, 4.5, 14, 0, '#ffffff');
          c.restore();
          sh(26, 7);
          S.line(c, [0, 0, 0, -38], '#cfd6db', 1.6);
          const cols = ['#ff6b6b', '#ffffff', '#ffd24a', '#ffffff', '#ff6b6b', '#ffffff'];
          for (let k = 0; k < 6; k++) {
            const a0 = Math.PI + (k / 6) * Math.PI;
            const a1 = Math.PI + ((k + 1) / 6) * Math.PI;
            c.beginPath();
            c.moveTo(0, -38);
            c.ellipse(0, -38, 30, 12, 0, a0, a1);
            c.closePath();
            c.fillStyle = cols[k]!;
            c.fill();
          }
          S.ell(c, -18, 8, 6, 3, '#ffb36b');
          break;
        }
        case 'hut': {
          sh(34, 9);
          for (const x of [-26, 22]) S.rr(c, x, -34, 4, 34, 1, '#8a6a4a');
          S.rr(c, -26, -16, 52, 16, 2, '#a07850');
          S.rr(c, -28, -18, 56, 4, 1, '#c79a63');
          S.poly(c, [-38, -32, 0, -54, 38, -32, 30, -28, -30, -28], '#e3c26e');
          for (let k = -30; k <= 30; k += 6) S.line(c, [k, -29, k * 0.2, -50], 'rgba(150,110,50,0.5)', 0.8);
          S.rr(c, -12, -44, 24, 9, 2, '#2fb7ae');
          c.font = '800 7px ui-rounded, system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillStyle = '#fff';
          c.fillText('BAR', 0, -39.5);
          S.rr(c, -14, -24, 4, 7, 1, '#7fd0e8');
          S.rr(c, 8, -24, 4, 7, 1, '#ff9f43');
          break;
        }
        case 'tower': {
          sh(24, 7);
          S.line(c, [-14, 0, -10, -30], '#f2f2f2', 2.4);
          S.line(c, [14, 0, 10, -30], '#f2f2f2', 2.4);
          S.line(c, [-12, -12, 12, -12], '#e0e0e0', 1.6);
          S.rr(c, -16, -34, 32, 5, 1, '#e8574f');
          S.rr(c, -12, -54, 24, 20, 2, '#ffffff');
          S.rr(c, -9, -50, 18, 8, 1, '#7fd0e8');
          S.poly(c, [-15, -54, 0, -64, 15, -54], '#e8574f');
          S.rr(c, -2.5, -46, 5, 2, 0, '#e8574f');
          S.line(c, [12, -54, 12, -76], '#9aa5ad', 1);
          S.poly(c, [12, -76, 24, -72 + Math.sin(t * 3), 12, -68], '#ffd24a');
          break;
        }
        case 'logs': {
          for (const [x, y, w, r] of [[-30, -4, 58, 0.15], [-10, 6, 46, -0.3]] as const) {
            c.save();
            c.translate(x + w / 2, y);
            c.rotate(r * l.flip);
            S.ell(c, 0, 4, w / 2 + 2, 4, 'rgba(50,40,30,0.2)');
            S.rr(c, -w / 2, -5, w, 10, 5, '#a08466');
            S.line(c, [-w / 2 + 6, -1, w / 2 - 8, -2], 'rgba(90,70,50,0.5)', 1);
            S.ell(c, w / 2 - 2, 0, 3.5, 5, '#c9b08c');
            S.ell(c, w / 2 - 2, 0, 1.6, 2.4, '#a08466');
            c.restore();
          }
          break;
        }
        case 'boulders':
          for (const [x, y, sc] of [[-22, 0, 3.2], [14, 6, 2.4], [2, -14, 2]] as const) this.at(x, y, sc, () => S.rock(c));
          break;
        case 'fence': {
          for (let x = -70; x <= 70; x += 14) {
            const y = Math.sin(x * 0.04) * 6;
            S.rr(c, x - 1.6, y - 16, 3.2, 16, 1, '#9b7b55');
          }
          c.beginPath();
          for (let x = -70; x <= 70; x += 7) {
            const y = Math.sin(x * 0.04) * 6 - 11 + Math.sin(x * 0.45) * 1.2;
            if (x === -70) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.strokeStyle = '#d8c39c';
          c.lineWidth = 1.2;
          c.stroke();
          break;
        }
        case 'surf': {
          const cols = ['#ff6b6b', '#4fc3f7', '#ffd24a'];
          cols.forEach((col, k) => {
            c.save();
            c.translate(-16 + k * 16, 0);
            c.rotate((k - 1) * 0.18);
            S.ell(c, 0, 1, 7, 2.4, 'rgba(50,40,30,0.2)');
            c.beginPath();
            c.ellipse(0, -18, 6, 20, 0, 0, TAU);
            c.fillStyle = col;
            c.fill();
            S.line(c, [0, -36, 0, 0], 'rgba(255,255,255,0.8)', 1.2);
            c.restore();
          });
          break;
        }
        case 'pier':
          this.at(0, 0, 1.8, () => S.pier(c, 90), l.flip);
          break;
        case 'pool': {
          c.beginPath();
          c.ellipse(0, 0, 34, 16, 0, 0, TAU);
          c.fillStyle = '#5ccfd6';
          c.fill();
          c.strokeStyle = 'rgba(255,255,255,0.6)';
          c.lineWidth = 1.5;
          c.stroke();
          for (const [x, y, sc] of [[-34, 2, 1.4], [30, -4, 1.2], [6, 14, 1], [-10, -16, 0.9]] as const) this.at(x, y, sc, () => S.rock(c));
          this.at(8, 2, 0.6, () => S.starfish(c, t));
          break;
        }
        case 'wreck': {
          c.globalAlpha = 0.85;
          c.save();
          c.rotate(-0.35 * l.flip);
          S.poly(c, [-56, -6, 46, -10, 58, 2, 40, 14, -50, 12], '#6b4a32');
          S.poly(c, [-50, -2, 40, -6, 48, 2, 36, 8, -46, 8], '#8a6446');
          for (let x = -40; x < 40; x += 10) S.line(c, [x, -4, x + 2, 8], 'rgba(60,40,25,0.6)', 1);
          S.line(c, [-6, 0, 10, -44], '#5a3d28', 3);
          S.poly(c, [8, -40, 26, -30, 6, -20], 'rgba(240,235,220,0.8)');
          c.restore();
          c.globalAlpha = 1;
          c.beginPath();
          c.ellipse(0, 4, 62, 20, -0.35 * l.flip, 0, TAU);
          c.strokeStyle = `rgba(255,255,255,${0.25 + 0.15 * Math.sin(t * 2)})`;
          c.lineWidth = 1.4;
          c.stroke();
          break;
        }
        case 'buoy': {
          const bob = Math.sin(t * 2) * 1.5;
          c.beginPath();
          c.ellipse(0, 2, 14 + Math.sin(t * 2) * 2, 5, 0, 0, TAU);
          c.strokeStyle = 'rgba(255,255,255,0.6)';
          c.lineWidth = 1.2;
          c.stroke();
          S.rr(c, -7, -14 + bob, 14, 14, 6, '#e8574f');
          S.rr(c, -7, -9 + bob, 14, 4, 0, '#ffffff');
          S.line(c, [0, -14 + bob, 0, -30 + bob], '#555', 1.2);
          S.poly(c, [0, -30 + bob, 10, -27 + bob, 0, -24 + bob], '#ffd24a');
          break;
        }
        case 'reef':
          for (const [x, y, k, sc] of [[-24, 4, 3, 1.8], [0, -6, 4, 2.2], [22, 6, 5, 1.7], [-6, 12, 3, 1.3]] as const) this.at(x, y, sc, () => S.coral(c, k));
          break;
      }
    });
  }

  private drawDecor(d: Decor): void {
    const c = this.c;
    switch (d.kind) {
      case 0: // shell
        S.ell(c, d.x, d.y, 2.4 * d.s, 1.8 * d.s, '#ffd6c9');
        S.ell(c, d.x - 0.5, d.y - 0.4, 1.2 * d.s, 0.8 * d.s, '#fff3ee');
        break;
      case 1: // pebble
        S.ell(c, d.x, d.y, 2.2 * d.s, 1.5 * d.s, 'rgba(160,140,110,0.55)');
        break;
      case 2: // dune grass
        this.at(d.x, d.y, 0.6 * d.s, () => S.tuft(c, this.t + d.ph, 0));
        break;
      case 3: case 4: case 5: // coral in deeper water
        this.at(d.x, d.y, 0.8 * d.s, () => S.coral(c, d.kind));
        break;
      case 6: // seagrass
        this.at(d.x, d.y, 0.7 * d.s, () => S.seagrass(c, this.t + d.ph));
        break;
      default: // rock
        this.at(d.x, d.y, 0.7 * d.s, () => S.rock(c));
    }
  }

  private drawLitter(i: number): void {
    const c = this.c;
    const l = LITTER[i]!;
    const lr = LITTER_RADIUS[l.size]!;
    const sc = lr / 8;
    const bob = l.water ? Math.sin(this.t * 2 + i) * 0.8 : 0;
    if (l.water) {
      c.beginPath();
      c.ellipse(l.x, l.y + 0.5, lr * 1.1, lr * 0.4, 0, 0, TAU);
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 0.8;
      c.stroke();
    } else S.ell(c, l.x, l.y + 0.5, lr, lr * 0.35, 'rgba(50,40,30,0.25)');
    this.at(l.x, l.y + bob, sc, () => { c.rotate(l.rot); S.trash(c, l.kind); });
    // too big for the current tool: a small lock badge when you are near
    if (this.s.tool < LITTER_TIER[l.size]!) {
      const d = Math.hypot(l.x - this.s.px, l.y - this.s.py);
      if (d < sim.toolRadius(this.s) * 4 + 40) {
        this.at(l.x, l.y - lr * 1.6, 1 / this.zoom, () => {
          c.font = '800 11px ui-rounded, "Nunito", system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          const text = `🔒 ${TOOLS[LITTER_TIER[l.size]!]!.name}`;
          const w = c.measureText(text).width + 12;
          c.fillStyle = 'rgba(20,50,62,0.75)';
          c.beginPath();
          c.roundRect(-w / 2, -9, w, 18, 9);
          c.fill();
          c.fillStyle = '#fff';
          c.fillText(text, 0, 0.5);
        });
      }
    }
  }

  private drawPlayer(): void {
    const { c, s, t } = this;
    const r = this.curR;
    const onWater = s.boat && isWater(s.px, s.py);
    // reach ring
    c.beginPath();
    c.arc(s.px, s.py, r, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fill();
    c.setLineDash([4 / this.zoom, 4 / this.zoom]);
    c.lineDashOffset = (-t * 10) / this.zoom;
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 1.5 / this.zoom;
    c.stroke();
    c.setLineDash([]);
    const mr = sim.magnetRange(s);
    if (mr > 0) {
      c.beginPath();
      c.arc(s.px, s.py, r + mr, 0, TAU);
      c.strokeStyle = 'rgba(255,214,110,0.35)';
      c.stroke();
    }
    const look = sim.tool(s).look;
    {
    const r = sim.toolRadius(s); // the sprite follows the tool, the ring may be boosted
    if (onWater) {
      this.at(s.px, s.py + Math.sin(t * 2) * 0.5, Math.max(0.45, r / 15), () => S.boat(c, t), this.dir);
    } else if (look === 'machine') {
      this.at(s.px, s.py + r * 0.35, r / 13, () => S.cleaner(c, this.moving ? t : 0), -this.dir);
    } else {
      // tool head in front, person behind it
      const hs = Math.max(0.5, r / 6);
      const head = ['#8a6a4a', '#c0392b', '#2fb7ae', '#f2a03d'][s.tool] ?? '#888';
      c.save();
      c.translate(s.px + this.dir * r * 0.15, s.py + r * 0.45);
      const w = r * 1.5;
      S.rr(c, -w / 2, -r * 0.12, w, r * 0.24, r * 0.1, head);
      for (let i = 0; i < 6; i++) S.rr(c, -w / 2 + (i / 5) * (w - r * 0.1), r * 0.08, r * 0.08, r * 0.14, 0, 'rgba(60,40,20,0.6)');
      c.restore();
      this.at(s.px, s.py, hs * 0.55, () => S.person(c, t, { shirt: '#2fb7ae', hat: '#ffd98a', walk: this.moving, tool: true }), this.dir);
    }
    }
  }

  private drawCritter(cr: Critter): void {
    const { c, t } = this;
    const k = this.comp;
    const sc = 0.55 * k;
    switch (cr.id) {
      case 'crab': this.at(cr.x, cr.y, sc, () => S.crab(c, t + cr.ph)); break;
      case 'sandpiper': this.at(cr.x, cr.y, sc, () => S.sandpiper(c, t, true), cr.dir); break;
      case 'starfish': this.at(cr.x, cr.y, sc, () => S.starfish(c, t + cr.ph)); break;
      case 'sardine':
        for (let i = 0; i < 6; i++) this.at(cr.x + Math.cos(i * 2.4) * 7 * k, cr.y + Math.sin(i * 1.7) * 5 * k, 0.4 * k, () => S.fish(c, t + i, '#e6f3f8'), cr.dir);
        break;
      case 'clownfish': this.at(cr.x, cr.y, sc, () => S.fish(c, t, '#ff8a3d', true), cr.dir); break;
      case 'seahorse': this.at(cr.x, cr.y, sc, () => S.seahorse(c, t)); break;
      case 'turtle': this.at(cr.x, cr.y, 0.7 * k, () => S.turtle(c, t), cr.dir); break;
      case 'octopus': this.at(cr.x, cr.y, sc, () => S.octopus(c, t)); break;
      case 'dolphin': {
        // leaps out of the water every few seconds
        const ph = ((t * 0.35 + cr.ph) % 1 + 1) % 1;
        const jump = ph < 0.25 ? Math.sin((ph / 0.25) * Math.PI) : 0;
        if (jump <= 0.02) {
          c.beginPath();
          c.ellipse(cr.x, cr.y, 9 * k, 3 * k, 0, 0, TAU);
          c.strokeStyle = 'rgba(255,255,255,0.45)';
          c.lineWidth = 1 * k;
          c.stroke();
          break;
        }
        c.save();
        c.translate(cr.x, cr.y - jump * 14 * k);
        c.scale(0.8 * k * cr.dir, 0.8 * k);
        c.rotate((ph / 0.25 - 0.5) * 1.6);
        S.dolphin(c);
        c.restore();
        break;
      }
      case 'manta': c.globalAlpha = 0.8; this.at(cr.x, cr.y, 0.9 * k, () => S.manta(c, t), cr.dir); c.globalAlpha = 1; break;
    }
  }

  /** A small tag in the corner of every sector on screen (name and how clean it is), and a boat hint at sea. */
  private drawSigns(sc0: number, sc1: number, sr0: number, sr1: number): void {
    const c = this.c;
    const z = this.zoom;
    const vx0 = this.camX - this.W / 2 / z;
    const vy0 = this.camY - this.H / 2 / z;
    c.textBaseline = 'middle';
    c.font = '800 11px ui-rounded, "Nunito", system-ui, sans-serif';
    for (let row = sr0; row <= sr1; row++) {
      for (let col = sc0; col <= sc1; col++) {
        const id = row * SCOLS + col;
        const done = this.s.done.includes(id);
        const th = theme(id);
        const status = done ? '✓' : `${Math.floor(this.f.sectorClean(id) * 100)}%`;
        let text = `${th.icon} ${th.name} · ${status}`;
        const room = this.toScreen((col + 1) * SECTOR, 0).x - this.toScreen(Math.max(col * SECTOR, vx0), 0).x;
        if (c.measureText(text).width + 30 > room) text = `${th.icon} ${sectorName(id)} · ${status}`;
        const w = c.measureText(text).width + 14;
        // pin the tag to the sector's top-left corner, sliding it along while the corner is off screen
        const corner = this.toScreen(Math.max(col * SECTOR, vx0), Math.max(row * SECTOR, vy0));
        const end = this.toScreen((col + 1) * SECTOR, (row + 1) * SECTOR);
        const x = corner.x + 6;
        const y = Math.max(corner.y + 6, 56); // below the goal bar
        if (x + w > end.x - 4 || y + 20 > end.y - 4) continue;
        if (x + w > this.W - 80 && y < 160) continue; // under the minimap
        c.fillStyle = done ? 'rgba(46,170,120,0.85)' : 'rgba(20,50,62,0.55)';
        c.beginPath();
        c.roundRect(x, y, w, 20, 10);
        c.fill();
        c.fillStyle = '#fff';
        c.textAlign = 'left';
        c.fillText(text, x + 7, y + 10.5);
      }
    }
    if (!this.s.boat) {
      const sy = this.toScreen(this.camX, shoreY(this.camX) - 60).y;
      if (sy > 70 && sy < this.H - 40) {
        const text = '⛵ The sea needs a boat';
        c.font = '800 13px ui-rounded, "Nunito", system-ui, sans-serif';
        const w = c.measureText(text).width + 22;
        c.fillStyle = 'rgba(255,250,240,0.92)';
        c.beginPath();
        c.roundRect(this.W / 2 - w / 2, sy - 15, w, 30, 15);
        c.fill();
        c.fillStyle = '#23404d';
        c.textAlign = 'center';
        c.fillText(text, this.W / 2, sy + 0.5);
      }
    }
    c.textAlign = 'center';
  }

  // ---- minimap ----------------------------------------------------------------

  /** Draws the whole coast into a small canvas: dirt, the player and the camera view. */
  drawMap(cv: HTMLCanvasElement, detail = false): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d')!;
    c.setTransform((dpr * w) / WORLD_W, 0, 0, (dpr * h) / WORLD_H, 0, 0);
    c.fillStyle = '#35b3cf';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    c.beginPath();
    c.moveTo(0, shoreY(0));
    for (let x = 0; x <= WORLD_W; x += 40) c.lineTo(x, shoreY(x));
    c.lineTo(WORLD_W, WORLD_H);
    c.lineTo(0, WORLD_H);
    c.closePath();
    c.fillStyle = '#f5e2b0';
    c.fill();
    c.imageSmoothingEnabled = true;
    c.drawImage(this.dirtCv, 0, 0, WORLD_W, WORLD_H);
    if (!this.s.boat) {
      c.beginPath();
      c.moveTo(0, 0);
      for (let x = 0; x <= WORLD_W; x += 40) c.lineTo(x, shoreY(x));
      c.lineTo(WORLD_W, 0);
      c.closePath();
      c.fillStyle = 'rgba(25,40,50,0.35)';
      c.fill();
    }
    if (detail) {
      for (const id of this.s.done) {
        if (id < 0) continue;
        c.fillStyle = 'rgba(80,220,160,0.25)';
        c.fillRect((id % SCOLS) * SECTOR, Math.floor(id / SCOLS) * SECTOR, SECTOR, SECTOR);
      }
    }
    if (detail) {
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 6;
      for (let col = 1; col < SCOLS; col++) { c.beginPath(); c.moveTo(col * SECTOR, 0); c.lineTo(col * SECTOR, WORLD_H); c.stroke(); }
      for (let row = 1; row < SROWS; row++) { c.beginPath(); c.moveTo(0, row * SECTOR); c.lineTo(WORLD_W, row * SECTOR); c.stroke(); }
    }
    const hw = this.W / 2 / this.zoom;
    const hh = this.H / 2 / this.zoom;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = detail ? 10 : 22;
    c.strokeRect(this.camX - hw, this.camY - hh, hw * 2, hh * 2);
    c.fillStyle = '#ff5a4f';
    c.beginPath();
    c.arc(this.s.px, this.s.py, detail ? 30 : 60, 0, TAU);
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = detail ? 10 : 18;
    c.stroke();
  }

  /** Sector under a point of the map canvas. */
  mapSector(cv: HTMLCanvasElement, x: number, y: number): number {
    return sectorAt((x / cv.clientWidth) * WORLD_W, (y / cv.clientHeight) * WORLD_H);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
}

export function fmtShort(n: number): string {
  if (n < 10) return n.toFixed(1).replace(/\.0$/, '');
  if (n < 1000) return String(Math.floor(n));
  const u = ['K', 'M', 'B', 'T', 'Q'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 1 : 0) + u[i];
}
