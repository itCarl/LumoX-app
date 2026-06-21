// Fixture Editor window — standalone page (its own taskbar window). Authors a
// user fixture definition (vendor is fixed to "Custom"): model/type, one or more
// channel modes (each an ordered channel list), and a physical emitter layout (positioned
// light cells, consumed later by matrix effects). Saves into the library via
// window.lumox.

import { esc } from './lib/html';
import { button } from './lib/widgets';
import { channelIconHtml } from './lib/channel-icons';
import { initNumberSteppers } from './lib/numberStepper';
import { goboSvg } from './lib/gobo';
import { openGoboPaint } from './lib/goboPaint';

const { lumox } = window;

const FIXTURE_TYPES = ['PAR', 'LED Bar', 'Moving Head', 'Strobe', 'Dimmer', 'Laser', 'Smoke', 'Scanner', 'Other'];
const GRID_MARGIN = 0.1;   // inset generated grids from the canvas edge (0..1)

// Capability kinds the editor can author (the registered Capability subclasses).
const CAP_KINDS = ['range', 'color', 'gobo', 'shutter', 'effect'] as const;
type CapKind = typeof CAP_KINDS[number];
const SHUTTER_MODES = ['open', 'closed', 'strobe', 'pulse', 'random'];

// One value range on a channel — mirrors the engine's Capability JSON (kind-specific
// fields are optional and only read for that kind).
interface Cap {
  kind: CapKind;
  min: number;
  max: number;
  label: string;
  color?: string;          // color
  pattern?: string | null; // gobo (drawn icon)
  shake?: boolean;         // gobo
  mode?: string;           // shutter
  rateHz?: number | null;  // shutter
}
interface Ch { name: string; typeId: string; defaultValue?: number; capabilities: Cap[]; }
interface Mode { name: string; channels: Ch[]; }
interface Emitter { x: number; y: number; }   // normalized 0..1

// Default capability kind for a new range, inferred from the channel's type group.
function defaultKind(typeId: string, group?: string): CapKind {
  if (typeId.startsWith('gobo') || group === 'gobo') return 'gobo';
  if (typeId === 'strobe' || typeId === 'shutter') return 'shutter';
  if (group === 'color' || typeId === 'color-wheel' || typeId === 'color-macro') return 'color';
  if (group === 'effect') return 'effect';
  return 'range';
}

// A capability → the kind-specific JSON the engine's CapabilityRegistry rebuilds
// (see src/fixtures/Capability.ts). The label defaults to the numeric range.
function capToJSON(cap: Cap): Record<string, unknown> {
  const label = cap.label.trim() || `${cap.min}-${cap.max}`;
  const base = { kind: cap.kind, min: cap.min, max: cap.max, label };
  switch (cap.kind) {
    case 'color':   return { ...base, color: cap.color ?? '#ffffff' };
    case 'gobo':    return { ...base, pattern: cap.pattern ?? null, shake: !!cap.shake };
    case 'shutter': return { ...base, mode: cap.mode ?? 'strobe', rateHz: cap.rateHz ?? null };
    case 'effect':  return { ...base, effectName: label };
    default:        return base;
  }
}

// ---- titlebar window controls ------------------------------------------
(document.getElementById('ew-close') as HTMLElement).addEventListener('click', () => lumox?.win.closeSelf());
(document.getElementById('ew-min') as HTMLElement)?.addEventListener('click', () => lumox?.win.minimizeSelf());

const root = document.getElementById('fe-root') as HTMLElement;

(async function init() {
  let types: { id: string; name: string; group: string; color?: string | null }[] = [];
  try { types = await lumox.library.channelTypes(); } catch { types = [{ id: 'intensity', name: 'Intensity', group: 'intensity' }]; }

  // typeId → its metadata, for the per-row channel icon.
  const typeMeta = new Map(types.map((t) => [t.id, t]));
  const iconFor = (typeId: string) => {
    const t = typeMeta.get(typeId);
    return channelIconHtml(typeId, t?.group, t?.color);
  };

  const byGroup = new Map<string, typeof types>();
  for (const t of types) (byGroup.get(t.group) ?? byGroup.set(t.group, []).get(t.group)!).push(t);
  const typeOptions = [...byGroup.entries()].map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</optgroup>`).join('');

  // ---- state -----------------------------------------------------------
  // Editing an existing fixture? Load its full authoring JSON; otherwise start with
  // a blank RGB fixture. A built-in loads as a starting point — saving always writes
  // to the Custom library (a copy), since bundled profiles are read-only.
  const target = await lumox.editor.target().catch(() => null) as { def: any; source: string } | null;
  const editing = target ? { id: String(target.def.id), source: target.source } : null;
  const loadModes = (def: any): Mode[] =>
    (def.modes ?? []).map((m: any) => ({
      name: m.name ?? 'Default',
      channels: (m.channels ?? []).map((c: any) => ({
        name: c.name ?? '', typeId: c.typeId,
        defaultValue: c.defaultValue ?? undefined,
        capabilities: (c.capabilities ?? []).map((cap: any) => ({ ...cap })) as Cap[],
      })),
    }));
  const state = {
    modes: (target ? loadModes(target.def) : [{ name: 'Default', channels: [
      { name: 'Dimmer', typeId: 'intensity', capabilities: [] },
      { name: 'Red', typeId: 'red', capabilities: [] },
      { name: 'Green', typeId: 'green', capabilities: [] },
      { name: 'Blue', typeId: 'blue', capabilities: [] },
    ] }]) as Mode[],
    active: 0,
    expanded: new Set<number>(),   // channel rows whose value-range editor is open
    emitters: (target?.def.emitterLayout ?? []) as Emitter[],
  };

  root.innerHTML = `
    <div class="fe-meta">
      <label class="frow"><span>Vendor</span><input type="text" value="Custom" disabled title="User fixtures are saved under the Custom vendor — real vendor profiles ship with the app" /></label>
      <label class="frow"><span>Model</span><input id="fe-model" type="text" placeholder="My Fixture" /></label>
      <label class="frow"><span>Type</span>
        <select id="fe-type">${FIXTURE_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
      <label class="frow fe-move-row"><span>Pan max (°)</span><input id="fe-panmax" type="number" min="0" max="720" placeholder="540" title="Physical pan travel in degrees — used by the per-fixture Limits editor" /></label>
      <label class="frow fe-move-row"><span>Tilt max (°)</span><input id="fe-tiltmax" type="number" min="0" max="720" placeholder="270" title="Physical tilt travel in degrees — used by the per-fixture Limits editor" /></label>
    </div>

    <div class="fe-main">
      <div class="fe-modes-col">
        <div class="fe-col-head"><span>MODES</span></div>
        <div id="fe-modes" class="fe-modes"></div>
        <button id="fe-add-mode" class="fe-mode-add">+ Add mode</button>
      </div>
      <div class="fe-ch-col">
        <div class="fe-ch-head">
          <label class="fe-mode-name"><span>Mode</span><input id="fe-mode-name" type="text" placeholder="Mode name" /></label>
          <button id="fe-add-ch" class="btn-add-ch">+ Add channel</button>
        </div>
        <div id="fe-channels" class="fe-channels"></div>
      </div>
    </div>

    <div class="fe-emitters">
      <div class="fe-col-head"><span>EMITTERS</span><span id="fe-em-count" class="fe-em-count"></span></div>
      <div class="fe-emitter-wrap">
        <div id="fe-em-canvas" class="fe-emitter-canvas"></div>
        <div class="fe-emitter-tools">
          <label class="frow"><span>Rows</span><input id="fe-em-rows" type="number" min="1" max="64" value="2" /></label>
          <label class="frow"><span>Cols</span><input id="fe-em-cols" type="number" min="1" max="64" value="4" /></label>
          <div class="fe-em-btns">
            <button id="fe-em-gen" class="btn-add-ch">Generate grid</button>
            <button id="fe-em-clear" class="fe-mode-add">Clear</button>
          </div>
          <p class="fe-em-hint">Drag cells to position them. The layout is used for matrix effects.</p>
        </div>
      </div>
    </div>

    <div class="ew-foot">
      <div id="fe-msg" class="fe-msg"></div>
      <div class="modal-actions" id="fe-actions"></div>
    </div>`;

  const $ = (s: string) => root.querySelector(s) as HTMLElement;
  const chWrap = $('#fe-channels');
  const modesWrap = $('#fe-modes');
  const modeNameEl = $('#fe-mode-name') as HTMLInputElement;
  const canvas = $('#fe-em-canvas');
  const emCountEl = $('#fe-em-count');
  const typeSel = $('#fe-type') as HTMLSelectElement;

  // Pre-fill the meta fields when editing an existing fixture.
  if (target) {
    ($('#fe-model') as HTMLInputElement).value = target.def.model ?? '';
    if (target.def.type) typeSel.value = target.def.type;
    const focus = target.def.physical?.focus;
    if (focus?.panMax) ($('#fe-panmax') as HTMLInputElement).value = String(focus.panMax);
    if (focus?.tiltMax) ($('#fe-tiltmax') as HTMLInputElement).value = String(focus.tiltMax);
  }

  // Pan/tilt travel only matters for fixtures that move — show those fields for
  // moving heads & scanners, hide them otherwise.
  const movesAround = (t: string) => t === 'Moving Head' || t === 'Scanner';
  const syncMoveRows = () => {
    const show = movesAround(typeSel.value);
    root.querySelectorAll<HTMLElement>('.fe-move-row').forEach((r) => { r.hidden = !show; });
  };
  typeSel.addEventListener('change', syncMoveRows);
  syncMoveRows();

  // ---- channels (active mode) ------------------------------------------
  // Channel name/type rows are uncontrolled inputs; each channel's value ranges
  // (capabilities) live in state and are edited via the delegated handlers below.
  // Capture name/type into state — preserving each channel's capabilities by
  // index — before any structural change (add/remove channel, mode switch, save).
  function readChannels(): Ch[] {
    const prev = state.modes[state.active].channels;
    return [...chWrap.querySelectorAll('.fe-ch-item')].map((r, i) => ({
      name: (r.querySelector('.fe-ch-name') as HTMLInputElement).value,
      typeId: (r.querySelector('.fe-ch-type') as HTMLSelectElement).value,
      defaultValue: prev[i]?.defaultValue,
      capabilities: prev[i]?.capabilities ?? [],
    }));
  }
  function syncChannels() { state.modes[state.active].channels = readChannels(); }

  const clampByte = (v: string) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));

  // Kind-specific controls on a value-range row (colour swatch / gobo paint / shutter mode).
  function capExtraHtml(cap: Cap): string {
    switch (cap.kind) {
      case 'color':
        return `<input class="fe-cap-color" type="color" value="${esc(cap.color ?? '#ffffff')}" title="Preset colour" />`;
      case 'gobo':
        return `<button class="fe-cap-paint" title="Draw gobo icon">${goboSvg(cap.pattern, 20) || '<i class="fa-solid fa-pen"></i>'}</button>`
          + `<label class="fe-cap-shake" title="Gobo shake"><input class="fe-cap-shake-cb" type="checkbox"${cap.shake ? ' checked' : ''} /> shake</label>`;
      case 'shutter':
        return `<select class="fe-cap-mode" title="Shutter mode">${SHUTTER_MODES.map((m) => `<option${cap.mode === m ? ' selected' : ''}>${m}</option>`).join('')}</select>`;
      default:
        return '';
    }
  }

  function capRowHtml(cap: Cap, j: number): string {
    return `<div class="fe-cap" data-cap="${j}">
      <input class="fe-cap-min" type="number" min="0" max="255" value="${cap.min}" title="Range start" />
      <span class="fe-cap-dash">–</span>
      <input class="fe-cap-max" type="number" min="0" max="255" value="${cap.max}" title="Range end" />
      <input class="fe-cap-label" type="text" placeholder="Label" value="${esc(cap.label)}" />
      <select class="fe-cap-kind" title="Preset kind">${CAP_KINDS.map((k) => `<option${cap.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select>
      <span class="fe-cap-extra">${capExtraHtml(cap)}</span>
      <button class="fe-cap-del" title="Remove range"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  }

  function capsPanelHtml(ch: Ch): string {
    const rows = ch.capabilities.map(capRowHtml).join('')
      || '<div class="fe-cap-empty">No value ranges. Add ranges to label what each DMX value does (e.g. gobos, colours, strobe).</div>';
    return `<div class="fe-caps">
      <div class="fe-caps-head"><span>VALUE RANGES</span>
        <span class="fe-caps-actions">
          <button class="fe-cap-wiz" title="Auto-fill evenly spaced ranges">Auto-fill…</button>
          <button class="fe-cap-add">+ Range</button>
        </span>
      </div>
      <div class="fe-cap-wiz-form" hidden>
        <label>Start <input class="fe-wz-start" type="number" min="0" max="255" value="0" /></label>
        <label>Width <input class="fe-wz-width" type="number" min="1" max="255" value="10" /></label>
        <label>Count <input class="fe-wz-count" type="number" min="1" max="256" value="8" /></label>
        <label class="fe-wz-namel">Name <input class="fe-wz-name" type="text" placeholder="Gobo #" value="Gobo #" title="# is replaced by the range number" /></label>
        <button class="fe-wz-go">Generate</button>
      </div>
      <div class="fe-cap-rows">${rows}</div>
    </div>`;
  }

  function renderChannels() {
    const channels = state.modes[state.active].channels;
    chWrap.innerHTML = channels.map((c, i) => {
      const open = state.expanded.has(i);
      const n = c.capabilities.length;
      return `<div class="fe-ch-item${open ? ' open' : ''}" data-i="${i}">
        <div class="fe-ch">
          <span class="fe-ch-n">${i + 1}</span>
          <span class="fe-ch-ico">${iconFor(c.typeId)}</span>
          <input class="fe-ch-name" type="text" placeholder="Channel name" value="${esc(c.name)}" />
          <select class="fe-ch-type">${typeOptions}</select>
          <button class="fe-ch-caps-toggle${n ? ' has' : ''}" title="Value ranges${n ? ` (${n})` : ''}">
            ${n ? `<span class="fe-ch-caps-n">${n}</span>` : ''}<i class="fa-solid fa-chevron-${open ? 'up' : 'down'}"></i>
          </button>
          <button class="fe-ch-del" title="Remove channel"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${open ? capsPanelHtml(c) : ''}
      </div>`;
    }).join('');
    chWrap.querySelectorAll('.fe-ch-item').forEach((r, i) => {
      (r.querySelector('.fe-ch-type') as HTMLSelectElement).value = channels[i].typeId;
    });
  }

  // Resolve the channel + capability a target element belongs to.
  function locate(el: HTMLElement): { ci: number; cj: number; ch?: Ch; cap?: Cap } {
    const item = el.closest('.fe-ch-item') as HTMLElement | null;
    const capEl = el.closest('.fe-cap') as HTMLElement | null;
    const ci = item ? Number(item.dataset.i) : -1;
    const cj = capEl ? Number(capEl.dataset.cap) : -1;
    const ch = state.modes[state.active].channels[ci];
    return { ci, cj, ch, cap: ch?.capabilities[cj] };
  }

  chWrap.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;

    // remove a channel
    const del = t.closest('.fe-ch-del') as HTMLElement | null;
    if (del) {
      const idx = Number((del.closest('.fe-ch-item') as HTMLElement).dataset.i);
      syncChannels();
      state.modes[state.active].channels.splice(idx, 1);
      state.expanded.clear();   // indices shift — collapse all to stay in sync
      renderChannels();
      return;
    }

    // toggle a channel's value-range editor
    const toggle = t.closest('.fe-ch-caps-toggle') as HTMLElement | null;
    if (toggle) {
      const idx = Number((toggle.closest('.fe-ch-item') as HTMLElement).dataset.i);
      syncChannels();
      if (state.expanded.has(idx)) state.expanded.delete(idx); else state.expanded.add(idx);
      renderChannels();
      return;
    }

    // add a value range to a channel
    if (t.closest('.fe-cap-add')) {
      const { ci, ch } = locate(t);
      if (!ch) return;
      const last = ch.capabilities[ch.capabilities.length - 1];
      const min = last ? Math.min(255, last.max + 1) : 0;
      ch.capabilities.push({ kind: defaultKind(ch.typeId, typeMeta.get(ch.typeId)?.group), min, max: Math.min(255, min + 9), label: '' });
      state.expanded.add(ci);
      renderChannels();
      return;
    }

    // remove a value range
    if (t.closest('.fe-cap-del')) {
      const { ch, cj } = locate(t);
      if (!ch || cj < 0) return;
      ch.capabilities.splice(cj, 1);
      renderChannels();
      return;
    }

    // toggle the auto-fill wizard form
    if (t.closest('.fe-cap-wiz')) {
      const form = (t.closest('.fe-caps') as HTMLElement).querySelector('.fe-cap-wiz-form') as HTMLElement;
      form.hidden = !form.hidden;
      return;
    }

    // generate evenly spaced ranges (mirrors the QLC+ capability wizard)
    if (t.closest('.fe-wz-go')) {
      const { ch } = locate(t);
      const form = t.closest('.fe-cap-wiz-form') as HTMLElement;
      if (!ch || !form) return;
      const num = (sel: string) => Number((form.querySelector(sel) as HTMLInputElement).value);
      const start = Math.max(0, Math.min(255, num('.fe-wz-start')));
      const width = Math.max(1, num('.fe-wz-width'));
      const count = Math.max(1, num('.fe-wz-count'));
      const name = (form.querySelector('.fe-wz-name') as HTMLInputElement).value;
      const kind = defaultKind(ch.typeId, typeMeta.get(ch.typeId)?.group);
      const caps: Cap[] = [];
      let min = start;
      for (let i = 0; i < count; i++) {
        const max = Math.min(255, min + width - 1);
        caps.push({ kind, min, max, label: name.replace(/#/g, String(i + 1)) });
        if (max >= 255) break;
        min = max + 1;
      }
      ch.capabilities = caps;
      renderChannels();
      return;
    }

    // draw a gobo icon for a value range
    if (t.closest('.fe-cap-paint')) {
      const btn = t.closest('.fe-cap-paint') as HTMLElement;
      const { cap } = locate(btn);
      if (!cap) return;
      const pattern = await openGoboPaint(cap.pattern ?? null);
      if (pattern === undefined) return;
      cap.pattern = pattern;
      btn.innerHTML = goboSvg(pattern, 20) || '<i class="fa-solid fa-pen"></i>';
    }
  });

  // Live value edits — mutate state without re-rendering (keeps input focus).
  chWrap.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    const { cap } = locate(t);
    if (!cap) return;
    if (t.classList.contains('fe-cap-min')) cap.min = clampByte((t as HTMLInputElement).value);
    else if (t.classList.contains('fe-cap-max')) cap.max = clampByte((t as HTMLInputElement).value);
    else if (t.classList.contains('fe-cap-label')) cap.label = (t as HTMLInputElement).value;
    else if (t.classList.contains('fe-cap-color')) cap.color = (t as HTMLInputElement).value;
  });

  // Structural / discrete changes.
  chWrap.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;

    // channel type → repaint the row icon (uncontrolled select)
    const typeSel = t.closest('.fe-ch-type') as HTMLSelectElement | null;
    if (typeSel) {
      const ico = typeSel.closest('.fe-ch')?.querySelector('.fe-ch-ico') as HTMLElement | null;
      if (ico) ico.innerHTML = iconFor(typeSel.value);
      return;
    }

    const { cap } = locate(t);
    if (!cap) return;
    if (t.classList.contains('fe-cap-kind')) {
      cap.kind = (t as HTMLSelectElement).value as CapKind;
      if (cap.kind === 'color' && !cap.color) cap.color = '#ffffff';
      if (cap.kind === 'shutter' && !cap.mode) cap.mode = 'strobe';
      renderChannels();   // swap the kind-specific controls
    } else if (t.classList.contains('fe-cap-mode')) {
      cap.mode = (t as HTMLSelectElement).value;
    } else if (t.classList.contains('fe-cap-shake-cb')) {
      cap.shake = (t as HTMLInputElement).checked;
    }
  });

  $('#fe-add-ch').addEventListener('click', () => {
    syncChannels();
    state.modes[state.active].channels.push({ name: '', typeId: 'intensity', capabilities: [] });
    renderChannels();
  });

  // ---- modes -----------------------------------------------------------
  function renderModes() {
    modesWrap.innerHTML = state.modes.map((m, i) => {
      const n = m.channels.filter((c) => c.typeId).length;
      return `<div class="fe-mode${i === state.active ? ' active' : ''}" data-i="${i}">
        <span class="fe-mode-lbl">${esc(m.name || 'Mode')}</span>
        <span class="fe-mode-ch">${n}ch</span>
        <button class="fe-mode-del" title="Remove mode"${state.modes.length > 1 ? '' : ' disabled'}><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    }).join('');
    modeNameEl.value = state.modes[state.active].name;
  }

  function selectMode(i: number) {
    if (i === state.active) return;
    syncChannels();
    state.active = i;
    renderModes();
    renderChannels();
  }

  modesWrap.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const del = target.closest('.fe-mode-del') as HTMLElement | null;
    const item = target.closest('.fe-mode') as HTMLElement | null;
    if (!item) return;
    const i = Number(item.dataset.i);
    if (del) {
      if (state.modes.length <= 1) return;
      syncChannels();
      state.modes.splice(i, 1);
      if (state.active >= state.modes.length) state.active = state.modes.length - 1;
      else if (state.active > i) state.active--;
      renderModes();
      renderChannels();
      return;
    }
    selectMode(i);
  });

  $('#fe-add-mode').addEventListener('click', () => {
    syncChannels();
    state.modes.push({ name: `Mode ${state.modes.length + 1}`, channels: [] });
    state.active = state.modes.length - 1;
    renderModes();
    renderChannels();
  });

  modeNameEl.addEventListener('input', () => {
    state.modes[state.active].name = modeNameEl.value;
    // refresh only the active mode's label (modes list holds no focused input)
    const lbl = modesWrap.querySelector(`.fe-mode[data-i="${state.active}"] .fe-mode-lbl`) as HTMLElement | null;
    if (lbl) lbl.textContent = modeNameEl.value || 'Mode';
  });

  // ---- emitter layout --------------------------------------------------
  function renderEmitters() {
    canvas.innerHTML = state.emitters.map((p, i) =>
      `<i class="fe-em" data-i="${i}" style="left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%"></i>`).join('');
    emCountEl.textContent = state.emitters.length ? `${state.emitters.length} cell${state.emitters.length === 1 ? '' : 's'}` : 'none';
  }

  $('#fe-em-gen').addEventListener('click', () => {
    const rows = Math.max(1, Math.min(64, Number(($('#fe-em-rows') as HTMLInputElement).value) || 1));
    const cols = Math.max(1, Math.min(64, Number(($('#fe-em-cols') as HTMLInputElement).value) || 1));
    const span = 1 - 2 * GRID_MARGIN;
    const at = (n: number, count: number) => count > 1 ? GRID_MARGIN + (n / (count - 1)) * span : 0.5;
    const cells: Emitter[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: at(c, cols), y: at(r, rows) });
    state.emitters = cells;
    renderEmitters();
  });
  $('#fe-em-clear').addEventListener('click', () => { state.emitters = []; renderEmitters(); });

  // Drag a cell within the canvas; store clamped normalized coords.
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  let dragIdx = -1;
  canvas.addEventListener('mousedown', (e) => {
    const dot = (e.target as HTMLElement).closest('.fe-em') as HTMLElement | null;
    if (!dot) return;
    e.preventDefault();
    dragIdx = Number(dot.dataset.i);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  });
  function onDrag(e: MouseEvent) {
    if (dragIdx < 0) return;
    const rect = canvas.getBoundingClientRect();
    const p = state.emitters[dragIdx];
    if (!p) return;
    p.x = clamp01((e.clientX - rect.left) / rect.width);
    p.y = clamp01((e.clientY - rect.top) / rect.height);
    const dot = canvas.querySelector(`.fe-em[data-i="${dragIdx}"]`) as HTMLElement | null;
    if (dot) { dot.style.left = `${(p.x * 100).toFixed(2)}%`; dot.style.top = `${(p.y * 100).toFixed(2)}%`; }
  }
  function endDrag() {
    dragIdx = -1;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
  }

  // ---- save ------------------------------------------------------------
  async function save() {
    const msg = $('#fe-msg');
    msg.textContent = '';
    syncChannels();
    const modes = state.modes.map((m) => ({
      name: m.name.trim() || 'Default',
      channels: m.channels
        .filter((c) => c.typeId)
        .map((c) => {
          const ch: Record<string, unknown> = { name: c.name.trim() || c.typeId, typeId: c.typeId };
          if (c.defaultValue != null) ch.defaultValue = c.defaultValue;
          const caps = c.capabilities.filter((cap) => cap.max >= cap.min).map(capToJSON);
          if (caps.length) ch.capabilities = caps;
          return ch;
        }),
    })).filter((m) => m.channels.length);

    // Vendor is forced to "Custom" by the main process — user fixtures always
    // live in the Custom library; real vendor profiles ship bundled.
    const def: Record<string, unknown> = {
      model: ($('#fe-model') as HTMLInputElement).value.trim(),
      type: ($('#fe-type') as HTMLSelectElement).value,
      emitters: state.emitters.length || 1,
      modes,
    };
    if (state.emitters.length) def.emitterLayout = state.emitters;

    // Pan/tilt travel (degrees) — only authored for movers; feeds the Limits editor.
    if (movesAround(typeSel.value)) {
      const panMax = Number(($('#fe-panmax') as HTMLInputElement).value) || 0;
      const tiltMax = Number(($('#fe-tiltmax') as HTMLInputElement).value) || 0;
      if (panMax > 0 || tiltMax > 0) {
        def.physical = { focus: { type: 'Head', panMax: panMax || null, tiltMax: tiltMax || null } };
      }
    }

    try {
      // Editing a Custom fixture updates it in place (replace by id, with rename
      // cleanup); a built-in is read-only, so it saves as a new Custom copy.
      await lumox.library.add(def, editing?.source === 'user' ? editing.id : undefined);
      lumox.win.closeSelf();
    } catch (err) {
      msg.textContent = String((err as Error).message || err).replace(/^Error:\s*/, '');
    }
  }

  // Label reflects the outcome: a built-in edit becomes a Custom copy; a Custom edit
  // updates in place; otherwise it creates a new fixture.
  const saveLabel = editing
    ? (editing.source === 'user' ? 'Save changes' : 'Save Custom copy')
    : 'Save fixture';
  const actions = $('#fe-actions');
  actions.appendChild(button({ variant: 'ghost', label: 'Cancel', onClick: () => lumox.win.closeSelf() }));
  actions.appendChild(button({ variant: 'primary', label: saveLabel, onClick: save }));

  // ---- first paint -----------------------------------------------------
  renderModes();
  renderChannels();
  renderEmitters();
  initNumberSteppers();   // custom number steppers (replaces native spin arrows)
})();
