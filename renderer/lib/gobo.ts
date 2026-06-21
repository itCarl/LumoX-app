// gobo.ts — render a drawn gobo pattern (the mono bitmask authored in the fixture
// editor, see src/fixtures/goboPattern.ts) as a small inline SVG. Used by the
// fixture editor's capability rows (thumbnail) and the GOBO fader strip (the live
// selected gobo). Cells are masked to a circle so the icon reads as a gobo wheel
// slot; white pattern on a translucent dark disc keeps it legible on any tint.

import { GOBO_GRID, decodeGobo } from '../../src/fixtures/goboPattern';

const R = GOBO_GRID / 2;
const inCircle = (x: number, y: number) => {
  const dx = x + 0.5 - R, dy = y + 0.5 - R;
  return dx * dx + dy * dy <= R * R;
};

/** True if `pattern` decodes to at least one lit cell inside the circle. */
export function hasGobo(pattern: string | null | undefined): boolean {
  if (!pattern) return false;
  const bits = decodeGobo(pattern);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] && inCircle(i % GOBO_GRID, Math.floor(i / GOBO_GRID))) return true;
  }
  return false;
}

/** Inline `<svg>` for a gobo pattern, or '' when empty (caller falls back to a glyph). */
export function goboSvg(pattern: string | null | undefined, px = 18): string {
  if (!pattern) return '';
  const bits = decodeGobo(pattern);
  let d = '';
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    const x = i % GOBO_GRID, y = Math.floor(i / GOBO_GRID);
    if (!inCircle(x, y)) continue;
    d += `M${x} ${y}h1v1h-1z`;
  }
  if (!d) return '';
  return `<svg class="gobo-svg" viewBox="0 0 ${GOBO_GRID} ${GOBO_GRID}" width="${px}" height="${px}" aria-hidden="true">`
    + `<circle cx="${R}" cy="${R}" r="${R}" fill="rgba(0,0,0,.55)"/>`
    + `<path d="${d}" fill="#fff"/></svg>`;
}
