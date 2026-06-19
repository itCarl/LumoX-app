# Backlog summary — features to build

The live **to-do** for the feature backlog: only outstanding work is tracked below.
Detailed specs for what's left live in [feature-backlog.md](feature-backlog.md); the
two MIDI slices have their own plans. When a feature ships it leaves this to-do —
its behaviour is folded into `docs/knowledge-base/` (the source of truth) and the
tables in `lumox-app/CLAUDE.md`.

**Status:** 🟡 in progress · ⏸ parked (lowest priority) — **Effort:** S (≤½ day) · M (1–2 d) · L (3–5 d) · XL (week+)

## To do

| # | Feature | Status | Effort | Outstanding scope |
| --- | --- | --- | --- | --- |
| F9 | Input mapping & MIDI-learn | 🟡 active | L | First slice (APC Mini MK2 click-to-assign) shipped → [midi.md](../knowledge-base/midi.md). **Remaining:** generic Action registry, non-APC / multi-device support, relative encoders, FeedbackEngine + Devices view → [midi-control-surface.md](midi-control-surface.md). |
| F11 | Matrix / strip fixtures & pixel effects | ⏸ parked | L | In-app matrix/strip creation + 2D pixel-mapped FX ordering. |
| F12 | Stand-alone export | ⏸ parked | XL | Compile a show a node plays without the app (scenes + triggers + schedules). Spans app + firmware. |
| F14 | Touch interface & remote | ⏸ parked | XL | Custom touch widget pages + phone/tablet remote, bound to F9's Actions. Do F9 first. |

**F9 is the only active item.** F11 / F12 / F14 stay parked — do not start them until
F9 is fully done and they are explicitly reprioritised.

## Done (out of the to-do — see the knowledge base)

Shipped features no longer tracked here; the KB is their source of truth:

- **F1** ordered selections + group-order editor — [selection.md](../knowledge-base/selection.md)
- **F2** per-fixture limits (range remap, dimmer cap, swap, channel fade/dim flags) — Limits tile + [limits.md](../knowledge-base/limits.md)
- **F3** FX-layer rack — `fxpalette.ts` + [mix-engine.md](../knowledge-base/mix-engine.md)
- **F4** colour palettes & FX presets — `fxpalette.ts`
- **F6** cue / scene semantics — [mix-engine.md](../knowledge-base/mix-engine.md)
- **F8** settings store — [settings.md](../knowledge-base/settings.md)
- **F10** BPM sources — [tempo.md](../knowledge-base/tempo.md)
- **F9 (first slice)** APC click-to-assign — [midi.md](../knowledge-base/midi.md)

## MIDI slices (F9)

- [midi-control-surface.md](midi-control-surface.md) — the broad Action-registry vision: app MIDI device management, generic bindings, InputRouter + FeedbackEngine, MIDI-learn, Devices view. 4 shippable phases.
- [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md) — first concrete slice: a separate "just clicky" MIDI window, APC Mini MK2 only, click-to-assign any control to any function.
