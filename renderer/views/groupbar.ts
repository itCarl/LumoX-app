// Group Bar tile — slim full-width strip listing fixture groups as tabs.
// Groups are auto-created per channel-config when fixtures are patched; the
// “+” adds an empty manual group. Colours come from the group (shared by all
// its fixtures in the patch grid).

import { bus, EV } from '../lib/bus';
import { activeGroup } from '../lib/store';
import { html, mount } from '../lib/dom';
import { openMenu } from '../lib/widgets';
import { promptText } from '../lib/prompt';
import { openGroupOrderModal } from './group-order-modal';

const { lumox } = window;

export async function makeGroupBarTile(): Promise<{ tile: HTMLElement; refresh: () => Promise<void> }> {
  const tile = document.createElement('section');
  tile.className = 'gb-tile';
  tile.innerHTML = `
    <span class="gb-label">GROUPS</span>
    <div id="gb-tabs" class="gb-tabs"></div>`;

  const tabs = mount(tile.querySelector('#gb-tabs') as HTMLElement);
  let groups: any[] = [];

  async function reload() {
    try { groups = await lumox.groups.list(); } catch { groups = []; }
    // Invariant: a group is always selected. If the active group disappeared
    // (e.g. an auto-group was cleaned up when its last fixture was unpatched),
    // fall back to "All" — consumers re-render off the signal automatically.
    if (activeGroup.peek() !== 'all' && !groups.some((g) => g.id === activeGroup.peek())) {
      activeGroup.value = 'all';
    }
    const active = activeGroup.peek();
    tabs.set(html`
      <button class="gb-tab${active === 'all' ? ' active' : ''}" data-grp="all" title="Show all fixtures">All</button>
      ${groups.map((g) => html`
        <button class="gb-tab${active === g.id ? ' active' : ''}" data-grp="${g.id}" data-midi="group:${g.id}:intensity" data-midi-kind="range" data-midi-min="0" data-midi-max="255" data-midi-label="Group: ${g.name}" data-midi-alt="group:${g.id}:flash" data-midi-alt-kind="trigger" data-midi-alt-label="Group flash: ${g.name}" title="${g.fixtureIds.length} fixtures">
          <span class="gb-dot" style="background:${g.color}"></span>${g.name}
          <span class="gb-n">${g.fixtureIds.length}</span>
        </button>`)}`);
  }

  // ---- delegated events (bound once; survive every reload) --------------
  // A tab click both highlights the group (activeGroup → stage/grid outline) and
  // SELECTS its fixtures: the live selection is the fader editor's edit target, so
  // a group tab is the quick "edit this whole group" gesture. "All" selects the
  // whole rig (in patch order, via the canonical select-all op).
  tabs.on('click', '.gb-tab[data-grp]', async (_e, t) => {
    const grp = t.dataset.grp as string;
    activeGroup.value = grp;
    reload();
    if (grp === 'all') { try { await lumox.selection.all(); } catch { /* ignore */ } return; }
    const g = groups.find((x) => x.id === grp);
    if (g) bus.emit(EV.FIXTURE_SELECTED, { ids: g.fixtureIds, src: 'groupbar' });
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
      { label: 'Edit order…', onClick: () => openGroupOrderModal(g.id, g.name) },
      {
        label: 'Rename…',
        onClick: async () => {
          const n = await promptText({ title: 'Rename group', value: g.name });
          if (n) { await lumox.groups.rename(g.id, n); bus.emit(EV.GROUPS_CHANGED); }
        },
      },
      {
        label: 'Remove group',
        danger: true,
        onClick: async () => {
          await lumox.groups.remove(g.id);
          if (activeGroup.peek() === g.id) activeGroup.value = 'all';
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
