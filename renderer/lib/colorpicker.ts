// A small, dependency-light colour picker for the renderer — a hue×saturation
// square flanked by fine sliders (saturation on the left, hue below), with live
// readouts, a shared favourites row and a named-palette menu. Brightness is NOT
// part of the picker: the square is pure hue × saturation at full value, and
// intensity comes from the dimmer / virtual dimmer (so the colour and the level
// are programmed independently, the way a console separates them).
//
// Colour maths goes through culori (the project's colour library); the picker
// speaks 8-bit RGB (0..255) at its edges to match DMX channel values.
//
// It owns its DOM and pointer handling and exposes a tiny handle: append `el`
// into a host, get `onInput(rgb)` while the user drags, and push external changes
// back with `setRgb()` (which never re-fires `onInput`, so there's no feedback
// loop when a fader drag updates the picker). Favourites and palettes are global
// (shared by every mounted picker) and persist in localStorage.

import { converter, parse, formatHex } from 'culori';

export interface Rgb255 { r: number; g: number; b: number; }

export interface ColorPicker {
  /** Root element — append into a host container. */
  el: HTMLElement;
  /** Reflect an external colour (e.g. a fader drag). Does NOT fire `onInput`. */
  setRgb(rgb: Rgb255): void;
}

const toRgb = converter('rgb');
const toHsv = converter('hsv');
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function hsvToRgb(h: number, s: number, v: number): Rgb255 {
  const c = toRgb({ mode: 'hsv', h, s, v });
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
}

function hexToRgb(hex: string): Rgb255 {
  const c = toRgb(parse(hex));
  if (!c) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
}

const rgbToHex = (rgb: Rgb255) => formatHex({ mode: 'rgb', r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 });

// ── Shared favourites + palettes (one set, every picker mirrors it) ──────────

interface Palette { name: string; colors: string[]; }

const FAV_KEY = 'lumox.color.favourites';
const PAL_KEY = 'lumox.color.palettes';

const BUILTIN_PALETTES: Palette[] = [
  { name: 'Basic', colors: ['#ffffff', '#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'] },
  { name: 'Warm', colors: ['#fff2b0', '#ffd24a', '#ff8c1a', '#ff3b1a', '#b3000f'] },
  { name: 'Cool', colors: ['#3a0ca3', '#1b35d6', '#1e90ff', '#22c1e8', '#9ad8ff'] },
  { name: 'Pastel', colors: ['#ff6f6f', '#ffc28a', '#fff3a8', '#bfe8b6', '#a8d4ff', '#cdb8ff', '#ffc2e2'] },
  { name: 'Tungsten', colors: ['#ffd9a0', '#ffc06a', '#ffae47', '#ff9e2d', '#fff4e0'] },
  { name: 'Fire', colors: ['#ffe34a', '#ffae1a', '#ff6a00', '#f7300f', '#9c0d0d'] },
];

const DEFAULT_FAVS = BUILTIN_PALETTES[0].colors.slice(0, 6);

function readJson<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; }
  catch { return fallback; }
}

let favourites: string[] = readJson(FAV_KEY, DEFAULT_FAVS);
let userPalettes: Palette[] = readJson(PAL_KEY, []);
const subscribers = new Set<() => void>();

function notify() { subscribers.forEach((cb) => cb()); }

function setFavourites(next: string[]) {
  favourites = next;
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  notify();
}

function setUserPalettes(next: Palette[]) {
  userPalettes = next;
  localStorage.setItem(PAL_KEY, JSON.stringify(next));
  notify();
}

// ── The picker ──────────────────────────────────────────────────────────────

export function createColorPicker(opts: {
  initial: Rgb255;
  onInput: (rgb: Rgb255) => void;
  onEnd?: () => void;
}): ColorPicker {
  let h = 0, s = 0;   // hue 0..360, saturation 0..1 (value is always full)

  const root = document.createElement('div');
  root.className = 'cpick';
  root.innerHTML = `
    <div class="cpick-read"><span class="cpick-rh">0&deg;</span><span class="cpick-rs">0%</span></div>
    <div class="cpick-grid">
      <div class="cpick-sat"><div class="cpick-sat-handle"></div></div>
      <div class="cpick-sq"><div class="cpick-sq-handle"></div></div>
      <div class="cpick-hue"><div class="cpick-hue-handle"></div></div>
    </div>
    <div class="cpick-fav">
      <div class="cpick-fav-head"><span>Favourites</span><button class="cpick-pal" title="Palettes" aria-label="Palettes">&#8226;&#8226;&#8226;</button></div>
      <div class="cpick-fav-row"></div>
    </div>`;

  const sq = root.querySelector('.cpick-sq') as HTMLElement;
  const sqH = root.querySelector('.cpick-sq-handle') as HTMLElement;
  const satEl = root.querySelector('.cpick-sat') as HTMLElement;
  const satH = root.querySelector('.cpick-sat-handle') as HTMLElement;
  const hue = root.querySelector('.cpick-hue') as HTMLElement;
  const hueH = root.querySelector('.cpick-hue-handle') as HTMLElement;
  const readH = root.querySelector('.cpick-rh') as HTMLElement;
  const readS = root.querySelector('.cpick-rs') as HTMLElement;
  const palBtn = root.querySelector('.cpick-pal') as HTMLElement;
  const favRow = root.querySelector('.cpick-fav-row') as HTMLElement;

  const out = () => hsvToRgb(h, s, 1);

  function paint() {
    const rgb = out();
    const css = `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
    sqH.style.left = `${(h / 360) * 100}%`;
    sqH.style.top = `${(1 - s) * 100}%`;
    sqH.style.background = css;
    satEl.style.background = `linear-gradient(to bottom, hsl(${h} 100% 50%), #fff)`;
    satH.style.top = `${(1 - s) * 100}%`;
    satH.style.background = css;
    hueH.style.left = `${(h / 360) * 100}%`;
    readH.textContent = `${Math.round(h)}°`;
    readS.textContent = `${Math.round(s * 100)}%`;
  }

  // Drag handler: pointer position on `el` → normalised (x, y) in 0..1.
  function drag(el: HTMLElement, onMove: (x: number, y: number) => void) {
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const apply = (ev: PointerEvent) => {
        onMove(clamp01((ev.clientX - rect.left) / rect.width), clamp01((ev.clientY - rect.top) / rect.height));
        paint();
        opts.onInput(out());
      };
      const move = (ev: PointerEvent) => apply(ev);
      const up = () => {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        opts.onEnd?.();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      apply(e);
    });
  }

  drag(sq, (x, y) => { h = x * 360; s = 1 - y; });
  drag(satEl, (_x, y) => { s = 1 - y; });
  drag(hue, (x) => { h = x * 360; });

  function setRgb(rgb: Rgb255) {
    const c = toHsv({ mode: 'rgb', r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 });
    // Greyscale has no defined hue (culori returns undefined) — keep the last one
    // so the square doesn't jump when the colour passes through white/grey.
    if (c.h != null && !Number.isNaN(c.h)) h = c.h;
    s = c.s ?? 0;   // value is intentionally ignored — brightness is the dimmer's job
    paint();
  }

  // Apply a colour from a swatch/palette: move the picker AND write it out.
  function applyHex(hex: string) {
    setRgb(hexToRgb(hex));
    opts.onInput(out());
    opts.onEnd?.();
  }

  // ── Favourites row (mirrors the shared list) ──
  function renderFavs() {
    favRow.replaceChildren();
    favourites.forEach((hex, i) => {
      const sw = document.createElement('button');
      sw.className = 'cpick-sw';
      sw.style.background = hex;
      sw.title = hex;
      sw.addEventListener('click', () => applyHex(hex));
      sw.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        setFavourites(favourites.filter((_, j) => j !== i));
      });
      favRow.appendChild(sw);
    });
    const add = document.createElement('button');
    add.className = 'cpick-sw cpick-add';
    add.textContent = '+';
    add.title = 'Add current colour';
    add.addEventListener('click', () => setFavourites([...favourites, rgbToHex(out())]));
    favRow.appendChild(add);
  }
  // Shared updates re-render this picker's row; drop the subscription once the
  // picker is detached (the fader editor rebuilds pickers on every render).
  const sub = () => { if (!root.isConnected) { subscribers.delete(sub); return; } renderFavs(); };
  subscribers.add(sub);

  palBtn.addEventListener('click', () => openPaletteMenu(palBtn, applyHex));

  setRgb(opts.initial);
  renderFavs();
  return { el: root, setRgb };
}

// ── Palette menu (built-ins + saved, load into favourites; save/manage) ──────

let openMenu: HTMLElement | null = null;
function closeMenu() { openMenu?.remove(); openMenu = null; }

function paletteBar(p: Palette): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'cpick-pal-bar';
  bar.style.background = `linear-gradient(to right, ${p.colors.join(', ')})`;
  return bar;
}

function openPaletteMenu(anchor: HTMLElement, apply: (hex: string) => void) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'cpick-menu';
  openMenu = menu;

  const row = (p: Palette, removable: boolean) => {
    const item = document.createElement('div');
    item.className = 'cpick-pal-item';
    const name = document.createElement('div');
    name.className = 'cpick-pal-name';
    name.textContent = p.name;
    item.append(name, paletteBar(p));
    item.addEventListener('click', () => { setFavourites(p.colors.slice()); closeMenu(); });
    if (removable) {
      const del = document.createElement('button');
      del.className = 'cpick-pal-del';
      del.textContent = '×';
      del.title = 'Delete palette';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        setUserPalettes(userPalettes.filter((q) => q !== p));
        closeMenu();
        openPaletteMenu(anchor, apply);
      });
      item.appendChild(del);
    }
    return item;
  };

  BUILTIN_PALETTES.forEach((p) => menu.appendChild(row(p, false)));
  if (userPalettes.length) {
    menu.appendChild(Object.assign(document.createElement('div'), { className: 'cpick-menu-sep' }));
    userPalettes.forEach((p) => menu.appendChild(row(p, true)));
  }

  // Save the current favourites as a named palette.
  menu.appendChild(Object.assign(document.createElement('div'), { className: 'cpick-menu-sep' }));
  const save = document.createElement('form');
  save.className = 'cpick-save';
  save.innerHTML = `<input type="text" placeholder="Save favourites as…" maxlength="24" /><button type="submit">Save</button>`;
  const input = save.querySelector('input') as HTMLInputElement;
  save.addEventListener('submit', (e) => {
    e.preventDefault();
    const nm = input.value.trim();
    if (!nm) return;
    setUserPalettes([...userPalettes.filter((p) => p.name !== nm), { name: nm, colors: favourites.slice() }]);
    closeMenu();
  });
  menu.appendChild(save);

  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  // Open above the button when it sits low on screen (the picker lives near the bottom).
  const mh = menu.offsetHeight;
  const top = r.bottom + mh > window.innerHeight ? Math.max(8, r.top - mh) : r.bottom + 4;
  menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${top}px`;

  const onDoc = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && e.target !== anchor) { closeMenu(); document.removeEventListener('mousedown', onDoc); }
  };
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
}
