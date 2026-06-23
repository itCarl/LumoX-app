// Stage tile — top-down 2D view of the rig on a FIXED-SIZE stage. Each fixture is
// a draggable footprint showing its real emitters; the picture is the engine's
// pixel-map, so MATRIX FX read each emitter's world position from here.
//
// The stage is a bounded box of STAGE_SIZE world units (1 unit = one emitter cell);
// fixtures live inside it. Coordinates here are raw WORLD units (the space the engine
// consumes); positions are *persisted normalised* to the box (0..1 per axis) in
// `Fixture.toJSON` and restored to world units on load, so this tile never sees the
// normalised form — it pushes world units via `lumox.patch.setTransform`. The tile
// renders at an adjustable zoom (px/unit) and pans within the box (Hand tool, or a
// middle-mouse-button drag from any tool; the wheel zooms).
// Fixtures can be marquee-selected, drag-moved, rotated, and aligned / distributed.

import { bus, EV } from '../lib/bus';
import { activeGroup } from '../lib/store';
import { effect } from '@preact/signals-core';
import { esc } from '../lib/html';
import { openMenu, closeMenu, type MenuItem } from '../lib/widgets';
import { onShortcut } from '../lib/keys';
import { emitterGrid, emitterLocalPositions, STAGE_SIZE } from '../../src/fixtures/emitterGeometry';
import { goboSvg, hasGobo } from '../lib/gobo';

const { lumox } = window;
const STAGE_W = STAGE_SIZE.width, STAGE_H = STAGE_SIZE.height;   // fixed stage extent (world units)
const DEFAULT_ZOOM = 24;   // px per world unit (emitter cell) — fixtures start zoomed in
const MIN_ZOOM = 12;       // furthest out (0.5× the default — fits the whole stage box in view)
const MAX_ZOOM = 48;       // closest in (2× the default — magnify a single fixture)
// World units of empty margin around the fixed stage box inside the scrollable
// world, so the Hand tool has a little room to pan past the stage edges when zoomed.
const PAD = 4;
const COARSE = 1;          // default snap grid (world units = whole cells)
const FINE = 0.25;         // fine snap grid (quarter cell) for precise placement
const COLOR_POLL_MS = 66;  // live emitter-colour readback cadence (~15 fps)

interface Pos { x: number; y: number; rot: number; }   // world units + degrees
interface Dim { w: number; h: number; }                  // footprint in px (for hit-testing)
// Live-colour plan for a fixture: per-emitter RGB addresses (or null) + master dimmer.
// `master` is the fixture-wide dimmer (used for the off-emitter tint); each cell
// also carries its own `m` dimmer address (per-segment bars/matrices), falling
// back to the fixture master. 0 = no dimmer governs it (treated as full).
// `gobo` (when the fixture has a gobo wheel) maps the wheel's DMX address to its
// authored slots, so the stage can overlay the live gobo's drawn pattern on the
// footprint whenever a non-open slot is selected (moving heads / scanners).
// `wheel` (a colour wheel, for fixtures with NO RGB) maps the wheel's DMX address
// to its colour stops, so colour-wheel movers show their live projected colour
// (scaled by the master dimmer) instead of falling back to the flat group tint.
interface GoboPlan { addr: number; caps: { min: number; max: number; pattern: string | null }[]; }
interface WheelStop { min: number; max: number; r: number; g: number; b: number; }
interface ColorWheelPlan { addr: number; stops: WheelStop[]; }
interface ColorPlan { uid: number; master: number; cells: ({ r: number; g: number; b: number; m: number } | null)[]; gobo: GoboPlan | null; wheel: ColorWheelPlan | null; }
// Neutral grey an unlit emitter falls back to — fixtures carry no colour identity
// (they're told apart by their number badge), so the off-tint is uniform.
const OFF_TINT = '#6b6b6b';

// Parse a "#rrggbb" hex (the only form profile colour caps use) to RGB bytes.
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// The colour stop a wheel value lands on, or the nearest one (so the colour-scroll
// effect ranges between stops still read as a plausible colour rather than blank).
function wheelStop(wheel: ColorWheelPlan, v: number): WheelStop | null {
  let best: WheelStop | null = null, bestD = Infinity;
  for (const s of wheel.stops) {
    if (v >= s.min && v <= s.max) return s;
    const d = Math.abs((s.min + s.max) / 2 - v);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export async function makeStageTile(): Promise<{ tile: HTMLElement; refresh: () => Promise<void>; setMode: (tab: string) => void }> {
  const tile = document.createElement('section');
  tile.className = 'tile stage-tile';
  tile.innerHTML = `
    <div class="tile-head st-head">
      <span class="st-grp st-tool" title="Tools">
        <button data-tool="select" class="active" title="Select / move (V)"><i class="fa-solid fa-arrow-pointer"></i></button>
        <button data-tool="rect" title="Rectangular select (M)"><i class="fa-solid fa-object-group"></i></button>
        <button data-tool="lasso" title="Lasso — freeform select (L)"><i class="fa-solid fa-draw-polygon"></i></button>
        <button data-tool="pan" title="Hand — pan the canvas (H)"><i class="fa-solid fa-hand"></i></button>
      </span>
      <span class="st-grp st-grid st-pos" title="Arrange">
        <button data-act="arrange" title="Arrange in a grid"><i class="fa-solid fa-table-cells"></i></button>
        <button data-act="arrange-line" title="Arrange in a line"><i class="fa-solid fa-grip-lines"></i></button>
        <button data-act="arrange-circle" title="Arrange in a circle"><i class="fa-solid fa-circle-notch"></i></button>
        <button data-act="fine" title="Fine grid — precise placement"><i class="fa-solid fa-ruler-combined"></i></button>
        <button data-act="reset-stage" title="Reset stage — re-centre all fixtures & clear rotation"><i class="fa-solid fa-arrows-to-dot"></i></button>
      </span>
      <div class="st-tools">
        <span class="st-grp st-view" title="View">
          <button data-view="gobos" title="Show active gobos on fixtures"><i class="fa-solid fa-compact-disc"></i></button>
        </span>
        <span class="st-grp st-zoom" title="Zoom">
          <button data-zoom="out" title="Zoom out (mouse wheel)"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
          <input type="range" class="st-zslider" min="0" max="1000" step="1" value="500" title="Zoom — double-click to reset" />
          <button data-zoom="in" title="Zoom in (mouse wheel)"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
          <button data-zoom="fit" title="Fit all fixtures to view"><i class="fa-solid fa-expand"></i></button>
        </span>
      </div>
    </div>
    <div class="tile-body st-body">
      <div class="st-rail">
        <span class="st-grp st-grp-v" title="Select">
          <button data-sel="all" title="Select all (Ctrl+A)"><i class="fa-solid fa-border-all"></i></button>
          <button data-sel="none" title="Deselect all"><i class="fa-solid fa-border-none"></i></button>
          <button data-sel="invert" title="Invert selection"><i class="fa-solid fa-circle-half-stroke"></i></button>
        </span>
        <span class="st-grp st-grp-v" title="Thin selection — keep every Nth">
          <button data-sel="half" class="st-frac" title="Keep every 2nd (½)">½</button>
          <button data-sel="third" class="st-frac" title="Keep every 3rd (⅓)">⅓</button>
          <button data-sel="quarter" class="st-frac" title="Keep every 4th (¼)">¼</button>
        </span>
        <span class="st-grp st-grp-v" title="Shift selection by one">
          <button data-act="shift-back" title="Shift selection back"><i class="fa-solid fa-backward-step"></i></button>
          <button data-act="shift-fwd" title="Shift selection forward"><i class="fa-solid fa-forward-step"></i></button>
        </span>
        <span class="st-grp st-grp-v" title="Selection order (drives FX fan)">
          <button data-act="order-invert" title="Invert order — reverse the index sequence"><i class="fa-solid fa-arrow-down-up-across-line"></i></button>
          <button data-act="order-mirror" title="Symmetry — mirror order for a symmetric fan"><i class="fa-solid fa-left-right"></i></button>
        </span>
        <span class="st-rail-sep st-pos"></span>
        <span class="st-grp st-grp-v st-pos" title="Align horizontally">
          <button data-al="left"   title="Align left"><i class="fa-solid fa-arrows-up-to-line fa-rotate-270"></i></button>
          <button data-al="hcenter" title="Center horizontally"><i class="fa-solid fa-arrows-left-right-to-line"></i></button>
          <button data-al="right"  title="Align right"><i class="fa-solid fa-arrows-up-to-line fa-rotate-90"></i></button>
        </span>
        <span class="st-grp st-grp-v st-pos" title="Align vertically">
          <button data-al="top"    title="Align top"><i class="fa-solid fa-arrows-up-to-line"></i></button>
          <button data-al="vcenter" title="Center vertically"><i class="fa-solid fa-arrows-left-right-to-line fa-rotate-90"></i></button>
          <button data-al="bottom" title="Align bottom"><i class="fa-solid fa-arrows-down-to-line"></i></button>
        </span>
        <span class="st-grp st-grp-v st-pos" title="Distribute">
          <button data-dist="h" title="Distribute horizontally"><i class="fa-solid fa-arrows-left-right"></i></button>
          <button data-dist="v" title="Distribute vertically"><i class="fa-solid fa-arrows-up-down"></i></button>
        </span>
        <span class="st-grp st-grp-v st-pos" title="Rotation">
          <button data-act="rot-reset" title="Reset rotation"><i class="fa-solid fa-rotate-left"></i></button>
        </span>
      </div>
      <div id="st-canvas" class="st-canvas"><div id="st-world" class="st-world"></div></div>
      <div class="st-rail st-rail-r">
        <button class="st-sv-toggle" title="Collapse / expand saved selections"><i class="fa-solid fa-chevron-right"></i><span class="st-sv-cap">Selections</span></button>
        <div class="st-sv-body">
          <button class="st-sv-save" title="Save the current selection as a named selection"><i class="fa-solid fa-plus"></i> Save</button>
          <div class="st-sv-list"></div>
        </div>
      </div>
    </div>`;

  const canvas = tile.querySelector('#st-canvas') as HTMLElement;   // scroll viewport
  const world = canvas.querySelector('#st-world') as HTMLElement;    // pannable content layer
  let zoom = DEFAULT_ZOOM;   // current px per world unit (mutated by the zoom controls)
  // px offset of the world's content origin from the scroll origin = the pan margin.
  const off = () => PAD * zoom;

  const state = {
    fixtures: [] as any[],
    highlight: 'all',              // 'all' | groupId — highlights, never filters
    pos: new Map<string, Pos>(),   // fxId → {x,y,rot} in world units
    dim: new Map<string, Dim>(),   // fxId → footprint px {w,h}
    plan: new Map<string, ColorPlan>(), // fxId → live-colour plan
    selected: new Set<string>(),
    saved: [] as { id: string; name: string; fixtureIds: string[] }[],   // named selections
    fine: false,                   // fine snap grid (always snaps; this just halves the step)
    showGobos: false,              // overlay each fixture's live active gobo on its footprint (off by default)
    tool: 'select' as 'select' | 'rect' | 'lasso' | 'pan',   // active canvas interaction mode
    // The stage is shared between tabs: SETUP positions fixtures (move/rotate/resize/
    // arrange), CONTROL is selection-only — you pick fixtures to program, never move
    // them. `setMode` (called from the tab switch) hides the positioning controls and
    // disables those gestures in CONTROL.
    mode: 'setup' as 'setup' | 'control',
  };

  function shown() { return state.fixtures; }   // always show all fixtures

  // Push one or more fixtures' transforms back to the engine (source of truth).
  function persist(ids: Iterable<string>) {
    for (const id of ids) {
      const p = state.pos.get(id);
      if (p) lumox.patch.setTransform(id, { x: p.x, y: p.y, rotation: p.rot });
    }
  }

  // Push the deterministic auto-layout of never-placed fixtures to the engine on
  // load. Uses the TRANSIENT `placeInitial` channel so this derived placement
  // does NOT dirty the project (otherwise every fresh load would be dirty).
  function persistInitial(ids: Iterable<string>) {
    for (const id of ids) {
      const p = state.pos.get(id);
      if (p) lumox.patch.placeInitial(id, { x: p.x, y: p.y, rotation: p.rot });
    }
  }

  // Auto-layout: pack fixtures left-to-right by their real footprint (+1-cell
  // gap), wrapping after `perRow`; each new row drops below the tallest footprint
  // above it. Tighter than a fixed grid, so small fixtures sit close together.
  const PACK_GAP = 1, PACK_MARGIN = 1;
  function packLayout(list: any[], perRow: number, rotOf: (f: any) => number): Map<string, Pos> {
    const out = new Map<string, Pos>();
    let x = PACK_MARGIN, y = PACK_MARGIN, rowH = 0, col = 0;
    for (const f of list) {
      if (col >= perRow) { x = PACK_MARGIN; y += rowH + PACK_GAP; rowH = 0; col = 0; }
      const g = emitterGrid(f);
      out.set(f.id, { x, y, rot: rotOf(f) });
      x += Math.ceil(g.width) + PACK_GAP;
      rowH = Math.max(rowH, Math.ceil(g.height));
      col++;
    }
    return out;
  }

  // Place never-positioned fixtures CLUSTERED around the stage centre: pack them
  // into a compact near-square block, then translate it so the block's centre is
  // the stage's centre. One fixture lands dead centre; a batch fans out around it.
  function centerCluster(list: any[]): Map<string, Pos> {
    const packed = packLayout(list, Math.max(1, Math.ceil(Math.sqrt(list.length))), () => 0);
    let maxX = 0, maxY = 0;
    for (const f of list) {
      const p = packed.get(f.id) as Pos, g = emitterGrid(f);
      maxX = Math.max(maxX, p.x + g.width); maxY = Math.max(maxY, p.y + g.height);
    }
    const dx = (STAGE_W - maxX) / 2, dy = (STAGE_H - maxY) / 2;
    const out = new Map<string, Pos>();
    for (const f of list) { const p = packed.get(f.id) as Pos; out.set(f.id, { x: p.x + dx, y: p.y + dy, rot: 0 }); }
    return out;
  }

  async function reload() {
    try { state.fixtures = await lumox.patch.list(); } catch { state.fixtures = []; }
    try { state.saved = await lumox.selections.list(); } catch { state.saved = []; }
    renderSavedPop();
    const placed: string[] = [];
    const toPlace: any[] = [];
    for (const f of state.fixtures) {
      if (state.pos.has(f.id)) continue;
      const t = f.transform ?? { x: 0, y: 0, rotation: 0 };
      // A fixture still at the origin has never been placed — drop it in the centre
      // of the stage (and push to the engine, without dirtying) so it has real world
      // coords for MATRIX FX.
      if (t.x === 0 && t.y === 0 && t.rotation === 0) toPlace.push(f);
      else state.pos.set(f.id, { x: t.x, y: t.y, rot: t.rotation });
    }
    if (toPlace.length) {
      const placedPos = centerCluster(toPlace);
      for (const f of toPlace) { state.pos.set(f.id, placedPos.get(f.id) as Pos); placed.push(f.id); }
    }
    const ids = new Set(state.fixtures.map((f) => f.id));
    for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
    for (const id of [...state.pos.keys()]) if (!ids.has(id)) state.pos.delete(id);
    render();
    if (placed.length) persistInitial(placed);
  }

  // Per-fixture live-colour plan: map each emitter (in geometry order) to its
  // RGB DMX addresses (universe-absolute) plus the dimmer that governs it. With
  // explicit head groups (`f.heads`) each cell's roles are detected among that
  // head's channels (so the picture matches the engine's head-aware mixing).
  // Otherwise a single-colour fixture lights every dot from its one RGB set; a
  // bar/matrix with one *real* dimmer per segment (`intens.length === ncol`)
  // dims each segment from its own — otherwise a lone dimmer is the shared master.
  // VIRTUAL dimmers are excluded: they live in the virtual region (not the wire
  // buffer this reads) and the engine has already scaled the cluster's wire RGB
  // by them, so treating one as a master would double-apply and (worse) read a
  // bogus wire address — which left RGB-only bars/PARs dark or partly lit.
  function buildPlan(f: any): ColorPlan {
    const isDimmer = (c: any) => c.isIntensity && !c.isVirtual;
    const abs = (i: number) => f.startAddress + i - 1;
    const chans = f.channels as any[];
    const intensAll = chans.filter(isDimmer).map((c) => c.index);
    const fixtureMaster = intensAll.length ? abs(intensAll[0]) : 0;   // off-tint + fallback dimmer
    const cells: ({ r: number; g: number; b: number; m: number } | null)[] = [];

    const heads = f.heads as number[][] | null | undefined;
    if (heads?.length) {
      // One cell per head with a complete R/G/B (matches Fixture.resolveHeads); a
      // head's own intensity channel dims it, else the fixture master does.
      const byIndex = new Map<number, any>(chans.map((c) => [c.index, c]));
      for (const group of heads) {
        const role = (tid: string) => group.find((i) => byIndex.get(i)?.typeId === tid);
        const r = role('red'), gr = role('green'), b = role('blue');
        if (!r || !gr || !b) continue;
        const dim = group.find((i) => { const c = byIndex.get(i); return c && isDimmer(c); });
        cells.push({ r: abs(r), g: abs(gr), b: abs(b), m: dim ? abs(dim) : fixtureMaster });
      }
    } else {
      const localOf = (tid: string): number[] => chans.filter((c) => c.typeId === tid).map((c) => c.index);
      const reds = localOf('red'), greens = localOf('green'), blues = localOf('blue');
      const ncol = Math.min(reds.length, greens.length, blues.length);
      const perCell = intensAll.length === ncol && ncol > 0;   // one dimmer per colour cluster
      const g = emitterGrid(f);
      for (let k = 0; k < g.n; k++) {
        const j = k < ncol ? k : (ncol === 1 ? 0 : -1);
        cells.push(j >= 0 ? { r: abs(reds[j]), g: abs(greens[j]), b: abs(blues[j]), m: perCell ? abs(intensAll[j]) : fixtureMaster } : null);
      }
    }
    // Gobo wheel: the first channel whose presets carry a drawn pattern (an "Open"
    // slot has a null pattern, so a channel with ANY drawn slot is the gobo wheel).
    const goboChan = chans.find((c) => Array.isArray(c.caps) && c.caps.some((cap: any) => typeof cap.pattern === 'string'));
    const gobo: GoboPlan | null = goboChan ? { addr: abs(goboChan.index), caps: goboChan.caps } : null;
    // Colour wheel: the channel whose presets carry colour swatches (a colour-wheel
    // fixture has no RGB channels, so without this its emitter would only ever show
    // the group tint). Only used to paint cells that have no RGB source of their own.
    const wheelChan = chans.find((c) => Array.isArray(c.caps) && c.caps.some((cap: any) => typeof cap.color === 'string'));
    let wheel: ColorWheelPlan | null = null;
    if (wheelChan) {
      const stops = (wheelChan.caps as any[])
        .map((cap) => { const rgb = typeof cap.color === 'string' ? parseHex(cap.color) : null; return rgb ? { min: cap.min, max: cap.max, r: rgb[0], g: rgb[1], b: rgb[2] } : null; })
        .filter(Boolean) as WheelStop[];
      if (stops.length) wheel = { addr: abs(wheelChan.index), stops };
    }
    return { uid: f.universeId, master: fixtureMaster, cells, gobo, wheel };
  }

  // ---- render -----------------------------------------------------------
  function render() {
    const list = shown();
    state.dim.clear();
    state.plan.clear();
    const selOrder = [...state.selected];   // insertion order = the selection index (1-based badge)
    const o = off();
    // Rebuilding the world's content drops the viewport's scroll position — keep it,
    // so a selection / live-colour re-render never yanks the pan back to the origin.
    // (fitAll / setZoom set scroll explicitly after they call render(), so they win.)
    const sl = canvas.scrollLeft, st = canvas.scrollTop;
    // The graph-paper grid is painted on the world backdrop (a uniform faint texture
    // filling the whole canvas — see CSS), aligned to the world origin via --off and
    // toggled to a finer sub-grid via the .fine class on the persistent canvas. The
    // stage extent has NO visual marker — the grid is one continuous, borderless
    // texture; fixtures still clamp to [0, STAGE] in world units (see onDrag).
    canvas.style.setProperty('--off', `${o}px`);
    canvas.classList.toggle('fine', state.fine);
    const nodesHtml = list.map((f, idx) => {
      const p = state.pos.get(f.id) ?? { x: 0, y: 0, rot: 0 };
      const g = emitterGrid(f);
      const w = g.width * zoom, h = g.height * zoom;
      state.dim.set(f.id, { w, h });
      state.plan.set(f.id, buildPlan(f));
      const si = selOrder.indexOf(f.id);
      const sel = si >= 0 ? ' sel' : '';
      const hl = state.highlight !== 'all' && f.groupId === state.highlight ? ' hl' : '';
      const dim = state.highlight !== 'all' && f.groupId !== state.highlight ? ' dim' : '';
      // Position every emitter by its local coordinate / footprint (one path for
      // both positioned layouts and plain grids).
      const emitters = emitterLocalPositions(f).map((c) =>
        `<i class="st-em" style="left:${(c.x / g.width * 100).toFixed(1)}%;top:${(c.y / g.height * 100).toFixed(1)}%"></i>`).join('');
      // Fixtures read identically (neutral) — they're told apart by a persistent
      // number badge (their 1-based order in the patch, i.e. first-to-last added),
      // shown in the corner. The centred badge is the live selection order.
      return `<div class="st-node${sel}${hl}${dim}" data-fx="${f.id}"
        style="left:${p.x * zoom + o}px;top:${p.y * zoom + o}px;width:${w}px;height:${h}px;transform:rotate(${p.rot}deg)"
        title="#${idx + 1} · ${esc(f.name)} · @${f.startAddress} · ${g.n} emitter${g.n === 1 ? '' : 's'}">
        <span class="st-num">${idx + 1}</span>
        ${si >= 0 ? `<span class="st-idx">${si + 1}</span>` : ''}
        <div class="st-emitters">${emitters}</div>
        <div class="st-gobo"></div>
      </div>`;
    }).join('');
    world.innerHTML = nodesHtml;
    sizeWorld();
    updateSelBox();
    canvas.scrollLeft = sl; canvas.scrollTop = st;   // restore the pan (see above)
    // Repaint emitters from the last poll frame in THIS task, before the browser
    // paints — so rebuilt dots show their live colour, not the default tint (no flash).
    paintNodes(lastData);
  }

  // Size the scrollable world to the fixed stage box plus a PAD margin on every
  // side (never smaller than the viewport), so the Hand tool has pan range in both
  // axes when zoomed in. The stage box sits at +off().
  function sizeWorld() {
    const r = canvas.getBoundingClientRect();
    const o = off();
    world.style.width = `${Math.max(STAGE_W * zoom, r.width) + o * 2}px`;
    world.style.height = `${Math.max(STAGE_H * zoom, r.height) + o * 2}px`;
  }

  // ---- shared helpers ---------------------------------------------------
  function selectOnly(id: string) { state.selected.clear(); state.selected.add(id); }
  // Broadcast the selection so the patch grid mirrors + highlights it (and vice
  // versa). `src` tags the origin so a tile ignores its own echo (no loop).
  const emitSelection = () => bus.emit(EV.FIXTURE_SELECTED, { ids: [...state.selected], src: 'stage' });
  // Always snap; the fine toggle just shrinks the step for precise placement.
  const snap = (v: number) => { const s = state.fine ? FINE : COARSE; return Math.round(v / s) * s; };

  // Update ONLY the selection visuals — the `.sel` class, the 1-based order badge,
  // and the selection box — without rebuilding the world. A full render() tears down
  // and recreates every emitter dot, which flashes the rig on each click; a pure
  // selection change touches none of the geometry, so just repaint the overlay.
  function paintSelection() {
    const selOrder = [...state.selected];
    world.querySelectorAll('.st-node').forEach((el) => {
      const node = el as HTMLElement;
      const si = selOrder.indexOf(node.dataset.fx as string);
      node.classList.toggle('sel', si >= 0);
      let badge = node.querySelector('.st-idx') as HTMLElement | null;
      if (si >= 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'st-idx'; node.prepend(badge); }
        badge.textContent = `${si + 1}`;
      } else badge?.remove();
    });
    updateSelBox();
  }

  // Live-apply position + rotation without re-rendering (keeps the marquee div).
  function applyNodeStyles() {
    const o = off();
    world.querySelectorAll('.st-node').forEach((el) => {
      const node = el as HTMLElement;
      const p = state.pos.get(node.dataset.fx as string);
      if (p) { node.style.left = `${p.x * zoom + o}px`; node.style.top = `${p.y * zoom + o}px`; node.style.transform = `rotate(${p.rot}deg)`; }
    });
    updateSelBox();
  }

  // The selection bounding box — a dashed frame around the whole selection (one
  // fixture or many) with a round rotate handle at each corner. Dragging a handle
  // spins the selection as a rigid body (see beginRotate). It tracks the
  // selection's axis-aligned world extent and re-fits live during drag/rotate.
  function updateSelBox() {
    let box = world.querySelector('.st-selbox') as HTMLElement | null;
    if (!state.selected.size) { box?.remove(); return; }
    const by = new Map(shown().map((f) => [f.id, f] as const));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of state.selected) {
      const p = state.pos.get(id), f = by.get(id);
      if (!p || !f) continue;
      const g = emitterGrid(f);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + g.width); maxY = Math.max(maxY, p.y + g.height);
    }
    if (!isFinite(minX)) { box?.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'st-selbox';
      const corners = ['nw', 'ne', 'se', 'sw'].map((c) =>
        `<button class="st-selrot" data-corner="${c}" title="Rotate selection (Shift = 15°)"></button>`).join('');
      const edges = ['n', 'e', 's', 'w'].map((c) =>
        `<button class="st-selsize" data-edge="${c}" title="Resize — scale the selection's spread"></button>`).join('');
      box.innerHTML = corners + edges;
      world.appendChild(box);
    }
    // Edge (resize) handles only make sense for 2+ fixtures — there's nothing to
    // spread with one. Corner (rotate) handles always show.
    box.classList.toggle('multi', state.selected.size >= 2);
    const o = off();
    box.style.left = `${minX * zoom + o}px`; box.style.top = `${minY * zoom + o}px`;
    box.style.width = `${(maxX - minX) * zoom}px`; box.style.height = `${(maxY - minY) * zoom}px`;
  }

  // ---- selection tools --------------------------------------------------
  function selectAll() { state.selected = new Set(shown().map((f) => f.id)); paintSelection(); emitSelection(); }
  function selectNone() { state.selected.clear(); paintSelection(); emitSelection(); }
  function invertSelection() {
    state.selected = new Set(shown().filter((f) => !state.selected.has(f.id)).map((f) => f.id));
    paintSelection(); emitSelection();
  }
  // Fixtures in reading order (top-to-bottom rows, then left-to-right) — the basis
  // for the every-Nth and shift helpers (which work by 2D position, not index).
  function byPosition(): any[] {
    return [...shown()].sort((a, b) => {
      const pa = state.pos.get(a.id), pb = state.pos.get(b.id);
      if (!pa || !pb) return 0;
      return (Math.round(pa.y) - Math.round(pb.y)) || (pa.x - pb.x);
    });
  }
  // Re-order a freshly region-selected set: keep any pre-existing `base` ids in their
  // order, then append the newly-caught ones in READING order (top-to-bottom rows,
  // then left-to-right) — so a marquee/lasso numbers fixtures the way you read the
  // rig, which is the index an FX layer fans/phases across.
  function orderByReading(base: Set<string>) {
    const baseOrder = [...base].filter((id) => state.selected.has(id));
    const added = byPosition().filter((f) => state.selected.has(f.id) && !base.has(f.id)).map((f) => f.id);
    state.selected = new Set([...baseOrder, ...added]);
  }
  // Thin the selection (or all, if none) to every Nth fixture by position — ½/⅓/¼.
  function selectEveryNth(n: number) {
    const pool = state.selected.size ? byPosition().filter((f) => state.selected.has(f.id)) : byPosition();
    state.selected = new Set(pool.filter((_, i) => i % n === 0).map((f) => f.id));
    paintSelection(); emitSelection();
  }
  // Slide the whole selection one fixture along the position order (wraps around).
  function shiftSelection(dir: number) {
    if (!state.selected.size) return;
    const order = byPosition().map((f) => f.id);
    const L = order.length; if (!L) return;
    const idx = new Map(order.map((id, i) => [id, i] as const));
    state.selected = new Set([...state.selected].map((id) => {
      const i = idx.get(id); return i == null ? id : order[(i + dir + L) % L];
    }));
    paintSelection(); emitSelection();
  }
  // Reverse the selection ORDER (the index sequence the FX fan reads) — flips fan direction.
  function reverseOrder() {
    if (state.selected.size < 2) return;
    state.selected = new Set([...state.selected].reverse());
    paintSelection(); emitSelection();
  }
  // Symmetry: re-order by interleaving from both ends (outer pair first … centre last),
  // so an index-driven FX fan radiates symmetrically about the centre. NOTE: Lumox's
  // selection is a flat ordered list (index = position), so this is the order-model
  // equivalent of a mirror — not duplicate indices like 1,2,3,3,2,1.
  function mirrorOrder() {
    const a = [...state.selected]; if (a.length < 3) return;
    const out: string[] = [];
    for (let i = 0, j = a.length - 1; i <= j; i++, j--) { out.push(a[i]); if (i !== j) out.push(a[j]); }
    state.selected = new Set(out); paintSelection(); emitSelection();
  }

  // ---- zoom (px per world unit) -----------------------------------------
  // The slider is a 0..1000 position; each half is log-mapped so the CENTRE is
  // always DEFAULT_ZOOM, the left half spans DEFAULT→MIN and the right DEFAULT→MAX.
  // Hence: thumb centred = default, left = zoom out, right = zoom in — and the
  // min/max can move independently without shifting the centre off the default.
  const zoomSlider = tile.querySelector('.st-zslider') as HTMLInputElement;
  const SLIDER_MAX = 1000;
  function sliderToZoom(v: number): number {
    const t = v / SLIDER_MAX;
    return t <= 0.5
      ? DEFAULT_ZOOM * Math.pow(MIN_ZOOM / DEFAULT_ZOOM, (0.5 - t) / 0.5)
      : DEFAULT_ZOOM * Math.pow(MAX_ZOOM / DEFAULT_ZOOM, (t - 0.5) / 0.5);
  }
  function zoomToSlider(z: number): number {
    const t = z <= DEFAULT_ZOOM
      ? 0.5 - 0.5 * (Math.log(z / DEFAULT_ZOOM) / Math.log(MIN_ZOOM / DEFAULT_ZOOM))
      : 0.5 + 0.5 * (Math.log(z / DEFAULT_ZOOM) / Math.log(MAX_ZOOM / DEFAULT_ZOOM));
    return Math.round(t * SLIDER_MAX);
  }
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  // Push the zoom into the grid + emitter-dot CSS vars, sync the slider + its
  // percentage tooltip, and re-render (node footprints are sized in JS from `zoom`).
  function applyZoom() {
    canvas.style.setProperty('--cell', `${zoom}px`);
    // Emitter dots fill their whole cell (no internal padding) — a single-emitter
    // fixture reads as one solid lit tile, a matrix as a contiguous pixel grid.
    canvas.style.setProperty('--em', `${Math.max(4, zoom).toFixed(1)}px`);
    // Selection-box grab handles scale with the zoom too (a fraction of a cell),
    // so they stay proportional to the fixtures — never burying a tiny rig when
    // zoomed out — yet stay clamped to a grabbable min / a sane max.
    const handle = Math.round(Math.max(7, Math.min(15, zoom * 0.42)));
    canvas.style.setProperty('--handle', `${handle}px`);
    canvas.style.setProperty('--handle-e', `${Math.round(handle * 0.85)}px`);
    zoomSlider.value = `${zoomToSlider(zoom)}`;
    zoomSlider.title = `Zoom ${Math.round((zoom / DEFAULT_ZOOM) * 100)}% — double-click to reset`;
    render();
  }
  // Zoom to `z`, keeping the world point under `anchor` (canvas-relative px)
  // fixed on screen — anchor defaults to the viewport centre.
  function setZoom(z: number, anchor?: { x: number; y: number }) {
    z = clampZoom(z);
    if (z === zoom) return;
    const r = canvas.getBoundingClientRect();
    const ax = anchor ? anchor.x : r.width / 2, ay = anchor ? anchor.y : r.height / 2;
    const wx = (canvas.scrollLeft + ax - off()) / zoom, wy = (canvas.scrollTop + ay - off()) / zoom;
    zoom = z;
    applyZoom();
    canvas.scrollLeft = wx * zoom - ax + off();
    canvas.scrollTop = wy * zoom - ay + off();
  }
  // Frame the rig: pick the zoom that fits the fixtures' bounding box (with a little
  // breathing room, never zooming in past the default) and centre it by scrolling
  // the world — so the view focuses on the actual fixtures, not the whole empty
  // stage. Scrollbars are hidden — fit + wheel-zoom + the hand tool move around.
  // Returns false if there's nothing to fit yet.
  function fitAll(): boolean {
    const list = shown();
    if (!list.length) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of list) {
      const p = state.pos.get(f.id); if (!p) continue;
      const g = emitterGrid(f);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + g.width); maxY = Math.max(maxY, p.y + g.height);
    }
    const r = canvas.getBoundingClientRect();
    if (!isFinite(minX) || r.width < 2 || r.height < 2) return false;
    const FIT_PAD = 2;   // world units of breathing room around the rig when framing
    const bw = (maxX - minX) + FIT_PAD * 2, bh = (maxY - minY) + FIT_PAD * 2;
    zoom = Math.min(DEFAULT_ZOOM, clampZoom(Math.min(r.width / bw, r.height / bh)));
    applyZoom();
    canvas.scrollLeft = ((minX + maxX) / 2) * zoom + off() - r.width / 2;
    canvas.scrollTop = ((minY + maxY) / 2) * zoom + off() - r.height / 2;
    return true;
  }

  // ---- live emitter colour (mixed DMX output) ---------------------------
  // Poll the universes the rig spans and paint each emitter its live colour
  // (RGB × master dimmer), with a glow when lit; off emitters fall back to a dim
  // group tint so the footprint stays readable. Gated on visibility.
  // The last fetched frame is cached so render() can repaint emitters in the SAME
  // synchronous task it rebuilds them — otherwise a freshly-rebuilt dot shows its
  // CSS default tint until the next poll (≤66 ms), flashing the rig on every click.
  let lastData = new Map<number, number[] | null>();
  function paintNodes(byUid: Map<number, number[] | null>) {
    canvas.querySelectorAll('.st-node').forEach((el) => {
      const node = el as HTMLElement;
      const plan = state.plan.get(node.dataset.fx as string);
      const data = plan && byUid.get(plan.uid);
      if (!plan || !data) return;
      const m = plan.master ? (data[plan.master - 1] ?? 0) / 255 : 1;   // fixture-wide, for the off-emitter tint
      const dots = node.querySelectorAll('.st-em');
      dots.forEach((d, k) => {
        const dot = d as HTMLElement;
        const cell = plan.cells[k];
        let r = 0, g = 0, b = 0;
        if (cell) {
          const cm = cell.m ? (data[cell.m - 1] ?? 0) / 255 : 1;   // this segment's own dimmer
          r = (data[cell.r - 1] ?? 0) * cm; g = (data[cell.g - 1] ?? 0) * cm; b = (data[cell.b - 1] ?? 0) * cm;
        } else if (plan.wheel) {
          // No RGB source — colour the emitter from the colour wheel × master dimmer.
          const stop = wheelStop(plan.wheel, data[plan.wheel.addr - 1] ?? 0);
          if (stop) { r = stop.r * m; g = stop.g * m; b = stop.b * m; }
        }
        const lum = Math.max(r, g, b);
        if (lum < 6) {
          if (cell) { dot.style.background = '#141414'; dot.style.boxShadow = 'inset 0 0 2px rgba(255,255,255,.12)'; }
          else { dot.style.background = `color-mix(in srgb, ${OFF_TINT} ${plan.master ? Math.round(m * 70) : 22}%, #111)`; dot.style.boxShadow = 'inset 0 0 2px rgba(255,255,255,.12)'; }
        } else {
          const c = `rgb(${r | 0},${g | 0},${b | 0})`;
          dot.style.background = c;
          dot.style.boxShadow = `0 0 ${Math.min(11, 3 + lum / 28).toFixed(1)}px ${c}`;
        }
      });
      // Live gobo: overlay the selected slot's drawn pattern when a non-open gobo is
      // active. Only swap the DOM when the pattern actually changes (per-frame poll).
      const gel = node.querySelector('.st-gobo') as HTMLElement | null;
      if (gel) {
        let pat = '';
        if (plan.gobo && state.showGobos) {
          const gv = data[plan.gobo.addr - 1] ?? 0;
          const cur = plan.gobo.caps.find((cap) => gv >= cap.min && gv <= cap.max);
          if (cur?.pattern && hasGobo(cur.pattern)) pat = cur.pattern;
        }
        if (gel.dataset.pat !== pat) {
          gel.dataset.pat = pat;
          gel.innerHTML = pat ? goboSvg(pat, 64) : '';
          gel.classList.toggle('on', !!pat);
        }
      }
    });
  }
  async function pollColors() {
    const uids = [...new Set(state.fixtures.map((f) => f.universeId))];
    const datas = await Promise.all(uids.map((u) => lumox.universes.read(u).catch(() => null)));
    lastData = new Map(uids.map((u, i) => [u, datas[i] ?? null]));
    paintNodes(lastData);
  }
  let colorTimer: ReturnType<typeof setInterval> | null = null;
  const stopPoll = () => { if (colorTimer) { clearInterval(colorTimer); colorTimer = null; } };
  const startPoll = () => { if (!colorTimer) { void pollColors(); colorTimer = setInterval(() => void pollColors(), COLOR_POLL_MS); } };
  // Fit the whole stage once, the first time the tile is shown with a real size.
  // The intersection / resize callbacks can fire before layout gives the canvas a
  // size, so retry across frames until fitAll() succeeds (then latch).
  let fitted = false, fitTries = 0;
  function tryFit() {
    if (fitted) return;
    if (fitAll()) { fitted = true; return; }
    if (++fitTries < 60) setTimeout(tryFit, 50);   // ~3s — wait out the SETUP-tab layout
  }
  new IntersectionObserver((es) => {
    const vis = es.some((e) => e.isIntersecting);
    if (vis) startPoll(); else stopPoll();
    if (vis && !fitted) { fitTries = 0; tryFit(); }
  }).observe(tile);
  // Keep the world ≥ viewport (+ pan margins) as the tile resizes, so the Hand tool
  // never runs out of scroll range when the window grows.
  new ResizeObserver(() => sizeWorld()).observe(canvas);

  // Pointer position in unpadded world px (the `p.x * zoom` frame). Measured off the
  // world layer, whose rect already folds in both the scroll offset and the PAD margin.
  function canvasPx(e: MouseEvent): { x: number; y: number } { const r = world.getBoundingClientRect(); return { x: e.clientX - r.left - off(), y: e.clientY - r.top - off() }; }

  // Apply a click's (de)selection to a node and broadcast. In SETUP Ctrl is reserved
  // for rotate, so only Shift/⌘ toggle; in CONTROL (no rotate) Ctrl toggles too.
  function selectNode(e: MouseEvent, el: HTMLElement) {
    const id = el.dataset.fx as string;
    const toggle = e.shiftKey || e.metaKey || (state.mode === 'control' && e.ctrlKey);
    if (toggle) {
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
    } else if (state.selected.has(id)) {
      // Plain click on an already-selected fixture: in a multi-selection, drop just
      // this one (keep the rest); a sole selection stays selected. In SETUP the drag
      // path defers this to mouseup so grabbing a member can still move the group.
      if (state.selected.size >= 2) state.selected.delete(id);
    } else {
      selectOnly(id);
    }
    paintSelection();
    emitSelection();
  }

  // ---- move drag --------------------------------------------------------
  // `bounds` = the selection's axis-aligned world extent at grab time; the drag
  // delta is clamped against it so the whole selection stays inside the stage box
  // (rigid — fixtures keep their relative layout instead of clamping individually).
  let drag: { start: { x: number; y: number }; origin: Map<string, Pos>; moved: boolean; bounds: { minX: number; minY: number; maxX: number; maxY: number }; pendingDeselect: string | null } | null = null;
  function startDrag(e: MouseEvent, el: HTMLElement) {
    e.preventDefault();
    const id = el.dataset.fx as string;
    // Grabbing one member of a multi-selection with a plain click is ambiguous: a
    // DRAG moves the whole group, a CLICK deselects just that member. Keep the group
    // intact now (so a drag works) and resolve the deselect on mouseup-without-move.
    const toggle = e.shiftKey || e.metaKey;   // SETUP: Ctrl/Alt rotate, so only these toggle
    const pendingDeselect = !toggle && state.selected.has(id) && state.selected.size >= 2 ? id : null;
    if (!pendingDeselect) selectNode(e, el);
    const origin = new Map([...state.selected].map((sid) => [sid, { ...state.pos.get(sid) } as Pos]));
    const by = new Map(shown().map((f) => [f.id, f] as const));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [sid, o] of origin) {
      const g = emitterGrid(by.get(sid) ?? { emitters: 1, emitterLayout: null } as any);
      minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + g.width); maxY = Math.max(maxY, o.y + g.height);
    }
    drag = { start: canvasPx(e), origin, moved: false, bounds: { minX, minY, maxX, maxY }, pendingDeselect };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }
  function onDrag(e: MouseEvent) {
    if (!drag) return;
    const pt = canvasPx(e);
    let dx = (pt.x - drag.start.x) / zoom, dy = (pt.y - drag.start.y) / zoom;   // px → world
    if (Math.abs(dx) + Math.abs(dy) > 0.1) drag.moved = true;
    // Keep the selection's bounding box within [0, STAGE]; rigid (one shared delta).
    const b = drag.bounds;
    dx = Math.max(-b.minX, Math.min(STAGE_W - b.maxX, dx));
    dy = Math.max(-b.minY, Math.min(STAGE_H - b.maxY, dy));
    for (const [id, o] of drag.origin) {
      state.pos.set(id, { x: o.x + dx, y: o.y + dy, rot: o.rot });
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
    } else if (drag?.pendingDeselect) {                  // click (no move) on a member → drop just it
      state.selected.delete(drag.pendingDeselect);
      paintSelection();
      emitSelection();
    }
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    drag = null;
  }

  // ---- rotation (Ctrl-drag on a node, or drag the rotate handle) --------
  // The whole selection rotates as a RIGID BODY about its collective centre:
  // every fixture orbits that centre AND spins by the same angular delta (like
  // spinning a real truss). A single fixture therefore just spins in place.
  // The pivot is derived from world coords (not the DOM), so it survives the
  // render() that a select-on-grab triggers.
  interface RotOrigin { cx: number; cy: number; rot: number; gw: number; gh: number; }   // world centre + rotation + footprint
  let rot: { cx: number; cy: number; wcx: number; wcy: number; startAng: number; origin: Map<string, RotOrigin> } | null = null;
  // Ctrl/Alt-drag a node → make sure it's selected, then rotate the selection.
  function startRotate(e: MouseEvent, el: HTMLElement) {
    const id = el.dataset.fx as string;
    if (!state.selected.has(id)) { selectOnly(id); paintSelection(); emitSelection(); }
    beginRotate(e);
  }
  // Begin a rigid-body rotation of the CURRENT selection (from a corner handle on
  // the selection box, or a Ctrl/Alt-drag once the node is selected).
  function beginRotate(e: MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    // World-space bounding box of the selection → its centre is the pivot.
    const by = new Map(shown().map((f) => [f.id, f] as const));
    const origin = new Map<string, RotOrigin>();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sid of state.selected) {
      const p = state.pos.get(sid), f = by.get(sid);
      if (!p || !f) continue;
      const g = emitterGrid(f);
      origin.set(sid, { cx: p.x + g.width / 2, cy: p.y + g.height / 2, rot: p.rot, gw: g.width, gh: g.height });
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + g.width); maxY = Math.max(maxY, p.y + g.height);
    }
    if (!origin.size) return;
    const wcx = (minX + maxX) / 2, wcy = (minY + maxY) / 2;
    const r = world.getBoundingClientRect();
    const cx = r.left + off() + wcx * zoom, cy = r.top + off() + wcy * zoom;
    rot = { cx, cy, wcx, wcy, startAng: Math.atan2(e.clientY - cy, e.clientX - cx), origin };
    document.addEventListener('mousemove', onRotate);
    document.addEventListener('mouseup', endRotate);
  }
  function onRotate(e: MouseEvent) {
    if (!rot) return;
    const ang = Math.atan2(e.clientY - rot.cy, e.clientX - rot.cx);
    let deg = (ang - rot.startAng) * 180 / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;   // Shift snaps the rotation to 15°
    const rad = deg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    for (const [id, o] of rot.origin) {
      const dx = o.cx - rot.wcx, dy = o.cy - rot.wcy;        // orbit the centre about the pivot
      const ncx = rot.wcx + dx * cos - dy * sin, ncy = rot.wcy + dx * sin + dy * cos;
      state.pos.set(id, { x: ncx - o.gw / 2, y: ncy - o.gh / 2, rot: Math.round(o.rot + deg) });
    }
    applyNodeStyles();
  }
  // The canvas is anchored at the world origin (it can't scroll past 0), so a
  // rotation that swings fixtures past x/y = 0 would clip them off the top-left.
  // Shift the whole set rigidly by the minimal offset that brings its bounding box
  // back to >= 0 — shape (and thus the rigid rotation) is preserved.
  function nudgeIntoView(ids: string[]) {
    let minX = Infinity, minY = Infinity;
    for (const id of ids) { const p = state.pos.get(id); if (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); } }
    const dx = minX < 0 ? -minX : 0, dy = minY < 0 ? -minY : 0;
    if (!dx && !dy) return;
    for (const id of ids) { const p = state.pos.get(id); if (p) state.pos.set(id, { x: p.x + dx, y: p.y + dy, rot: p.rot }); }
    applyNodeStyles();
  }
  function endRotate() {
    document.removeEventListener('mousemove', onRotate);
    document.removeEventListener('mouseup', endRotate);
    if (rot) { const ids = [...state.selected]; nudgeIntoView(ids); persist(ids); }
    rot = null;
  }

  // ---- resize (scale the selection's spread) ----------------------------
  // Drag a selection-box EDGE handle to scale the arrangement uniformly about its
  // centre: each fixture's position moves in/out by the same factor (footprints and
  // rotations stay fixed), so e.g. a ring of fixtures changes diameter. The factor
  // is the dragged edge's distance from the centre over its start distance.
  interface SizeOrigin { cx: number; cy: number; gw: number; gh: number; rot: number; }
  let resize: { cx: number; cy: number; axis: 'x' | 'y'; halfPx: number; wcx: number; wcy: number; origin: Map<string, SizeOrigin> } | null = null;
  function beginResize(e: MouseEvent, edge: string) {
    e.preventDefault(); e.stopPropagation();
    const by = new Map(shown().map((f) => [f.id, f] as const));
    const origin = new Map<string, SizeOrigin>();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of state.selected) {
      const p = state.pos.get(id), f = by.get(id);
      if (!p || !f) continue;
      const g = emitterGrid(f);
      origin.set(id, { cx: p.x + g.width / 2, cy: p.y + g.height / 2, gw: g.width, gh: g.height, rot: p.rot });
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + g.width); maxY = Math.max(maxY, p.y + g.height);
    }
    if (origin.size < 2) return;
    const wcx = (minX + maxX) / 2, wcy = (minY + maxY) / 2;
    const r = world.getBoundingClientRect();
    const cx = r.left + off() + wcx * zoom, cy = r.top + off() + wcy * zoom;
    const axis: 'x' | 'y' = (edge === 'e' || edge === 'w') ? 'x' : 'y';
    const halfPx = Math.max(1, (axis === 'x' ? (maxX - minX) / 2 : (maxY - minY) / 2) * zoom);
    resize = { cx, cy, axis, halfPx, wcx, wcy, origin };
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', endResize);
  }
  function onResize(e: MouseEvent) {
    if (!resize) return;
    const cur = resize.axis === 'x' ? Math.abs(e.clientX - resize.cx) : Math.abs(e.clientY - resize.cy);
    const factor = Math.max(0.05, Math.min(20, cur / resize.halfPx));   // uniform scale about the centre
    for (const [id, o] of resize.origin) {
      const ncx = resize.wcx + (o.cx - resize.wcx) * factor, ncy = resize.wcy + (o.cy - resize.wcy) * factor;
      state.pos.set(id, { x: ncx - o.gw / 2, y: ncy - o.gh / 2, rot: o.rot });
    }
    applyNodeStyles();
  }
  function endResize() {
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', endResize);
    if (resize) { const ids = [...state.selected]; nudgeIntoView(ids); persist(ids); }
    resize = null;
  }

  // ---- marquee (rubber-band) selection ----------------------------------
  let band: { start: { x: number; y: number }; base: Set<string>; box: HTMLElement } | null = null;
  function startMarquee(e: MouseEvent) {
    const start = canvasPx(e);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? new Set(state.selected) : new Set<string>();
    if (!additive) { state.selected.clear(); paintSelection(); }   // clear visuals first, then add the band
    const box = document.createElement('div');
    box.className = 'st-marquee';
    world.appendChild(box);
    band = { start, base, box };
    document.addEventListener('mousemove', onMarquee);
    document.addEventListener('mouseup', endMarquee);
  }
  function onMarquee(e: MouseEvent) {
    if (!band) return;
    const pt = canvasPx(e);
    const x = Math.min(band.start.x, pt.x), y = Math.min(band.start.y, pt.y);
    const w = Math.abs(pt.x - band.start.x), h = Math.abs(pt.y - band.start.y);
    const o = off();   // box lives in the world layer → shift by the PAD margin
    Object.assign(band.box.style, { left: `${x + o}px`, top: `${y + o}px`, width: `${w}px`, height: `${h}px` });
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
    const base = band?.base;
    band?.box.remove();
    band = null;
    document.removeEventListener('mousemove', onMarquee);
    document.removeEventListener('mouseup', endMarquee);
    if (base) orderByReading(base);   // number the catch in reading order
    paintSelection();
    emitSelection();
  }

  // ---- lasso (freeform) selection ---------------------------------------
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Even-odd ray cast: is the point inside the polygon described by `pts`?
  function pointInPoly(x: number, y: number, pts: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  let lasso: { pts: { x: number; y: number }[]; poly: SVGPolygonElement; svg: SVGSVGElement; base: Set<string> } | null = null;
  function startLasso(e: MouseEvent) {
    e.preventDefault();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? new Set(state.selected) : new Set<string>();
    if (!additive) { state.selected.clear(); paintSelection(); }
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'st-lasso');
    svg.style.width = `${world.offsetWidth}px`;
    svg.style.height = `${world.offsetHeight}px`;
    const poly = document.createElementNS(SVGNS, 'polygon');
    svg.appendChild(poly);
    world.appendChild(svg);
    lasso = { pts: [canvasPx(e)], poly, svg, base };
    document.addEventListener('mousemove', onLasso);
    document.addEventListener('mouseup', endLasso);
  }
  function onLasso(e: MouseEvent) {
    if (!lasso) return;
    const pt = canvasPx(e);
    const last = lasso.pts[lasso.pts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 4) return;   // throttle by travel
    lasso.pts.push(pt);
    const o = off();   // pts are unpadded (for hit-test); the drawn polygon lives in the world layer
    lasso.poly.setAttribute('points', lasso.pts.map((p) => `${p.x + o},${p.y + o}`).join(' '));
    const next = new Set(lasso.base);
    for (const f of shown()) {
      const p = state.pos.get(f.id), d = state.dim.get(f.id);
      if (!p || !d) continue;
      if (pointInPoly(p.x * zoom + d.w / 2, p.y * zoom + d.h / 2, lasso.pts)) next.add(f.id);   // by footprint centre
    }
    canvas.querySelectorAll('.st-node').forEach((el) =>
      (el as HTMLElement).classList.toggle('sel', next.has((el as HTMLElement).dataset.fx as string)));
    state.selected = next;
  }
  function endLasso() {
    const base = lasso?.base;
    lasso?.svg.remove();
    lasso = null;
    document.removeEventListener('mousemove', onLasso);
    document.removeEventListener('mouseup', endLasso);
    if (base) orderByReading(base);   // number the catch in reading order
    paintSelection();
    emitSelection();
  }

  // ---- pan (hand tool) — drag to scroll the canvas ----------------------
  let pan: { x: number; y: number; sl: number; st: number } | null = null;
  function startPan(e: MouseEvent) {
    e.preventDefault();
    pan = { x: e.clientX, y: e.clientY, sl: canvas.scrollLeft, st: canvas.scrollTop };
    canvas.classList.add('panning');
    document.addEventListener('mousemove', onPan);
    document.addEventListener('mouseup', endPan);
  }
  function onPan(e: MouseEvent) {
    if (!pan) return;
    canvas.scrollLeft = pan.sl - (e.clientX - pan.x);
    canvas.scrollTop = pan.st - (e.clientY - pan.y);
  }
  function endPan() {
    pan = null;
    canvas.classList.remove('panning');
    document.removeEventListener('mousemove', onPan);
    document.removeEventListener('mouseup', endPan);
  }

  // Delegated mousedown — bound once on the canvas (survives every render()).
  // The active tool decides the gesture; only the default SELECT tool moves /
  // rotates fixtures, the others are whole-canvas pan / selection gestures.
  canvas.addEventListener('mousedown', (e) => {
    const ev = e as MouseEvent;
    // Middle mouse button pans the canvas from any tool (a console convention).
    if (ev.button === 1) { startPan(ev); return; }
    if (ev.button !== 0) return;
    if (state.tool === 'pan') { startPan(ev); return; }
    if (state.tool === 'lasso') { startLasso(ev); return; }
    if (state.tool === 'rect') { startMarquee(ev); return; }
    const t = ev.target as HTMLElement;
    // CONTROL is selection-only: skip the positioning gestures (move / rotate /
    // resize) — a click on a fixture just (de)selects it.
    if (state.mode === 'setup') {
      const sizeH = t.closest('.st-selsize') as HTMLElement | null;
      if (sizeH) { beginResize(ev, sizeH.dataset.edge as string); return; }   // box edge → scale spread
      if (t.closest('.st-selrot')) { beginRotate(ev); return; }   // selection-box corner → rigid rotate
    }
    const node = t.closest('.st-node') as HTMLElement | null;
    if (node) {
      if (state.mode === 'control') selectNode(ev, node);          // select only, never move
      else if (ev.ctrlKey || ev.altKey) startRotate(ev, node);    // Ctrl/Alt-drag rotates
      else startDrag(ev, node);
      return;
    }
    startMarquee(ev);   // empty canvas → rubber-band select
  });

  // Tool switch — set the mode, reflect it on the buttons + the canvas cursor.
  function setTool(tool: typeof state.tool) {
    state.tool = tool;
    tile.querySelectorAll('[data-tool]').forEach((b) =>
      (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tool === tool));
    canvas.classList.remove('tool-select', 'tool-rect', 'tool-lasso', 'tool-pan');
    canvas.classList.add(`tool-${tool}`);
  }
  tile.querySelectorAll('[data-tool]').forEach((b) => {
    const btn = b as HTMLElement;
    btn.addEventListener('click', () => setTool(btn.dataset.tool as typeof state.tool));
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
    const packed = packLayout(list, cols, (f) => state.pos.get(f.id)?.rot ?? 0);
    for (const f of list) state.pos.set(f.id, packed.get(f.id) as Pos);
    render();
    persist(list.map((f) => f.id));
  }

  // The list an arrange/shape acts on, in SELECTION order when there is one (so the
  // shape follows the user's index order), else every fixture in position order.
  function arrangeList(): any[] {
    if (!state.selected.size) return shown();
    const by = new Map(shown().map((f) => [f.id, f] as const));
    return [...state.selected].map((id) => by.get(id)).filter(Boolean) as any[];
  }

  // Lay the list out as a single row, packed by real footprint (+1-cell gap), in order.
  function arrangeLine() {
    const list = arrangeList();
    if (!list.length) return;
    const packed = packLayout(list, list.length, (f) => state.pos.get(f.id)?.rot ?? 0);
    for (const f of list) state.pos.set(f.id, packed.get(f.id) as Pos);
    render();
    persist(list.map((f) => f.id));
  }

  // Lay the list evenly around a circle (in order, starting at the top, clockwise).
  // Radius grows with count so footprints don't overlap.
  function arrangeCircle() {
    const list = arrangeList();
    const n = list.length;
    if (n < 2) return;
    let maxF = 1;
    for (const f of list) { const g = emitterGrid(f); maxF = Math.max(maxF, g.width, g.height); }
    const radius = Math.max(2, (n * (maxF + PACK_GAP)) / (2 * Math.PI));
    const c = PACK_MARGIN + radius + maxF / 2;
    list.forEach((f, i) => {
      const g = emitterGrid(f);
      const ang = -Math.PI / 2 + i * (2 * Math.PI / n);
      const x = snap(c + radius * Math.cos(ang) - g.width / 2);
      const y = snap(c + radius * Math.sin(ang) - g.height / 2);
      state.pos.set(f.id, { x: Math.max(0, x), y: Math.max(0, y), rot: state.pos.get(f.id)?.rot ?? 0 });
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

  // Reset the whole stage: discard all manual placement — re-cluster every fixture
  // at the stage centre and clear rotation, then re-frame. A normal edit (dirties +
  // undoable), so a misclick is one Ctrl+Z away.
  function resetStage() {
    const list = shown();
    if (!list.length) return;
    const placed = centerCluster(list);
    for (const f of list) state.pos.set(f.id, placed.get(f.id) as Pos);
    render();
    persist(list.map((f) => f.id));
    fitAll();
  }

  const SEL_OPS: Record<string, () => void> = {
    all: selectAll, none: selectNone, invert: invertSelection,
    half: () => selectEveryNth(2), third: () => selectEveryNth(3), quarter: () => selectEveryNth(4),
  };
  tile.querySelectorAll('[data-sel]').forEach((b) => {
    const btn = b as HTMLElement;
    btn.addEventListener('click', () => SEL_OPS[btn.dataset.sel as string]?.());
  });
  tile.querySelectorAll('[data-al]').forEach((b) => { const btn = b as HTMLElement; btn.addEventListener('click', () => align(btn.dataset.al as string)); });
  tile.querySelectorAll('[data-dist]').forEach((b) => { const btn = b as HTMLElement; btn.addEventListener('click', () => distribute(btn.dataset.dist as string)); });
  const ACT_OPS: Record<string, () => void> = {
    arrange, 'arrange-line': arrangeLine, 'arrange-circle': arrangeCircle, 'rot-reset': resetRotation,
    'reset-stage': resetStage,
    'shift-back': () => shiftSelection(-1), 'shift-fwd': () => shiftSelection(1),
    'order-invert': reverseOrder, 'order-mirror': mirrorOrder,
  };
  tile.querySelectorAll('[data-act]').forEach((b) => {
    const btn = b as HTMLElement;
    const op = ACT_OPS[btn.dataset.act as string];
    if (op) btn.addEventListener('click', op);
  });
  const fineBtn = tile.querySelector('[data-act="fine"]') as HTMLElement;
  fineBtn.addEventListener('click', () => { state.fine = !state.fine; fineBtn.classList.toggle('active', state.fine); render(); });

  // Toggle the live-gobo overlay on/off (a view option, not an edit). Repaint from
  // the last poll frame so it appears / clears immediately, not on the next tick.
  const goboBtn = tile.querySelector('[data-view="gobos"]') as HTMLElement;
  goboBtn.addEventListener('click', () => {
    state.showGobos = !state.showGobos;
    goboBtn.classList.toggle('active', state.showGobos);
    paintNodes(lastData);
  });

  // ---- grouping & saved selections (driven from the context menu) -------
  // A group may only hold fixtures that share one channel configuration; this is
  // the config common to the whole selection, or null if it's empty / spans configs.
  function sharedConfigKey(): string | null {
    const fxs = state.fixtures.filter((f) => state.selected.has(f.id));
    if (!fxs.length) return null;
    const k = fxs[0].configKey;
    return fxs.every((f) => f.configKey === k) ? k : null;
  }
  async function newGroupFromSelection() {
    const fixtureIds = [...state.selected];
    if (!fixtureIds.length || !sharedConfigKey()) return;
    try { await lumox.groups.add({ fixtureIds }); }
    catch (err: any) { console.error('[stage] new group failed:', err.message); return; }
    bus.emit(EV.GROUPS_CHANGED); bus.emit(EV.PATCH_CHANGED);
  }
  async function addToGroup(g: any) {
    const next = [...new Set([...g.fixtureIds, ...state.selected])];
    try { await lumox.groups.setFixtures(g.id, next); }
    catch (err: any) { console.error('[stage] add to group failed:', err.message); return; }
    bus.emit(EV.GROUPS_CHANGED); bus.emit(EV.PATCH_CHANGED);
  }
  async function removeFromGroup(g: any) {
    const next = g.fixtureIds.filter((id: string) => !state.selected.has(id));
    try { await lumox.groups.setFixtures(g.id, next); }
    catch (err: any) { console.error('[stage] remove from group failed:', err.message); return; }
    bus.emit(EV.GROUPS_CHANGED); bus.emit(EV.PATCH_CHANGED);
  }
  // Save the live selection (in order) as a named selection in the right rail,
  // then drop straight into rename — same gesture as the rail's Save button.
  async function saveCurrentSelection() {
    if (!state.selected.size) return;
    const dto = await lumox.selections.save([...state.selected]);
    await loadSaved();
    if (dto) startRenameSaved(dto.id);
  }

  // ---- right-click context menu (rail ops + grouping, at the cursor) -----
  // Reuses the shared menu widget (headers, dividers, disabled, danger); a
  // right-click on an unselected fixture selects it first so the ops have a target.
  function showAddToGroupMenu(at: MouseEvent, eligible: any[]) {
    openMenu([
      { sub: 'Add selection to' },
      ...eligible.map((g) => ({ label: g.name, dot: g.color, onClick: () => addToGroup(g) })),
    ], { at });
  }
  canvas.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (!shown().length) return;
    const node = (e.target as HTMLElement).closest('.st-node') as HTMLElement | null;
    if (node) {
      const id = node.dataset.fx as string;
      if (!state.selected.has(id)) { selectOnly(id); paintSelection(); emitSelection(); }
    }
    const has = state.selected.size > 0;
    const cfg = sharedConfigKey();
    let groups: any[] = [];
    try { groups = await lumox.groups.list(); } catch { /* ignore */ }
    const eligible = cfg ? groups.filter((g) => g.configKey === cfg) : [];
    const active = activeGroup.peek();
    const activeGrp = active !== 'all' ? groups.find((g) => g.id === active) : null;
    const inActive = !!activeGrp && activeGrp.fixtureIds.some((id: string) => state.selected.has(id));

    const items: MenuItem[] = [
      { label: 'Select all', onClick: selectAll },
      { label: 'Invert selection', onClick: invertSelection },
      { label: 'Keep every 2nd (½)', disabled: !has, onClick: () => selectEveryNth(2) },
      { label: 'Keep every 3rd (⅓)', disabled: !has, onClick: () => selectEveryNth(3) },
      { divider: true },
      { label: 'Invert order', disabled: state.selected.size < 2, onClick: reverseOrder },
      { label: 'Symmetry', disabled: state.selected.size < 3, onClick: mirrorOrder },
      { divider: true },
      { label: 'Save selection', disabled: !has, onClick: saveCurrentSelection },
      {
        label: 'New group from selection', disabled: !cfg,
        title: has && !cfg ? 'Selection spans channel configs — a group holds one config' : undefined,
        onClick: newGroupFromSelection,
      },
      {
        label: 'Add to group…', disabled: !eligible.length,
        onClick: () => showAddToGroupMenu(e, eligible),
      },
    ];
    if (inActive) items.push({ label: `Remove from "${activeGrp.name}"`, onClick: () => removeFromGroup(activeGrp) });
    items.push(
      { divider: true },
      { label: 'Arrange — grid', onClick: arrange },
      { label: 'Arrange — line', onClick: arrangeLine },
      { label: 'Arrange — circle', onClick: arrangeCircle },
      { label: 'Reset rotation', onClick: resetRotation },
      { label: 'Reset stage', onClick: resetStage },
    );
    if (has) items.push({ divider: true }, { label: 'Delete', key: 'Del', danger: true, onClick: removeSelected });
    openMenu(items, { at: e });
  });
  bus.on(EV.PATCH_CHANGED, closeMenu);

  // ---- saved (named) selections — right rail ---------------------------
  // A persistent list mirroring the left tools rail. Save captures the current
  // selection IN ORDER; click a row to recall it into the live selection (main
  // broadcasts it back, so the stage adopts it via the FIXTURE_SELECTED bridge);
  // double-click to rename inline; × to delete.
  const savedSaveBtn = tile.querySelector('.st-sv-save') as HTMLElement;
  const savedList = tile.querySelector('.st-sv-list') as HTMLElement;
  const savedRail = tile.querySelector('.st-rail-r') as HTMLElement;
  // Collapse / expand the saved-selections rail (the canvas reclaims the space).
  (tile.querySelector('.st-sv-toggle') as HTMLElement).addEventListener('click', () => savedRail.classList.toggle('collapsed'));
  function renderSavedPop() {   // (called from reload too)
    savedList.innerHTML = state.saved.length
      ? state.saved.map((s) => `
          <div class="st-sv-row" data-id="${s.id}">
            <button class="st-sv-name" title="Recall — double-click to rename">${esc(s.name)}<span class="st-sv-n">${s.fixtureIds.length}</span></button>
            <button class="st-sv-del" title="Delete"><i class="fa-solid fa-xmark"></i></button>
          </div>`).join('')
      : `<div class="st-sv-empty">No saved selections.</div>`;
  }
  async function loadSaved() { try { state.saved = await lumox.selections.list(); } catch { state.saved = []; } renderSavedPop(); }
  function startRenameSaved(id: string) {
    const row = savedList.querySelector(`.st-sv-row[data-id="${id}"]`) as HTMLElement | null;
    const cur = state.saved.find((s) => s.id === id);
    if (!row || !cur) return;
    const nameBtn = row.querySelector('.st-sv-name') as HTMLElement;
    const input = document.createElement('input');
    input.className = 'st-sv-input'; input.value = cur.name;
    nameBtn.replaceWith(input);
    input.focus(); input.select();
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') input.blur();
      else if (ev.key === 'Escape') { input.value = cur.name; input.blur(); }
    });
    input.addEventListener('blur', async () => {
      const v = input.value.trim();
      if (v && v !== cur.name) await lumox.selections.rename(id, v);
      await loadSaved();
    }, { once: true });
  }
  savedSaveBtn.addEventListener('click', saveCurrentSelection);
  savedList.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest('.st-sv-row') as HTMLElement | null;
    if (!row) return;
    const id = row.dataset.id as string;
    if (t.closest('.st-sv-del')) { await lumox.selections.remove(id); await loadSaved(); }
    else if (t.closest('.st-sv-name')) await lumox.selections.recall(id);
  });
  savedList.addEventListener('dblclick', (e) => {
    const row = (e.target as HTMLElement).closest('.st-sv-row') as HTMLElement | null;
    if (row) startRenameSaved(row.dataset.id as string);
  });

  // zoom — toolbar buttons + mouse wheel (zooms toward the cursor). Pan with the
  // hand tool or a middle-button drag, since the wheel is taken by zoom.
  tile.querySelectorAll('[data-zoom]').forEach((b) => {
    const btn = b as HTMLElement;
    btn.addEventListener('click', () => {
      const k = btn.dataset.zoom;
      if (k === 'in') setZoom(zoom * 1.2);
      else if (k === 'out') setZoom(zoom / 1.2);
      else fitAll();
    });
  });
  // Slider drags zoom (log-mapped, centred); double-click resets to default.
  zoomSlider.addEventListener('input', () => setZoom(sliderToZoom(Number(zoomSlider.value))));
  zoomSlider.addEventListener('dblclick', () => setZoom(DEFAULT_ZOOM));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), { x: e.clientX - r.left, y: e.clientY - r.top });
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
  // Single-key tool switches (V select · M rect · L lasso · H hand), SETUP-scoped.
  onShortcut({ key: 'v' }, () => setTool('select'), stageActive);
  onShortcut({ key: 'm' }, () => setTool('rect'), stageActive);
  onShortcut({ key: 'l' }, () => setTool('lasso'), stageActive);
  onShortcut({ key: 'h' }, () => setTool('pan'), stageActive);

  // react to patch + group selection
  bus.on(EV.PATCH_CHANGED, reload);
  bus.on(EV.GROUPS_CHANGED, reload);
  effect(() => { state.highlight = activeGroup.value; render(); });
  // mirror a selection made elsewhere (patch grid / group tab / scene-select /
  // saved recall) — ignore our own echo. A selection change touches no geometry,
  // so repaint just the overlay (badges + box), never rebuilding the emitter dots
  // (a full render() flashes the rig — the same reason local clicks use paintSelection).
  bus.on(EV.FIXTURE_SELECTED, (d: { ids: string[]; src: string }) => {
    if (!d || d.src === 'stage') return;
    state.selected = new Set(d.ids);
    paintSelection();
  });

  // Switch the stage's role with the active tab: SETUP positions fixtures, CONTROL
  // is selection-only (hide the positioning controls + handles via `.mode-control`;
  // the gestures themselves are gated on `state.mode` at mousedown).
  function setMode(tab: string) {
    state.mode = tab === 'control' ? 'control' : 'setup';
    tile.classList.toggle('mode-control', state.mode === 'control');
    if (state.mode === 'control' && state.tool !== 'select') setTool('select');   // arrange/move tools are moot here
  }

  applyZoom();   // seed the grid/dot CSS vars + label before the first render
  setTool('select');   // seed the canvas cursor class
  await reload();
  tryFit();   // fit the stage as soon as the canvas has a real size
  return { tile, refresh: reload, setMode };
}
