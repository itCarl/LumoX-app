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
| Input mapping & MIDI-learn | 🟡 active | L | First slice (APC Mini MK2 click-to-assign) shipped → [midi.md](../knowledge-base/midi.md). **Remaining:** generic Action registry, non-APC / multi-device support, relative encoders, FeedbackEngine + Devices view → [midi-control-surface.md](midi-control-surface.md). |
| Audio→FX-layer parameter targets | 📋 planned | M | Extend audio bindings ([audio.md](../knowledge-base/audio.md)) to drive an FX layer's intensity/depth/speed (today: master, group intensity, raw DMX, scene/blackout triggers). Needs an addressable FX-layer-param target in the mixer. |
| Matrix / strip fixtures & pixel effects | ⏸ parked | L | In-app matrix/strip creation + 2D pixel-mapped FX ordering. |
| Stand-alone export | ⏸ parked | XL | Compile a show a node plays without the app (scenes + triggers + schedules). Spans app + firmware. |
| Touch interface & remote | ⏸ parked | XL | Custom touch widget pages + phone/tablet remote, bound to Input mapping's Actions. Do Input mapping first. |

**Input mapping & MIDI-learn is the only active build.** Audio-reactive input has shipped
(see Done); only a small FX-layer-target extension remains, spec'd above. Matrix/strip,
Stand-alone export and Touch/remote stay parked — do not start any of them until the active
work is done and they are explicitly reprioritised.

## Done (out of the to-do — see the knowledge base)

Shipped features no longer tracked here; the KB is their source of truth:

- **Ordered selections** + group-order editor — [selection.md](../knowledge-base/selection.md)
- **Per-fixture limits** (range remap, dimmer cap, swap, channel fade/dim flags) — Limits tile + [limits.md](../knowledge-base/limits.md)
- **FX-layer rack** — `fxpalette.ts` + [mix-engine.md](../knowledge-base/mix-engine.md)
- **Colour palettes & FX presets** — `fxpalette.ts`
- **Cue / scene semantics** — [mix-engine.md](../knowledge-base/mix-engine.md)
- **Settings store** — [settings.md](../knowledge-base/settings.md)
- **BPM sources** — [tempo.md](../knowledge-base/tempo.md)
- **Audio-reactive input** shared spectrum capture + input picker + band/volume/beat → target bindings — [audio.md](../knowledge-base/audio.md)
- **Input mapping (first slice)** APC click-to-assign — [midi.md](../knowledge-base/midi.md)

## MIDI slices (Input mapping)

- [midi-control-surface.md](midi-control-surface.md) — the broad Action-registry vision: app MIDI device management, generic bindings, InputRouter + FeedbackEngine, MIDI-learn, Devices view. 4 shippable phases.
- [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md) — first concrete slice: a separate "just clicky" MIDI window, APC Mini MK2 only, click-to-assign any control to any function.
