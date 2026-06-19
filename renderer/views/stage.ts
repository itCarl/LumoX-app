// Stage tile — top-down 2D view of the rig as built on stage. Each fixture is a
// draggable footprint showing its real emitters; the picture is the engine's
// pixel-map, so MATRIX FX read each emitter's world position from here.
//
// Coordinates are WORLD units (1 unit = one emitter cell), the same space the
// engine consumes — persisted per fixture as `stageTransform` via
// `lumox.patch.setTransform`. The tile renders them at an adjustable zoom
// (px/unit) — see the zoom controls / Ctrl+scroll. Fixtures can be
// marquee-selected, drag-moved, rotated (Ctrl-drag / edge handle), and
// aligned / distributed / arranged.

import { bus, EV } from '../lib/bus';
import { esc } from '../lib/html';
import { onShortcut } from '../lib/keys';
import { emitterGrid, emitterLocalPositions } from '../../src/fixtures/emitterGeometry';

const { lumox } = window;
const DEFAULT_ZOOM = 24;   // px per world unit (emitter cell) — fixtures start zoomed in
const MIN_ZOOM = 8;        // furthest out (whole-rig overview)
const MAX_ZOOM = 72;       // closest in (single-emitter detail)
const COARSE = 1;          // default snap grid (world units = whole cells)
const FINE = 0.25;         // fine snap grid (quarter cell) for precise placement
const COLOR_POLL_MS = 66;  // live emitter-colour readback cadence (~15 fps)

interface Pos { x: number; y: number; rot: number; }   // world units + degrees
interface Dim { w: number; h: number; }                  // footprint in px (for hit-testing)
// Live-colour plan for a fixture: per-emitter RGB addresses (or null) + master dimmer.
interface ColorPlan { uid: number; groupColor: string; master: number; cells: ({ r: number; g: number; b: number } | null)[]; }

export async function makeStageTile(): Promise<{ tile: HTMLElement; refresh: () => Promise<void> }> {
  const tile = document.createElement('section');
  tile.className = 'tile stage-tile';
  tile.innerHTML = `
    <div class="tile-head st-head">
      <div class="st-tools">
        <span class="st-grp st-zoom" title="Zoom">
          <button data-zoom="out" title="Zoom out (Ctrl + scroll)"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
          <button data-zoom="reset" class="st-zlbl" title="Reset zoom">100%</button>
          <button data-zoom="in" title="Zoom in (Ctrl + scroll)"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
        </span>
      </div>
    </div>
    <div class="tile-body st-body">
      <div class="st-rail">
        <span class="st-grp st-grp-v" title="Select">
          <button data-sel="all" title="Select all (Ctrl+A)"><i class="fa-solid fa-border-all"></i></button>
          <button data-sel="none" title="Deselect all"><i class="fa-solid fa-border-none"></i></button>
          <button data-sel="invert" title="Invert selection"><i class="fa-solid fa-shuffle"></i></button>
        </span>
        <span class="st-rail-sep"></span>
        <span class="st-grp st-grp-v" title="Align horizontally">
          <button data-al="left"   title="Align left"><i class="fa-solid fa-align-left"></i></button>
          <button data-al="hcenter" title="Center horizontally"><i class="fa-solid fa-align-center"></i></button>
          <button data-al="right"  title="Align right"><i class="fa-solid fa-align-right"></i></button>
        </span>
        <span class="st-grp st-grp-v" title="Align vertically">
          <button data-al="top"    title="Align top"><i class="fa-solid fa-arrows-up-to-line"></i></button>
          <button data-al="vcenter" title="Center vertically"><i class="fa-solid fa-arrows-to-dot"></i></button>
          <button data-al="bottom" title="Align bottom"><i class="fa-solid fa-arrows-down-to-line"></i></button>
        </span>
        <span class="st-grp st-grp-v" title="Distribute">
          <button data-dist="h" title="Distribute horizontally"><i class="fa-solid fa-arrows-left-right"></i></button>
          <button data-dist="v" title="Distribute vertically"><i class="fa-solid fa-arrows-up-down"></i></button>
        </span>
        <span class="st-grp st-grp-v" title="Arrange">
          <button data-act="rot-reset" title="Reset rotation"><i class="fa-solid fa-rotate-left"></i></button>
          <button data-act="arrange" title="Arrange in grid"><i class="fa-solid fa-table-cells"></i></button>
          <button data-act="fine" title="Fine grid — precise placement"><i class="fa-solid fa-ruler-combined"></i></button>
        </span>
      </div>
      <div id="st-canvas" class="st-canvas"></div>
    </div>`;

  const canvas = tile.querySelector('#st-canvas') as HTMLElement;
  let zoom = DEFAULT_ZOOM;   // current px per world unit (mutated by the zoom controls)

  const state = {
    fixtures: [] as any[],
    highlight: 'all',              // 'all' | groupId — highlights, never filters
    pos: new Map<string, Pos>(),   // fxId → {x,y,rot} in world units
    dim: new Map<string, Dim>(),   // fxId → footprint px {w,h}
    plan: new Map<string, ColorPlan>(), // fxId → live-colour plan
    selected: new Set<string>(),
    fine: false,                   // fine snap grid (always snaps; this just halves the step)
  };

  function shown() { return state.fixtures; }   // always show all fixtures

  // Push one or more fixtures' transforms back to the engine (source of truth).
  function persist(ids: Iterable<string>) {
    for (const id of ids) {
      const p = state.pos.get(id);
      if (p) lumox.patch.setTransform(id, { x: p.x, y: p.y, rotation: p.rot });
    }
  }

  async function reload() {
    try { state.fixtures = await lumox.patch.list(); } catch { state.fixtures = []; }
    const placed: string[] = [];
    state.fixtures.forEach((f, i) => {
      if (state.pos.has(f.id)) return;
      const t = f.transform ?? { x: 0, y: 0, rotation: 0 };
      // A fixture still at the origin has never been placed — auto-arrange it into
      // a grid and persist, so the engine has real world coords for MATRIX FX.
      if (t.x === 0 && t.y === 0 && t.rotation === 0) {
        state.pos.set(f.id, { x: 2 + (i % 8) * 6, y: 2 + Math.floor(i / 8) * 6, rot: 0 });
        placed.push(f.id);
      } else {
        state.pos.set(f.id, { x: t.x, y: t.y, rot: t.rotation });
      }
    });
    const ids = new Set(state.fixtures.map((f) => f.id));
    for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
    for (const id of [...state.pos.keys()]) if (!ids.has(id)) state.pos.delete(id);
    render();
    if (placed.length) persist(placed);
  }

  // Per-fixture live-colour plan: map each emitter (in geometry order) to its
  // RGB DMX addresses (universe-absolute), plus a master dimmer if present. A
  // single-colour fixture lights every dot from its one RGB set.
  function buildPlan(f: any): ColorPlan {
    const localOf = (tid: string): number[] => (f.channels as any[]).filter((c) => c.typeId === tid).map((c) => c.index);
    const reds = localOf('red'), greens = localOf('green'), blues = localOf('blue');
    const ncol = Math.min(reds.length, greens.length, blues.length);
    const abs = (i: number) => f.startAddress + i - 1;
    const g = emitterGrid(f);
    const cells: ({ r: number; g: number; b: number } | null)[] = [];
    for (let k = 0; k < g.n; k++) {
      const j = k < ncol ? k : (ncol === 1 ? 0 : -1);
      cells.push(j >= 0 ? { r: abs(reds[j]), g: abs(greens[j]), b: abs(blues[j]) } : null);
    }
    const m = (f.channels as any[]).find((c) => c.typeId === 'intensity' || c.typeId === 'intensity-master' || c.typeId === 'dimmer');
    return { uid: f.universeId, groupColor: f.color || '#6b6b6b', master: m ? abs(m.index) : 0, cells };
  }

  // ---- render -----------------------------------------------------------
  function render() {
    const list = shown();
    state.dim.clear();
    state.plan.clear();
    canvas.innerHTML = list.map((f) => {
      const p = state.pos.get(f.id) ?? { x: 0, y: 0, rot: 0 };
      const g = emitterGrid(f);
      const w = g.width * zoom, h = g.height * zoom;
      state.dim.set(f.id, { w, h });
      state.plan.set(f.id, buildPlan(f));
      const sel = state.selected.has(f.id) ? ' sel' : '';
      const hl = state.highlight !== 'all' && f.groupId === state.highlight ? ' hl' : '';
      const dim = state.highlight !== 'all' && f.groupId !== state.highlight ? ' dim' : '';
      // Position every emitter by its local coordinate / footprint (one path for
      // both positioned layouts and plain grids).
      const emitters = emitterLocalPositions(f).map((c) =>
        `<i class="st-em" style="left:${(c.x / g.width * 100).toFixed(1)}%;top:${(c.y / g.height * 100).toFixed(1)}%"></i>`).join('');
      return `<div class="st-node${sel}${hl}${dim}" data-fx="${f.id}"
        style="left:${p.x * zoom}px;top:${p.y * zoom}px;width:${w}px;height:${h}px;transform:rotate(${p.rot}deg);--fx:${esc(f.color || '#6b6b6b')}"
        title="${esc(f.name)} · @${f.startAddress} · ${g.n} emitter${g.n === 1 ? '' : 's'}">
        <span class="st-addr">${f.startAddress}</span>
        <div class="st-emitters">${emitters}</div>
        <button class="st-rot" title="Rotate (or Ctrl-drag the fixture)"><i class="fa-solid fa-rotate"></i></button>
      </div>`;
    }).join('');
  }

  // ---- shared helpers ---------------------------------------------------
  function selectOnly(id: string) { state.selected.clear(); state.selected.add(id); }
  // Broadcast the selection so the patch grid mirrors + highlights it (and vice
  // versa). `src` tags the origin so a tile ignores its own echo (no loop).
  const emitSelection = () => bus.emit(EV.FIXTURE_SELECTED, { ids: [...state.selected], src: 'stage' });
  // Always snap; the fine toggle just shrinks the step for precise placement.
  const snap = (v: number) => { const s = state.fine ? FINE : COARSE; return Math.round(v / s) * s; };

  // Live-apply position + rotation without re-rendering (keeps the marquee div).
  function applyNodeStyles() {
    canvas.querySelectorAll('.st-node').forEach((el) => {
      const node = el as HTMLElement;
      const p = state.pos.get(node.dataset.fx as string);
      if (p) { node.style.left = `${p.x * zoom}px`; node.style.top = `${p.y * zoom}px`; node.style.transform = `rotate(${p.rot}deg)`; }
    });
  }

  // ---- selection tools --------------------------------------------------
  function selectAll() { state.selected = new Set(shown().map((f) => f.id)); render(); emitSelection(); }
  function selectNone() { state.selected.clear(); render(); emitSelection(); }
  function invertSelection() {
    state.selected = new Set(shown().filter((f) => !state.selected.has(f.id)).map((f) => f.id));
    render(); emitSelection();
  }

  // ---- zoom (px per world unit) -----------------------------------------
  const zoomLbl = tile.querySelector('.st-zlbl') as HTMLElement;
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  // Push the zoom into the grid + emitter-dot CSS vars and re-render (node
  // footprints are sized in JS from `zoom`).
  function applyZoom() {
    canvas.style.setProperty('--cell', `${zoom}px`);
    canvas.style.setProperty('--em', `${Math.max(4, zoom * 0.62).toFixed(1)}px`);
    zoomLbl.textContent = `${Math.round((zoom / DEFAULT_ZOOM) * 100)}%`;
    render();
  }
  // Zoom to `z`, keeping the world point under `anchor` (canvas-relative px)
  // fixed on screen — anchor defaults to the viewport centre.
  function setZoom(z: number, anchor?: { x: number; y: number }) {
    z = clampZoom(z);
    if (z === zoom) return;
    const r = canvas.getBoundingClientRect();
    const ax = anchor ? anchor.x : r.width / 2, ay = anchor ? anchor.y : r.height / 2;
    const wx = (canvas.scrollLeft + ax) / zoom, wy = (canvas.scrollTop + ay) / zoom;
    zoom = z;
    applyZoom();
    canvas.scrollLeft = wx * zoom - ax;
    canvas.scrollTop = wy * zoom - ay;
  }

  // ---- live emitter colour (mixed DMX output) ---------------------------
  // Poll the universes the rig spans and paint each emitter its live colour
  // (RGB × master dimmer), with a glow when lit; off emitters fall back to a dim
  // group tint so the footprint stays readable. Gated on visibility.
  async function pollColors() {
    const uids = [...new Set(state.fixtures.map((f) => f.universeId))];
    const datas = await Promise.all(uids.map((u) => lumox.universes.read(u).catch(() => null)));
    const byUid = new Map(uids.map((u, i) => [u, datas[i]]));
    canvas.querySelectorAll('.st-node').forEach((el) => {
      const node = el as HTMLElement;
      const plan = state.plan.get(node.dataset.fx as string);
      const data = plan && byUid.get(plan.uid);
      if (!plan || !data) return;
      const m = plan.master ? (data[plan.master - 1] ?? 0) / 255 : 1;
      const dots = node.querySelectorAll('.st-em');
      dots.forEach((d, k) => {
        const dot = d as HTMLElement;
        const cell = plan.cells[k];
        let r = 0, g = 0, b = 0;
        if (cell) { r = (data[cell.r - 1] ?? 0) * m; g = (data[cell.g - 1] ?? 0) * m; b = (data[cell.b - 1] ?? 0) * m; }
        const lum = Math.max(r, g, b);
        if (lum < 6) {
          if (cell) { dot.style.background = '#141414'; dot.style.boxShadow = 'inset 0 0 2px rgba(255,255,255,.12)'; }
          else { dot.style.background = `color-mix(in srgb, ${plan.groupColor} ${plan.master ? Math.round(m * 70) : 22}%, #111)`; dot.style.boxShadow = 'inset 0 0 2px rgba(255,255,255,.12)'; }
        } else {
          const c = `rgb(${r | 0},${g | 0},${b | 0})`;
          dot.style.background = c;
          dot.style.boxShadow = `0 0 ${Math.min(11, 3 + lum / 28).toFixed(1)}px ${c}`;
        }
      });
    });
  }
  let colorTimer: ReturnType<typeof setInterval> | null = null;
  const stopPoll = () => { if (colorTimer) { clearInterval(colorTimer); colorTimer = null; } };
  const startPoll = () => { if (!colorTimer) { void pollColors(); colorTimer = setInterval(() => void pollColors(), COLOR_POLL_MS); } };
  new IntersectionObserver((es) => { es.some((e) => e.isIntersecting) ? startPoll() : stopPoll(); }).observe(tile);

  // Pointer position in canvas-content px (accounts for scroll).
  function canvasPx(e: MouseEvent): { x: number; y: number } { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left + canvas.scrollLeft, y: e.clientY - r.top + canvas.scrollTop }; }

  // ---- move drag --------------------------------------------------------
  let drag: { start: { x: number; y: number }; origin: Map<string, Pos>; moved: boolean } | null = null;
  function startDrag(e: MouseEvent, el: HTMLElement) {
    e.preventDefault();
    const id = el.dataset.fx as string;
    if (e.shiftKey || e.metaKey) {                    // Ctrl is reserved for rotate
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
    } else if (!state.selected.has(id)) {
      selectOnly(id);
    }
    render();
    emitSelection();
    const origin = new Map([...state.selected].map((sid) => [sid, { ...state.pos.get(sid) } as Pos]));
    drag = { start: canvasPx(e), origin, moved: false };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }
  function onDrag(e: MouseEvent) {
    if (!drag) return;
    const pt = canvasPx(e);
    const dx = (pt.x - drag.start.x) / zoom, dy = (pt.y - drag.start.y) / zoom;   // px → world
    if (Math.abs(dx) + Math.abs(dy) > 0.1) drag.moved = true;
    for (const [id, o] of drag.origin) {
      state.pos.set(id, { x: Math.max(0, o.x + dx), y: Math.max(0, o.y + dy), rot: o.rot });
    }
    applyNodeStyles();
  }
  function endDrag() {
    if (drag?.moved) {
      for (const id of state.selected) {                 // always snap to the grid
        const p = state.pos.get(id) as Pos;
        state.pos.set(id, { x: snap(p.x), y: snap(p.y), rot: p.rot });
      }
      applyNodeStyles();
      persist(state.selected);
    }
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    drag = null;
  }

  // ---- rotation (Ctrl-drag on a node, or drag the edge handle) ----------
  // Every selected fixture spins around its own centre by the same angular delta.
  let rot: { cx: number; cy: number; startAng: number; origin: Map<string, number> } | null = null;
  function startRotate(e: MouseEvent, el: HTMLElement) {
    e.preventDefault(); e.stopPropagation();
    const id = el.dataset.fx as string;
    if (!state.selected.has(id)) { selectOnly(id); render(); emitSelection(); }
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const origin = new Map([...state.selected].map((sid) => [sid, state.pos.get(sid)?.rot ?? 0]));
    rot = { cx, cy, startAng: Math.atan2(e.clientY - cy, e.clientX - cx), origin };
    document.addEventListener('mousemove', onRotate);
    document.addEventListener('mouseup', endRotate);
  }
  function onRotate(e: MouseEvent) {
    if (!rot) return;
    const ang = Math.atan2(e.clientY - rot.cy, e.clientX - rot.cx);
    const deg = (ang - rot.startAng) * 180 / Math.PI;
    for (const [id, o] of rot.origin) {
      let v = o + deg;
      if (e.shiftKey) v = Math.round(v / 15) * 15;   // Shift snaps to 15°
      const p = state.pos.get(id) as Pos;
      state.pos.set(id, { ...p, rot: Math.round(v) });
    }
    applyNodeStyles();
  }
  function endRotate() {
    document.removeEventListener('mousemove', onRotate);
    document.removeEventListener('mouseup', endRotate);
    if (rot) persist(state.selected);
    rot = null;
  }

  // ---- marquee (rubber-band) selection ----------------------------------
  let band: { start: { x: number; y: number }; base: Set<string>; box: HTMLElement } | null = null;
  function startMarquee(e: MouseEvent) {
    const start = canvasPx(e);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? new Set(state.selected) : new Set<string>();
    if (!additive) { state.selected.clear(); render(); }   // render() first, then add the band
    const box = document.createElement('div');
    box.className = 'st-marquee';
    canvas.appendChild(box);
    band = { start, base, box };
    document.addEventListener('mousemove', onMarquee);
    document.addEventListener('mouseup', endMarquee);
  }
  function onMarquee(e: MouseEvent) {
    if (!band) return;
    const pt = canvasPx(e);
    const x = Math.min(band.start.x, pt.x), y = Math.min(band.start.y, pt.y);
    const w = Math.abs(pt.x - band.start.x), h = Math.abs(pt.y - band.start.y);
    Object.assign(band.box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    const next = new Set(band.base);
    for (const f of shown()) {
      const p = state.pos.get(f.id), d = state.dim.get(f.id);
      if (!p || !d) continue;
      const px = p.x * zoom, py = p.y * zoom;
      if (px < x + w && px + d.w > x && py < y + h && py + d.h > y) next.add(f.id);
    }
    canvas.querySelectorAll('.st-node').forEach((el) =>
      (el as HTMLElement).classList.toggle('sel', next.has((el as HTMLElement).dataset.fx as string)));
    state.selected = next;
  }
  function endMarquee() {
    band?.box.remove();
    band = null;
    document.removeEventListener('mousemove', onMarquee);
    document.removeEventListener('mouseup', endMarquee);
    render();
    emitSelection();
  }

  // Delegated mousedown — bound once on the canvas (survives every render()).
  canvas.addEventListener('mousedown', (e) => {
    const ev = e as MouseEvent;
    const t = ev.target as HTMLElement;
    const handle = t.closest('.st-rot') as HTMLElement | null;
    if (handle) { startRotate(ev, handle.closest('.st-node') as HTMLElement); return; }
    const node = t.closest('.st-node') as HTMLElement | null;
    if (node) {
      if (ev.ctrlKey || ev.altKey) startRotate(ev, node);   // Ctrl/Alt-drag rotates
      else startDrag(ev, node);
      return;
    }
    startMarquee(ev);   // empty canvas → rubber-band select
  });

  // ---- alignment / distribution ---------------------------------------
  const selPos = () => [...state.selected].map((id) => ({ id, ...state.pos.get(id) } as { id: string; x: number; y: number; rot: number })).filter((p) => p.x != null);

  function align(kind: string) {
    const ps = selPos();
    if (ps.length < 2) return;
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    for (const p of ps) {
      const np = { ...state.pos.get(p.id) } as Pos;
      if (kind === 'left') np.x = minX;
      else if (kind === 'right') np.x = maxX;
      else if (kind === 'hcenter') np.x = (minX + maxX) / 2;
      else if (kind === 'top') np.y = minY;
      else if (kind === 'bottom') np.y = maxY;
      else if (kind === 'vcenter') np.y = (minY + maxY) / 2;
      state.pos.set(p.id, np);
    }
    render();
    persist(ps.map((p) => p.id));
  }

  function distribute(axis: string) {
    const ps = selPos();
    if (ps.length < 3) return;
    const key = axis === 'h' ? 'x' : 'y';
    ps.sort((a, b) => (a as any)[key] - (b as any)[key]);
    const lo = (ps[0] as any)[key], hi = (ps[ps.length - 1] as any)[key];
    const step = (hi - lo) / (ps.length - 1);
    ps.forEach((p, i) => {
      const np = { ...state.pos.get(p.id) } as any;
      np[key] = lo + step * i;
      state.pos.set(p.id, np);
    });
    render();
    persist(ps.map((p) => p.id));
  }

  function arrange() {
    const list = state.selected.size ? shown().filter((f) => state.selected.has(f.id)) : shown();
    const cols = Math.ceil(Math.sqrt(list.length)) || 1;
    list.forEach((f, i) => {
      const rotv = state.pos.get(f.id)?.rot ?? 0;
      state.pos.set(f.id, { x: 2 + (i % cols) * 6, y: 2 + Math.floor(i / cols) * 6, rot: rotv });
    });
    render();
    persist(list.map((f) => f.id));
  }

  function resetRotation() {
    const ids = state.selected.size ? [...state.selected] : shown().map((f) => f.id);
    for (const id of ids) { const p = state.pos.get(id); if (p) state.pos.set(id, { ...p, rot: 0 }); }
    render();
    persist(ids);
  }

  tile.querySelectorAll('[data-sel]').forEach((b) => {
    const btn = b as HTMLElement;
    btn.addEventListener('click', () => { const k = btn.dataset.sel; if (k === 'all') selectAll(); else if (k === 'none') selectNone(); else invertSelection(); });
  });
  tile.querySelectorAll('[data-al]').forEach((b) => { const btn = b as HTMLElement; btn.addEventListener('click', () => align(btn.dataset.al as string)); });
  tile.querySelectorAll('[data-dist]').forEach((b) => { const btn = b as HTMLElement; btn.addEventListener('click', () => distribute(btn.dataset.dist as string)); });
  (tile.querySelector('[data-act="arrange"]') as HTMLElement).addEventListener('click', arrange);
  (tile.querySelector('[data-act="rot-reset"]') as HTMLElement).addEventListener('click', resetRotation);
  const fineBtn = tile.querySelector('[data-act="fine"]') as HTMLElement;
  fineBtn.addEventListener('click', () => { state.fine = !state.fine; fineBtn.classList.toggle('active', state.fine); canvas.classList.toggle('fine', state.fine); });

  // zoom — toolbar buttons + Ctrl/⌘ + wheel (zooms toward the cursor; plain
  // wheel keeps the native scroll of the overflowing canvas).
  tile.querySelectorAll('[data-zoom]').forEach((b) => {
    const btn = b as HTMLElement;
    btn.addEventListener('click', () => { const k = btn.dataset.zoom; if (k === 'in') setZoom(zoom * 1.25); else if (k === 'out') setZoom(zoom / 1.25); else setZoom(DEFAULT_ZOOM); });
  });
  canvas.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });

  // Delete the selected fixtures from the patch (engine is the source of truth);
  // the PATCH_CHANGED broadcast re-renders the stage, patch grid and groups.
  async function removeSelected() {
    const ids = [...state.selected];
    if (!ids.length) return;
    state.selected.clear();
    emitSelection();
    for (const id of ids) { try { await lumox.patch.remove(id); } catch { /* ignore */ } }
    bus.emit(EV.PATCH_CHANGED);
    bus.emit(EV.GROUPS_CHANGED);
  }

  // Delete / Backspace removes the selection — scoped to the SETUP tab (the stage
  // tile is shared with CONTROL, where Delete belongs to the Banks scene list).
  const inSetup = () =>
    !tile.classList.contains('hidden') &&
    document.querySelector('.tb-tab.active')?.getAttribute('data-tab') === 'setup' &&
    state.selected.size > 0;
  onShortcut({ key: 'Delete' }, removeSelected, inSetup);
  onShortcut({ key: 'Backspace' }, removeSelected, inSetup);
  // Ctrl+A selects every fixture (works with an empty selection, so it has its
  // own SETUP-tab gate rather than reusing `inSetup`).
  const stageActive = () =>
    !tile.classList.contains('hidden') &&
    document.querySelector('.tb-tab.active')?.getAttribute('data-tab') === 'setup';
  onShortcut({ key: 'a', ctrl: true }, selectAll, stageActive);

  // react to patch + group selection
  bus.on(EV.PATCH_CHANGED, reload);
  bus.on(EV.GROUPS_CHANGED, reload);
  bus.on(EV.GROUP_SELECTED, (id) => { state.highlight = id; render(); });
  // mirror a selection made elsewhere (the patch grid) — ignore our own echo.
  bus.on(EV.FIXTURE_SELECTED, (d: { ids: string[]; src: string }) => {
    if (!d || d.src === 'stage') return;
    state.selected = new Set(d.ids);
    render();
  });

  applyZoom();   // seed the grid/dot CSS vars + label before the first render
  await reload();
  return { tile, refresh: reload };
}
