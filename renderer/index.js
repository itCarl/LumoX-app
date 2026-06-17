// Renderer entry — titlebar controls, tab navigation, resizable dock layout.

import { makeDock } from './lib/dock.js';
import { makeLibraryTile } from './views/library.js';
import { makePatchGridTile } from './views/patchgrid.js';
import { makeGroupBarTile } from './views/groupbar.js';
import { makeStageTile } from './views/stage.js';
import { makeBanksTile } from './views/banks.js';
import { makeFxPaletteTile } from './views/fxpalette.js';
import { makeFaderEditorTile } from './views/fadereditor.js';
import { makeDebugView } from './views/debug.js';

const { lumox } = window;

// ---- workspace: resizable dock -----------------------------------------
const ws = document.querySelector('.workspace');
const debugView = document.querySelector('.debug-view');
const dock = makeDock(ws, { topCol: 300, topFraction: 0.65 });  // top 65% height, bottom 50/50

// full-page views reached from the ⋯ menu
const fullViews = { debug: debugView };
makeDebugView().then((el) => debugView.appendChild(el));

// Bottom row + groups strip are SHARED across tabs (mounted once).
makeGroupBarTile().then(({ tile }) => dock.mount('groups', tile));
makeStageTile().then(({ tile }) => dock.mount('bl', tile));

// Bottom-right fader editor — only shown in CONTROL.
let faderTile = null;
makeFaderEditorTile().then(({ tile }) => { faderTile = tile; dock.mount('br', tile); showTab(currentTab); });

// Top-row tiles per tab — all mounted, toggled by the active tab so state
// (selection, patch grid, scenes) survives switching.
const top = {};   // { setup:[tl,tr], control:[tl,tr] }
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
function showTab(name) {
  currentTab = name;
  const isFull = name in fullViews;   // debug / devices
  document.querySelectorAll('.tb-tab').forEach((b) => b.classList.toggle('active', !isFull && b.dataset.tab === name));

  // toggle full-page views vs the dock workspace
  ws.classList.toggle('hidden', isFull);
  for (const [v, el] of Object.entries(fullViews)) el.classList.toggle('hidden', v !== name);
  if (isFull) return;

  for (const [tab, tiles] of Object.entries(top)) {
    tiles.forEach((t) => t.classList.toggle('hidden', tab !== name));
  }
  // fader editor only in CONTROL
  if (faderTile) faderTile.classList.toggle('hidden', name !== 'control');
  // top split per tab: SETUP → narrow library; CONTROL → wide banks, ~20% FX
  if (name === 'control') dock.setTopColFraction(0.8);
  else dock.setTopCol(300);
}

// ---- tab navigation ----------------------------------------------------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tb-tab');
  if (btn?.dataset.tab) showTab(btn.dataset.tab);
});

// ---- ⋯ app menu --------------------------------------------------------
const appMenuBtn = document.getElementById('app-menu-btn');
function closeAppMenu() { document.querySelector('.app-dropdown')?.remove(); }
appMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.querySelector('.app-dropdown')) { closeAppMenu(); return; }
  const m = document.createElement('div');
  m.className = 'app-dropdown';
  m.innerHTML = `
    <button data-go="debug">Debug — all faders</button>
    <div class="ctx-divider"></div>
    <button data-act="save">Save Project…</button>
    <button data-act="open">Open Project…</button>`;
  const r = appMenuBtn.getBoundingClientRect();
  m.style.left = `${r.left}px`;
  m.style.top = `${r.bottom + 2}px`;
  document.body.appendChild(m);
  m.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => { showTab(b.dataset.go); closeAppMenu(); }));
  m.querySelector('[data-act="save"]').addEventListener('click', async () => { closeAppMenu(); await lumox.project.save(); });
  m.querySelector('[data-act="open"]').addEventListener('click', async () => { closeAppMenu(); await lumox.project.open(); });
});
document.addEventListener('click', closeAppMenu);

// reload the whole UI after a project loads (clean rebuild of all views)
lumox?.project?.onLoaded(() => location.reload());

// ---- titlebar window controls -----------------------------------------
const maxBtn = document.getElementById('win-max');
document.getElementById('win-min')?.addEventListener('click', () => lumox?.win.minimize());
document.getElementById('win-close')?.addEventListener('click', () => lumox?.win.close());
maxBtn?.addEventListener('click', () => lumox?.win.maximize());

function setMaxIcon(isMax) {
  if (!maxBtn) return;
  maxBtn.title = isMax ? 'Restore' : 'Maximize';
  maxBtn.innerHTML = isMax
    ? '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="2.5" y="0.5" width="7" height="7"/><rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg-2)"/></svg>'
    : '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7"/></svg>';
}
lumox?.win.onMaximized(setMaxIcon);
lumox?.win.isMaximized().then(setMaxIcon);
