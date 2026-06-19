// Fader Editor tile (CONTROL view, bottom-right) — the main area is one strip
// per channel and ALWAYS shows every channel of the selected group's fixtures.
// The left sidebar of attribute categories (DIMMER / COLOR / … / FADER) only
// highlights + scrolls to that category's channels; it never hides any, so
// switching category never changes the layout. Each strip stacks an engage dot,
// the channel number, a colour swatch, a value/OFF readout, and the fader.
// Moving a fader auto-engages its channel (green dot); clicking the dot toggles
// the channel — engage it at 0 when off, release it when on.
//
// Two write targets, toggled by the EDIT / LIVE segment:
//   EDIT — faders edit the recalled scene's stored values (the EDIT target,
//          picked by recalling a scene in CONTROL → Banks). Because that scene
//          is active, edits are visible live and persist with the project.
//   LIVE — faders write straight to the live programmer (manual output). The
//          touched universe is broadcast even with no scene active. The header
//          shows how many channels are engaged and offers Clear (reset the
//          programmer) and Store (capture it as a new scene in the active bank).
// Either way writes apply to every fixture in the selected group.

import { bus, EV } from '../lib/bus';
import { html, mount, raw } from '../lib/dom';
import { channelIconHtml } from '../lib/channel-icons';

const { lumox } = window;

type Mode = 'edit' | 'live';
interface SceneRef { id: string; name: string }
type SceneValues = Record<number, Record<number, number>>;

// Attribute tabs, in display order. Only those the selected fixtures actually
// have are shown; `all` (every channel — the flat view) is always appended.
const ATTR_TABS: Array<[group: string, label: string]> = [
  ['intensity', 'DIMMER'], ['color', 'COLOR'], ['position', 'POSITION'],
  ['gobo', 'GOBO'], ['beam', 'BEAM'], ['prism', 'PRISM'],
  ['control', 'CTRL'], ['effect', 'FX'], ['maintenance', 'MAINT'],
];

export async function makeFaderEditorTile() {
  const tile = document.createElement('section');
  tile.className = 'tile fader-tile';
  tile.innerHTML = `
    <div class="tile-head fader-head">
      <span class="seg fe-mode">
        <button class="seg-btn active" data-mode="edit">EDIT</button>
        <button class="seg-btn" data-mode="live">LIVE</button>
      </span>
      <span class="fe-target" id="fe-target">EDIT: Scene</span>
      <span class="fe-prog" id="fe-prog" hidden>
        <span class="fe-prog-stat"><i class="fe-pdot"></i><span id="fe-prog-n">0 ch</span></span>
        <button class="fe-btn" id="fe-clear" title="Clear the programmer (drop all manual values)">Clear</button>
        <button class="fe-btn fe-store" id="fe-store" title="Store the programmer as a new scene">+ Store</button>
      </span>
    </div>
    <div class="fader-body">
      <div id="fe-cols" class="fe-cols"></div>
      <div class="fe-master" data-midi="master" data-midi-kind="range" data-midi-min="0" data-midi-max="1" data-midi-label="GrandMaster">
        <div class="fe-master-lbl">GM</div>
        <div class="fe-master-val" id="fe-gm-val">100</div>
        <input class="fe-master-fader" id="fe-gm" type="range" min="0" max="100" value="100" aria-label="GrandMaster" />
        <button class="fe-bo" id="fe-bo" title="Blackout — force all output to zero" data-midi="blackout" data-midi-kind="trigger" data-midi-label="Blackout">BO</button>
      </div>
    </div>`;

  const head = tile.querySelector('.fader-head') as HTMLElement;
  const target = tile.querySelector('#fe-target') as HTMLElement;
  const prog = tile.querySelector('#fe-prog') as HTMLElement;
  const progN = tile.querySelector('#fe-prog-n') as HTMLElement;
  const clearBtn = tile.querySelector('#fe-clear') as HTMLButtonElement;
  const storeBtn = tile.querySelector('#fe-store') as HTMLButtonElement;
  const cols = mount(tile.querySelector('#fe-cols') as HTMLElement);
  const gmFader = tile.querySelector('#fe-gm') as HTMLInputElement;
  const gmVal = tile.querySelector('#fe-gm-val') as HTMLElement;
  const boBtn = tile.querySelector('#fe-bo') as HTMLButtonElement;

  const state = {
    mode: 'edit' as Mode,
    attr: 'all',                            // sidebar category — highlights its channels ('all' = none)
    group: 'all',
    fixtures: [] as any[],
    groups: [] as any[],
    editScene: null as SceneRef | null,    // scene being edited (EDIT mode)
    sceneValues: {} as SceneValues,         // editScene's sparse stored values
    values: new Map<string, number>(),      // LIVE: `${fxId}:${ch}` → value
    active: new Set<string>(),              // LIVE: engaged channels `${repId}:${ch}`
    bankId: null as string | null,          // Store target (active bank in CONTROL → Banks)
    progChannels: 0,                         // engaged channels in the live programmer
  };

  // ---- data loading ------------------------------------------------------
  async function refreshSceneValues() {
    state.sceneValues = state.editScene
      ? await lumox.scenes.values(state.editScene.id).catch(() => ({}))
      : {};
  }

  // Pull the live programmer's engaged-channel count (drives the Clear/Store header).
  async function refreshProgrammer() {
    const sum = await lumox.fixtures.programmer().catch(() => ({ channels: 0 }));
    state.progChannels = sum.channels;
    updateHead();
  }

  // Settle the EDIT target: keep an explicitly-recalled scene, else the current
  // one while it stays active, else the first active scene (or none).
  async function resolveEditScene(preferred?: SceneRef | null) {
    const list: any[] = await lumox.scenes.list().catch(() => []);
    if (preferred && list.some((s) => s.id === preferred.id)) {
      state.editScene = preferred;
    } else if (!state.editScene || !list.some((s) => s.id === state.editScene!.id && s.active)) {
      const s = list.find((x) => x.active);
      state.editScene = s ? { id: s.id, name: s.name } : null;
    }
    await refreshSceneValues();
  }

  async function load() {
    [state.fixtures, state.groups] = await Promise.all([
      lumox.patch.list().catch(() => []),
      lumox.groups.list().catch(() => []),
    ]);
    await resolveEditScene();
    await refreshProgrammer();
    render();
  }

  function groupFixtures() {
    if (state.group === 'all') return state.fixtures;     // every patched fixture
    const g = state.groups.find((x) => x.id === state.group);
    return g ? state.fixtures.filter((f) => g.fixtureIds.includes(f.id)) : [];
  }

  // ---- per-channel state (engaged + value) for the representative fixture --
  function cellState(rep: any, ch: number): { on: boolean; v: number } {
    if (state.mode === 'edit') {
      const chans = state.sceneValues[rep.universeId];
      const abs = rep.startAddress + ch - 1;
      const has = !!chans && Object.prototype.hasOwnProperty.call(chans, abs);
      return { on: has, v: has ? chans[abs] : 0 };
    }
    const key = `${rep.id}:${ch}`;
    return { on: state.active.has(key), v: state.values.get(key) ?? 0 };
  }

  // ---- writes ------------------------------------------------------------
  // LIVE: write (engage) a value to the given channel on every fixture in the group.
  function writeLive(fixtures: any[], ch: number, value: number) {
    for (const f of fixtures) {
      state.values.set(`${f.id}:${ch}`, value);
      lumox.fixtures.setChannel(f.id, ch, value);
    }
  }

  // LIVE: release (disengage) the given channel on every fixture in the group, so
  // it is dropped from the programmer and won't be captured by a Store.
  function releaseLive(fixtures: any[], ch: number) {
    for (const f of fixtures) {
      state.values.delete(`${f.id}:${ch}`);
      lumox.fixtures.releaseChannel(f.id, ch);
    }
  }

  // EDIT: set (number) or clear (null) the channel in the edit scene across the
  // group. Mirror the representative fixture into the local cache for an instant
  // redraw; main holds the authoritative values for every fixture.
  function writeScene(fixtures: any[], ch: number, value: number | null) {
    const id = state.editScene?.id;
    if (!id) return;
    for (const f of fixtures) lumox.scenes.setChannel(id, f.id, ch, value);
    const rep = fixtures[0];
    const abs = rep.startAddress + ch - 1;
    const chans = (state.sceneValues[rep.universeId] ??= {});
    if (value == null) delete chans[abs];
    else chans[abs] = value;
  }

  // engage (or, in LIVE, just remember) the channel and write its value
  function engage(fixtures: any[], ch: number, value: number) {
    if (state.mode === 'edit') writeScene(fixtures, ch, value);
    else { state.active.add(`${fixtures[0].id}:${ch}`); writeLive(fixtures, ch, value); }
  }

  // Sidebar categories present on the rep fixture, plus the always-on FADER (no
  // highlight) entry. Selecting one highlights its channels — it never filters,
  // so the strip layout stays identical across categories.
  function attrTabs(rep: any): Array<{ id: string; label: string }> {
    const present = new Set(rep.channels.map((c: any) => c.group).filter(Boolean));
    const tabs = ATTR_TABS.filter(([g]) => present.has(g)).map(([id, label]) => ({ id, label }));
    tabs.push({ id: 'all', label: 'FADER' });
    return tabs;
  }
  // The strip row — ALWAYS every channel (selecting a category only highlights,
  // never hides, so switching categories never reflows). Each strip: engage
  // dot · channel number · colour swatch · value/OFF · vertical fader.
  function fadersFor(rep: any) {
    const chans = rep.channels;
    if (!chans.length) return html`<div class="muted pad">No channels.</div>`;
    return html`
      <div class="fe-row">
        ${chans.map((c: any) => {
          const { on, v } = cellState(rep, c.index);
          const tint = c.color ? `--cc:${c.color};` : '';
          return html`
          <div class="fcol${on ? ' active' : ''}" data-ch="${c.index}" data-group="${c.group || ''}">
            <div class="fc-n">${c.index}</div>
            <span class="fc-icon" title="${c.name}" style="${tint}">${raw(channelIconHtml(c.typeId, c.group, c.color))}</span>
            <div class="fc-val">${on ? v : 'OFF'}</div>
            <input class="fc-fader" type="range" min="0" max="255" value="${v}" orient="vertical" />
            <div class="fc-dot${on ? ' on' : ''}" title="${on ? 'Release channel' : 'Move the fader to engage'}"></div>
          </div>`;
        })}
      </div>`;
  }

  function render() {
    updateHead();
    const fixtures = groupFixtures();
    if (!fixtures.length) {
      cols.set(html`<div class="muted pad">No fixtures patched — add fixtures in Setup.</div>`);
      return;
    }
    if (state.mode === 'edit' && !state.editScene) {
      cols.set(html`<div class="muted pad">No scene selected to edit. In CONTROL → Banks, click a scene's
        colour strip to pick it, then move a fader here to set that channel.<br>
        No scenes yet? Switch to <b>LIVE</b>, build a look, then press <b>+ Store</b>.</div>`);
      return;
    }
    const rep = fixtures[0];
    const gname = state.groups.find((g) => g.id === state.group)?.name ?? '';
    const tabs = attrTabs(rep);
    if (!tabs.some((t) => t.id === state.attr)) state.attr = tabs[0]?.id ?? 'all';

    cols.set(html`
      <div class="fe-side">
        ${tabs.map((t) => html`<button class="fe-attr${t.id === state.attr ? ' active' : ''}" data-attr="${t.id}">${t.label}</button>`)}
      </div>
      <div class="fe-main">
        ${gname ? html`<div class="fe-gname">${gname.toUpperCase()}</div>` : ''}
        <div class="fe-attr-body">${fadersFor(rep)}</div>
      </div>`);

    applyAttrHighlight(false);
  }

  // Emphasise the selected category's channels (and bring the first into view).
  // Highlight only — it never adds or removes strips, so the layout never shifts.
  function applyAttrHighlight(scroll: boolean) {
    const all = state.attr === 'all';
    cols.el.querySelectorAll<HTMLElement>('.fcol').forEach((c) => {
      c.classList.toggle('hl', !all && c.dataset.group === state.attr);
    });
    if (scroll && !all) {
      cols.el.querySelector<HTMLElement>('.fcol.hl')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }

  // Header reflects the current write target: EDIT shows the scene being edited;
  // LIVE shows the programmer status with Clear / Store actions.
  function updateHead() {
    const live = state.mode === 'live';
    target.hidden = live;
    prog.hidden = !live;
    if (!live) {
      const dim = !state.editScene;
      target.textContent = state.editScene ? `EDIT: ${state.editScene.name}` : 'EDIT: no scene';
      target.classList.toggle('muted', dim);
      return;
    }
    const n = state.progChannels;
    progN.textContent = `${n} ch`;
    prog.classList.toggle('empty', n === 0);
    clearBtn.disabled = n === 0;
    storeBtn.disabled = n === 0;
  }

  // ---- mode switch -------------------------------------------------------
  async function setMode(m: Mode) {
    if (m === state.mode) return;
    state.mode = m;
    head.querySelectorAll('.seg-btn').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.mode === m));
    if (m === 'edit') await refreshSceneValues();
    else await refreshProgrammer();
    render();
  }
  head.querySelectorAll('.seg-btn').forEach((b) =>
    b.addEventListener('click', () => setMode((b as HTMLElement).dataset.mode as Mode)));

  // ---- delegated events (bound once; survive every render) --------------
  // sidebar category → highlight its channels (no strip rebuild → no reflow)
  cols.on('click', '.fe-attr', (_e, t) => {
    const a = (t as HTMLElement).dataset.attr;
    if (!a || a === state.attr) return;
    state.attr = a;
    cols.el.querySelectorAll('.fe-attr').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.attr === a));
    applyAttrHighlight(true);
  });

  // dot click toggles the channel: engage it at 0 when off, release it when on
  // (release forces 0 / drops it from the scene).
  cols.on('click', '.fc-dot', (_e, t) => {
    const col = t.closest('.fcol') as HTMLElement | null;
    const fixtures = groupFixtures();
    if (!col || !fixtures.length) return;
    const ch = Number(col.dataset.ch);
    const { on } = cellState(fixtures[0], ch);
    if (!on) {
      engage(fixtures, ch, 0);                    // activate, leaving the value at 0
    } else if (state.mode === 'edit') {
      writeScene(fixtures, ch, null);
    } else {
      state.active.delete(`${fixtures[0].id}:${ch}`); releaseLive(fixtures, ch);
    }
    render();
    if (state.mode === 'live') refreshProgrammer();
  });

  // moving a fader auto-engages the channel and shows the green dot
  cols.on('input', '.fc-fader', (_e, t) => {
    const fader = t as HTMLInputElement;
    const col = fader.closest('.fcol') as HTMLElement | null;
    const fixtures = groupFixtures();
    if (!col || !fixtures.length) return;
    const ch = Number(col.dataset.ch);
    const v = Number(fader.value);
    engage(fixtures, ch, v);
    // live-update this column without a full re-render (keeps the drag smooth)
    col.classList.add('active');
    (col.querySelector('.fc-dot') as HTMLElement | null)?.classList.add('on');
    (col.querySelector('.fc-val') as HTMLElement).textContent = String(v);
  });

  // Releasing a fader settles the programmer count (the Clear/Store header).
  cols.on('change', '.fc-fader', () => { if (state.mode === 'live') refreshProgrammer(); });

  // ---- programmer header actions (Clear / Store) -------------------------
  clearBtn.addEventListener('click', async () => {
    await lumox.fixtures.clearProgrammer().catch(() => {});
    state.values.clear();
    state.active.clear();
    state.progChannels = 0;
    render();
  });

  storeBtn.addEventListener('click', async () => {
    if (state.progChannels === 0) return;
    const scene = await lumox.scenes.capture(state.bankId ?? undefined).catch(() => null);
    if (!scene) return;
    bus.emit(EV.SCENE_UPDATED, scene.id);   // Banks tile refreshes to show the new cell
    flashStored();
  });

  // brief "Stored ✓" confirmation on the Store button
  let flashTimer: number | null = null;
  function flashStored() {
    storeBtn.textContent = 'Stored ✓';
    storeBtn.classList.add('ok');
    if (flashTimer != null) clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      storeBtn.textContent = '+ Store';
      storeBtn.classList.remove('ok');
    }, 1100);
  }

  // ---- GrandMaster + Blackout (global; live outside the per-channel grid) --
  // No engine getter exists, so the UI owns the shown state (default: full / off).
  gmFader.addEventListener('input', () => {
    const pct = Number(gmFader.value);
    gmVal.textContent = String(pct);
    lumox.master.set(pct / 100).catch(() => {});
  });
  let blackout = false;
  boBtn.addEventListener('click', () => {
    blackout = !blackout;
    boBtn.classList.toggle('on', blackout);
    lumox.blackout.set(blackout).catch(() => {});
  });

  bus.on(EV.BANK_SELECTED, (id: string | null) => { state.bankId = id; });
  bus.on(EV.GROUP_SELECTED, (id) => { state.group = id; render(); });
  bus.on(EV.PATCH_CHANGED, load);
  bus.on(EV.GROUPS_CHANGED, load);
  bus.on(EV.SCENE_SELECTED, async (sel: SceneRef | null) => { await resolveEditScene(sel); render(); });

  await load();
  return { tile, refresh: load };
}
