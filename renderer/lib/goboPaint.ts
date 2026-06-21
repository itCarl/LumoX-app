// goboPaint.ts — a small "paint" modal for drawing a gobo's mono icon. Opens an
// in-app overlay (the fixture editor is its own window) with a GOBO_GRID² grid you
// click-and-drag to fill, plus Clear / Invert and a live preview. Resolves to the
// encoded pattern string (see src/fixtures/goboPattern.ts) on Apply, or null on
// Cancel. White-on-dark cells, circular guide — it draws what the GOBO fader shows.

import { GOBO_GRID, encodeGobo, decodeGobo } from '../../src/fixtures/goboPattern';
import { goboSvg } from './gobo';

const CELLS = GOBO_GRID * GOBO_GRID;

// Resolves to the encoded pattern on Apply (or null when the grid is cleared), or
// `undefined` on Cancel/Escape so the caller can leave an existing gobo untouched.
export function openGoboPaint(initial: string | null): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    const bits = decodeGobo(initial);

    const overlay = document.createElement('div');
    overlay.className = 'gp-overlay';
    overlay.innerHTML = `
      <div class="gp-card" role="dialog" aria-label="Draw gobo">
        <div class="gp-head">Draw gobo</div>
        <div class="gp-body">
          <div class="gp-grid" id="gp-grid" style="--n:${GOBO_GRID}">
            ${Array.from({ length: CELLS }, (_, i) =>
              `<i class="gp-cell${bits[i] ? ' on' : ''}" data-i="${i}"></i>`).join('')}
            <span class="gp-guide"></span>
          </div>
          <div class="gp-side">
            <div class="gp-preview" id="gp-preview"></div>
            <p class="gp-hint">Click & drag to draw. The circle is the gobo slot.</p>
            <div class="gp-tools">
              <button class="lx-btn lx-btn-ghost" id="gp-clear">Clear</button>
              <button class="lx-btn lx-btn-ghost" id="gp-invert">Invert</button>
            </div>
          </div>
        </div>
        <div class="gp-foot">
          <button class="lx-btn lx-btn-ghost" id="gp-cancel">Cancel</button>
          <button class="lx-btn lx-btn-primary" id="gp-apply">Apply</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const grid = overlay.querySelector('#gp-grid') as HTMLElement;
    const preview = overlay.querySelector('#gp-preview') as HTMLElement;
    const cellEls = [...grid.querySelectorAll<HTMLElement>('.gp-cell')];

    const refreshPreview = () => {
      preview.innerHTML = goboSvg(encodeGobo(bits), 96) || '<span class="gp-empty">empty</span>';
    };
    const setCell = (i: number, on: boolean) => {
      if (bits[i] === on) return;
      bits[i] = on;
      cellEls[i].classList.toggle('on', on);
      refreshPreview();
    };
    refreshPreview();

    // Drag-paint: the first cell decides whether this stroke paints or erases.
    let painting = false;
    let strokeOn = true;
    const cellFrom = (e: PointerEvent): number => {
      const el = (e.target as HTMLElement)?.closest('.gp-cell') as HTMLElement | null;
      return el ? Number(el.dataset.i) : -1;
    };
    grid.addEventListener('pointerdown', (e) => {
      const i = cellFrom(e);
      if (i < 0) return;
      e.preventDefault();
      painting = true;
      strokeOn = !bits[i];
      setCell(i, strokeOn);
      try { grid.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. synthetic event) */ }
    });
    grid.addEventListener('pointermove', (e) => {
      if (!painting) return;
      // setPointerCapture retargets events to the grid, so hit-test by coordinate.
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.gp-cell') as HTMLElement | null;
      if (el) setCell(Number(el.dataset.i), strokeOn);
    });
    const endStroke = () => { painting = false; };
    grid.addEventListener('pointerup', endStroke);
    grid.addEventListener('pointercancel', endStroke);

    overlay.querySelector('#gp-clear')!.addEventListener('click', () => {
      for (let i = 0; i < CELLS; i++) setCell(i, false);
    });
    overlay.querySelector('#gp-invert')!.addEventListener('click', () => {
      for (let i = 0; i < CELLS; i++) setCell(i, !bits[i]);
    });

    const close = (result: string | null | undefined) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    };
    const apply = () => close(bits.some(Boolean) ? encodeGobo(bits) : null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(undefined);
      else if (e.key === 'Enter') apply();
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(undefined); });
    overlay.querySelector('#gp-cancel')!.addEventListener('click', () => close(undefined));
    overlay.querySelector('#gp-apply')!.addEventListener('click', apply);
  });
}
