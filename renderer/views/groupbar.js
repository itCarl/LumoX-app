// Group Bar tile — slim full-width strip listing fixture groups as tabs.
// Groups are auto-created per channel-config when fixtures are patched; the
// “+” adds an empty manual group. Colours come from the group (shared by all
// its fixtures in the patch grid).

import { bus, EV } from '../lib/bus.js';

const { lumox } = window;

export async function makeGroupBarTile() {
  const tile = document.createElement('section');
  tile.className = 'gb-tile';
  tile.innerHTML = `
    <span class="gb-label">GROUPS</span>
    <div id="gb-tabs" class="gb-tabs"></div>`;

  const tabsEl = tile.querySelector('#gb-tabs');
  let active = 'all';
  let groups = [];

  async function reload() {
    try { groups = await lumox.groups.list(); } catch { groups = []; }
    const tabs = [`<button class="gb-tab${active === 'all' ? ' active' : ''}" data-grp="all">All</button>`];
    for (const g of groups) {
      tabs.push(`<button class="gb-tab${active === g.id ? ' active' : ''}" data-grp="${g.id}" title="${g.fixtureIds.length} fixtures">
        <span class="gb-dot" style="background:${g.color}"></span>${g.name}
        <span class="gb-n">${g.fixtureIds.length}</span></button>`);
    }
    tabsEl.innerHTML = tabs.join('');
    tabsEl.querySelectorAll('.gb-tab').forEach((b) => {
      b.addEventListener('click', () => {
        active = b.dataset.grp;
        reload();
        bus.emit(EV.GROUP_SELECTED, active);
      });
      if (b.dataset.grp !== 'all') {
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const g = groups.find((x) => x.id === b.dataset.grp);
          if (g) showGroupMenu(e, g);
        });
      }
    });
  }

  bus.on(EV.GROUPS_CHANGED, reload);

  // ---- context menu ----------------------------------------------------
  function closeMenus() { document.querySelectorAll('.ctx-menu').forEach((m) => m.remove()); }
  function place(menu, e) {
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - h - 8)}px`;
  }

  function showGroupMenu(e, g) {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.innerHTML = `
      <div class="ctx-head"><span class="ctx-dot" style="background:${g.color}"></span>${g.name}</div>
      <button data-act="add">Add fixture…</button>
      <button data-act="rename">Rename…</button>
      <button data-act="remove" class="ctx-danger">Remove group</button>`;
    place(menu, e);
    menu.querySelector('[data-act="add"]').addEventListener('click', (ev) => { ev.stopPropagation(); showAddFixture(ev, g); });
    menu.querySelector('[data-act="rename"]').addEventListener('click', async () => {
      const n = prompt('Group name', g.name);
      closeMenus();
      if (n && n.trim()) { await lumox.groups.rename(g.id, n.trim()); bus.emit(EV.GROUPS_CHANGED); }
    });
    menu.querySelector('[data-act="remove"]').addEventListener('click', async () => {
      closeMenus();
      await lumox.groups.remove(g.id);
      if (active === g.id) active = 'all';
      bus.emit(EV.GROUPS_CHANGED);
      bus.emit(EV.PATCH_CHANGED);
    });
  }

  async function showAddFixture(e, g) {
    closeMenus();
    let fixtures = [];
    try { fixtures = await lumox.patch.list(); } catch { /* ignore */ }
    const eligible = fixtures.filter((f) => f.configKey === g.configKey && !g.fixtureIds.includes(f.id));
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.innerHTML = `<div class="ctx-head">Add to ${g.name}</div>` + (eligible.length
      ? eligible.map((f) => `<button data-fx="${f.id}">${f.name} <span class="muted">@${f.startAddress}</span></button>`).join('')
      : '<div class="ctx-empty muted">No matching fixtures</div>');
    place(menu, e);
    menu.querySelectorAll('[data-fx]').forEach((b) =>
      b.addEventListener('click', async () => {
        closeMenus();
        try { await lumox.groups.setFixtures(g.id, [...g.fixtureIds, b.dataset.fx]); }
        catch (err) { console.error('[groups] add fixture failed:', err.message); }
        bus.emit(EV.GROUPS_CHANGED);
        bus.emit(EV.PATCH_CHANGED);
      }));
  }

  document.addEventListener('click', closeMenus);

  await reload();
  return { tile, refresh: reload };
}
