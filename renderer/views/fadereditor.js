// Fader Editor tile (CONTROL view, bottom-right) — per-channel faders for the
// selected group's fixtures. Category tabs filter by channel type; each column
// shows a symbol for the channel's type, a value/OFF readout, and (in FADER
// mode) a vertical fader. Writes go live to every fixture in the group.

import { bus, EV } from '../lib/bus.js';

const { lumox } = window;

const CATEGORIES = [
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
function iconFor(group) {
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

  const catsEl = tile.querySelector('#fe-cats');
  const colsEl = tile.querySelector('#fe-cols');

  const state = {
    group: 'all',
    activeCat: 'FADER',
    fixtures: [],
    groups: [],
    values: new Map(),   // `${fxId}:${ch}` → value
    active: new Set(),   // `${repId}:${ch}` — channel engaged (independent of value)
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

  function render() {
    catsEl.innerHTML = CATEGORIES.map((c) =>
      `<button class="fe-cat${c.key === state.activeCat ? ' active' : ''}" data-cat="${c.key}">${c.key}</button>`).join('');
    catsEl.querySelectorAll('.fe-cat').forEach((b) =>
      b.addEventListener('click', () => { state.activeCat = b.dataset.cat; render(); }));

    const fixtures = groupFixtures();
    if (!fixtures.length) {
      colsEl.innerHTML = '<div class="muted pad">Select a group below.</div>';
      return;
    }
    const rep = fixtures[0];
    const groups = CATEGORIES.find((c) => c.key === state.activeCat)?.groups;
    const cols = rep.channels.filter((c) => !groups || groups.includes(c.group));
    const showFader = state.activeCat === 'FADER';
    const gname = state.groups.find((g) => g.id === state.group)?.name ?? '';

    colsEl.innerHTML = `
      <div class="fe-colhdr">${gname.toUpperCase()}</div>
      <div class="fe-row">
        ${cols.map((c) => {
          const key = `${rep.id}:${c.index}`;
          const v = state.values.get(key) ?? 0;
          const on = state.active.has(key);
          return `
          <div class="fcol${on ? ' active' : ''}" data-ch="${c.index}" data-group="${c.group || ''}">
            <div class="fc-dot${on ? ' on' : ''}"></div>
            <div class="fc-n">${c.index}</div>
            <button class="fc-icon" title="${c.name}">${iconFor(c.group)}</button>
            <div class="fc-val">${on ? v : 'OFF'}</div>
            ${showFader ? `<input class="fc-fader" type="range" min="0" max="255" value="${v}" orient="vertical" ${on ? '' : 'disabled'} />` : ''}
          </div>`;
        }).join('')}
      </div>`;

    const write = (ch, value) => {
      for (const f of fixtures) {
        state.values.set(`${f.id}:${ch}`, value);
        lumox.fixtures.setChannel(f.id, ch, value);
      }
    };

    colsEl.querySelectorAll('.fcol').forEach((col) => {
      const ch = Number(col.dataset.ch);
      const valEl = col.querySelector('.fc-val');
      const dot = col.querySelector('.fc-dot');
      const fader = col.querySelector('.fc-fader');
      const key = `${rep.id}:${ch}`;
      // toggle the channel's active state — value stays as-is (0 on first activate)
      const toggleActive = () => {
        if (state.active.has(key)) {
          state.active.delete(key);
          write(ch, 0);                 // deactivate → force output 0
        } else {
          state.active.add(key);
          write(ch, state.values.get(key) ?? 0);   // keep current value (0)
        }
        render();
      };
      dot.addEventListener('click', toggleActive);
      col.querySelector('.fc-icon').addEventListener('click', toggleActive);
      // fader only writes while active
      fader?.addEventListener('input', () => {
        const v = Number(fader.value);
        write(ch, v);
        valEl.textContent = v;
      });
    });
  }

  bus.on(EV.GROUP_SELECTED, (id) => { state.group = id; render(); });
  bus.on(EV.PATCH_CHANGED, load);
  bus.on(EV.GROUPS_CHANGED, load);

  await load();
  return { tile, refresh: load };
}
