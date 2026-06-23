// Fader Editor tile (CONTROL view, bottom-right) — the main area is one strip
// per channel and shows every channel of the LIVE SELECTION (the fixtures picked
// on the stage / patch grid; see selection.md). It is console-style **gated on
// the selection**: with nothing selected the strip area is unavailable (a terse
// "No fixtures selected" state note) — faders only ever edit what you've selected. A group tab in
// the group bar is the quick "select this whole group" gesture.
// When the selection mixes fixture types the strips are split into one block per
// channel-config — its faders broadcast to every selected fixture of that type,
// so a homogeneous selection collapses to a single shared block. Block order
// follows the selection order.
// The left sidebar shows the full fixed set of attribute categories (DIMMER /
// COLOR / … / FADER) like a pro console — always present, even for fixtures that
// lack a category (selecting it just shows no strips). Selecting one filters the
// strips to that category's channels; the FADER tab shows every channel (the flat
// view). Each strip stacks the channel number and value/OFF readout above a body
// that runs the full-height vertical fader with its colour swatch to the left,
// and an engage dot at the bottom.
// Moving a fader auto-engages its channel (green dot); clicking the dot toggles
// the channel — engage it at 0 when off, release it when on.
//
// A compact quick-ops group sits next to the mode toggle (acts on the current
// target fixtures in whatever mode): Beam On (intensity full) · Beam Off
// (intensity 0) · Center Beam (pan/tilt home) · Reset (release every channel).
//
// Three write targets, toggled by the EDIT / BLIND / LIVE segment:
//   EDIT — faders edit the recalled scene's stored values (the EDIT target,
//          picked by recalling a scene in CONTROL → Banks). Because that scene
//          is active, edits are visible live and persist with the project.
//          The strips follow the live selection, but when nothing is selected
//          they fall back to the recalled scene's OWN fixtures — so opening a
//          scene always shows its faders without hijacking the selection. EDIT
//          strips stay on the stored values (they do NOT animate) so a moving
//          scene's values stay grabbable. HTP/LTP merge: docs/knowledge-base/htp-ltp.md.
//   BLIND — same as EDIT (writes the scene's stored values) but the live rig is
//          NOT updated: writes skip the live-track mirror, so output is frozen
//          while you program. Switching out of BLIND commits the staged edits
//          (`lumox:scenes:commit` rebuilds the track) so they take effect at once.
//   LIVE — faders write straight to the live programmer (manual output). The
//          touched universe is broadcast even with no scene active. The header
//          shows how many channels are engaged and offers Clear (reset the
//          programmer) and Store (capture it as a new scene in the active bank).
//          LIVE is also a live output MONITOR: while a scene is animating it
//          mirrors the mixed output onto the strips (knob + readout) so the
//          faders track movement (`lumox:scenes:monitor`); a recent drag pauses it.
// Either way writes apply to every selected fixture.

import { bus, EV } from '../lib/bus';
import { html, mount, raw } from '../lib/dom';
import { channelIconHtml } from '../lib/channel-icons';
import { goboSvg } from '../lib/gobo';
import { createColorPicker, type ColorPicker } from '../lib/colorpicker';

const { lumox } = window;

// RGB-primary colour channels the picker drives, by channel-type id → component.
const RGB_PRIMARY: Record<string, 'r' | 'g' | 'b'> = { red: 'r', green: 'g', blue: 'b' };

type Mode = 'edit' | 'blind' | 'live';
interface SceneRef { id: string; name: string }
type SceneValues = Record<number, Record<number, number>>;

// A rendered fader block: a representative fixture whose channel strips are drawn,
// plus every fixture the strips' writes apply to (one for 'fixture', all of a
// channel-config for 'type').
interface Block { rep: any; fixtures: any[]; label: string }

// Attribute tabs, in display order. The full fixed set is ALWAYS shown (like a
// pro console's attribute palette) — selecting a category the current fixtures
// lack simply leaves the strip area empty. `all` (every channel — the flat view)
// is always appended as FADER.
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
        <button class="seg-btn" data-mode="blind" title="Blind — edit the scene without sending to live output">BLIND</button>
        <button class="seg-btn" data-mode="live">LIVE</button>
      </span>
      <span class="fe-quick" role="group" aria-label="Quick beam ops">
        <button class="fe-qbtn" data-qop="on" title="Beam On — selection to full intensity"><i class="fa-solid fa-lightbulb"></i></button>
        <button class="fe-qbtn" data-qop="off" title="Beam Off — selection intensity to zero"><i class="fa-solid fa-power-off"></i></button>
        <button class="fe-qbtn" data-qop="center" title="Center Beam — pan/tilt to centre"><i class="fa-solid fa-crosshairs"></i></button>
        <button class="fe-qbtn" data-qop="reset" title="Reset — release every channel of the selection"><i class="fa-solid fa-rotate-left"></i></button>
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
    attr: 'all',                            // sidebar category — filters strips to this group ('all' = every channel)
    vdimOpen: new Set<number>(),            // expanded per-cluster virtual-dimmer drawers (by channel index)
    colorPickers: new Map<number, ColorPicker>(),  // COLOR view: block index → mounted picker
    selectionIds: [] as string[],           // live ordered selection — the edit target (gates the strips)
    sceneFixtureIds: [] as string[],        // EDIT fallback — the recalled scene's own fixtures (shown when nothing is selected)
    fixtures: [] as any[],
    blocks: [] as Block[],                  // current rendered blocks (event handlers resolve targets by index)
    editScene: null as SceneRef | null,    // scene being edited (EDIT mode)
    sceneValues: {} as SceneValues,         // editScene's sparse stored values
    values: new Map<string, number>(),      // LIVE: `${fxId}:${ch}` → value
    active: new Set<string>(),              // LIVE: engaged channels `${repId}:${ch}`
    bankId: null as string | null,          // Store target (active bank in CONTROL → Banks)
    progChannels: 0,                         // engaged channels in the live programmer
    reflecting: false,                       // EDIT faders are mirroring a live animating scene
    lastEditAt: 0,                           // perf.now() of the last fader drag — pauses live mirroring briefly
    fxArm: null as { sceneId: string; layerId: string; armed: Set<string> } | null,  // value-driving FX open for feature arming
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
    // The scene's own fixtures — the EDIT target when nothing is explicitly
    // selected, so recalling a scene shows its faders without hijacking the
    // live selection (the explicit strip gesture still selects them on stage).
    const dto = state.editScene ? list.find((s) => s.id === state.editScene!.id) : null;
    state.sceneFixtureIds = (dto?.fixtureIds as string[] | undefined) ?? [];
    await refreshSceneValues();
  }

  async function load() {
    state.fixtures = await lumox.patch.list().catch(() => []);
    await resolveEditScene();
    await refreshProgrammer();
    render();
  }

  // Ids driving the strips. LIVE always follows the live selection; EDIT follows
  // it too, but falls back to the recalled scene's own fixtures when nothing is
  // selected — so opening a scene for editing always shows its faders.
  function targetIds(): string[] {
    if (state.mode !== 'live' && !state.selectionIds.length) return state.sceneFixtureIds;
    return state.selectionIds;
  }

  // The edit target resolved to fixture DTOs, in order. Stale ids (pruned by a
  // patch change) drop out, so the strips always match the patch.
  function selectionFixtures() {
    const byId = new Map<string, any>(state.fixtures.map((f) => [f.id, f]));
    return targetIds().map((id) => byId.get(id)).filter(Boolean);
  }

  // Split the selected fixtures into the blocks to render: one block per
  // channel-config (writes broadcast to all selected fixtures of that type). A
  // homogeneous selection yields a single block, matching the classic single-strip view.
  function buildBlocks(fixtures: any[]): Block[] {
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

  // Channel descriptor for a fixture by 1-based fader index (real or virtual).
  const chanOf = (f: any, ch: number) => f.channels.find((c: any) => c.index === ch);
  // Universe-absolute address of a channel — explicit for virtual dimmers, else
  // the contiguous `startAddress + index - 1`.
  const absOf = (f: any, ch: number): number => chanOf(f, ch)?.absAddress ?? (f.startAddress + ch - 1);

  // ---- per-channel state (engaged + value) for the representative fixture --
  function cellState(rep: any, ch: number): { on: boolean; v: number } {
    if (state.mode !== 'live') {   // EDIT or BLIND both show/edit the scene's stored values
      const chans = state.sceneValues[rep.universeId];
      const abs = absOf(rep, ch);
      const has = !!chans && Object.prototype.hasOwnProperty.call(chans, abs);
      return { on: has, v: has ? chans[abs] : 0 };
    }
    const key = `${rep.id}:${ch}`;
    // Virtual dimmers rest at full (the engine seeds them to 255), so an
    // untouched virtual fader reads 100%, not OFF.
    const def = chanOf(rep, ch)?.isVirtual ? 255 : 0;
    return { on: state.active.has(key), v: state.values.get(key) ?? def };
  }

  // ---- writes ------------------------------------------------------------
  // LIVE: write (engage) a value to the given channel on every fixture in the group.
  function writeLive(fixtures: any[], ch: number, value: number) {
    for (const f of fixtures) {
      state.values.set(`${f.id}:${ch}`, value);
      lumox.fixtures.setChannel(f.id, ch, value, chanOf(f, ch)?.absAddress);
    }
  }

  // LIVE: release (disengage) the given channel on every fixture in the group, so
  // it is dropped from the programmer and won't be captured by a Store.
  function releaseLive(fixtures: any[], ch: number) {
    for (const f of fixtures) {
      state.values.delete(`${f.id}:${ch}`);
      lumox.fixtures.releaseChannel(f.id, ch, chanOf(f, ch)?.absAddress);
    }
  }

  // EDIT: set (number) or clear (null) the channel in the edit scene across the
  // group. Mirror the representative fixture into the local cache for an instant
  // redraw; main holds the authoritative values for every fixture.
  function writeScene(fixtures: any[], ch: number, value: number | null) {
    const id = state.editScene?.id;
    if (!id) return;
    // BLIND writes the stored value only — main skips the live-track mirror, so the
    // rig keeps its current output until the edits are committed (mode switch away).
    const blind = state.mode === 'blind';
    for (const f of fixtures) lumox.scenes.setChannel(id, f.id, ch, value, chanOf(f, ch)?.absAddress, blind);
    const rep = fixtures[0];
    const abs = absOf(rep, ch);
    const chans = (state.sceneValues[rep.universeId] ??= {});
    if (value == null) delete chans[abs];
    else chans[abs] = value;
  }

  // engage (or, in LIVE, just remember) the channel and write its value
  function engage(fixtures: any[], ch: number, value: number) {
    if (state.mode !== 'live') writeScene(fixtures, ch, value);   // EDIT + BLIND target the scene
    else { state.active.add(`${fixtures[0].id}:${ch}`); writeLive(fixtures, ch, value); }
  }

  // ---- quick beam ops (act on the current target fixtures) ---------------
  const isIntensity = (c: any): boolean => c.group === 'intensity';
  const isPan = (c: any): boolean => c.typeId === 'pan' || c.typeId === 'tilt';
  const isPanFine = (c: any): boolean => c.typeId === 'pan-fine' || c.typeId === 'tilt-fine';
  // Off/On drive intensity; Center homes pan/tilt (coarse 128, fine 0); Reset releases
  // every channel. Each respects the active mode (scene write in EDIT/BLIND, programmer in LIVE).
  function quickOp(kind: 'on' | 'off' | 'center' | 'reset') {
    const fixtures = selectionFixtures();
    if (!fixtures.length) return;
    const release = (f: any, ch: number) => {
      if (state.mode === 'live') { state.active.delete(`${f.id}:${ch}`); releaseLive([f], ch); }
      else writeScene([f], ch, null);
    };
    for (const f of fixtures) for (const c of f.channels) {
      if (kind === 'reset') { release(f, c.index); continue; }
      if (kind === 'on' && isIntensity(c)) engage([f], c.index, 255);
      else if (kind === 'off' && isIntensity(c)) engage([f], c.index, 0);
      else if (kind === 'center' && isPan(c)) engage([f], c.index, 128);
      else if (kind === 'center' && isPanFine(c)) engage([f], c.index, 0);
    }
    render();
    if (state.mode === 'live') refreshProgrammer();
  }

  // The full fixed category bar, always shown regardless of the selected
  // fixtures (a category they lack just renders an empty strip area). Selecting
  // one filters the strips to its channels; FADER shows every channel (flat view).
  function attrTabs(): Array<{ id: string; label: string }> {
    const tabs = ATTR_TABS.map(([id, label]) => ({ id, label }));
    tabs.push({ id: 'all', label: 'FADER' });
    return tabs;
  }
  // One fader strip (index · value/OFF above; swatch left of the full-height
  // vertical fader; engage dot at the bottom).
  function faderCol(rep: any, c: any) {
    const { on, v } = cellState(rep, c.index);
    const tint = c.color ? `--cc:${c.color};` : '';
    // Virtual dimmers rest at full and always output, so they read live (their
    // value, un-greyed) even when not explicitly engaged.
    const lit = on || !!c.isVirtual;
    // Profile presets (gobo / colour / shutter / macro ranges) → quick-value
    // chips beside the fader (gobos as a 2-column thumbnail grid, see below). The
    // active range annotates the strip: its label as the readout, and — for a
    // drawn gobo — its shape as the icon.
    const caps: any[] = Array.isArray(c.caps) ? c.caps : [];
    const cur = capAt(caps, v);
    const goboMarkup = lit && cur?.pattern ? goboSvg(cur.pattern, 18) : '';
    // A strip whose presets carry drawn gobo icons lays them out as a 2-column
    // thumbnail grid; a colour wheel's swatches lay out as a max 3-column grid
    // (the open / rotation / scroll / macro ranges stay full-width text rows).
    const goboGrid = caps.some((cap) => typeof cap.pattern === 'string');
    const colorGrid = !goboGrid && caps.some((cap) => typeof cap.color === 'string');
    // FX-arm badge: shown while a value-driving FX layer is open (state.fxArm),
    // on every strip with a channel-type. Lit when that attribute is armed. A
    // master dimmer is armed via the canonical 'intensity' feature (the FX resolves
    // 'intensity' → intensity-master), so normalise it for the match + the arm.
    const armAttr = c.typeId === 'intensity-master' ? 'intensity' : c.typeId;
    const armable = !!state.fxArm && !!armAttr;
    const armed = armable && state.fxArm!.armed.has(armAttr);
    return html`
      <div class="fcol${lit ? ' active' : ''}${caps.length ? ' has-presets' : ''}${goboGrid ? ' is-gobo' : ''}${colorGrid ? ' is-color' : ''}" data-ch="${c.index}"
           data-midi="fixture:${rep.id}:${c.index}" data-midi-kind="range" data-midi-min="0" data-midi-max="255" data-midi-label="${rep.name} · ${c.name}">
        ${armable ? html`<button class="fc-fxbadge${armed ? ' on' : ''}" data-fxarm="${armAttr}" title="${armed ? 'Un-arm' : 'Arm'} ${c.name} for the FX">FX</button>` : ''}
        <div class="fc-n">${c.index}</div>
        <div class="fc-val" title="${cur ? cur.label : ''}">${lit ? (cur ? cur.label : v) : 'OFF'}</div>
        <div class="fc-body">
          <div class="fc-left">
            <span class="fc-icon${goboMarkup ? ' is-gobo' : ''}" title="${c.name}" style="${tint}">${raw(goboMarkup || channelIconHtml(c.typeId, c.group, c.color))}</span>
            ${caps.length ? html`<div class="fc-chips${goboGrid ? ' fc-chips--gobo' : colorGrid ? ' fc-chips--color' : ''}">${presetChips(caps, v)}</div>` : ''}
          </div>
          <input class="fc-fader" type="range" min="0" max="255" value="${v}" orient="vertical" />
        </div>
        <div class="fc-dot${on ? ' on' : ''}" title="${on ? 'Release channel' : 'Move the fader to engage'}"></div>
      </div>`;
  }

  // The profile range that contains a value (its named preset), or null.
  const capAt = (caps: any[], v: number) =>
    caps.find((cap) => v >= cap.min && v <= cap.max) ?? null;

  // Preset chips beside a channel's fader — one per profile range. A colour cap
  // shows its swatch, a drawn gobo its thumbnail, anything else a small label.
  // Clicking a chip engages the channel and snaps it to that range's mid value
  // (`data-v`); the active range's chip is highlighted.
  function presetChips(caps: any[], v: number) {
    return caps.map((cap) => {
      const active = v >= cap.min && v <= cap.max;
      const mid = Math.round((cap.min + cap.max) / 2);
      const cls = `fc-chip${active ? ' on' : ''}`;
      if (typeof cap.color === 'string')
        return html`<button class="${cls} sw" style="background:${cap.color}" title="${cap.label}" data-v="${mid}"></button>`;
      const gobo = cap.pattern ? goboSvg(cap.pattern, 18) : '';
      if (gobo)
        return html`<button class="${cls} gobo" title="${cap.label}" data-v="${mid}">${raw(gobo)}</button>`;
      return html`<button class="${cls} lbl" title="${cap.label}" data-v="${mid}">${cap.label}</button>`;
    });
  }

  // Per-cluster virtual-dimmer drawer: a slim toggle right after the cluster's
  // RGB faders that reveals just that cluster's dimmer (FADER view only — the
  // DIMMER category shows the virtual dimmers as plain strips instead).
  function clusterDim(rep: any, vc: any) {
    const open = state.vdimOpen.has(vc.index);
    return html`
      <div class="fe-vdim${open ? ' open' : ''}">
        <button class="fe-vdim-toggle" data-vdim="${vc.index}" title="${open ? 'Hide' : 'Show'} ${vc.name}">
          <i class="fa-solid fa-chevron-${open ? 'right' : 'left'}"></i>
        </button>
        <div class="fe-vdim-cols">${faderCol(rep, vc)}</div>
      </div>`;
  }

  // The strip row. A selected category filters to just its channels, rendered as
  // plain strips (virtual dimmers included — they carry the intensity group). The
  // FADER tab shows every real channel in order, each RGB cluster (on an RGB-only
  // fixture) followed by its own collapsed dimmer drawer.
  function fadersFor(rep: any) {
    const chans = rep.channels;
    if (!chans.length) return html`<div class="muted pad">No channels.</div>`;

    if (state.attr !== 'all') {
      const inCat = chans.filter((c: any) => c.group === state.attr);
      // COLOR view leads with a colour picker (RGB fixtures only) that drives the
      // red/green/blue strips; mounted post-render into this host.
      const pick = state.attr === 'color' && colorPrimaries(rep)
        ? html`<div class="fe-color-pick"></div>` : '';
      return html`<div class="fe-row">${pick}${inCat.map((c: any) => faderCol(rep, c))}</div>`;
    }

    const real = chans.filter((c: any) => !c.isVirtual);
    const virtual = chans.filter((c: any) => c.isVirtual);
    const byAfter = new Map<number, any>(virtual.map((c: any) => [c.afterIndex, c]));
    const orphans = virtual.filter((c: any) => !real.some((r: any) => r.index === c.afterIndex));
    return html`
      <div class="fe-row">
        ${real.map((c: any) => {
          const vc = byAfter.get(c.index);
          return html`${faderCol(rep, c)}${vc ? clusterDim(rep, vc) : ''}`;
        })}
        ${orphans.map((vc: any) => clusterDim(rep, vc))}
      </div>`;
  }

  // ---- COLOR picker ------------------------------------------------------
  // The block's red/green/blue channels, mapped to colour components — or null
  // when the fixture isn't a full RGB mixer (then no picker, just the strips).
  function colorPrimaries(rep: any): Array<{ ch: number; comp: 'r' | 'g' | 'b' }> | null {
    const prim = rep.channels
      .filter((c: any) => RGB_PRIMARY[c.typeId])
      .map((c: any) => ({ ch: c.index, comp: RGB_PRIMARY[c.typeId] }));
    const comps = new Set(prim.map((p: any) => p.comp));
    return comps.has('r') && comps.has('g') && comps.has('b') ? prim : null;
  }

  // Current colour of a block's rep, read back from its R/G/B strip values.
  function currentRgb(rep: any, prim: Array<{ ch: number; comp: string }>) {
    const rgb: any = { r: 0, g: 0, b: 0 };
    for (const { ch, comp } of prim) rgb[comp] = Math.round(cellState(rep, ch).v);
    return rgb;
  }

  // Push a colour onto a block: engage + write its R/G/B channels across the
  // block's fixtures and repaint the rep's strips (no full re-render → stays smooth).
  function applyColorToBlock(i: number, rgb: { r: number; g: number; b: number }) {
    const block = state.blocks[i];
    const prim = block && colorPrimaries(block.rep);
    if (!block || !prim) return;
    const blk = cols.el.querySelector<HTMLElement>(`.fe-block[data-block="${i}"]`);
    for (const { ch, comp } of prim) {
      const v = Math.round((rgb as any)[comp]);
      engage(block.fixtures, ch, v);
      if (blk) paintColumn(blk, ch, v);
    }
  }

  // Repaint one strip's value/fader/engage state in place (shared by the picker
  // and direct fader drags).
  function paintColumn(blk: HTMLElement, ch: number, v: number) {
    const col = blk.querySelector<HTMLElement>(`.fcol[data-ch="${ch}"]`);
    if (!col) return;
    col.classList.add('active');
    col.querySelector('.fc-dot')?.classList.add('on');
    const fader = col.querySelector('.fc-fader') as HTMLInputElement | null;
    if (fader) fader.value = String(v);
    const valEl = col.querySelector('.fc-val') as HTMLElement | null;
    if (valEl) valEl.textContent = String(v);
  }

  // ---- live mirroring (LIVE faders follow an animating scene) ------------
  // LIVE mode is a live output monitor: while ANY scene is live and periodic (a
  // chase / FX motion), poll the engine's mixed output for the selected fixtures
  // and drive the fader positions from it — so the strips visibly track the
  // movement. EDIT mode never mirrors (its strips stay on the editable stored
  // values). A recent drag pauses it so the user isn't fought mid-grab. The
  // engaged dots are left untouched (mirroring only moves the knob + readout).
  function paintLive(blk: HTMLElement, ch: number, v: number) {
    const col = blk.querySelector<HTMLElement>(`.fcol[data-ch="${ch}"]`);
    if (!col) return;
    col.classList.add('active');   // lit so the moving value reads (engaged dot left as-is)
    const fader = col.querySelector('.fc-fader') as HTMLInputElement | null;
    if (fader) fader.value = String(v);
    const valEl = col.querySelector('.fc-val') as HTMLElement | null;
    if (valEl) valEl.textContent = String(v);
  }
  function applyLiveValues(values: SceneValues) {
    cols.el.querySelectorAll<HTMLElement>('.fe-block').forEach((blk) => {
      const rep = state.blocks[Number(blk.dataset.block)]?.rep;
      const uni = rep && values[rep.universeId];
      if (!rep || !uni) return;
      blk.querySelectorAll<HTMLElement>('.fcol').forEach((col) => {
        const ch = Number(col.dataset.ch);
        const v = uni[absOf(rep, ch)];
        if (v != null) paintLive(blk, ch, v);
      });
    });
  }

  let liveBusy = false;
  async function liveTick() {
    if (liveBusy) return;
    const ids = targetIds();
    if (state.mode !== 'live' || !ids.length) {
      if (state.reflecting) { state.reflecting = false; render(); }
      return;
    }
    liveBusy = true;
    try {
      // id null → "is ANY live scene animating"; values are the live mixed output.
      const mon = await lumox.scenes.monitor(null, ids).catch(() => null);
      const animating = !!mon && mon.active && mon.cycleMs > 0;
      if (!animating) {
        if (state.reflecting) { state.reflecting = false; render(); }   // restore programmer display
        return;
      }
      state.reflecting = true;
      if (performance.now() - state.lastEditAt > 600) applyLiveValues(mon!.values);
    } finally {
      liveBusy = false;
    }
  }

  // Mount one picker per COLOR block, seeded from its current colour. Picker
  // drags write to the strips (onInput); strip drags push back via
  // `syncColorPicker` (setRgb never re-fires onInput, so there's no echo).
  function mountColorPickers() {
    state.colorPickers.clear();
    cols.el.querySelectorAll<HTMLElement>('.fe-color-pick').forEach((host) => {
      const blk = host.closest('.fe-block') as HTMLElement | null;
      const i = blk ? Number(blk.dataset.block) : -1;
      const block = state.blocks[i];
      const prim = block && colorPrimaries(block.rep);
      if (!block || !prim) return;
      const picker = createColorPicker({
        initial: currentRgb(block.rep, prim),
        onInput: (rgb) => applyColorToBlock(i, rgb),
        onEnd: () => { if (state.mode === 'live') refreshProgrammer(); },
      });
      host.appendChild(picker.el);
      state.colorPickers.set(i, picker);
    });
  }

  // Reflect a strip's new value back onto its block's picker (no write-back).
  function syncColorPicker(blk: HTMLElement) {
    const i = Number(blk.dataset.block);
    const picker = state.colorPickers.get(i);
    const block = state.blocks[i];
    const prim = block && colorPrimaries(block.rep);
    if (picker && block && prim) picker.setRgb(currentRgb(block.rep, prim));
  }

  function render() {
    updateHead();
    const fixtures = selectionFixtures();
    if (!fixtures.length) {
      cols.set(html`<div class="muted pad">No fixtures selected.</div>`);
      return;
    }
    const blocks = buildBlocks(fixtures);
    state.blocks = blocks;
    const tabs = attrTabs();

    // A selected category drops blocks with no channels in it (so empty blocks
    // and their labels vanish, not just the strips). Keep each block's original
    // index — event handlers resolve fixtures by `data-block` against state.blocks.
    const hasAttr = (b: Block) =>
      state.attr === 'all' || b.rep.channels.some((c: any) => c.group === state.attr);
    const shown = blocks.map((b, i) => [b, i] as const).filter(([b]) => hasAttr(b));
    const single = shown.length === 1;

    cols.set(html`
      <div class="fe-side">
        ${tabs.map((t) => html`<button class="fe-attr${t.id === state.attr ? ' active' : ''}" data-attr="${t.id}">${t.label}</button>`)}
      </div>
      <div class="fe-main">
        <div class="fe-attr-body${single ? ' single' : ''}">
          ${shown.map(([b, i]) => html`
            <div class="fe-block" data-block="${i}">
              ${single ? '' : html`<div class="fe-bname">${b.label}</div>`}
              ${fadersFor(b.rep)}
            </div>`)}
        </div>
      </div>`);

    if (state.attr === 'color') mountColorPickers();
    else state.colorPickers.clear();
  }

  // Header reflects the current write target: EDIT shows the scene being edited;
  // LIVE shows the programmer status with Clear / Store actions.
  function updateHead() {
    const live = state.mode === 'live';
    target.hidden = live;
    prog.hidden = !live;
    if (!live) {
      const dim = !state.editScene;
      const pfx = state.mode === 'blind' ? 'BLIND' : 'EDIT';
      target.textContent = state.editScene ? `${pfx}: ${state.editScene.name}` : `${pfx}: no scene`;
      target.classList.toggle('muted', dim);
      target.classList.toggle('fe-blindtag', state.mode === 'blind');
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
    const wasBlind = state.mode === 'blind';
    state.mode = m;
    head.querySelectorAll('.fe-mode .seg-btn').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.mode === m));
    // Leaving BLIND commits the staged edits to live output (main rebuilds the track).
    if (wasBlind && state.editScene) await lumox.scenes.commit(state.editScene.id).catch(() => {});
    if (m === 'live') await refreshProgrammer();
    else await refreshSceneValues();
    render();
  }
  head.querySelectorAll('.fe-mode .seg-btn').forEach((b) =>
    b.addEventListener('click', () => setMode((b as HTMLElement).dataset.mode as Mode)));
  head.querySelectorAll('.fe-quick .fe-qbtn').forEach((b) =>
    b.addEventListener('click', () => quickOp((b as HTMLElement).dataset.qop as 'on' | 'off' | 'center' | 'reset')));

  // Resolve the fixtures a strip writes to from its enclosing block (falls back to
  // the whole selection if, somehow, the strip is outside a block).
  function blockFixtures(el: HTMLElement): any[] {
    const blk = el.closest('.fe-block') as HTMLElement | null;
    const i = blk ? Number(blk.dataset.block) : -1;
    return state.blocks[i]?.fixtures ?? selectionFixtures();
  }

  // ---- delegated events (bound once; survive every render) --------------
  // sidebar category → filter the strips to that category's channels.
  cols.on('click', '.fe-attr', (_e, t) => {
    const a = (t as HTMLElement).dataset.attr;
    if (!a || a === state.attr) return;
    state.attr = a;
    render();
  });

  // expand / collapse one cluster's virtual-dimmer drawer (RGB-only fixtures)
  cols.on('click', '.fe-vdim-toggle', (_e, t) => {
    const btn = (t as HTMLElement).closest('.fe-vdim-toggle') as HTMLElement | null;
    const k = Number(btn?.dataset.vdim);
    if (!Number.isFinite(k)) return;
    if (state.vdimOpen.has(k)) state.vdimOpen.delete(k); else state.vdimOpen.add(k);
    render();
  });

  // dot click toggles the channel: engage it at 0 when off, release it when on
  // (release forces 0 / drops it from the scene).
  // FX badge → arm / un-arm this strip's attribute on the open value-driving FX
  // layer (the Scene panel's expanded curve/value/chaser). Optimistic toggle, then
  // SCENE_UPDATED lets the Scene panel re-broadcast the authoritative armed set.
  cols.on('click', '.fc-fxbadge', (_e, t) => {
    const a = state.fxArm; if (!a) return;
    const attr = (t as HTMLElement).dataset.fxarm as string;
    const armed = a.armed.has(attr);
    if (armed) { a.armed.delete(attr); lumox.scenes.unarmFeature(a.sceneId, a.layerId, attr).catch(() => {}); }
    else { a.armed.add(attr); lumox.scenes.armFeature(a.sceneId, a.layerId, attr).catch(() => {}); }
    bus.emit(EV.SCENE_UPDATED, a.sceneId);
    render();
  });

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

  // click a preset chip → engage the channel and snap it to that range's value
  cols.on('click', '.fc-chip', (_e, t) => {
    const col = (t as HTMLElement).closest('.fcol') as HTMLElement | null;
    const fixtures = blockFixtures(t as HTMLElement);
    if (!col || !fixtures.length) return;
    engage(fixtures, Number(col.dataset.ch), Number((t as HTMLElement).dataset.v));
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
    state.lastEditAt = performance.now();   // pause live-mirroring so a drag isn't fought
    engage(fixtures, ch, v);
    // live-update this column without a full re-render (keeps the drag smooth)
    col.classList.add('active');
    (col.querySelector('.fc-dot') as HTMLElement | null)?.classList.add('on');
    // Track the value range the fader is now on: its label as the readout and —
    // for a drawn gobo — its shape as the icon, so the selected gobo updates live.
    const chan = chanOf(fixtures[0], ch);
    const cur = chan?.caps?.length ? capAt(chan.caps, v) : null;
    (col.querySelector('.fc-val') as HTMLElement).textContent = cur ? cur.label : String(v);
    const icon = col.querySelector('.fc-icon') as HTMLElement | null;
    if (icon && chan?.caps?.length) {
      const gobo = cur?.pattern ? goboSvg(cur.pattern, 18) : '';
      icon.classList.toggle('is-gobo', !!gobo);
      icon.innerHTML = gobo || channelIconHtml(chan.typeId, chan.group, chan.color);
    }
    // In COLOR view, dragging an R/G/B strip moves the wheel to match.
    if (state.attr === 'color') {
      const blk = col.closest('.fe-block') as HTMLElement | null;
      if (blk) syncColorPicker(blk);
    }
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
  // The live selection (stage / patch grid / group bar / main) is the edit target.
  // A value-driving FX layer opened/closed for arming → show/hide the FX badges.
  bus.on(EV.FX_ARM, (d: { sceneId: string; layerId: string; armed: string[] } | null) => {
    state.fxArm = d ? { sceneId: d.sceneId, layerId: d.layerId, armed: new Set(d.armed) } : null;
    render();
  });
  bus.on(EV.FIXTURE_SELECTED, (d: { ids: string[] } | null) => { state.selectionIds = d?.ids ?? []; render(); });
  bus.on(EV.PATCH_CHANGED, load);
  bus.on(EV.SCENE_SELECTED, async (sel: SceneRef | null) => { await resolveEditScene(sel); render(); });
  // Deselect — drop the editor's scene target outright (don't fall back to active).
  bus.on(EV.SCENE_DESELECTED, async () => { state.editScene = null; await refreshSceneValues(); render(); });

  try { state.selectionIds = await lumox.selection.get(); } catch { state.selectionIds = []; }
  await load();
  // ~25 Hz live-mirror poll (idles cheaply unless an animating scene is open in EDIT).
  window.setInterval(liveTick, 40);
  return { tile, refresh: load };
}
