// Scene panel (CONTROL view, top-right). Reflects the scene clicked in the Banks
// tile. The narrow column is decluttered with a right-hand icon rail that switches
// between full-width pages (no nested boxes, no deep back-tracking):
//   • Base    — base look STATIC / CHASE + (chase) the steps list.
//   • FX Rack — flat list of FX layers; each row opens its own editor page.
//       └ Layer — one layer's editor (color / move / curve / chaser / value):
//                 target (group), sweep order, kind config + live preview, timing.
//                 Reorder, enable/bypass and delete live in the page's title row;
//                 a ← FX Rack link returns to the list.
//   • Scene   — scene-level: DIMMER, chase transport/tempo, fade timing.
//   • Advanced— priority, loop + jump-to, release/protect scopes, flash.
// The header carries the scene name, a rename pencil, live status and recall.

import { bus, EV } from '../lib/bus';
import { html, mount, raw } from '../lib/dom';
import { makeKnob } from '../lib/knob';
import type { SceneInfo, FxLayerInfo, FxKind } from '../lumox';

const { lumox } = window;

const ICON = {
  play:    '<i class="fa-solid fa-play"></i>',
  pause:   '<i class="fa-solid fa-pause"></i>',
  prev:    '<i class="fa-solid fa-backward-step"></i>',
  next:    '<i class="fa-solid fa-forward-step"></i>',
  toStart: '<i class="fa-solid fa-backward-fast"></i>',
  toEnd:   '<i class="fa-solid fa-forward-fast"></i>',
  bounce:  '<i class="fa-solid fa-right-left"></i>',
  fwd:     '<i class="fa-solid fa-arrow-right-long"></i>',
  back:    '<i class="fa-solid fa-arrow-left-long"></i>',
  restart: '<i class="fa-solid fa-rotate-left"></i>',
  random:  '<i class="fa-solid fa-shuffle"></i>',
  trash:   '<i class="fa-solid fa-trash"></i>',
  plus:    '<i class="fa-solid fa-plus"></i>',
  up:      '<i class="fa-solid fa-chevron-up"></i>',
  down:    '<i class="fa-solid fa-chevron-down"></i>',
  right:   '<i class="fa-solid fa-chevron-right"></i>',
  x:       '<i class="fa-solid fa-xmark"></i>',
  pencil:  '<i class="fa-solid fa-pen"></i>',
};

const TAU = Math.PI * 2;

// FX kinds — label + rack-row icon.
const KINDS: { kind: FxKind; label: string; icon: string }[] = [
  { kind: 'color',  label: 'Color',  icon: '<i class="fa-solid fa-palette"></i>' },
  { kind: 'move',   label: 'Move',   icon: '<i class="fa-solid fa-up-down-left-right"></i>' },
  { kind: 'curve',  label: 'Curve',  icon: '<i class="fa-solid fa-wave-square"></i>' },
  { kind: 'chaser', label: 'Chaser', icon: '<i class="fa-solid fa-ellipsis"></i>' },
  { kind: 'value',  label: 'Value',  icon: '<i class="fa-solid fa-sliders"></i>' },
  { kind: 'matrix', label: 'Matrix', icon: '<i class="fa-solid fa-table-cells-large"></i>' },
];
const kindLabel = (k: FxKind): string => KINDS.find((x) => x.kind === k)?.label ?? k;
const kindIcon = (k: FxKind): string => KINDS.find((x) => x.kind === k)?.icon ?? '';

const r2 = (v: number): number => Math.round(v * 100) / 100;
const dirIcon = (d: string): string => (d === 'backward' ? ICON.back : d === 'bounce' ? ICON.bounce : ICON.fwd);
function fmtBeat(b: number): string { return b >= 1 ? `${r2(b)}` : `1/${Math.round(1 / b)}`; }

// Pages of the Scene panel, switched via the right-hand rail. `layer` is a
// sub-page of `rack` (drilled into from an FX-rack row; returns there).
type View = 'base' | 'rack' | 'layer' | 'scene' | 'adv';

// ---- FX preview diagrams (canvas 2D) -----------------------------------
// Drawn in a 120-unit design space scaled by `s` to the canvas's CSS size, so
// the look is identical to the original vector design at any (now much larger)
// size. redrawPreview() owns DPR scaling + clearing; these just paint.
type PreviewColors = { accent: string; border: string; fgDim: string };

function shapePt(shape: string, th: number): [number, number] {
  switch (shape) {
    case 'figure8': return [Math.sin(th), Math.sin(th) * Math.cos(th) * 2];
    case 'line':    return [Math.sin(th), 0];
    case 'square': {
      const t = ((((th / TAU) % 1) + 1) % 1) * 4, e = Math.floor(t), f = t - e;
      if (e === 0) return [-1 + 2 * f, -1];
      if (e === 1) return [1, -1 + 2 * f];
      if (e === 2) return [1 - 2 * f, 1];
      return [-1, 1 - 2 * f];
    }
    default: return [Math.sin(th), Math.cos(th)];
  }
}
function waveSample(wave: string, t: number, duty = 0.5): number {
  switch (wave) {
    case 'triangle': return 1 - Math.abs(2 * t - 1);
    case 'sawtooth': return t;
    case 'square':   return t < duty ? 1 : 0;
    case 'random':   { const s = Math.sin((Math.floor(t * 6) + 1) * 12.9898) * 43758.5453; return s - Math.floor(s); }
    default:         return (Math.sin(t * TAU) + 1) / 2;
  }
}
// A marker per target beam at its phase position, lower indices drawn on top.
function drawBeamDots(ctx: CanvasRenderingContext2D, at: (i: number) => [number, number], beams: number, r: number, s: number, col: PreviewColors): void {
  const n = Math.min(Math.max(0, beams), 40);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${(r * 1.5).toFixed(1)}px system-ui, sans-serif`;
  for (let i = n - 1; i >= 0; i--) {
    const [x, y] = at(i);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
    ctx.lineWidth = 0.5 * s;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    if (n <= 12) { ctx.fillStyle = '#000'; ctx.fillText(String(i + 1), x, y + 0.4 * s); }
  }
}

function drawShape(ctx: CanvasRenderingContext2D, w: number, h: number, shape: string, sizeX: number, sizeY: number, rotDeg: number, beams: number, spreadDeg: number, phaseRad: number, col: PreviewColors): void {
  const s = Math.min(w, h) / 120, cx = w / 2, cy = h / 2;
  const rot = (rotDeg * Math.PI) / 180, cos = Math.cos(rot), sin = Math.sin(rot);
  const at = (theta: number): [number, number] => {
    const [x, y] = shapePt(shape, theta);
    const rx = x * cos - y * sin, ry = x * sin + y * cos;   // rotate then scale per axis (matches renderMoveFx)
    return [cx + rx * 42 * s * sizeX, cy + ry * 42 * s * sizeY];
  };
  ctx.strokeStyle = col.border;
  ctx.lineWidth = s;
  ctx.beginPath();
  ctx.roundRect(cx - 46 * s, cy - 46 * s, 92 * s, 92 * s, 4 * s);
  ctx.stroke();
  ctx.fillStyle = col.fgDim;
  ctx.beginPath();
  ctx.arc(cx, cy, 2 * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 1.4 * s;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 96; k++) { const [px, py] = at((k / 96) * TAU); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.stroke();
  // each beam sits at the live playhead (phaseRad) plus its phase offset (matches renderMoveFx)
  drawBeamDots(ctx, (i) => at(phaseRad + (i * spreadDeg * Math.PI) / 180), beams, 4 * s, s, col);
}

function drawWave(ctx: CanvasRenderingContext2D, w: number, _h: number, wave: string, duty: number, invert: boolean, min: number, max: number, beams: number, spreadDeg: number, phaseCyc: number, col: PreviewColors): void {
  const s = w / 120;
  const lvl = (t: number): number => { let v = waveSample(wave, t, duty); if (invert) v = 1 - v; return (min + (max - min) * v) / 255; };
  const X = (t: number): number => (8 + t * 104) * s;
  const Y = (v: number): number => (62 - v * 54) * s;
  ctx.strokeStyle = col.border;
  ctx.lineWidth = s;
  ctx.beginPath();
  ctx.moveTo(8 * s, 62 * s); ctx.lineTo(112 * s, 62 * s);
  ctx.stroke();
  ctx.setLineDash([2 * s, 3 * s]);
  ctx.beginPath();
  ctx.moveTo(8 * s, 8 * s); ctx.lineTo(112 * s, 8 * s);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 1.4 * s;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 120; k++) { const t = k / 120; if (k) ctx.lineTo(X(t), Y(lvl(t))); else ctx.moveTo(X(t), Y(lvl(t))); }
  ctx.stroke();
  // each beam travels the period at the live playhead (phaseCyc) plus its phase fraction (matches renderWaveFx)
  drawBeamDots(ctx, (i) => { const frac = (((phaseCyc + i * spreadDeg / 360) % 1) + 1) % 1; return [X(frac), Y(lvl(frac))]; }, beams, 3.2 * s, s, col);
}

export async function makeFxPaletteTile(): Promise<{ tile: HTMLElement }> {
  const tile = document.createElement('section');
  tile.className = 'tile sceneprops-tile';
  tile.innerHTML = `
    <div class="tile-head sp-head">
      <span class="sp-title" id="sp-title">Scene</span>
      <button class="sp-iconbtn" id="sp-rename" title="Rename scene">${ICON.pencil}</button>
      <span class="sp-status" id="sp-status"></span>
      <button class="sp-recall" id="sp-recall" title="Recall / release">${ICON.play}</button>
    </div>
    <div class="sp-main">
      <div class="tile-body sp-content" id="sp-content"></div>
      <nav class="sp-rail" id="sp-rail" hidden>
        <button class="sp-railbtn" data-nav="base" title="Base look"><i class="fa-solid fa-fill-drip"></i><span>Base</span></button>
        <button class="sp-railbtn" data-nav="rack" title="FX Rack"><i class="fa-solid fa-layer-group"></i><span>FX</span></button>
        <button class="sp-railbtn" data-nav="scene" title="Scene settings"><i class="fa-solid fa-gauge-high"></i><span>Scene</span></button>
        <button class="sp-railbtn" data-nav="adv" title="Advanced"><i class="fa-solid fa-gear"></i><span>Adv</span></button>
      </nav>
    </div>`;

  const title = tile.querySelector('#sp-title') as HTMLElement;
  const renameBtn = tile.querySelector('#sp-rename') as HTMLButtonElement;
  const status = tile.querySelector('#sp-status') as HTMLElement;
  const recallBtn = tile.querySelector('#sp-recall') as HTMLButtonElement;
  const railEl = tile.querySelector('#sp-rail') as HTMLElement;
  const railBtns = [...tile.querySelectorAll<HTMLButtonElement>('.sp-railbtn')];
  const content = mount(tile.querySelector('#sp-content') as HTMLElement);

  const state = {
    scene: null as SceneInfo | null,
    bpm: 120,
    view: 'rack' as View,              // which page the rail has open
    layerId: null as string | null,    // FX layer whose editor page is open
    groups: [] as { id: string; name: string }[],
    attrs: [] as { id: string; name: string; group: string }[],
    palettes: [] as { id: string; name: string; colors: string[] }[],
    presets: [] as { id: string; name: string }[],
    banks: [] as { id: string; name: string; scenes: { id: string; name: string }[] }[],
  };
  const reloadLib = async () => {
    state.palettes = await lumox.palettes.list().catch(() => []);
    state.presets = await lumox.presets.list().catch(() => []);
  };
  // Banks (with their scene lists) feed the Advanced tab's jump-to picker and the
  // specific-bank release/protect checklists; refreshed when that tab is opened.
  const loadBanks = async () => {
    const list = await lumox.banks.list().catch(() => []) as any[];
    state.banks = list.map((b) => ({ id: b.id, name: b.name, scenes: (b.scenes ?? []).map((sc: any) => ({ id: sc.id, name: sc.name })) }));
  };

  const layer = (): FxLayerInfo | null => state.scene?.layers.find((l) => l.id === state.layerId) ?? null;

  let suppressId: string | null = null;
  const emitUpdated = (id: string) => { suppressId = id; bus.emit(EV.SCENE_UPDATED, id); suppressId = null; };

  state.groups = await lumox.groups.list().catch(() => []);
  state.attrs = await lumox.library.channelTypes().catch(() => []);
  await reloadLib();
  await loadBanks();
  lumox.transport?.get().then((t) => { state.bpm = t?.bpm ?? 120; if (state.scene) render(); }).catch(() => {});

  async function select(id: string) {
    state.scene = await lumox.scenes.get(id).catch(() => null);
    state.view = 'rack';
    state.layerId = null;
    render(false);
  }
  async function refetch() {
    if (!state.scene) return;
    state.scene = await lumox.scenes.get(state.scene.id).catch(() => null);
    render();
  }
  // Apply an IPC call returning the updated scene (or {scene} for addLayer).
  async function apply(p: Promise<unknown>, affectsBanks = false): Promise<void> {
    const res = await p.catch(() => null) as SceneInfo | { scene: SceneInfo; layerId: string } | null;
    if (!res) return;
    const info = 'scene' in res ? res.scene : res;
    state.scene = info;
    if ('layerId' in res) { state.layerId = res.layerId; state.view = 'layer'; render(false); }   // jump to the new layer's page
    else render();
    if (affectsBanks) emitUpdated(info.id);
  }

  // keepScroll preserves the body's scroll offset across an in-place rerender
  // (commits, expand/collapse); navigation (scene/tab switch) passes false to reset it.
  function render(keepScroll = true) {
    const scrollTop = keepScroll ? content.el.scrollTop : 0;
    stopPreviewAnim();   // any rerender invalidates the old preview node; the layer page restarts it
    const s = state.scene;
    title.textContent = s ? s.name : 'Scene';
    renameBtn.disabled = !s;
    recallBtn.disabled = !s;
    recallBtn.classList.toggle('on', !!s?.active);
    status.textContent = s ? (s.active ? (s.paused ? 'PAUSED' : 'LIVE') : 'idle') : '';

    if (state.view === 'layer' && !layer()) state.view = 'rack';   // layer deleted → fall back to the rack list
    updateRail(s);

    if (!s) content.set(html`<div class="sp-empty">Click a scene in CONTROL → Banks to edit it.</div>`);
    else if (state.view === 'base') renderBase(s);
    else if (state.view === 'layer') renderLayerPage(s);
    else if (state.view === 'scene') renderScene(s);
    else if (state.view === 'adv') renderAdvanced(s);
    else renderRack(s);
    content.el.scrollTop = scrollTop;
  }

  // ---- right-hand section rail -------------------------------------------
  // Always-visible quick switch between the top-level pages. A layer page is a
  // sub-page of the rack, so the rail shows FX Rack active while editing a layer.
  function updateRail(s: SceneInfo | null): void {
    railEl.hidden = !s;
    const active = state.view === 'layer' ? 'rack' : state.view;
    for (const b of railBtns) {
      b.disabled = !s;
      b.classList.toggle('active', b.dataset.nav === active);
    }
  }

  // ---- base page (STATIC / CHASE + steps) ---------------------------------
  function renderBase(s: SceneInfo) {
    content.set(html`
      <div class="fxe-row">
        <span class="sp-lbl">Base look</span>
        <span class="seg sp-seg">
          <button class="seg-btn${s.type === 'static' ? ' active' : ''}" data-act="base" data-val="static">STATIC</button>
          <button class="seg-btn${s.type === 'chase' ? ' active' : ''}" data-act="base" data-val="chase">CHASE</button>
        </span>
      </div>
      ${s.type === 'chase'
        ? stepsBlock(s)
        : html`<div class="sp-note">Static holds one look. Switch to Chase to step through captured cues.</div>`}`);
  }

  // ---- FX rack page (flat layer list + add + presets) ---------------------
  function renderRack(s: SceneInfo) {
    content.set(html`
      <div class="fxrack">
        ${s.layers.length
          ? s.layers.map((l) => layerItem(l))
          : html`<div class="sp-empty">No FX layers. Add one below — they stack over the base look.</div>`}
      </div>
      <div class="fxrack-add">
        ${KINDS.map((k) => html`<button class="fx-btn" data-act="addlayer" data-kind="${k.kind}" title="Add ${k.label} FX">${raw(k.icon)} ${k.label}</button>`)}
      </div>

      <div class="fxrack-hdr">PRESETS</div>
      <div class="fxe-row">
        <select class="sp-select" id="preset-pick">
          <option value="">Apply preset…</option>
          ${state.presets.map((p) => html`<option value="${p.id}">${p.name}</option>`)}
        </select>
        <button class="fe-btn" data-act="preset-save" title="Save this FX rack as a preset"${s.layers.length ? '' : ' disabled'}>Save rack</button>
      </div>`);
  }

  // One rack row — flat and clickable: tapping it opens the layer's full-width
  // editor page. The enable dot is the only nested action (toggles bypass in place).
  function layerItem(l: FxLayerInfo) {
    const gid = l.target.mode === 'group' ? l.target.groupId : '';
    const tgt = gid ? (state.groups.find((g) => g.id === gid)?.name ?? 'Group') : 'All';
    return html`
      <div class="fxlayer${l.enabled ? '' : ' off'}" data-act="open" data-l="${l.id}" title="Edit layer">
        <button class="fxrow-on${l.enabled ? ' on' : ''}" data-act="enable" data-l="${l.id}" title="Enable / bypass"><span class="fxrow-dot"></span></button>
        <span class="fxlayer-name">${raw(kindIcon(l.kind))}<span>${kindLabel(l.kind)}</span></span>
        <span class="fxlayer-tgt">${tgt}</span>
        ${raw(ICON.right)}
      </div>`;
  }

  // ---- FX layer page (full-width editor for one layer) --------------------
  // A title row (icon + reorder + enable + delete) above the layer's editor body.
  function renderLayerPage(s: SceneInfo) {
    const l = layer();
    if (!l) { renderRack(s); return; }
    content.set(html`
      <button class="sp-back" data-act="back" title="Back to FX Rack">${raw(ICON.back)}<span>FX Rack</span></button>
      <div class="fx-layerhead${l.enabled ? '' : ' off'}">
        <span class="fxlayer-name">${raw(kindIcon(l.kind))}<span>${kindLabel(l.kind)}</span></span>
        <span class="fx-layeracts">
          <button class="stp-mini" data-act="lup" data-l="${l.id}" title="Move up">${raw(ICON.up)}</button>
          <button class="stp-mini" data-act="ldown" data-l="${l.id}" title="Move down">${raw(ICON.down)}</button>
          <button class="fxrow-on${l.enabled ? ' on' : ''}" data-act="enable" data-l="${l.id}" title="Enable / bypass"><span class="fxrow-dot"></span></button>
          <button class="stp-mini stp-del" data-act="ldel" data-l="${l.id}" title="Remove layer">${raw(ICON.trash)}</button>
        </span>
      </div>
      ${layerBody(l)}`);
    mountLayerControls(s, l);
  }

  // The layer page's editor body: target + sweep order, kind-specific config,
  // then timing (knobs + direction + driving mode). The knobs are mounted after
  // render by mountLayerControls().
  function layerBody(l: FxLayerInfo) {
    return html`
      <div class="fxe-row"><span class="sp-lbl">Target</span>
        <select class="sp-select" data-tgt="${l.id}">
          <option value="all" ${l.target.mode === 'all' ? 'selected' : ''}>All</option>
          <option value="selection" ${l.target.mode === 'selection' ? 'selected' : ''}>Selection</option>
          ${state.groups.map((g) => html`<option value="${g.id}" ${l.target.mode === 'group' && l.target.groupId === g.id ? 'selected' : ''}>${g.name}</option>`)}
        </select>
      </div>
      <div class="fxe-row"><span class="sp-lbl">Order</span>
        <select class="sp-select" data-ord="${l.id}">
          ${(['patch', 'reverse', 'mirror', 'random'] as const).map((o) => html`<option value="${o}" ${l.order === o ? 'selected' : ''}>${o[0].toUpperCase() + o.slice(1)}</option>`)}
        </select>
      </div>
      ${kindEditor(l)}

      <div class="fxrack-hdr">TIMING</div>
      <div class="sp-knobs" id="l-knobs"></div>
      <div class="sp-transport">
        <button class="sp-tb sp-dir${l.direction !== 'forward' ? ' on' : ''}" data-tim="direction" title="Direction: ${l.direction}">${raw(dirIcon(l.direction))}</button>
      </div>
      <div class="sp-row"><span class="sp-lbl">Driving mode</span>
        <span class="seg sp-seg">
          <button class="seg-btn${l.driveMode === 'off' ? ' active' : ''}" data-tim="drive" data-val="off">Off</button>
          <button class="seg-btn${l.driveMode === 'bpm' ? ' active' : ''}" data-tim="drive" data-val="bpm">BPM</button>
        </span>
      </div>
      ${l.driveMode === 'bpm'
        ? html`<div class="sp-row"><span class="sp-lbl">Beat division</span>
            <span class="sp-beat"><span class="sp-beatval">${fmtBeat(l.beatDiv)}</span>
              <button class="sp-mini" data-tim="beat" data-val="reset">--</button>
              <button class="sp-mini" data-tim="beat" data-val="half">/2</button>
              <button class="sp-mini" data-tim="beat" data-val="double">x2</button>
            </span></div>`
        : html`<div class="sp-field"><span class="sp-lbl">Rate</span>
            <span class="sp-fieldval"><input class="sp-num" type="number" data-tim="rateMs" min="20" step="50" value="${Math.round(l.rateMs)}" /><span class="sp-unit">ms</span></span></div>`}`;
  }

  // Mount the expanded layer's timing knobs and (for move/curve/value) start the
  // live preview animation. Called after the rack's innerHTML is in place.
  function mountLayerControls(s: SceneInfo, l: FxLayerInfo): void {
    const kc = content.el.querySelector('#l-knobs') as HTMLElement | null;
    if (kc) {
      kc.appendChild(makeKnob({ label: 'SPEED', value: l.speed, min: 0.25, max: 4, default: 1, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { l.speed = v; redrawPreview(); }, onChange: (v) => apply(lumox.scenes.setLayerTiming(s.id, l.id, { speed: v })) }).el);
      kc.appendChild(makeKnob({ label: 'PHASING', value: l.spread, min: 0, max: 360, default: 30, format: (v) => `${Math.round(v)}°`, onInput: (v) => { l.spread = v; redrawPreview(); }, onChange: (v) => apply(lumox.scenes.setLayerTiming(s.id, l.id, { spread: v })) }).el);
      if (l.kind === 'move') kc.appendChild(makeKnob({ label: 'SIZE', value: l.size, min: 0, max: 127, default: 96, format: (v) => `${Math.round(v)}`, onChange: (v) => apply(lumox.scenes.setLayerTiming(s.id, l.id, { size: v })) }).el);
    }
    if (l.kind === 'move' || l.kind === 'curve' || l.kind === 'value') startPreviewAnim();
  }

  function stepsBlock(s: SceneInfo) {
    const last = s.steps.length - 1;
    return html`
      <div class="fxrack-hdr">STEPS</div>
      ${s.steps.length
        ? html`<div class="stp-list">
            ${s.steps.map((st, i) => html`
              <div class="stp-row" data-step="${i}">
                <span class="stp-n">${i + 1}</span>
                <span class="stp-tcell"><input class="stp-time" type="number" min="0" step="0.1" data-step="${i}" data-field="fadeMs" value="${r2(st.fadeMs / 1000)}" /><span class="stp-u">s</span></span>
                <span class="stp-tcell"><input class="stp-time" type="number" min="0" step="0.1" data-step="${i}" data-field="waitMs" value="${r2(st.waitMs / 1000)}" /><span class="stp-u">s</span></span>
                <span class="stp-rowacts">
                  <button class="stp-mini" data-act="stepup" data-step="${i}" ${i === 0 ? 'disabled' : ''}>${raw(ICON.up)}</button>
                  <button class="stp-mini" data-act="stepdown" data-step="${i}" ${i === last ? 'disabled' : ''}>${raw(ICON.down)}</button>
                  <button class="stp-mini stp-del" data-act="stepdel" data-step="${i}">${raw(ICON.trash)}</button>
                </span>
              </div>`)}
          </div>`
        : html`<div class="sp-empty">No steps. Capture the current output as the first step.</div>`}
      <button class="sp-addstep" data-act="addstep">${raw(ICON.plus)} Capture step (${s.stepCount})</button>`;
  }

  // ---- field helpers (layer editor) --------------------------------------
  const row = (label: string, control: unknown) => html`<div class="fxe-row"><span class="sp-lbl">${label}</span>${control}</div>`;
  const slider = (field: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string) =>
    html`<span class="fxe-slider"><span class="fxe-sval">${fmt(val)}</span><input type="range" data-cfg="${field}" min="${min}" max="${max}" step="${step}" value="${val}" /></span>`;
  const toggle = (field: string, on: boolean) =>
    html`<button class="sp-toggle${on ? ' on' : ''}" data-cfgtoggle="${field}" role="switch" aria-checked="${on}"><span class="sp-toggle-dot"></span></button>`;
  const sel = (field: string, opts: [string, string][], selected: string, kind: 'cfg' | 'tim' = 'cfg') =>
    html`<select class="sp-select" data-${kind === 'cfg' ? 'cfg' : 'tim'}="${field}">${opts.map(([v, l]) => html`<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`)}</select>`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const deg = (v: number) => `${Math.round(v)}°`;
  const int = (v: number) => `${Math.round(v)}`;

  function attrSelect(selected: string) {
    const byGroup = new Map<string, { id: string; name: string }[]>();
    for (const t of state.attrs) { const arr = byGroup.get(t.group) ?? []; arr.push(t); byGroup.set(t.group, arr); }
    const groups = [...byGroup].map(([g, ts]) =>
      `<optgroup label="${g}">${ts.map((t) => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${t.name}</option>`).join('')}</optgroup>`).join('');
    return html`<select class="sp-select" data-cfg="attr">${raw(groups)}</select>`;
  }

  function kindEditor(l: FxLayerInfo) {
    if (l.kind === 'color' && l.color) {
      const c = l.color;
      const grad = c.palette.length
        ? (c.palette.length === 1 ? c.palette[0] : `linear-gradient(90deg, ${c.palette.join(', ')})`)
        : 'linear-gradient(90deg, #ff0040, #ffd000, #5cff4a, #00e0ff, #6a4bff, #ff45c8, #ff0040)';
      return html`
        <div class="fxe-gradient" style="background:${grad}"></div>
        <div class="fxe-row"><span class="sp-lbl">Palette</span>
          <span class="cfx-pal">
            ${c.palette.map((hex, i) => html`<span class="cfx-swatch"><input class="cfx-sw" type="color" data-field="cfx-swatch" value="${hex}" /><button class="cfx-x" data-act="cfx-del" data-i="${i}">${raw(ICON.x)}</button></span>`)}
            <button class="cfx-add" data-act="cfx-add" title="Add colour (empty = rainbow)">${raw(ICON.plus)}</button>
          </span>
        </div>
        <div class="fxe-row"><span class="sp-lbl">Saved</span>
          <select class="sp-select" id="pal-pick">
            <option value="">Apply palette…</option>
            ${state.palettes.map((p) => html`<option value="${p.id}">${p.name}</option>`)}
          </select>
          <button class="fe-btn" data-act="pal-save" title="Save this palette"${c.palette.length ? '' : ' disabled'}>Save</button>
        </div>
        ${row('Saturation', slider('saturation', 0, 1, 0.01, c.saturation, pct))}
        ${row('Fade', slider('fade', 0, 1, 0.01, c.fade, pct))}
        ${row('Color width', slider('colorWidth', 0, 4, 0.05, c.colorWidth, (v) => r2(v).toString()))}
        ${row('Angle', slider('angle', 0, 360, 1, c.angle, deg))}
        ${row('Grayscale', toggle('grayscale', c.grayscale))}
        ${row('Randomize', toggle('randomize', c.randomize))}`;
    }
    if (l.kind === 'move' && l.move) {
      const m = l.move;
      return html`
        ${row('Shape', sel('shape', ['circle', 'figure8', 'line', 'square'].map((o) => [o, o === 'figure8' ? 'Figure 8' : o[0].toUpperCase() + o.slice(1)] as [string, string]), m.shape))}
        <div class="fxe-shape"><canvas class="fxe-canvas"></canvas></div>
        ${row('Size X', slider('sizeX', 0, 1, 0.01, m.sizeX, pct))}
        ${row('Size Y', slider('sizeY', 0, 1, 0.01, m.sizeY, pct))}
        ${row('Center X', slider('centerX', 0, 255, 1, m.centerX, int))}
        ${row('Center Y', slider('centerY', 0, 255, 1, m.centerY, int))}
        ${row('Rotation', slider('phaseShape', 0, 360, 1, m.phaseShape, deg))}
        ${row('Symmetry', toggle('symmetry', m.symmetry))}`;
    }
    if ((l.kind === 'curve' && l.curve) || (l.kind === 'value' && l.value)) {
      const c = (l.curve ?? l.value)!;
      return html`
        ${row('Attribute', attrSelect(c.attr))}
        ${row('Waveform', sel('waveform', ['sine', 'triangle', 'sawtooth', 'square', 'random'].map((o) => [o, o[0].toUpperCase() + o.slice(1)] as [string, string]), c.waveform))}
        <div class="fxe-shape fxe-wave"><canvas class="fxe-canvas"></canvas></div>
        ${row('Min', slider('min', 0, 255, 1, c.min, int))}
        ${row('Max', slider('max', 0, 255, 1, c.max, int))}
        ${row('Duty', slider('duty', 0, 1, 0.01, c.duty, pct))}
        ${row('Invert', toggle('invert', c.invert))}`;
    }
    if (l.kind === 'chaser' && l.chaser) {
      const c = l.chaser;
      return html`
        ${row('Attribute', attrSelect(c.attr))}
        ${row('Lit count', slider('litCount', 1, 32, 1, c.litCount, int))}
        ${row('Gap', slider('gap', 0, 32, 1, c.gap, int))}
        ${row('Fade', slider('fade', 0, 1, 0.01, c.fade, pct))}
        ${row('On level', slider('level', 0, 255, 1, c.level, int))}
        ${row('Off level', slider('bg', 0, 255, 1, c.bg, int))}`;
    }
    if (l.kind === 'matrix' && l.matrix) {
      const m = l.matrix;
      const grad = m.palette.length
        ? (m.palette.length === 1 ? m.palette[0] : `linear-gradient(90deg, ${m.palette.join(', ')})`)
        : 'linear-gradient(90deg, #ff0040, #ffd000, #5cff4a, #00e0ff, #6a4bff, #ff45c8, #ff0040)';
      return html`
        <div class="fxe-hint">Pixel-maps each emitter by its 2D position on the STAGE tile.</div>
        ${row('Pattern', sel('pattern', [['wipe', 'Wipe'], ['radial', 'Radial'], ['plasma', 'Plasma']], m.pattern))}
        <div class="fxe-gradient" style="background:${grad}"></div>
        <div class="fxe-row"><span class="sp-lbl">Palette</span>
          <span class="cfx-pal">
            ${m.palette.map((hex, i) => html`<span class="cfx-swatch"><input class="cfx-sw" type="color" data-field="cfx-swatch" value="${hex}" /><button class="cfx-x" data-act="cfx-del" data-i="${i}">${raw(ICON.x)}</button></span>`)}
            <button class="cfx-add" data-act="cfx-add" title="Add colour (empty = rainbow)">${raw(ICON.plus)}</button>
          </span>
        </div>
        ${row('Saturation', slider('saturation', 0, 1, 0.01, m.saturation, pct))}
        ${row('Fade', slider('fade', 0, 1, 0.01, m.fade, pct))}
        ${row('Scale', slider('scale', 0.1, 8, 0.05, m.scale, (v) => r2(v).toString()))}
        ${row('Angle', slider('angle', 0, 360, 1, m.angle, deg))}`;
    }
    return html``;
  }

  // ---- scene properties view ---------------------------------------------
  function renderScene(s: SceneInfo) {
    const chase = s.type === 'chase';
    const field = (label: string, name: string, value: number, unit: string, step: number) => html`
      <div class="sp-field"><span class="sp-lbl">${label}</span>
        <span class="sp-fieldval"><input class="sp-num" type="number" data-field="${name}" min="0" step="${step}" value="${r2(value)}" /><span class="sp-unit">${unit}</span></span>
      </div>`;
    const dis = (on: boolean) => (on ? '' : 'disabled');

    content.set(html`
      <div class="sp-knobs" id="sp-knobs"></div>
      <div class="sp-transport">
        <button class="sp-tb" data-act="toStart" ${dis(chase)}>${raw(ICON.toStart)}</button>
        <button class="sp-tb" data-act="prev" ${dis(chase)}>${raw(ICON.prev)}</button>
        <button class="sp-tb sp-pp" data-act="playpause" ${dis(chase)}>${raw(s.paused ? ICON.play : ICON.pause)}</button>
        <button class="sp-tb" data-act="next" ${dis(chase)}>${raw(ICON.next)}</button>
        <button class="sp-tb" data-act="toEnd" ${dis(chase)}>${raw(ICON.toEnd)}</button>
        <button class="sp-tb sp-dir${s.direction !== 'forward' ? ' on' : ''}" data-act="direction" ${dis(chase)} title="Direction: ${s.direction}">${raw(dirIcon(s.direction))}</button>
      </div>
      <div class="sp-row"><span class="sp-lbl">Driving mode</span>
        <span class="seg sp-seg">
          <button class="seg-btn${s.driveMode === 'off' ? ' active' : ''}" data-act="drive" data-val="off" ${dis(chase)}>Off</button>
          <button class="seg-btn${s.driveMode === 'bpm' ? ' active' : ''}" data-act="drive" data-val="bpm" ${dis(chase)}>BPM</button>
        </span>
      </div>
      <div class="sp-row"><span class="sp-lbl">Beat division</span>
        <span class="sp-beat"><span class="sp-beatval">${fmtBeat(s.beatDiv)}</span>
          <button class="sp-mini" data-act="beat" data-val="reset" ${dis(chase)}>--</button>
          <button class="sp-mini" data-act="beat" data-val="half" ${dis(chase)}>/2</button>
          <button class="sp-mini" data-act="beat" data-val="double" ${dis(chase)}>x2</button>
        </span>
      </div>
      <div class="sp-row"><span class="sp-lbl">Tempo</span>
        <span class="sp-fieldval"><input class="sp-num" type="number" data-field="bpm" min="20" max="300" step="1" value="${Math.round(state.bpm)}" /><span class="sp-unit">BPM</span></span>
      </div>
      <div class="sp-row"><span class="sp-lbl">Starting mode</span>
        <span class="seg sp-seg">
          <button class="seg-btn${s.startMode === 'restart' ? ' active' : ''}" data-act="start" data-val="restart" title="Restart">${raw(ICON.restart)}</button>
          <button class="seg-btn${s.startMode === 'continue' ? ' active' : ''}" data-act="start" data-val="continue" title="Continue">${raw(ICON.play)}</button>
          <button class="seg-btn${s.startMode === 'random' ? ' active' : ''}" data-act="start" data-val="random" title="Random">${raw(ICON.random)}</button>
        </span>
      </div>
      <div class="sp-fields">
        ${field('Fade in', 'fadeIn', s.fadeIn, 's', 0.1)}
        ${field('Fade out', 'fadeOut', s.fadeOut, 's', 0.1)}
        <div class="sp-field"><span class="sp-lbl">Fade speed</span>
          <span class="sp-fadespeed"><span class="sp-fsval" id="sp-fsval">${s.fadeSpeed.toFixed(1)}</span><input type="range" data-field="fadeSpeed" min="0.1" max="10" step="0.1" value="${s.fadeSpeed}" /></span>
        </div>
        ${field('Phase in', 'phaseInSec', s.phaseIn / 1000, 's', 0.05)}
        ${field('Phase out', 'phaseOutSec', s.phaseOut / 1000, 's', 0.05)}
      </div>`);

    const kc = content.el.querySelector('#sp-knobs') as HTMLElement;
    const id = s.id;
    kc.appendChild(makeKnob({ label: 'DIMMER', value: s.level, min: 0, max: 1, default: 1, format: (v) => `${Math.round(v * 100)}%`, onChange: (v) => apply(lumox.scenes.setLevel(id, v), true) }).el);
    kc.appendChild(makeKnob({ label: 'SPEED', value: s.speed, min: 0.25, max: 4, default: 1, disabled: !chase, format: (v) => `${v.toFixed(2)}×`, onChange: (v) => apply(lumox.scenes.setSpeed(id, v)) }).el);
  }

  // ---- advanced view -----------------------------------------------------
  // Priority (blend tier), loop count + jump-to, release / protect scopes and
  // flash. Controls carry data-adv / data-advtoggle / data-advbank so they route
  // to their own handlers, separate from the FX-layer config wiring.
  const SCOPE_OPTS: [string, string][] = [['off', 'Off'], ['all', 'All'], ['bank', 'Bank'], ['outside-bank', 'Outside bank'], ['specific', 'Specific']];

  function renderAdvanced(s: SceneInfo) {
    const advSeg = (field: string, opts: [string, string][], val: string) =>
      html`<span class="seg sp-seg">${opts.map(([v, l]) => html`<button class="seg-btn${v === val ? ' active' : ''}" data-adv="${field}" data-val="${v}">${l}</button>`)}</span>`;
    const advToggle = (field: string, on: boolean) =>
      html`<button class="sp-toggle${on ? ' on' : ''}" data-advtoggle="${field}" role="switch" aria-checked="${on}"><span class="sp-toggle-dot"></span></button>`;
    const advScope = (field: string, val: string) =>
      html`<select class="sp-select" data-adv="${field}">${SCOPE_OPTS.map(([v, l]) => html`<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`)}</select>`;
    const bankChecks = (field: string, selected: string[]) =>
      html`<div class="adv-banks">${state.banks.length
        ? state.banks.map((b) => html`<label class="adv-bankchk"><input type="checkbox" data-advbank="${field}" value="${b.id}" ${selected.includes(b.id) ? 'checked' : ''} /> ${b.name}</label>`)
        : html`<span class="sp-lbl">No banks.</span>`}</div>`;

    const jumpVal = !s.jumpTo ? '' : s.jumpTo.mode === 'scene' ? `scene:${s.jumpTo.sceneId ?? ''}` : s.jumpTo.mode;
    const allScenes = state.banks.flatMap((b) => b.scenes.map((sc) => ({ id: sc.id, name: sc.name, bank: b.name })));

    content.set(html`
      <div class="sp-row"><span class="sp-lbl">Priority</span>
        ${advSeg('priority', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], s.priority)}
      </div>

      <div class="fxrack-hdr">LOOP</div>
      <div class="sp-row"><span class="sp-lbl">Loop</span>
        ${advSeg('loop-mode', [['always', 'Always'], ['count', 'Count']], s.loop.mode)}
      </div>
      ${s.loop.mode === 'count'
        ? html`<div class="sp-field"><span class="sp-lbl">Cycles</span>
            <span class="sp-fieldval"><input class="sp-num" type="number" data-adv="loop-count" min="1" max="9999" step="1" value="${s.loop.count}" /><span class="sp-unit">×</span></span></div>
          <div class="sp-row"><span class="sp-lbl">Jump to</span>
            <select class="sp-select" data-adv="jump">
              <option value="" ${jumpVal === '' ? 'selected' : ''}>— None —</option>
              <option value="next" ${jumpVal === 'next' ? 'selected' : ''}>Next in bank</option>
              <option value="prev" ${jumpVal === 'prev' ? 'selected' : ''}>Previous in bank</option>
              <optgroup label="Scene">
                ${allScenes.filter((sc) => sc.id !== s.id).map((sc) => html`<option value="scene:${sc.id}" ${jumpVal === `scene:${sc.id}` ? 'selected' : ''}>${sc.bank} · ${sc.name}</option>`)}
              </optgroup>
            </select>
          </div>
          <div class="sp-row"><span class="sp-lbl">Release at end</span>${advToggle('release-end', s.releaseAtEnd)}</div>`
        : html`<div class="sp-note">A counted loop can release the scene, hold its last frame, or jump to another cue when it finishes.</div>`}

      <div class="fxrack-hdr">RELEASE</div>
      <div class="sp-row"><span class="sp-lbl">Release mode</span>${advScope('release-mode', s.releaseMode)}</div>
      ${s.releaseMode === 'specific' ? bankChecks('release-banks', s.releaseBanks) : ''}
      <div class="sp-row"><span class="sp-lbl">Protect from release</span>${advScope('protect-mode', s.protectFromRelease)}</div>
      ${s.protectFromRelease === 'specific' ? bankChecks('protect-banks', s.protectBanks) : ''}

      <div class="fxrack-hdr">FLASH</div>
      <div class="sp-row"><span class="sp-lbl">Flash button</span>${advToggle('flash', s.flash)}</div>
      <div class="sp-note">Flash plays the scene while its CONTROL cell is held down, releasing on mouse-up.</div>`);
  }

  // ---- live preview playhead ---------------------------------------------
  // The preview dots track the live FX playhead. When the scene is live the
  // engine's actual per-layer phase is polled and dead-reckoned forward between
  // samples, so the dots sit exactly where the rig is. When the scene is idle
  // there's no live output to track, so the preview free-runs on a local clock
  // (design-time animation). Period + direction math mirror the mixer.
  let previewRaf = 0;
  let phasePoll = 0;
  let phaseSync: { phaseMs: number; periodMs: number; paused: boolean; layerId: string; at: number } | null = null;
  const PHASE_STALE_MS = 500;

  function layerPeriodMs(l: FxLayerInfo): number {
    if (l.driveMode === 'bpm') {
      const beat = 60000 / Math.max(1, state.bpm);
      return Math.max(1, beat / Math.max(0.0001, l.beatDiv));
    }
    return Math.max(1, l.rateMs / Math.max(0.01, l.speed));
  }
  // Raw phase clock (ms) + period to feed the preview: the engine's live
  // playhead dead-reckoned to `nowMs` when synced, else a free-run local clock.
  function previewClock(l: FxLayerInfo, nowMs: number): { clockMs: number; periodMs: number } {
    if (phaseSync && phaseSync.layerId === l.id && nowMs - phaseSync.at < PHASE_STALE_MS) {
      const clockMs = phaseSync.paused ? phaseSync.phaseMs : phaseSync.phaseMs + (nowMs - phaseSync.at);
      return { clockMs, periodMs: phaseSync.periodMs };
    }
    return { clockMs: nowMs, periodMs: layerPeriodMs(l) };
  }
  // Playhead position in cycles for a raw clock + period, honouring direction.
  function previewPhaseCyc(l: FxLayerInfo, clockMs: number, periodMs: number): number {
    let eff = clockMs;
    if (l.direction === 'backward') eff = -clockMs;
    else if (l.direction === 'bounce') {
      const twoP = 2 * periodMs;
      const t = ((clockMs % twoP) + twoP) % twoP;
      eff = t <= periodMs ? t : twoP - t;   // triangle: out then back
    }
    return eff / periodMs;
  }

  async function pollPhase(): Promise<void> {
    const s = state.scene, l = layer();
    if (!s || !l) { phaseSync = null; return; }
    const info = await lumox.scenes.layerPhase(s.id, l.id).catch(() => null);
    phaseSync = info ? { ...info, layerId: l.id, at: performance.now() } : null;
  }

  // Stops the loop but keeps the last phase sample: a commit re-renders the whole
  // rack, and dead-reckoning from the kept sample bridges the gap so the dots
  // don't snap. The layer-id guard in previewClock discards it if the layer changed.
  function stopPreviewAnim(): void {
    if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
    if (phasePoll) { clearInterval(phasePoll); phasePoll = 0; }
  }
  function startPreviewAnim(): void {
    stopPreviewAnim();
    pollPhase();
    phasePoll = window.setInterval(pollPhase, 150);
    redrawPreview();   // paint frame 0 synchronously so the canvas never flashes blank
    const step = (t: number): void => {
      if (state.view !== 'layer' || !content.el.querySelector('.fxe-shape')) { stopPreviewAnim(); return; }
      redrawPreview(t);
      previewRaf = requestAnimationFrame(step);
    };
    previewRaf = requestAnimationFrame(step);
  }

  // Resolve theme colours for the canvas from CSS custom properties (accent is
  // inherited onto `.fxe-shape` via `color`, so it tracks the active theme).
  function themeColors(box: Element): PreviewColors {
    const cs = getComputedStyle(box);
    const root = getComputedStyle(document.documentElement);
    return {
      accent: cs.color || '#5aa9ff',
      border: root.getPropertyValue('--border').trim() || '#444',
      fgDim: root.getPropertyValue('--fg-dim').trim() || '#888',
    };
  }

  // Redraw the move/curve/value preview graph from the editor's current DOM
  // control values, with the dots at the live playhead for `tMs`. Called per
  // animation frame and on slider drag (before the commit). The canvas backing
  // store is kept in sync with its CSS size × devicePixelRatio for crisp lines.
  function redrawPreview(tMs = performance.now()): void {
    const l = layer(); if (!l) return;
    const box = content.el.querySelector('.fxe-shape'); if (!box) return;
    const canvas = box.querySelector('canvas') as HTMLCanvasElement | null; if (!canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const col = themeColors(box);
    const num = (f: string, d: number): number => { const el = content.el.querySelector(`input[data-cfg="${f}"]`) as HTMLInputElement | null; return el ? Number(el.value) : d; };
    const selv = (f: string, d: string): string => { const el = content.el.querySelector(`select[data-cfg="${f}"]`) as HTMLSelectElement | null; return el ? el.value : d; };
    const tog = (f: string): boolean => content.el.querySelector(`[data-cfgtoggle="${f}"]`)?.classList.contains('on') ?? false;
    const { clockMs, periodMs } = previewClock(l, tMs);
    const cyc = previewPhaseCyc(l, clockMs, periodMs);
    if (l.kind === 'move' && l.move) {
      drawShape(ctx, w, h, selv('shape', l.move.shape), num('sizeX', 1), num('sizeY', 1), num('phaseShape', 0), l.beams, l.spread, cyc * TAU, col);
    } else if ((l.kind === 'curve' && l.curve) || (l.kind === 'value' && l.value)) {
      const c = (l.curve ?? l.value)!;
      drawWave(ctx, w, h, selv('waveform', c.waveform), num('duty', 0.5), tog('invert'), num('min', 0), num('max', 255), l.beams, l.spread, cyc, col);
    }
  }

  // ---- delegated events --------------------------------------------------
  content.on('click', '[data-act]', (_e, t) => {
    const s = state.scene; if (!s) return;
    const id = s.id;
    const lid = (t.dataset.l as string) || state.layerId || '';
    const act = t.dataset.act as string;
    const val = t.dataset.val as string | undefined;
    switch (act) {
      case 'base': apply(lumox.scenes.setType(id, val as string), true); break;
      case 'addlayer': apply(lumox.scenes.addLayer(id, t.dataset.kind as FxKind), true); break;
      case 'open': state.view = 'layer'; state.layerId = lid; render(false); break;
      case 'back': state.view = 'rack'; render(false); break;
      case 'enable': { const l = s.layers.find((x) => x.id === lid); if (l) apply(lumox.scenes.setLayerEnabled(id, lid, !l.enabled), true); break; }
      case 'lup': apply(lumox.scenes.moveLayer(id, lid, -1), true); break;
      case 'ldown': apply(lumox.scenes.moveLayer(id, lid, +1), true); break;
      case 'ldel': apply(lumox.scenes.removeLayer(id, lid), true); break;
      case 'preset-save': { const n = prompt('Preset name', s.name); if (n?.trim()) lumox.presets.saveRack(id, n.trim()).then(async () => { await reloadLib(); render(); }).catch(() => {}); break; }
      case 'pal-save': { const l = layer(); if (l?.color || l?.matrix) { const n = prompt('Palette name', 'Palette'); if (n?.trim()) lumox.palettes.add(n.trim(), readPalette()).then(async () => { await reloadLib(); render(); }).catch(() => {}); } break; }
      case 'cfx-add': { const l = layer(); if (l?.color || l?.matrix) apply(lumox.scenes.setLayerConfig(id, l.id, { palette: [...readPalette(), '#ffffff'] })); break; }
      case 'cfx-del': { const l = layer(); if (l?.color || l?.matrix) { const p = readPalette(); p.splice(Number(t.dataset.i), 1); apply(lumox.scenes.setLayerConfig(id, l.id, { palette: p })); } break; }
      case 'addstep': lumox.scenes.addStep(id).then(() => { emitUpdated(id); refetch(); }).catch(() => {}); break;
      case 'stepdel': lumox.scenes.removeStep(id, Number(t.dataset.step)).then(() => { emitUpdated(id); refetch(); }).catch(() => {}); break;
      case 'stepup': lumox.scenes.moveStep(id, Number(t.dataset.step), -1).then(() => { emitUpdated(id); refetch(); }).catch(() => {}); break;
      case 'stepdown': lumox.scenes.moveStep(id, Number(t.dataset.step), +1).then(() => { emitUpdated(id); refetch(); }).catch(() => {}); break;
      // scene transport / props
      case 'toStart': apply(lumox.scenes.transport(id, 'toStart')); break;
      case 'prev': apply(lumox.scenes.transport(id, 'prev')); break;
      case 'next': apply(lumox.scenes.transport(id, 'next')); break;
      case 'toEnd': apply(lumox.scenes.transport(id, 'toEnd')); break;
      case 'playpause': apply(lumox.scenes.transport(id, s.paused ? 'resume' : 'pause')); break;
      case 'direction': { const order = ['forward', 'backward', 'bounce'] as const; apply(lumox.scenes.setDirection(id, order[(order.indexOf(s.direction) + 1) % 3])); break; }
      case 'drive': apply(lumox.scenes.setDrive(id, { mode: val as 'off' | 'bpm' })); break;
      case 'beat': { const bd = val === 'reset' ? 1 : val === 'half' ? s.beatDiv / 2 : s.beatDiv * 2; apply(lumox.scenes.setDrive(id, { beatDiv: bd })); break; }
      case 'start': apply(lumox.scenes.setStartMode(id, val as 'restart' | 'continue' | 'random')); break;
    }
  });

  // per-layer timing TOGGLE/segment buttons in the expanded layer
  content.on('click', '[data-tim]', (_e, t) => {
    const s = state.scene, l = layer(); if (!s || !l) return;
    const f = (t as HTMLElement).dataset.tim as string;
    const val = (t as HTMLElement).dataset.val as string | undefined;
    if (f === 'direction') { const order = ['forward', 'backward', 'bounce'] as const; apply(lumox.scenes.setLayerTiming(s.id, l.id, { direction: order[(order.indexOf(l.direction) + 1) % 3] })); }
    else if (f === 'drive' && val) apply(lumox.scenes.setLayerTiming(s.id, l.id, { driveMode: val as 'off' | 'bpm' }));
    else if (f === 'beat') { const bd = val === 'reset' ? 1 : val === 'half' ? l.beatDiv / 2 : l.beatDiv * 2; apply(lumox.scenes.setLayerTiming(s.id, l.id, { beatDiv: bd })); }
  });

  const readPalette = (): string[] => [...content.el.querySelectorAll<HTMLInputElement>('.cfx-sw')].map((el) => el.value);

  // layer target / order selects
  content.on('change', '[data-tgt]', (_e, t) => {
    const s = state.scene; if (!s) return;
    const lid = (t as HTMLElement).dataset.tgt as string;
    const v = (t as HTMLInputElement).value;
    const mode = v === 'all' ? 'all' : v === 'selection' ? 'selection' : 'group';
    apply(lumox.scenes.setLayerTarget(s.id, lid, mode, mode === 'group' ? v : undefined), true);
  });
  content.on('change', '[data-ord]', (_e, t) => {
    const s = state.scene; if (!s) return;
    apply(lumox.scenes.setLayerOrder(s.id, (t as HTMLElement).dataset.ord as string, (t as HTMLInputElement).value as import('../lumox').FxOrder));
  });

  // layer config fields (selects + ranges) and timing numeric fields
  content.on('change', '[data-cfg],[data-tim],[data-field]', (_e, t) => {
    const inp = t as HTMLInputElement;
    const s = state.scene; if (!s) return;
    const id = s.id;
    if (inp.dataset.cfg != null) { const l = layer(); if (l) apply(lumox.scenes.setLayerConfig(id, l.id, { [inp.dataset.cfg]: numOrStr(inp) })); return; }
    if (inp.dataset.tim === 'rateMs') { const l = layer(); if (l) apply(lumox.scenes.setLayerTiming(id, l.id, { rateMs: Number(inp.value) })); return; }
    // step timing + scene props
    const f = inp.dataset.field;
    if (inp.dataset.step != null && (f === 'fadeMs' || f === 'waitMs')) {
      lumox.scenes.setStepTiming(id, Number(inp.dataset.step), { [f]: Math.max(0, Number(inp.value)) * 1000 }).then(() => refetch()).catch(() => {});
      return;
    }
    if (f === 'bpm') { lumox.transport.setBpm(Number(inp.value)).then((bpm) => { state.bpm = bpm; render(); }).catch(() => {}); return; }
    switch (f) {
      case 'fadeIn': apply(lumox.scenes.setFade(id, { fadeIn: Number(inp.value) })); break;
      case 'fadeOut': apply(lumox.scenes.setFade(id, { fadeOut: Number(inp.value) })); break;
      case 'fadeSpeed': apply(lumox.scenes.setFade(id, { fadeSpeed: Number(inp.value) })); break;
      case 'phaseInSec': apply(lumox.scenes.setFade(id, { phaseIn: Number(inp.value) * 1000 })); break;
      case 'phaseOutSec': apply(lumox.scenes.setFade(id, { phaseOut: Number(inp.value) * 1000 })); break;
    }
  });

  // config toggles (grayscale / randomize / symmetry / invert)
  content.on('click', '[data-cfgtoggle]', (_e, t) => {
    const s = state.scene, l = layer(); if (!s || !l) return;
    const f = (t as HTMLElement).dataset.cfgtoggle as string;
    const cur = (l.color as any)?.[f] ?? (l.move as any)?.[f] ?? (l.curve as any)?.[f] ?? (l.value as any)?.[f] ?? false;
    apply(lumox.scenes.setLayerConfig(s.id, l.id, { [f]: !cur }));
  });

  // a hex swatch changed → push the whole palette
  content.on('change', '[data-field="cfx-swatch"]', () => {
    const s = state.scene, l = layer(); if (!s || !l) return;
    apply(lumox.scenes.setLayerConfig(s.id, l.id, { palette: readPalette() }));
  });

  // apply a saved preset (whole rack) / saved palette (to the colour layer)
  content.on('change', '#preset-pick', (_e, t) => {
    const s = state.scene; const pid = (t as HTMLSelectElement).value;
    if (s && pid) apply(lumox.presets.applyRack(s.id, pid), true);
  });
  content.on('change', '#pal-pick', (_e, t) => {
    const s = state.scene, l = layer(); const pid = (t as HTMLSelectElement).value;
    const pal = state.palettes.find((p) => p.id === pid);
    if (s && (l?.color || l?.matrix) && pal) apply(lumox.scenes.setLayerConfig(s.id, l.id, { palette: pal.colors }));
  });

  // live slider readout + live shape/wave preview while dragging
  content.on('input', '[data-cfg]', (_e, t) => {
    const inp = t as HTMLInputElement;
    if (inp.type !== 'range') return;
    const out = inp.parentElement?.querySelector('.fxe-sval');
    if (out) {
      const v = Number(inp.value);
      const f = inp.dataset.cfg;
      out.textContent = (f === 'angle' || f === 'phaseShape') ? `${Math.round(v)}°`
        : (f === 'saturation' || f === 'fade' || f === 'duty' || f === 'sizeX' || f === 'sizeY') ? `${Math.round(v * 100)}%`
        : (f === 'colorWidth' || f === 'scale') ? String(r2(v)) : String(Math.round(v));
    }
    redrawPreview();   // live preview graph (move shape / curve+value waveform)
  });
  content.on('input', '[data-field="fadeSpeed"]', (_e, t) => {
    const out = content.el.querySelector('#sp-fsval'); if (out) out.textContent = Number((t as HTMLInputElement).value).toFixed(1);
  });

  function numOrStr(inp: HTMLInputElement): number | string {
    return inp.tagName === 'SELECT' ? inp.value : Number(inp.value);
  }

  // ---- Advanced controls -------------------------------------------------
  function applyAdv(s: SceneInfo, field: string, val: string): void {
    switch (field) {
      case 'priority': apply(lumox.scenes.setPriority(s.id, val as 'low' | 'normal' | 'high'), true); break;
      case 'loop-mode': apply(lumox.scenes.setLoop(s.id, { mode: val as 'always' | 'count' }), true); break;
      case 'loop-count': apply(lumox.scenes.setLoop(s.id, { count: Math.max(1, Number(val) || 1) }), true); break;
      case 'jump': {
        const jt = val === '' ? null
          : val.startsWith('scene:') ? { mode: 'scene' as const, sceneId: val.slice(6) }
          : { mode: val as 'next' | 'prev' };
        apply(lumox.scenes.setJumpTo(s.id, jt), true);
        break;
      }
      case 'release-mode': apply(lumox.scenes.setReleaseMode(s.id, { mode: val as import('../lumox').ReleaseScope }), true); break;
      case 'protect-mode': apply(lumox.scenes.setProtect(s.id, { mode: val as import('../lumox').ReleaseScope }), true); break;
    }
  }
  // segment buttons (data-adv on a <button data-val>)
  content.on('click', '[data-adv]', (_e, t) => {
    const s = state.scene; const el = t as HTMLElement;
    if (!s || el.tagName !== 'BUTTON') return;
    applyAdv(s, el.dataset.adv as string, el.dataset.val as string);
  });
  // selects + the cycle-count input (data-adv on a <select>/<input>)
  content.on('change', '[data-adv]', (_e, t) => {
    const s = state.scene; const el = t as HTMLInputElement;
    if (!s || el.tagName === 'BUTTON') return;
    applyAdv(s, el.dataset.adv as string, el.value);
  });
  content.on('click', '[data-advtoggle]', (_e, t) => {
    const s = state.scene; if (!s) return;
    const f = (t as HTMLElement).dataset.advtoggle as string;
    if (f === 'release-end') apply(lumox.scenes.setReleaseAtEnd(s.id, !s.releaseAtEnd), true);
    else if (f === 'flash') apply(lumox.scenes.setFlash(s.id, !s.flash), true);
  });
  content.on('change', '[data-advbank]', (_e, t) => {
    const s = state.scene; if (!s) return;
    const field = (t as HTMLElement).dataset.advbank as string;
    const ids = [...content.el.querySelectorAll<HTMLInputElement>(`[data-advbank="${field}"]:checked`)].map((e) => e.value);
    if (field === 'release-banks') apply(lumox.scenes.setReleaseMode(s.id, { banks: ids }), true);
    else apply(lumox.scenes.setProtect(s.id, { banks: ids }), true);
  });

  // ---- right-hand rail navigation + rename -------------------------------
  // Clicking a rail icon jumps straight to that section (no back-tracking).
  railEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.sp-railbtn') as HTMLButtonElement | null;
    if (!btn || btn.disabled || !state.scene) return;
    state.view = btn.dataset.nav as View;
    if (state.view === 'adv') loadBanks().then(() => render(false));   // banks feed the Advanced lists
    else render(false);
  });

  renameBtn.addEventListener('click', renameScene);

  function renameScene() {
    const s = state.scene; if (!s) return;
    const n = prompt('Scene name', s.name);
    if (!n || !n.trim()) return;
    lumox.scenes.rename(s.id, n.trim()).then(() => { if (state.scene) state.scene.name = n.trim(); emitUpdated(s.id); render(); }).catch(() => {});
  }

  recallBtn.addEventListener('click', async () => {
    const s = state.scene; if (!s) return;
    const on = !s.active;
    await lumox.scenes.recall(s.id, on).catch(() => {});
    bus.emit(EV.SCENE_SELECTED, on ? { id: s.id, name: s.name } : null);
    emitUpdated(s.id);
  });

  bus.on(EV.SCENE_SELECTED, (sel: { id: string; name: string } | null) => {
    if (sel?.id) select(sel.id);
    else if (state.scene) refetch();
  });
  bus.on(EV.SCENE_UPDATED, (id: string) => {
    if (id === suppressId) return;
    if (state.scene && id === state.scene.id) refetch();
  });
  bus.on(EV.GROUPS_CHANGED, async () => { state.groups = await lumox.groups.list().catch(() => []); if (state.scene) render(); });

  render();
  return { tile };
}
