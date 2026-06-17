// Debug view — raw access to every DMX channel of a universe: 512 faders
// writing the programmer buffer + a live readback of the mixed output.

const { lumox } = window;
const CHANNELS = 512;
const POLL_MS = 100;

export async function makeDebugView() {
  const el = document.createElement('div');
  el.className = 'debug-view-inner';
  el.innerHTML = `
    <div class="dbg-head">
      <span class="dbg-title">DEBUG — all channels</span>
      <select id="dbg-uni" class="pg-uni"></select>
      <button id="dbg-zero" class="btn-ghost">Zero universe</button>
    </div>
    <div id="dbg-grid" class="dbg-grid"></div>`;

  const uniSel = el.querySelector('#dbg-uni');
  const grid = el.querySelector('#dbg-grid');

  let universes = [];
  try { universes = await lumox.universes.list(); } catch { universes = []; }
  if (!universes.length) universes = [{ id: 0, name: 'Universe 1' }];
  uniSel.innerHTML = universes.map((u) => `<option value="${u.id}">${u.name}</option>`).join('');
  let currentUni = Number(uniSel.value);

  // build 512 fader cells once
  const valEls = [];
  const faderEls = [];
  const frag = document.createDocumentFragment();
  for (let ch = 1; ch <= CHANNELS; ch++) {
    const cell = document.createElement('div');
    cell.className = 'dbg-cell';
    cell.innerHTML = `
      <span class="dbg-n">${ch}</span>
      <input class="dbg-fader" type="range" min="0" max="255" value="0" data-ch="${ch}" orient="vertical" />
      <span class="dbg-v">0</span>`;
    frag.appendChild(cell);
    faderEls.push(cell.querySelector('.dbg-fader'));
    valEls.push(cell.querySelector('.dbg-v'));
  }
  grid.appendChild(frag);

  grid.addEventListener('input', (e) => {
    const f = e.target;
    if (!f.dataset.ch) return;
    lumox.universes.setChannel(currentUni, Number(f.dataset.ch), Number(f.value));
  });

  uniSel.addEventListener('change', () => { currentUni = Number(uniSel.value); });

  el.querySelector('#dbg-zero').addEventListener('click', () => {
    for (let ch = 1; ch <= CHANNELS; ch++) {
      faderEls[ch - 1].value = 0;
      lumox.universes.setChannel(currentUni, ch, 0);
    }
  });

  // live readback of mixed output → value labels
  setInterval(async () => {
    if (!el.isConnected || el.offsetParent === null) return;   // skip when hidden
    const data = await lumox.universes.read(currentUni);
    if (!data || !data.length) return;
    for (let i = 0; i < CHANNELS; i++) {
      const v = data[i] ?? 0;
      if (valEls[i].textContent !== String(v)) valEls[i].textContent = v;
    }
  }, POLL_MS);

  return el;
}
