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

F1 selections · F2 limits · F3 FX-layer rack · F4 palettes · F6 cue semantics ·
F8 settings store · F10 BPM sources. See their entries in
[backlog-summary.md](backlog-summary.md) for the KB links.

## How to read a spec

Each spec below has **Goal**, **Current state** (grounded in real files), a **Plan**,
**Acceptance**, and **Touch-points**. House style: IPC channels `lumox:<area>:<action>`
with one handler module per area in `main/handlers/` (the dirty-flag wrapper in
`main/handlers/index.ts` excludes read-only/transient channels); renderer tiles talk
via the `bus` (`renderer/lib/bus.ts`, `EV.*`); DTOs in `main/dto.ts`, mappers in
`main/serializers.ts`, typed surface in `renderer/lumox.d.ts`. The engine (`src/`) is
fixture-agnostic — anything needing the patch is resolved in `main/context.ts` and
attached to the mixer (see `sceneTrack`, `buildLimitMap`).

---

## F9 — Input mapping & MIDI-learn 🟡 (L, ACTIVE) → see dedicated plans

**The only active backlog item.**

**Shipped (first slice).** The APC Mini MK2 click-to-assign flow is done — a separate
MIDI window, the assign overlay, click-to-pick + learn, bindings for
scene/group/master/blackout with executor dispatch + LED feedback, and per-project
persistence. Folded into [`docs/knowledge-base/midi.md`](../knowledge-base/midi.md); the
slice spec is [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md).

**Remaining.** The broader generic vision in
[midi-control-surface.md](midi-control-surface.md): a first-class Action registry,
non-APC / multi-device support, relative encoders, FeedbackEngine generalisation, and
the Devices view — extending naturally to OSC / keyboard / DMX-in via the same registry.

---

## F11 — Matrix / strip fixtures & pixel effects ⏸ (L, PARKED — lowest priority)

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

**Touch-points.** `main/handlers/patch.ts`, `src/fixtures/*`, `main/context.ts` (matrix
target ordering), `renderer/views/patchgrid.ts`/`stage.ts`, FX UI.

---

## F12 — Stand-alone export ⏸ (XL, PARKED — lowest priority; spans firmware)

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

## F14 — Touch interface & remote ⏸ (XL, PARKED — lowest priority; do F9 first)

**Goal.** A custom button/fader page surface (touch) and phone/tablet remote control.

**Plan (sketch).** Touch = a user-arrangeable grid of widgets bound to Actions (reuse
F9's Action registry); Remote = serve a small web UI over the node/AP network bound to
the same Actions. Both lean entirely on the Action registry, so do **F9 first**.

**Touch-points.** new touch view + a small served web surface; Action registry from F9.

---

## Notes

- **F9 is the only active item.** F11 / F12 / F14 are parked at lowest priority — do not
  start them until F9 lands and they are explicitly reprioritised.
- Keep naming generic in code/UI/docs (`conventions.md`). When a feature ships, move its
  spec out of this file, fold the behaviour into `docs/knowledge-base/`, and update the
  table in `CLAUDE.md` + [backlog-summary.md](backlog-summary.md).
