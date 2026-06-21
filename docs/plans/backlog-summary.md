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
| Input mapping & MIDI-learn | 🟡 active | M | Click-to-assign shipped (APC + any controller, LED feedback, persistence) with an expanded target set (scenes, group intensity + flash, channel faders, master, blackout, tap tempo) → [midi.md](../knowledge-base/midi.md). **Remaining:** generic Action registry, relative encoders, and a fuller **FeedbackEngine** (device ↔ software state mirror) → [midi-control-surface.md](midi-control-surface.md). *(Multi-device support and hardware-side encoder/motor-fader feedback dropped — out of scope.)* |
| Matrix / strip fixtures & pixel effects | ⏸ parked | L | In-app matrix/strip creation + 2D pixel-mapped FX ordering. |
| Stand-alone export | ⏸ parked | XL | Compile a show a node plays without the app (scenes + triggers + schedules). Spans app + firmware. |
| Touch interface & remote | ⏸ parked | XL | Custom touch widget pages + phone/tablet remote, bound to Input mapping's Actions. Do Input mapping first. |

**Input mapping & MIDI-learn is the only active build**; the parked items stay parked
until it is done and they are explicitly reprioritised.

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
- **Input mapping (first slice)** APC click-to-assign — [midi.md](../knowledge-base/midi.md)

## MIDI slices (Input mapping)

- [midi-control-surface.md](midi-control-surface.md) — the broad Action-registry vision: app MIDI device management, generic bindings, InputRouter + FeedbackEngine, MIDI-learn, Devices view. 4 shippable phases.
- [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md) — first concrete slice: a separate "just clicky" MIDI window, APC Mini MK2 only, click-to-assign any control to any function.
