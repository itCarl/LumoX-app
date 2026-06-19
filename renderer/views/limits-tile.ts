// Fixture Limits tile (SETUP view, bottom-right) — a visual editor for the
// per-fixture output limits that the engine's `Limits` post-mix stage applies
// (see docs/knowledge-base/limits.md). Operates on the live fixture selection
// (stage / patch grid): seeds from the first selected fixture and writes to the
// whole selection via `lumox.fixtures.setLimits` / `setChannelFlag`.
//
// Visual model — every value is shown as a friendly 0–100 % (stored as DMX bytes):
//   - Pan / tilt range: a 2D box whose inner rectangle is the allowed movement
//     window (drag the edges) PLUS editable min/max % fields, with invert + swap;
//   - Max brightness: a horizontal cap bar + a % field (100 % = uncapped);
//   - a per-channel Fade / Dim flag list.

import { bus, EV } from '../lib/bus';
import { html, mount, raw } from '../lib/dom';
import { esc } from '../lib/html';

const { lumox } = window;

const INTENSITY = new Set(['intensity', 'intensity-master', 'dimmer']);
const hasType = (fx: any, pred: (t: string) => boolean): boolean => (fx.channels as any[]).some((c) => c.typeId && pred(c.typeId));
const clampB = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clampP = (v: number): number => (v < 0 ? 0 : v > 100 ? 100 : Math.round(v));
const toPct = (byte: number): number => Math.round((byte / 255) * 100);   // DMX byte → 0–100 %
const toByte = (pct: number): number => clampB((clampP(pct) / 100) * 255);  // 0–100 % → DMX byte

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
  const flag = (channel: number, f: 'fade' | 'dimmer', value: boolean | null) => { void lumox.fixtures.setChannelFlag(ids, channel, f, value); };

  async function reload(next?: string[]) {
    if (next) ids = next;
    let all: any[] = [];
    try { all = await lumox.patch.list(); } catch { all = []; }
    targets = all.filter((f) => ids.includes(f.id));
    lim = { ...(targets[0]?.limits ?? {}) } as Limits;
    render();
  }

  function render() {
    // Toggle via visibility (not display) so the button keeps its box — otherwise
    // the header height changes between empty/populated and shifts the body down.
    clearBtn.style.visibility = targets.length ? '' : 'hidden';
    if (!targets.length) {
      selEl.textContent = '';
      body.set(html`<div class="lt-empty"><i class="fa-solid fa-arrow-pointer"></i><span>Select fixtures on the stage or patch grid to set limits.</span></div>`);
      return;
    }
    selEl.textContent = targets.length === 1 ? targets[0].name : `${targets.length} fixtures`;

    const canDim = targets.some((f) => hasType(f, (t) => INTENSITY.has(t)));
    const canPan = targets.some((f) => hasType(f, (t) => t === 'pan'));
    const canTilt = targets.some((f) => hasType(f, (t) => t === 'tilt'));
    const rep = targets[0];

    body.set(html`
      <div class="lt-sections">
        ${canPan || canTilt ? raw(`<section class="lt-sec" id="lt-move"></section>`) : ''}
        ${canDim ? raw(`<section class="lt-sec" id="lt-dim"></section>`) : ''}
        <section class="lt-sec" id="lt-chans"></section>
      </div>`);

    if (canPan || canTilt) mountMove(tile.querySelector('#lt-move') as HTMLElement, canPan, canTilt);
    if (canDim) mountDimmer(tile.querySelector('#lt-dim') as HTMLElement);
    mountChannels(tile.querySelector('#lt-chans') as HTMLElement, rep);
  }

  // ---- pan / tilt range box + numeric fields ----------------------------
  function mountMove(host: HTMLElement, canPan: boolean, canTilt: boolean) {
    const pan = lim.pan ?? { min: 0, max: 255, invert: false };
    const tilt = lim.tilt ?? { min: 0, max: 255, invert: false };
    const fieldRow = (label: string, key: 'p' | 't', inv: boolean | undefined, arrow: string) => `
      <div class="lt-field">
        <span class="lt-field-lbl">${label}</span>
        <input class="lt-num" data-k="${key}min" type="number" min="0" max="100" inputmode="numeric">
        <span class="lt-dash">–</span>
        <input class="lt-num" data-k="${key}max" type="number" min="0" max="100" inputmode="numeric">
        <span class="lt-unit">%</span>
        <button class="lt-tog lt-inv${inv ? ' on' : ''}" data-tog="${key}inv" title="Invert ${label.toLowerCase()}">${arrow}</button>
      </div>`;
    host.innerHTML = `
      <div class="lt-sec-head">Pan / tilt range</div>
      <div class="lt-move">
        <div class="lt-xy" title="Drag the edges — pan / tilt motion is mapped into this window (no clipping)">
          <div class="lt-xy-win"></div>
          ${canPan ? '<div class="lt-edge e-l" data-edge="pl"></div><div class="lt-edge e-r" data-edge="pr"></div>' : ''}
          ${canTilt ? '<div class="lt-edge e-t" data-edge="tt"></div><div class="lt-edge e-b" data-edge="tb"></div>' : ''}
        </div>
        <div class="lt-fields">
          ${canPan ? fieldRow('Pan', 'p', pan.invert, '⇄') : ''}
          ${canTilt ? fieldRow('Tilt', 't', tilt.invert, '⇅') : ''}
          ${canPan && canTilt ? `<button class="lt-tog lt-wide${lim.swapPanTilt ? ' on' : ''}" data-tog="swap" title="Route pan output to the tilt channel & vice-versa">⤬ Swap pan / tilt</button>` : ''}
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
      win.style.left = `${l}%`; win.style.width = `${Math.max(0, r - l)}%`;
      win.style.top = `${top}%`; win.style.height = `${Math.max(0, bot - top)}%`;
      host.querySelectorAll<HTMLElement>('.lt-edge').forEach((e) => {
        const k = e.dataset.edge;
        if (k === 'pl') e.style.left = `${l}%`;
        else if (k === 'pr') e.style.left = `${r}%`;
        else if (k === 'tt') e.style.top = `${top}%`;
        else if (k === 'tb') e.style.top = `${bot}%`;
      });
      setNum('pmin', toPct(p.min)); setNum('pmax', toPct(p.max));
      setNum('tmin', toPct(t.min)); setNum('tmax', toPct(t.max));
    };
    place();

    // Write a pan/tilt edge to `byte`, keeping min ≤ max, then persist + re-place.
    const setEdge = (edge: string, byte: number) => {
      const p = { ...(lim.pan ?? { min: 0, max: 255, invert: false }) };
      const t = { ...(lim.tilt ?? { min: 0, max: 255, invert: false }) };
      if (edge === 'pl') p.min = Math.min(byte, p.max);
      else if (edge === 'pr') p.max = Math.max(byte, p.min);
      else if (edge === 'tt') t.max = Math.max(byte, t.min);
      else if (edge === 'tb') t.min = Math.min(byte, t.max);
      if (edge[0] === 'p') { lim.pan = p; apply({ pan: p }); }
      else { lim.tilt = t; apply({ tilt: t }); }
      place();
    };

    let drag: string | null = null;
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const rect = xy.getBoundingClientRect();
      const byte = drag[0] === 'p'
        ? clampB(((e.clientX - rect.left) / rect.width) * 255)
        : clampB((1 - (e.clientY - rect.top) / rect.height) * 255);   // invert Y → tilt
      setEdge(drag, byte);
    };
    const end = () => { drag = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); };
    host.querySelectorAll<HTMLElement>('.lt-edge').forEach((e) => e.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      drag = e.dataset.edge!;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
    }));

    // Typed % fields — `pmin`/`pmax`/`tmin`/`tmax` map straight onto the same edges.
    host.querySelectorAll<HTMLInputElement>('.lt-num').forEach((el) => el.addEventListener('change', () => {
      const k = el.dataset.k as string;            // e.g. 'pmin' → edge 'pl', 'pmax' → 'pr'
      const edge = k[0] + (k.endsWith('min') ? (k[0] === 'p' ? 'l' : 'b') : (k[0] === 'p' ? 'r' : 't'));
      setEdge(edge, toByte(Number(el.value)));
    }));

    host.querySelectorAll<HTMLElement>('[data-tog]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.tog;
      if (k === 'pinv') { const p = { ...(lim.pan ?? { min: 0, max: 255 }), invert: !(lim.pan?.invert) }; lim.pan = p; apply({ pan: p }); }
      else if (k === 'tinv') { const t = { ...(lim.tilt ?? { min: 0, max: 255 }), invert: !(lim.tilt?.invert) }; lim.tilt = t; apply({ tilt: t }); }
      else if (k === 'swap') { lim.swapPanTilt = !lim.swapPanTilt; apply({ swapPanTilt: lim.swapPanTilt ? true : null }); }
      b.classList.toggle('on');
    }));
  }

  // ---- max-brightness cap (100 % = uncapped) ----------------------------
  function mountDimmer(host: HTMLElement) {
    host.innerHTML = `
      <div class="lt-sec-head">Max brightness</div>
      <div class="lt-dim">
        <div class="lt-hbar" title="Drag to cap maximum brightness (100% = no cap)">
          <div class="lt-hbar-fill"></div>
          <div class="lt-hbar-cap"></div>
        </div>
        <input class="lt-num lt-dim-num" type="number" min="0" max="100" inputmode="numeric">
        <span class="lt-unit">%</span>
      </div>`;
    const dim = host.querySelector('.lt-dim') as HTMLElement;
    const bar = host.querySelector('.lt-hbar') as HTMLElement;
    const fill = host.querySelector('.lt-hbar-fill') as HTMLElement;
    const cap = host.querySelector('.lt-hbar-cap') as HTMLElement;
    const num = host.querySelector('.lt-dim-num') as HTMLInputElement;

    const place = () => {
      const capped = !!lim.dimmer;
      const p = toPct(lim.dimmer?.max ?? 255);
      fill.style.width = `${p}%`;
      cap.style.left = `${p}%`;
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
    const set = (e: PointerEvent) => { const rect = bar.getBoundingClientRect(); setCap(((e.clientX - rect.left) / rect.width) * 100); };
    bar.addEventListener('pointerdown', (e) => { e.preventDefault(); dragging = true; set(e); bar.setPointerCapture(e.pointerId); });
    bar.addEventListener('pointermove', (e) => { if (dragging) set(e); });
    bar.addEventListener('pointerup', () => { dragging = false; });
    num.addEventListener('change', () => setCap(Number(num.value)));
  }

  // ---- per-channel flags -------------------------------------------------
  function mountChannels(host: HTMLElement, rep: any) {
    const flags = (rep.channelFlags ?? {}) as Record<number, { fade?: boolean; dimmer?: boolean }>;
    host.innerHTML = `<div class="lt-sec-head">Channels</div><div class="lt-chans">` + (rep.channels as any[]).map((c) => {
      const f = flags[c.index] ?? {};
      const isInt = INTENSITY.has(c.typeId);
      return `<div class="lt-chan">
        <span class="lt-chan-name">${esc(c.name)}</span>
        <button class="lt-pill${f.fade !== false ? ' on' : ''}" data-ch="${c.index}" data-flag="fade" title="Fades on scene changes (off = snaps)">Fade</button>
        ${isInt ? '' : `<button class="lt-pill${f.dimmer === true ? ' on' : ''}" data-ch="${c.index}" data-flag="dimmer" title="Output follows the fixture's dimmer">Dim</button>`}
      </div>`;
    }).join('') + `</div>`;
    host.querySelectorAll<HTMLElement>('.lt-pill').forEach((b) => b.addEventListener('click', () => {
      const ch = Number(b.dataset.ch), f = b.dataset.flag as 'fade' | 'dimmer';
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      if (f === 'fade') flag(ch, 'fade', on ? null : false);   // on = fades (default) → clear; off = snap → false
      else flag(ch, 'dimmer', on ? true : null);
    }));
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
