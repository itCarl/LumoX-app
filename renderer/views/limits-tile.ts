// Fixture Limits tile (SETUP view, bottom-right) — a visual editor for the
// per-fixture output limits that the engine's `Limits` post-mix stage applies
// (see docs/knowledge-base/limits.md). Operates on the live fixture selection
// (stage / patch grid): seeds from the first selected fixture and writes to the
// whole selection via `lumox.fixtures.setLimits`.
//
// Visual model (all stored as DMX bytes) — laid out as side-by-side columns
// (movement | brightness), since the SETUP bottom-right slot is wide:
//   - Pan / tilt range: a 2D crop box — the allowed movement window as a dashed
//     rectangle with square handles at its corners (drag both axes) and edge
//     midpoints (drag one) PLUS editable min/max fields in absolute DEGREES,
//     derived from the fixture's physical pan/tilt travel, with invert + swap;
//   - Max brightness: a vertical fader + a 0–100 % field (100 % = uncapped).

import { bus, EV } from '../lib/bus';
import { html, mount, raw } from '../lib/dom';
import { toggle as toggleSwitch } from '../lib/widgets';

const { lumox } = window;

// Fallback pan/tilt travel when a fixture definition omits focus degrees — the
// common moving-head geometry (matches typical view-layer defaults of ~540/270).
const PAN_DEFAULT_DEG = 540;
const TILT_DEFAULT_DEG = 270;

const hasType = (fx: any, pred: (t: string) => boolean): boolean => (fx.channels as any[]).some((c) => c.typeId && pred(c.typeId));
const isIntensityFx = (fx: any): boolean => (fx.channels as any[]).some((c) => c.isIntensity);
const clampB = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clampP = (v: number): number => (v < 0 ? 0 : v > 100 ? 100 : Math.round(v));
const toPct = (byte: number): number => Math.round((byte / 255) * 100);    // DMX byte → 0–100 %
const toByte = (pct: number): number => clampB((clampP(pct) / 100) * 255);  // 0–100 % → DMX byte
// Pan/tilt are shown in absolute degrees: a coarse DMX byte maps linearly onto
// the axis's physical travel (0..max°). Stored value stays a DMX byte.
const toDeg = (byte: number, maxDeg: number): number => Math.round((byte / 255) * maxDeg);
const degToByte = (deg: number, maxDeg: number): number => {
  const d = deg < 0 ? 0 : deg > maxDeg ? maxDeg : deg;
  return clampB((d / maxDeg) * 255);
};

interface Limits {
  dimmer?: { max: number };
  pan?: { min: number; max: number; invert?: boolean };
  tilt?: { min: number; max: number; invert?: boolean };
  swapPanTilt?: boolean;
}

export async function makeLimitsTile(): Promise<{ tile: HTMLElement; refresh: () => Promise<void> }> {
  const tile = document.createElement('section');
  tile.className = 'tile limits-tile';
  tile.innerHTML = `
    <div class="tile-head"><span>LIMITS</span><span class="lt-sel"></span><button class="lt-clear" title="Clear all limits on the selection">Clear</button></div>
    <div class="tile-body lt-body"></div>`;
  const body = mount(tile.querySelector('.lt-body') as HTMLElement);
  const selEl = tile.querySelector('.lt-sel') as HTMLElement;
  const clearBtn = tile.querySelector('.lt-clear') as HTMLButtonElement;

  let ids: string[] = [];          // current selection
  let targets: any[] = [];         // selected fixture DTOs
  let lim: Limits = {};            // working limits (seed = first target)

  const apply = (patch: Record<string, unknown>) => { void lumox.fixtures.setLimits(ids, patch); };

  async function reload(next?: string[]) {
    if (next) ids = next;
    let all: any[] = [];
    try { all = await lumox.patch.list(); } catch { all = []; }
    targets = all.filter((f) => ids.includes(f.id));
    lim = { ...(targets[0]?.limits ?? {}) } as Limits;
    render();
  }

  function render() {
    const has = targets.length > 0;
    // Toggle via visibility (not display) so the button keeps its box — otherwise
    // the header height changes between empty/populated and shifts the body down.
    clearBtn.style.visibility = has ? '' : 'hidden';
    selEl.textContent = !has ? '' : (targets.length === 1 ? targets[0].name : `${targets.length} fixtures`);

    const canDim = has && targets.some((f) => isIntensityFx(f));
    const canPan = has && targets.some((f) => hasType(f, (t) => t === 'pan'));
    const canTilt = has && targets.some((f) => hasType(f, (t) => t === 'tilt'));
    const rep = targets[0];

    // BOTH concern columns are ALWAYS rendered — brightness | movement. A selection
    // that lacks a column's channels (e.g. an LED bar has a dimmer but no pan/tilt)
    // greys that column out + makes it inert, rather than removing it: dropping a
    // column would reflow the layout (the operator's target moves) and breaks the
    // disable-don't-hide rule the no-selection ghost already follows. So clicking an
    // LED bar leaves the pan/tilt controls in place, just greyed.
    const ghost = !has;
    const dimOff = has && !canDim;
    const moveOff = has && !canPan && !canTilt;

    // Side-by-side columns (the tile is wide): brightness | movement, with a
    // divider between them (matches the dimmer-left / movement-right console layout).
    body.set(html`
      <div class="lt-cols${ghost ? ' lt-ghost' : ''}">
        ${raw(`<section class="lt-col lt-col-dim${dimOff ? ' lt-col-off' : ''}" id="lt-dim"></section>`)}
        ${raw(`<section class="lt-col lt-col-move${moveOff ? ' lt-col-off' : ''}" id="lt-move"></section>`)}
      </div>`);

    // A greyed (off) column still draws its full default controls so it reads as
    // complete-but-unavailable, not blank — render both axes when ghosting it.
    mountMove(tile.querySelector('#lt-move') as HTMLElement, ghost || canPan || moveOff, ghost || canTilt || moveOff, rep?.panMaxDeg ?? PAN_DEFAULT_DEG, rep?.tiltMaxDeg ?? TILT_DEFAULT_DEG);
    mountDimmer(tile.querySelector('#lt-dim') as HTMLElement);
  }

  // ---- pan / tilt range box + numeric fields ----------------------------
  // panMaxDeg / tiltMaxDeg = the fixture's physical travel; the numeric fields
  // read out absolute degrees while the stored limit stays a coarse DMX byte.
  function mountMove(host: HTMLElement, canPan: boolean, canTilt: boolean, panMaxDeg: number, tiltMaxDeg: number) {
    const pan = lim.pan ?? { min: 0, max: 255, invert: false };
    const tilt = lim.tilt ?? { min: 0, max: 255, invert: false };
    const maxDegOf = (key: 'p' | 't') => (key === 'p' ? panMaxDeg : tiltMaxDeg);
    // An axis = an uppercase header with indented Min / Max degree rows; the value
    // boxes share a control column (matches the console "min/max stack" convention).
    const axisFields = (label: string, key: 'p' | 't') => `
      <div class="lt-axis">
        <div class="lt-axis-head">${label}</div>
        <div class="lt-row"><span class="lt-row-lbl">Min</span><input class="lt-num" data-k="${key}min" type="number" min="0" max="${maxDegOf(key)}" inputmode="numeric"><span class="lt-unit">°</span></div>
        <div class="lt-row"><span class="lt-row-lbl">Max</span><input class="lt-num" data-k="${key}max" type="number" min="0" max="${maxDegOf(key)}" inputmode="numeric"><span class="lt-unit">°</span></div>
      </div>`;
    // INVERT block — a row per reverse, each a pill toggle switch (the shared
    // `.sp-toggle`), aligned to the same control column as the value boxes.
    const togRow = (label: string, key: string, on: boolean, title: string) => `
      <div class="lt-row"><span class="lt-row-lbl">${label}</span>${toggleSwitch({ on, dataset: { tog: key }, title })}</div>`;
    // The allowed window is a crop box: a dashed rectangle with square grab
    // handles at its corners (drag both axes) and edge midpoints (drag one).
    const corners = canPan && canTilt
      ? '<div class="lt-h c-tl" data-edge="tl"></div><div class="lt-h c-tr" data-edge="tr"></div><div class="lt-h c-bl" data-edge="bl"></div><div class="lt-h c-br" data-edge="br"></div>'
      : '';
    host.innerHTML = `
      <div class="lt-sec-head">Pan / tilt range</div>
      <div class="lt-move">
        <div class="lt-xy" title="Drag the handles — pan / tilt motion is mapped into this window (no clipping)">
          <div class="lt-xy-win"></div>
          ${corners}
          ${canPan ? '<div class="lt-h e-l" data-edge="pl"></div><div class="lt-h e-r" data-edge="pr"></div>' : ''}
          ${canTilt ? '<div class="lt-h e-t" data-edge="tt"></div><div class="lt-h e-b" data-edge="tb"></div>' : ''}
        </div>
        <div class="lt-fields">
          ${canPan ? axisFields('Pan', 'p') : ''}
          ${canTilt ? axisFields('Tilt', 't') : ''}
          ${canPan || canTilt ? `<div class="lt-axis">
            <div class="lt-axis-head">Invert</div>
            ${canPan ? togRow('Pan', 'pinv', !!pan.invert, 'Reverse pan output') : ''}
            ${canTilt ? togRow('Tilt', 'tinv', !!tilt.invert, 'Reverse tilt output') : ''}
            ${canPan && canTilt ? togRow('Swap', 'swap', !!lim.swapPanTilt, 'Route pan output to the tilt channel & vice-versa') : ''}
          </div>` : ''}
        </div>
      </div>`;
    const xy = host.querySelector('.lt-xy') as HTMLElement;
    const win = host.querySelector('.lt-xy-win') as HTMLElement;
    const setNum = (k: string, v: number) => {
      const el = host.querySelector(`.lt-num[data-k="${k}"]`) as HTMLInputElement | null;
      if (el && document.activeElement !== el) el.value = String(v);
    };

    const place = () => {
      const p = lim.pan ?? { min: 0, max: 255 }, t = lim.tilt ?? { min: 0, max: 255 };
      const l = (p.min / 255) * 100, r = (p.max / 255) * 100;
      const top = (1 - t.max / 255) * 100, bot = (1 - t.min / 255) * 100;   // tilt 255 = top
      const midX = (l + r) / 2, midY = (top + bot) / 2;
      win.style.left = `${l}%`; win.style.width = `${Math.max(0, r - l)}%`;
      win.style.top = `${top}%`; win.style.height = `${Math.max(0, bot - top)}%`;
      // Each handle sits on the rectangle: corners at its vertices, edge handles
      // at the midpoints (CSS centres the square on the point via translate).
      const at: Record<string, [number, number]> = {
        pl: [l, midY], pr: [r, midY], tt: [midX, top], tb: [midX, bot],
        tl: [l, top], tr: [r, top], bl: [l, bot], br: [r, bot],
      };
      host.querySelectorAll<HTMLElement>('.lt-h').forEach((e) => {
        const c = at[e.dataset.edge ?? ''];
        if (c) { e.style.left = `${c[0]}%`; e.style.top = `${c[1]}%`; }
      });
      setNum('pmin', toDeg(p.min, panMaxDeg)); setNum('pmax', toDeg(p.max, panMaxDeg));
      setNum('tmin', toDeg(t.min, tiltMaxDeg)); setNum('tmax', toDeg(t.max, tiltMaxDeg));
    };
    place();

    // Which pan/tilt edge each handle drives ('min'/'max'); corners drive one of each.
    const HANDLE: Record<string, { p?: 'min' | 'max'; t?: 'min' | 'max' }> = {
      pl: { p: 'min' }, pr: { p: 'max' }, tt: { t: 'max' }, tb: { t: 'min' },
      tl: { p: 'min', t: 'max' }, tr: { p: 'max', t: 'max' },
      bl: { p: 'min', t: 'min' }, br: { p: 'max', t: 'min' },
    };

    // Apply a handle drag: write its pan and/or tilt edge (keeping min ≤ max),
    // persist only the axes it touched, then re-place. `panByte`/`tiltByte` null = leave that axis.
    const setHandle = (key: string, panByte: number | null, tiltByte: number | null) => {
      const h = HANDLE[key]; if (!h) return;
      const patch: Record<string, unknown> = {};
      if (h.p && panByte != null) {
        const p = { ...(lim.pan ?? { min: 0, max: 255, invert: false }) };
        if (h.p === 'min') p.min = Math.min(panByte, p.max); else p.max = Math.max(panByte, p.min);
        lim.pan = p; patch.pan = p;
      }
      if (h.t && tiltByte != null) {
        const t = { ...(lim.tilt ?? { min: 0, max: 255, invert: false }) };
        if (h.t === 'min') t.min = Math.min(tiltByte, t.max); else t.max = Math.max(tiltByte, t.min);
        lim.tilt = t; patch.tilt = t;
      }
      if (Object.keys(patch).length) apply(patch);
      place();
    };

    let drag: string | null = null;
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const rect = xy.getBoundingClientRect();
      const panByte = clampB(((e.clientX - rect.left) / rect.width) * 255);
      const tiltByte = clampB((1 - (e.clientY - rect.top) / rect.height) * 255);   // invert Y → tilt
      setHandle(drag, panByte, tiltByte);
    };
    const end = () => { drag = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); };
    host.querySelectorAll<HTMLElement>('.lt-h').forEach((e) => e.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      drag = e.dataset.edge!;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
    }));

    // Drag INSIDE the window to translate the whole allowed region (move pan+tilt
    // together, keeping its size) — clamped so it stays within the 0..255 pad.
    let winDrag: { x: number; y: number; pan: typeof pan; tilt: typeof tilt } | null = null;
    const shift = (a: { min: number; max: number; invert?: boolean }, d: number) => {
      const w = a.max - a.min;
      let min = a.min + d;
      if (min < 0) min = 0;
      if (min + w > 255) min = 255 - w;
      return { ...a, min: clampB(min), max: clampB(min + w) };
    };
    const onWinMove = (e: PointerEvent) => {
      if (!winDrag) return;
      const rect = xy.getBoundingClientRect();
      const p = shift(winDrag.pan, ((e.clientX - winDrag.x) / rect.width) * 255);
      const t = shift(winDrag.tilt, -((e.clientY - winDrag.y) / rect.height) * 255);   // up = +tilt
      lim.pan = p; lim.tilt = t;
      apply({ pan: p, tilt: t });
      place();
    };
    const winEnd = () => { winDrag = null; window.removeEventListener('pointermove', onWinMove); window.removeEventListener('pointerup', winEnd); };
    win.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      winDrag = {
        x: ev.clientX, y: ev.clientY,
        pan: { ...(lim.pan ?? { min: 0, max: 255, invert: false }) },
        tilt: { ...(lim.tilt ?? { min: 0, max: 255, invert: false }) },
      };
      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', winEnd);
    });

    // Typed degree fields — `pmin`/`pmax`/`tmin`/`tmax` map onto the matching edge handle.
    host.querySelectorAll<HTMLInputElement>('.lt-num').forEach((el) => el.addEventListener('change', () => {
      const k = el.dataset.k as string;            // e.g. 'pmin' → handle 'pl', 'tmax' → 'tt'
      const key = k[0] + (k.endsWith('min') ? (k[0] === 'p' ? 'l' : 'b') : (k[0] === 'p' ? 'r' : 't'));
      const byte = degToByte(Number(el.value), maxDegOf(k[0] as 'p' | 't'));
      if (k[0] === 'p') setHandle(key, byte, null); else setHandle(key, null, byte);
    }));

    host.querySelectorAll<HTMLElement>('[data-tog]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.tog;
      if (k === 'pinv') { const p = { ...(lim.pan ?? { min: 0, max: 255 }), invert: !(lim.pan?.invert) }; lim.pan = p; apply({ pan: p }); }
      else if (k === 'tinv') { const t = { ...(lim.tilt ?? { min: 0, max: 255 }), invert: !(lim.tilt?.invert) }; lim.tilt = t; apply({ tilt: t }); }
      else if (k === 'swap') { lim.swapPanTilt = !lim.swapPanTilt; apply({ swapPanTilt: lim.swapPanTilt ? true : null }); }
      const on = b.classList.toggle('on');
      b.setAttribute('aria-checked', String(on));
    }));
  }

  // ---- max-brightness cap (100 % = uncapped) ----------------------------
  // A vertical fader — the primary lighting-console gesture: the fill rises from
  // the bottom to the cap handle; 100 % (top) means no cap.
  function mountDimmer(host: HTMLElement) {
    host.innerHTML = `
      <div class="lt-sec-head">Max brightness</div>
      <div class="lt-dim">
        <div class="lt-vbar" title="Drag to cap maximum brightness (100% = no cap)">
          <div class="lt-vbar-fill"></div>
          <div class="lt-vbar-cap"></div>
        </div>
        <div class="lt-dim-foot">
          <input class="lt-num lt-dim-num" type="number" min="0" max="100" inputmode="numeric">
          <span class="lt-unit">%</span>
        </div>
      </div>`;
    const dim = host.querySelector('.lt-dim') as HTMLElement;
    const bar = host.querySelector('.lt-vbar') as HTMLElement;
    const fill = host.querySelector('.lt-vbar-fill') as HTMLElement;
    const cap = host.querySelector('.lt-vbar-cap') as HTMLElement;
    const num = host.querySelector('.lt-dim-num') as HTMLInputElement;

    const place = () => {
      const capped = !!lim.dimmer;
      const p = toPct(lim.dimmer?.max ?? 255);
      fill.style.height = `${p}%`;
      cap.style.top = `${100 - p}%`;
      cap.style.display = capped ? '' : 'none';
      dim.classList.toggle('uncapped', !capped);
      if (document.activeElement !== num) num.value = String(p);
    };
    place();

    // 100 % clears the cap entirely; anything lower stores a ceiling byte.
    const setCap = (pct: number) => {
      const p = clampP(pct);
      if (p >= 100) { lim.dimmer = undefined; apply({ dimmer: null }); }
      else { const m = toByte(p); lim.dimmer = { max: m }; apply({ dimmer: { max: m } }); }
      place();
    };

    let dragging = false;
    const set = (e: PointerEvent) => { const rect = bar.getBoundingClientRect(); setCap((1 - (e.clientY - rect.top) / rect.height) * 100); };
    bar.addEventListener('pointerdown', (e) => { e.preventDefault(); dragging = true; set(e); bar.setPointerCapture(e.pointerId); });
    bar.addEventListener('pointermove', (e) => { if (dragging) set(e); });
    bar.addEventListener('pointerup', () => { dragging = false; });
    num.addEventListener('change', () => setCap(Number(num.value)));
  }

  clearBtn.addEventListener('click', () => { if (ids.length) { void lumox.fixtures.clearLimits(ids); void reload(); } });

  // React to the shared fixture selection (stage / patch grid / main).
  bus.on(EV.FIXTURE_SELECTED, (d: { ids: string[] }) => { if (d) void reload(d.ids); });
  // A patch change can prune the selection / change addresses — re-read.
  bus.on(EV.PATCH_CHANGED, () => void reload());

  try { ids = await lumox.selection.get(); } catch { ids = []; }
  await reload();
  return { tile, refresh: reload };
}
