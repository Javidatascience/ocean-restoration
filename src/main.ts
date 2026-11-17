import { setBrush, setMuted, sfx, unlockAudio } from './audio.ts';
import { MISSIONS, POWERS, TOOLS, TREASURES } from './core/content.ts';
import { fmt } from './core/format.ts';
import * as sim from './core/sim.ts';
import { load, newState, save as saveState, wipe, type GameState } from './core/state.ts';
import { BURIED, LITTER, LITTER_TIER, MISSION_SPOTS, theme, SECTOR, sectorCol, sectorName, sectorRow } from './core/world.ts';
import { Scene } from './scene/scene.ts';
import { UI } from './ui/ui.ts';

const state: GameState = load() ?? newState();
const field = new sim.Field(state);
setMuted(!state.sound);

// Helpers worked while we were away (before the scene paints the dirt).
const away = (Date.now() - state.lastSeen) / 1000;
const offline = away >= 60 ? sim.applyOffline(state, field, away) : null;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new Scene(canvas, state, field);

let resetting = false;
function save(): void {
  if (resetting) return;
  field.store(state);
  saveState(state);
}

let earnedWindow = 0;

function handle(events: sim.GameEvent[], quiet = false): void {
  for (const e of events) {
    if (e.kind === 'animal') {
      if (!quiet) { ui.animalToast(e.id); sfx.unlock(); }
    } else if (e.kind === 'sector') {
      if (!quiet) {
        scene.sectorFx(e.id);
        sfx.unlock();
        navigator.vibrate?.([12, 40, 12]);
        ui.toast(`¡${theme(e.id).name} está limpio!`, `El sector ${sectorName(e.id)} está impecable. Premio: ${fmt(e.bonus)} monedas, y cada parcela paga ahora un 3% más.`, theme(e.id).icon);
        const p = scene.playerPos();
        scene.popup(p.x, p.y - 30, '+' + fmt(e.bonus), '#ffd24a', 22);
      }
    } else if (e.kind === 'complete') {
      scene.celebrate();
      sfx.unlock();
      ui.completeModal();
    }
  }
}

scene.sweepAt = (x, y, r, reach, mult = 1) => {
  const res = sim.sweep(state, field, x, y, r, reach, mult);
  if (res.cells) {
    earnedWindow += res.coins;
    handle(res.events);
  }
  return res;
};
let lastPop = 0;
scene.pickAt = (x, y, reach, extra) => {
  const res = sim.pickLitter(state, field, x, y, reach, extra);
  if (res.picked.length) {
    earnedWindow += res.coins;
    const now = performance.now();
    if (now - lastPop > 70) { sfx.pop(); lastPop = now; }
    navigator.vibrate?.(8);
  }
  return res;
};
scene.digAt = (x, y, reach, extra) => {
  const res = sim.digTreasure(state, field, x, y, reach, extra);
  if (res.found.length) {
    earnedWindow += res.coins;
    sfx.treasure();
    navigator.vibrate?.([10, 30, 10]);
    for (const i of res.firstOfKind) {
      const t = TREASURES[BURIED[i]!.kind]!;
      ui.toast(`¡Tesoro nuevo: ${t.name}!`, `${t.desc} Añadido a tu colección.`, t.icon);
    }
    save();
  }
  return res;
};
scene.missionAt = (x, y, reach) => {
  const res = sim.doMission(state, x, y, reach);
  if (res.spot >= 0) {
    earnedWindow += res.reward;
    const spot = MISSION_SPOTS[res.spot]!;
    const m = MISSIONS[theme(spot.sector).id]![spot.variant]!;
    sfx.unlock();
    navigator.vibrate?.([10, 30, 10]);
    ui.toast('¡Misión cumplida!', `${m.done} +${fmt(res.reward)} monedas.`, m.icon);
    save();
  }
  return res;
};
scene.onPower = (id) => {
  sfx.power();
  navigator.vibrate?.([8, 30, 8]);
  ui.toast(POWERS[id].name, `¡${POWERS[id].desc} durante ${POWERS[id].seconds} segundos!`, POWERS[id].icon);
};
scene.onTooBig = (i) => {
  const need = TOOLS[LITTER_TIER[LITTER[i]!.size]!]!;
  ui.toast('Demasiado grande', `Para esto necesitas: ${need.name}.`, '🔒');
};
scene.onSector = () => {
  sfx.deny();
  ui.toast('El mar', 'Necesitas el barco para limpiar el agua. Cómpralo en Equipo.', '⛵');
};

function bought(ok: boolean): boolean {
  if (ok) {
    sfx.buy();
    const p = scene.playerPos();
    scene.burst(p.x, p.y, '255,220,110', 16, 50);
    document.getElementById('pill-coins')?.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 220 });
    save();
  }
  return ok;
}

const actions = {
  buyTool: () => {
    const ok = bought(sim.buyTool(state));
    if (ok) { sfx.unlock(); ui.toast(sim.tool(state).name, 'Más alcance: la cámara se aleja para que veas más playa.', '🧹'); }
    return ok;
  },
  buyUpgrade: (id: Parameters<typeof sim.buyUpgrade>[1]) => bought(sim.buyUpgrade(state, id)),
  buyHelper: (id: Parameters<typeof sim.buyHelper>[1]) => bought(sim.buyHelper(state, id)),
  buyBoat: () => {
    const ok = bought(sim.buyBoat(state));
    if (ok) { sfx.unlock(); ui.toast('El barco está listo', 'Entra en el agua y empieza a limpiar el mar.', '⛵'); }
    return ok;
  },
  goTo: (id: number) => scene.goTo((sectorCol(id) + 0.5) * SECTOR, (sectorRow(id) + 0.5) * SECTOR),
  claimGoal: () => {
    const reward = sim.claimGoal(state, field);
    if (reward > 0) {
      sfx.unlock();
      const p = scene.playerPos();
      scene.popup(p.x, p.y - 30, '+' + fmt(reward), '#ffd24a', 20);
      save();
    }
    return reward;
  },
  toggleSound: () => {
    state.sound = !state.sound;
    setMuted(!state.sound);
    save();
  },
  reset: () => {
    resetting = true;
    wipe();
    location.reload();
  },
  denied: () => sfx.deny(),
  tabSound: () => sfx.tab(),
};

const ui = new UI(state, field, scene, actions);
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

if (offline && (offline.cells > 0 || offline.coins > 0)) {
  handle(offline.events, true);
  ui.offlineModal(offline);
}

// ---- main loop -------------------------------------------------------------

let last = performance.now();
let uiTimer = 0;
let saveTimer = 0;
let rateTimer = 0;
let brushLevel = 0;

function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  scene.sweptNow = 0;
  scene.update(dt);
  scene.draw();
  brushLevel += ((scene.sweptNow > 0 ? Math.min(1, 0.35 + scene.sweptNow / (dt * 400)) : 0) - brushLevel) * Math.min(1, dt * 8);
  setBrush(brushLevel);
  rateTimer += dt;
  if (rateTimer >= 1) {
    ui.rate = ui.rate * 0.6 + (earnedWindow / rateTimer) * 0.4;
    earnedWindow = 0;
    rateTimer = 0;
  }
  uiTimer += dt;
  if (uiTimer > 0.25) {
    uiTimer = 0;
    ui.refresh();
  }
  saveTimer += dt;
  if (saveTimer > 8) {
    saveTimer = 0;
    save();
  }
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); setBrush(0); }
  else {
    // Came back after a while: let the helpers catch up.
    const gone = (Date.now() - state.lastSeen) / 1000;
    if (gone >= 60) {
      const r = sim.applyOffline(state, field, gone);
      handle(r.events, true);
      if (r.cells > 0) ui.offlineModal(r);
      save();
    }
  }
});
window.addEventListener('pagehide', save);
new ResizeObserver(() => scene.resize()).observe(canvas);

// Dev-only handle for poking at the game from the console (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ocean = { state, field, scene, ui, sim };

ui.refresh();
requestAnimationFrame(frame);
