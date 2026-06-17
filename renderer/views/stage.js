// Stage tile — top-down 2D positioning view. Fixtures appear as draggable
// nodes on a grid; a toolbar aligns / distributes / arranges the selection.
// Positions are kept in-memory per session (keyed by fixture id).

import { bus, EV } from '../lib/bus.js';

const { lumox } = window;
const GRID = 24;            // snap grid size (px)
const NODE = 34;            // node size (px)

export async function makeStageTile() {
  const tile = document.createElement('section');
  tile.className = 'tile stage-tile';
  tile.innerHTML = `
    <div class="tile-head">
      <span>STAGE</span>
      <div class="st-tools">
        <span class="st-grp" title="Align">
          <button data-al="left"   title="Align left">⇤</button>
          <button data-al="hcenter" title="Center horizontally">H</button>
          <button data-al="right"  title="Align right">⇥</button>
        </span>
        <span class="st-grp" title="Align">
          <button data-al="top"    title="Align top">⤒</button>
          <button data-al="vcenter" title="Center vertically">⇕</button>
          <button data-al="bottom" title="Align bottom">⤓</button>
        </span>
        <span class="st-grp" title="Distribute">
          <button data-dist="h" title="Distribute horizontally">↔</button>
          <button data-dist="v" title="Distribute vertically">↕</button>
        </span>
        <span class="st-grp">
          <button data-act="arrange" title="Arrange in grid">▦</button>
          <button data-act="snap" class="active" title="Snap to grid">⊞</button>
        </span>
      </div>
    </div>
    <div class="tile-body st-body">
      <div id="st-canvas" class="st-canvas"></div>
    </div>`;

  const canvas = tile.querySelector('#st-canvas');

  const state = {
    fixtures: [],
    highlight: 'all',              // 'all' | groupId — highlights, never filters
    pos: new Map(),                // fxId → {x,y}
    selected: new Set(),
    snap: true,
  };

  function shown() { return state.fixtures; }   // always show all fixtures

  async function reload() {
    try { state.fixtures = await lumox.patch.list(); } catch { state.fixtures = []; }
    // default-place any fixture without a position
    const list = shown();
    list.forEach((f, i) => {
      if (!state.pos.has(f.id)) {
        state.pos.set(f.id, { x: 16 + (i % 8) * (NODE + 12), y: 16 + Math.floor(i / 8) * (NODE + 12) });
      }
    });
    // drop selection of vanished fixtures
    const ids = new Set(state.fixtures.map((f) => f.id));
    for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
    render();
  }

  function render() {
    const list = shown();
    canvas.innerHTML = list.map((f) => {
      const p = state.pos.get(f.id) ?? { x: 16, y: 16 };
      const sel = state.selected.has(f.id) ? ' sel' : '';
      const hl = state.highlight !== 'all' && f.groupId === state.highlight ? ' hl' : '';
      const dim = state.highlight !== 'all' && f.groupId !== state.highlight ? ' dim' : '';
      const n = Math.max(1, f.emitters || 1);
      const cols = Math.min(n, 8);
      const emitters = Array.from({ length: n }, () => '<i class="st-em"></i>').join('');
      return `<div class="st-node${sel}${hl}${dim}" data-fx="${f.id}"
        style="left:${p.x}px;top:${p.y}px;--fx:${f.color || '#6b6b6b'};--cols:${cols}"
        title="${f.name} · @${f.startAddress} · ${n} emitter${n === 1 ? '' : 's'}">
        <span class="st-addr">${f.startAddress}</span>
        <div class="st-emitters">${emitters}</div>
      </div>`;
    }).join('');
    canvas.querySelectorAll('.st-node').forEach((el) => el.addEventListener('mousedown', (e) => startDrag(e, el)));
  }

  // ---- selection + drag ------------------------------------------------
  function selectOnly(id) { state.selected.clear(); state.selected.add(id); }

  let drag = null;
  function startDrag(e, el) {
    e.preventDefault();
    const id = el.dataset.fx;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    } else if (!state.selected.has(id)) {
      selectOnly(id);
    }
    render();
    const start = { x: e.clientX, y: e.clientY };
    const origin = new Map([...state.selected].map((sid) => [sid, { ...state.pos.get(sid) }]));
    drag = { start, origin, moved: false };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }
  function onDrag(e) {
    if (!drag) return;
    const dx = e.clientX - drag.start.x;
    const dy = e.clientY - drag.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    for (const [id, o] of drag.origin) {
      state.pos.set(id, { x: Math.max(0, o.x + dx), y: Math.max(0, o.y + dy) });
    }
    applyPositions();
  }
  function endDrag() {
    if (drag?.moved && state.snap) {
      for (const id of state.selected) {
        const p = state.pos.get(id);
        state.pos.set(id, { x: snap(p.x), y: snap(p.y) });
      }
      applyPositions();
    }
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    drag = null;
  }
  const snap = (v) => Math.round(v / GRID) * GRID;
  function applyPositions() {
    canvas.querySelectorAll('.st-node').forEach((el) => {
      const p = state.pos.get(el.dataset.fx);
      if (p) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; }
    });
  }

  // click empty canvas clears selection
  canvas.addEventListener('mousedown', (e) => {
    if (e.target === canvas) { state.selected.clear(); render(); }
  });

  // ---- alignment / distribution ---------------------------------------
  const selPos = () => [...state.selected].map((id) => ({ id, ...state.pos.get(id) })).filter((p) => p.x != null);

  function align(kind) {
    const ps = selPos();
    if (ps.length < 2) return;
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    for (const p of ps) {
      const np = { ...state.pos.get(p.id) };
      if (kind === 'left') np.x = minX;
      else if (kind === 'right') np.x = maxX;
      else if (kind === 'hcenter') np.x = (minX + maxX) / 2;
      else if (kind === 'top') np.y = minY;
      else if (kind === 'bottom') np.y = maxY;
      else if (kind === 'vcenter') np.y = (minY + maxY) / 2;
      state.pos.set(p.id, np);
    }
    render();
  }

  function distribute(axis) {
    const ps = selPos();
    if (ps.length < 3) return;
    const key = axis === 'h' ? 'x' : 'y';
    ps.sort((a, b) => a[key] - b[key]);
    const lo = ps[0][key], hi = ps[ps.length - 1][key];
    const step = (hi - lo) / (ps.length - 1);
    ps.forEach((p, i) => {
      const np = { ...state.pos.get(p.id) };
      np[key] = Math.round(lo + step * i);
      state.pos.set(p.id, np);
    });
    render();
  }

  function arrange() {
    const list = state.selected.size ? shown().filter((f) => state.selected.has(f.id)) : shown();
    const cols = Math.ceil(Math.sqrt(list.length)) || 1;
    list.forEach((f, i) => {
      state.pos.set(f.id, { x: 16 + (i % cols) * (NODE + 12), y: 16 + Math.floor(i / cols) * (NODE + 12) });
    });
    render();
  }

  tile.querySelectorAll('[data-al]').forEach((b) => b.addEventListener('click', () => align(b.dataset.al)));
  tile.querySelectorAll('[data-dist]').forEach((b) => b.addEventListener('click', () => distribute(b.dataset.dist)));
  tile.querySelector('[data-act="arrange"]').addEventListener('click', arrange);
  const snapBtn = tile.querySelector('[data-act="snap"]');
  snapBtn.addEventListener('click', () => { state.snap = !state.snap; snapBtn.classList.toggle('active', state.snap); });

  // react to patch + group selection
  bus.on(EV.PATCH_CHANGED, reload);
  bus.on(EV.GROUPS_CHANGED, reload);
  bus.on(EV.GROUP_SELECTED, (id) => { state.highlight = id; render(); });

  await reload();
  return { tile, refresh: reload };
}
