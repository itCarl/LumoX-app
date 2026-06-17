// Patch Grid tile — 512-channel DMX map for one universe. Accepts fixture
// profiles dragged from the Fixture Library: drop on a cell to patch the
// fixture starting at that address.

import { bus, EV } from '../lib/bus.js';

const { lumox } = window;
const CHANNELS = 512;
const COLS = 32;

export async function makePatchGridTile() {
  const tile = document.createElement('section');
  tile.className = 'tile pg-tile';
  tile.innerHTML = `
    <div class="tile-head">
      <span>PATCH</span>
      <span class="pg-head-right">
        <span id="pg-msg" class="pg-msg"></span>
        <span class="seg pg-seg">
          <button class="seg-btn active" data-mode="grid">GRID</button>
          <button class="seg-btn" data-mode="list">LIST</button>
        </span>
        <select id="pg-uni" class="pg-uni"></select>
      </span>
    </div>
    <div class="tile-body pg-body">
      <div id="pg-grid" class="pg-grid"></div>
    </div>`;

  const uniSel = tile.querySelector('#pg-uni');
  const gridEl = tile.querySelector('#pg-grid');
  const msgEl = tile.querySelector('#pg-msg');
  gridEl.style.setProperty('--cols', COLS);
  gridEl.style.setProperty('--rows', Math.ceil(CHANNELS / COLS));

  let msgTimer = null;
  function flash(text) {
    msgEl.textContent = text;
    msgEl.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgEl.classList.remove('show'); msgEl.textContent = ''; }, 2600);
  }

  let currentUni = 0;
  let universes = [];
  let fixtures = [];
  let viewMode = 'grid';   // 'grid' | 'list'
  let lastCellFx = [];     // ch → fixture (current universe) for hover checks
  let dragSpan = 0;        // channel count of the fixture being dragged
  let dragMoveId = null;   // id when an internal move is in progress
  let highlightGroup = 'all';  // group id to highlight (not filter)

  async function reload() {
    [universes, fixtures] = await Promise.all([
      lumox.universes.list(),
      lumox.patch.list(),
    ]);
    if (!universes.length) universes = [{ id: 0, name: 'Universe 1' }];
    if (!universes.some((u) => u.id === currentUni)) currentUni = universes[0].id;
    uniSel.innerHTML = universes.map((u) =>
      `<option value="${u.id}"${u.id === currentUni ? ' selected' : ''}>${u.name}</option>`).join('');
    render();
  }

  // notify other tiles after a mutating action (kept out of reload to avoid loops)
  function announce() { bus.emit(EV.PATCH_CHANGED); bus.emit(EV.GROUPS_CHANGED); }

  function render() {
    gridEl.classList.toggle('as-list', viewMode === 'list');
    viewMode === 'list' ? renderList() : renderGrid();
  }

  function renderList() {
    const list = fixtures.filter((f) => f.universeId === currentUni)
      .sort((a, b) => a.startAddress - b.startAddress);
    gridEl.innerHTML = `
      <table class="pg-list">
        <thead><tr><th>Addr</th><th>Name</th><th>Profile</th><th>Mode</th><th>Ch</th><th></th></tr></thead>
        <tbody>${list.map((f) => `
          <tr data-fx="${f.id}">
            <td>${f.startAddress}–${f.endAddress}</td>
            <td>${f.name}</td>
            <td class="muted">${f.model}</td>
            <td class="muted">${f.modeName}</td>
            <td>${f.channelCount}</td>
            <td><button class="pg-del" data-del="${f.id}" title="Unpatch">✕</button></td>
          </tr>`).join('') || '<tr><td colspan="6" class="muted pad">No fixtures patched. Switch to GRID and drag from the library.</td></tr>'}
        </tbody>
      </table>`;
    gridEl.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => unpatch(b.dataset.del)));
  }

  const pos = (ch) => ({ row: Math.floor((ch - 1) / COLS) + 1, col: ((ch - 1) % COLS) + 1 });

  function renderGrid() {
    const cellFx = new Array(CHANNELS + 1).fill(null);
    for (const f of fixtures) {
      if (f.universeId !== currentUni) continue;
      for (let a = f.startAddress; a <= f.endAddress && a <= CHANNELS; a++) cellFx[a] = f;
    }
    lastCellFx = cellFx;

    let html = '';
    let ch = 1;
    while (ch <= CHANNELS) {
      const f = cellFx[ch];
      const { row, col } = pos(ch);
      if (!f) {
        // empty channel — single numbered cell
        html += `<div class="cell empty" style="grid-row:${row};grid-column:${col}" data-ch="${ch}" title="Ch ${ch}"><span class="cell-num">${ch}</span></div>`;
        ch++;
        continue;
      }
      // patched fixture — emit one spanning block per row-run so the bar is
      // a single connected element with the name stretched across it.
      const runStart = ch;
      while (ch <= CHANNELS && cellFx[ch] === f && pos(ch).row === row) ch++;
      const runLen = ch - runStart;
      const isHead = f.startAddress === runStart;   // first segment carries the name
      const c = f.color || '#4ba6e0';
      const hl = highlightGroup !== 'all' && f.groupId === highlightGroup ? ' hl' : '';
      html += `<div class="cell fx${isHead ? ' fx-head' : ' fx-cont'}${hl}" draggable="true"
        style="grid-row:${row};grid-column:${col}/span ${runLen};--fx:${c}"
        data-ch="${runStart}" data-fx="${f.id}" data-start="${f.startAddress}"
        title="${f.name} · ${f.startAddress}–${f.endAddress} (${f.channelCount}ch) · ${f.groupName ?? ''}">
        <span class="cell-num">${runStart}</span>
        <span class="cell-fx">${f.name}</span>
      </div>`;
    }
    gridEl.innerHTML = html;

    gridEl.querySelectorAll('.cell[data-fx]').forEach((el) => {
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); showFixtureMenu(e, el.dataset.fx); });
      el.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('application/x-lumox-move', el.dataset.fx);
        ev.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
        const f = fixtures.find((x) => x.id === el.dataset.fx);
        bus.emit(EV.DRAG_START, { span: f?.channelCount ?? 1, moveId: el.dataset.fx });
      });
      el.addEventListener('dragend', () => { el.classList.remove('dragging'); bus.emit(EV.DRAG_END); });
    });
  }

  async function unpatch(id) {
    await lumox.patch.remove(id);
    await reload();
    announce();
  }

  // ---- fixture context menu --------------------------------------------
  function closeMenus() { document.querySelectorAll('.ctx-menu').forEach((m) => m.remove()); }
  async function showFixtureMenu(e, fxId) {
    closeMenus();
    const fx = fixtures.find((f) => f.id === fxId);
    if (!fx) return;
    let groups = [];
    try { groups = await lumox.groups.list(); } catch { /* ignore */ }
    // groups the fixture is not already a member of
    const candidates = groups.filter((g) => !g.fixtureIds.includes(fxId));

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.innerHTML = `
      <div class="ctx-head"><span class="ctx-dot" style="background:${fx.color}"></span>${fx.name}</div>
      <div class="ctx-sub">Add to group</div>
      ${candidates.length ? candidates.map((g) => {
        const ok = g.configKey === fx.configKey;
        return `<button data-grp="${g.id}" class="${ok ? '' : 'ctx-disabled'}"
          ${ok ? '' : 'title="Non compatible channel configuration"'}>
          <span class="ctx-dot" style="background:${g.color}"></span>${g.name}</button>`;
      }).join('') : '<div class="ctx-empty muted">No other groups</div>'}
      <div class="ctx-divider"></div>
      <button data-act="unpatch" class="ctx-danger">Unpatch</button>`;

    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - h - 8)}px`;

    menu.querySelectorAll('button[data-grp]:not(.ctx-disabled)').forEach((b) =>
      b.addEventListener('click', async () => {
        closeMenus();
        const g = groups.find((x) => x.id === b.dataset.grp);
        try { await lumox.groups.setFixtures(g.id, [...g.fixtureIds, fxId]); }
        catch (err) { console.error('[groups] add failed:', err.message); }
        announce();
      }));
    menu.querySelector('[data-act="unpatch"]').addEventListener('click', () => { closeMenus(); unpatch(fxId); });
  }
  document.addEventListener('click', closeMenus);

  // ---- drag & drop from the library ------------------------------------
  // ---- hover preview: ghost spanning the channels the fixture would use --
  let ghostStart = 0;   // last channel the ghost was drawn for (avoid rebuilds)
  function clearGhost() { gridEl.querySelectorAll('.drop-ghost').forEach((g) => g.remove()); ghostStart = 0; }
  function showGhost(start) {
    if (start === ghostStart) return;   // same cell — skip rebuild (dragover fires constantly)
    ghostStart = start;
    gridEl.querySelectorAll('.drop-ghost').forEach((g) => g.remove());
    const span = dragSpan || 1;
    const end = start + span - 1;
    let bad = end > CHANNELS;
    for (let a = start; a <= Math.min(end, CHANNELS); a++) {
      const f = lastCellFx[a];
      if (f && f.id !== dragMoveId) { bad = true; break; }
    }
    let ch = start;
    let first = true;
    while (ch <= Math.min(end, CHANNELS)) {
      const { row, col } = pos(ch);
      let run = ch;
      while (run <= Math.min(end, CHANNELS) && pos(run).row === row) run++;
      const len = run - ch;
      const g = document.createElement('div');
      g.className = `drop-ghost${bad ? ' bad' : ''}`;
      g.style.gridRow = String(row);
      g.style.gridColumn = `${col} / span ${len}`;
      if (first) g.textContent = `${start}–${Math.min(end, CHANNELS)}${bad ? ' ✕' : ''}`;
      gridEl.appendChild(g);
      first = false;
      ch = run;
    }
  }

  const dndTypes = (e) => e.dataTransfer.types;
  gridEl.addEventListener('dragover', (e) => {
    const t = dndTypes(e);
    const isMove = t.includes('application/x-lumox-move');
    if (!isMove && !t.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = isMove ? 'move' : 'copy';
    const cell = e.target.closest('.cell');
    if (cell) showGhost(Number(cell.dataset.ch));
  });
  gridEl.addEventListener('dragleave', (e) => {
    if (!gridEl.contains(e.relatedTarget)) clearGhost();
  });
  gridEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    clearGhost();
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const startAddress = Number(cell.dataset.ch);
    const moveId = e.dataTransfer.getData('application/x-lumox-move');
    const defId = e.dataTransfer.getData('text/plain');
    try {
      if (moveId) {
        await lumox.patch.move({ id: moveId, universeId: currentUni, startAddress });
      } else if (defId) {
        await lumox.patch.add({ definitionId: defId, universeId: currentUni, startAddress, count: 1 });
      } else return;
    } catch (err) {
      const m = String(err.message || err).replace(/^Error:\s*/, '');
      console.error('[patch] drop failed:', m);
      flash(m);
    }
    await reload();
    announce();
  });

  uniSel.addEventListener('change', () => { currentUni = Number(uniSel.value); render(); });

  // grid / list toggle
  tile.querySelectorAll('.pg-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      viewMode = b.dataset.mode;
      tile.querySelectorAll('.pg-seg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      render();
    }));

  bus.on(EV.GROUPS_CHANGED, reload);   // recolor when group membership/colour changes
  bus.on(EV.DRAG_START, (d) => { dragSpan = d?.span ?? 1; dragMoveId = d?.moveId ?? null; });
  bus.on(EV.DRAG_END, () => { dragSpan = 0; dragMoveId = null; clearGhost(); });
  bus.on(EV.GROUP_SELECTED, (id) => { highlightGroup = id; if (viewMode === 'grid') renderGrid(); });

  await reload();
  return { tile, refresh: reload };
}
