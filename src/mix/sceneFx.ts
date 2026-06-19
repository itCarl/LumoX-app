// Scene FX renderers — the per-tick animation for dynamic scene types
// (COLOR FX, MOVE FX, CURVE FX). The SceneMixer calls these to paint a scene's
// animated frame before blending it. Targets are universe-absolute 1-based DMX
// channels. Each renderer is pure: same inputs → same output.

import { hsvToRgb, hexToRgb, type Rgb } from '../util/Color';
import type { ColorFxConfig, MoveFxConfig, MoveShape, CurveWave, MatrixFxConfig } from '../show/Scene';
import type { Vec2 } from '../fixtures/emitterGeometry';

const clamp8 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const TAU = Math.PI * 2;

/** Deterministic pseudo-random 0..1 for a fixture index (no global RNG). */
function hash01(i: number): number {
  const s = Math.sin((i + 1) * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Sample a palette (ring) at position p (wraps). `fade` shapes the transition
 * between stops: 1 = smooth linear blend, 0 = hard cut at the midpoint.
 */
function samplePalette(palette: Rgb[], p: number, fade = 1): Rgb {
  const n = palette.length;
  if (n === 1) return palette[0];
  const x = ((p % 1) + 1) % 1 * n;          // 0..n
  const i = Math.floor(x) % n;
  const j = (i + 1) % n;
  let f = x - Math.floor(x);
  if (fade < 1) f = fade <= 0 ? (f < 0.5 ? 0 : 1) : clamp01((f - (0.5 - fade / 2)) / fade);
  const a = palette[i], b = palette[j];
  return { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f };
}

/** Desaturate a colour toward its luminance grey by (1 - sat). */
function applySat(col: Rgb, sat: number): Rgb {
  if (sat >= 1) return col;
  const y = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  const k = 1 - clamp01(sat);
  return { r: col.r + (y - col.r) * k, g: col.g + (y - col.g) * k, b: col.b + (y - col.b) * k };
}

/**
 * COLOR FX — a colour gradient travelling along the rig. With no palette it is a
 * full-spectrum rainbow; with a palette it samples that gradient. `colorWidth`
 * compresses the gradient across the fixtures, `angle` offsets the start, and
 * the look scrolls with `now / periodMs`. `grayscale` collapses to luminance.
 */
export function renderColorFx(
  buf: Uint8Array, targets: number[][], now: number, periodMs = 4000, spreadDeg = 30,
  cfg?: ColorFxConfig,
): void {
  const n = targets.length;
  const scroll = now / Math.max(1, periodMs);
  const width = cfg ? Math.max(0, cfg.colorWidth) : 1;
  const angle = cfg ? cfg.angle : 0;
  const sat = cfg?.saturation ?? 1;
  const fade = cfg?.fade ?? 1;
  const randomize = cfg?.randomize ?? false;
  const palette = cfg && cfg.palette.length ? cfg.palette.map(hexToRgb) : null;

  for (let i = 0; i < n; i++) {
    const [r, g, b] = targets[i];
    const idx = i;   // sweep order is realised by the app ordering the target array
    const jitter = randomize ? hash01(i) : 0;
    let col: Rgb;
    if (palette) {
      // each fixture sits at a point along the gradient, scrolling over time
      const p = scroll + (idx / Math.max(1, n)) * width + angle / 360 + jitter;
      col = applySat(samplePalette(palette, p, fade), sat);
    } else {
      const hue = scroll * 360 + idx * spreadDeg * width + angle + jitter * 360;
      col = hsvToRgb({ h: hue, s: clamp01(sat), v: 1 });
    }
    if (cfg?.grayscale) {
      const y = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
      col = { r: y, g: y, b: y };
    }
    buf[r - 1] = clamp8(col.r); buf[g - 1] = clamp8(col.g); buf[b - 1] = clamp8(col.b);
  }
}

/**
 * MATRIX FX — a per-emitter colour field driven by each emitter's 2D world
 * position (true pixel-mapping). `targets[i]` is the `[r,g,b(,w)]` channel tuple
 * for emitter `i`; `positions[i]` is its world coordinate. Positions are
 * normalized to the rig's bounding box each tick, so the pattern fills the whole
 * stage regardless of absolute scale. `wipe` sweeps a gradient along `angle`,
 * `radial` rings out from the centre, `plasma` is a classic 2D interference
 * field; all scroll with `now / periodMs`. Empty palette ⇒ full-spectrum rainbow.
 */
export function renderMatrixFx(
  buf: Uint8Array, targets: number[][], positions: Vec2[], now: number, periodMs = 4000,
  cfg?: MatrixFxConfig,
): void {
  const n = Math.min(targets.length, positions.length);
  if (!n) return;
  const pattern = cfg?.pattern ?? 'wipe';
  const sat = cfg?.saturation ?? 1;
  const fade = cfg?.fade ?? 1;
  const scale = Math.max(0.01, cfg?.scale ?? 1);
  const angle = ((cfg?.angle ?? 0) * Math.PI) / 180;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const palette = cfg && cfg.palette.length ? cfg.palette.map(hexToRgb) : null;
  const scroll = now / Math.max(1, periodMs);

  // Normalize positions to 0..1 over the rig's bounding box (centre = 0.5,0.5).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = positions[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;

  for (let i = 0; i < n; i++) {
    const t = targets[i];
    const nx = (positions[i].x - minX) / spanX;          // 0..1
    const ny = (positions[i].y - minY) / spanY;
    let p: number;
    if (pattern === 'radial') {
      p = scroll + Math.hypot(nx - 0.5, ny - 0.5) * 2 * scale;
    } else if (pattern === 'plasma') {
      const v = Math.sin(nx * scale * TAU + scroll * TAU)
        + Math.sin(ny * scale * TAU - scroll * TAU)
        + Math.sin((nx + ny) * scale * Math.PI + scroll * TAU);
      p = (v + 3) / 6;   // -3..3 → 0..1
    } else {
      p = scroll + ((nx - 0.5) * ca + (ny - 0.5) * sa) * scale;   // wipe
    }
    const col = palette
      ? applySat(samplePalette(palette, p, fade), sat)
      : hsvToRgb({ h: ((p % 1) + 1) % 1 * 360, s: clamp01(sat), v: 1 });
    buf[t[0] - 1] = clamp8(col.r);
    buf[t[1] - 1] = clamp8(col.g);
    buf[t[2] - 1] = clamp8(col.b);
  }
}

/** Shape path → normalized (x, y) in [-1, 1] for a phase angle θ (radians). */
function shapePoint(shape: MoveShape, theta: number): { x: number; y: number } {
  switch (shape) {
    case 'figure8': return { x: Math.sin(theta), y: Math.sin(theta) * Math.cos(theta) * 2 };
    case 'line':    return { x: Math.sin(theta), y: 0 };
    case 'square': {
      // trace the unit-square perimeter, 4 edges
      const t = (((theta / TAU) % 1) + 1) % 1 * 4;
      const e = Math.floor(t), f = t - e;
      if (e === 0) return { x: -1 + 2 * f, y: -1 };
      if (e === 1) return { x: 1, y: -1 + 2 * f };
      if (e === 2) return { x: 1 - 2 * f, y: 1 };
      return { x: -1, y: 1 - 2 * f };
    }
    case 'circle':
    default:        return { x: Math.sin(theta), y: Math.cos(theta) };
  }
}

/**
 * MOVE FX — a pan/tilt path across the [pan,tilt] address pairs around the 128
 * centre. `shape` picks the path, `size` is the 8-bit amplitude, and `spreadDeg`
 * phase-offsets each fixture so they fan along the path. `symmetry` mirrors
 * every other fixture's pan for in/out fanning.
 */
export function renderMoveFx(
  buf: Uint8Array, targets: number[][], now: number, periodMs = 4000, size = 96, spreadDeg = 30,
  cfg?: MoveFxConfig,
): void {
  const w = (TAU * now) / Math.max(1, periodMs);
  const shape = cfg?.shape ?? 'circle';
  const sizeX = cfg?.sizeX ?? 1;
  const sizeY = cfg?.sizeY ?? 1;
  const cx = cfg?.centerX ?? 128;
  const cy = cfg?.centerY ?? 128;
  const rot = ((cfg?.phaseShape ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  for (let i = 0; i < targets.length; i++) {
    const [pan, tilt] = targets[i];
    const ph = (i * spreadDeg * Math.PI) / 180;
    const { x, y } = shapePoint(shape, w + ph);
    const mx = cfg?.symmetry && i % 2 === 1 ? -x : x;
    // rotate the path point by phaseShape, then scale per axis
    const rx = mx * cosR - y * sinR;
    const ry = mx * sinR + y * cosR;
    buf[pan - 1] = clamp8(cx + rx * size * sizeX);
    buf[tilt - 1] = clamp8(cy + ry * size * sizeY);
  }
}

/** Waveform value in 0..1 for phase θ (radians); `duty` shapes the square wave. */
function waveValue(wave: CurveWave, theta: number, i: number, duty = 0.5): number {
  const t = ((theta / TAU) % 1 + 1) % 1;          // 0..1
  switch (wave) {
    case 'triangle': return 1 - Math.abs(2 * t - 1);
    case 'sawtooth': return t;
    case 'square':   return t < clamp01(duty) ? 1 : 0;
    case 'random':   { const s = Math.sin((Math.floor(theta / TAU) + 1) * (i + 1) * 12.9898) * 43758.5453; return s - Math.floor(s); }
    case 'sine':
    default:         return (Math.sin(theta) + 1) / 2;
  }
}

/** Shared config shape for CURVE / VALUE layers (a waveform mapped to [min,max]). */
interface WaveCfg {
  waveform: CurveWave;
  min: number;
  max: number;
  duty: number;
  invert: boolean;
  staticValue?: number | null;
}

/**
 * WAVE FX (CURVE / VALUE layers) — a waveform mapped into [min,max] on the
 * single-address `targets`. `duty` shapes the square wave, `invert` flips it,
 * `spreadDeg` travels the wave along the rig. A non-null `staticValue` holds a
 * flat level (no animation).
 */
export function renderWaveFx(
  buf: Uint8Array, targets: number[][], now: number, periodMs = 4000, spreadDeg = 30,
  cfg?: WaveCfg,
): void {
  const wave = cfg?.waveform ?? 'sine';
  const min = cfg?.min ?? 0;
  const max = cfg?.max ?? 255;
  const duty = cfg?.duty ?? 0.5;
  const invert = cfg?.invert ?? false;
  const flat = cfg?.staticValue;
  const base = (TAU * now) / Math.max(1, periodMs);
  for (let i = 0; i < targets.length; i++) {
    const [addr] = targets[i];
    if (flat != null) { buf[addr - 1] = clamp8(flat); continue; }
    const ph = (i * spreadDeg * Math.PI) / 180;
    let w = waveValue(wave, base + ph, i, duty);
    if (invert) w = 1 - w;
    buf[addr - 1] = clamp8(min + (max - min) * w);
  }
}

/** Shared config shape for the CHASER layer. */
interface ChaserCfg {
  litCount: number;
  gap: number;
  fade: number;
  level: number;
  bg: number;
}

/**
 * CHASER FX — a lit window walking across the single-address `targets`. The
 * head advances one full ring per `periodMs`; `litCount` fixtures are lit at a
 * time (with `gap` dark fixtures between repeats), `fade` softens the tail,
 * `level`/`bg` set the lit/unlit values. Direction comes via a signed `now`.
 */
export function renderChaserFx(
  buf: Uint8Array, targets: number[][], now: number, periodMs = 4000,
  cfg?: ChaserCfg,
): void {
  const n = targets.length;
  if (!n) return;
  const litCount = Math.max(1, Math.round(cfg?.litCount ?? 1));
  const gap = Math.max(0, Math.round(cfg?.gap ?? 0));
  const fade = clamp01(cfg?.fade ?? 0);
  const level = cfg?.level ?? 255;
  const bg = cfg?.bg ?? 0;
  // No gap ⇒ a single window of `litCount` walking the ring; gap ⇒ repeating windows.
  const span = gap > 0 ? litCount + gap : Math.max(litCount, n);
  const head = Math.floor((now / Math.max(1, periodMs)) * n);
  for (let i = 0; i < n; i++) {
    const [addr] = targets[i];
    const d = (((i - head) % n) + n) % n;   // distance behind the head
    const m = d % span;
    let v = bg;
    if (m < litCount) {
      const tail = litCount > 1 ? m / litCount : 0;   // 0 at head edge → 1 at window end
      const k = fade > 0 ? 1 - tail * fade : 1;
      v = bg + (level - bg) * k;
    }
    buf[addr - 1] = clamp8(v);
  }
}

