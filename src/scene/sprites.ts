// Procedural sprites. Every function draws around (0,0) = the sprite's feet / centre, in "reference pixels".
// The caller translates and scales. Sprites that have a direction face right.

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const SHADOW = 'rgba(40,70,80,0.18)';

export function mix(a: string, b: string, t: number): string {
  t = Math.max(0, Math.min(1, t));
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}
export function rr(c: C, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}
export function poly(c: C, p: number[], fill: string): void {
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
export function line(c: C, p: number[], stroke: string, w: number): void {
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.strokeStyle = stroke;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}
function quad(c: C, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, stroke: string, w: number): void {
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(cx, cy, x1, y1);
  c.strokeStyle = stroke;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.stroke();
}

/** Isometric box. (x,y) is the front-bottom corner; w runs up-right, d runs up-left, h is height. */
export function isoBox(c: C, x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string): void {
  poly(c, [x - d, y - d / 2, x, y, x, y - h, x - d, y - d / 2 - h], left);
  poly(c, [x, y, x + w, y - w / 2, x + w, y - w / 2 - h, x, y - h], right);
  poly(c, [x, y - h, x + w, y - w / 2 - h, x + w - d, y - (w + d) / 2 - h, x - d, y - d / 2 - h], top);
}
/** A window / panel painted on the right face of an isoBox. a..b along the wall, h1..h2 up the wall. */
function onRight(c: C, x: number, y: number, w: number, a: number, b: number, h1: number, h2: number, fill: string): void {
  poly(c, [x + w * a, y - (w * a) / 2 - h1, x + w * b, y - (w * b) / 2 - h1, x + w * b, y - (w * b) / 2 - h2, x + w * a, y - (w * a) / 2 - h2], fill);
}
function onLeft(c: C, x: number, y: number, d: number, a: number, b: number, h1: number, h2: number, fill: string): void {
  poly(c, [x - d * a, y - (d * a) / 2 - h1, x - d * b, y - (d * b) / 2 - h1, x - d * b, y - (d * b) / 2 - h2, x - d * a, y - (d * a) / 2 - h2], fill);
}

// ---- people & machines ---------------------------------------------------

export function person(c: C, t: number, o: { shirt: string; hat: string; walk: boolean; tool?: boolean }): void {
  const bob = o.walk ? Math.abs(Math.sin(t * 10)) * 1.5 : Math.sin(t * 2) * 0.4;
  const sw = o.walk ? Math.sin(t * 10) * 2.2 : 0;
  ell(c, 0, 0, 7, 2.6, SHADOW);
  rr(c, -3.6 + sw * 0.4, -7, 3.2, 7, 1.5, '#4c5d7c');
  rr(c, 0.4 - sw * 0.4, -7, 3.2, 7, 1.5, '#4c5d7c');
  c.save();
  c.translate(0, -bob);
  rr(c, -5, -18, 10, 12, 4, o.shirt);
  ell(c, -5.6, -12 + sw * 0.3, 1.8, 3.4, '#f3c9a2');
  ell(c, 5.6, -12 - sw * 0.3, 1.8, 3.4, '#f3c9a2');
  ell(c, 0, -22, 4.7, 4.7, '#f3c9a2');
  ell(c, -1.5, -21.6, 0.65, 0.85, '#40342c');
  ell(c, 1.9, -21.6, 0.65, 0.85, '#40342c');
  ell(c, 0, -24.6, 8.2, 2.5, o.hat);
  ell(c, 0, -26.2, 4.7, 3.1, o.hat);
  rr(c, -4.5, -25.6, 9, 1.3, 0.6, 'rgba(0,0,0,0.14)');
  if (o.tool) {
    line(c, [5.6, -11, 12.5, -2.5], '#8a9aa6', 1.5);
    line(c, [12.5, -2.5, 11, -0.5], '#e8574f', 1.5);
    line(c, [12.5, -2.5, 14.3, -1.2], '#e8574f', 1.5);
  }
  c.restore();
}

export function cleaner(c: C, t: number): void {
  ell(c, 0, 0.5, 13, 3.6, SHADOW);
  rr(c, -15, -6, 6, 5, 2.4, '#9aa7b3');
  line(c, [-14, -1 + Math.sin(t * 20) * 0.4, -10, -1], '#7d8a96', 1);
  rr(c, -9, -10.5, 17, 8.5, 3, '#ffd24a');
  rr(c, -9, -5, 17, 2, 1, '#f2b632');
  rr(c, -1, -17, 8.5, 8.5, 2.6, '#fff7dc');
  rr(c, 0.4, -15.6, 5.6, 4.4, 1.2, '#7fd0e8');
  ell(c, -5, -1.6, 3, 3, '#3a3f47');
  ell(c, 4.6, -1.6, 3, 3, '#3a3f47');
  ell(c, -5, -1.6, 1.1, 1.1, '#aab4bd');
  ell(c, 4.6, -1.6, 1.1, 1.1, '#aab4bd');
  ell(c, -5.2, -7, 1.6, 1.6, '#4cc27a');
}

export function boat(c: C, t: number): void {
  ell(c, 0, 1.5, 18, 4, 'rgba(20,70,90,0.2)');
  // trailing net
  line(c, [-13, -3, -21, 1.5], '#b98d4f', 1);
  c.beginPath();
  c.ellipse(-23, 2, 4.5, 2.6, 0, 0, TAU);
  c.fillStyle = 'rgba(233,196,106,0.75)';
  c.fill();
  poly(c, [-14, -5.5, 15.5, -5.5, 11, 1, -12, 1], '#ffffff');
  poly(c, [-13, -2, 13.2, -2, 11, 1, -12, 1], '#2fb7ae');
  rr(c, -7, -12.5, 9.5, 7.2, 2, '#fdf6e3');
  rr(c, -5.2, -11, 5.6, 3.2, 1, '#7fd0e8');
  rr(c, -8.2, -13.8, 12, 2.2, 1.1, '#ef7b5a');
  line(c, [7, -5.5, 7, -14], '#8a6b4a', 1.2);
  poly(c, [7, -14, 12 + Math.sin(t * 4) * 0.8, -12.4, 7, -10.8], '#ffd24a');
}

export function floater(c: C, t: number): void {
  c.save();
  c.setLineDash([3.2, 2.6]);
  c.beginPath();
  c.ellipse(0, -1, 21, 8.5, 0, Math.PI * 0.02, Math.PI * 0.98);
  c.strokeStyle = '#ff9f43';
  c.lineWidth = 2.6;
  c.stroke();
  c.restore();
  ell(c, 0, 0.6, 7.5, 3.2, 'rgba(20,70,90,0.2)');
  rr(c, -4.2, -9.5, 8.4, 9.5, 3, '#ff9f43');
  rr(c, -4.2, -6.4, 8.4, 2.4, 0, '#ffffff');
  ell(c, 0, -9.4, 4.2, 1.7, '#3d5a80');
  line(c, [0, -10, 0, -15], '#55606e', 1);
  ell(c, 0, -15.6, 1.5, 1.5, Math.sin(t * 3) > 0 ? '#7dffb0' : '#3fae74');
}

export function vessel(c: C, t: number): void {
  ell(c, 0, 2.5, 37, 6, 'rgba(20,70,90,0.22)');
  poly(c, [-32, -8.5, 35, -8.5, 28, 2, -30, 2], '#34507a');
  poly(c, [-30.8, -1.5, 30.4, -1.5, 28, 2, -30, 2], '#e8604a');
  rr(c, -31, -10.5, 63, 2.6, 1.2, '#e9edf2');
  rr(c, -27, -22.5, 17, 12, 2, '#ffffff');
  rr(c, -25, -19.5, 13, 3.2, 1, '#7fd0e8');
  rr(c, -21, -29, 5.5, 7, 1.5, '#3fb88f');
  ell(c, -18.2 + Math.sin(t) * 1.2, -32.5, 2.4, 2, 'rgba(255,255,255,0.55)');
  rr(c, -6, -15.6, 7.4, 5.2, 1, '#8ed1c6');
  rr(c, 2.2, -15.6, 7.4, 5.2, 1, '#f6c66a');
  rr(c, -2, -20.6, 7.4, 5.2, 1, '#f39a8b');
  line(c, [15, -10.5, 15, -25, 27, -19], '#f2a03d', 2);
  line(c, [27, -19, 27, -13 + Math.sin(t * 1.5) * 1.5], '#55606e', 0.9);
}

export function drone(c: C, t: number): void {
  line(c, [-8.5, -3, 8.5, 3], '#55606e', 1.7);
  line(c, [-8.5, 3, 8.5, -3], '#55606e', 1.7);
  const f = 0.45 + 0.2 * Math.sin(t * 40);
  for (const [x, y] of [[-8.5, -3], [8.5, 3], [-8.5, 3], [8.5, -3]]) ell(c, x, y - 1, 4.8, 1.7, `rgba(255,255,255,${f})`);
  rr(c, -4.5, -3.6, 9, 7, 3.2, '#ffffff');
  ell(c, 0, -0.2, 2.1, 2.1, '#2fb7ae');
  ell(c, 3, -2, 0.8, 0.8, Math.sin(t * 5) > 0 ? '#ff6b6b' : '#ffc2c2');
  line(c, [0, 3.4, 0, 8], '#8a9aa6', 0.9);
  ell(c, 0, 9.4, 2.4, 2, '#e9c46a');
}

export function robot(c: C, t: number): void {
  c.beginPath();
  c.ellipse(0, 0.5, 13 + Math.sin(t * 2) * 1.5, 4.2, 0, 0, TAU);
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 1.2;
  c.stroke();
  line(c, [-8, -3, -12.5, -6 + Math.sin(t * 3) * 1.2], '#f2b632', 2);
  line(c, [8, -3, 12.5, -6 - Math.sin(t * 3) * 1.2], '#f2b632', 2);
  c.beginPath();
  c.ellipse(0, 0, 9, 9.5, 0, Math.PI, 0);
  c.fillStyle = '#ffd24a';
  c.fill();
  ell(c, 0, 0, 9, 2.8, '#f2b632');
  ell(c, 0, -4.6, 4, 4, '#ffffff');
  ell(c, 0, -4.6, 3, 3, '#9fe8ff');
  ell(c, -1, -5.6, 1, 1, '#ffffff');
  line(c, [0, -9.5, 0, -14], '#55606e', 1);
  ell(c, 0, -14.6, 1.5, 1.5, Math.sin(t * 4) > 0 ? '#ff6b6b' : '#ffb3b3');
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.6 + i / 3) % 1;
    ell(c, 11 + i * 2.5, -2 - p * 12, 1 + p, 1 + p, `rgba(255,255,255,${0.6 * (1 - p)})`);
  }
}

// ---- buildings -----------------------------------------------------------

function bin(c: C): void {
  isoBox(c, 0, 0, 8, 8, 13, '#58c98c', '#3fae74', '#35996a');
  isoBox(c, 0, -13, 9, 9, 2, '#74dda6', '#49b97f', '#3ea673');
  onRight(c, 0, 0, 8, 0.25, 0.75, 4, 9, 'rgba(255,255,255,0.85)');
}

export function recycler(c: C, tier: number, t: number): void {
  if (tier === 0) {
    ell(c, 0, -3, 13, 5, SHADOW);
    bin(c);
    return;
  }
  if (tier === 1) {
    ell(c, 2, -8, 30, 12, SHADOW);
    isoBox(c, 0, 0, 20, 16, 16, '#e7c08f', '#d9a56e', '#c8935c');
    onRight(c, 0, 0, 20, 0.2, 0.5, 0, 11, '#8a6b4a');
    onRight(c, 0, 0, 20, 0.62, 0.88, 6, 12, '#8fd9ee');
    isoBox(c, 1, -15, 23, 19, 4, '#6ad79b', '#49b97f', '#3ea673');
    c.save();
    c.translate(-22, 3);
    c.scale(0.75, 0.75);
    bin(c);
    c.restore();
    return;
  }
  const big = tier >= 3;
  const W = big ? 34 : 28;
  const D = big ? 26 : 22;
  const Hh = big ? 26 : 22;
  ell(c, 3, -10, W + 14, (W + D) / 3.4, SHADOW);
  if (tier >= 3) {
    // chimney releasing clean steam
    rr(c, W - 14, -Hh - 40, 7, 26, 2, '#f1f3f5');
    rr(c, W - 14, -Hh - 36, 7, 3, 0, '#4cc27a');
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.25 + i / 3) % 1;
      ell(c, W - 10.5 + Math.sin(p * 5 + i) * 3, -Hh - 42 - p * 18, 3 + p * 4, 2.6 + p * 3, `rgba(255,255,255,${0.7 * (1 - p)})`);
    }
  }
  isoBox(c, 0, 0, W, D, Hh, '#fafafa', '#e6edf0', '#d5dfe4');
  onRight(c, 0, 0, W, 0.12, 0.34, 0, 13, '#55606e');
  for (let i = 0; i < 3; i++) onRight(c, 0, 0, W, 0.44 + i * 0.18, 0.56 + i * 0.18, 9, 16, '#8fd9ee');
  onLeft(c, 0, 0, D, 0.2, 0.8, 8, 15, '#b8eaf5');
  isoBox(c, 1, -Hh + 1, W + 2, D + 2, 4, tier === 4 ? '#7ddc9a' : '#3fc1b6', '#2fa69c', '#27958c');
  // conveyor feeding the building
  isoBox(c, -D - 2, -D / 2 + 6, 6, 16, 5, '#8c98a4', '#6f7b87', '#7d8a96');
  ell(c, -D - 8, -D / 2 - 1 + ((t * 6) % 6) * -0.5, 2, 1.4, '#9fd4ee');
  if (tier >= 3) {
    isoBox(c, W + 4, -W / 2 + 6, 14, 14, 14, '#fff3d6', '#f1dfb8', '#e2cda0');
    isoBox(c, W + 4.5, -W / 2 - 8, 15, 15, 3, '#f2a03d', '#d98a2b', '#c77d24');
  }
  if (tier === 4) {
    // solar panels on the roof
    const rx = 1;
    const ry = -Hh - 3;
    for (let i = 0; i < 3; i++) {
      const ox = rx + 5 + i * 9 - 8;
      const oy = ry - (5 + i * 9) / 2 - 4;
      poly(c, [ox, oy, ox + 7, oy - 3.5, ox - 3, oy - 8.5, ox - 10, oy - 5], '#2f4f7f');
      line(c, [ox - 1.5, oy - 4.2, ox + 2, oy - 6], '#6d93c9', 0.7);
    }
    // wind turbine
    const tx = -D + 2;
    const ty = -D / 2 - Hh - 4;
    line(c, [tx, ty + 22, tx, ty - 22], '#f1f3f5', 2);
    c.save();
    c.translate(tx, ty - 22);
    c.rotate(t * 1.6);
    for (let i = 0; i < 3; i++) {
      c.rotate(TAU / 3);
      poly(c, [0, 0, 2, -8, 0, -15, -1.4, -8], '#ffffff');
    }
    c.restore();
    ell(c, tx, ty - 22, 1.6, 1.6, '#cfd6db');
  }
}

export function storage(c: C, fill: number): void {
  ell(c, 0, -6, 28, 10, SHADOW);
  isoBox(c, 0, 0, 24, 20, 3, '#e3b47d', '#c08a55', '#ad7a48');
  line(c, [-20, -13, -20, -27], '#ad7a48', 2);
  line(c, [24, -15, 24, -29], '#ad7a48', 2);
  const cols = ['#9fd4ee', '#f4f6f8', '#f39a8b', '#8ed1c6', '#f6c66a', '#c9b6f2'];
  const slots: [number, number, number][] = [[-8, -8, 0], [6, -7, 0], [-1, -1, 0], [12, -12, 0], [-3, -8, 8], [5, -3, 8]];
  const n = Math.min(6, Math.ceil(fill * 6 - 0.001));
  const order = [3, 0, 1, 4, 2, 5];
  for (const i of order) {
    if (order.indexOf(i) >= 0 && i < n) {
      const [x, y, z] = slots[i];
      isoBox(c, x, y - 3 - z, 8, 8, 8, cols[i], mix(cols[i], '#000000', 0.12), mix(cols[i], '#000000', 0.22));
    }
  }
}

export function pier(c: C, len: number): void {
  for (let i = 0; i <= 3; i++) {
    const p = (len * i) / 3;
    rr(c, p - 5, -p / 2 - 1, 2.4, 9, 1, '#8a6b4a');
  }
  poly(c, [0, 0, len, -len / 2, len - 9, -len / 2 - 4.5, -9, -4.5], '#d9b07f');
  poly(c, [0, 0, len, -len / 2, len, -len / 2 + 2, 0, 2], '#b98d5c');
  for (let p = 8; p < len; p += 8) line(c, [p, -p / 2, p - 9, -p / 2 - 4.5], 'rgba(120,85,50,0.35)', 0.7);
}

// ---- trash ---------------------------------------------------------------

/** kind: 0 bottle, 1 bag, 2 can, 3 cup, 4 tyre, 5 barrel, 6 ghost net */
export function trash(c: C, kind: number): void {
  switch (kind) {
    case 0:
      c.rotate(-0.5);
      rr(c, -2.8, -9, 5.6, 9.5, 2, '#9fd4ee');
      rr(c, -1.3, -11.6, 2.6, 3.2, 0.8, '#9fd4ee');
      rr(c, -1.6, -12.8, 3.2, 1.8, 0.6, '#e8574f');
      rr(c, -2.8, -6.2, 5.6, 3, 0, 'rgba(255,255,255,0.75)');
      break;
    case 1:
      c.beginPath();
      c.moveTo(-6, 0);
      c.quadraticCurveTo(-8.5, -7, -3, -8);
      c.lineTo(-4.4, -12.5);
      c.lineTo(-1.6, -9.2);
      c.lineTo(1.6, -9.2);
      c.lineTo(4.4, -12.5);
      c.lineTo(3, -8);
      c.quadraticCurveTo(8.5, -7, 6, 0);
      c.quadraticCurveTo(0, 2, -6, 0);
      c.fillStyle = '#f6f8fa';
      c.fill();
      c.strokeStyle = '#bfc9d2';
      c.lineWidth = 0.8;
      c.stroke();
      quad(c, -2, -6, 0, -3, -1, -1, '#d5dde4', 0.8);
      break;
    case 2:
      c.rotate(0.45);
      rr(c, -3.2, -9, 6.4, 9, 1.6, '#e2574c');
      rr(c, -3.2, -9, 6.4, 1.8, 0.8, '#cfd6db');
      rr(c, -3.2, -5, 6.4, 1.6, 0, '#ffffff');
      break;
    case 3:
      line(c, [1, -10, 3.4, -15.5], '#ff7aa2', 1.5);
      poly(c, [-4.2, -9.5, 4.2, -9.5, 3, 0, -3, 0], '#fbfbfb');
      rr(c, -4.9, -11, 9.8, 2.2, 1, '#e3e8ec');
      ell(c, 0, -4.6, 1.8, 1.8, '#5cc6a0');
      break;
    case 4:
      ell(c, 0, -4, 8.5, 5.4, '#3a3f47');
      ell(c, 0, -4.5, 4.4, 2.5, '#1f2328');
      ell(c, 0, -3.6, 4.2, 2.2, 'rgba(120,130,140,0.35)');
      break;
    case 5:
      rr(c, -5.5, -13, 11, 13, 2.6, '#c9743a');
      ell(c, 0, -13, 5.5, 2.1, '#e08f52');
      rr(c, -5.5, -9.6, 11, 1.4, 0, '#9c5526');
      rr(c, -5.5, -4.6, 11, 1.4, 0, '#9c5526');
      poly(c, [0, -8.4, 2.2, -5.4, -2.2, -5.4], '#ffd24a');
      break;
    default:
      for (let i = 0; i < 4; i++) quad(c, -8 + i * 4, -1, -5 + i * 4, -9 - (i % 2) * 3, -2 + i * 4, -1, '#3d8f6a', 1.2);
      line(c, [-8, -4, 9, -5], '#3d8f6a', 1.1);
      line(c, [-7, -1, 10, -1.5], '#2f7a59', 1.1);
      ell(c, -6, -5, 1.8, 1.8, '#ff9f43');
      ell(c, 6, -6, 1.8, 1.8, '#ff9f43');
  }
}

// ---- plants --------------------------------------------------------------

export function palm(c: C, t: number, health: number): void {
  ell(c, 4, 0, 13, 3.6, SHADOW);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(-7, -22, 3, -42);
  c.strokeStyle = '#a9794d';
  c.lineWidth = 4.6;
  c.lineCap = 'round';
  c.stroke();
  quad(c, -0.6, -6, -5.4, -22, 2.4, -38, 'rgba(255,255,255,0.18)', 1.2);
  c.save();
  c.translate(3, -42);
  c.rotate(Math.sin(t * 0.8) * 0.04);
  const a = mix('#a79a62', '#46b862', health);
  const b = mix('#8f8450', '#2f9a55', health);
  const droop = (1 - health) * 6;
  const tips = [[-23, 3], [-17, -11], [-5, -18], [9, -17], [20, -7], [23, 6]];
  tips.forEach(([x, y], i) => {
    const ty = y + droop + Math.sin(t * 1.3 + i) * 0.8;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(x * 0.4, ty * 0.4 - 11, x, ty);
    c.quadraticCurveTo(x * 0.5, ty * 0.5 - 1, 0, 0);
    c.fillStyle = i % 2 ? a : b;
    c.fill();
  });
  if (health > 0.6) {
    ell(c, -1.6, 1.6, 2, 2, '#8a5a3a');
    ell(c, 2, 2.2, 2, 2, '#75492c');
  }
  c.restore();
}

export function tuft(c: C, t: number, kind: number): void {
  const s = Math.sin(t * 1.4) * 1.2;
  if (kind === 2) {
    ell(c, 0, 0, 9, 2.6, SHADOW);
    ell(c, -4, -4, 5, 4.5, '#3fae5a');
    ell(c, 3.5, -4.5, 5.5, 5, '#52c26c');
    ell(c, 0, -7.5, 4.6, 4.2, '#66d07e');
    return;
  }
  quad(c, -2, 0, -4, -5, -5 + s, -8, '#4fba62', 1.5);
  quad(c, 0, 0, 0, -6, 0.5 + s, -10, '#3fae5a', 1.5);
  quad(c, 2, 0, 4, -5, 5 + s, -7, '#66d07e', 1.5);
  if (kind === 1) {
    const fx = 0.5 + s;
    for (let i = 0; i < 5; i++) ell(c, fx + Math.cos((i * TAU) / 5) * 2.2, -11 + Math.sin((i * TAU) / 5) * 2.2, 1.6, 1.6, '#ff9ec0');
    ell(c, fx, -11, 1.3, 1.3, '#ffd24a');
  }
}

export function seagrass(c: C, t: number): void {
  for (let i = -1; i <= 1; i++) {
    const s = Math.sin(t * 1.1 + i * 1.7) * 3;
    quad(c, i * 3, 0, i * 3 - s * 0.4, -6, i * 3 + s, -12 - (i === 0 ? 3 : 0), i === 0 ? '#2f9d6e' : '#3fb37e', 2);
  }
}

export function coral(c: C, variant: number): void {
  const cols = ['#ff8fa8', '#ffb067', '#b58cf0', '#ff7f7f'];
  const col = cols[variant % cols.length];
  const light = mix(col, '#ffffff', 0.35);
  if (variant % 2 === 0) {
    line(c, [0, 0, 0, -7], col, 3);
    line(c, [0, -4, -5, -9], col, 2.6);
    line(c, [0, -5, 5, -10], col, 2.6);
    ell(c, 0, -8, 2.4, 2.4, light);
    ell(c, -5.4, -9.6, 2.2, 2.2, light);
    ell(c, 5.4, -10.6, 2.2, 2.2, light);
  } else {
    ell(c, -3, -3, 4.5, 4, col);
    ell(c, 3, -3.6, 4.8, 4.4, col);
    ell(c, 0, -6.5, 4, 3.6, light);
    ell(c, -3.4, -4, 1, 1, light);
    ell(c, 3.6, -4.4, 1, 1, light);
  }
}

export function rock(c: C): void {
  ell(c, 0, -2, 8, 5, '#8fa0a8');
  ell(c, -2, -3.4, 4.5, 2.6, '#a9b8bf');
}

// ---- animals -------------------------------------------------------------

export function fish(c: C, t: number, body: string, clown = false): void {
  c.save();
  c.translate(-4, 0);
  c.rotate(Math.sin(t * 9) * 0.35);
  poly(c, [0, 0, -4.6, -3, -4.6, 3], clown ? '#f2792b' : body);
  c.restore();
  ell(c, 0, 0, 5.2, 2.8, body);
  if (clown) {
    rr(c, -2.2, -2.6, 1.5, 5.2, 0.7, '#ffffff');
    rr(c, 1.2, -2.4, 1.4, 4.8, 0.7, '#ffffff');
  }
  ell(c, 3.2, -0.6, 0.7, 0.7, '#2b2f36');
}

export function crab(c: C, t: number): void {
  const w = Math.sin(t * 14) * 1.2;
  ell(c, 0, 0, 7, 2, SHADOW);
  for (const s of [-1, 1]) {
    line(c, [s * 3, -2, s * 7, -1 + w * s, s * 8, 1], '#d9523d', 1.1);
    line(c, [s * 2, -1.6, s * 6, 0.6 - w * s, s * 6.6, 2], '#d9523d', 1.1);
    line(c, [s * 4, -4.6, s * 6.4, -7.4], '#d9523d', 1.4);
    ell(c, s * 6.8, -8, 2.3, 2.1, '#ee6b54');
    line(c, [s * 1.6, -5.6, s * 1.8, -8], '#d9523d', 0.9);
    ell(c, s * 1.8, -8.4, 0.95, 0.95, '#2b2f36');
  }
  ell(c, 0, -3.4, 5.2, 3.6, '#ee6b54');
  ell(c, -1, -4.4, 2.4, 1.3, 'rgba(255,255,255,0.28)');
}

export function sandpiper(c: C, t: number, walk: boolean): void {
  const w = walk ? Math.sin(t * 18) * 2 : 0;
  ell(c, 0, 0, 5, 1.6, SHADOW);
  line(c, [-0.8, -4, -0.8 + w, 0], '#6b5a48', 0.8);
  line(c, [1, -4, 1 - w, 0], '#6b5a48', 0.8);
  ell(c, 0, -7, 5.2, 3.5, '#b99b77');
  ell(c, 0.6, -6, 3.6, 2.2, '#f6eee2');
  poly(c, [-4.4, -7.6, -8, -9, -4.6, -5.6], '#a38662');
  ell(c, 4.6, -10.2, 2.4, 2.4, '#b99b77');
  line(c, [6.6, -10.2, 10.4, -9.4], '#4a3d33', 0.9);
  ell(c, 5.2, -10.6, 0.6, 0.6, '#2b2f36');
}

export function gull(c: C, t: number): void {
  const f = Math.sin(t * 5) * 4;
  line(c, [0, 0, -7, -3 - f, -14, f * 0.7], '#ffffff', 2.8);
  line(c, [0, 0, 7, -3 - f, 14, f * 0.7], '#ffffff', 2.8);
  line(c, [-11, -1.3 - f * 0.25, -14, f * 0.7], '#7d8a96', 2.4);
  line(c, [11, -1.3 - f * 0.25, 14, f * 0.7], '#7d8a96', 2.4);
  ell(c, 0, 0.6, 2.6, 5, '#ffffff');
  ell(c, 0, -4.2, 1.9, 1.9, '#ffffff');
  poly(c, [-0.9, -5.8, 0.9, -5.8, 0, -8.4], '#ffb347');
}

export function starfish(c: C, t: number): void {
  c.save();
  c.rotate(Math.sin(t * 0.7) * 0.12);
  const p: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 2.8 : 6.6;
    const a = (i * TAU) / 10 - Math.PI / 2;
    p.push(Math.cos(a) * r, Math.sin(a) * r * 0.82);
  }
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.closePath();
  c.fillStyle = '#ff8f6b';
  c.lineJoin = 'round';
  c.strokeStyle = '#ff8f6b';
  c.lineWidth = 1.6;
  c.stroke();
  c.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 - Math.PI / 2;
    ell(c, Math.cos(a) * 3.4, Math.sin(a) * 2.8, 0.65, 0.65, '#ffd0bf');
  }
  ell(c, 0, 0, 0.9, 0.9, '#ffd0bf');
  c.restore();
}

export function seahorse(c: C, t: number): void {
  c.save();
  c.translate(0, Math.sin(t * 2) * 1.2);
  ell(c, -2.6, -6.6, 1.5 + Math.sin(t * 16) * 0.4, 2.4, '#ffe08a');
  c.beginPath();
  c.moveTo(0, -12);
  c.quadraticCurveTo(5.4, -6, 0.4, -2);
  c.quadraticCurveTo(-3.6, 1.6, 0, 3.6);
  c.quadraticCurveTo(3, 4.4, 1.6, 1.8);
  c.strokeStyle = '#f6b93b';
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.stroke();
  ell(c, 0.2, -13, 2.7, 2.5, '#f6b93b');
  line(c, [2, -12.8, 5.6, -12], '#f6b93b', 1.7);
  line(c, [-1, -15.4, -0.2, -16.6], '#e69f1f', 1);
  ell(c, 0.8, -13.5, 0.65, 0.65, '#2b2f36');
  c.restore();
}

export function turtle(c: C, t: number): void {
  const f = Math.sin(t * 2.6) * 0.5;
  for (const s of [-1, 1]) {
    c.save();
    c.translate(4.5, s * 4.6);
    c.rotate(s * (0.5 + f));
    ell(c, 2.5, 0, 5, 1.9, '#8fcf8a');
    c.restore();
    c.save();
    c.translate(-5, s * 4.2);
    c.rotate(s * (2.4 - f * 0.6));
    ell(c, 2, 0, 3.2, 1.5, '#8fcf8a');
    c.restore();
  }
  ell(c, 9.4, 0, 3.1, 2.5, '#8fcf8a');
  ell(c, 10.6, -1, 0.6, 0.6, '#2b2f36');
  ell(c, 0, 0, 8.2, 6.2, '#4f9f63');
  ell(c, 0, 0, 5.6, 4, '#73c47f');
  line(c, [-3, -3.4, -3, 3.4], '#4f9f63', 0.8);
  line(c, [1, -3.8, 1, 3.8], '#4f9f63', 0.8);
  line(c, [-5.4, 0, 5.4, 0], '#4f9f63', 0.8);
}

export function octopus(c: C, t: number): void {
  for (let i = 0; i < 5; i++) {
    const x = -6 + i * 3;
    const w = Math.sin(t * 2 + i * 1.3) * 2.2;
    quad(c, x * 0.7, -2, x * 1.5 + w, 2, x * 1.8 - w, 5.4, '#a274d8', 2.3);
  }
  ell(c, 0, -6, 6.8, 6.4, '#b58cf0');
  ell(c, -1.6, -8.4, 2.6, 1.8, 'rgba(255,255,255,0.25)');
  ell(c, -2.4, -4.6, 1.6, 1.8, '#ffffff');
  ell(c, 2.4, -4.6, 1.6, 1.8, '#ffffff');
  ell(c, -2.2, -4.4, 0.8, 0.9, '#2b2f36');
  ell(c, 2.6, -4.4, 0.8, 0.9, '#2b2f36');
}

export function dolphin(c: C): void {
  poly(c, [-11, 1.6, -17.5, -2.4, -15.4, 1.6, -16.6, 5.6], '#5d8db3');
  poly(c, [-1.6, -4.6, 2.2, -9.4, 4.4, -3.8], '#5d8db3');
  c.beginPath();
  c.moveTo(-12, 1.6);
  c.quadraticCurveTo(0, -9.6, 11, -1.4);
  c.lineTo(15, 0.2);
  c.lineTo(11, 1.6);
  c.quadraticCurveTo(0, 6, -12, 1.6);
  c.fillStyle = '#6f9fc4';
  c.fill();
  c.beginPath();
  c.moveTo(-10, 2);
  c.quadraticCurveTo(0, 5.4, 11, 1.4);
  c.quadraticCurveTo(0, 1.6, -10, 2);
  c.fillStyle = '#dcecf5';
  c.fill();
  ell(c, 8.4, -1.2, 0.75, 0.75, '#2b2f36');
}

export function manta(c: C, t: number): void {
  const f = Math.sin(t * 2.2) * 2.4;
  line(c, [-8, 0, -20, Math.sin(t * 2) * 1.5], '#3a4a60', 1.2);
  poly(c, [12, 0, 1, -11 - f, -9, 0, 1, 11 + f], '#44566e');
  poly(c, [11, -1.6, 15, -3.4, 12.4, -0.2], '#44566e');
  poly(c, [11, 1.6, 15, 3.4, 12.4, 0.2], '#44566e');
  ell(c, 2, -4.6 - f * 0.4, 2.4, 1.4, 'rgba(255,255,255,0.35)');
  ell(c, 2, 4.6 + f * 0.4, 2.4, 1.4, 'rgba(255,255,255,0.35)');
}

/** up: 0..1 how far the whale has surfaced. spout: 0..1 spray strength. */
export function whale(c: C, t: number, up: number, spout: number): void {
  if (up <= 0.02) return;
  c.beginPath();
  c.ellipse(0, 1, 30, 4.4, 0, 0, TAU);
  c.strokeStyle = `rgba(255,255,255,${0.5 * up})`;
  c.lineWidth = 1.3;
  c.stroke();
  c.save();
  c.beginPath();
  c.rect(-60, -60, 120, 61);
  c.clip();
  c.translate(0, (1 - up) * 10);
  c.beginPath();
  c.ellipse(0, 1, 27, 10, 0, Math.PI, 0);
  c.fillStyle = '#3e5f85';
  c.fill();
  c.beginPath();
  c.ellipse(-4, -3.6, 15, 3.2, -0.05, Math.PI, 0);
  c.fillStyle = 'rgba(255,255,255,0.16)';
  c.fill();
  poly(c, [-9, -8.6, -5, -12.6, -2.6, -8.4], '#3e5f85');
  ell(c, 17, -3.4, 0.9, 0.9, '#1e2f45');
  // tail fluke
  c.translate(-33, 2);
  c.rotate(Math.sin(t * 1.2) * 0.12);
  line(c, [0, 2, 0, -8], '#3e5f85', 3.6);
  poly(c, [0, -8, -9, -14, -3, -8.6, 0, -9.6, 3, -8.6, 9, -14], '#3e5f85');
  c.restore();
  if (spout > 0.02) {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.2;
      const p = (t * 1.4 + i * 0.37) % 1;
      const d = 6 + p * 16 * spout;
      ell(c, 12 + Math.cos(a) * d, -9 + Math.sin(a) * d + p * p * 7, 1.5, 1.5, `rgba(255,255,255,${0.85 * (1 - p) * spout})`);
    }
  }
}

// ---- menu icons ----------------------------------------------------------

const ANIMAL_ICON: Record<string, [number, number, number, (c: C) => void]> = {
  crab: [28, 38, 3, (c) => crab(c, 0)],
  sandpiper: [24, 46, 2.7, (c) => sandpiper(c, 0, false)],
  sardine: [29, 28, 3.6, (c) => fish(c, 0.05, '#dfeef5')],
  gull: [28, 30, 1.8, (c) => gull(c, 0.2)],
  clownfish: [29, 28, 3.6, (c) => fish(c, 0.05, '#ff8a3d', true)],
  starfish: [28, 28, 3.2, (c) => starfish(c, 0)],
  seahorse: [26, 36, 2.5, (c) => seahorse(c, 0)],
  turtle: [26, 28, 2.3, (c) => turtle(c, 0.3)],
  octopus: [28, 34, 2.7, (c) => octopus(c, 0)],
  dolphin: [28, 30, 1.6, (c) => { c.rotate(-0.25); dolphin(c); }],
  manta: [29, 28, 1.7, (c) => manta(c, 0)],
  whale: [30, 40, 0.85, (c) => whale(c, 0.3, 1, 1)],
};
const UNIT_ICON: Record<string, [number, number, number, (c: C) => void]> = {
  worker: [28, 50, 1.7, (c) => person(c, 0, { shirt: '#ff9f43', hat: '#ffe08a', walk: false, tool: true })],
  cleaner: [31, 44, 1.8, (c) => cleaner(c, 0)],
  boat: [31, 40, 1.4, (c) => boat(c, 0)],
  floater: [28, 40, 1.25, (c) => floater(c, 1)],
  vessel: [27, 42, 0.74, (c) => vessel(c, 0)],
  drone: [28, 26, 2.3, (c) => drone(c, 0)],
  robot: [28, 42, 2.1, (c) => robot(c, 0)],
};
const RECYCLER_ICON: [number, number, number][] = [[28, 46, 2.1], [34, 48, 1.15], [30, 49, 0.82], [22, 51, 0.62], [22, 52, 0.58]];

/** Paint a 56x56 menu icon. kind: "animal:turtle", "unit:boat", "recycler:2". */
export function paintIcon(cv: HTMLCanvasElement, key: string): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.width = 56 * dpr;
  cv.height = 56 * dpr;
  const c = cv.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [kind, id] = key.split(':');
  let spec: [number, number, number, (c: C) => void] | undefined;
  if (kind === 'animal') spec = ANIMAL_ICON[id];
  else if (kind === 'unit') spec = UNIT_ICON[id];
  else if (kind === 'recycler') {
    const tier = Number(id);
    const [x, y, s] = RECYCLER_ICON[tier];
    spec = [x, y, s, (cc) => recycler(cc, tier, 0)];
  }
  if (!spec) return;
  c.translate(spec[0], spec[1]);
  c.scale(spec[2], spec[2]);
  spec[3](c);
}
