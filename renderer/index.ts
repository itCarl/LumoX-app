// Renderer entry — titlebar controls, tab navigation, resizable dock layout.

import { makeDock } from './lib/dock';
import { makeLibraryTile } from './views/library';
import { makePatchGridTile } from './views/patchgrid';
import { makeGroupBarTile } from './views/groupbar';
import { makeStageTile } from './views/stage';
import { makeBanksTile } from './views/banks';
import { makeFxPaletteTile } from './views/fxpalette';
import { makeFaderEditorTile } from './views/fadereditor';
import { makeDebugView } from './views/debug';
import { makeConnectionView } from './views/connection';
import { openSettingsModal } from './views/settings-modal';
import { openMenu, closeMenu } from './lib/widgets';
import { node, html } from './lib/dom';
import { initAppSettings } from './lib/settings';
import { isEditable } from './lib/keys';
import { bus, EV } from './lib/bus';

const { lumox } = window;

// Apply app preferences (language, accent) before the UI fills in, and keep them
// in sync as they change.
initAppSettings();

// ---- workspace: resizable dock -----------------------------------------
const ws = document.querySelector('.workspace') as HTMLElement;
const debugView = document.querySelector('.debug-view') as HTMLElement;
const connectionView = document.querySelector('.connection-view') as HTMLElement;
const dock = makeDock(ws, { topCol: 300, topFraction: 0.65 });  // top 65% height, bottom 50/50

// full-page views — debug (⋯ menu) and connection (its own titlebar tab)
const fullViews: Record<string, HTMLElement> = { debug: debugView, connection: connectionView };
makeDebugView().then((el) => debugView.appendChild(el));
makeConnectionView().then((el) => connectionView.appendChild(el));

// Bottom row + groups strip are SHARED across tabs (mounted once).
makeGroupBarTile().then(({ tile }) => dock.mount('groups', tile));
makeStageTile().then(({ tile }) => dock.mount('bl', tile));

// Bottom-right fader editor — only shown in CONTROL.
let faderTile: HTMLElement | null = null;
makeFaderEditorTile().then(({ tile }) => { faderTile = tile; dock.mount('br', tile); showTab(currentTab); });

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
  // fader editor only in CONTROL
  if (faderTile) faderTile.classList.toggle('hidden', name !== 'control');
  // top split per tab: SETUP → library at 25%; CONTROL → wide banks, ~20% FX
  if (name === 'control') dock.setTopColFraction(0.8);
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
function applyProjectInfo(info: { name: string; dirty: boolean }) {
  projectDirty = info.dirty;
  if (docEl) docEl.textContent = `— ${info.name}${info.dirty ? ' *' : ''}`;
}
// Confirm before discarding unsaved changes (New / Open).
async function guardDirty(action: () => void) {
  if (projectDirty && !confirm('Discard unsaved changes in this project?')) return;
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
  document.querySelector('.lx-modal-backdrop')?.remove();
  const rows = issues.map((it) => {
    const more = it.count > it.fixtures.length ? ', …' : '';
    const fx = it.fixtures.join(', ') + more;
    return it.kind === 'missing-definition'
      ? html`<li><b>${it.count}×</b> definition <code>${it.definitionId}</code> not installed — skipped <span class="muted">(${fx})</span></li>`
      : html`<li>definition <code>${it.definitionId}</code> mode <code>${it.modeId}</code> missing — used default <span class="muted">(${it.count}×: ${fx})</span></li>`;
  });
  const el = node(html`
    <div class="lx-modal-backdrop">
      <div class="lx-modal" role="dialog" aria-modal="true">
        <div class="lx-modal-head">Missing fixtures</div>
        <div class="lx-modal-body">
          <p>Some fixtures in this project aren't installed on this computer:</p>
          <ul class="lx-issues">${rows}</ul>
        </div>
        <div class="lx-modal-foot"><button class="lx-btn lx-btn-primary" id="lx-modal-ok">OK</button></div>
      </div>
    </div>`);
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  (el.querySelector('#lx-modal-ok') as HTMLElement)?.addEventListener('click', close);
  document.body.appendChild(el);
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
// shared downbeat to lock to); tapping realigns the beat to the tap.
const bpmInput = document.getElementById('bpm-input') as HTMLInputElement | null;
const beatEl = document.getElementById('bpm-beat') as HTMLElement | null;
const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5eb3ff';
let beatMs = 500;                       // 120 BPM
let beatOrigin = performance.now();
const setBeat = (bpm: number, origin?: number) => { beatMs = 60000 / Math.max(1, bpm); if (origin != null) beatOrigin = origin; };

// Push a new tempo to the engine; the clamped value it returns is authoritative.
function applyBpm(raw: number, origin?: number) {
  if (!Number.isFinite(raw)) return;
  lumox?.transport?.setBpm(raw).then((bpm) => {
    if (bpmInput) bpmInput.value = String(bpm);   // reflect the clamped value, even while focused
    setBeat(bpm, origin);
    bus.emit(EV.TEMPO_CHANGED, bpm);
  }).catch(() => {});
}

lumox?.transport?.get().then((t) => { const b = t?.bpm ?? 120; if (bpmInput) bpmInput.value = String(b); setBeat(b); }).catch(() => {});
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
