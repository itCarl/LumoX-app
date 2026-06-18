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
import { openMenu, closeMenu } from './lib/widgets';

const { lumox } = window;

// ---- workspace: resizable dock -----------------------------------------
const ws = document.querySelector('.workspace') as HTMLElement;
const debugView = document.querySelector('.debug-view') as HTMLElement;
const dock = makeDock(ws, { topCol: 300, topFraction: 0.65 });  // top 65% height, bottom 50/50

// full-page views reached from the ⋯ menu
const fullViews: Record<string, HTMLElement> = { debug: debugView };
makeDebugView().then((el) => debugView.appendChild(el));

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
  const isFull = name in fullViews;   // debug / devices
  document.querySelectorAll('.tb-tab').forEach((b) => b.classList.toggle('active', !isFull && (b as HTMLElement).dataset.tab === name));

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
(document.getElementById('tabs') as HTMLElement).addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.tb-tab') as HTMLElement | null;
  if (btn?.dataset.tab) showTab(btn.dataset.tab);
});

// ---- ⋯ app menu --------------------------------------------------------
const appMenuBtn = document.getElementById('app-menu-btn') as HTMLElement;
appMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.querySelector('.ctx-menu')) { closeMenu(); return; }  // toggle
  openMenu([
    { label: 'Debug — all faders', onClick: () => showTab('debug') },
    { divider: true },
    { label: 'Save Project…', onClick: () => { lumox.project.save(); } },
    { label: 'Open Project…', onClick: () => { lumox.project.open(); } },
  ], { anchor: appMenuBtn });
});

// reload the whole UI after a project loads (clean rebuild of all views)
lumox?.project?.onLoaded(() => location.reload());

// ---- titlebar window controls -----------------------------------------
const maxBtn = document.getElementById('win-max');
document.getElementById('win-min')?.addEventListener('click', () => lumox?.win.minimize());
document.getElementById('win-close')?.addEventListener('click', () => lumox?.win.close());
maxBtn?.addEventListener('click', () => lumox?.win.maximize());

function setMaxIcon(isMax: boolean) {
  if (!maxBtn) return;
  maxBtn.title = isMax ? 'Restore' : 'Maximize';
  maxBtn.innerHTML = isMax
    ? '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="2.5" y="0.5" width="7" height="7"/><rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg-2)"/></svg>'
    : '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7"/></svg>';
}
lumox?.win.onMaximized(setMaxIcon);
lumox?.win.isMaximized().then(setMaxIcon);
