// Debug view — raw access to every DMX channel of a universe: 512 faders
// writing the programmer buffer + a live readback of the mixed output.

import { esc } from '../lib/html';
import { button } from '../lib/widgets';

const { lumox } = window;
const CHANNELS = 512;
const POLL_MS = 100;

export async function makeDebugView(): Promise<HTMLElement> {
  const el = document.createElement('div');
  el.className = 'debug-view-inner';
  el.innerHTML = `
    <div class="dbg-head">
      <span class="dbg-title">DEBUG — all channels</span>
      <select id="dbg-uni" class="pg-uni"></select>
    </div>
    <div id="dbg-grid" class="dbg-grid"></div>`;

  const uniSel = el.querySelector('#dbg-uni') as HTMLSelectElement;
  const grid = el.querySelector('#dbg-grid') as HTMLElement;

  let universes: any[] = [];
  try { universes = await lumox.universes.list(); } catch { universes = []; }
  if (!universes.length) universes = [{ id: 0, name: 'Universe 1' }];
  uniSel.innerHTML = universes.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  let currentUni = Number(uniSel.value);

  // build 512 fader cells once
  const valEls: HTMLElement[] = [];
  const faderEls: HTMLInputElement[] = [];
  const frag = document.createDocumentFragment();
  for (let ch = 1; ch <= CHANNELS; ch++) {
    const cell = document.createElement('div');
    cell.className = 'dbg-cell';
    cell.innerHTML = `
      <span class="dbg-n">${ch}</span>
      <input class="dbg-fader" type="range" min="0" max="255" value="0" data-ch="${ch}" orient="vertical" />
      <span class="dbg-v">0</span>`;
    frag.appendChild(cell);
    faderEls.push(cell.querySelector('.dbg-fader') as HTMLInputElement);
    valEls.push(cell.querySelector('.dbg-v') as HTMLElement);
  }
  grid.appendChild(frag);

  grid.addEventListener('input', (e: Event) => {
    const f = e.target as HTMLInputElement;
    if (!f.dataset.ch) return;
    lumox.universes.setChannel(currentUni, Number(f.dataset.ch), Number(f.value));
  });

  uniSel.addEventListener('change', () => { currentUni = Number(uniSel.value); });

  (el.querySelector('.dbg-head') as HTMLElement).appendChild(
    button({
      variant: 'ghost',
      label: 'Zero universe',
      onClick: () => {
        for (let ch = 1; ch <= CHANNELS; ch++) {
          faderEls[ch - 1].value = '0';
          lumox.universes.setChannel(currentUni, ch, 0);
        }
      },
    }),
  );

  // Live readback of mixed output → value labels. The debug view is a singleton
  // that's never removed from the DOM (just toggled display:none when another
  // tab shows), so a free-running interval would tick 10×/s forever. Gate it on
  // visibility: poll only while the view is actually on screen.
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  async function poll() {
    const data = await lumox.universes.read(currentUni);
    if (!data || !data.length) return;
    for (let i = 0; i < CHANNELS; i++) {
      const v = data[i] ?? 0;
      if (valEls[i].textContent !== String(v)) valEls[i].textContent = String(v);
    }
  }
  const io = new IntersectionObserver((entries) => {
    const visible = entries.some((en) => en.isIntersecting);
    if (visible && !pollTimer) pollTimer = setInterval(poll, POLL_MS);
    else if (!visible && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  });
  io.observe(el);

  return el;
}
