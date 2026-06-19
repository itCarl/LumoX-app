/**
 * Color — an immutable RGB value object plus the standalone conversions
 * between the colour models the app deals with (RGB, HSV, HSL, CMY, hex).
 *
 * One home for all colour maths: the mix engine (scene/group FX), fixture
 * colour hints, and the renderer can share the same, tested conversions
 * instead of re-deriving hex parsing and HSV maths in each place. The module
 * is pure (no Node/DOM), so it is safe to use in the engine and the renderer.
 *
 * Component ranges (kept explicit because they are the easy thing to get wrong):
 *   Rgb  r,g,b in 0..255 (8-bit DMX-friendly)
 *   Hsv  h in 0..360 (degrees), s,v in 0..1
 *   Hsl  h in 0..360 (degrees), s,l in 0..1
 *   Cmy  c,m,y in 0..1 (subtractive — multiply by 255 for CMY fixtures)
 */

/** Red/green/blue, each 0..255. */
export interface Rgb { r: number; g: number; b: number; }
/** Hue 0..360°, saturation/value 0..1. */
export interface Hsv { h: number; s: number; v: number; }
/** Hue 0..360°, saturation/lightness 0..1. */
export interface Hsl { h: number; s: number; l: number; }
/** Cyan/magenta/yellow, each 0..1 (subtractive). */
export interface Cmy { c: number; m: number; y: number; }

const clamp8 = (n: number): number => (n <= 0 ? 0 : n >= 255 ? 255 : Math.round(n));
const clamp01 = (n: number): number => (n <= 0 ? 0 : n >= 1 ? 1 : n);
const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

// ---- standalone model conversions -------------------------------------

/** Parse `#rgb`, `#rrggbb` (or without the `#`) into bytes. Throws on bad input. */
export function hexToRgb(hex: string): Rgb {
  let s = String(hex).trim().replace(/^#/, '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error(`Invalid hex color: "${hex}"`);
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** Bytes → lowercase `#rrggbb`. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number): string => clamp8(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = wrapHue(h * 60);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = wrapHue(h);
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: clamp8((r + m) * 255), g: clamp8((g + m) * 255), b: clamp8((b + m) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = wrapHue(h * 60);
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = wrapHue(h);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: clamp8((r + m) * 255), g: clamp8((g + m) * 255), b: clamp8((b + m) * 255) };
}

export function rgbToCmy({ r, g, b }: Rgb): Cmy {
  return { c: 1 - r / 255, m: 1 - g / 255, y: 1 - b / 255 };
}

export function cmyToRgb({ c, m, y }: Cmy): Rgb {
  return { r: clamp8((1 - c) * 255), g: clamp8((1 - m) * 255), b: clamp8((1 - y) * 255) };
}

// ---- Color value object -----------------------------------------------

/**
 * Immutable RGB colour. Every operation returns a new `Color`, so instances
 * are safe to share (the named statics like `Color.RED` are frozen singletons).
 * Construct from any model via the `from*` factories; read back with the
 * `to*` accessors.
 */
export class Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;

  constructor(r: number, g: number, b: number) {
    this.r = clamp8(r);
    this.g = clamp8(g);
    this.b = clamp8(b);
    Object.freeze(this);
  }

  // --- factories ---
  static rgb(r: number, g: number, b: number): Color { return new Color(r, g, b); }
  static fromRgb({ r, g, b }: Rgb): Color { return new Color(r, g, b); }
  static fromHex(hex: string): Color { return Color.fromRgb(hexToRgb(hex)); }
  static fromHsv(hsv: Hsv): Color { return Color.fromRgb(hsvToRgb(hsv)); }
  static fromHsl(hsl: Hsl): Color { return Color.fromRgb(hslToRgb(hsl)); }
  static fromCmy(cmy: Cmy): Color { return Color.fromRgb(cmyToRgb(cmy)); }
  /** A neutral grey from a single 0..255 level. */
  static gray(level: number): Color { return new Color(level, level, level); }
  /** Read r,g,b from a byte array (e.g. a universe buffer) at `offset`. */
  static fromBytes(bytes: ArrayLike<number>, offset = 0): Color {
    return new Color(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
  }

  // --- accessors / conversions ---
  toRgb(): Rgb { return { r: this.r, g: this.g, b: this.b }; }
  toHex(): string { return rgbToHex(this); }
  toHsv(): Hsv { return rgbToHsv(this); }
  toHsl(): Hsl { return rgbToHsl(this); }
  toCmy(): Cmy { return rgbToCmy(this); }
  /** `[r, g, b]` tuple — matches the engine's `setRGB`-style call sites. */
  toArray(): [number, number, number] { return [this.r, this.g, this.b]; }
  toString(): string { return this.toHex(); }

  /** Perceived brightness 0..1 (Rec. 709 luma). */
  luminance(): number {
    return (0.2126 * this.r + 0.7152 * this.g + 0.0722 * this.b) / 255;
  }
  isDark(): boolean { return this.luminance() < 0.5; }
  isLight(): boolean { return !this.isDark(); }

  // --- operations (all return a new Color) ---
  /** Linear blend toward `other`; `t` 0 = this, 1 = other. */
  mix(other: Color, t = 0.5): Color {
    const k = clamp01(t);
    return new Color(
      this.r + (other.r - this.r) * k,
      this.g + (other.g - this.g) * k,
      this.b + (other.b - this.b) * k,
    );
  }
  /** Raise HSL lightness by `amount` (0..1). */
  lighten(amount: number): Color {
    const { h, s, l } = this.toHsl();
    return Color.fromHsl({ h, s, l: clamp01(l + amount) });
  }
  darken(amount: number): Color { return this.lighten(-amount); }
  /** Raise HSL saturation by `amount` (0..1). */
  saturate(amount: number): Color {
    const { h, s, l } = this.toHsl();
    return Color.fromHsl({ h, s: clamp01(s + amount), l });
  }
  desaturate(amount: number): Color { return this.saturate(-amount); }
  /** Rotate the hue by `deg` degrees. */
  rotate(deg: number): Color {
    const { h, s, l } = this.toHsl();
    return Color.fromHsl({ h: wrapHue(h + deg), s, l });
  }
  /** Multiply every channel by `factor` (>= 0) — a dimmer/brightness scale. */
  scale(factor: number): Color {
    const k = Math.max(0, factor);
    return new Color(this.r * k, this.g * k, this.b * k);
  }
  invert(): Color { return new Color(255 - this.r, 255 - this.g, 255 - this.b); }
  /** The colour opposite on the wheel. */
  complement(): Color { return this.rotate(180); }
  /** Collapse to a neutral grey of the same perceived brightness. */
  grayscale(): Color { return Color.gray(this.luminance() * 255); }

  equals(other: Color): boolean {
    return this.r === other.r && this.g === other.g && this.b === other.b;
  }

  // --- named constants (frozen singletons) ---
  static readonly BLACK = new Color(0, 0, 0);
  static readonly WHITE = new Color(255, 255, 255);
  static readonly RED = new Color(255, 0, 0);
  static readonly GREEN = new Color(0, 255, 0);
  static readonly BLUE = new Color(0, 0, 255);
  static readonly CYAN = new Color(0, 255, 255);
  static readonly MAGENTA = new Color(255, 0, 255);
  static readonly YELLOW = new Color(255, 255, 0);
  static readonly AMBER = new Color(255, 191, 0);
  static readonly UV = new Color(107, 0, 255);
}
