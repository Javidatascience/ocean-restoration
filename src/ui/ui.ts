// DOM interface: HUD, minimap, bottom navigation, the slide-up sheet, toasts and modals.
import { ANIMALS, BOAT_COST, HELPERS, TOOLS, TREASURES, UPGRADES, type HelperId, type UpgradeId } from '../core/content.ts';
import { fmt, fmtDuration } from '../core/format.ts';
import * as sim from '../core/sim.ts';
import type { GameState } from '../core/state.ts';
import { LITTER, MISSION_SPOTS, SECTOR_N, SEA_ROWS, sectorAt, sectorName, sectorRow, theme } from '../core/world.ts';
import type { Scene } from '../scene/scene.ts';
import { paintIcon } from '../scene/sprites.ts';

export type Tab = 'beach' | 'tools' | 'helpers' | 'map' | 'life';

export interface UIActions {
  buyTool(): boolean;
  buyUpgrade(id: UpgradeId): boolean;
  buyHelper(id: HelperId): boolean;
  buyBoat(): boolean;
  goTo(id: number): void;
  claimGoal(): number;
  toggleSound(): void;
  reset(): void;
  denied(): void;
  tabSound(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const TITLES: Record<Tab, string> = { beach: '', tools: 'Equipo', helpers: 'Ayudantes', map: 'Mapa de la costa', life: 'Hallazgos y vida' };
const TOOL_ICON = ['🧹', '🧹', '🪮', '🛞', '🚜', '🏎️', '🚜', '🚛', '🏭', '🦾'];

export class UI {
  private tab: Tab = 'beach';
  private signature = '';
  private lastHud = '';
  /** Coins per second, smoothed (set by main). */
  rate = 0;

  constructor(private s: GameState, private f: sim.Field, private scene: Scene, private act: UIActions) {
    $('nav').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!b) return;
      const t = b.dataset.tab as Tab;
      this.open(t === this.tab ? 'beach' : t);
      act.tabSound();
    });
    $('sheet-close').addEventListener('click', () => this.open('beach'));
    $('sheet-body').addEventListener('click', (e) => this.onSheetClick(e));
    $('hint').addEventListener('click', () => {
      if (act.claimGoal() > 0) this.refresh();
    });
    $('minimap').addEventListener('click', () => { this.open('map'); act.tabSound(); });
  }

  // ---- navigation --------------------------------------------------------

  open(tab: Tab): void {
    this.tab = tab;
    const sheet = $('sheet');
    const openNow = tab !== 'beach';
    sheet.classList.toggle('open', openNow);
    sheet.setAttribute('aria-hidden', String(!openNow));
    document.body.classList.toggle('sheet-open', openNow);
    for (const b of Array.from($('nav').querySelectorAll<HTMLElement>('[data-tab]'))) b.classList.toggle('on', b.dataset.tab === tab);
    if (openNow) {
      $('sheet-title').textContent = TITLES[tab];
      $('sheet-body').scrollTop = 0;
      this.render();
    }
  }

  private onSheetClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.tagName === 'CANVAS') return; // the map has its own handler
    const [kind, id] = (el.dataset.act ?? '').split(':');
    let ok: boolean | null = null;
    if (kind === 'tool') ok = this.act.buyTool();
    else if (kind === 'upgrade') ok = this.act.buyUpgrade(id as UpgradeId);
    else if (kind === 'helper') ok = this.act.buyHelper(id as HelperId);
    else if (kind === 'boat') ok = this.act.buyBoat();
    else if (kind === 'find') { this.findModal(id!); return; }
    else if (kind === 'sound') this.act.toggleSound();
    else if (kind === 'reset') { this.confirmReset(); return; }
    if (ok === false) {
      this.act.denied();
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      return;
    }
    const key = el.dataset.act;
    this.render();
    if (ok) $('sheet-body').querySelector<HTMLElement>(`[data-act="${key}"]`)?.closest('.card')?.classList.add('bought');
  }

  // ---- per-frame-ish refresh --------------------------------------------

  /** Cheap updates, called a few times per second. */
  refresh(): void {
    const s = this.s;
    const here = sectorAt(s.px, s.py);
    const secPct = here >= 0 ? this.f.sectorClean(here) * 100 : 0;
    const coast = sim.pct(this.f);
    const t = sim.tool(s);
    const hud = [fmt(s.coins), fmt(this.rate), s.tool, here, Math.floor(secPct), coast.toFixed(2)].join('|');
    if (hud !== this.lastHud) {
      this.lastHud = hud;
      $('coins').textContent = fmt(s.coins);
      $('coins-rate').textContent = `+${fmt(this.rate)}/s`;
      $('tool-ico').textContent = TOOL_ICON[s.tool] ?? '🧹';
      $('tool').textContent = t.name;
      $('tool-sub').textContent = `alcance ${t.radius} · velocidad ${Math.round(sim.moveSpeed(s))}`;
      const done = here >= 0 && s.done.includes(here);
      $('sector-name').textContent = here >= 0 ? `${theme(here).icon} ${theme(here).name}${done ? ' ✨' : ''}` : '';
      $('sector-pct').textContent = `${Math.floor(secPct)}%`;
      $('sector-fill').style.width = secPct + '%';
      $('pct').textContent = `🌊 Costa ${coast < 10 ? coast.toFixed(2) : coast.toFixed(1)}%`;
    }
    this.scene.drawMap($<HTMLCanvasElement>('minimap'));
    this.hint();
    this.badges();
    if (this.tab === 'beach') return;
    const sig = this.sig();
    if (sig !== this.signature) this.render();
    else {
      for (const b of Array.from($('sheet-body').querySelectorAll<HTMLElement>('[data-cost]'))) b.classList.toggle('cant', s.coins < Number(b.dataset.cost));
      if (this.tab === 'map') {
        const cv = $('sheet-body').querySelector<HTMLCanvasElement>('canvas.bigmap');
        if (cv) this.scene.drawMap(cv, true);
      }
    }
  }

  private sig(): string {
    const s = this.s;
    return [this.tab, s.tool, UPGRADES.map((u) => s.upgrades[u.id]).join(','), HELPERS.map((h) => s.helpers[h.id]).join(','), s.boat, sim.doneCount(s), s.animals.length, Object.values(s.finds).reduce((a, n) => a + n, 0)].join('|');
  }

  private hint(): void {
    const s = this.s;
    let text: string;
    const goal = sim.goalStatus(s, this.f);
    const claim = !!goal && goal.done;
    if (s.cleaned < 40) text = '👆 Arrastra el dedo para moverte · barre la suciedad para ganar monedas';
    else if (goal && claim) text = `🎁 ¡Objetivo cumplido! Toca para cobrar ${fmt(goal.def.reward)}`;
    else if (goal) {
      const count = goal.def.type === 'pct' ? `${goal.cur.toFixed(1)}%` : goal.def.n > 1 ? `${fmt(Math.floor(goal.cur))}/${fmt(goal.def.n)}` : '';
      text = `🎯 ${goal.def.text}${count ? ' · ' + count : ''}`;
    } else text = '🌊 Tu costa está impecable';
    const el = $('hint');
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('claim', claim && s.cleaned >= 40);
  }

  private badges(): void {
    const s = this.s;
    const flags: Record<string, boolean> = {
      tools: sim.canBuyTool(s) || UPGRADES.some((u) => sim.canBuyUpgrade(s, u.id)) || sim.canBuyBoat(s),
      helpers: HELPERS.some((h) => sim.canBuyHelper(s, h.id)),
    };
    for (const b of Array.from($('nav').querySelectorAll<HTMLElement>('[data-tab]'))) b.classList.toggle('badge', !!flags[b.dataset.tab ?? '']);
  }

  // ---- sheet panels -------------------------------------------------------

  render(): void {
    const body = $('sheet-body');
    const scroll = body.scrollTop;
    const html = this.tab === 'tools' ? this.tools()
      : this.tab === 'helpers' ? this.helpers()
      : this.tab === 'map' ? this.map()
      : this.life();
    body.innerHTML = html;
    body.scrollTop = scroll;
    for (const cv of Array.from(body.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]'))) paintIcon(cv, cv.dataset.icon ?? '');
    const map = body.querySelector<HTMLCanvasElement>('canvas.bigmap');
    if (map) {
      this.scene.drawMap(map, true);
      map.addEventListener('click', (e) => this.onMapClick(map, e));
    }
    this.signature = this.sig();
  }

  private buyBtn(act: string, cost: number, label = ''): string {
    return `<button type="button" class="buy ${this.s.coins < cost ? 'cant' : ''}" data-act="${act}" data-cost="${cost}">${label ? `<em>${label}</em>` : ''}<span><span class="pi coin"></span>${fmt(cost)}</span></button>`;
  }

  private tools(): string {
    const s = this.s;
    const cur = sim.tool(s);
    const next = sim.nextTool(s);
    const toolCard = next
      ? `<div class="card feature"><div class="ico">${TOOL_ICON[s.tool + 1]}</div><div class="info"><div class="name">${next.name}<span class="lvl">Nivel ${s.tool + 2}/${TOOLS.length}</span></div><div class="desc">${next.desc}</div><div class="eff">Alcance ${cur.radius} <span class="to">→ ${next.radius}</span> · velocidad ×${cur.speed} <span class="to">→ ×${next.speed}</span></div></div>${this.buyBtn('tool', next.cost, 'Comprar')}</div>`
      : `<div class="card feature"><div class="ico">${TOOL_ICON[s.tool]}</div><div class="info"><div class="name">${cur.name}<span class="lvl">MÁX</span></div><div class="desc">${cur.desc}</div></div><div class="max">MÁX</div></div>`;
    const ups = UPGRADES.map((u) => {
      const lvl = s.upgrades[u.id];
      const maxed = lvl >= u.max;
      let eff = '';
      if (u.id === 'boots') eff = `Velocidad +${Math.round(lvl * 12)}%${maxed ? '' : ` <span class="to">→ +${Math.round((lvl + 1) * 12)}%</span>`}`;
      else if (u.id === 'sorting') eff = `Monedas +${lvl * 15}%${maxed ? '' : ` <span class="to">→ +${(lvl + 1) * 15}%</span>`}`;
      else eff = lvl === 0 ? 'Atrae la basura desde lejos' : `Alcance del imán +${Math.round(sim.magnetRange(s))}`;
      return `<div class="card"><div class="ico">${u.icon}</div><div class="info"><div class="name">${u.name}<span class="lvl">Nv ${lvl}</span></div><div class="desc">${u.desc}</div><div class="eff">${eff}</div></div>${maxed ? '<div class="max">MÁX</div>' : this.buyBtn('upgrade:' + u.id, sim.upgradeCost(s, u.id))}</div>`;
    }).join('');
    const boat = s.boat
      ? `<div class="card"><canvas class="ico" data-icon="unit:boat"></canvas><div class="info"><div class="name">Barco de limpieza<span class="lvl">Listo</span></div><div class="desc">Entra en el agua y te subes al barco. El mar paga un 50% más.</div></div><div class="max">⛵</div></div>`
      : `<div class="card feature"><canvas class="ico" data-icon="unit:boat"></canvas><div class="info"><div class="name">Barco de limpieza</div><div class="desc">Toda la parte de arriba del mapa es mar. Con el barco puedes salir a limpiar el agua.</div><div class="eff">El mar paga un 50% más</div></div>${this.buyBtn('boat', BOAT_COST, 'Comprar')}</div>`;
    return `<div class="summary">${TOOL_ICON[s.tool]} <b>${cur.name}</b> · alcance ${cur.radius} · velocidad ${Math.round(sim.moveSpeed(s))} · aquí cada parcela vale <span class="pi coin"></span> ${fmt(sim.cellValue(s, sectorAt(s.px, s.py) >= 0 ? sectorAt(s.px, s.py) : 0))}</div>
      <h3>Siguiente herramienta</h3>${toolCard}<h3>Mejoras</h3>${ups}<h3>Mar</h3>${boat}`;
  }

  private helpers(): string {
    const s = this.s;
    const total = HELPERS.reduce((a, h) => a + sim.helperRate(s, h.id), 0);
    const cards = HELPERS.map((h) => {
      const n = s.helpers[h.id];
      const icon = h.sea ? 'unit:floater' : 'unit:robot';
      if (sim.helperLocked(s, h.id)) return `<div class="card locked"><div class="ico">🔒</div><div class="info"><div class="name">${h.name}</div><div class="desc">Primero compra el barco.</div></div></div>`;
      const maxed = n >= h.max;
      return `<div class="card"><canvas class="ico" data-icon="${icon}"></canvas><div class="info"><div class="name">${h.name}<span class="lvl">×${n}</span></div><div class="desc">${h.desc}</div><div class="eff">~${fmt(sim.sweepRate(sim.helperRadius(s), sim.HELPER_SPEED, 0.7))} parcelas/s cada uno</div></div>${maxed ? '<div class="max">MÁX</div>' : this.buyBtn('helper:' + h.id, sim.helperCost(s, h.id))}</div>`;
    }).join('');
    return `<div class="summary">Tus ayudantes barren <b>~${fmt(total)}</b> parcelas/s en los sectores sin terminar más cercanos. Sus cepillos crecen cuando mejoras tu herramienta y siguen trabajando cuando no estás (al 50%, hasta ${sim.OFFLINE_CAP / 3600} h).</div>${cards}`;
  }

  private map(): string {
    const s = this.s;
    return `<div class="mapwrap"><canvas class="bigmap" data-act="map"></canvas></div>
      <p class="maphelp">Toca un sector para ir hasta allí, andando o en barco.</p>
      <div class="rows">
        <div class="row">✨ Sectores limpios <b>${sim.doneCount(s)}/${SECTOR_N}</b></div>
        <div class="row">❗ Misiones cumplidas <b>${s.missions.length}/${MISSION_SPOTS.length}</b></div>
        <div class="row">🧴 Basura recogida <b>${s.picked}/${LITTER.length}</b></div>
        <button type="button" class="row" data-act="sound">${s.sound ? '🔊 Sonido activado' : '🔇 Sonido desactivado'}</button>
        <button type="button" class="row danger" data-act="reset">Empezar de nuevo</button>
      </div>`;
  }

  private onMapClick(cv: HTMLCanvasElement, e: MouseEvent): void {
    const b = cv.getBoundingClientRect();
    const id = this.scene.mapSector(cv, e.clientX - b.left, e.clientY - b.top);
    if (id < 0) return;
    if (sim.seaLocked(this.s, id) && sectorRow(id) < SEA_ROWS - 1) {
      this.act.denied();
      this.toast('El mar', 'Compra el barco en Equipo para salir al mar.', '⛵');
      return;
    }
    this.act.goTo(id);
    this.open('beach');
  }

  private life(): string {
    const s = this.s;
    const cards = ANIMALS.map((a) => {
      const got = s.animals.includes(a.id);
      return `<div class="animal ${got ? '' : 'missing'}"><canvas class="ico" data-icon="animal:${a.id}"></canvas><div class="name">${got ? a.name : '???'}</div><div class="desc">${got ? a.desc : `Vuelve cuando el ${a.at}% de la costa esté limpio`}</div></div>`;
    }).join('');
    const kinds = TREASURES.filter((t) => s.finds[t.id]).length;
    const finds = TREASURES.map((t) => {
      const n = s.finds[t.id] ?? 0;
      return `<div class="find ${n ? '' : 'missing'}" data-act="find:${t.id}"><div class="fico">${n ? t.icon : '?'}</div><div class="name">${n ? t.name : '???'}</div>${n ? `<div class="desc">×${n}</div>` : ''}</div>`;
    }).join('');
    return `<h3>Tesoros</h3><div class="summary"><b>${kinds}/${TREASURES.length}</b> tipos encontrados. Hay tesoros enterrados por toda la costa: barre la suciedad y verás su brillo. Toca uno para verlo.</div><div class="finds">${finds}</div>
      <h3>Animales</h3><div class="summary"><b>${s.animals.length}/${ANIMALS.length}</b> especies han vuelto a casa. Búscalas en la arena limpia y en el agua clara.</div><div class="animals">${cards}</div>`;
  }

  // ---- toasts & modals ---------------------------------------------------

  toast(title: string, text: string, icon: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    const ico = icon.includes(':') ? `<canvas class="ico" data-icon="${icon}"></canvas>` : `<div class="ico">${icon}</div>`;
    el.innerHTML = `${ico}<div><b>${title}</b><span>${text}</span></div>`;
    const cv = el.querySelector<HTMLCanvasElement>('canvas');
    if (cv) paintIcon(cv, icon);
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 2) box.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4100);
  }

  animalToast(id: string): void {
    const a = ANIMALS.find((x) => x.id === id);
    if (a) this.toast(`¡Ha vuelto: ${a.name}!`, a.desc, 'animal:' + id);
  }

  modal(html: string, buttons: { label: string; kind?: string; fn?: () => void }[]): void {
    const m = $('modal');
    m.innerHTML = `<div class="dialog">${html}<div class="actions">${buttons.map((b, i) => `<button type="button" class="${b.kind ?? 'primary'}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    m.hidden = false;
    for (const cv of Array.from(m.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]'))) paintIcon(cv, cv.dataset.icon ?? '');
    m.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-i]');
      if (!b) return;
      m.hidden = true;
      m.innerHTML = '';
      buttons[Number(b.dataset.i)]!.fn?.();
    };
  }

  offlineModal(r: sim.OfflineReport): void {
    const animals = r.events.filter((e) => e.kind === 'animal').map((e) => ANIMALS.find((a) => a.id === (e as { id: string }).id)!);
    const sectors = r.events.filter((e) => e.kind === 'sector').length;
    const lines = [
      `<li><span>🤖</span><div><b>${fmt(r.cells)}</b> parcelas barridas</div></li>`,
      `<li><span class="pi coin"></span><div><b>${fmt(r.coins)}</b> monedas ganadas</div></li>`,
      sectors ? `<li><span>✨</span><div><b>${sectors}</b> sector${sectors > 1 ? 'es' : ''} limpio${sectors > 1 ? 's' : ''}</div></li>` : '',
      ...animals.map((a) => `<li><canvas class="mini" data-icon="animal:${a.id}"></canvas><div>Ha vuelto: <b>${a.name}</b></div></li>`),
    ].join('');
    const note = r.capped ? `<p class="note">Tus ayudantes descansan tras ${Math.round(r.seconds / 3600)} horas de trabajo.</p>` : '';
    this.modal(`<div class="big">🌅</div><h2>¡Hola de nuevo!</h2><p>Mientras no estabas (${fmtDuration(r.seconds)}) tus ayudantes siguieron barriendo:</p><ul class="gains">${lines}</ul>${note}`, [{ label: '¡Genial!' }]);
  }

  /** A treasure from the collection, up close. */
  private findModal(id: string): void {
    const t = TREASURES.find((x) => x.id === id);
    if (!t) return;
    this.act.tabSound();
    const n = this.s.finds[id] ?? 0;
    if (!n) {
      this.modal('<div class="big">❔</div><h2>Aún no lo has encontrado</h2><p>Está enterrado en algún lugar de la costa. Barre la suciedad y busca un brillo.</p>', [{ label: 'Seguiré buscando' }]);
      return;
    }
    this.modal(`<div class="big">${t.icon}</div><h2>${t.name}</h2><p>${t.desc}</p><ul class="gains"><li><span>🔎</span><div>Encontrado <b>${n}</b> ${n > 1 ? 'veces' : 'vez'}</div></li><li><span>✨</span><div>Rareza: <b>${t.weight >= 12 ? 'común' : t.weight >= 4 ? 'poco común' : t.weight >= 1.5 ? 'rara' : 'legendaria'}</b></div></li></ul>`, [{ label: 'Precioso' }]);
  }

  completeModal(): void {
    this.modal(
      `<div class="big">🏝️</div><h2>¡Toda la costa está limpia!</h2><p>Cada grano de arena y cada ola, impecables. La ballena ha vuelto a mar abierto.</p>`,
      [{ label: 'Disfrutar de las vistas' }],
    );
  }

  private confirmReset(): void {
    this.modal('<div class="big">🌊</div><h2>¿Empezar de nuevo?</h2><p>Se borrará tu costa y todo tu progreso en este dispositivo.</p>', [
      { label: 'Conservar mi costa', kind: 'ghost' },
      { label: 'Borrarlo todo', kind: 'danger', fn: () => this.act.reset() },
    ]);
  }
}
