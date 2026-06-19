// Group Bar tile — slim full-width strip listing fixture groups as tabs.
// Groups are auto-created per channel-config when fixtures are patched; the
// “+” adds an empty manual group. Colours come from the group (shared by all
// its fixtures in the patch grid).

import { bus, EV } from '../lib/bus';
import { html, mount } from '../lib/dom';
import { openMenu } from '../lib/widgets';

const { lumox } = window;

export async function makeGroupBarTile(): Promise<{ tile: HTMLElement; refresh: () => Promise<void> }> {
  const tile = document.createElement('section');
  tile.className = 'gb-tile';
  tile.innerHTML = `
    <span class="gb-label">GROUPS</span>
    <div id="gb-tabs" class="gb-tabs"></div>`;

  const tabs = mount(tile.querySelector('#gb-tabs') as HTMLElement);
  let active = 'all';
  let groups: any[] = [];

  async function reload() {
    try { groups = await lumox.groups.list(); } catch { groups = []; }
    // Invariant: a group is always selected. If the active group disappeared
    // (e.g. an auto-group was cleaned up when its last fixture was unpatched),
    // fall back to "All" and broadcast so consumers drop the stale highlight.
    if (active !== 'all' && !groups.some((g) => g.id === active)) {
      active = 'all';
      bus.emit(EV.GROUP_SELECTED, active);
    }
    tabs.set(html`
      <button class="gb-tab${active === 'all' ? ' active' : ''}" data-grp="all">All</button>
      ${groups.map((g) => html`
        <button class="gb-tab${active === g.id ? ' active' : ''}" data-grp="${g.id}" title="${g.fixtureIds.length} fixtures">
          <span class="gb-dot" style="background:${g.color}"></span>${g.name}
          <span class="gb-n">${g.fixtureIds.length}</span>
        </button>`)}`);
  }

  // ---- delegated events (bound once; survive every reload) --------------
  tabs.on('click', '.gb-tab[data-grp]', (_e, t) => {
    active = t.dataset.grp as string;
    reload();
    bus.emit(EV.GROUP_SELECTED, active);
  });
  tabs.on('contextmenu', '.gb-tab[data-grp]', (e, t) => {
    if (t.dataset.grp === 'all') return;   // no menu on the "All" tab
    e.preventDefault();
    const g = groups.find((x) => x.id === t.dataset.grp);
    if (g) showGroupMenu(e as MouseEvent, g);
  });

  bus.on(EV.GROUPS_CHANGED, reload);

  // ---- context menu ----------------------------------------------------
  function showGroupMenu(e: MouseEvent, g: any) {
    openMenu([
      { header: g.name, color: g.color },
      { label: 'Add fixture…', onClick: () => showAddFixture(e, g) },
      {
        label: 'Rename…',
        onClick: async () => {
          const n = prompt('Group name', g.name);
          if (n && n.trim()) { await lumox.groups.rename(g.id, n.trim()); bus.emit(EV.GROUPS_CHANGED); }
        },
      },
      {
        label: 'Remove group',
        danger: true,
        onClick: async () => {
          await lumox.groups.remove(g.id);
          if (active === g.id) active = 'all';
          bus.emit(EV.GROUPS_CHANGED);
          bus.emit(EV.PATCH_CHANGED);
        },
      },
    ], { at: e });
  }

  async function showAddFixture(e: MouseEvent, g: any) {
    let fixtures: any[] = [];
    try { fixtures = await lumox.patch.list(); } catch { /* ignore */ }
    const eligible = fixtures.filter((f) => f.configKey === g.configKey && !g.fixtureIds.includes(f.id));
    openMenu([
      { header: `Add to ${g.name}` },
      ...(eligible.length
        ? eligible.map((f) => ({
            label: `${f.name}  @${f.startAddress}`,
            onClick: async () => {
              try { await lumox.groups.setFixtures(g.id, [...g.fixtureIds, f.id]); }
              catch (err: any) { console.error('[groups] add fixture failed:', err.message); }
              bus.emit(EV.GROUPS_CHANGED);
              bus.emit(EV.PATCH_CHANGED);
            },
          }))
        : [{ label: 'No matching fixtures', disabled: true } as const]),
    ], { at: e });
  }

  await reload();
  return { tile, refresh: reload };
}
