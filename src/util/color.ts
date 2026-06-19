/**
 * Colour helpers — thin DMX-byte bridges over culori.
 *
 * All colour maths (model conversions, parsing, blending) lives in culori; the
 * engine only ever needs the result as 8-bit DMX bytes. These two helpers cross
 * that boundary (culori works in 0..1, DMX channels are 0..255). For anything
 * richer — HSL/CMY, perceptual interpolation, gamut mapping — import culori
 * directly rather than growing this module.
 *
 * The module is pure (no Node/DOM), so it is safe in the engine and renderer.
 */

import { converter, parse } from 'culori';

/** Red/green/blue, each 0..255 (8-bit, DMX-friendly). May be fractional. */
export interface Rgb { r: number; g: number; b: number; }

const toRgb = converter('rgb');

/** HSV (h 0..360°, s/v 0..1) → DMX bytes (0..255). */
export function hsvToBytes(h: number, s: number, v: number): Rgb {
  const c = toRgb({ mode: 'hsv', h, s, v });
  return { r: c.r * 255, g: c.g * 255, b: c.b * 255 };
}

/** CSS colour string (`#rrggbb`, `#rgb`, named, …) → DMX bytes; black on parse failure. */
export function hexToBytes(hex: string): Rgb {
  const c = parse(hex);
  if (!c) return { r: 0, g: 0, b: 0 };
  const { r, g, b } = toRgb(c);
  return { r: r * 255, g: g * 255, b: b * 255 };
}
