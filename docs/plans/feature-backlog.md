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

## Input mapping & MIDI-learn ✅ (SHIPPED IN FULL) → folded into the knowledge base

**Done.** Click-to-assign (APC Mini MK2 + any controller via the generic profile),
the assign overlay + learn flow, LED feedback + software mirror, per-project
persistence, an expanded action set (scene recall, group level + flash, channel
level, master, blackout, tap tempo, **set BPM**, **clear programmer**), a first-class
typed **Action registry** (`midiActions.ts`) shared by dispatch + the mapping UI, and
**absolute/relative (encoder) range mode** per binding. Source of truth:
[`docs/knowledge-base/midi.md`](../knowledge-base/midi.md); design history in
[midi-control-surface.md](midi-control-surface.md) +
[midi-scene-mapping-apc.md](midi-scene-mapping-apc.md).

**Out of scope (dropped):** multi-device support, hardware-side encoder-ring /
motor-fader feedback. **Deferred:** bank/cue transport actions — they belong to the
future cue-list feature, not the input layer. Extending the same registry to OSC /
keyboard / DMX-in remains a natural future direction.

---

## Matrix / strip fixtures & pixel effects ✅ (SHIPPED IN FULL) → folded into the knowledge base

**Done.** In-app **Create matrix / strip** generator (`buildMatrixDefinition` +
`lumox:library:createMatrix` + the create-matrix panel) builds a single multi-cell
RGB(W) fixture — width×height grid or N-cell strip, optional per-cell + master dimmer —
saved as a Custom library fixture and patched through the normal flow. Pixel-mapping is
the existing MATRIX FX layer (by emitter world position); added **2D matrix-aware FX
sweep orders** `row`/`column`/`diagonal` (`FxOrder`, resolved in `SceneCompiler` from
each fixture's stage centroid). Source of truth:
[`fixtures.md`](../knowledge-base/fixtures.md) (creation) +
[`mix-engine.md`](../knowledge-base/mix-engine.md) (FX orders + MATRIX FX).

**Out of scope (dropped):** the group-of-single-pixel-cells representation (a matrix is
one multi-cell fixture) and in-stage matrix shape tools.

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

## Touch interface & remote ⏸ (XL, PARKED — lowest priority)

**Goal.** A custom button/fader page surface (touch) and phone/tablet remote control.

**Plan (sketch).** Touch = a user-arrangeable grid of widgets bound to Actions (reuse
the MIDI **Action registry**, `midiActions.ts`); Remote = serve a small web UI over the
node/AP network bound to the same Actions. Both lean entirely on that registry, which
now exists — though it may want lifting from `main/services/` into a shared home if a
non-MIDI surface drives it.

**Touch-points.** new touch view + a small served web surface; the existing Action
registry.

---

## Notes

- Input mapping & MIDI-learn has shipped in full; no item is currently active.
  Matrix/strip (the natural next pick), Stand-alone export and Touch/remote are parked
  until explicitly reprioritised.
- Keep naming generic in code/UI/docs (`conventions.md`). When a feature ships, move its
  spec out of this file, fold the behaviour into `docs/knowledge-base/`, and update the
  table in `CLAUDE.md` + [backlog-summary.md](backlog-summary.md).
