// Banks tile (CONTROL view, top-left) — banks hold scenes. Bank tabs + a
// column per bank: header, transport, and stacked scene cells. The column “+”
// captures the current live output into a new scene in that bank.

import { mount, html, raw } from '../lib/dom';
import { openMenu } from '../lib/widgets';

const { lumox } = window;

// per-bank accent colours (cycled by bank index)
const BANK_COLORS = [
  '#e8a33d', '#e0564b', '#e34b8a', '#c44be0', '#8c4be0', '#4b7ce0',
  '#3db0c4', '#4bc46a', '#9ec44b', '#cfcfcf', '#e0c44b',
];
const bankColor = (i: number) => BANK_COLORS[i % BANK_COLORS.length];

// scene colour swatches (context menu)
const SCENE_SWATCHES = ['#e0c44b', '#e8a33d', '#e0564b', '#e34b8a', '#c44be0', '#8c4be0', '#4b7ce0', '#3db0c4', '#4bc46a', '#9ec44b', '#ffffff'];

// crisp SVG transport icons (avoid font-glyph rendering issues)
const ICON = {
  pause: '<svg viewBox="0 0 12 12"><rect x="3" y="2" width="2" height="8"/><rect x="7" y="2" width="2" height="8"/></svg>',
  prev:  '<svg viewBox="0 0 12 12"><rect x="2.5" y="2" width="1.6" height="8"/><path d="M10 2 L5 6 L10 10 Z"/></svg>',
  next:  '<svg viewBox="0 0 12 12"><rect x="7.9" y="2" width="1.6" height="8"/><path d="M2 2 L7 6 L2 10 Z"/></svg>',
  plus:  '<svg viewBox="0 0 12 12"><path d="M6 2.5 V9.5 M2.5 6 H9.5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
};

export async function makeBanksTile() {
  const tile = document.createElement('section');
  tile.className = 'tile bank-tile';
  tile.innerHTML = `
    <div class="bank-tabs" id="bk-tabs"></div>
    <div class="bank-cols tile-body" id="bk-cols"></div>`;

  const tabs = mount(tile.querySelector('#bk-tabs') as HTMLElement);
  const cols = mount(tile.querySelector('#bk-cols') as HTMLElement);
  let active: string | null = null;
  let banks: any[] = [];

  const findScene = (id: string) =>
    banks.find((b) => b.scenes.some((s: any) => s.id === id))?.scenes.find((s: any) => s.id === id);

  async function reload() {
    try { banks = await lumox.banks.list(); } catch { banks = []; }
    if (!banks.length) return;
    if (!banks.some((b) => b.id === active)) active = banks[0].id;

    tabs.set(html`
      ${banks.map((b, i) => html`<button class="bk-tab${b.id === active ? ' active' : ''}" data-bank="${b.id}" style="--bank:${bankColor(i)}">${b.name}</button>`)}
      <button class="bk-tab bk-add" id="bk-add" title="Add bank">+</button>`);

    cols.set(html`${banks.map((b, i) => html`
      <div class="bank-col" data-bank="${b.id}" style="--bank:${bankColor(i)}">
        <div class="bank-col-head"><span>${b.name}</span><span class="bk-chev">▾</span></div>
        <div class="bank-col-transport">
          <button class="bk-t" title="Pause" disabled>${raw(ICON.pause)}</button>
          <button class="bk-t" title="Previous" disabled>${raw(ICON.prev)}</button>
          <button class="bk-t" title="Next" disabled>${raw(ICON.next)}</button>
          <button class="bk-t bk-cap" data-bank="${b.id}" title="Capture current output as a scene">${raw(ICON.plus)}</button>
        </div>
        <div class="bank-scenes">
          ${b.scenes.map((s: any) => html`
            <div class="scene-cell${s.active ? ' active' : ''}" data-scene="${s.id}" style="--sc:${s.color}">
              <div class="sc-name">${s.name}</div>
              <div class="sc-type">STATIC</div>
              <div class="sc-bar"><div class="sc-bar-fill" style="height:${Math.round(s.opacity * 100)}%"></div></div>
            </div>`)}
        </div>
      </div>`)}`);
  }

  // ---- delegated events (bound once; survive every reload) --------------
  tabs.on('click', '#bk-add', async () => { const b = await lumox.banks.add(); active = b.id; reload(); });
  tabs.on('click', '.bk-tab[data-bank]', (_e, t) => { active = t.dataset.bank as string; reload(); });

  cols.on('click', '.bk-cap', async (_e, t) => { await lumox.scenes.capture(t.dataset.bank as string); reload(); });
  cols.on('click', '.scene-cell', async (_e, t) => {
    const id = t.dataset.scene as string;
    const s = findScene(id);
    await lumox.scenes.recall(id, !s?.active);
    reload();
  });
  cols.on('contextmenu', '.scene-cell', (e, t) => {
    e.preventDefault();
    showSceneMenu(e as MouseEvent, t.dataset.scene as string);
  });

  // ---- scene context menu ----------------------------------------------
  function showSceneMenu(e: MouseEvent, sceneId: string) {
    const name = findScene(sceneId)?.name ?? '';
    openMenu([
      { label: 'Delete', key: 'Del', onClick: async () => { await lumox.scenes.remove(sceneId); reload(); } },
      { label: 'Rename…', key: 'Ctrl+R', onClick: async () => {
        const n = prompt('Scene name', name);
        if (n && n.trim()) { await lumox.scenes.rename(sceneId, n.trim()); reload(); }
      } },
      { label: 'Duplicate', key: 'Ctrl+D', onClick: async () => { await lumox.scenes.duplicate(sceneId); reload(); } },
      { label: 'Create Super Scene', disabled: true },
      { divider: true },
      { label: 'Edit', check: true, key: 'Ctrl+E', onClick: async () => { await lumox.scenes.update(sceneId); reload(); } },
      { label: 'Edit Blind', check: false, key: 'Ctrl+B', disabled: true },
      { divider: true },
      { label: 'Export to Steps', disabled: true },
      { label: 'Export FX racks', disabled: true },
      { label: 'Import FX racks', disabled: true },
      { divider: true },
      { swatches: SCENE_SWATCHES, onPick: async (c) => { await lumox.scenes.setColor(sceneId, c); reload(); } },
      { divider: true },
      { label: 'Add control to Touch view', key: 'Alt+click', disabled: true },
    ], { at: e, className: 'scene-menu' });
  }

  await reload();
  return { tile, refresh: reload };
}
