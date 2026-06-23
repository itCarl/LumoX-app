// Banks tile (CONTROL view, top-left) — a bank is an ordered group of scenes.
// Bank tabs + a column per bank: header, a “+” that captures current output as
// a new scene, and stacked scene cells.
// Each scene cell has two click regions: the wide body activates / deactivates
// the scene (live playback); the full-height colour strip on the right selects it
// for editing (loads it into the fader editor).

import { mount, html, raw } from '../lib/dom';
import { openMenu, type MenuItem } from '../lib/widgets';
import { onShortcut } from '../lib/keys';
import { promptText } from '../lib/prompt';
import { bus, EV } from '../lib/bus';

const { lumox } = window;

// per-bank accent colours (cycled by bank index)
const BANK_COLORS = [
  '#e8a33d', '#e0564b', '#e34b8a', '#c44be0', '#8c4be0', '#4b7ce0',
  '#3db0c4', '#4bc46a', '#9ec44b', '#cfcfcf', '#e0c44b',
];
const bankColor = (i: number) => BANK_COLORS[i % BANK_COLORS.length];


// Font Awesome capture icon (rendered as an <i> webfont glyph)
const ICON = {
  plus:  '<i class="fa-solid fa-plus"></i>',
};

export async function makeBanksTile() {
  const tile = document.createElement('section');
  tile.className = 'tile bank-tile';
  tile.innerHTML = `
    <div class="bank-tabs" id="bk-tabs"></div>
    <div class="bank-cols tile-body" id="bk-cols"></div>`;

  const tabs = mount(tile.querySelector('#bk-tabs') as HTMLElement);
  const cols = mount(tile.querySelector('#bk-cols') as HTMLElement);
  let active: string | null = null;
  let emitted: string | null = null;      // last BANK_SELECTED we broadcast
  let selected: string | null = null;     // scene chosen for editing (the right strip)
  const compact = new Set<string>();       // bank ids shown compact (scene cells shrunk to just the name)
  let banks: any[] = [];
  let pollTimer: number | null = null;   // refreshes active scenes while they animate
  let rafId: number | null = null;       // smooth timeline interpolation between polls
  let anchorAt = 0;                       // performance.now() at the last reload (phase anchor)

  const findScene = (id: string) =>
    banks.find((b) => b.scenes.some((s: any) => s.id === id))?.scenes.find((s: any) => s.id === id);
  // Cell label: chase shows its step count; otherwise the FX-rack size, else STATIC.
  const typeLabel = (s: any) =>
    s.type === 'chase' ? `CHASE ${s.stepCount}`
      : (s.layers?.length ? `FX ${s.layers.length}` : 'STATIC');

  // Active-scene timeline — only a periodic scene (a chase walk or FX-layer
  // period, `cycleMs > 0`) has a playhead; a static look is just static and
  // shows none. The cell also gets a loop icon; the strip fills with the live
  // position within the cycle.
  // Live position within the cycle (counts up; wraps each cycle).
  const sceneCurrentMs = (s: any): number =>
    (((s.phaseMs ?? 0) % s.cycleMs) + s.cycleMs) % s.cycleMs;
  const sceneFrac = (s: any): number => sceneCurrentMs(s) / s.cycleMs;
  // mm:ss:cs timecode — 880ms → "00m00s88", 65430ms → "01m05s43".
  const timecode = (ms: number): string => {
    const t = Math.max(0, Math.round(ms));
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(Math.floor(t / 60000))}m${p(Math.floor((t % 60000) / 1000))}s${p(Math.floor((t % 1000) / 10))}`;
  };

  // Markup depends on this signature; while it's unchanged between polls we patch
  // values IN PLACE (applyLive) rather than rebuilding the innerHTML — a rebuild
  // landing between a click's press and release would otherwise drop the click.
  // `selected` and live values (level/timeline) are NOT in the signature — they
  // are patched in place.
  function structuralSig(): string {
    return `${active}|` + banks.map((b: any) =>
      `${b.id}${compact.has(b.id) ? '~' : ''}[` +
      b.scenes.map((s: any) => `${s.id}${s.active ? 'A' : ''}${s.cycleMs > 0 ? 'L' : ''}${s.name}:${typeLabel(s)}`).join(',') +
      ']').join(';');
  }
  let domSig = '';

  function renderDom() {
    tabs.set(html`
      ${banks.map((b, i) => html`<button class="bk-tab${b.id === active ? ' active' : ''}" data-bank="${b.id}" style="--bank:${bankColor(i)}">${b.name}</button>`)}
      <button class="bk-tab bk-add" id="bk-add" title="Add bank"><i class="fa-solid fa-plus"></i></button>`);

    cols.set(html`${banks.map((b, i) => html`
      <div class="bank-col${compact.has(b.id) ? ' compact' : ''}" data-bank="${b.id}" style="--bank:${bankColor(i)}">
        <button class="bank-col-head" data-bank="${b.id}" title="Compact / expand scenes"><span>${b.name}</span><span class="bk-chev"><i class="fa-solid fa-chevron-down"></i></span></button>
        <button class="bk-cap" data-bank="${b.id}" title="Capture current output as a scene">${raw(ICON.plus)}</button>
        ${b.scenes.map((s: any) => html`
          <div class="scene-cell${s.active ? ' active' : ''}${s.id === selected ? ' selected' : ''}" data-scene="${s.id}" data-midi="scene:${s.id}" data-midi-kind="trigger" data-midi-label="Scene: ${s.name}" style="--sc:${bankColor(i)}">
            <div class="sc-box">
              <div class="sc-level" style="height:${Math.round(s.opacity * 100)}%"></div>
              <div class="sc-info">
                <div class="sc-name">${s.name}</div>
                <div class="sc-type">${typeLabel(s)}</div>
                ${s.active && s.cycleMs > 0 ? html`<div class="sc-time">${timecode(sceneCurrentMs(s))}</div>` : ''}
              </div>
              ${s.active && s.cycleMs > 0 ? html`<span class="sc-loop" title="Loops every ${timecode(s.cycleMs)}"><i class="fa-solid fa-arrows-rotate"></i></span>` : ''}
              ${s.active && s.cycleMs > 0 ? html`<div class="sc-timing"><div class="sc-timing-fill" style="width:${Math.round(sceneFrac(s) * 100)}%"></div></div>` : ''}
            </div>
            <button class="sc-strip" data-scene="${s.id}" title="Select for editing (click again to deselect)"></button>
          </div>`)}
      </div>`)}`);

    domSig = structuralSig();
    anchorAt = performance.now();   // re-anchor the interpolated timeline
    pinColumnHeights();
  }

  // Each bank column is a CSS column-wrap flow (header + scene cells): scenes fill
  // top-to-bottom and wrap into a new column to the right once the height fills.
  // Chromium only expands a column-wrap box's WIDTH to fit the extra columns when
  // its height is definite — the stretched (flex) height isn't enough — so pin each
  // bank column to its resolved height. Re-run on every rebuild and on resize.
  function pinColumnHeights() {
    const list = [...cols.el.querySelectorAll('.bank-col')] as HTMLElement[];
    for (const el of list) el.style.height = '';             // release → re-resolve from the row
    const heights = list.map((el) => el.clientHeight);       // batched read (one reflow)
    list.forEach((el, i) => { el.style.height = `${heights[i]}px`; });
  }

  // Patch the dynamic bits in place (no innerHTML) so clicks/hover survive while
  // scenes animate: the (non-structural) selected highlight + each cell's level
  // and active-scene timeline values.
  function applyLive() {
    for (const b of banks) for (const s of b.scenes as any[]) {
      const cell = cols.el.querySelector(`.scene-cell[data-scene="${s.id}"]`) as HTMLElement | null;
      if (!cell) continue;
      cell.classList.toggle('selected', s.id === selected);
      const lvl = cell.querySelector('.sc-level') as HTMLElement | null;
      if (lvl) lvl.style.height = `${Math.round(s.opacity * 100)}%`;
      if (s.active && s.cycleMs > 0) {
        const t = cell.querySelector('.sc-time'); if (t) t.textContent = timecode(sceneCurrentMs(s));
        const f = cell.querySelector('.sc-timing-fill') as HTMLElement | null;
        if (f) f.style.width = `${Math.round(sceneFrac(s) * 100)}%`;
      }
    }
    anchorAt = performance.now();
  }

  async function reload() {
    try { banks = await lumox.banks.list(); } catch { banks = []; }
    if (!banks.length) { if (emitted !== null) { emitted = null; bus.emit(EV.BANK_SELECTED, null); } return; }
    if (!banks.some((b) => b.id === active)) active = banks[0].id;
    // Broadcast the Store target for the fader editor (only on real changes).
    if (active !== emitted) { emitted = active; bus.emit(EV.BANK_SELECTED, active); }
    renderDom();
    syncPolling();
    syncRaf();
  }

  // Timer body — refetch, then rebuild only if the structure changed (a cue
  // advanced / a scene activated); otherwise patch values in place so an
  // in-flight click is never interrupted by an innerHTML rebuild.
  async function poll() {
    try { banks = await lumox.banks.list(); } catch { return; }
    if (!banks.length || !banks.some((b) => b.id === active)) { reload(); return; }
    if (structuralSig() !== domSig) renderDom(); else applyLive();
    syncPolling();
    syncRaf();
  }

  // Poll while a scene is mid-fade, mid-crossfade, or an active scene is periodic.
  // `fading` covers a plain opacity ramp in EITHER direction — a fade-out starts at
  // `level` and moves toward 0, so an `opacity != level` test can't see it and the
  // `active` highlight would never clear. A dipless crossfade holds the outgoing
  // opacity (no ramp to detect), so it must be polled explicitly via `transitioning`.
  // Coarse (250ms); the rAF loop below interpolates the timeline smoothly between polls.
  function syncPolling() {
    const need = banks.some((b) => b.scenes.some((s: any) =>
      s.transitioning || s.fading || (s.active && s.cycleMs > 0)));
    if (need && pollTimer == null) pollTimer = window.setInterval(poll, 250);
    else if (!need && pollTimer != null) { clearInterval(pollTimer); pollTimer = null; }
  }

  // Smoothly advance each periodic active scene's timecode + playhead at the
  // display refresh rate, anchored to the last poll's phase (engine `phaseMs`
  // accumulates in real time, so a 1:1 local advance is correct; paused scenes
  // hold). Re-anchored every poll, so it never drifts from the engine.
  function frame() {
    const dt = performance.now() - anchorAt;
    for (const b of banks) for (const s of b.scenes as any[]) {
      if (!s.active || !(s.cycleMs > 0) || s.paused) continue;
      const cell = cols.el.querySelector(`.scene-cell[data-scene="${s.id}"]`);
      if (!cell) continue;
      const pos = ((((s.phaseMs ?? 0) + dt) % s.cycleMs) + s.cycleMs) % s.cycleMs;
      const t = cell.querySelector('.sc-time'); if (t) t.textContent = timecode(pos);
      const f = cell.querySelector('.sc-timing-fill') as HTMLElement | null;
      if (f) f.style.width = `${(pos / s.cycleMs) * 100}%`;
    }
    rafId = requestAnimationFrame(frame);
  }
  function syncRaf() {
    const live = banks.some((b) => b.scenes.some((s: any) => s.active && s.cycleMs > 0 && !s.paused));
    if (live && rafId == null) rafId = requestAnimationFrame(frame);
    else if (!live && rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ---- delegated events (bound once; survive every reload) --------------
  tabs.on('click', '#bk-add', async () => { const b = await lumox.banks.add(); active = b.id; reload(); });
  tabs.on('click', '.bk-tab[data-bank]', (_e, t) => { active = t.dataset.bank as string; reload(); });
  tabs.on('contextmenu', '.bk-tab[data-bank]', (e, t) => {
    e.preventDefault();
    showBankMenu(e as MouseEvent, t.dataset.bank as string);
  });
  // Bank column header also opens the bank menu on right-click (left-click compacts).
  cols.on('contextmenu', '.bank-col-head', (e, t) => {
    e.preventDefault();
    showBankMenu(e as MouseEvent, t.dataset.bank as string);
  });

  // ---- bank context menu -----------------------------------------------
  function showBankMenu(e: MouseEvent, bankId: string) {
    const items: MenuItem[] = [
      { label: 'Rename…', key: 'F2', onClick: () => renameBank(bankId) },
      { divider: true },
      { label: 'Delete', onClick: async () => {
        await lumox.banks.remove(bankId);
        if (active === bankId) active = null;   // reload() re-resolves to the first remaining bank
        reload();
      } },
    ];
    openMenu(items, { at: e, className: 'scene-menu' });
  }

  // Bank header (name + chevron) compacts the column — scene cells shrink to
  // just their name (the list stays visible; transport stays available).
  cols.on('click', '.bank-col-head', (_e, t) => {
    const id = t.dataset.bank as string;
    if (compact.has(id)) compact.delete(id); else compact.add(id);
    reload();
  });

  cols.on('click', '.bk-cap', async (_e, t) => { await lumox.scenes.capture(t.dataset.bank as string); reload(); });

  // Body (wide rectangle) activates / deactivates the scene (live playback) and,
  // on activate, makes it the fader-editor EDIT target so the editor FOLLOWS what
  // is live — but it does NOT touch the live fixture selection (firing scenes mid-
  // show must never disturb what you're programming, nor re-fan other selection-FX;
  // the right strip is the explicit "select this scene's fixtures"). The strip
  // selects for editing, so skip clicks that originate there. Flash scenes are
  // driven by pointerdown/up (play while held), so skip them here too.
  cols.on('click', '.scene-cell', async (e, t) => {
    if ((e.target as HTMLElement).closest('.sc-strip')) return;
    const id = t.dataset.scene as string;
    const s = findScene(id);
    if ((s as any)?.flash) return;
    // Toggle off the LIVE DOM class, not the `banks` snapshot — the latter only
    // refreshes on reload(), so a rapid second click would read stale state and
    // re-activate instead of toggling off.
    const on = !t.classList.contains('active');
    t.classList.toggle('active', on);    // optimistic — instant feedback before the round-trip
    if (on) selectScene(id, false);      // follow as edit target, but keep the selection
    await lumox.scenes.recall(id, on);
    reload();
  });

  // Flash: recall on press, release on the next pointer-up anywhere.
  cols.on('pointerdown', '.scene-cell', async (e, t) => {
    if ((e.target as HTMLElement).closest('.sc-strip')) return;
    const id = t.dataset.scene as string;
    if (!(findScene(id) as any)?.flash) return;
    await lumox.scenes.recall(id, true);
    reload();
    const up = async () => {
      window.removeEventListener('pointerup', up);
      await lumox.scenes.recall(id, false);
      reload();
    };
    window.addEventListener('pointerup', up);
  });

  // Right strip (tall rectangle) selects the scene as the fader-editor EDIT
  // target (loads it for editing) without changing playback — clicking the
  // already-selected scene's strip toggles it back off (deselect). Selection is a
  // class toggle (not structural), so patch it in place — no rebuild, instant.
  cols.on('click', '.sc-strip', (_e, t) => {
    const id = t.dataset.scene as string;
    if (selected === id) deselectScene(); else selectScene(id);
  });

  // Mark a scene as the EDIT target: patch the highlight in place (selection isn't
  // structural, so no rebuild) and broadcast so the fader editor loads it.
  // `selectFixtures` (the strip gesture) also picks the scene's fixtures as the live
  // selection so they're ready to edit; activating-to-follow passes false to leave
  // the current selection untouched.
  function selectScene(id: string, selectFixtures = true) {
    selected = id;
    cols.el.querySelectorAll('.scene-cell.selected').forEach((c) => c.classList.remove('selected'));
    cols.el.querySelector(`.scene-cell[data-scene="${id}"]`)?.classList.add('selected');
    bus.emit(EV.SCENE_SELECTED, { id, name: findScene(id)?.name ?? '' });
    // Auto-select the scene's fixtures on the stage so they're ready to edit (and
    // become the live target for any selection-driven FX). The stage adopts this
    // via the FIXTURE_SELECTED bridge; skip when the scene drives nothing.
    if (!selectFixtures) return;
    const fids = (findScene(id) as any)?.fixtureIds as string[] | undefined;
    if (fids?.length) bus.emit(EV.FIXTURE_SELECTED, { ids: fids, src: 'banks' });
  }

  // Clear the EDIT target entirely (no scene). Distinct from SCENE_SELECTED-null,
  // which re-resolves to the active scene — this explicitly empties the editors.
  function deselectScene() {
    selected = null;
    cols.el.querySelectorAll('.scene-cell.selected').forEach((c) => c.classList.remove('selected'));
    bus.emit(EV.SCENE_DESELECTED, null);
  }
  cols.on('contextmenu', '.scene-cell', (e, t) => {
    e.preventDefault();
    showSceneMenu(e as MouseEvent, t.dataset.scene as string);
  });

  // ---- scene actions (shared by the context menu + keyboard shortcuts) ---
  async function deleteScene(sceneId: string) {
    await lumox.scenes.remove(sceneId);
    bus.emit(EV.SCENE_SELECTED, null);   // edit target re-resolves to whatever stays active
    reload();
  }
  async function renameScene(sceneId: string) {
    const n = await promptText({ title: 'Rename scene', value: findScene(sceneId)?.name ?? '' });
    if (!n) return;
    await lumox.scenes.rename(sceneId, n);
    if (findScene(sceneId)?.active) bus.emit(EV.SCENE_SELECTED, { id: sceneId, name: n });
    reload();
  }
  async function duplicateScene(sceneId: string) {
    await lumox.scenes.duplicate(sceneId);
    reload();
  }
  async function renameBank(bankId: string) {
    const n = await promptText({ title: 'Rename bank', value: banks.find((b) => b.id === bankId)?.name ?? '' });
    if (!n) return;
    await lumox.banks.rename(bankId, n);
    reload();
  }

  // ---- scene context menu ----------------------------------------------
  function showSceneMenu(e: MouseEvent, sceneId: string) {
    const sc = findScene(sceneId);
    const type = sc?.type ?? 'static';
    const setType = (t: string) => async () => {
      await lumox.scenes.setType(sceneId, t);
      bus.emit(EV.SCENE_UPDATED, sceneId);   // panel re-evaluates its control enable-matrix
      reload();
    };

    const items: MenuItem[] = [
      { label: 'Delete', key: 'Del', onClick: () => deleteScene(sceneId) },
      { label: 'Rename…', key: 'F2', onClick: () => renameScene(sceneId) },
      { label: 'Duplicate', key: 'Ctrl+D', onClick: () => duplicateScene(sceneId) },
      { divider: true },
      { sub: 'Base' },
      { label: 'Static', check: type === 'static', onClick: setType('static') },
      { label: 'Chase', check: type === 'chase', onClick: setType('chase') },
    ];
    if (type === 'chase') {
      items.push({ label: `Add step (capture) — ${sc?.stepCount ?? 0}`, onClick: async () => { await lumox.scenes.addStep(sceneId); reload(); } });
    }
    items.push(
      { divider: true },
      { label: 'Edit', check: true, key: 'Ctrl+E', onClick: async () => { await lumox.scenes.update(sceneId); reload(); } },
    );
    openMenu(items, { at: e, className: 'scene-menu' });
  }

  // Refresh when the Scene Properties panel changes a scene (level / recall etc.)
  // so the cell's active highlight, level bar and type label stay in sync.
  bus.on(EV.SCENE_UPDATED, () => reload());

  // Keep the edit-selected strip highlight in sync when the EDIT target is
  // changed from another tile (fader editor / fx palette / on delete). Patch the
  // class in place — selection isn't structural, so no rebuild.
  bus.on(EV.SCENE_SELECTED, (sel: { id: string } | null) => {
    const id = sel?.id ?? null;
    if (id === selected) return;
    selected = id;
    cols.el.querySelectorAll('.scene-cell.selected').forEach((c) => c.classList.remove('selected'));
    if (id) cols.el.querySelector(`.scene-cell[data-scene="${id}"]`)?.classList.add('selected');
  });

  // Keyboard shortcuts act on the edit-selected scene. The banks tile is only
  // shown in CONTROL, so gating on its visibility scopes these to that tab.
  const visible = () => !tile.classList.contains('hidden');   // banks tile is CONTROL-only
  const sceneTargeted = () => visible() && !!selected;
  onShortcut({ key: 'Delete' }, () => { if (selected) deleteScene(selected); }, sceneTargeted);
  onShortcut({ key: 'Backspace' }, () => { if (selected) deleteScene(selected); }, sceneTargeted);
  onShortcut({ key: 'd', ctrl: true }, () => { if (selected) duplicateScene(selected); }, sceneTargeted);
  // F2 renames the edit-selected scene, or the active bank when none is selected.
  onShortcut({ key: 'F2' }, () => { if (selected) renameScene(selected); else if (active) renameBank(active); }, visible);

  // Re-pin the bank-column heights when the tile resizes (dock splitter / window),
  // so the wrap point — and thus how many columns each bank uses — tracks the
  // available height. Observing the cols container; pinning the inner columns
  // doesn't change its own box, so this can't loop.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => pinColumnHeights()).observe(cols.el);

  await reload();
  return { tile, refresh: reload };
}
