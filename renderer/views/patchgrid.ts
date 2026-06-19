// Patch Grid tile — 512-channel DMX map for one universe. Accepts fixture
// profiles dragged from the Fixture Library: drop on a cell to patch the
// fixture starting at that address.

import { bus, EV } from '../lib/bus';
import { activeGroup } from '../lib/store';
import { effect } from '@preact/signals-core';
import { esc } from '../lib/html';
import { openMenu } from '../lib/widgets';

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

  const uniSel = tile.querySelector('#pg-uni') as HTMLSelectElement;
  const gridEl = tile.querySelector('#pg-grid') as HTMLElement;
  const msgEl = tile.querySelector('#pg-msg') as HTMLElement;
  gridEl.style.setProperty('--cols', String(COLS));
  gridEl.style.setProperty('--rows', String(Math.ceil(CHANNELS / COLS)));

  let msgTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(text: string) {
    msgEl.textContent = text;
    msgEl.classList.add('show');
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgEl.classList.remove('show'); msgEl.textContent = ''; }, 2600);
  }

  let currentUni = 0;
  let universes: any[] = [];
  let fixtures: any[] = [];
  let viewMode = 'grid';   // 'grid' | 'list'
  let lastCellFx: any[] = [];     // ch → fixture (current universe) for hover checks
  let dragSpan = 0;        // channel count of the fixture being dragged
  let dragMoveId: string | null = null;   // id when an internal move is in progress
  let highlightGroup = 'all';  // group id to highlight (not filter)
  const selected = new Set<string>();   // shared fixture selection (mirrored with the stage)

  async function reload() {
    [universes, fixtures] = await Promise.all([
      lumox.universes.list(),
      lumox.patch.list(),
    ]);
    for (const id of [...selected]) if (!fixtures.some((f) => f.id === id)) selected.delete(id);
    if (!universes.length) universes = [{ id: 0, name: 'Universe 1' }];
    if (!universes.some((u) => u.id === currentUni)) currentUni = universes[0].id;
    uniSel.innerHTML = universes.map((u) =>
      `<option value="${u.id}"${u.id === currentUni ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
    render();
  }

  // notify other tiles after a mutating action (kept out of reload to avoid loops)
  function announce() { bus.emit(EV.PATCH_CHANGED); bus.emit(EV.GROUPS_CHANGED); }

  function render() {
    hovId = null;   // DOM is rebuilt; drop the stale hover so the next mouseover re-applies
    gridEl.classList.toggle('as-list', viewMode === 'list');
    if (viewMode === 'list') renderList();
    else renderGrid();
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
            <td>${esc(f.name)}</td>
            <td class="muted">${esc(f.model)}</td>
            <td class="muted">${esc(f.modeName)}</td>
            <td>${f.channelCount}</td>
            <td><button class="pg-del" data-del="${f.id}" title="Unpatch"><i class="fa-solid fa-xmark"></i></button></td>
          </tr>`).join('') || '<tr><td colspan="6" class="muted pad">No fixtures patched. Switch to GRID and drag from the library.</td></tr>'}
        </tbody>
      </table>`;
  }

  const pos = (ch: number) => ({ row: Math.floor((ch - 1) / COLS) + 1, col: ((ch - 1) % COLS) + 1 });

  function renderGrid() {
    const cellFx = new Array(CHANNELS + 1).fill(null);
    for (const f of fixtures) {
      if (f.universeId !== currentUni) continue;
      for (let a = f.startAddress; a <= f.endAddress && a <= CHANNELS; a++) cellFx[a] = f;
    }
    lastCellFx = cellFx;

    const selOrder = [...selected];   // insertion order = the selection index (1-based badge)
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
      const si = selected.has(f.id) ? selOrder.indexOf(f.id) : -1;
      const sel = si >= 0 ? ' sel' : '';
      html += `<div class="cell fx${isHead ? ' fx-head' : ' fx-cont'}${hl}${sel}" draggable="true"
        style="grid-row:${row};grid-column:${col}/span ${runLen};--fx:${c}"
        data-ch="${runStart}" data-fx="${f.id}" data-start="${f.startAddress}"
        title="${esc(f.name)} · ${f.startAddress}–${f.endAddress} (${f.channelCount}ch) · ${esc(f.groupName ?? '')}">
        ${isHead && si >= 0 ? `<span class="pg-idx">${si + 1}</span>` : ''}
        <span class="cell-num">${runStart}</span>
        <span class="cell-fx">${esc(f.name)}</span>
      </div>`;
    }
    gridEl.innerHTML = html;
  }

  async function unpatch(id: string) {
    await lumox.patch.remove(id);
    await reload();
    announce();
  }

  // ---- fixture context menu --------------------------------------------
  async function showFixtureMenu(e: MouseEvent, fxId: string) {
    const fx = fixtures.find((f) => f.id === fxId);
    if (!fx) return;
    let groups: any[] = [];
    try { groups = await lumox.groups.list(); } catch { /* ignore */ }
    // groups the fixture is not already a member of
    const candidates = groups.filter((g) => !g.fixtureIds.includes(fxId));

    openMenu([
      { header: fx.name, color: fx.color },
      { sub: 'Add to group' },
      ...(candidates.length
        ? candidates.map((g) => {
            const ok = g.configKey === fx.configKey;
            return {
              label: g.name,
              dot: g.color,
              disabled: !ok,
              title: ok ? undefined : 'Non compatible channel configuration',
              onClick: async () => {
                try { await lumox.groups.setFixtures(g.id, [...g.fixtureIds, fxId]); }
                catch (err: any) { console.error('[groups] add failed:', err.message); }
                announce();
              },
            };
          })
        : [{ label: 'No other groups', disabled: true } as const]),
      { divider: true },
      { label: 'Unpatch', danger: true, onClick: () => unpatch(fxId) },
    ], { at: e });
  }

  // ---- drag & drop from the library ------------------------------------
  // ---- hover preview: ghost spanning the channels the fixture would use --
  let ghostStart = 0;   // last channel the ghost was drawn for (avoid rebuilds)
  function clearGhost() { gridEl.querySelectorAll('.drop-ghost').forEach((g) => g.remove()); ghostStart = 0; }
  function showGhost(start: number) {
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

  const dndTypes = (e: DragEvent) => (e.dataTransfer as DataTransfer).types;
  gridEl.addEventListener('dragover', (e) => {
    const t = dndTypes(e as DragEvent);
    const isMove = t.includes('application/x-lumox-move');
    if (!isMove && !t.includes('text/plain')) return;
    e.preventDefault();
    (e as DragEvent).dataTransfer!.dropEffect = isMove ? 'move' : 'copy';
    const cell = (e.target as HTMLElement).closest('.cell') as HTMLElement | null;
    if (cell) showGhost(Number(cell.dataset.ch));
  });
  gridEl.addEventListener('dragleave', (e) => {
    if (!gridEl.contains(e.relatedTarget as Node)) clearGhost();
  });
  gridEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    clearGhost();
    const cell = (e.target as HTMLElement).closest('.cell') as HTMLElement | null;
    if (!cell) return;
    const startAddress = Number(cell.dataset.ch);
    const dt = (e as DragEvent).dataTransfer as DataTransfer;
    const moveId = dt.getData('application/x-lumox-move');
    const defId = dt.getData('text/plain');
    try {
      if (moveId) {
        await lumox.patch.move({ id: moveId, universeId: currentUni, startAddress });
      } else if (defId) {
        await lumox.patch.add({ definitionId: defId, universeId: currentUni, startAddress, count: 1 });
      } else return;
    } catch (err: any) {
      const m = String(err.message || err).replace(/^Error:\s*/, '');
      console.error('[patch] drop failed:', m);
      flash(m);
    }
    await reload();
    announce();
  });

  // Delegated handlers — bound once on the stable grid container so they
  // survive every innerHTML re-render (no per-render re-attach / listener leak).
  gridEl.addEventListener('contextmenu', (e) => {
    const cell = (e.target as HTMLElement).closest('.cell[data-fx]') as HTMLElement | null;
    if (!cell) return;
    e.preventDefault();
    showFixtureMenu(e as MouseEvent, cell.dataset.fx as string);
  });
  gridEl.addEventListener('dragstart', (e) => {
    const cell = (e.target as HTMLElement).closest('.cell[data-fx]') as HTMLElement | null;
    if (!cell) return;
    const dt = (e as DragEvent).dataTransfer as DataTransfer;
    dt.setData('application/x-lumox-move', cell.dataset.fx as string);
    dt.effectAllowed = 'move';
    cell.classList.add('dragging');
    const f = fixtures.find((x) => x.id === cell.dataset.fx);
    bus.emit(EV.DRAG_START, { span: f?.channelCount ?? 1, moveId: cell.dataset.fx });
  });
  gridEl.addEventListener('dragend', (e) => {
    const cell = (e.target as HTMLElement).closest('.cell[data-fx]') as HTMLElement | null;
    if (!cell) return;
    cell.classList.remove('dragging');
    bus.emit(EV.DRAG_END);
  });
  gridEl.addEventListener('click', (e) => {
    const del = (e.target as HTMLElement).closest('[data-del]') as HTMLElement | null;
    if (del) { unpatch(del.dataset.del as string); return; }
    // Click a patched fixture to select it (Ctrl/Cmd to add/toggle); empty cell clears.
    const cell = (e.target as HTMLElement).closest('.cell[data-fx]') as HTMLElement | null;
    if (!cell) { if (selected.size) { selected.clear(); emitSelection(); render(); } return; }
    const id = cell.dataset.fx as string;
    if (e.ctrlKey || e.metaKey) { if (selected.has(id)) selected.delete(id); else selected.add(id); }
    else { selected.clear(); selected.add(id); }
    emitSelection();
    render();
  });

  // Hover highlight — a wrapped fixture is several segments sharing data-fx, so
  // light them all together rather than just the one under the cursor.
  let hovId: string | null = null;
  function setHover(id: string | null) {
    if (id === hovId) return;
    if (hovId) gridEl.querySelectorAll(`.cell.fx[data-fx="${hovId}"]`).forEach((c) => c.classList.remove('hov'));
    hovId = id;
    if (hovId) gridEl.querySelectorAll(`.cell.fx[data-fx="${hovId}"]`).forEach((c) => c.classList.add('hov'));
  }
  gridEl.addEventListener('mouseover', (e) => {
    const cell = (e.target as HTMLElement).closest('.cell.fx[data-fx]') as HTMLElement | null;
    setHover(cell ? (cell.dataset.fx as string) : null);
  });
  gridEl.addEventListener('mouseleave', () => setHover(null));

  // Shared fixture selection — mirror the stage (and vice-versa). `src` tags the
  // origin so each tile ignores its own echo.
  const emitSelection = () => bus.emit(EV.FIXTURE_SELECTED, { ids: [...selected], src: 'patch' });
  bus.on(EV.FIXTURE_SELECTED, (d: { ids: string[]; src: string }) => {
    if (!d || d.src === 'patch') return;
    selected.clear();
    for (const id of d.ids) selected.add(id);
    if (viewMode === 'grid') renderGrid();
  });

  uniSel.addEventListener('change', () => { currentUni = Number(uniSel.value); render(); });

  // grid / list toggle
  tile.querySelectorAll('.pg-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      viewMode = (b as HTMLElement).dataset.mode as string;
      tile.querySelectorAll('.pg-seg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      render();
    }));

  bus.on(EV.GROUPS_CHANGED, reload);   // recolor when group membership/colour changes
  bus.on(EV.DRAG_START, (d) => { dragSpan = d?.span ?? 1; dragMoveId = d?.moveId ?? null; });
  bus.on(EV.DRAG_END, () => { dragSpan = 0; dragMoveId = null; clearGhost(); });
  effect(() => { highlightGroup = activeGroup.value; if (viewMode === 'grid') renderGrid(); });

  await reload();
  return { tile, refresh: reload };
}
