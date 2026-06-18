// Fader Editor tile (CONTROL view, bottom-right) — per-channel faders for the
// selected group's fixtures. Category tabs filter by channel type; each column
// shows a symbol for the channel's type, a value/OFF readout, and (in FADER
// mode) a vertical fader. Writes go live to every fixture in the group.

import { bus, EV } from '../lib/bus';
import { html, mount, raw } from '../lib/dom';

const { lumox } = window;

const CATEGORIES: { key: string; groups: string[] | null }[] = [
  { key: 'DIMMER', groups: ['intensity'] },
  { key: 'COLOR', groups: ['color'] },
  { key: 'POSITION', groups: ['position'] },
  { key: 'GOBO', groups: ['gobo'] },
  { key: 'BEAM', groups: ['beam'] },
  { key: 'FOCUS', groups: ['beam'] },
  { key: 'OTHER', groups: ['control', 'maintenance', 'effect'] },
  { key: 'FADER', groups: null },   // all channels + faders
];

// channel-type group → symbol
function iconFor(group: string) {
  switch (group) {
    case 'intensity': return '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="2.3" fill="currentColor"/><path d="M6 .8V2.4M6 9.6v1.6M.8 6h1.6M9.6 6h1.6M2.3 2.3l1.1 1.1M8.6 8.6l1.1 1.1M9.7 2.3 8.6 3.4M3.4 8.6 2.3 9.7" stroke="currentColor" fill="none"/></svg>';
    case 'color': return '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.6" fill="currentColor"/></svg>';
    case 'position': return '<svg viewBox="0 0 12 12"><path d="M6 1v10M1 6h10M6 1 4.6 2.6M6 1 7.4 2.6M1 6 2.6 4.6M1 6 2.6 7.4M11 6 9.4 4.6M11 6 9.4 7.4M6 11 4.6 9.4M6 11 7.4 9.4" stroke="currentColor" fill="none"/></svg>';
    case 'gobo': return '<svg viewBox="0 0 12 12"><path d="M6 1.5V10.5M2.1 3.2l7.8 5.6M9.9 3.2 2.1 8.8" stroke="currentColor" fill="none"/></svg>';
    case 'beam': return '<svg viewBox="0 0 12 12"><path d="M2 2h2.4M2 2v2.4M10 2h-2.4M10 2v2.4M2 10h2.4M2 10v-2.4M10 10h-2.4M10 10v-2.4" stroke="currentColor" fill="none"/></svg>';
    case 'control': return '<svg viewBox="0 0 12 12"><path d="M1.8 8.4a4.5 4.5 0 0 1 8.4 0" stroke="currentColor" fill="none"/><path d="M6 8 8.4 4.8" stroke="currentColor" fill="none"/></svg>';
    case 'maintenance': return '<svg viewBox="0 0 12 12"><path d="M8 2.4a2.2 2.2 0 0 0-2.6 2.9L2.4 8.3l1.3 1.3 3-3A2.2 2.2 0 0 0 9.6 4z" stroke="currentColor" fill="none"/></svg>';
    case 'effect': return '<svg viewBox="0 0 12 12"><path d="M6 1.5 7 4.8 10.3 5.8 7 6.8 6 10.1 5 6.8 1.7 5.8 5 4.8z" fill="currentColor"/></svg>';
    default: return '<span class="fc-q">?</span>';
  }
}

export async function makeFaderEditorTile() {
  const tile = document.createElement('section');
  tile.className = 'tile fader-tile';
  tile.innerHTML = `
    <div class="tile-head fader-head">
      <span class="seg fe-mode">
        <button class="seg-btn active">EDIT</button>
        <button class="seg-btn">LIVE</button>
      </span>
      <span class="fe-tabs">
        <span class="fe-tab active">EDIT: Scene</span>
        <span class="fe-tab muted">MIXER</span>
      </span>
    </div>
    <div class="fader-body">
      <div id="fe-cats" class="fe-cats"></div>
      <div id="fe-cols" class="fe-cols"></div>
    </div>`;

  const cats = mount(tile.querySelector('#fe-cats') as HTMLElement);
  const cols = mount(tile.querySelector('#fe-cols') as HTMLElement);

  const state = {
    group: 'all',
    activeCat: 'FADER',
    fixtures: [] as any[],
    groups: [] as any[],
    values: new Map<string, number>(),   // `${fxId}:${ch}` → value
    active: new Set<string>(),   // `${repId}:${ch}` — channel engaged (independent of value)
  };

  async function load() {
    [state.fixtures, state.groups] = await Promise.all([
      lumox.patch.list().catch(() => []),
      lumox.groups.list().catch(() => []),
    ]);
    render();
  }

  function groupFixtures() {
    if (state.group && state.group !== 'all') {
      const g = state.groups.find((x) => x.id === state.group);
      if (g) return state.fixtures.filter((f) => g.fixtureIds.includes(f.id));
    }
    return [];
  }

  // write a value to the given channel on every fixture in the group
  function writeAll(fixtures: any[], ch: number, value: number) {
    for (const f of fixtures) {
      state.values.set(`${f.id}:${ch}`, value);
      lumox.fixtures.setChannel(f.id, ch, value);
    }
  }

  function render() {
    cats.set(html`${CATEGORIES.map((c) =>
      html`<button class="fe-cat${c.key === state.activeCat ? ' active' : ''}" data-cat="${c.key}">${c.key}</button>`)}`);

    const fixtures = groupFixtures();
    if (!fixtures.length) {
      cols.set(html`<div class="muted pad">Select a group below.</div>`);
      return;
    }
    const rep = fixtures[0];
    const groups = CATEGORIES.find((c) => c.key === state.activeCat)?.groups;
    const chans = rep.channels.filter((c: any) => !groups || groups.includes(c.group));
    const showFader = state.activeCat === 'FADER';
    const gname = state.groups.find((g) => g.id === state.group)?.name ?? '';

    cols.set(html`
      <div class="fe-colhdr">${gname.toUpperCase()}</div>
      <div class="fe-row">
        ${chans.map((c: any) => {
          const key = `${rep.id}:${c.index}`;
          const v = state.values.get(key) ?? 0;
          const on = state.active.has(key);
          return html`
          <div class="fcol${on ? ' active' : ''}" data-ch="${c.index}" data-group="${c.group || ''}">
            <div class="fc-dot${on ? ' on' : ''}"></div>
            <div class="fc-n">${c.index}</div>
            <button class="fc-icon" title="${c.name}">${raw(iconFor(c.group))}</button>
            <div class="fc-val">${on ? v : 'OFF'}</div>
            ${showFader ? html`<input class="fc-fader" type="range" min="0" max="255" value="${v}" orient="vertical" ${on ? '' : 'disabled'} />` : ''}
          </div>`;
        })}
      </div>`);
  }

  // ---- delegated events (bound once; survive every render) --------------
  // toggle a channel's active state — value stays as-is (0 on first activate)
  function toggleCol(col: HTMLElement) {
    const fixtures = groupFixtures();
    if (!fixtures.length) return;
    const ch = Number(col.dataset.ch);
    const key = `${fixtures[0].id}:${ch}`;
    if (state.active.has(key)) {
      state.active.delete(key);
      writeAll(fixtures, ch, 0);                          // deactivate → force output 0
    } else {
      state.active.add(key);
      writeAll(fixtures, ch, state.values.get(key) ?? 0);  // keep current value
    }
    render();
  }

  cats.on('click', '.fe-cat', (_e, t) => { state.activeCat = t.dataset.cat as string; render(); });
  cols.on('click', '.fc-dot', (_e, t) => { const col = t.closest('.fcol') as HTMLElement | null; if (col) toggleCol(col); });
  cols.on('click', '.fc-icon', (_e, t) => { const col = t.closest('.fcol') as HTMLElement | null; if (col) toggleCol(col); });
  cols.on('input', '.fc-fader', (_e, t) => {
    const fader = t as HTMLInputElement;   // disabled faders never emit input, so this only fires when active
    const col = fader.closest('.fcol') as HTMLElement | null;
    const fixtures = groupFixtures();
    if (!col || !fixtures.length) return;
    const v = Number(fader.value);
    writeAll(fixtures, Number(col.dataset.ch), v);
    (col.querySelector('.fc-val') as HTMLElement).textContent = String(v);
  });

  bus.on(EV.GROUP_SELECTED, (id) => { state.group = id; render(); });
  bus.on(EV.PATCH_CHANGED, load);
  bus.on(EV.GROUPS_CHANGED, load);

  await load();
  return { tile, refresh: load };
}
