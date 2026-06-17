// Renderer entry — titlebar controls, tab navigation, resizable dock layout.

import { makeDock } from './lib/dock.js';
import { makeLibraryTile } from './views/library.js';
import { makePatchGridTile } from './views/patchgrid.js';
import { makeGroupBarTile } from './views/groupbar.js';
import { makeStageTile } from './views/stage.js';
import { makeBanksTile } from './views/banks.js';
import { makeFxPaletteTile } from './views/fxpalette.js';

const { lumox } = window;

// ---- workspace: resizable dock -----------------------------------------
const ws = document.querySelector('.workspace');
const dock = makeDock(ws, { topCol: 300, topFraction: 0.65 });  // top 65% height, bottom 50/50

// Bottom row + groups strip are SHARED across tabs (mounted once).
makeGroupBarTile().then(({ tile }) => dock.mount('groups', tile));
makeStageTile().then(({ tile }) => dock.mount('bl', tile));

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
  document.querySelectorAll('.tb-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  for (const [tab, tiles] of Object.entries(top)) {
    tiles.forEach((t) => t.classList.toggle('hidden', tab !== name));
  }
  // top split per tab: SETUP → narrow library; CONTROL → wide banks, ~20% FX
  if (name === 'control') dock.setTopColFraction(0.8);
  else dock.setTopCol(300);
}

// ---- tab navigation ----------------------------------------------------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tb-tab');
  if (btn?.dataset.tab) showTab(btn.dataset.tab);
});

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
