// Create matrix / strip — a small form that generates a multi-cell RGB(W)
// fixture from a width × height grid and saves it to the Custom library (via
// lumox.library.createMatrix). Shown in the generic panel WINDOW (panel-window.ts).
// The signature element is a live pixel-grid preview that redraws as the grid /
// colour change, so the operator sees the matrix they're about to patch. The new
// fixture then patches through the normal library → patch-grid flow.
// See docs/knowledge-base/fixtures.md (matrix/strip creation).

import { node, html } from '../lib/dom';
import { button, input } from '../lib/widgets';
import type { MatrixGenOptions } from '../lumox.d';

const { lumox } = window;

const MAX_SIDE = 64;
const MAX_CH = 512;

/** Open the create-matrix panel window. */
export function openCreateMatrixModal(): void {
  void lumox.panel.open({ kind: 'create-matrix', title: 'Create matrix / strip', width: 460, height: 560 });
}

interface State {
  shape: 'matrix' | 'strip';
  width: number;
  height: number;
  color: 'rgb' | 'rgbw';
  cellDimmer: boolean;
  masterDimmer: boolean;
  name: string;
  nameEdited: boolean;
}

function perCell(s: State): number { return 3 + (s.color === 'rgbw' ? 1 : 0) + (s.cellDimmer ? 1 : 0); }
function cellCount(s: State): number { return s.width * (s.shape === 'strip' ? 1 : s.height); }
function totalCh(s: State): number { return (s.masterDimmer ? 1 : 0) + cellCount(s) * perCell(s); }

function autoName(s: State): string {
  const c = s.color === 'rgbw' ? 'RGBW' : 'RGB';
  return s.shape === 'strip' ? `Strip ${s.width} ${c}` : `Matrix ${s.width}x${s.height} ${c}`;
}

/** Build the create-matrix form body — mounted into the panel window. */
export async function buildCreateMatrixBody(): Promise<HTMLElement> {
  const s: State = {
    shape: 'matrix', width: 10, height: 5, color: 'rgb',
    cellDimmer: false, masterDimmer: false, name: '', nameEdited: false,
  };

  const body = node(html`<div class="lx-form cm-form"></div>`);

  // ---- Shape segmented control ----
  const seg = node(html`<div class="cm-seg" role="tablist">
    <button data-shape="matrix" role="tab">Matrix</button>
    <button data-shape="strip" role="tab">Strip</button>
  </div>`);

  // ---- Size: W × H ----
  const widthEl = input({ type: 'number', value: '10', className: 'lx-num cm-num' });
  const heightEl = input({ type: 'number', value: '5', className: 'lx-num cm-num' });
  widthEl.min = heightEl.min = '1'; widthEl.max = heightEl.max = String(MAX_SIDE);
  const sizeRow = node(html`<div class="cm-size"></div>`);
  sizeRow.append(widthEl, node(html`<span class="cm-x">×</span>`), heightEl);

  // ---- Colour select ----
  const colorSel = node(html`<select class="lx-select">
    <option value="rgb">RGB</option><option value="rgbw">RGBW</option>
  </select>`) as HTMLSelectElement;

  // ---- Dimmer checks ----
  const cellDimEl = node(html`<label class="lx-check"><input type="checkbox"> Per-cell dimmer</label>`);
  const masterDimEl = node(html`<label class="lx-check"><input type="checkbox"> Master dimmer</label>`);
  const cellDimCb = cellDimEl.querySelector('input') as HTMLInputElement;
  const masterDimCb = masterDimEl.querySelector('input') as HTMLInputElement;
  const dimRow = node(html`<div class="cm-dims"></div>`);
  dimRow.append(cellDimEl, masterDimEl);

  // ---- Name ----
  const nameEl = input({ type: 'text', className: 'lx-input cm-name', placeholder: autoName(s) });

  // ---- Preview + readout + create ----
  const preview = node(html`<div class="cm-preview"></div>`);
  const readout = node(html`<div class="cm-readout"></div>`);
  const createBtn = button({ variant: 'primary', label: 'Create', className: 'cm-create' });
  const footer = node(html`<div class="cm-foot"></div>`);
  footer.append(readout, createBtn);

  const labelRow = (label: string, ctl: HTMLElement) => {
    const r = node(html`<div class="lx-form-row"><label>${label}</label><div class="lx-form-ctl"></div></div>`);
    (r.querySelector('.lx-form-ctl') as HTMLElement).appendChild(ctl);
    return r;
  };

  body.append(
    labelRow('Shape', seg),
    labelRow('Size', sizeRow),
    labelRow('Colour', colorSel),
    labelRow('Dimmers', dimRow),
    labelRow('Name', nameEl),
    preview,
    footer,
  );

  // ---- live render ----
  function drawPreview(): void {
    const cols = Math.max(1, Math.min(MAX_SIDE, s.width | 0));
    const rows = s.shape === 'strip' ? 1 : Math.max(1, Math.min(MAX_SIDE, s.height | 0));
    preview.style.setProperty('--cm-cols', String(cols));
    let cells = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Diagonal hue ramp — evokes a pixel-mapped gradient across the grid.
        const t = (c + r) / Math.max(1, cols + rows - 2);
        const hue = Math.round(t * 290);
        cells += `<i style="background:hsl(${hue} 70% 55%)"></i>`;
      }
    }
    preview.innerHTML = `<div class="cm-grid">${cells}</div>`;
  }

  function render(): void {
    // Strip → height is fixed at 1 and disabled (greyed, not hidden — no jump).
    const strip = s.shape === 'strip';
    heightEl.disabled = strip;
    heightEl.classList.toggle('off', strip);
    if (strip) heightEl.value = '1';

    seg.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('on', (b as HTMLElement).dataset.shape === s.shape));

    if (!s.nameEdited) nameEl.placeholder = autoName(s);

    const total = totalCh(s);
    const cells = cellCount(s);
    const over = total > MAX_CH;
    readout.innerHTML = over
      ? `<span class="cm-bad">${cells} cells · ${total} ch — over the 512-channel limit</span>`
      : `${cells} cell${cells === 1 ? '' : 's'} · ${total} ch · 1 fixture`;
    createBtn.disabled = over;
    createBtn.classList.toggle('off', over);

    drawPreview();
  }

  // ---- wiring (continuous, on input) ----
  seg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-shape]') as HTMLElement | null;
    if (!b) return;
    s.shape = b.dataset.shape as State['shape'];
    render();
  });
  widthEl.addEventListener('input', () => { s.width = Number(widthEl.value) || 1; render(); });
  heightEl.addEventListener('input', () => { s.height = Number(heightEl.value) || 1; render(); });
  colorSel.addEventListener('change', () => { s.color = colorSel.value as State['color']; render(); });
  cellDimCb.addEventListener('change', () => { s.cellDimmer = cellDimCb.checked; render(); });
  masterDimCb.addEventListener('change', () => { s.masterDimmer = masterDimCb.checked; render(); });
  nameEl.addEventListener('input', () => { s.nameEdited = nameEl.value.trim().length > 0; s.name = nameEl.value; });

  createBtn.addEventListener('click', async () => {
    if (createBtn.disabled) return;
    createBtn.disabled = true;
    const opts: MatrixGenOptions = {
      shape: s.shape,
      width: Math.max(1, Math.min(MAX_SIDE, s.width | 0)),
      height: s.shape === 'strip' ? 1 : Math.max(1, Math.min(MAX_SIDE, s.height | 0)),
      color: s.color,
      cellDimmer: s.cellDimmer,
      masterDimmer: s.masterDimmer,
      ...(s.nameEdited ? { name: s.name.trim() } : {}),
    };
    try {
      await lumox.library.createMatrix(opts);
      lumox.win.closeSelf();   // the library tile refreshes via the library:changed broadcast
    } catch (err: any) {
      createBtn.disabled = false;
      readout.innerHTML = `<span class="cm-bad">${String(err?.message ?? err).replace(/^Error:\s*/, '')}</span>`;
    }
  });

  render();
  return body;
}
