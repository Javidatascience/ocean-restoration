import { setMuted, sfx, unlockAudio } from './audio.ts';
import { fmt } from './core/format.ts';
import * as sim from './core/sim.ts';
import { load, newState, save, wipe, type GameState } from './core/state.ts';
import { KIND_VALUE, Scene } from './scene/scene.ts';
import { UI } from './ui/ui.ts';

const state: GameState = load() ?? newState();
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new Scene(canvas, state);
setMuted(!state.sound);

function handle(events: sim.GameEvent[], quiet = false): void {
  for (const e of events) {
    if (e.kind === 'animal') {
      if (!quiet) ui.animalToast(e.id);
    } else if (e.pct === 100) {
      scene.celebrate();
      sfx.unlock();
      ui.restoredModal();
    } else if (!quiet) ui.milestoneToast(e.pct);
  }
  if (events.length && !quiet) sfx.unlock();
}

function bought(ok: boolean, where: 'station' | 'store' | 'player'): boolean {
  if (ok) {
    sfx.buy();
    scene.purchaseFx(where);
    document.getElementById('pill-coins')?.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 220 });
    save(state);
  }
  return ok;
}

const ui = new UI(state, {
  buyUpgrade: (id) => bought(sim.buyUpgrade(state, id), id === 'conveyor' ? 'station' : id === 'bag' ? 'store' : 'player'),
  buyUnit: (id) => bought(sim.buyUnit(state, id), 'station'),
  buyRecycler: () => {
    const ok = bought(sim.buyRecycler(state), 'station');
    if (ok) sfx.unlock();
    return ok;
  },
  buyResearch: (id) => {
    const ok = sim.buyResearch(state, id);
    if (ok) { sfx.unlock(); save(state); }
    return ok;
  },
  chartReef: () => {
    const ok = sim.chartReef(state);
    if (ok) { sfx.unlock(); scene.celebrate(); save(state); }
    return ok;
  },
  toggleSound: () => {
    state.sound = !state.sound;
    setMuted(!state.sound);
    save(state);
  },
  reset: () => {
    resetting = true;
    wipe();
    location.reload();
  },
  denied: () => sfx.deny(),
  tabSound: () => sfx.tab(),
});

scene.onCollect = (items) => {
  unlockAudio();
  let first = true;
  for (const it of items) {
    const amount = sim.tapPower(state) * KIND_VALUE[it.kind] + (first ? sim.tapBonus(state) : 0);
    first = false;
    handle(sim.collect(state, amount));
    scene.popup(it.x, it.y - 16, '+' + fmt(amount), KIND_VALUE[it.kind] > 1.6 ? '#ffe08a' : '#ffffff', KIND_VALUE[it.kind] > 1.6 ? 17 : 14);
  }
  sfx.pop();
};
window.addEventListener('pointerdown', unlockAudio, { once: true });

// ---- offline progress ------------------------------------------------------

function catchUp(elapsedSeconds: number): void {
  if (elapsedSeconds < 5) return;
  const report = sim.applyOffline(state, elapsedSeconds);
  handle(report.events, true);
  if (elapsedSeconds >= 60 && (report.waste > 0 || report.coins > 0)) ui.offlineModal(report);
  save(state);
}
catchUp((Date.now() - state.lastSeen) / 1000);

// ---- main loop -------------------------------------------------------------

let last = Date.now();
let resetting = false;
let uiTimer = 0;
let saveTimer = 0;

function frame(): void {
  const now = Date.now();
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  if (dt > 20) {
    // The tab was asleep (screen locked, app in background): treat it as time away.
    catchUp(dt);
  } else {
    const res = sim.advance(state, dt);
    scene.addCoins(res.coins);
    handle(res.events);
  }
  scene.update(Math.min(dt, 0.1), state);
  scene.draw();
  uiTimer += dt;
  if (uiTimer > 0.2) {
    uiTimer = 0;
    ui.refresh();
  }
  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    save(state);
  }
  requestAnimationFrame(frame);
}

const persist = (): void => {
  if (!resetting) save(state);
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});
window.addEventListener('pagehide', persist);
new ResizeObserver(() => scene.resize()).observe(canvas);

// Dev-only handle for poking at the game from the console (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ocean = { state, scene, ui, sim };

ui.refresh();
requestAnimationFrame(frame);
