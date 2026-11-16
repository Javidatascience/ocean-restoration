// DOM interface: HUD, bottom navigation, the slide-up sheet with its five panels, toasts and modals.
import {
  ANIMALS, BRANCHES, MILESTONES, RECYCLERS, REEF_ROUTE_COST, REGIONS, RESEARCH, UNITS, UPGRADES,
  type UnitId, type UpgradeId,
} from '../core/content.ts';
import { fmt, fmtDuration } from '../core/format.ts';
import * as sim from '../core/sim.ts';
import type { GameState } from '../core/state.ts';
import { paintIcon } from '../scene/sprites.ts';

export type Tab = 'beach' | 'equipment' | 'automation' | 'research' | 'map' | 'life';

export interface UIActions {
  buyUpgrade(id: UpgradeId): boolean;
  buyUnit(id: UnitId): boolean;
  buyRecycler(): boolean;
  buyResearch(id: string): boolean;
  chartReef(): boolean;
  toggleSound(): void;
  reset(): void;
  denied(): void;
  tabSound(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const TITLES: Record<Tab, string> = {
  beach: '', equipment: 'Equipment', automation: 'Automation', research: 'Research', map: 'Ocean Map', life: 'Marine Life',
};

export class UI {
  private tab: Tab = 'beach';
  private selResearch: string | null = null;
  private signature = '';
  private lastHud = '';

  constructor(private s: GameState, private act: UIActions) {
    $('nav').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!b) return;
      const t = b.dataset.tab as Tab;
      this.open(t === this.tab ? 'beach' : t);
      act.tabSound();
    });
    $('sheet-close').addEventListener('click', () => this.open('beach'));
    $('life-chip').addEventListener('click', () => {
      this.open(this.tab === 'life' ? 'beach' : 'life');
      act.tabSound();
    });
    $('sheet-body').addEventListener('click', (e) => this.onSheetClick(e));
  }

  setState(s: GameState): void {
    this.s = s;
  }

  // ---- navigation --------------------------------------------------------

  open(tab: Tab): void {
    this.tab = tab;
    const sheet = $('sheet');
    const openNow = tab !== 'beach';
    sheet.classList.toggle('open', openNow);
    sheet.setAttribute('aria-hidden', String(!openNow));
    document.body.classList.toggle('sheet-open', openNow);
    for (const b of Array.from($('nav').querySelectorAll<HTMLElement>('[data-tab]'))) {
      b.classList.toggle('on', b.dataset.tab === tab || (tab === 'life' && b.dataset.tab === 'beach'));
    }
    if (openNow) {
      $('sheet-title').textContent = TITLES[tab];
      $('sheet-body').scrollTop = 0;
      this.render();
    }
  }

  private onSheetClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const [kind, id] = (el.dataset.act ?? '').split(':');
    let ok: boolean | null = null;
    if (kind === 'upgrade') ok = this.act.buyUpgrade(id as UpgradeId);
    else if (kind === 'unit') ok = this.act.buyUnit(id as UnitId);
    else if (kind === 'recycler') ok = this.act.buyRecycler();
    else if (kind === 'research') ok = this.act.buyResearch(id);
    else if (kind === 'reef') ok = this.act.chartReef();
    else if (kind === 'rsel') { this.selResearch = id; this.act.tabSound(); }
    else if (kind === 'life') { this.open('life'); return; }
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
    if (ok) {
      const again = $('sheet-body').querySelector<HTMLElement>(`[data-act="${key}"]`);
      again?.closest('.card, .rdetail, .region')?.classList.add('bought');
    }
  }

  // ---- per-frame-ish refresh --------------------------------------------

  /** Cheap updates, called a few times per second. */
  refresh(): void {
    const s = this.s;
    const p = sim.pct(s);
    const cap = sim.storageCap(s);
    const hud = [
      fmt(s.coins), fmt(sim.coinsPerMinute(s)), fmt(s.waste), fmt(cap), fmt(sim.wastePerMinute(s)), Math.floor(s.rep), p.toFixed(1),
    ].join('|');
    if (hud !== this.lastHud) {
      this.lastHud = hud;
      $('coins').textContent = fmt(s.coins);
      $('coins-rate').textContent = `+${fmt(sim.coinsPerMinute(s))}/min`;
      $('waste').textContent = `${fmt(s.waste)}/${fmt(cap)}`;
      $('waste-rate').textContent = `+${fmt(sim.wastePerMinute(s))}/min`;
      $('rep').textContent = fmt(Math.floor(s.rep));
      $('pct').textContent = p >= 100 ? '100% ✨' : p.toFixed(1) + '%';
      $('pct-fill').style.width = p + '%';
      $('pill-waste').classList.toggle('full', s.waste >= cap * 0.98);
      $('life-count').textContent = `${s.animals.length}/${ANIMALS.length}`;
    }
    this.hint();
    this.badges();
    if (this.tab === 'beach') return;
    // Re-render when something structural changed (an unlock), otherwise just toggle affordability.
    const sig = this.sig();
    if (sig !== this.signature) this.render();
    else {
      for (const b of Array.from($('sheet-body').querySelectorAll<HTMLElement>('[data-cost]'))) {
        const have = b.dataset.cur === 'rep' ? s.rep : s.coins;
        b.classList.toggle('cant', have < Number(b.dataset.cost));
      }
      const live = $('sheet-body').querySelector<HTMLElement>('[data-live="rep"]');
      if (live) live.textContent = fmt(Math.floor(s.rep));
    }
  }

  private sig(): string {
    const s = this.s;
    const p = sim.pct(s);
    return [
      this.tab,
      UPGRADES.map((u) => (p >= u.unlockAt ? 1 : 0)).join(''),
      UNITS.map((u) => (p >= u.unlockAt ? 1 : 0)).join(''),
      RESEARCH.map((r) => sim.researchState(s, r)[0]).join(''),
      s.animals.length, s.milestones.length, sim.canChartReef(s) ? 1 : 0, Math.floor(p),
    ].join('|');
  }

  private hint(): void {
    const s = this.s;
    let text: string;
    const stuck = sim.isBottlenecked(s) && (s.recycler < RECYCLERS.length - 1 || s.upgrades.conveyor < 40);
    if (s.totalWaste < 4) text = '👆 Tap the trash to clean the beach';
    else if (s.totalCoins < 10 && s.coins < 10) text = '♻️ Waste is recycled into coins';
    else if (s.totalWaste < 60 && s.coins >= 10 && s.upgrades.grabber === 0 && sim.totalUnits(s) === 0) text = '🧰 You can afford your first upgrade';
    else if (stuck) text = '📦 Storage is full — upgrade your recycling';
    else {
      const next = ANIMALS.find((a) => !s.animals.includes(a.id));
      text = next ? `Next: ${next.name} returns at ${next.at}%` : s.reefCharted ? '🌊 Your ocean is thriving' : '🗺️ The Coral Reef awaits on the Ocean Map';
    }
    const el = $('hint');
    if (el.textContent !== text) el.textContent = text;
  }

  private badges(): void {
    const s = this.s;
    const flags: Record<string, boolean> = {
      equipment: UPGRADES.some((u) => sim.canBuyUpgrade(s, u.id)) || sim.canBuyRecycler(s),
      automation: UNITS.some((u) => sim.canBuyUnit(s, u.id)),
      research: RESEARCH.some((r) => sim.researchState(s, r) === 'ready'),
      map: sim.canChartReef(s),
    };
    for (const b of Array.from($('nav').querySelectorAll<HTMLElement>('[data-tab]'))) {
      b.classList.toggle('badge', !!flags[b.dataset.tab ?? '']);
    }
  }

  // ---- sheet rendering ---------------------------------------------------

  render(): void {
    if (this.tab === 'beach') return;
    const body = $('sheet-body');
    const scroll = body.scrollTop;
    const html = this.tab === 'equipment' ? this.equipment()
      : this.tab === 'automation' ? this.automation()
      : this.tab === 'research' ? this.research()
      : this.tab === 'map' ? this.map()
      : this.life();
    body.innerHTML = html;
    body.scrollTop = scroll;
    for (const cv of Array.from(body.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]'))) paintIcon(cv, cv.dataset.icon ?? '');
    this.signature = this.sig();
  }

  private buyBtn(act: string, cost: number, cur: 'coins' | 'rep' = 'coins', label = ''): string {
    const have = cur === 'rep' ? this.s.rep : this.s.coins;
    const ico = cur === 'rep' ? '<span class="pi">⭐</span>' : '<span class="pi coin"></span>';
    return `<button type="button" class="buy ${have < cost ? 'cant' : ''}" data-act="${act}" data-cost="${cost}" data-cur="${cur}">${label ? `<em>${label}</em>` : ''}<span>${ico}${fmt(cost)}</span></button>`;
  }
  private locked(name: string, at: number): string {
    return `<div class="card locked"><div class="ico">🔒</div><div class="info"><div class="name">${name}</div><div class="desc">Restore the beach to ${at}% to unlock.</div></div></div>`;
  }

  private upgradeEffect(id: UpgradeId): string {
    const s = this.s;
    const lvl = s.upgrades[id];
    const def = UPGRADES.find((u) => u.id === id)!;
    const peek = (f: () => number): [number, number] => {
      const now = f();
      s.upgrades[id]++;
      const next = f();
      s.upgrades[id]--;
      return [now, next];
    };
    const arrow = (a: string, b: string) => (lvl >= def.max ? a : `${a} <span class="to">→ ${b}</span>`);
    if (id === 'grabber') { const [a, b] = peek(() => sim.tapPower(s)); return 'Tap power ' + arrow(fmt(a), fmt(b)); }
    if (id === 'bag') { const [a, b] = peek(() => sim.storageCap(s)); return 'Storage ' + arrow(fmt(a), fmt(b)) + ' · tap +10%'; }
    if (id === 'net') return 'All collection ' + arrow(`+${lvl * 10}%`, `+${(lvl + 1) * 10}%`);
    if (id === 'cart') return lvl === 0 ? 'Tap sweeps an area · tap +20%' : 'Sweep area ' + arrow(`size ${lvl}`, `size ${lvl + 1}`) + ' · tap +20%';
    const [a, b] = peek(() => sim.throughput(s) * 60);
    return 'Recycles ' + arrow(fmt(a), fmt(b)) + '/min';
  }

  private upgradeCard(id: UpgradeId): string {
    const s = this.s;
    const d = UPGRADES.find((u) => u.id === id)!;
    if (!sim.isUnlocked(s, d.unlockAt)) return this.locked(d.name, d.unlockAt);
    const lvl = s.upgrades[id];
    const maxed = lvl >= d.max;
    return `<div class="card"><div class="ico">${d.icon}</div><div class="info"><div class="name">${d.name}<span class="lvl">Lv ${lvl}</span></div><div class="desc">${d.desc}</div><div class="eff">${this.upgradeEffect(id)}</div></div>${maxed ? '<div class="max">MAX</div>' : this.buyBtn('upgrade:' + id, sim.upgradeCost(s, id))}</div>`;
  }

  private equipment(): string {
    const s = this.s;
    const cur = RECYCLERS[s.recycler];
    const next = RECYCLERS[s.recycler + 1];
    const recycler = next
      ? `<div class="card feature"><canvas class="ico" data-icon="recycler:${s.recycler + 1}"></canvas><div class="info"><div class="name">${next.name}<span class="lvl">Tier ${s.recycler + 2}/5</span></div><div class="desc">${next.desc}</div><div class="eff">${fmt(next.throughput * 60)} waste/min base · ${next.value} coins per waste <span class="to">(now ${cur.value})</span></div></div>${this.buyBtn('recycler', next.cost, 'coins', 'Build')}</div>`
      : `<div class="card feature"><canvas class="ico" data-icon="recycler:${s.recycler}"></canvas><div class="info"><div class="name">${cur.name}<span class="lvl">Tier 5/5</span></div><div class="desc">${cur.desc}</div><div class="eff">${cur.value} coins per waste</div></div><div class="max">MAX</div></div>`;
    return `<h3>Hand tools</h3>${(['grabber', 'bag', 'net', 'cart'] as UpgradeId[]).map((id) => this.upgradeCard(id)).join('')}
      <h3>Recycling <small>${cur.name} · ${fmt(sim.throughput(s) * 60)} waste/min · ${fmt(sim.coinValue(s))} coins each</small></h3>${recycler}${this.upgradeCard('conveyor')}`;
  }

  private automation(): string {
    const s = this.s;
    const card = (id: UnitId): string => {
      const d = UNITS.find((u) => u.id === id)!;
      if (!sim.isUnlocked(s, d.unlockAt)) return this.locked(d.name, d.unlockAt);
      const n = s.units[id];
      const rate = sim.unitRate(s, id) * 60;
      return `<div class="card"><canvas class="ico ${d.group}" data-icon="unit:${id}"></canvas><div class="info"><div class="name">${d.name}<span class="lvl">×${n}</span></div><div class="desc">${d.desc}</div><div class="eff">+${fmt(rate)} waste/min each${n ? ` <span class="to">· ${fmt(rate * n)}/min total</span>` : ''}</div></div>${this.buyBtn('unit:' + id, sim.unitCost(s, id))}</div>`;
    };
    const firstLocked = (group: string): UnitId[] => {
      const out: UnitId[] = [];
      let shownLocked = false;
      for (const u of UNITS.filter((x) => x.group === group)) {
        if (sim.isUnlocked(s, u.unlockAt)) out.push(u.id);
        else if (!shownLocked) { out.push(u.id); shownLocked = true; }
      }
      return out;
    };
    const total = sim.wastePerMinute(s);
    return `<div class="summary"><b>+${fmt(total)}</b> waste/min from ${sim.totalUnits(s)} helpers · offline they keep working at ${Math.round(sim.offlineEfficiency(s) * 100)}% for up to ${sim.offlineCapSeconds(s) / 3600}h</div>
      <h3>Beach crew</h3>${firstLocked('beach').map(card).join('')}
      <h3>Ocean fleet</h3>${firstLocked('ocean').map(card).join('')}`;
  }

  private research(): string {
    const s = this.s;
    if (!this.selResearch || sim.has(s, this.selResearch)) {
      const pick = RESEARCH.find((r) => sim.researchState(s, r) === 'ready') ?? RESEARCH.find((r) => sim.researchState(s, r) === 'short');
      if (pick && (!this.selResearch || sim.has(s, this.selResearch))) this.selResearch = pick.id;
    }
    const sel = RESEARCH.find((r) => r.id === this.selResearch) ?? RESEARCH[0];
    const st = sim.researchState(s, sel);
    const branch = BRANCHES.find((b) => b.id === sel.branch)!;
    const action = st === 'done' ? '<div class="max">DONE</div>'
      : st === 'locked' ? '<div class="max lock">🔒 Research the one above first</div>'
      : this.buyBtn('research:' + sel.id, sel.cost, 'rep', 'Research');
    const detail = `<div class="rdetail" style="--c:${branch.color}"><div class="ico">${sel.icon}</div><div class="info"><div class="name">${sel.name}</div><div class="desc">${sel.desc}</div></div>${action}</div>`;
    const cols = BRANCHES.map((b) => {
      const nodes = RESEARCH.filter((r) => r.branch === b.id).map((r) => {
        const state = sim.researchState(s, r);
        return `<button type="button" class="node ${state} ${r.id === sel.id ? 'sel' : ''}" data-act="rsel:${r.id}"><span>${state === 'locked' ? '🔒' : r.icon}</span><small>${state === 'done' ? '✓' : r.cost + '⭐'}</small></button>`;
      }).join('<i class="link"></i>');
      return `<div class="branch" style="--c:${b.color}"><h4>${b.name}</h4>${nodes}</div>`;
    }).join('');
    return `<div class="summary">⭐ <b data-live="rep">${fmt(Math.floor(s.rep))}</b> Ocean Reputation · earned as the beach recovers and animals return</div>${detail}<div class="tree">${cols}</div>`;
  }

  private map(): string {
    const s = this.s;
    const p = sim.pct(s);
    const check = (ok: boolean, text: string) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${text}</li>`;
    const cards = REGIONS.map((r, i) => {
      if (r.id === 'beach') {
        return `<div class="region here"><div class="rico">${r.icon}</div><div class="info"><div class="name">${r.name}<span class="lvl">You are here</span></div><div class="desc">${r.features}</div><div class="bar"><div class="fill" style="width:${p}%"></div></div><div class="eff">${p.toFixed(1)}% restored${s.beachRewarded ? ' · 🐚 Golden Conch: coins +50%' : ''}</div></div></div>`;
      }
      if (r.id === 'reef') {
        if (s.reefCharted) {
          return `<div class="region charted"><div class="rico">${r.icon}</div><div class="info"><div class="name">${r.name}<span class="lvl">Route charted</span></div><div class="desc">${r.features}</div><div class="eff">The expedition sets sail in a future update. Visitors already love the idea: coins +25%.</div></div></div>`;
        }
        return `<div class="region next"><div class="rico">${r.icon}</div><div class="info"><div class="name">${r.name}</div><div class="desc">${r.teaser}</div><ul class="req">${check(p >= 100, 'Tropical Beach 100% restored')}${check(sim.has(s, 'e5'), 'Ocean Ambassador research')}${check(s.rep >= REEF_ROUTE_COST, `${REEF_ROUTE_COST} ⭐ Ocean Reputation`)}</ul></div>${sim.canChartReef(s) ? this.buyBtn('reef', REEF_ROUTE_COST, 'rep', 'Chart route') : '<div class="max lock">🔒</div>'}</div>`;
      }
      return `<div class="region far"><div class="rico">🔒</div><div class="info"><div class="name">${r.name}</div><div class="desc">${r.teaser}</div><div class="eff">${i === 2 ? 'Restore the Coral Reef first.' : 'Somewhere beyond the horizon…'}</div></div></div>`;
    }).join('<i class="route"></i>');
    return `${cards}
      <h3>More</h3>
      <div class="rows"><button type="button" class="row" data-act="life">🐢 Marine life <b>${s.animals.length}/${ANIMALS.length}</b></button>
      <button type="button" class="row" data-act="sound">${s.sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
      <button type="button" class="row danger" data-act="reset">Start over</button></div>`;
  }

  private life(): string {
    const s = this.s;
    const cards = ANIMALS.map((a) => {
      const got = s.animals.includes(a.id);
      return `<div class="animal ${got ? '' : 'missing'}"><canvas class="ico" data-icon="animal:${a.id}"></canvas><div class="name">${got ? a.name : '???'}</div><div class="desc">${got ? a.desc : `Returns at ${a.at}% restoration`}</div></div>`;
    }).join('');
    return `<div class="summary"><b>${s.animals.length}/${ANIMALS.length}</b> species have come home. Each one brings ⭐ reputation.</div><div class="animals">${cards}</div>`;
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
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  animalToast(id: string): void {
    const a = ANIMALS.find((x) => x.id === id);
    if (a) this.toast(`${a.name} has returned!`, a.desc, 'animal:' + id);
  }
  milestoneToast(pctValue: number): void {
    const m = MILESTONES.find((x) => x.pct === pctValue);
    if (m) this.toast(`${m.pct}% · ${m.title}`, m.text, '🌴');
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
      buttons[Number(b.dataset.i)].fn?.();
    };
  }

  offlineModal(r: sim.OfflineReport): void {
    const animals = r.events.filter((e) => e.kind === 'animal').map((e) => ANIMALS.find((a) => a.id === (e as { id: string }).id)!);
    const lines = [
      `<li><span>♻️</span><div><b>${fmt(r.waste)}</b> waste collected</div></li>`,
      `<li><span class="pi coin"></span><div><b>${fmt(r.coins)}</b> coins generated</div></li>`,
      `<li><span>🏝️</span><div>Beach restoration <b>+${r.pctGain < 0.1 ? r.pctGain.toFixed(2) : r.pctGain.toFixed(1)}%</b></div></li>`,
      ...animals.map((a) => `<li><canvas class="mini" data-icon="animal:${a.id}"></canvas><div><b>${a.name}</b> came home</div></li>`),
    ].join('');
    const note = r.capped
      ? `<p class="note">Your crew rests after ${Math.round(r.seconds / 3600)} hours away.${sim.has(this.s, 'a3') ? '' : ' Night Crew research lets them work longer.'}</p>`
      : '';
    this.modal(`<div class="big">🌅</div><h2>Welcome back!</h2><p>While you were away (${fmtDuration(r.seconds)}):</p><ul class="gains">${lines}</ul>${note}`, [{ label: 'Lovely!' }]);
  }

  restoredModal(): void {
    this.modal(
      `<div class="big">🏝️</div><h2>Beach restored!</h2><p>From a polluted shore to a thriving paradise — every tap and every helper mattered.</p>
       <ul class="gains"><li><span>🐚</span><div><b>Golden Conch</b>: coins +50% forever</div></li><li><span>🐋</span><div>The <b>Humpback Whale</b> is back offshore</div></li><li><span>🗺️</span><div>A new destination appears: the <b>Coral Reef</b></div></li></ul>`,
      [{ label: 'Keep caring for the ocean' }],
    );
  }

  private confirmReset(): void {
    this.modal('<div class="big">🌊</div><h2>Start over?</h2><p>This erases your beach and all progress on this device.</p>', [
      { label: 'Keep my beach', kind: 'ghost' },
      { label: 'Erase everything', kind: 'danger', fn: () => this.act.reset() },
    ]);
  }
}
