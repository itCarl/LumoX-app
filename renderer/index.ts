// Renderer entry — titlebar controls, tab navigation, resizable dock layout.

import { makeDock } from './lib/dock';
import { makeLibraryTile } from './views/library';
import { makePatchGridTile } from './views/patchgrid';
import { makeGroupBarTile } from './views/groupbar';
import { makeStageTile } from './views/stage';
import { makeBanksTile } from './views/banks';
import { makeFxPaletteTile } from './views/fxpalette';
import { makeFaderEditorTile } from './views/fadereditor';
import { makeLimitsTile } from './views/limits-tile';
import { makeDebugView } from './views/debug';
import { makeConnectionView } from './views/connection';
import { openSettingsModal } from './views/settings-modal';
import { openMenu, closeMenu } from './lib/widgets';
import { initAppSettings } from './lib/settings';
import { initSelectionBridge } from './lib/selection';
import { initNumberSteppers } from './lib/numberStepper';
import { initMidiAssign } from './lib/midiassign';
import { isEditable } from './lib/keys';
import { bus, EV } from './lib/bus';
import { audioEngine, type Unsubscribe } from './lib/audio-engine';
import type { TransportStatus, TempoSource } from './lumox.d';

const { lumox } = window;

// Apply app preferences (language, accent) before the UI fills in, and keep them
// in sync as they change.
initAppSettings();

// Mirror the shared fixture selection into main's ordered programming target
// (so FX layers can sweep across it) and reflect main-driven reorders back.
initSelectionBridge();

// Replace the native number-input spin arrows with custom on-theme steppers.
initNumberSteppers();

// MIDI control surface: title-bar button opens the mapping window; the assign
// overlay paints tagged controls purple while assigning.
initMidiAssign();
const midiBtn = document.getElementById('midi-btn');
midiBtn?.addEventListener('click', () => lumox?.midi.openWindow());
lumox?.midi.onStatus((s) => midiBtn?.classList.toggle('connected', s.connected));
lumox?.midi.status().then((s) => midiBtn?.classList.toggle('connected', s.connected)).catch(() => {});

// ---- workspace: resizable dock -----------------------------------------
const ws = document.querySelector('.workspace') as HTMLElement;
const debugView = document.querySelector('.debug-view') as HTMLElement;
const connectionView = document.querySelector('.connection-view') as HTMLElement;
const dock = makeDock(ws, { topCol: 300, topFraction: 0.5, bottomFraction: 0.5 });  // top 50% height, stage / limits split the bottom row 50/50

// full-page views — debug (⋯ menu) and connection (its own titlebar tab)
const fullViews: Record<string, HTMLElement> = { debug: debugView, connection: connectionView };
makeDebugView().then((el) => debugView.appendChild(el));
makeConnectionView().then((el) => connectionView.appendChild(el));

// Bottom row + groups strip are SHARED across tabs (mounted once).
makeGroupBarTile().then(({ tile }) => dock.mount('groups', tile));
// The stage is shared too, but its role switches per tab: SETUP positions fixtures,
// CONTROL is selection-only (`setStageMode`).
let setStageMode: ((tab: string) => void) | null = null;
makeStageTile().then(({ tile, setMode }) => { setStageMode = setMode; dock.mount('bl', tile); setMode(currentTab); });

// Bottom-right: fader editor in CONTROL, fixture-limits editor in SETUP (both
// mounted into the same slot; the active tab toggles which is visible).
let faderTile: HTMLElement | null = null;
makeFaderEditorTile().then(({ tile }) => { faderTile = tile; dock.mount('br', tile); showTab(currentTab); });
let limitsTile: HTMLElement | null = null;
makeLimitsTile().then(({ tile }) => { limitsTile = tile; dock.mount('br', tile); showTab(currentTab); });

// Top-row tiles per tab — all mounted, toggled by the active tab so state
// (selection, patch grid, scenes) survives switching.
const top: Record<string, HTMLElement[]> = {};   // { setup:[tl,tr], control:[tl,tr] }
Promise.all([
  makeLibraryTile(),
  makePatchGridTile().then((r) => r.tile),
  makeBanksTile().then((r) => r.tile),
  makeFxPaletteTile().then((r) => r.tile),
]).then(([lib, patch, banks, fx]) => {
  dock.mount('tl', lib); dock.mount('tr', patch);
  dock.mount('tl', banks); dock.mount('tr', fx);
  top.setup = [lib, patch];
  top.control = [banks, fx];
  showTab(currentTab);
});

let currentTab = 'setup';
function showTab(name: string) {
  currentTab = name;
  const isFull = name in fullViews;   // debug / connection
  // Highlight the matching tab button by name (full views with a tab — e.g.
  // Connection — still light up; debug has no button so nothing matches).
  document.querySelectorAll('.tb-tab').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === name));

  // toggle full-page views vs the dock workspace
  ws.classList.toggle('hidden', isFull);
  for (const [v, el] of Object.entries(fullViews)) el.classList.toggle('hidden', v !== name);
  if (isFull) return;

  for (const [tab, tiles] of Object.entries(top)) {
    tiles.forEach((t) => t.classList.toggle('hidden', tab !== name));
  }
  // bottom-right: fader editor only in CONTROL, limits editor only in SETUP
  if (faderTile) faderTile.classList.toggle('hidden', name !== 'control');
  if (limitsTile) limitsTile.classList.toggle('hidden', name !== 'setup');
  // stage role: positioning in SETUP, selection-only in CONTROL (full views leave it as-is)
  if (!isFull) setStageMode?.(name);
  // top split per tab: SETUP → library at 25%; CONTROL → scenes 75%, FX 25%
  if (name === 'control') dock.setTopColFraction(0.75);
  else dock.setTopColFraction(0.25);
}

// ---- tab navigation ----------------------------------------------------
(document.getElementById('tabs') as HTMLElement).addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.tb-tab') as HTMLElement | null;
  if (btn?.dataset.tab) showTab(btn.dataset.tab);
});

// ---- project: titlebar name + dirty marker -----------------------------
const docEl = document.querySelector('.tb-doc') as HTMLElement;
let projectDirty = false;
function applyProjectInfo(info: { name: string; path: string | null; dirty: boolean }) {
  projectDirty = info.dirty;
  // Show the whole file name (e.g. `demo-show-1.lmx`); for an unsaved project with
  // no path yet, append the `.lmx` extension to the display name so the titlebar
  // always carries the project-file extension.
  const label = info.path ? info.path.replace(/^.*[\\/]/, '') : `${info.name}.lmx`;
  if (docEl) docEl.textContent = `— ${label}${info.dirty ? ' *' : ''}`;
}
// Confirm before discarding unsaved changes (New / Open) via the dialog window.
async function guardDirty(action: () => void) {
  if (projectDirty) {
    const choice = await lumox.dialog.open({
      title: 'Discard changes?',
      message: 'Discard unsaved changes in this project?',
      detail: 'This cannot be undone.',
      buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'discard', label: 'Discard', variant: 'danger' }],
      cancelId: 'cancel',
      width: 440, height: 180,
    });
    if (choice !== 'discard') return;
  }
  action();
}

lumox?.project?.info().then(applyProjectInfo).catch(() => {});
lumox?.project?.onChanged(applyProjectInfo);
// Rebuild all views after a project loads, then surface any missing-fixture report.
lumox?.project?.onLoaded(() => location.reload());
lumox?.project?.report().then((issues) => { if (issues?.length) showIssuesModal(issues); }).catch(() => {});


// ---- ⋯ app menu --------------------------------------------------------
const appMenuBtn = document.getElementById('app-menu-btn') as HTMLElement;
appMenuBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (document.querySelector('.ctx-menu')) { closeMenu(); return; }  // toggle
  const hist = await lumox.history.state().catch(() => ({ canUndo: false, canRedo: false }));
  openMenu([
    { label: 'Undo', key: 'Ctrl+Z', disabled: !hist.canUndo, onClick: () => lumox.history.undo() },
    { label: 'Redo', key: 'Ctrl+Y', disabled: !hist.canRedo, onClick: () => lumox.history.redo() },
    { divider: true },
    { label: 'New Project', key: 'Ctrl+N', onClick: () => guardDirty(() => lumox.project.new()) },
    { label: 'Open Project…', key: 'Ctrl+O', onClick: () => guardDirty(() => lumox.project.open()) },
    { label: 'Save Project', key: 'Ctrl+S', onClick: () => lumox.project.save() },
    { label: 'Save Project As…', key: 'Ctrl+Shift+S', onClick: () => lumox.project.saveAs() },
    { divider: true },
    { label: 'Settings…', key: 'Ctrl+,', onClick: () => openSettingsModal() },
    { label: 'Debug — all faders', onClick: () => showTab('debug') },
  ], { anchor: appMenuBtn });
});

// keyboard shortcuts for project actions
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); if (e.shiftKey) lumox.project.saveAs(); else lumox.project.save(); }
  else if (k === 'o' && !e.shiftKey) { e.preventDefault(); guardDirty(() => lumox.project.open()); }
  else if (k === 'n' && !e.shiftKey) { e.preventDefault(); guardDirty(() => lumox.project.new()); }
  else if (k === ',') { e.preventDefault(); openSettingsModal(); }
  else if (k === 'z' && !e.shiftKey) { if (isEditable(e.target)) return; e.preventDefault(); lumox.history.undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { if (isEditable(e.target)) return; e.preventDefault(); lumox.history.redo(); }
});

// ---- missing-fixture report modal --------------------------------------
function showIssuesModal(issues: Array<{ kind: string; definitionId: string; modeId?: string; count: number; fixtures: string[] }>) {
  const list = issues.map((it) => {
    const more = it.count > it.fixtures.length ? ', …' : '';
    const fx = it.fixtures.join(', ') + more;
    return it.kind === 'missing-definition'
      ? `${it.count}× definition “${it.definitionId}” not installed — skipped (${fx})`
      : `definition “${it.definitionId}” mode “${it.modeId}” missing — used default (${it.count}×: ${fx})`;
  });
  void lumox.dialog.open({
    title: 'Missing fixtures',
    message: "Some fixtures in this project aren't installed on this computer:",
    list,
    buttons: [{ id: 'ok', label: 'OK', variant: 'primary' }],
    cancelId: 'ok',
    width: 540, height: 320,
  });
}


// ---- titlebar window controls -----------------------------------------
const maxBtn = document.getElementById('win-max');
document.getElementById('win-min')?.addEventListener('click', () => lumox?.win.minimize());
document.getElementById('win-close')?.addEventListener('click', () => lumox?.win.close());
maxBtn?.addEventListener('click', () => lumox?.win.maximize());

function setMaxIcon(isMax: boolean) {
  if (!maxBtn) return;
  maxBtn.title = isMax ? 'Restore' : 'Maximize';
  maxBtn.innerHTML = `<i class="fa-solid ${isMax ? 'fa-window-restore' : 'fa-window-maximize'}"></i>`;
}
lumox?.win.onMaximized(setMaxIcon);
lumox?.win.isMaximized().then(setMaxIcon);

// ---- master BPM clock (titlebar) ---------------------------------------
// Editable tempo + tap-tempo + a beat LED that pulses on each beat. The LED is
// a local visual metronome derived from the master BPM (the engine has no
// shared downbeat to lock to); tapping realigns the beat to the tap. The tempo
// can also be driven by an external source (MIDI clock / audio / Ableton Link),
// chosen in Settings — while one is active the field is locked (read-only) and a
// source chip shows which clock is in control. See docs/knowledge-base/tempo.md.
const bpmInput = document.getElementById('bpm-input') as HTMLInputElement | null;
const beatEl = document.getElementById('bpm-beat') as HTMLElement | null;
const bpmClock = document.getElementById('bpm-clock') as HTMLElement | null;
const bpmSrc = document.getElementById('bpm-src') as HTMLButtonElement | null;
const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5eb3ff';
let beatMs = 500;                       // 120 BPM
let beatOrigin = performance.now();
let locked = false;                     // an external source is driving the tempo
const setBeat = (bpm: number, origin?: number) => { beatMs = 60000 / Math.max(1, bpm); if (origin != null) beatOrigin = origin; };

// Push a new tempo to the engine; the clamped value it returns is authoritative.
// No-op while an external clock is locked (the engine would ignore it anyway).
function applyBpm(raw: number, origin?: number) {
  if (locked || !Number.isFinite(raw)) return;
  lumox?.transport?.setBpm(raw).then((bpm) => {
    if (bpmInput) bpmInput.value = String(bpm);   // reflect the clamped value, even while focused
    setBeat(bpm, origin);
    bus.emit(EV.TEMPO_CHANGED, bpm);
  }).catch(() => {});
}

const SRC_LABELS: Record<TempoSource, string> = { manual: '', midi: 'MIDI', audio: 'AUDIO', link: 'LINK' };

// Shared audio capture — the onset/BPM detector runs only while 'audio' is the active
// source; its estimate is pushed to the engine (honoured there only when source is
// 'audio'). The same capture also feeds the Connection-tab spectrum meter, so it stays
// open whenever either needs it. Input denial reverts the source to manual.
let bpmUnsub: Unsubscribe | null = null;
let stateUnsub: Unsubscribe | null = null;
function syncAudioSource(source: TempoSource): void {
  if (source === 'audio' && !bpmUnsub) {
    bpmUnsub = audioEngine.onBpm((bpm) => lumox?.transport?.audioBpm(bpm).catch(() => {}));
    stateUnsub = audioEngine.onState((s) => { if (s === 'denied') lumox?.transport?.setSource('manual'); });
  } else if (source !== 'audio' && bpmUnsub) {
    bpmUnsub(); bpmUnsub = null;
    stateUnsub?.(); stateUnsub = null;
  }
}

// The chosen input device + band count are machine settings; apply them to the shared
// capture at boot and whenever they change (the Connection tab writes them).
const applyAudioSettings = (s: { audioInput: string | null; audioBands: number }): void => {
  audioEngine.setDevice(s.audioInput);
  audioEngine.setBandCount(s.audioBands);
};
lumox?.settings?.get().then(applyAudioSettings).catch(() => {});
lumox?.settings?.onChanged(applyAudioSettings);

// Audio-reactive bindings: while the engine holds bindings, main asks the renderer to
// keep the shared capture open and forward level frames (even off the Connection tab),
// so the rig reacts regardless of which tab is visible.
let audioStreamUnsub: Unsubscribe | null = null;
function setAudioStream(on: boolean): void {
  if (on && !audioStreamUnsub) {
    audioStreamUnsub = audioEngine.onSpectrum((f) => { void lumox?.audio?.levels(f); });
  } else if (!on && audioStreamUnsub) {
    audioStreamUnsub(); audioStreamUnsub = null;
  }
}
lumox?.audio?.onStream(setAudioStream);
lumox?.audio?.listBindings().then((b) => setAudioStream(b.length > 0)).catch(() => {});

// Reflect the live transport status onto the titlebar (initial + on every change).
function reflectStatus(s: TransportStatus): void {
  locked = s.locked;
  if (bpmInput) {
    if (document.activeElement !== bpmInput) bpmInput.value = String(s.bpm);
    bpmInput.readOnly = locked;
  }
  setBeat(s.bpm);
  bpmClock?.classList.toggle('locked', locked);
  if (bpmSrc) {
    bpmSrc.hidden = s.source === 'manual';
    bpmSrc.textContent = SRC_LABELS[s.source];
  }
  syncAudioSource(s.source);
}

lumox?.transport?.get().then(reflectStatus).catch(() => {});
lumox?.transport?.onChanged(reflectStatus);
bpmSrc?.addEventListener('click', () => openSettingsModal());
bpmInput?.addEventListener('change', () => applyBpm(Number(bpmInput.value)));

// Scrub the tempo by dragging the field vertically (up = faster). A small
// movement threshold still lets a plain click focus the field for typing; we
// only push a new BPM when the rounded value actually changes (throttles IPC).
if (bpmInput) {
  let pid = -1, dragging = false, startY = 0, startVal = 120, lastVal = 0;
  bpmInput.addEventListener('pointerdown', (e) => {
    pid = e.pointerId; dragging = false;
    startY = e.clientY; startVal = Number(bpmInput.value) || 120; lastVal = startVal;
  });
  bpmInput.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || (e.buttons & 1) === 0) return;
    const dy = startY - e.clientY;
    if (!dragging) {
      if (Math.abs(dy) < 3) return;          // tiny move = click → leave focus/typing alone
      dragging = true;
      bpmInput.setPointerCapture(pid);
      bpmInput.blur();                        // leave text-edit mode while scrubbing
    }
    e.preventDefault();
    const perBpm = e.shiftKey ? 12 : 4;       // px of travel per 1 BPM (Shift = fine)
    const val = Math.round(startVal + dy / perBpm);
    if (val !== lastVal) { lastVal = val; applyBpm(val); }
  });
  const endScrub = (e: PointerEvent) => {
    if (pid < 0) return;
    if (dragging) { e.preventDefault(); try { bpmInput.releasePointerCapture(pid); } catch { /* ignore */ } }
    pid = -1; dragging = false;
  };
  bpmInput.addEventListener('pointerup', endScrub);
  bpmInput.addEventListener('pointercancel', endScrub);
}

// Tap tempo — average the gaps between recent taps; a >2s pause starts fresh.
let taps: number[] = [];
document.getElementById('bpm-tap')?.addEventListener('click', () => {
  if (locked) return;                   // an external clock owns the tempo
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  if (taps.length > 6) taps.shift();
  if (taps.length >= 2) {
    let sum = 0;
    for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
    applyBpm(Math.round(60000 / (sum / (taps.length - 1))), now);
  } else {
    beatOrigin = now;   // first tap just sets the downbeat
  }
});

// Reflect tempo changes made elsewhere (e.g. the scene properties Tempo field).
bus.on(EV.TEMPO_CHANGED, (bpm: number) => {
  if (typeof bpm !== 'number') return;
  if (bpmInput && document.activeElement !== bpmInput) bpmInput.value = String(bpm);
  setBeat(bpm);
});

// Drive the beat LED: bright on the beat, decaying toward the next one.
function beatTick(now: number) {
  if (beatEl) {
    const intensity = 1 - ((((now - beatOrigin) / beatMs) % 1) + 1) % 1;
    beatEl.style.opacity = (0.25 + 0.75 * intensity).toFixed(3);
    beatEl.style.boxShadow = intensity > 0.02 ? `0 0 ${(9 * intensity).toFixed(1)}px ${accent}` : 'none';
  }
  requestAnimationFrame(beatTick);
}
requestAnimationFrame(beatTick);
