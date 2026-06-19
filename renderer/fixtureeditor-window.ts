// Fixture Editor window — standalone page (its own taskbar window). Authors a
// user fixture definition (vendor is fixed to "Custom"): model/type, one or more
// channel modes (each an ordered channel list), and a physical emitter layout (positioned
// light cells, consumed later by matrix effects). Saves into the library via
// window.lumox.

import { esc } from './lib/html';
import { button } from './lib/widgets';
import { channelIconHtml } from './lib/channel-icons';

const { lumox } = window;

const FIXTURE_TYPES = ['PAR', 'LED Bar', 'Moving Head', 'Strobe', 'Dimmer', 'Laser', 'Smoke', 'Scanner', 'Other'];
const GRID_MARGIN = 0.1;   // inset generated grids from the canvas edge (0..1)

interface Ch { name: string; typeId: string; }
interface Mode { name: string; channels: Ch[]; }
interface Emitter { x: number; y: number; }   // normalized 0..1

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
  const state = {
    modes: [{ name: 'Default', channels: [
      { name: 'Dimmer', typeId: 'intensity' },
      { name: 'Red', typeId: 'red' },
      { name: 'Green', typeId: 'green' },
      { name: 'Blue', typeId: 'blue' },
    ] }] as Mode[],
    active: 0,
    emitters: [] as Emitter[],
  };

  root.innerHTML = `
    <div class="fe-meta">
      <label class="frow"><span>Vendor</span><input type="text" value="Custom" disabled title="User fixtures are saved under the Custom vendor — real vendor profiles ship with the app" /></label>
      <label class="frow"><span>Model</span><input id="fe-model" type="text" placeholder="My Fixture" /></label>
      <label class="frow"><span>Type</span>
        <select id="fe-type">${FIXTURE_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
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

  // ---- channels (active mode) ------------------------------------------
  // Channel rows are uncontrolled inputs; capture them into state before any
  // structural change (add/remove channel, mode switch, save).
  function readChannels(): Ch[] {
    return [...chWrap.querySelectorAll('.fe-ch')].map((r) => ({
      name: (r.querySelector('.fe-ch-name') as HTMLInputElement).value,
      typeId: (r.querySelector('.fe-ch-type') as HTMLSelectElement).value,
    }));
  }
  function syncChannels() { state.modes[state.active].channels = readChannels(); }

  function renderChannels() {
    const channels = state.modes[state.active].channels;
    chWrap.innerHTML = channels.map((c, i) => `
      <div class="fe-ch">
        <span class="fe-ch-n">${i + 1}</span>
        <span class="fe-ch-ico">${iconFor(c.typeId)}</span>
        <input class="fe-ch-name" type="text" placeholder="Channel name" value="${esc(c.name)}" />
        <select class="fe-ch-type">${typeOptions}</select>
        <button class="fe-ch-del" title="Remove"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
    chWrap.querySelectorAll('.fe-ch').forEach((r, i) => {
      (r.querySelector('.fe-ch-type') as HTMLSelectElement).value = channels[i].typeId;
    });
  }

  chWrap.addEventListener('click', (e) => {
    const del = (e.target as HTMLElement).closest('.fe-ch-del') as HTMLElement | null;
    if (!del) return;
    const row = del.closest('.fe-ch') as HTMLElement;
    const idx = [...chWrap.children].indexOf(row);
    syncChannels();
    state.modes[state.active].channels.splice(idx, 1);
    renderChannels();
  });
  // Repaint a row's icon when its channel type changes (uncontrolled select).
  chWrap.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest('.fe-ch-type') as HTMLSelectElement | null;
    if (!sel) return;
    const ico = sel.closest('.fe-ch')?.querySelector('.fe-ch-ico') as HTMLElement | null;
    if (ico) ico.innerHTML = iconFor(sel.value);
  });
  $('#fe-add-ch').addEventListener('click', () => {
    syncChannels();
    state.modes[state.active].channels.push({ name: '', typeId: 'intensity' });
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
        .map((c) => ({ name: c.name.trim() || c.typeId, typeId: c.typeId })),
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

    try {
      await lumox.library.add(def);
      lumox.win.closeSelf();
    } catch (err) {
      msg.textContent = String((err as Error).message || err).replace(/^Error:\s*/, '');
    }
  }

  const actions = $('#fe-actions');
  actions.appendChild(button({ variant: 'ghost', label: 'Cancel', onClick: () => lumox.win.closeSelf() }));
  actions.appendChild(button({ variant: 'primary', label: 'Save fixture', onClick: save }));

  // ---- first paint -----------------------------------------------------
  renderModes();
  renderChannels();
  renderEmitters();
})();
