# Color

**Status:** stable
**Files:** `src/util/color.ts` (DMX-byte bridges over [culori](https://culorijs.org/)), consumed by `src/mix/sceneFx.ts`, `src/mix/modules/GroupEffects.ts`; `renderer/lib/colorpicker.ts` (UI colour picker)

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

For anything richer, import culori directly — `converter`, `parse`,
`interpolate`, `formatHex`, `wcagLuminance` ([culori docs](https://culorijs.org/api/)).
Runnable reference: [`examples/25-color-utility.ts`](../../examples/25-color-utility.ts).

## Renderer — colour picker

`renderer/lib/colorpicker.ts` is a small **dependency-light** colour picker for
the UI, styled to the dark control surface (`.cpick*` in `main.css`). It owns its
DOM + pointer handling and speaks **8-bit RGB** (`{ r, g, b }` 0..255) at its
edges to match DMX channel values; conversions go through culori (`converter('rgb'
| 'hsv')`), so no extra colour dependency. API: `createColorPicker({ initial,
onInput, onEnd })` → `{ el, setRgb }` — append `el` into a host, `onInput(rgb)`
fires while dragging/applying, and `setRgb()` reflects an external change
**without** re-firing `onInput` (so a two-way binding can't loop).

**Model — hue × saturation, no value.** A **hue (X) × saturation (Y)** square
(top = saturated, bottom = white) flanked by two synced sliders: **saturation**
vertical on the **left**, **hue** horizontal **below**. **Brightness is
deliberately not part of the picker** — the square always outputs full value, and
intensity comes from the **dimmer / [virtual dimmer](virtual-dimmers.md)**, so
colour and level are programmed independently (the console convention). So `setRgb`
reads hue + saturation and **ignores value** (a dimmed strip moves the level, not
the picker). Greyscale has no defined hue, so the picker keeps the last hue through
white/grey. Live **Hue (°) / Sat (%)** readouts sit above the square.

**Favourites + palettes.** Below the square is a **favourites** row of
quick-apply swatches (`+` captures the current colour; right-click removes one)
and a **`•••` palette menu**: built-in named palettes (Basic, Warm, Cool, Pastel,
Tungsten, Fire) load into the favourites row, and the current favourites can be
**saved as a named palette** (custom palettes get a delete in the menu).
Favourites and palettes are **global** (every mounted picker mirrors them via a
small module-level pub/sub) and **persist in `localStorage`**
(`lumox.color.favourites`, `lumox.color.palettes`).

It drives the **COLOR** category of the fader editor
(`renderer/views/fadereditor.ts`): each RGB-mixer block (a fixture with red +
green + blue channels) gets a picker ahead of its strips; dragging it (or applying
a favourite) engages and writes the R/G/B channels across the block's fixtures,
and dragging a strip pushes the colour back onto the picker via `setRgb`.

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
