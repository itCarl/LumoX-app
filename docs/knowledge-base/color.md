# Color

**Status:** stable
**Files:** `src/util/color.ts` (DMX-byte bridges over [culori](https://culorijs.org/)), consumed by `src/mix/sceneFx.ts`, `src/mix/modules/GroupEffects.ts`

## What

Colour maths is handled by **culori** — a small, well-tested colour library. The
engine never needs colour objects of its own: it ultimately writes **8-bit DMX
bytes** (0..255), while culori works in **0..1**. `src/util/color.ts` is the thin
bridge across that boundary — two helpers and a byte-typed `Rgb` interface. It is
pure (no Node/DOM), safe in both the headless engine and the renderer bundle, and
exported from the public barrel (`src/index.ts`). For anything richer than the two
helpers (model conversions, perceptual blending, luminance, gamut mapping) import
culori directly rather than growing this module.

## How

**`Rgb`** — `{ r, g, b }`, each **0..255** (DMX-friendly; values may be fractional
until written, where they're clamped/rounded).

**`hsvToBytes(h, s, v)`** — HSV (h 0..360°, s/v 0..1) → `Rgb` bytes. Used by the
COLOR/MATRIX FX rainbow and the group rainbow effect.

**`hexToBytes(hex)`** — any CSS colour string culori understands (`#rrggbb`,
`#rgb`, named colours, `rgb(…)`, …) → `Rgb` bytes. Returns **black** on a parse
failure (safe in a per-tick render loop). Used to turn palette hex stops into
bytes.

Both are implemented with culori's `converter('rgb')` and `parse()`.

**Using culori directly** (the common ones — see the [culori docs](https://culorijs.org/api/)):

```ts
import { converter, parse, interpolate, formatHex, wcagLuminance } from 'culori';

converter('hsl')(parse('#ff8000'));        // → { mode:'hsl', h, s, l }   (0..1)
wcagLuminance('#ff8000');                  // perceived luminance 0..1
formatHex(interpolate(['red','blue'], 'oklab')(0.5));  // perceptual midpoint
```

Runnable reference: [`examples/25-color-utility.ts`](../../examples/25-color-utility.ts).

## Notes / Gotchas

- culori objects are **mode-tagged** (`{ mode: 'rgb', r, g, b }`) and use the
  **0..1** range; multiply by 255 only at the DMX boundary (that's exactly what
  the two `*toBytes` helpers do). Don't mix the two ranges by accident.
- `hexToBytes` returns **black** on unparseable input rather than throwing, so a
  bad palette/group colour can't crash a tick. Still prefer a literal fallback at
  the source where it matters (the renderer uses `f.color || '#…'`).
- For nicer colour fades prefer a **perceptual** space — `interpolate(stops, 'oklab')`
  — over linear sRGB. The FX palette blend in `sceneFx.ts` is still linear-RGB for
  determinism and its custom `fade` shaping; switch it deliberately if desired.
- culori is bundled into the Electron main process (esbuild) and resolved from
  `node_modules` for the `tsx`-run headless/CLI/examples — it is a runtime
  `dependency`, not a dev dependency.
