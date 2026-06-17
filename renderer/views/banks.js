// Banks tile (CONTROL view, top-left) — banks hold scenes. Bank tabs + a
// column per bank: header, transport, and stacked scene cells. The column “+”
// captures the current live output into a new scene in that bank.

const { lumox } = window;

// per-bank accent colours (cycled by bank index)
const BANK_COLORS = [
  '#e8a33d', '#e0564b', '#e34b8a', '#c44be0', '#8c4be0', '#4b7ce0',
  '#3db0c4', '#4bc46a', '#9ec44b', '#cfcfcf', '#e0c44b',
];
const bankColor = (i) => BANK_COLORS[i % BANK_COLORS.length];

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

  const tabsEl = tile.querySelector('#bk-tabs');
  const colsEl = tile.querySelector('#bk-cols');
  let active = null;

  async function reload() {
    let banks = [];
    try { banks = await lumox.banks.list(); } catch { banks = []; }
    if (!banks.length) return;
    if (!banks.some((b) => b.id === active)) active = banks[0].id;

    tabsEl.innerHTML = banks.map((b, i) =>
      `<button class="bk-tab${b.id === active ? ' active' : ''}" data-bank="${b.id}" style="--bank:${bankColor(i)}">${b.name}</button>`).join('')
      + `<button class="bk-tab bk-add" id="bk-add" title="Add bank">+</button>`;

    colsEl.innerHTML = banks.map((b, i) => `
      <div class="bank-col" data-bank="${b.id}" style="--bank:${bankColor(i)}">
        <div class="bank-col-head"><span>${b.name}</span><span class="bk-chev">▾</span></div>
        <div class="bank-col-transport">
          <button class="bk-t" title="Pause" disabled>${ICON.pause}</button>
          <button class="bk-t" title="Previous" disabled>${ICON.prev}</button>
          <button class="bk-t" title="Next" disabled>${ICON.next}</button>
          <button class="bk-t bk-cap" data-bank="${b.id}" title="Capture current output as a scene">${ICON.plus}</button>
        </div>
        <div class="bank-scenes">
          ${b.scenes.map((s) => `
            <div class="scene-cell${s.active ? ' active' : ''}" data-scene="${s.id}" style="--sc:${s.color}">
              <div class="sc-name">${s.name}</div>
              <div class="sc-type">STATIC</div>
              <div class="sc-bar"><div class="sc-bar-fill" style="height:${Math.round(s.opacity * 100)}%"></div></div>
            </div>`).join('')}
        </div>
      </div>`).join('');

    tabsEl.querySelectorAll('.bk-tab[data-bank]').forEach((t) =>
      t.addEventListener('click', () => { active = t.dataset.bank; reload(); }));
    tabsEl.querySelector('#bk-add').addEventListener('click', async () => {
      const b = await lumox.banks.add();
      active = b.id; reload();
    });

    colsEl.querySelectorAll('.bk-cap').forEach((b) =>
      b.addEventListener('click', async () => { await lumox.scenes.capture(b.dataset.bank); reload(); }));

    colsEl.querySelectorAll('.scene-cell').forEach((el) => {
      el.addEventListener('click', async () => {
        const bank = banks.find((bb) => bb.scenes.some((s) => s.id === el.dataset.scene));
        const s = bank?.scenes.find((x) => x.id === el.dataset.scene);
        await lumox.scenes.recall(el.dataset.scene, !s?.active);
        reload();
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSceneMenu(e, el.dataset.scene, el.querySelector('.sc-name').textContent);
      });
    });
  }

  // ---- scene context menu ----------------------------------------------
  function closeMenus() { document.querySelectorAll('.ctx-menu').forEach((m) => m.remove()); }
  function showSceneMenu(e, sceneId, sceneName) {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu scene-menu';
    menu.innerHTML = `
      <button data-act="delete"><span>Delete</span><span class="ctx-key">Del</span></button>
      <button data-act="rename"><span>Rename…</span><span class="ctx-key">Ctrl+R</span></button>
      <button data-act="duplicate"><span>Duplicate</span><span class="ctx-key">Ctrl+D</span></button>
      <button class="ctx-disabled"><span>Create Super Scene</span></button>
      <div class="ctx-divider"></div>
      <button data-act="update"><span class="ctx-check">✓</span><span>Edit</span><span class="ctx-key">Ctrl+E</span></button>
      <button class="ctx-disabled"><span class="ctx-check"></span><span>Edit Blind</span><span class="ctx-key">Ctrl+B</span></button>
      <div class="ctx-divider"></div>
      <button class="ctx-disabled"><span>Export to Steps</span></button>
      <button class="ctx-disabled"><span>Export FX racks</span></button>
      <button class="ctx-disabled"><span>Import FX racks</span></button>
      <div class="ctx-divider"></div>
      <div class="ctx-swatches">${SCENE_SWATCHES.map((c) =>
        `<button class="ctx-sw" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="ctx-divider"></div>
      <button class="ctx-disabled"><span>Add control to Touch view</span><span class="ctx-key">Alt+click</span></button>`;
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - h - 8)}px`;

    menu.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      closeMenus(); await lumox.scenes.remove(sceneId); reload();
    });
    menu.querySelector('[data-act="rename"]').addEventListener('click', async () => {
      closeMenus();
      const n = prompt('Scene name', sceneName);
      if (n && n.trim()) { await lumox.scenes.rename(sceneId, n.trim()); reload(); }
    });
    menu.querySelector('[data-act="duplicate"]').addEventListener('click', async () => {
      closeMenus(); await lumox.scenes.duplicate(sceneId); reload();
    });
    menu.querySelector('[data-act="update"]').addEventListener('click', async () => {
      closeMenus(); await lumox.scenes.update(sceneId); reload();
    });
    menu.querySelectorAll('.ctx-sw').forEach((b) =>
      b.addEventListener('click', async () => {
        closeMenus(); await lumox.scenes.setColor(sceneId, b.dataset.color); reload();
      }));
  }
  document.addEventListener('click', closeMenus);

  await reload();
  return { tile, refresh: reload };
}
