// Fixture Library tile — search bar on top, fixtures grouped by vendor in
// collapsible accordions. The bundled library is lazy-loaded: vendor heads come
// from a cheap list and a vendor's fixtures load on first expand (search loads
// everything). Read-only browsing; click selects a profile, drag patches it.

import { bus, EV } from '../lib/bus';
import { esc } from '../lib/html';
import { button, input } from '../lib/widgets';
import { confirmDialog } from '../lib/confirm';

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

  // ---- lazy library state -----------------------------------------------
  // `vendors` (cheap) drives the accordion heads; a vendor's fixtures are fetched
  // on first expand into `loaded`; `byId` indexes everything fetched so far for
  // detail / drag / delete; search forces a full load.
  let vendors: { name: string; count: number; source: string }[] = [];
  try {
    vendors = (await lumox?.library?.vendors()) ?? [];
  } catch (err: any) {
    treeEl.innerHTML = `<div class="muted pad">Library unavailable:<br>${esc(err.message)}</div>`;
    return tile;
  }
  const loaded = new Map<string, any[]>();   // vendor → its fixture DTOs (once parsed)
  const byId = new Map<string, any>();        // id → DTO (for detail / drag / delete)
  let allLoaded = false;
  const totalCount = () => vendors.reduce((s, v) => s + v.count, 0);
  const indexDefs = (list: any[]) => { for (const d of list) byId.set(d.id, d); };

  async function loadVendor(name: string): Promise<any[]> {
    const cached = loaded.get(name);
    if (cached) return cached;
    const list = (await lumox.library.vendor(name)) ?? [];
    loaded.set(name, list); indexDefs(list);
    return list;
  }
  async function loadAll(): Promise<void> {
    if (allLoaded) return;
    const list = (await lumox.library.list()) ?? [];
    loaded.clear();
    for (const d of list) {
      const v = d.manufacturer || 'Generic';
      (loaded.get(v) ?? loaded.set(v, []).get(v)!).push(d);
    }
    indexDefs(list);
    allLoaded = true;
  }
  console.log(`[library] ${vendors.length} vendors, ${totalCount()} fixtures (lazy)`);

  // vendor accordions are collapsed by default; track which the user opened
  const expanded = new Set<string>();
  let selected: string | null = null;

  // Delegated handlers — bound once on the stable tree container so they
  // survive every renderTree() rebuild (no per-render re-attach / listener leak).
  treeEl.addEventListener('click', async (e) => {
    const edit = (e.target as HTMLElement).closest('.ti-edit') as HTMLElement | null;
    if (edit) {
      e.stopPropagation();   // don't also select the row
      const id = (edit.closest('.tree-item') as HTMLElement | null)?.dataset.def;
      if (id) lumox.editor.open(id);
      return;
    }
    const del = (e.target as HTMLElement).closest('.ti-del') as HTMLElement | null;
    if (del) {
      e.stopPropagation();   // don't also select the row
      const id = (del.closest('.tree-item') as HTMLElement | null)?.dataset.def;
      if (id) onDeleteFixture(id);
      return;
    }
    const head = (e.target as HTMLElement).closest('.acc-head') as HTMLElement | null;
    if (head) {
      const v = (head.parentElement as HTMLElement).dataset.vendor as string;
      if (expanded.has(v)) { expanded.delete(v); renderTree(); }
      else { expanded.add(v); if (!loaded.has(v)) await loadVendor(v); renderTree(); }   // lazy-load on first open
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
    const def = byId.get(item.dataset.def as string);
    bus.emit(EV.DRAG_START, { span: def?.modes?.[0]?.channelCount ?? 1, moveId: null });
  });
  treeEl.addEventListener('dragend', (e) => {
    const item = (e.target as HTMLElement).closest('.tree-item') as HTMLElement | null;
    if (item) { item.classList.remove('dragging'); bus.emit(EV.DRAG_END); }
  });

  // Delete a user (Custom) fixture after confirmation. The main process refuses
  // if it's still patched (shown inline in the dialog); on success it broadcasts
  // `library:changed`, which reloadDefs picks up to refresh the tree.
  async function onDeleteFixture(id: string) {
    const d = byId.get(id);
    if (!d) return;
    await confirmDialog({
      title: 'Delete fixture',
      message: `Delete “${d.model}” from the Custom library? This permanently deletes the saved fixture and can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await lumox.library.remove(id);
        if (selected === id) selected = null;
      },
    });
  }

  // ---- tree render -------------------------------------------------------
  function itemHTML(d: any): string {
    const ch = d.modes?.[0]?.channelCount ?? '?';
    const edit = `<button class="ti-edit" draggable="false" title="${d.source === 'user' ? 'Edit this fixture' : 'Edit (saves a Custom copy)'}" aria-label="Edit fixture"><i class="fa-solid fa-pen"></i></button>`;
    const del = d.source === 'user'
      ? `<button class="ti-del" draggable="false" title="Delete this Custom fixture" aria-label="Delete fixture"><i class="fa-solid fa-trash"></i></button>`
      : '';
    return `<div class="tree-item${selected === d.id ? ' sel' : ''}" draggable="true" data-def="${esc(d.id)}" title="Drag onto the patch grid · ${esc(d.id)}">
      <span class="ti-model">${esc(d.model)}</span><span class="ti-right"><span class="ti-ch">${ch}ch</span>${edit}${del}</span></div>`;
  }

  function accHTML(vendor: string, items: any[] | null, collapsed: boolean, count: number): string {
    const inner = items
      ? items.map(itemHTML).join('')
      : (collapsed ? '' : '<div class="muted pad">Loading…</div>');   // expanded but not yet fetched
    return `
      <div class="acc${collapsed ? ' collapsed' : ''}" data-vendor="${esc(vendor)}">
        <button class="acc-head" title="Expand / collapse vendor">
          <span class="acc-chev"><i class="fa-solid fa-chevron-down"></i></span>
          <span class="acc-name">${esc(vendor)}</span>
          <span class="acc-count">${count}</span>
        </button>
        <div class="acc-items">${inner}</div>
      </div>`;
  }

  async function renderTree() {
    const q = qEl.value.trim().toLowerCase();
    const total = totalCount();

    if (q) {
      // Search spans the whole library — force a full load, then filter.
      await loadAll();
      const byVendor = new Map<string, any[]>();
      for (const d of byId.values()) {
        if (!d.manufacturer || !d.model) continue;
        if (!`${d.manufacturer} ${d.model}`.toLowerCase().includes(q)) continue;
        (byVendor.get(d.manufacturer) ?? byVendor.set(d.manufacturer, []).get(d.manufacturer)!).push(d);
      }
      let shown = 0; for (const a of byVendor.values()) shown += a.length;
      countEl.textContent = `${shown}/${total}`;
      if (!shown) {
        treeEl.innerHTML = `<div class="muted pad">No fixtures match “${esc(qEl.value.trim())}”.</div>`;
        return;
      }
      const names = [...byVendor.keys()].sort((a, b) => a.localeCompare(b));
      treeEl.innerHTML = names.map((v) =>
        accHTML(v, byVendor.get(v)!.sort((a, b) => a.model.localeCompare(b.model)), false, byVendor.get(v)!.length)).join('');
      return;
    }

    countEl.textContent = String(total);
    if (!vendors.length) {
      treeEl.innerHTML = '<div class="muted pad">No fixtures in library.</div>';
      countEl.textContent = '0';
      return;
    }
    treeEl.innerHTML = vendors.map((v) => {
      const collapsed = !expanded.has(v.name);
      const items = loaded.get(v.name)?.slice().sort((a, b) => a.model.localeCompare(b.model)) ?? null;
      return accHTML(v.name, items, collapsed, v.count);
    }).join('');
  }

  // ---- patch detail form (shown only when a fixture is selected) -------
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
    const d = byId.get(selected ?? '') ?? null;
    if (!d) { detailEl.classList.remove('show'); detailEl.innerHTML = ''; return; }
    detailEl.classList.add('show');

    let universes: any[] = [];
    try { universes = await lumox.universes.list(); } catch { /* ignore */ }
    if (!universes.length) universes = [{ id: 0, name: 'Universe 1' }];

    const mode = d.modes[0];
    const ch = mode?.channelCount;
    const uni = universes[0].id;
    const start = await afterLastAddress(uni);
    const count = preserve?.count ?? 1;
    const index = preserve?.index ?? 1;

    detailEl.innerHTML = `
      <div class="ld-title">${esc(d.model)} <span class="muted">${ch ? `(${ch} Channel${ch === 1 ? '' : 's'})` : ''}</span></div>
      ${d.modes.length > 1 ? `
      <label class="frow"><span>Mode</span>
        <select id="ld-mode">${d.modes.map((m: any, i: number) =>
          `<option value="${esc(m.id)}"${i === 0 ? ' selected' : ''}>${esc(m.name)} · ${m.channelCount}ch</option>`).join('')}</select></label>` : ''}
      <label class="frow"><span>DMX Universe</span>
        <select id="ld-uni">${universes.map((u) =>
          `<option value="${u.id}"${u.id === uni ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
      <label class="frow"><span>Starting address</span><input id="ld-addr" type="number" min="1" max="512" value="${start}" /></label>
      <label class="frow"><span>Number of fixtures</span><input id="ld-count" type="number" min="1" max="512" value="${count}" /></label>
      <label class="frow"><span>Index</span><input id="ld-index" type="number" min="1" value="${index}" /></label>
      <div id="ld-msg" class="ld-msg"></div>
      <button id="ld-patch" class="btn-patch">PATCH</button>`;

    const modeSel = detailEl.querySelector('#ld-mode') as HTMLSelectElement | null;
    const uniSel = detailEl.querySelector('#ld-uni') as HTMLSelectElement;
    const addrEl = detailEl.querySelector('#ld-addr') as HTMLInputElement;
    const msgEl = detailEl.querySelector('#ld-msg') as HTMLElement;

    uniSel.addEventListener('change', async () => { addrEl.value = String(await afterLastAddress(Number(uniSel.value))); });

    const patchBtn = detailEl.querySelector('#ld-patch') as HTMLElement;
    patchBtn.addEventListener('click', async () => {
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

  // A library change (user fixture added / removed) refreshes the vendor list and
  // re-fetches whatever was already loaded so the tree reflects it.
  async function reloadDefs() {
    try { vendors = (await lumox.library.vendors()) ?? []; } catch { /* ignore */ }
    const reloadNames = allLoaded ? null : [...loaded.keys()];
    loaded.clear(); byId.clear();
    if (allLoaded) { allLoaded = false; await loadAll(); }
    else if (reloadNames) for (const v of reloadNames) await loadVendor(v);
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
