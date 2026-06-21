# Plan — Feature backlog (capabilities to adopt)

**Status:** forward-looking specs for features **not yet built**. Once a feature
ships, its spec leaves this file — the knowledge base (`docs/knowledge-base/`)
becomes its source of truth and [backlog-summary.md](backlog-summary.md) tracks the
status. Per `docs/knowledge-base/conventions.md` we never name competitor software;
features are described by capability.

**Effort:** S (≤½ day) · M (1–2 days) · L (3–5 days) · XL (week+)

The full at-a-glance status of every feature (shipped + remaining) lives in
[backlog-summary.md](backlog-summary.md). This file holds only the detailed specs for
what is **still to build**.

## Already shipped (specs folded into the knowledge base)

Ordered selections · per-fixture limits · FX-layer rack · colour palettes · cue
semantics · settings store · BPM sources · audio-reactive input. See their entries in
[backlog-summary.md](backlog-summary.md) for the KB links.

## How to read a spec

Each spec below has **Goal**, **Current state**, a **Plan**, **Acceptance**, and
**Touch-points**. For the IPC/DTO/bus house style and engine-vs-show-domain split,
see [`docs/knowledge-base/conventions.md`](../knowledge-base/conventions.md).

---

## Input mapping & MIDI-learn 🟡 (L, ACTIVE) → see dedicated plans

**The only active backlog item.**

**Shipped (first slice).** The APC Mini MK2 click-to-assign flow is done — a separate
MIDI window, the assign overlay, click-to-pick + learn, bindings for
scene/group/master/blackout with executor dispatch + LED feedback, and per-project
persistence. Folded into [`docs/knowledge-base/midi.md`](../knowledge-base/midi.md); the
slice spec is [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md).

**Remaining.** The broader generic vision in
[midi-control-surface.md](midi-control-surface.md): a first-class Action registry and
relative-encoder *input* — extending naturally to OSC / keyboard / DMX-in via the same
registry. (Multi-device support and hardware-side encoder-ring / motor-fader feedback
are out of scope; the FeedbackEngine + software mirror have shipped.)

---

## Matrix / strip fixtures & pixel effects ⏸ (L, PARKED — lowest priority)

**Goal.** Create matrix/strip fixtures in-app (LED mode + width×height/arrangement, or
N LEDs) and run pixel-mapped effects across them.

**Current state.** `emitterLayout` exists on definitions and renders on the stage;
MATRIX FX already pixel-map by emitter world position. Missing: in-app matrix/strip
*creation* and matrix-aware FX sweep ordering (row/column/diagonal).

**Plan (sketch).** Patch-time generator that builds a multi-cell fixture (or a group of
single-pixel fixtures) with a 2D layout; extend the FX sweep `order` with 2D directions
(building on the shipped `FxOrder`). Pixel effects then reuse the FX rack with
matrix-aware target ordering.

**Acceptance.** Create a 10×5 RGB matrix; a COLOR FX sweeps a gradient across it in a
chosen direction.

**Touch-points.** `main/handlers/patch.ts`, `src/fixtures/*`, `main/services/SceneCompiler.ts` (matrix
target ordering), `renderer/views/patchgrid.ts`/`stage.ts`, FX UI.

---

## Stand-alone export ⏸ (XL, PARKED — lowest priority; spans firmware)

**Goal.** Compile a show so a node runs it **without the app** (scenes + simple triggers
+ clock/calendar schedules).

**Plan (sketch).** Define a compact stand-alone show format the firmware can play; an
exporter that flattens selected scenes/banks into it; transfer to the node over the
existing network link; a schedule editor (time-of-day / weekday triggers). Spans the
**app + firmware** repos — coordinate the format with `lumox-firmware`.

**Acceptance.** Export a few looks to a node; unplug the laptop; the node keeps playing /
switches on schedule.

**Touch-points.** new `main/services/StandaloneExport.ts`, a transfer channel, an
export/schedule UI, firmware-side player (separate repo).

---

## Touch interface & remote ⏸ (XL, PARKED — lowest priority; do Input mapping first)

**Goal.** A custom button/fader page surface (touch) and phone/tablet remote control.

**Plan (sketch).** Touch = a user-arrangeable grid of widgets bound to Actions (reuse
Input mapping's Action registry); Remote = serve a small web UI over the node/AP network
bound to the same Actions. Both lean entirely on the Action registry, so do **Input
mapping first**.

**Touch-points.** new touch view + a small served web surface; Action registry from
Input mapping.

---

## Notes

- Input mapping is the only active build; Matrix/strip, Stand-alone export and
  Touch/remote are parked at lowest priority until it lands and they are explicitly
  reprioritised.
- Keep naming generic in code/UI/docs (`conventions.md`). When a feature ships, move its
  spec out of this file, fold the behaviour into `docs/knowledge-base/`, and update the
  table in `CLAUDE.md` + [backlog-summary.md](backlog-summary.md).
