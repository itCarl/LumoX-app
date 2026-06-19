---
name: lumox-ui-design
description: Design and restyle Lumox renderer UI so it reads as a deliberate, professional DMX/lighting control surface — not a generic AI-generated dashboard. Use whenever building or reshaping anything in renderer/ (views, widgets, modals, CSS). Encodes Lumox's token system, UI laws, and a plan→critique→build→screenshot loop.
license: Adapted in-house from anthropics/claude-code frontend-design (Apache-2.0), retuned for a dense professional control surface.
---

# Lumox UI Design

You are the design lead for **Lumox**, a wireless DMX lighting controller. The
renderer is not a marketing page or a generic SaaS dashboard — it is a **live
performance instrument**. Treat it the way a console manufacturer treats a
hardware surface: every pixel earns its place, the operator's eyes are on the
stage and not the screen, and a wrong or laggy control during a show is a
failure, not a blemish.

Generic, "looks like AI made it" UI is the thing to defeat. That look comes from
**templated defaults applied regardless of subject** — not from any one colour.
Here it shows up as: evenly-spaced card grids with drop shadows and big rounded
corners, purple/indigo gradient accents, emoji or oversized hero headings, a
left sidebar of icon+label rows, "stat cards" with a big number and a tiny
label, and decorative motion that serves nothing. Lumox must instead read as a
**purpose-built tool**: dense where density helps, calm everywhere else, with
one or two memorable signature elements and nothing extra.

## Ground it in the subject

Before designing any surface, name three things and state them:

- **What** — the concrete object on screen (a patch grid, a scene rack, a stage
  plot, a fader bank, a transport clock). Design *that thing*, not a card that
  happens to contain it.
- **Who** — a lighting operator / designer, often in a dark venue, working fast
  with split attention, frequently dragging live controls during a show.
- **The one job** — what this surface must let them do in one glance or one
  gesture. Everything else is subordinate to it.

Distinctive choices come from the domain's own world: DMX channels, universes,
addresses, emitters, groups, banks, beats/BPM, fan & phase. Lean into that
vocabulary and those visual metaphors instead of importing generic dashboard
furniture.

## What professional control surfaces do

Real lighting consoles and DMX software (describe them generically — **never name
a competitor** anywhere, per the project rule) converge on a recognisable
workflow. Match these conventions so the tool feels native to operators, and
borrow nothing that doesn't serve them:

- **Modular blocks, not one mega-screen** — distinct areas for patch, scene/cue
  programming, and effects. Lumox's docked tiles already follow this.
- **Drag from a fixture library onto a patch grid** — addressing is spatial and
  direct, not a form.
- **A 2D stage / plot** for positioning fixtures, often with shape tools (line,
  circle, matrix) and a notion of selection order.
- **Faders / levels** as the primary programming gesture; values are recorded
  into **scenes**, which arrange into **cue lists with fade/timing**.
- **Live, real-time feedback** — the surface reflects current output constantly
  (levels, colours, beat), because the operator is steering a live show.
- **Dense, glanceable, dark** — built for dim venues and split attention.

When you design a new Lumox surface, ask which of these established patterns it
is, and honour that operator's muscle memory rather than inventing a novel
interaction.

## Aesthetic direction: soft modern dark

The target look is **soft modern** — premium, calm, and tactile, the opposite of
both flat-clinical and harsh-utilitarian. Crucially this is *not* in tension with
the flat, low-border laws below: softness comes from **light, depth, and motion**,
not from heavy outlines or bubbly shapes.

- **No pure black; layered greys.** Lumox already does this well (`--bg` `#1a1a1a`
  up through `--bg-4`). Keep building depth by **stepping the fill scale**, which
  reads as gentle elevation.
- **Depth via soft shadow, not borders.** For floating layers (modals, menus,
  popovers, dropped tiles) use a single soft, diffuse shadow — the existing
  `0 8px 26px rgba(0,0,0,.55)` / `0 16px 50px rgba(0,0,0,.6)` are the reference.
  Do **not** go full neomorphism (dual inset/outset shadows): it's low-contrast,
  dated, and fails accessibility.
- **Restrained, not bubbly, radius.** Keep corners modest (6px tokens; large
  surfaces like modals may go to ~8px). Softness is in the shadow and motion, not
  oversized pills — that keeps faith with the tight-radius preference.
- **Muted, single accent.** The `#5eb3ff` blue is the calm accent; let semantic
  group/scene/bank colours provide the colour interest. Avoid saturated
  gradients and multi-accent rainbows.
- **Smooth, short easing.** Transitions in the 70–150ms range (the codebase
  already uses `0.12s` on chrome and `70ms` on live colour). Everything settles
  gently; nothing snaps.
- **Generous-but-organised spacing.** Soft ≠ sparse; keep density, but give
  groups breathing room and a consistent rhythm so it feels composed, not cramped.

> This direction refines — does not override — the UI laws below. If "soft" ever
> seems to argue for more borders or much larger radii, resolve it toward depth
> and motion instead.

## The design system is not yours to reinvent

Lumox already has a coherent dark-theme token system in
[renderer/styles/main.css](../../../renderer/styles/main.css). **Reuse it; never
hardcode a parallel palette.** This consistency is most of what separates a real
product from AI slop.

- **Surfaces** — `--bg` (panel) → `--bg-2` → `--bg-3` → `--bg-4`. Layer depth by
  **fill**, stepping up the scale; that is the primary way to separate elements.
- **Text** — `--fg` (primary), `--fg-dim` (labels, secondary, units).
- **Accent** — `--accent` (`#5eb3ff`) means *interactive / selected / focused*.
  Spend it sparingly so it keeps that meaning; don't paint inert chrome with it.
- **Structure** — `--border` (`#383838`) and `--radius` (6px) only where a line
  genuinely carries structure (see UI laws below).
- **Semantic colour is data, not decoration** — group colours (`--fx`), scene
  colours (`--sc`), bank colours (`--bank`) encode identity. Tint with
  `color-mix(in srgb, var(--…) N%, …)`, the way the existing cells/strips do.
  Danger/destructive uses the established red family (`#e0564b` / `#ff9b91`).
- **Icons** — Font Awesome `<i>` elements, sized in px to match neighbours.
- **Numerics** — `font-variant-numeric: tabular-nums` for any live/changing
  number (BPM, addresses, timecode) so digits don't jitter.
- **Type** — `system-ui` at 14px base; labels ~11px with letter-spacing.
  Hierarchy comes from size/weight/colour/spacing, **not** decorative fonts. A
  control surface wants neutral, legible type — the frontend-design "characterful
  display face" advice does **not** apply here; that would itself read as AI-y.

If a new need genuinely isn't covered, add a token at `:root` (or scope one
locally, as `.sceneprops-tile` scopes `--radius: 4px`) rather than a one-off
literal.

## Lumox UI laws (non-negotiable taste)

These come straight from the user's stated preferences — follow them by default:

1. **Flat, low-noise — fewer borders.** Separate elements by background fill
   (`--bg-2/3/4`), not 1px borders. Keep borders only where structural: rail
   dividers, segmented-control seams, swatches, focus/selection rings.
2. **Tight radius, even rhythm.** Tighten corners; use one spacing scale
   consistently, not ad-hoc per-rule paddings.
3. **Smooth live feedback — never jump.** Anything that drives a preview updates
   continuously on `input` (not just `change`); edits must not snap or reset
   animation state. A control that lurches mid-drag is a bug.
4. **Drill-down / rail navigation over nesting.** For a busy panel in a narrow
   column, avoid "containers within containers", many tabs, and inline
   accordions. Prefer **one full-width thing at a time**: a persistent compact
   icon rail to switch top-level sections, and a `← back` link to drill into
   detail (the Scene panel's Base/FX/Scene/Advanced rail is the reference).
5. **Density without clutter.** Pro operators prefer information-dense over
   airy, but density must be *organised* — alignment, grouping, and quiet
   chrome — never a wall of competing borders and accents.

## Motion

Motion exists to communicate live state, not to entertain. Good: a beat LED
pulsing on tempo, a scene level rising as a tinted fill, a smooth colour
transition on an emitter, a hover highlight. Bad: page-load reveals, staggered
card entrances, parallax, anything decorative. Extra animation is one of the
strongest "AI-generated" tells in a tool like this. Respect
`prefers-reduced-motion`.

## Process: plan → self-critique → build → screenshot → critique again

1. **Plan in prose first** (mostly in your thinking). For the surface at hand,
   decide: which tokens/fills define its depth, what the *one* signature element
   is, what the spacing rhythm is, and how navigation works (rail? drill-down?).
   Sketch an ASCII wireframe to compare layouts before writing CSS.
2. **Critique the plan against the generic default.** Ask: *if I gave this same
   brief to any AI, would I land here?* If yes — the card grid, the gradient, the
   stat card, the icon sidebar — change it and say why. Where Lumox already
   solves a similar surface, match that solution for consistency.
3. **Build** by composing existing classes/tokens; extend the system rather than
   forking it. Mind CSS specificity — type-based (`.section`) vs element-based
   (`.cta`) selectors easily cancel each other's margins/paddings.
4. **Look at it.** Use the **run-app** skill to launch and screenshot the real
   app, then critique the screenshot — a picture is worth 1000 tokens. Verify
   live feedback by dragging, not just static layout.
5. **Remove one thing.** Before declaring done, find the least-necessary
   accessory (a border, a shadow, an accent, a label doing double duty) and cut
   it.

## Quality floor

Responsive within its dock/panel; **visible keyboard focus** (accent border/ring
— the global `outline: none` means you must provide an explicit `:focus` style);
reduced-motion respected; no layout jump on state change (see the `ws-top`
flex-basis note in the CSS for why height feedback loops cause jumps).

## Writing in the UI

Copy is design material. Label things by what the operator controls and
recognises (DMX vocabulary), never by how the engine is built. Active voice on
controls ("Recall", "Capture"), and an action keeps its name through the whole
flow. Errors are specific and in the interface's voice; empty states invite the
next action. Everything in English (project rule).

## References

- **Design preferences (authoritative taste):** the `ui-design-preferences`
  auto-memory — flat fills, tight radius, smooth live feedback, drill-down/rail.
- **CSS conventions:** [docs/knowledge-base/conventions.md](../../../docs/knowledge-base/conventions.md).
- **What the surfaces are:** the renderer/view docs, esp.
  [selection.md](../../../docs/knowledge-base/selection.md),
  [limits.md](../../../docs/knowledge-base/limits.md),
  [tempo.md](../../../docs/knowledge-base/tempo.md),
  [color.md](../../../docs/knowledge-base/color.md).
- **Reactivity (for live feedback wiring):** [reactivity.md](../../../docs/knowledge-base/reactivity.md).
- **Verify in the real app:** the `run-app` skill.
- **General anti-AI-slop philosophy this is adapted from:** the `frontend-design`
  skill — borrow its "intentional choices, one signature element, self-critique"
  spine; ignore its expressive-typography / bold-hero advice, which suits
  marketing pages, not a control surface.
