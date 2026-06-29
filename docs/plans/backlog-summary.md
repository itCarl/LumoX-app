# Backlog summary — features to build

The live **to-do** for the feature backlog: only outstanding work is tracked below.
Detailed specs for what's left live in [feature-backlog.md](feature-backlog.md); the
two MIDI slices have their own plans. When a feature ships it leaves this to-do —
its behaviour is folded into `docs/knowledge-base/` (the source of truth) and the
tables in `lumox-app/CLAUDE.md`.

**Status:** 🟡 in progress · 📋 planned (spec written, not started) · ⏸ parked (lowest priority) — **Effort:** S (≤½ day) · M (1–2 d) · L (3–5 d) · XL (week+)

## To do

| Feature | Status | Effort | Outstanding scope |
| --- | --- | --- | --- |
| Stand-alone export | ⏸ parked | XL | Compile a show a node plays without the app (scenes + triggers + schedules). Spans app + firmware. |
| Touch interface & remote | ⏸ parked | XL | Custom touch widget pages + phone/tablet remote, bound to the MIDI Action registry's actions. |

**No active build right now** — Input mapping & MIDI-learn and Matrix / strip both
shipped in full (see Done below). The two parked items stay parked until explicitly
reprioritised.

## Done (out of the to-do — see the knowledge base)

Shipped features no longer tracked here; the KB is their source of truth:

- **Ordered selections** + group-order editor — [selection.md](../knowledge-base/selection.md)
- **Per-fixture limits** (range remap, dimmer cap, swap, channel fade/dim flags) — Limits tile + [limits.md](../knowledge-base/limits.md)
- **FX-layer rack** — `fxpalette.ts` + [mix-engine.md](../knowledge-base/mix-engine.md)
- **Colour palettes & FX presets** — `fxpalette.ts`
- **Cue / scene semantics** — [mix-engine.md](../knowledge-base/mix-engine.md)
- **Settings store** — [settings.md](../knowledge-base/settings.md)
- **BPM sources** — [tempo.md](../knowledge-base/tempo.md)
- **Audio-reactive input** shared spectrum capture + input picker + band/volume/beat → target bindings, incl. **FX-layer scalar targets** (speed/size/spread) — [audio.md](../knowledge-base/audio.md)
- **Input mapping & MIDI-learn** (complete) — click-to-assign (APC + any controller),
  LED feedback + software mirror, per-project persistence, and a typed **Action
  registry** (`midiActions.ts`) shared by dispatch + UI, with absolute/relative
  (encoder) range mode — [midi.md](../knowledge-base/midi.md)
- **Matrix / strip fixtures & pixel effects** — in-app matrix/strip generator
  (`buildMatrixDefinition` + Create matrix/strip panel) saved as a Custom fixture,
  plus 2D matrix-aware FX sweep orders (`row`/`column`/`diagonal`) — pixel-mapping
  itself is the MATRIX FX layer — [fixtures.md](../knowledge-base/fixtures.md) + [mix-engine.md](../knowledge-base/mix-engine.md)

## MIDI slices (Input mapping)

- [midi-control-surface.md](midi-control-surface.md) — the broad Action-registry vision: app MIDI device management, generic bindings, InputRouter + FeedbackEngine, MIDI-learn, Devices view. 4 shippable phases.
- [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md) — first concrete slice: a separate "just clicky" MIDI window, APC Mini MK2 only, click-to-assign any control to any function.
