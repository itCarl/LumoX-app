// dock.js — resizable workspace with independent top & bottom rows.
//
//   ┌ tl ──────┬ tr ───────────┐
//   │ library  │  patch grid   │  ← top row: own col split + height resize
//   ├──────────┴───────────────┤
//   │ groups strip (full width)│  ← slim, fixed height
//   ├ bl ──────┬ br ───────────┤
//   │  stage   │   (limits)    │  ← bottom row: its OWN col split
//   └──────────┴───────────────┘
//
// Top and bottom rows each have an independent vertical splitter, so the
// library can stay narrow while the stage is wide. A horizontal splitter
// resizes the top row's height; the bottom row takes the remainder.
//
// Every panel has a per-zone MINIMUM size (width for the columns, height for the
// rows). Splitter drags clamp to those minimums, and — crucially — so does
// `apply()`, which re-runs on every window resize: shrinking the window can
// never collapse a panel below its usable floor (content scrolls instead). A
// panel's effective MAXIMUM is implied — it can grow only until the opposite
// panel hits its own minimum.

interface DockOptions {
  topCol?: number;
  topFraction?: number;
  bottomCol?: number | null;
  bottomFraction?: number;
  groupsH?: number;
  // Per-zone minimums (px). Column mins floor the vertical splitters; row mins
  // floor the horizontal splitter. Each pair is { primary, rest }: `rest` is the
  // flex-grow zone (tr / br) and so also caps how far the primary can grow.
  colMinTop?: number;      // top-left (library / banks) min width
  colRestMinTop?: number;  // top-right (patch / FX) min width
  colMinBot?: number;      // bottom-left (stage) min width
  colRestMinBot?: number;  // bottom-right (limits / fader) min width
  rowMinTop?: number;      // top row min height
  rowMinBot?: number;      // bottom row min height
}

interface DockZones {
  tl: HTMLElement;
  tr: HTMLElement;
  bl: HTMLElement;
  br: HTMLElement;
  groups: HTMLElement;
}

export interface Dock {
  zones: DockZones;
  mount(zone: keyof DockZones, tile: HTMLElement): HTMLElement;
  /** Set top-left width as a fraction of the top row (0..1). */
  setTopColFraction(f: number): void;
  /** Set top-left width in px (clears fraction). */
  setTopCol(px: number): void;
}

export function makeDock(ws: HTMLElement, {
  topCol = 300, topFraction = 0.5, bottomCol = null, bottomFraction, groupsH = 44,
  colMinTop = 280, colRestMinTop = 320,
  colMinBot = 320, colRestMinBot = 360,
  rowMinTop = 240, rowMinBot = 260,
}: DockOptions = {}): Dock {
  ws.classList.add('dock');
  ws.innerHTML = `
    <div class="ws-top">
      <div class="zone z-tl"></div>
      <div class="splitter splitter-v" data-split="topcol"></div>
      <div class="zone z-tr"></div>
    </div>
    <div class="splitter splitter-h" data-split="toph"></div>
    <div class="zone z-groups"></div>
    <div class="ws-bottom">
      <div class="zone z-bl"></div>
      <div class="splitter splitter-v" data-split="botcol"></div>
      <div class="zone z-br"></div>
    </div>`;

  const wsTop = ws.querySelector('.ws-top') as HTMLElement;
  const wsBottom = ws.querySelector('.ws-bottom') as HTMLElement;
  const tl = ws.querySelector('.z-tl') as HTMLElement;
  const tr = ws.querySelector('.z-tr') as HTMLElement;
  const bl = ws.querySelector('.z-bl') as HTMLElement;
  const groups = ws.querySelector('.z-groups') as HTMLElement;

  let _topCol = topCol;
  let _topColFrac: number | null = null;       // fraction of top-row width; overrides px when set
  let _topFrac: number | null = topFraction;   // fraction of available height; null once dragged
  let _topH = 0;                // px (used when _topFrac is null)
  let _botCol = bottomCol;      // px, or null → 50% (unless _botColFrac is set)
  let _botColFrac: number | null = bottomFraction ?? null;   // fraction of bottom-row width; overrides px when set

  // Largest valid value for a split: keep at least `rest` for the other side,
  // but never below `lo` even on a window too small to satisfy both.
  const hi = (total: number, rest: number, lo: number) => Math.max(lo, total - rest);

  function apply() {
    const avail = ws.clientHeight - groupsH;   // height left for top + bottom rows
    const rawTop = _topFrac != null ? Math.round(_topFrac * avail) : _topH;
    const topPx = clamp(rawTop, rowMinTop, hi(avail, rowMinBot, rowMinTop));
    wsTop.style.height = `${topPx}px`;
    groups.style.height = `${groupsH}px`;

    const topW = wsTop.clientWidth;
    const rawCol = _topColFrac != null ? Math.round(_topColFrac * topW) : _topCol;
    const colPx = clamp(rawCol, colMinTop, hi(topW, colRestMinTop, colMinTop));
    tl.style.flex = `0 0 ${colPx}px`;

    const botW = wsBottom.clientWidth;
    const rawBot = _botColFrac != null ? Math.round(_botColFrac * botW)
      : (_botCol ?? Math.round(0.5 * botW));
    const botPx = clamp(rawBot, colMinBot, hi(botW, colRestMinBot, colMinBot));
    bl.style.flex = `0 0 ${botPx}px`;
  }

  bindDrag('topcol', (e) => {
    const r = wsTop.getBoundingClientRect();
    _topColFrac = null;   // user override → px
    _topCol = clamp(e.clientX - r.left, colMinTop, hi(r.width, colRestMinTop, colMinTop));
  });
  bindDrag('toph', (e) => {
    const r = ws.getBoundingClientRect();
    _topFrac = null;   // user override — switch to absolute px
    _topH = clamp(e.clientY - r.top, rowMinTop, hi(r.height - groupsH, rowMinBot, rowMinTop));
  });

  // keep the split correct (and within mins) as the window resizes
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => apply()).observe(ws);
  bindDrag('botcol', (e) => {
    const r = wsBottom.getBoundingClientRect();
    _botColFrac = null;   // user override → px
    _botCol = clamp(e.clientX - r.left, colMinBot, hi(r.width, colRestMinBot, colMinBot));
  });

  function bindDrag(name: string, update: (e: MouseEvent) => void) {
    const handle = ws.querySelector(`[data-split="${name}"]`) as HTMLElement;
    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      handle.classList.add('dragging');
      const move = (ev: MouseEvent) => { update(ev); apply(); };
      const up = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  apply();
  return {
    zones: { tl, tr, bl, br: ws.querySelector('.z-br') as HTMLElement, groups },
    mount(zone, tile) { this.zones[zone]?.appendChild(tile); return tile; },
    /** Set top-left width as a fraction of the top row (0..1). */
    setTopColFraction(f) { _topColFrac = f; apply(); },
    /** Set top-left width in px (clears fraction). */
    setTopCol(px) { _topColFrac = null; _topCol = px; apply(); },
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
