# Color utility

**Status:** stable
**Files:** `src/util/Color.ts`, consumed by `src/mix/sceneFx.ts`, `src/mix/modules/GroupEffects.ts`

## What

A single home for colour maths: an immutable `Color` value object plus standalone
conversions between the colour models the app handles — **RGB, HSV, HSL, CMY, and
hex**. Before this, HSV→RGB and hex parsing were re-derived per call site; now the
engine (scene/group FX), fixture colour hints, and the renderer share one tested
implementation. The module is pure (no Node/DOM), so it is safe in both the
headless engine and the renderer bundle. Exported from the public barrel
(`src/index.ts`).

## How

**Model types** (ranges are the easy thing to get wrong, so they are explicit):

| Type | Components | Range |
| --- | --- | --- |
| `Rgb` | `r, g, b` | 0..255 |
| `Hsv` | `h, s, v` | h 0..360°, s/v 0..1 |
| `Hsl` | `h, s, l` | h 0..360°, s/l 0..1 |
| `Cmy` | `c, m, y` | 0..1 (subtractive — × 255 for CMY fixtures) |

**Standalone functions** (object in, object out): `hexToRgb`, `rgbToHex`,
`rgbToHsv`, `hsvToRgb`, `rgbToHsl`, `hslToRgb`, `rgbToCmy`, `cmyToRgb`. Use these
when you just need a one-shot conversion.

**`Color`** — immutable RGB value object. Build with `Color.rgb(r,g,b)`,
`fromHex`, `fromHsv`, `fromHsl`, `fromCmy`, `gray(level)`, or `fromBytes(buf, off)`
(read from a universe buffer). Read back with `toRgb / toHex / toHsv / toHsl /
toCmy / toArray` (the `[r,g,b]` tuple matches `setRGB`-style call sites) and
`toString` (hex). Queries: `luminance()` (Rec. 709, 0..1), `isDark` / `isLight`,
`equals`. Operations each return a **new** `Color`: `mix(other, t)`, `lighten` /
`darken`, `saturate` / `desaturate`, `rotate(deg)`, `scale(factor)` (dimmer),
`invert`, `complement`, `grayscale`. Named frozen singletons: `Color.BLACK`,
`WHITE`, `RED`, `GREEN`, `BLUE`, `CYAN`, `MAGENTA`, `YELLOW`, `AMBER`, `UV`.

Runnable reference: [`examples/25-color-utility.ts`](../../examples/25-color-utility.ts).

## Notes / Gotchas

- `hsvToRgb` wraps the hue, so `h = 360` and `h = 0` both yield red. It rounds to
  bytes — the COLOR FX rainbow and the group rainbow effect both call it, so their
  output is unchanged by the consolidation.
- `hexToRgb` / `Color.fromHex` accept `#rgb`, `#rrggbb`, or the same without `#`,
  and **throw** on anything else — guard untrusted input or keep a literal
  fallback (the renderer uses `f.color || '#…'`).
- `Color` instances are frozen; there is no in-place mutation by design.
- HSV/HSL round-trips are exact for byte colours; CMY here is the simple
  `1 − channel` device model, not an ICC/print profile.
