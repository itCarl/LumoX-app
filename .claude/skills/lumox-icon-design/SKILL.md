---
name: lumox-icon-design
description: Create bespoke Lumox UI icons that read as one consistent, professional set — by adapting permissively-licensed public SVG icon libraries as a base/inspiration and normalising them to Lumox's house spec. Use when Font Awesome lacks a domain-true icon (DMX/lighting metaphors) and a custom SVG glyph is needed. Encodes the icon spec, source libraries + licensing, the source→normalise→optimise→integrate→screenshot loop, and the consistency checklist.
license: In-house. Adapted icons stay under their upstream permissive licenses (see Licensing).
---

# Lumox Icon Design

You are drawing glyphs for a **live performance instrument**, not a website. An
icon on this surface is read in a dim venue, at 14px, in a fraction of a second,
next to 150-odd Font Awesome glyphs. The job is a **single coherent set** where a
custom icon is indistinguishable in weight and rhythm from the rest — never a
lone hand-drawn shape that announces "someone added this one."

Custom icons exist for **one reason**: the domain has objects Font Awesome has no
good glyph for — a DMX universe, an emitter/node, a moving head vs. a scanner vs.
a par, fan & phase, a beat, a patch address. Draw *those*. Everything generic
(plus, gear, search, play, trash, chevrons) stays Font Awesome.

## The hard rule: Font Awesome first

Before drawing anything, **search Font Awesome Free Solid** for a fitting glyph.
The set is already vendored and is the house style; reusing it is free
consistency. Only when no FA Solid glyph honestly fits the *domain* concept do
you author a custom one. If you find yourself "improving" an icon FA already has,
stop — that's not a gap, that's a preference, and a one-off divergence is exactly
the inconsistency this skill exists to prevent.

A custom icon is justified when: (a) the concept is Lumox-specific
(universe/emitter/fixture-archetype/fan/beat/patch), **and** (b) no FA Solid glyph
reads as that thing at 14px, **and** (c) it will be reused, not a single-use
decoration.

## House spec — filled, to match FA Solid

Lumox uses **Font Awesome Free *Solid*** — heavy, filled glyphs, no strokes.
Custom icons MUST match that, or they read as a different family. Stroke/outline
icons (Lucide, Feather, Tabler-outline) beside FA Solid look broken; if you start
from one, convert it to a fill and thicken it.

| Property | Value | Why |
| --- | --- | --- |
| Canvas | `viewBox="0 0 512 512"` | FA's coordinate height; the safe square grid |
| Content box | centred, ~**32px** padding (content ≈ 448²) | matches FA's optical margins so sizes line up |
| Fill | `currentColor` (set via CSS, **no `fill` attr** on paths) | tints with `color:` exactly like an FA `<i>` |
| Strokes | **none** — outline shapes become filled compound paths | FA Solid has no open strokes |
| Weight | as heavy as a neighbouring `fa-square`/`fa-circle` at 16px | thin source art looks anaemic next to FA |
| Path | one compound `<path>` where possible; `fill-rule="evenodd"` for holes | small, fast, tints as one shape |
| Coords | rounded to integers on the 512 grid | clean source, no float noise |
| No | `width`/`height`/`<title>`/`style`/embedded colours/transforms-baked-in | size & colour come from CSS; markup stays pure |

Optical weight beats nominal stroke width: hold the candidate next to
`fa-bolt`/`fa-circle` at 14–16px and **match the ink**, don't measure pixels.

## Source libraries — base or inspiration (permissive only)

Start from a **filled** glyph in a permissively-licensed set, then normalise it to
the spec. These are good filled sources (offline: keep a local copy / use the npm
package, never a CDN at runtime — the app is offline and CSP forbids it):

- **Font Awesome Free Solid** *(CC BY 4.0)* — already vendored; the literal weight
  reference and best base. Trace/recombine FA primitives to stay perfectly on-family.
- **Phosphor — Fill weight** *(MIT)* — clean filled set, easy to thicken/merge.
- **Material Symbols / Material Icons — Filled** *(Apache-2.0)*.
- **Remix Icon — `*-fill` variants** *(Apache-2.0)*.
- **Boxicons — Solid** *(MIT)*; **Tabler — Filled** *(MIT)*.

Avoid stroke-only sets as a base here (you'd be rebuilding them as fills anyway).
Use them only for *inspiration* — the idea of the metaphor, not the geometry.

> **Never** trace a proprietary/competitor mark or any lighting-software logo,
> and **never name competitor software** anywhere (project rule). Describe icons
> by capability ("moving head", "universe"), not by another product.

## Workflow: source → normalise → optimise → integrate → screenshot

1. **Name the metaphor.** State the concrete thing and how an operator pictures
   it (a universe = a numbered output stream; an emitter = a node with a fan of
   beams; a mover = a yoke + head). Domain-true beats clever — a generic "magic
   sparkle" is the AI-slop tell to avoid.
2. **Pick a filled base** from the libraries above that's closest to the metaphor,
   or compose from FA primitives. Inspiration is fine; copy the *shape language*,
   not a logo.
3. **Normalise to the spec.** Re-canvas to `0 0 512 512`, centre with ~32px
   padding, convert any strokes to filled outlines, **thicken to FA Solid weight**,
   merge to one compound path with `fill-rule="evenodd"` for holes, drop all
   colour/`fill` attrs so it inherits `currentColor`, round coords to integers.
4. **Optimise** with the industry-standard **SVGO** (`npx svgo icon.svg`): strip
   metadata/comments/`width`/`height`, keep `viewBox`, merge paths, round to
   integer precision, remove `fill` so it inherits. Verify it still renders after.
5. **Integrate** (see next section) — add the inner markup to the icon module and
   render via the `icon()` helper, the way FA `<i>` is used.
6. **Look at it next to FA.** Use the **run-app** skill and screenshot the icon
   **at 14–16px sitting beside real FA glyphs** (e.g. drop it in a toolbar row).
   Critique: same ink weight? same baseline? legible silhouette at that size?
   Then **remove one detail** that won't survive 14px — fine interior lines vanish
   and just muddy the shape.

## Integration — inline SVG via the `icon()` helper

UI icons are **inline SVG**, not `<img>`/webfont (CSP-safe, tints with
`currentColor`, bundles through esbuild). They go through one helper so every call
site is identical to dropping an FA `<i>`.

- **Editable source of truth:** one optimised file per glyph in
  [renderer/icons/](../../../renderer/icons/) (e.g. `universe.svg`), each carrying a
  one-line credit comment (source + license).
- **Render module:** [renderer/lib/icons.ts](../../../renderer/lib/icons.ts) holds a
  `Record<string, string>` of each glyph's **inner** markup (the `<path>`s only) and
  an `icon(name)` helper that returns the wrapped SVG as **`raw(...)`** so it injects
  verbatim inside an `html\`\`` template (the [dom.ts](../../../renderer/lib/dom.ts)
  comment already names icons as the canonical `raw()` use case):

  ```ts
  import { raw } from './dom';
  const GLYPHS: Record<string, string> = {
    universe: '<path fill-rule="evenodd" d="…"/>',
  };
  export function icon(name: keyof typeof GLYPHS) {
    return raw(
      `<svg class="lx-icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false">${GLYPHS[name]}</svg>`,
    );
  }
  ```

  Use it in a view exactly where an FA `<i>` would sit:
  `html\`<button class="cx-add">${icon('universe')} Add universe</button>\``.
- **One CSS rule** in [main.css](../../../renderer/styles/main.css) makes it size and
  align like FA (sized by `font-size`, tinted by `color`):

  ```css
  .lx-icon { width: 1em; height: 1em; fill: currentColor; vertical-align: -.125em; }
  ```

  `-.125em` is FA's baseline offset, so custom and FA glyphs sit on the same line.
- **Accessibility:** decorative icons keep `aria-hidden="true"`/`focusable="false"`
  (as above); the meaning lives in the button's text/`title`, like FA.

## Consistency checklist (the whole point)

Before keeping an icon, every box must be true — these are what make N icons look
like one set:

- [ ] FA Solid genuinely lacks this — it's a real **domain** gap, reused not one-off.
- [ ] Filled, `0 0 512 512`, content centred with ~32px padding.
- [ ] Ink weight **matches a neighbouring FA Solid glyph at 16px** (checked on screen).
- [ ] No strokes, no embedded colour, no `fill` attr — inherits `currentColor`.
- [ ] One compound path with `fill-rule="evenodd"` for holes; integer coords; SVGO-clean.
- [ ] Sits on the FA baseline (`.lx-icon` rule), reads at 14px, silhouette is clear.
- [ ] Source file + credit comment in `renderer/icons/`; entry in `CREDITS.md`.
- [ ] Cut at least one detail that wouldn't survive 14px.

## Licensing

Adapted icons remain under their **upstream license** — keep MIT/Apache/CC-BY
sources only. Record provenance in `renderer/icons/CREDITS.md`: one row per icon
with *name, source library, license, what was modified*. CC BY (Font Awesome)
**requires attribution**; MIT/Apache want a retained notice. Heavily-redrawn
icons are still derivatives — credit the base. Never adapt anything you don't have
a permissive license for.

## References

- **Visual language & tokens this lives inside:** the `lumox-ui-design` skill
  (soft modern dark, single accent, the UI laws) — icons obey it.
- **Icon convention (FA Solid, no inline SVG for *generic* icons):**
  [docs/knowledge-base/conventions.md](../../../docs/knowledge-base/conventions.md).
- **Markup helpers:** [renderer/lib/dom.ts](../../../renderer/lib/dom.ts) (`html`/`raw`),
  [renderer/lib/html.ts](../../../renderer/lib/html.ts) (`esc`).
- **Existing inline-SVG precedent (diagrams):** [renderer/lib/knob.ts](../../../renderer/lib/knob.ts).
- **App brand mark (separate concern — one icon, raster pipeline):**
  [docs/knowledge-base/icon.md](../../../docs/knowledge-base/icon.md).
- **Verify on screen, beside FA, at 14px:** the `run-app` skill.
