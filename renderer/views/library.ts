// Fixture Library tile — search bar on top, fixtures grouped by vendor in
// collapsible accordions. Read-only for now; click selects a profile.

import { bus, EV } from '../lib/bus';
import { esc } from '../lib/html';
import { button, input } from '../lib/widgets';

const { lumox } = window;

export async function makeLibraryTile() {
  const tile = document.createElement('section');
  tile.className = 'tile lib-tile';
  tile.innerHTML = `
    <div class="tile-head">
      <span>FIXTURE LIBRARY</span>
      <span class="lib-head-right">
        <span id="lib-count" class="tile-count"></span>
      </span>
    </div>
    <div class="lib-search"></div>
    <div id="lib-tree" class="tile-body lib-tree"></div>
    <div id="lib-detail" class="lib-detail"></div>`;

  const treeEl = tile.querySelector('#lib-tree') as HTMLElement;
  // Debounce search — the whole vendor tree rebuilds on each render, so don't
  // do it on every keystroke.
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const qEl = input({
    placeholder: 'Search fixtures…',
    onInput: () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderTree(), 120);
    },
  });
  qEl.autocomplete = 'off';
  (tile.querySelector('.lib-search') as HTMLElement).appendChild(qEl);
  const countEl = tile.querySelector('#lib-count') as HTMLElement;
  const detailEl = tile.querySelector('#lib-detail') as HTMLElement;

  let defs: any[] = [];
  try {
    defs = (await lumox?.library?.list()) ?? [];
  } catch (err: any) {
    treeEl.innerHTML = `<div class="muted pad">Library unavailable:<br>${esc(err.message)}</div>`;
    return tile;
  }
  console.log(`[library] ${defs.length} fixture profiles loaded`);

  // vendor accordions are collapsed by default; track which the user opened
  const expanded = new Set<string>();
  let selected: string | null = null;

  // Delegated handlers — bound once on the stable tree container so they
  // survive every renderTree() rebuild (no per-render re-attach / listener leak).
  treeEl.addEventListener('click', (e) => {
    const head = (e.target as HTMLElement).closest('.acc-head') as HTMLElement | null;
    if (head) {
      const acc = head.parentElement as HTMLElement;
      const v = acc.dataset.vendor as string;
      acc.classList.toggle('collapsed');
      if (acc.classList.contains('collapsed')) expanded.delete(v);
      else expanded.add(v);
      return;
    }
    const item = (e.target as HTMLElement).closest('.tree-item') as HTMLElement | null;
    if (item) { selected = item.dataset.def as string; renderTree(); renderDetail(); }
  });
  treeEl.addEventListener('dragstart', (e) => {
    const item = (e.target as HTMLElement).closest('.tree-item') as HTMLElement | null;
    if (!item) return;
    selected = item.dataset.def as string;
    const dt = (e as DragEvent).dataTransfer as DataTransfer;
    dt.setData('text/plain', item.dataset.def as string);
    dt.effectAllowed = 'copy';
    item.classList.add('dragging');
    const def = defs.find((d) => d.id === item.dataset.def);
    bus.emit(EV.DRAG_START, { span: def?.modes?.[0]?.channelCount ?? 1, moveId: null });
  });
  treeEl.addEventListener('dragend', (e) => {
    const item = (e.target as HTMLElement).closest('.tree-item') as HTMLElement | null;
    if (item) { item.classList.remove('dragging'); bus.emit(EV.DRAG_END); }
  });

  function renderTree() {
    if (!defs.length) {
      treeEl.innerHTML = '<div class="muted pad">No fixtures in library.</div>';
      countEl.textContent = '0';
      return;
    }
    const q = qEl.value.trim().toLowerCase();

    const byVendor = new Map<string, any[]>();
    let shown = 0;
    for (const d of defs) {
      if (q && !`${d.manufacturer} ${d.model}`.toLowerCase().includes(q)) continue;
      const v = d.manufacturer || 'Generic';
      if (!byVendor.has(v)) byVendor.set(v, []);
      byVendor.get(v)!.push(d);
      shown++;
    }
    countEl.textContent = q ? `${shown}/${defs.length}` : String(defs.length);

    if (!shown) {
      treeEl.innerHTML = `<div class="muted pad">No fixtures match “${esc(qEl.value.trim())}”.</div>`;
      return;
    }

    const vendors = [...byVendor.keys()].sort((a, b) => a.localeCompare(b));
    treeEl.innerHTML = vendors.map((v) => {
      const items = byVendor.get(v)!.sort((a, b) => a.model.localeCompare(b.model));
      // collapsed by default; auto-expand while a search is active
      const isCollapsed = !q && !expanded.has(v);
      return `
        <div class="acc${isCollapsed ? ' collapsed' : ''}" data-vendor="${esc(v)}">
          <button class="acc-head">
            <span class="acc-chev">▾</span>
            <span class="acc-name">${esc(v)}</span>
            <span class="acc-count">${items.length}</span>
          </button>
          <div class="acc-items">
            ${items.map((d) => {
              const ch = d.modes?.[0]?.channelCount ?? '?';
              return `<div class="tree-item${selected === d.id ? ' sel' : ''}" draggable="true" data-def="${esc(d.id)}" title="Drag onto the patch grid · ${esc(d.id)}">
                <span class="ti-model">${esc(d.model)}</span><span class="ti-ch">${ch}ch</span></div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  // ---- patch detail form (always visible) ------------------------------
  // Next free address = right after the last patched fixture on the universe.
  async function afterLastAddress(universeId: number) {
    let fixtures: any[] = [];
    try { fixtures = await lumox.patch.list(); } catch { /* ignore */ }
    let last = 0;
    for (const f of fixtures) if (f.universeId === universeId) last = Math.max(last, f.endAddress);
    return Math.min(512, last + 1);
  }

  let preserve: { count: number; index: number } | null = null;   // carried across re-renders

  async function renderDetail() {
    detailEl.classList.add('show');
    const d = defs.find((x) => x.id === selected) ?? null;

    let universes: any[] = [];
    try { universes = await lumox.universes.list(); } catch { /* ignore */ }
    if (!universes.length) universes = [{ id: 0, name: 'Universe 1' }];

    const mode = d?.modes[0];
    const ch = mode?.channelCount;
    const uni = universes[0].id;
    const start = await afterLastAddress(uni);
    const count = preserve?.count ?? 1;
    const index = preserve?.index ?? 1;

    detailEl.innerHTML = `
      <div class="ld-title">${d ? esc(d.model) : 'Patch'} <span class="muted">${ch ? `(${ch} Channel${ch === 1 ? '' : 's'})` : '— select a fixture'}</span></div>
      ${d && d.modes.length > 1 ? `
      <label class="frow"><span>Mode</span>
        <select id="ld-mode">${d.modes.map((m, i) =>
          `<option value="${esc(m.id)}"${i === 0 ? ' selected' : ''}>${esc(m.name)} · ${m.channelCount}ch</option>`).join('')}</select></label>` : ''}
      <label class="frow"><span>DMX Universe</span>
        <select id="ld-uni">${universes.map((u) =>
          `<option value="${u.id}"${u.id === uni ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
      <label class="frow"><span>Starting address</span><input id="ld-addr" type="number" min="1" max="512" value="${start}" /></label>
      <label class="frow"><span>Number of fixtures</span><input id="ld-count" type="number" min="1" max="512" value="${count}" /></label>
      <label class="frow"><span>Index</span><input id="ld-index" type="number" min="1" value="${index}" /></label>
      <div id="ld-msg" class="ld-msg"></div>
      <button id="ld-patch" class="btn-patch"${d ? '' : ' disabled'}>PATCH</button>`;

    const modeSel = detailEl.querySelector('#ld-mode') as HTMLSelectElement | null;
    const uniSel = detailEl.querySelector('#ld-uni') as HTMLSelectElement;
    const addrEl = detailEl.querySelector('#ld-addr') as HTMLInputElement;
    const msgEl = detailEl.querySelector('#ld-msg') as HTMLElement;

    uniSel.addEventListener('change', async () => { addrEl.value = String(await afterLastAddress(Number(uniSel.value))); });

    const patchBtn = detailEl.querySelector('#ld-patch') as HTMLElement;
    if (d) patchBtn.addEventListener('click', async () => {
      msgEl.textContent = '';
      preserve = {
        count: Number((detailEl.querySelector('#ld-count') as HTMLInputElement).value) || 1,
        index: Number((detailEl.querySelector('#ld-index') as HTMLInputElement).value) || 1,
      };
      try {
        await lumox.patch.add({
          definitionId: d.id,
          modeId: modeSel ? modeSel.value : d.modes[0].id,
          universeId: Number(uniSel.value),
          startAddress: Number(addrEl.value),
          count: preserve.count,
          index: preserve.index,
        });
        bus.emit(EV.PATCH_CHANGED);   // PATCH_CHANGED handler re-renders + advances address
        bus.emit(EV.GROUPS_CHANGED);
      } catch (err: any) {
        msgEl.textContent = String(err.message || err).replace(/^Error:\s*/, '');
      }
    });
  }

  (tile.querySelector('.lib-head-right') as HTMLElement).appendChild(
    button({ variant: 'icon', label: '+', title: 'New fixture', onClick: () => lumox.editor.open() }),
  );

  async function reloadDefs() {
    try { defs = (await lumox.library.list()) ?? []; } catch { /* ignore */ }
    renderTree();
    renderDetail();
  }
  bus.on(EV.LIBRARY_CHANGED, reloadDefs);
  lumox.library.onChanged?.(reloadDefs);   // editor lives in a separate window
  bus.on(EV.PATCH_CHANGED, () => renderDetail());   // advance starting address

  renderTree();
  renderDetail();
  return tile;
}
