// Fader Editor tile (CONTROL view, bottom-right) — the main area is one strip
// per channel and ALWAYS shows every channel of the selected group's fixtures.
// When the group mixes fixture types (e.g. the "All" tab) the strips are split
// into blocks: the TYPE / FIX toggle picks one block per channel-config (writes
// broadcast to every fixture of that type) or one block per individual fixture.
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
import { activeGroup } from '../lib/store';
import { effect } from '@preact/signals-core';
import { html, mount, raw } from '../lib/dom';
import { channelIconHtml } from '../lib/channel-icons';

const { lumox } = window;

type Mode = 'edit' | 'live';
type Layout = 'type' | 'fixture';
interface SceneRef { id: string; name: string }
type SceneValues = Record<number, Record<number, number>>;

// A rendered fader block: a representative fixture whose channel strips are drawn,
// plus every fixture the strips' writes apply to (one for 'fixture', all of a
// channel-config for 'type').
interface Block { rep: any; fixtures: any[]; label: string }

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
      <span class="seg fe-layout">
        <button class="seg-btn active" data-layout="type" title="One fader block per fixture type">TYPE</button>
        <button class="seg-btn" data-layout="fixture" title="One fader block per individual fixture">FIX</button>
      </span>
      <span class="fe-target" id="fe-target">EDIT: Scene</span>
      <span class="fe-prog" id="fe-prog" hidden>
        <span class="fe-prog-stat"><i class="fe-pdot"></i><span id="fe-prog-n">0 ch</span></span>
        <button class="fe-btn" id="fe-clear" title="Clear the programmer (drop all manual values)">Clear</button>
        <button class="fe-btn fe-merge" id="fe-merge" title="Save adjusted live values into the current scene"><i class="fa-solid fa-floppy-disk"></i><span class="fe-btn-lbl">Save</span></button>
        <button class="fe-btn fe-store" id="fe-store" title="Snapshot all values into a new scene"><i class="fa-solid fa-camera"></i><span class="fe-btn-lbl">Snapshot</span></button>
      </span>
    </div>
    <div class="fader-body">
      <div id="fe-cols" class="fe-cols"></div>
      <div class="fe-master" data-midi="master" data-midi-kind="range" data-midi-min="0" data-midi-max="1" data-midi-label="GrandMaster">
        <div class="fe-master-lbl">GM</div>
        <div class="fe-master-val" id="fe-gm-val">100</div>
        <input class="fe-master-fader" id="fe-gm" type="range" min="0" max="100" value="100" aria-label="GrandMaster" />
        <button class="fe-bo" id="fe-bo" title="Blackout — hold to force all output to zero" data-midi="blackout" data-midi-kind="trigger" data-midi-label="Blackout">BO</button>
      </div>
    </div>`;

  const head = tile.querySelector('.fader-head') as HTMLElement;
  const target = tile.querySelector('#fe-target') as HTMLElement;
  const prog = tile.querySelector('#fe-prog') as HTMLElement;
  const progN = tile.querySelector('#fe-prog-n') as HTMLElement;
  const clearBtn = tile.querySelector('#fe-clear') as HTMLButtonElement;
  const mergeBtn = tile.querySelector('#fe-merge') as HTMLButtonElement;
  const storeBtn = tile.querySelector('#fe-store') as HTMLButtonElement;
  const cols = mount(tile.querySelector('#fe-cols') as HTMLElement);
  const gmFader = tile.querySelector('#fe-gm') as HTMLInputElement;
  const gmVal = tile.querySelector('#fe-gm-val') as HTMLElement;
  const boBtn = tile.querySelector('#fe-bo') as HTMLButtonElement;

  const state = {
    mode: 'edit' as Mode,
    layout: 'type' as Layout,               // heterogeneous group split: per type or per fixture
    attr: 'all',                            // sidebar category — highlights its channels ('all' = none)
    group: 'all',
    fixtures: [] as any[],
    groups: [] as any[],
    blocks: [] as Block[],                  // current rendered blocks (event handlers resolve targets by index)
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

  // Split the selected group's fixtures into the blocks to render. 'fixture' = one
  // block per individual fixture; 'type' = one block per channel-config (writes
  // broadcast to all of that type). A homogeneous group yields a single block, so
  // both modes match the classic single-strip view.
  function buildBlocks(fixtures: any[]): Block[] {
    if (state.layout === 'fixture') {
      return fixtures.map((f) => ({ rep: f, fixtures: [f], label: `${f.name} · @${f.startAddress}` }));
    }
    const byKey = new Map<string, any[]>();
    for (const f of fixtures) {
      const k = f.configKey ?? f.id;
      const arr = byKey.get(k);
      if (arr) arr.push(f); else byKey.set(k, [f]);
    }
    return [...byKey.values()].map((fxs) => ({
      rep: fxs[0], fixtures: fxs,
      label: fxs.length > 1 ? `${fxs[0].model} · ×${fxs.length}` : fxs[0].name,
    }));
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
  function attrTabs(blocks: Block[]): Array<{ id: string; label: string }> {
    const present = new Set<string>();
    for (const b of blocks) for (const c of b.rep.channels) if (c.group) present.add(c.group);
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
    const blocks = buildBlocks(fixtures);
    state.blocks = blocks;
    const single = blocks.length === 1;
    const gname = state.groups.find((g) => g.id === state.group)?.name ?? '';
    const tabs = attrTabs(blocks);
    if (!tabs.some((t) => t.id === state.attr)) state.attr = tabs[0]?.id ?? 'all';

    cols.set(html`
      <div class="fe-side">
        ${tabs.map((t) => html`<button class="fe-attr${t.id === state.attr ? ' active' : ''}" data-attr="${t.id}">${t.label}</button>`)}
      </div>
      <div class="fe-main">
        ${gname ? html`<div class="fe-gname">${gname.toUpperCase()}</div>` : ''}
        <div class="fe-attr-body${single ? ' single' : ''}">
          ${blocks.map((b, i) => html`
            <div class="fe-block" data-block="${i}">
              ${single ? '' : html`<div class="fe-bname">${b.label}</div>`}
              ${fadersFor(b.rep)}
            </div>`)}
        </div>
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
    // Merge targets the current scene — needs both engaged channels and a scene.
    mergeBtn.disabled = n === 0 || !state.editScene;
    mergeBtn.title = state.editScene
      ? `Save adjusted live values into "${state.editScene.name}"`
      : 'Save adjusted live values into the current scene (recall a scene first)';
  }

  // ---- mode switch -------------------------------------------------------
  async function setMode(m: Mode) {
    if (m === state.mode) return;
    state.mode = m;
    head.querySelectorAll('.fe-mode .seg-btn').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.mode === m));
    if (m === 'edit') await refreshSceneValues();
    else await refreshProgrammer();
    render();
  }
  head.querySelectorAll('.fe-mode .seg-btn').forEach((b) =>
    b.addEventListener('click', () => setMode((b as HTMLElement).dataset.mode as Mode)));

  // ---- layout switch (per-type / per-fixture block split) ----------------
  function setLayout(l: Layout) {
    if (l === state.layout) return;
    state.layout = l;
    head.querySelectorAll('.fe-layout .seg-btn').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.layout === l));
    render();
  }
  head.querySelectorAll('.fe-layout .seg-btn').forEach((b) =>
    b.addEventListener('click', () => setLayout((b as HTMLElement).dataset.layout as Layout)));

  // Resolve the fixtures a strip writes to from its enclosing block (falls back to
  // the whole group if, somehow, the strip is outside a block).
  function blockFixtures(el: HTMLElement): any[] {
    const blk = el.closest('.fe-block') as HTMLElement | null;
    const i = blk ? Number(blk.dataset.block) : -1;
    return state.blocks[i]?.fixtures ?? groupFixtures();
  }

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
    const fixtures = blockFixtures(t);
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
    const fixtures = blockFixtures(fader);
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

  // Snapshot — capture the whole programmer into a NEW scene in the active bank.
  storeBtn.addEventListener('click', async () => {
    if (state.progChannels === 0) return;
    const scene = await lumox.scenes.capture(state.bankId ?? undefined).catch(() => null);
    if (!scene) return;
    bus.emit(EV.SCENE_UPDATED, scene.id);   // Banks tile refreshes to show the new cell
    flashBtn(storeBtn, 'Saved ✓');
  });

  // Save — merge the adjusted (engaged) live values into the current scene,
  // overlaying them onto its stored look (the scene's other channels stay).
  mergeBtn.addEventListener('click', async () => {
    if (state.progChannels === 0 || !state.editScene) return;
    await lumox.scenes.merge(state.editScene.id).catch(() => {});
    bus.emit(EV.SCENE_UPDATED, state.editScene.id);
    flashBtn(mergeBtn, 'Saved ✓');
  });

  // brief "Saved ✓" confirmation on an icon+label action button
  function flashBtn(btn: HTMLButtonElement, msg: string) {
    const lbl = btn.querySelector('.fe-btn-lbl') as HTMLElement | null;
    if (!lbl) return;
    const orig = lbl.dataset.orig ?? lbl.textContent ?? '';
    lbl.dataset.orig = orig;
    lbl.textContent = msg;
    btn.classList.add('ok');
    const prev = Number(btn.dataset.flashTimer);
    if (prev) clearTimeout(prev);
    btn.dataset.flashTimer = String(window.setTimeout(() => {
      lbl.textContent = orig;
      btn.classList.remove('ok');
    }, 1100));
  }

  // ---- GrandMaster + Blackout (global; live outside the per-channel grid) --
  // No engine getter exists, so the UI owns the shown state (default: full / off).
  gmFader.addEventListener('input', () => {
    const pct = Number(gmFader.value);
    gmVal.textContent = String(pct);
    lumox.master.set(pct / 100).catch(() => {});
  });
  // Blackout is momentary (flash): forced to zero while held, released on pointer
  // up. Pointer capture keeps the release firing even if the cursor leaves the button.
  const setBlackout = (on: boolean) => {
    boBtn.classList.toggle('on', on);
    lumox.blackout.set(on).catch(() => {});
  };
  boBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    boBtn.setPointerCapture(e.pointerId);
    setBlackout(true);
  });
  boBtn.addEventListener('pointerup', () => setBlackout(false));
  boBtn.addEventListener('pointercancel', () => setBlackout(false));

  bus.on(EV.BANK_SELECTED, (id: string | null) => { state.bankId = id; });
  effect(() => { state.group = activeGroup.value; render(); });
  bus.on(EV.PATCH_CHANGED, load);
  bus.on(EV.GROUPS_CHANGED, load);
  bus.on(EV.SCENE_SELECTED, async (sel: SceneRef | null) => { await resolveEditScene(sel); render(); });

  await load();
  return { tile, refresh: load };
}
