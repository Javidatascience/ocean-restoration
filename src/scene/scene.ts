// The coast seen from above. A camera follows the player; the dirt is a fine grid painted into an offscreen
// canvas, one pixel per cell, so sweeping it away reveals the clean sand and water underneath.
import { ANIMALS, TOOLS } from '../core/content.ts';
import * as sim from '../core/sim.ts';
import type { GameState } from '../core/state.ts';
import {
  CELL, GH, GW, LITTER, LITTER_RADIUS, LITTER_TIER, SECTOR, SECTOR_N, SCOLS, SROWS, WORLD_H, WORLD_W,
  isSeaSector, isWater, isWaterCell, neighbours, sectorAt, shoreY,
} from '../core/world.ts';
import * as S from './sprites.ts';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; r: number }
interface Popup { x: number; y: number; text: string; color: string; t: number; size: number }
interface Flyer { i: number; x: number; y: number; t: number }
interface Helper { x: number; y: number; tx: number; ty: number; sea: boolean; ph: number; dir: number; idle: number }
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
    for (let i = 0; i < 16; i++) {
      const x = x0 + rand() * SECTOR;
      const y = y0 + rand() * SECTOR;
      const off = shoreY(x) - y;
      if (Math.abs(off) < 10) continue;
      const water = off > 0;
      const kind = water ? (off > 260 ? 3 + Math.floor(rand() * 3) : rand() < 0.6 ? 6 : 7) : Math.floor(rand() * 3);
      out.push({ x, y, kind, s: 0.7 + rand() * 0.6, ph: rand() * TAU });
    }
  }
  return out;
})();
/** Palms dotted along the sand. kind = the sector they stand in. */
const PALMS: Decor[] = (() => {
  const rand = rng(99);
  const out: Decor[] = [];
  for (let id = 0; id < SECTOR_N; id++) {
    if (isSeaSector(id) || rand() < 0.45) continue;
    const x = (id % SCOLS) * SECTOR + 40 + rand() * (SECTOR - 80);
    const y = Math.floor(id / SCOLS) * SECTOR + 40 + rand() * (SECTOR - 80);
    out.push({ x, y, kind: id, s: 0.95 + rand() * 0.35, ph: rand() * TAU });
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
  sweepAt: (x: number, y: number, r: number, reach: sim.Reach) => sim.SweepOut = () => ({ cells: 0, coins: 0, events: [] });
  pickAt: (x: number, y: number, reach: sim.Reach) => sim.PickOut = () => ({ coins: 0, picked: [], tooBig: [] });
  onSector: (id: number) => void = () => {};
  onTooBig: (i: number) => void = () => {};

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
        const pal = sea ? SEA_DIRT : LAND_DIRT;
        const col = pal[0]!;
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
    const id = sectorAt(w.x, w.y);
    if (id >= 0 && !this.s.sectors.includes(id)) {
      this.onSector(id);
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
    const r = sim.toolRadius(s);

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
    const speed = sim.moveSpeed(s, onWater);
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
    const res = this.sweepAt(s.px, s.py, r, reach);
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
    const pk = this.pickAt(s.px, s.py, reach);
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

  private updateHelpers(dt: number): void {
    const s = this.s;
    for (const sea of [false, true]) {
      const want = sea ? s.helpers.drone : s.helpers.bot;
      let have = this.helpers.filter((h) => h.sea === sea).length;
      while (have < want) {
        const p = sim.helperTarget(s, this.f, sea) ?? { x: s.px, y: s.py };
        this.helpers.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, sea, ph: Math.random() * TAU, dir: 1, idle: 0 });
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
        // look for dirt right next to us first, then anywhere in our sectors
        const near = this.nearDirt(h.x, h.y, h.sea, r * 6);
        const p = near ?? (h.idle <= 0 ? sim.helperTarget(s, this.f, h.sea) : null);
        if (p) { h.tx = p.x; h.ty = p.y; }
        else if (h.idle <= 0) h.idle = 2;
      } else {
        const step = Math.min(d, sim.HELPER_SPEED * dt);
        h.x += (dx / d) * step;
        h.y += (dy / d) * step;
        if (Math.abs(dx) > 0.5) h.dir = dx > 0 ? 1 : -1;
      }
      this.sweepAt(h.x, h.y, r, { land: !h.sea, sea: h.sea });
    }
  }

  /** A random dirty cell close to a point, in an open sector of the right terrain. */
  private nearDirt(x: number, y: number, sea: boolean, range: number): { x: number; y: number } | null {
    for (let i = 0; i < 12; i++) {
      const px = x + (Math.random() - 0.5) * range * 2;
      const py = y + (Math.random() - 0.5) * range * 2;
      const gx = Math.floor(px / CELL);
      const gy = Math.floor(py / CELL);
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      const id = sectorAt(px, py);
      if (id < 0 || !this.f.open[id] || this.s.done.includes(id)) continue;
      if (this.f.dirt[gy * GW + gx] && isWaterCell(gx, gy) === sea) return { x: px, y: py };
    }
    return null;
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

    // --- locked sectors: dimmed, with a rope fence along the border of the open area
    const sc0 = Math.max(0, Math.floor(vx0 / SECTOR));
    const sc1 = Math.min(SCOLS - 1, Math.floor(vx1 / SECTOR));
    const sr0 = Math.max(0, Math.floor(vy0 / SECTOR));
    const sr1 = Math.min(SROWS - 1, Math.floor(vy1 / SECTOR));
    for (let row = sr0; row <= sr1; row++) {
      for (let col = sc0; col <= sc1; col++) {
        const id = row * SCOLS + col;
        if (this.f.open[id]) continue;
        c.fillStyle = 'rgba(28,46,56,0.38)';
        c.fillRect(col * SECTOR, row * SECTOR, SECTOR, SECTOR);
      }
    }
    c.setLineDash([6 * px, 5 * px]);
    c.lineWidth = 2.2 * px;
    c.strokeStyle = 'rgba(255,240,210,0.9)';
    for (let row = sr0; row <= sr1; row++) {
      for (let col = sc0; col <= sc1; col++) {
        const id = row * SCOLS + col;
        if (!this.f.open[id]) continue;
        const x = col * SECTOR;
        const y = row * SECTOR;
        const edge = (nid: number, inside: boolean, x0: number, y0: number, x1: number, y1: number) => {
          if (inside && this.f.open[nid]) return;
          c.beginPath();
          c.moveTo(x0, y0);
          c.lineTo(x1, y1);
          c.stroke();
        };
        edge(id - SCOLS, row > 0, x, y, x + SECTOR, y);
        edge(id + SCOLS, row < SROWS - 1, x, y + SECTOR, x + SECTOR, y + SECTOR);
        edge(id - 1, col > 0, x, y, x, y + SECTOR);
        edge(id + 1, col < SCOLS - 1, x + SECTOR, y, x + SECTOR, y + SECTOR);
      }
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

    // seagulls overhead once they are back
    if (s.animals.includes('gull')) {
      for (let i = 0; i < 2; i++) {
        const an = t * (0.25 + i * 0.06) + i * 2.6;
        const span = (vx1 - vx0) * 0.4;
        const x = this.camX + Math.cos(an) * span;
        const y = this.camY + Math.sin(an) * span * 0.7;
        const gs = Math.max(0.6, 14 * px);
        c.save();
        c.translate(x, y);
        c.rotate(an + Math.PI);
        c.scale(gs, gs);
        S.gull(c, t + i);
        c.restore();
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
    const r = sim.toolRadius(s);
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

  private drawCritter(cr: Critter): void {
    const { c, t } = this;
    const sc = 0.55;
    switch (cr.id) {
      case 'crab': this.at(cr.x, cr.y, sc, () => S.crab(c, t + cr.ph)); break;
      case 'sandpiper': this.at(cr.x, cr.y, sc, () => S.sandpiper(c, t, true), cr.dir); break;
      case 'starfish': this.at(cr.x, cr.y, sc, () => S.starfish(c, t + cr.ph)); break;
      case 'sardine':
        for (let i = 0; i < 6; i++) this.at(cr.x + Math.cos(i * 2.4) * 7, cr.y + Math.sin(i * 1.7) * 5, 0.4, () => S.fish(c, t + i, '#e6f3f8'), cr.dir);
        break;
      case 'clownfish': this.at(cr.x, cr.y, sc, () => S.fish(c, t, '#ff8a3d', true), cr.dir); break;
      case 'seahorse': this.at(cr.x, cr.y, sc, () => S.seahorse(c, t)); break;
      case 'turtle': this.at(cr.x, cr.y, 0.7, () => S.turtle(c, t), cr.dir); break;
      case 'octopus': this.at(cr.x, cr.y, sc, () => S.octopus(c, t)); break;
      case 'dolphin': this.at(cr.x, cr.y, 0.8, () => S.dolphin(c), cr.dir); break;
      case 'manta': c.globalAlpha = 0.8; this.at(cr.x, cr.y, 0.9, () => S.manta(c, t), cr.dir); c.globalAlpha = 1; break;
    }
  }

  /** Price signs over the locked sectors you can open next. Drawn in screen space so they stay readable. */
  private drawSigns(sc0: number, sc1: number, sr0: number, sr1: number): void {
    const c = this.c;
    const z = this.zoom;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const vx0 = this.camX - this.W / 2 / z;
    const vx1 = this.camX + this.W / 2 / z;
    const vy0 = this.camY - this.H / 2 / z;
    const vy1 = this.camY + this.H / 2 / z;
    for (let row = sr0; row <= sr1; row++) {
      for (let col = sc0; col <= sc1; col++) {
        const id = row * SCOLS + col;
        if (this.f.open[id]) continue;
        const block = sim.sectorBlock(this.s, id);
        if (block === 'far') continue;
        const text = block === 'boat' ? '⛵ Needs the boat' : `🔒 Open · ${fmtShort(sim.sectorCost(id))}`;
        c.font = '800 13px ui-rounded, "Nunito", system-ui, sans-serif';
        const w = c.measureText(text).width + 22;
        // the part of the sector that is on screen; skip the sign if it would not fit there
        const a = this.toScreen(Math.max(col * SECTOR, vx0), Math.max(row * SECTOR, vy0));
        const b = this.toScreen(Math.min((col + 1) * SECTOR, vx1), Math.min((row + 1) * SECTOR, vy1));
        const top = Math.max(a.y, 8);
        const bottom = Math.min(b.y, this.H - 64); // keep clear of the goal chip
        if (b.x - a.x < w + 12 || bottom - top < 40) continue;
        const centre = this.toScreen((col + 0.5) * SECTOR, (row + 0.5) * SECTOR);
        const p = { x: clamp(centre.x, a.x + w / 2 + 6, b.x - w / 2 - 6), y: clamp(centre.y, top + 20, bottom - 20) };
        // stay out from under the minimap
        if (p.x + w / 2 > this.W - 84 && p.y < 170) {
          if (bottom - 20 < 170) continue;
          p.y = 170;
        }
        const afford = block === null;
        c.fillStyle = afford ? 'rgba(255,214,90,0.96)' : 'rgba(255,250,240,0.92)';
        c.beginPath();
        c.roundRect(p.x - w / 2, p.y - 15, w, 30, 15);
        c.fill();
        c.strokeStyle = afford ? '#d99a1c' : 'rgba(35,64,77,0.25)';
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = afford ? '#5a3d00' : '#23404d';
        c.fillText(text, p.x, p.y + 0.5);
      }
    }
  }

  // ---- minimap ----------------------------------------------------------------

  /** Draws the whole coast into a small canvas: dirt, locked sectors, the player and the camera view. */
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
    for (let id = 0; id < SECTOR_N; id++) {
      if (this.f.open[id]) continue;
      const x = (id % SCOLS) * SECTOR;
      const y = Math.floor(id / SCOLS) * SECTOR;
      c.fillStyle = 'rgba(25,40,50,0.5)';
      c.fillRect(x, y, SECTOR, SECTOR);
      if (detail && sim.sectorBlock(this.s, id) === null) {
        c.strokeStyle = '#ffd24a';
        c.lineWidth = 18;
        c.strokeRect(x + 12, y + 12, SECTOR - 24, SECTOR - 24);
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
  /** A locked sector next to the open area. */
  frontier(id: number): boolean {
    return !this.f.open[id] && neighbours(id).some((n) => this.f.open[n]);
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
