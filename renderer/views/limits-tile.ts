// Fixture Limits tile (SETUP view, bottom-right) — a visual editor for the
// per-fixture output limits that the engine's `Limits` post-mix stage applies
// (see docs/knowledge-base/limits.md). Operates on the live fixture selection
// (stage / patch grid): seeds from the first selected fixture and writes to the
// whole selection via `lumox.fixtures.setLimits` / `setChannelFlag`.
//
// Visual model:
//   - a 2D pan×tilt box whose inner rectangle is the allowed movement window;
//     drag the edges to set min/max, with invert + swap toggles beneath it;
//   - a vertical dimmer-cap bar (drag the cap down to clamp brightness);
//   - a per-channel Fade / Dimmer flag list.

import { bus, EV } from '../lib/bus';
import { html, mount, raw } from '../lib/dom';
import { esc } from '../lib/html';

const { lumox } = window;

const INTENSITY = new Set(['intensity', 'intensity-master', 'dimmer']);
const hasType = (fx: any, pred: (t: string) => boolean): boolean => (fx.channels as any[]).some((c) => c.typeId && pred(c.typeId));
const clampB = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

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
    clearBtn.style.display = targets.length ? '' : 'none';
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
      <div class="lt-grid">
        ${canPan || canTilt ? raw(`<div class="lt-move" id="lt-move"></div>`) : ''}
        ${canDim ? raw(`<div class="lt-dim" id="lt-dim"></div>`) : ''}
      </div>
      <div class="lt-chans" id="lt-chans"></div>`);

    if (canPan || canTilt) mountMove(tile.querySelector('#lt-move') as HTMLElement, canPan, canTilt);
    if (canDim) mountDimmer(tile.querySelector('#lt-dim') as HTMLElement);
    mountChannels(tile.querySelector('#lt-chans') as HTMLElement, rep);
  }

  // ---- pan / tilt range box ---------------------------------------------
  function mountMove(host: HTMLElement, canPan: boolean, canTilt: boolean) {
    const pan = lim.pan ?? { min: 0, max: 255, invert: false };
    const tilt = lim.tilt ?? { min: 0, max: 255, invert: false };
    host.innerHTML = `
      <div class="lt-xy" title="Drag the edges — pan / tilt motion is mapped into this window (no clipping)">
        <div class="lt-xy-win"></div>
        ${canPan ? '<div class="lt-edge e-l" data-edge="pl"></div><div class="lt-edge e-r" data-edge="pr"></div>' : ''}
        ${canTilt ? '<div class="lt-edge e-t" data-edge="tt"></div><div class="lt-edge e-b" data-edge="tb"></div>' : ''}
        <span class="lt-xy-lbl tl"></span><span class="lt-xy-lbl br"></span>
      </div>
      <div class="lt-move-row">
        ${canPan ? `<button class="lt-tog${pan.invert ? ' on' : ''}" data-tog="pinv">⇄ Pan</button>` : ''}
        ${canTilt ? `<button class="lt-tog${tilt.invert ? ' on' : ''}" data-tog="tinv">⇅ Tilt</button>` : ''}
        ${canPan && canTilt ? `<button class="lt-tog${lim.swapPanTilt ? ' on' : ''}" data-tog="swap" title="Route pan output to the tilt channel & vice-versa">⤬ Swap</button>` : ''}
      </div>`;
    const xy = host.querySelector('.lt-xy') as HTMLElement;
    const win = host.querySelector('.lt-xy-win') as HTMLElement;
    const lblTL = host.querySelector('.lt-xy-lbl.tl') as HTMLElement;
    const lblBR = host.querySelector('.lt-xy-lbl.br') as HTMLElement;

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
      lblTL.textContent = canPan ? `P ${p.min}–${p.max}` : '';
      lblBR.textContent = canTilt ? `T ${t.min}–${t.max}` : '';
    };
    place();

    let drag: string | null = null;
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const rect = xy.getBoundingClientRect();
      const fx = clampB(((e.clientX - rect.left) / rect.width) * 255);
      const fy = clampB((1 - (e.clientY - rect.top) / rect.height) * 255);   // invert Y → tilt
      const p = { ...(lim.pan ?? { min: 0, max: 255, invert: false }) };
      const t = { ...(lim.tilt ?? { min: 0, max: 255, invert: false }) };
      if (drag === 'pl') p.min = Math.min(fx, p.max);
      else if (drag === 'pr') p.max = Math.max(fx, p.min);
      else if (drag === 'tt') t.max = Math.max(fy, t.min);
      else if (drag === 'tb') t.min = Math.min(fy, t.max);
      if (drag[0] === 'p') { lim.pan = p; apply({ pan: p }); }
      else { lim.tilt = t; apply({ tilt: t }); }
      place();
    };
    const end = () => { drag = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); };
    host.querySelectorAll<HTMLElement>('.lt-edge').forEach((e) => e.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      drag = e.dataset.edge!;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
    }));

    host.querySelectorAll<HTMLElement>('[data-tog]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.tog;
      if (k === 'pinv') { const p = { ...(lim.pan ?? { min: 0, max: 255 }), invert: !(lim.pan?.invert) }; lim.pan = p; apply({ pan: p }); }
      else if (k === 'tinv') { const t = { ...(lim.tilt ?? { min: 0, max: 255 }), invert: !(lim.tilt?.invert) }; lim.tilt = t; apply({ tilt: t }); }
      else if (k === 'swap') { lim.swapPanTilt = !lim.swapPanTilt; apply({ swapPanTilt: lim.swapPanTilt ? true : null }); }
      b.classList.toggle('on');
    }));
  }

  // ---- dimmer cap bar ----------------------------------------------------
  function mountDimmer(host: HTMLElement) {
    const capped = !!lim.dimmer;
    const max = lim.dimmer?.max ?? 255;
    host.innerHTML = `
      <div class="lt-dim-head">Dimmer cap</div>
      <div class="lt-bar" title="Drag to cap maximum brightness">
        <div class="lt-bar-fill"></div>
        <div class="lt-bar-cap"></div>
      </div>
      <div class="lt-dim-val">${capped ? max : '—'}</div>`;
    const bar = host.querySelector('.lt-bar') as HTMLElement;
    const fill = host.querySelector('.lt-bar-fill') as HTMLElement;
    const cap = host.querySelector('.lt-bar-cap') as HTMLElement;
    const val = host.querySelector('.lt-dim-val') as HTMLElement;
    const place = () => { const m = lim.dimmer?.max ?? 255; const pct = (m / 255) * 100; fill.style.height = `${pct}%`; cap.style.bottom = `${pct}%`; val.textContent = lim.dimmer ? String(m) : '—'; };
    place();
    let dragging = false;
    const set = (e: PointerEvent) => {
      const rect = bar.getBoundingClientRect();
      const m = clampB((1 - (e.clientY - rect.top) / rect.height) * 255);
      lim.dimmer = { max: m };
      apply({ dimmer: { max: m } });
      place();
    };
    bar.addEventListener('pointerdown', (e) => { e.preventDefault(); dragging = true; set(e); bar.setPointerCapture(e.pointerId); });
    bar.addEventListener('pointermove', (e) => { if (dragging) set(e); });
    bar.addEventListener('pointerup', () => { dragging = false; });
  }

  // ---- per-channel flags -------------------------------------------------
  function mountChannels(host: HTMLElement, rep: any) {
    const flags = (rep.channelFlags ?? {}) as Record<number, { fade?: boolean; dimmer?: boolean }>;
    host.innerHTML = `<div class="lt-chans-head">Channels</div>` + (rep.channels as any[]).map((c) => {
      const f = flags[c.index] ?? {};
      const isInt = INTENSITY.has(c.typeId);
      return `<div class="lt-chan">
        <span class="lt-chan-name">${esc(c.name)}</span>
        <button class="lt-pill${f.fade !== false ? ' on' : ''}" data-ch="${c.index}" data-flag="fade" title="Fades on scene changes (off = snaps)">Fade</button>
        ${isInt ? '' : `<button class="lt-pill${f.dimmer === true ? ' on' : ''}" data-ch="${c.index}" data-flag="dimmer" title="Output follows the fixture's dimmer">Dim</button>`}
      </div>`;
    }).join('');
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
