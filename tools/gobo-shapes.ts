// gobo-shapes.ts — a small library of monochrome gobo motifs (rasterised at the
// current GOBO_GRID, 32×32) plus a label
// classifier, used by `gen-gobo-patterns.ts` to author `pattern` fields (the same
// `g32:` bitmask the Draw-gobo editor produces, see src/fixtures/goboPattern.ts)
// on bundled Moving-Head fixture profiles, so each gobo slot shows a real icon at
// the GOBO faders instead of plain text.
//
// Most library fixtures only label their gobos generically ("Gobo 3"), so there is
// no true image to reproduce. We therefore (1) draw the real shape when a label
// names one (circle, triangle, star, flower, …) and (2) fall back to a fixed,
// number-indexed motif palette so every numbered slot gets a distinct, consistent
// icon library-wide. Dynamic ranges (rotation / rainbow / scroll / shake / stop)
// and the open slot are NOT gobo images — they stay text (classifier returns null).

import { GOBO_GRID, encodeGobo } from '../src/fixtures/goboPattern';

const N = GOBO_GRID;          // output grid resolution (32)
const F = 16 / N;             // grid cell → 16-space; motifs are authored in a fixed
const S = N / 16;             // 0..16 logical space and rasterised at N for crisp curves
const C = 8;                  // centre, in 16-space
type Grid = boolean[];

// ---- drawing primitives ----------------------------------------------------
// All coordinates/radii below are in the resolution-independent 16-space; `cd`
// maps a grid cell's centre into it, so the same shapes rasterise cleanly at any N.
const make = (): Grid => new Array(N * N).fill(false);
const set = (g: Grid, x: number, y: number) => {
  if (x >= 0 && x < N && y >= 0 && y < N) g[y * N + x] = true;
};
const cd = (i: number, c: number) => (i + 0.5) * F - c;   // grid cell index → 16-space delta

function disc(g: Grid, cx: number, cy: number, r: number) {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (cd(x, cx) ** 2 + cd(y, cy) ** 2 <= r * r) set(g, x, y);
}
function ring(g: Grid, cx: number, cy: number, r: number, t: number) {
  const inner = r - t;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(cd(x, cx), cd(y, cy));
      if (d <= r && d >= inner) set(g, x, y);
    }
}
// Ring restricted to an angular wedge (degrees, math convention, 0 = +x, ccw).
function arc(g: Grid, cx: number, cy: number, r: number, t: number, a0: number, a1: number) {
  const inner = r - t;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = cd(x, cx), dy = -cd(y, cy);   // screen y grows down → flip for math angle
      const d = Math.hypot(dx, dy);
      if (d > r || d < inner) continue;
      let a = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (a < 0) a += 360;
      if (a >= a0 && a <= a1) set(g, x, y);
    }
}
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, t: number) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * S * 3) + 1;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    disc(g, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, t / 2);
  }
}
function fillPoly(g: Grid, pts: Array<[number, number]>) {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * F, py = (y + 0.5) * F;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) set(g, x, y);
    }
}
// Regular / star polygon vertices around the centre. `points` spikes; pass
// `innerR` for a star, omit (= r) for a regular polygon. `rot` in degrees, 0 = up.
function poly(cx: number, cy: number, r: number, points: number, rot = 0, innerR = r): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const star = innerR !== r;
  const verts = star ? points * 2 : points;
  for (let i = 0; i < verts; i++) {
    const rad = star && i % 2 ? innerR : r;
    const a = ((rot - 90 + (360 / verts) * i) * Math.PI) / 180;
    out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return out;
}
// Outline of an ellipse rotated by `rot` degrees (for atom orbits).
function ellipse(g: Grid, cx: number, cy: number, rx: number, ry: number, rot: number, t: number) {
  const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const steps = Math.ceil(2 * Math.PI * Math.max(rx, ry) * S) + 12;
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * 2 * Math.PI;
    const ex = rx * Math.cos(th), ey = ry * Math.sin(th);
    disc(g, cx + ex * ca - ey * sa, cy + ex * sa + ey * ca, t / 2);
  }
}

// ---- motifs ----------------------------------------------------------------
// Each returns a fresh grid. Kept bold so they read at ~28px under the circle mask.
const MOTIFS: Record<string, () => Grid> = {
  dot:    () => { const g = make(); disc(g, C, C, 4.2); return g; },
  smalldot: () => { const g = make(); disc(g, C, C, 2.4); return g; },
  circle: () => { const g = make(); ring(g, C, C, 6.6, 1.8); return g; },
  rings:  () => { const g = make(); ring(g, C, C, 6.7, 1.5); ring(g, C, C, 3.4, 1.5); return g; },
  dots:   () => { const g = make(); for (const [x, y] of [[5, 4.5], [11, 5.5], [4.5, 11], [11.5, 11], [8, 8]]) disc(g, x, y, 1.7); return g; },
  triangle: () => { const g = make(); fillPoly(g, poly(C, C + 0.6, 7.2, 3, 0)); return g; },
  trianglecircle: () => { const g = make(); ring(g, C, C, 6.9, 1.4); fillPoly(g, poly(C, C + 0.4, 4.2, 3, 0)); return g; },
  square: () => { const g = make(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const ix = Math.abs(cd(x, C)) <= 6, iy = Math.abs(cd(y, C)) <= 6, inr = Math.abs(cd(x, C)) <= 4.3 && Math.abs(cd(y, C)) <= 4.3; if (ix && iy && !inr) set(g, x, y); } return g; },
  star:   () => { const g = make(); fillPoly(g, poly(C, C, 7.3, 5, 0, 3.0)); return g; },
  flower: () => { const g = make(); for (let i = 0; i < 6; i++) { const a = (i * 60 * Math.PI) / 180; disc(g, C + 4.6 * Math.cos(a), C + 4.6 * Math.sin(a), 2.1); } disc(g, C, C, 2.3); return g; },
  flower2: () => { const g = make(); for (let i = 0; i < 8; i++) { const a = (i * 45 * Math.PI) / 180; disc(g, C + 5.1 * Math.cos(a), C + 5.1 * Math.sin(a), 1.7); } disc(g, C, C, 1.5); return g; },
  asterisk: () => { const g = make(); for (let i = 0; i < 3; i++) { const a = (i * 60 * Math.PI) / 180; line(g, C - 7 * Math.cos(a), C - 7 * Math.sin(a), C + 7 * Math.cos(a), C + 7 * Math.sin(a), 1.5); } return g; },
  burst:  () => { const g = make(); for (let i = 0; i < 6; i++) { const a = (i * 30 * Math.PI) / 180; line(g, C - 7.2 * Math.cos(a), C - 7.2 * Math.sin(a), C + 7.2 * Math.cos(a), C + 7.2 * Math.sin(a), 1.1); } disc(g, C, C, 1.6); return g; },
  cross:  () => { const g = make(); line(g, C, 1, C, 15, 2.4); line(g, 1, C, 15, C, 2.4); return g; },
  x:      () => { const g = make(); line(g, 2, 2, 14, 14, 2.4); line(g, 14, 2, 2, 14, 2.4); return g; },
  x3:     () => { const g = make(); for (const x of [4, 8, 12]) line(g, x, 2.5, x, 13.5, 1.6); return g; },
  slash:  () => { const g = make(); line(g, 2.5, 13.5, 13.5, 2.5, 2.4); return g; },
  lines:  () => { const g = make(); for (let y = 0; y < N; y++) { const ly = (y + 0.5) * F; if (![4, 8, 12].some((c) => Math.abs(ly - c) <= 1.05)) continue; for (let x = 0; x < N; x++) if (cd(x, C) ** 2 + cd(y, C) ** 2 <= 64) set(g, x, y); } return g; },
  spiral: () => { const g = make(); const STEPS = Math.ceil(120 * S); for (let i = 0; i <= STEPS; i++) { const th = (i / STEPS) * 4 * Math.PI; const r = 0.4 + (th / (4 * Math.PI)) * 6.6; disc(g, C + r * Math.cos(th), C + r * Math.sin(th), 0.95); } return g; },
  wifi:   () => { const g = make(); arc(g, C, C + 3.5, 7.2, 1.4, 35, 145); arc(g, C, C + 3.5, 4.6, 1.4, 35, 145); arc(g, C, C + 3.5, 2.0, 1.4, 35, 145); disc(g, C, C + 3.2, 1.3); return g; },
  atom:   () => { const g = make(); disc(g, C, C, 1.7); for (const rot of [0, 60, 120]) ellipse(g, C, C, 6.6, 2.6, rot, 1.1); return g; },
  hex:    () => { const g = make(); const o = poly(C, C, 6.8, 6, 30), inr = poly(C, C, 4.6, 6, 30); fillPoly(g, o); const hole = make(); fillPoly(hole, inr); for (let i = 0; i < g.length; i++) if (hole[i]) g[i] = false; return g; },
  breakup: () => { const g = make(); for (const [x, y, r] of [[5, 5.5, 2.6], [10.5, 4.8, 2.1], [5.2, 10.8, 2.2], [11, 10.6, 2.7], [8, 8, 1.8]] as Array<[number, number, number]>) disc(g, x, y, r); for (const [x, y, r] of [[6.5, 6.5, 1.0], [10, 10, 1.1]] as Array<[number, number, number]>) { const h = make(); disc(h, x, y, r); for (let i = 0; i < g.length; i++) if (h[i]) g[i] = false; } return g; },
};

// Number-indexed fallback palette (used for generic "Gobo N" labels). Ordered so
// adjacent slots look clearly different. Same number → same icon library-wide.
const PALETTE = ['dots', 'triangle', 'star', 'flower', 'rings', 'square', 'spiral', 'breakup', 'asterisk', 'burst', 'hex', 'wifi', 'lines', 'atom', 'cross', 'x'];

export const MOTIF_KEYS = Object.keys(MOTIFS);

/** The encoded `g32:` pattern for a motif key (throws on an unknown key). */
export function motifPattern(key: string): string {
  const fn = MOTIFS[key];
  if (!fn) throw new Error(`unknown gobo motif: ${key}`);
  return encodeGobo(fn());
}

/** ASCII preview of a motif (dry-run eyeballing). */
export function motifAscii(key: string): string {
  const g = MOTIFS[key]();
  let out = '';
  for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) out += g[y * N + x] ? '##' : '··'; out += '\n'; }
  return out;
}

// ---- label → motif classifier ----------------------------------------------
// Ranges that are NOT a static gobo image (no icon — caller keeps them as text).
const EFFECT_RE = /shak|rotat|spin|rainbow|scroll|\bstop\b|run.?through|sound|no function|\boff\b|\bcw\b|\bccw\b|clockwise|counter|anti-clock|forwards|backwards|reverse|\brpm\b|\bbpm\b|slow|fast|increasing|decreasing|wheel rotation|wheel turning|wheel stop|selection|→|->|change from|speed/;
const OPEN_RE = /\bopen\b|no gobo|^white$|^open ?\/ ?white$|open \(white\)|\(open\)/;

// Named shapes, checked in order (first hit wins). Each maps a keyword test to a motif.
const NAMED: Array<[RegExp, string]> = [
  [/triangle.*circle|circle.*triangle/, 'trianglecircle'],
  [/triangle/, 'triangle'],
  [/square/, 'square'],
  [/star/, 'star'],
  [/spiral|swirl/, 'spiral'],
  [/flower\s*2|flower.*ii/, 'flower2'],
  [/flower|petal/, 'flower'],
  [/wifi|wi-fi/, 'wifi'],
  [/atom/, 'atom'],
  [/asterisk/, 'asterisk'],
  [/sunburst|burst/, 'burst'],
  [/breakup|break.?up|foliage|leaf|leaves|cloud/, 'breakup'],
  [/hexagon|\bhex\b/, 'hex'],
  [/\bslash\b/, 'slash'],
  [/\bx3\b|3x|triple/, 'x3'],
  [/cross|\bplus\b/, 'cross'],
  [/\bx\b/, 'x'],
  [/stripe|\blines\b|\bline\b|bars?/, 'lines'],
  [/circles|rings|concentric/, 'rings'],
  [/small dot/, 'smalldot'],
  [/dots|\bdot\b|spots|stipple/, 'dots'],
  [/circle/, 'circle'],
];

/** Pick the first gobo number in a label ("Gobo 7", "g3", "metal gobo 2",
 *  "g10+g1", "4 (glass)", "5 (metal)"). The bare leading-number form is only
 *  reached after the open/effect filters, so it can't catch an effect range. */
function goboNumber(s: string): number | null {
  const m = s.match(/gobo[t]?\s*(\d+)/) ?? s.match(/^g\s*(\d+)/) ?? s.match(/\bg(\d+)\b/) ?? s.match(/^(\d+)\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Classify a gobo capability label to a motif key, or null when it is not a
 * static gobo image (open slot, rotation/rainbow/scroll/shake/stop effect, or
 * unrecognised). `null` ⇒ caller leaves the range as a plain text chip.
 */
export function classifyGobo(label: string): string | null {
  const s = label.trim().toLowerCase();
  if (!s) return null;
  if (OPEN_RE.test(s)) return null;          // open beam — no gobo
  // A bare numbered slot ("Gobo 3") is static even though it has no shape word;
  // resolve it before the effect filter so "Gobo 3" isn't lost, but a numbered
  // slot that also carries an effect word ("Gobo 3 shake") stays an effect.
  if (EFFECT_RE.test(s)) return null;
  for (const [re, key] of NAMED) if (re.test(s)) return key;
  const n = goboNumber(s);
  if (n != null) return n === 0 ? null : PALETTE[(n - 1) % PALETTE.length];
  return null;                                // unrecognised → keep as text
}
