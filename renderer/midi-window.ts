// MIDI Mapping window — standalone page (its own taskbar window). Shows the
// connected device + status, a "+ Add mapping" button that starts the
// click-to-assign flow (click a control in the MAIN window, then actuate a MIDI
// control), the table of bindings, and a live MIDI monitor.
//
// Device-agnostic: the LED colour swatches + animation modes come from the
// connected device's reported capabilities (MidiStatus.capabilities), so a new
// controller's options appear automatically. All state lives in the main process
// (MidiService); this window just renders pushed events and issues commands.

import { html, mount } from './lib/dom';
import type { MidiBinding, MidiStatus, MidiMonitorMessage, MidiAwaitingInput, MidiCapabilities } from './lumox';

const { lumox } = window;

// ---- titlebar window controls ------------------------------------------
(document.getElementById('ew-close') as HTMLElement).addEventListener('click', () => lumox?.win.closeSelf());
(document.getElementById('ew-min') as HTMLElement)?.addEventListener('click', () => lumox?.win.minimizeSelf());

const root = document.getElementById('mw-root') as HTMLElement;
root.innerHTML = `
  <div class="mw">
    <div class="mw-bar">
      <span class="mw-status" id="mw-status"><i class="fa-solid fa-circle"></i> <span>—</span></span>
      <button class="lx-btn lx-btn-primary" id="mw-add"><span class="lx-btn-ic"><i class="fa-solid fa-plus"></i></span><span>Add mapping</span></button>
    </div>
    <div class="mw-banner" id="mw-banner" hidden></div>
    <div class="mw-table" id="mw-table"></div>
    <div class="mw-monitor"><span class="mw-mon-lbl">MONITOR</span><span class="mw-mon-msg" id="mw-mon">—</span></div>
  </div>`;

const statusEl = root.querySelector('#mw-status') as HTMLElement;
const banner = root.querySelector('#mw-banner') as HTMLElement;
const monEl = root.querySelector('#mw-mon') as HTMLElement;
const table = mount(root.querySelector('#mw-table') as HTMLElement);
const addBtn = root.querySelector('#mw-add') as HTMLButtonElement;

let assigning = false;
let bindings: MidiBinding[] = [];                                          // last bindings (re-render on caps change)
let caps: MidiCapabilities = { deviceId: null, palette: [], ledModes: [] }; // connected device's LED capabilities

// Default LED colour for a binding when none is chosen — from the device palette.
const ledColorOf = (b: MidiBinding) =>
  b.options.ledColor ?? (caps.palette.some((c) => c.name === 'cyan') && b.target.key !== 'blackout' ? 'cyan'
    : caps.palette.some((c) => c.name === 'red') && b.target.key === 'blackout' ? 'red'
    : caps.palette[0]?.name ?? '');

// ---- connection status -------------------------------------------------
function applyStatus(s: MidiStatus) {
  statusEl.classList.toggle('on', s.connected);
  statusEl.querySelector('span')!.textContent = s.connected
    ? `${s.deviceName ?? s.portName} — connected`
    : 'No MIDI device — connect a controller';
  caps = s.capabilities ?? { deviceId: null, palette: [], ledModes: [] };
  renderTable(bindings);   // re-render so LED controls reflect the device
}

// ---- assign banner -----------------------------------------------------
function applyAwaiting(a: MidiAwaitingInput) {
  if (!assigning) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.textContent = a.waiting
    ? `“${a.label}” selected — now move/press a control on your MIDI device.  ·  Esc to cancel`
    : 'Click a control in the main window…  ·  Esc to cancel';
}

// ---- mappings table ----------------------------------------------------
const triggerLabel = (b: MidiBinding) =>
  `${b.trigger.type === 'note' ? 'Note' : 'CC'} ch${b.trigger.channel} #${b.trigger.number}`;

const MODE_LABEL: Record<string, string> = { solid: 'Solid', blink: 'Blink', fade: 'Fade' };

function renderTable(list: MidiBinding[]) {
  bindings = list;
  if (!list.length) {
    table.set(html`<div class="mw-empty">No mappings yet. Click <b>Add mapping</b>, pick a control in the main
      window, then move a fader or press a pad on your device.</div>`);
    return;
  }
  // LEDs only when the connected device exposes a palette (e.g. the APC pads).
  const hasLeds = caps.palette.length > 0;
  table.set(html`
    <div class="mw-row mw-head">
      <span>Trigger</span><span>Target</span><span>Options${hasLeds ? html` &amp; LED feedback` : ''}</span><span></span>
    </div>
    ${list.map((b) => html`
      <div class="mw-row" data-id="${b.id}">
        <span class="mw-trig">${triggerLabel(b)}</span>
        <span class="mw-tgt">${b.target.label}</span>
        <span class="mw-opt">
          ${b.target.kind === 'trigger'
            ? html`<span class="seg mw-seg" title="Button behaviour">
                <button class="seg-btn${(b.options.mode ?? 'toggle') === 'toggle' ? ' active' : ''}" data-mode="toggle">Toggle</button>
                <button class="seg-btn${b.options.mode === 'flash' ? ' active' : ''}" data-mode="flash">Flash</button>
              </span>`
            : html`<button class="mw-inv${b.options.invert ? ' on' : ''}" data-inv>Invert</button>`}
          ${hasLeds && b.trigger.type === 'note'
            ? html`
              <span class="mw-leds" title="LED colour">
                ${caps.palette.map((c) => html`<button class="mw-led${ledColorOf(b) === c.name ? ' on' : ''}" data-led="${c.name}" style="--lc:${c.hex}" title="${c.name}"></button>`)}
              </span>
              ${caps.ledModes.length > 1
                ? html`<span class="seg mw-ledmode" title="LED while active">
                    ${caps.ledModes.map((m) => html`<button class="seg-btn${(b.options.ledMode ?? 'solid') === m ? ' active' : ''}" data-ledmode="${m}">${MODE_LABEL[m] ?? m}</button>`)}
                  </span>`
                : ''}`
            : ''}
        </span>
        <button class="mw-del" data-del title="Remove mapping"><i class="fa-solid fa-xmark"></i></button>
      </div>`)}`);
}

// ---- assign flow -------------------------------------------------------
function startAssign() {
  assigning = true;
  addBtn.classList.add('active');
  lumox.midi.beginAssign();
  applyAwaiting({ waiting: false });
}
function stopAssign() {
  assigning = false;
  addBtn.classList.remove('active');
  banner.hidden = true;
}

addBtn.addEventListener('click', () => { if (assigning) { lumox.midi.cancelAssign(); stopAssign(); } else startAssign(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && assigning) { lumox.midi.cancelAssign(); stopAssign(); } });

// ---- table edits (delegated) -------------------------------------------
table.on('click', '.mw-del', (_e, t) => {
  const id = (t.closest('.mw-row') as HTMLElement)?.dataset.id;
  if (id) lumox.midi.removeBinding(id);
});
table.on('click', '.mw-seg .seg-btn', (_e, t) => {
  const id = (t.closest('.mw-row') as HTMLElement)?.dataset.id;
  const mode = (t as HTMLElement).dataset.mode as 'toggle' | 'flash';
  if (id) lumox.midi.setBindingOptions(id, { mode });
});
table.on('click', '.mw-inv', (_e, t) => {
  const row = t.closest('.mw-row') as HTMLElement;
  const id = row?.dataset.id;
  if (id) lumox.midi.setBindingOptions(id, { invert: !t.classList.contains('on') });
});
table.on('click', '.mw-led', (_e, t) => {
  const id = (t.closest('.mw-row') as HTMLElement)?.dataset.id;
  if (id) lumox.midi.setBindingOptions(id, { ledColor: (t as HTMLElement).dataset.led });
});
table.on('click', '.mw-ledmode .seg-btn', (_e, t) => {
  const id = (t.closest('.mw-row') as HTMLElement)?.dataset.id;
  const ledMode = (t as HTMLElement).dataset.ledmode as 'solid' | 'blink' | 'fade';
  if (id) lumox.midi.setBindingOptions(id, { ledMode });
});

// ---- live event wiring -------------------------------------------------
lumox.midi.onStatus(applyStatus);
lumox.midi.onBindings(renderTable);
lumox.midi.onAwaitingInput(applyAwaiting);
lumox.midi.onAssignMode((m) => { if (!m.active) stopAssign(); });
lumox.midi.onMessage((m: MidiMonitorMessage) => {
  monEl.textContent = m.type === 'note'
    ? `note ch${m.channel} #${m.number} v${m.value}`
    : `cc ch${m.channel} #${m.number} → ${m.value}`;
});

// initial paint
lumox.midi.status().then(applyStatus).catch(() => {});
lumox.midi.listBindings().then(renderTable).catch(() => renderTable([]));
