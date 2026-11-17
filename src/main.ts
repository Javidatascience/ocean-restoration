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
  buyUnit: (id, qty) => bought(sim.buyUnit(state, id, qty), 'station'),
  claimGoal: () => {
    const reward = sim.claimGoal(state);
    if (reward > 0) {
      sfx.unlock();
      const p = scene.stationPos();
      scene.popup(p.x, p.y - 60, '+' + fmt(reward), '#ffd24a', 20);
      scene.purchaseFx('station');
      document.getElementById('pill-coins')?.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260 });
      save(state);
    }
    return reward;
  },
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

let lastBonus = 0;
let lastPop = 0;
let lastBuzz = 0;
scene.onCollect = (items, px, py) => {
  unlockAudio();
  const now = performance.now();
  let total = 0;
  let best = items[0]!;
  for (const it of items) {
    let amount = sim.tapPower(state) * KIND_VALUE[it.kind]!;
    if (now - lastBonus > 400) { amount += sim.tapBonus(state); lastBonus = now; }
    total += amount;
    if (KIND_VALUE[it.kind]! > KIND_VALUE[best.kind]!) best = it;
    handle(sim.collect(state, amount));
    const swept = sim.sweptItem(state, it.sector, it.tide);
    if (swept.reward > 0) {
      handle(swept.events);
      scene.sectorCleaned(it.sector);
      sfx.unlock();
      navigator.vibrate?.([12, 40, 12]);
      ui.toast('Sector cleaned!', `Every last piece is gone. Bonus: ${fmt(swept.reward)} coins.`, '✨');
      scene.popup(px, py - 40, '+' + fmt(swept.reward), '#ffd24a', 22);
      save(state);
    }
  }
  scene.popup(best.x, best.y - 16, '+' + fmt(total), KIND_VALUE[best.kind]! > 1.6 ? '#ffe08a' : '#ffffff', KIND_VALUE[best.kind]! > 1.6 ? 17 : 14);
  if (now - lastPop > 60) { sfx.pop(); lastPop = now; }
  if (now - lastBuzz > 140) { navigator.vibrate?.(8); lastBuzz = now; }
};
scene.onSector = (id, sea) => {
  const why = sim.sectorBlock(state, id, sea);
  if (why === null && sim.openSector(state, id, sea)) {
    sfx.buy();
    sfx.unlock();
    scene.sectorOpened(id);
    navigator.vibrate?.(15);
    document.getElementById('pill-coins')?.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 220 });
    save(state);
    return;
  }
  sfx.deny();
  if (why === 'far') ui.toast('Too far', 'Open a sector next to one you already have first.', '🧭');
  else if (why === 'boat') ui.toast('Sea sector', 'You need a boat to clean the sea. Buy one in Equipment.', '⛵');
  else ui.toast('New sector', `Opening it costs ${fmt(sim.sectorCost(state))} coins. Keep sweeping!`, '🧭');
};
scene.onBottle = (x, y) => {
  unlockAudio();
  const amount = sim.grantBottle(state);
  scene.popup(x, y - 24, '+' + fmt(amount), '#ffd24a', 20);
  sfx.unlock();
  navigator.vibrate?.([10, 40, 10]);
  ui.toast('Message in a bottle', `A thank-you note, with ${fmt(amount)} coins tucked inside.`, '🍾');
  save(state);
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
