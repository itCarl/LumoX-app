// Emitter geometry — the single source of truth for where a fixture's emitters
// sit in 2D space, shared by the engine (matrix effects, world coordinates) and
// the renderer (STAGE tile). Pure math, no runtime deps (type-only imports), so
// it bundles cleanly into the browser renderer as well as the Node engine.
//
// World space: one **emitter cell** = 1 world unit. A fixture's footprint is
// `cols × rows` cells. A fixture's `stageTransform` places that footprint on the
// stage: `{ x, y }` is the footprint's top-left in world units, `rotation` spins
// it (degrees) about its own centre. The renderer multiplies world units by a
// zoom factor for display; the engine consumes raw world units (effects only
// care about relative positions, so the absolute scale is irrelevant).

import type { EmitterCell } from './FixtureDefinition';

export interface Vec2 { x: number; y: number; }

/** A fixture's placement on the 2D stage (world units + degrees). */
export interface StageTransform { x: number; y: number; rotation: number; }

/** Just the emitter-shape fields needed to derive geometry (Fixture DTO or def). */
export interface EmitterSource { emitters: number; emitterLayout: EmitterCell[] | null; }

/** Derived emitter grid: count, matrix shape, and footprint size (world units). */
export interface EmitterGrid { n: number; cols: number; rows: number; width: number; height: number; }

export const DEFAULT_TRANSFORM: StageTransform = { x: 0, y: 0, rotation: 0 };

/**
 * The fixed 2D stage extent, in world units (emitter cells), 16:9. The STAGE tile
 * draws this bounded box and fixtures live inside it. Fixture placements **persist
 * normalised** to this box (`x/width`, `y/height` → 0..1 per axis), so a saved show
 * is resolution-independent; the engine + renderer still work in raw world units
 * (only relative positions matter to FX), with the (de)normalise happening at the
 * project (de)serialisation boundary — see `Fixture.toJSON` / `restoreProject`.
 */
export const STAGE_SIZE = { width: 64, height: 36 } as const;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Coerce arbitrary input into a valid StageTransform (defaults on bad fields). */
export function sanitizeTransform(raw: unknown): StageTransform {
  const o = (raw ?? {}) as Partial<StageTransform>;
  return {
    x: isNum(o.x) ? o.x : 0,
    y: isNum(o.y) ? o.y : 0,
    rotation: isNum(o.rotation) ? o.rotation : 0,
  };
}

/** World-unit transform → normalised (0..1 per axis over the fixed stage box). */
export function normalizeTransform(t: StageTransform): StageTransform {
  return { x: t.x / STAGE_SIZE.width, y: t.y / STAGE_SIZE.height, rotation: t.rotation };
}

/** Normalised transform (as persisted) → raw world units, with field validation. */
export function denormalizeTransform(raw: unknown): StageTransform {
  const s = sanitizeTransform(raw);
  return { x: s.x * STAGE_SIZE.width, y: s.y * STAGE_SIZE.height, rotation: s.rotation };
}

/**
 * Count a mode's colour-mixing cells — the number of repeating R/G/B clusters.
 * This is what makes a fixture's emitters fall out of its channel layout: a PAR
 * with one R/G/B is 1 emitter, a 4-segment bar 4, a 9-LED bar 9, a 5×5 matrix 25.
 */
export function colorClusterCount(channels: ({ typeId: string | null } | null)[]): number {
  let r = 0, g = 0, b = 0;
  for (const c of channels) {
    if (!c) continue;
    if (c.typeId === 'red') r++; else if (c.typeId === 'green') g++; else if (c.typeId === 'blue') b++;
  }
  return Math.min(r, g, b);
}

/**
 * The canonical emitter count for a patched fixture: the most cells any signal
 * implies — colour clusters (the channel layout), an explicit `emitterLayout`,
 * or a declared `emitters` — at least 1. Channel-derived so multi-cell bars and
 * matrices "just work" without an explicit layout.
 */
export function resolveEmitterCount(channels: ({ typeId: string | null } | null)[], layout: EmitterCell[] | null | undefined, emitters = 1): number {
  const layoutN = Array.isArray(layout) ? layout.length : 0;
  return Math.max(1, colorClusterCount(channels), layoutN, emitters || 0);
}

/**
 * Resolve a fixture's emitter grid. `src.emitters` is the caller-resolved cell
 * count (see {@link resolveEmitterCount}). A positioned `emitterLayout` whose
 * length matches defines the matrix shape (distinct x / y bands → cols / rows);
 * otherwise the cells lay out as a **single horizontal row** (a bar/strip — the
 * honest default for any linear fixture). Footprint is `cols × rows` world units.
 */
export function emitterGrid(src: EmitterSource): EmitterGrid {
  const n = Math.max(1, src.emitters || 1);
  const layout = Array.isArray(src.emitterLayout) && src.emitterLayout.length === n ? src.emitterLayout : null;
  let cols: number, rows: number;
  if (layout) {
    const xs = new Set(layout.map((c) => Math.round(c.x * 50)));
    const ys = new Set(layout.map((c) => Math.round(c.y * 50)));
    cols = Math.max(1, xs.size);
    rows = Math.max(1, ys.size);
    if (cols * rows < n) { cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols); }
  } else {
    cols = n;
    rows = 1;
  }
  return { n, cols, rows, width: cols, height: rows };
}

/**
 * Per-emitter positions in the fixture's *local* frame (world units, origin at
 * the footprint top-left, no rotation). Layout fixtures map their normalized
 * 0..1 coords across the footprint; otherwise cells sit at grid-cell centres.
 */
export function emitterLocalPositions(src: EmitterSource): Vec2[] {
  const g = emitterGrid(src);
  const layout = Array.isArray(src.emitterLayout) && src.emitterLayout.length === g.n ? src.emitterLayout : null;
  if (layout) return layout.map((c) => ({ x: c.x * g.width, y: c.y * g.height }));
  const out: Vec2[] = [];
  for (let i = 0; i < g.n; i++) {
    out.push({ x: (i % g.cols) + 0.5, y: Math.floor(i / g.cols) + 0.5 });
  }
  return out;
}

/**
 * Per-emitter positions in *world* space — local positions translated by the
 * transform's top-left and rotated about the footprint centre. Index-aligned
 * with `emitterLocalPositions` (and a fixture's emitter channel order).
 */
export function emitterWorldPositions(src: EmitterSource, t: StageTransform): Vec2[] {
  const g = emitterGrid(src);
  const locals = emitterLocalPositions(src);
  const cx = g.width / 2, cy = g.height / 2;
  const rad = (t.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return locals.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    return { x: t.x + cx + dx * cos - dy * sin, y: t.y + cy + dx * sin + dy * cos };
  });
}
