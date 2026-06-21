# Plan — MIDI mapping (APC Mini MK2): click-to-assign window

**Status:** ✅ shipped — folded into [docs/knowledge-base/midi.md](../knowledge-base/midi.md)
(the source of truth for current behaviour).

A separate **MIDI window** with point-and-click "assign mode" that binds any MIDI
control (button / fader / knob) to any Lumox function (scene, group level, master,
blackout, transport, …). Device side is **APC Mini MK2 only** (the one driver we
ship); the target side is generic. Bindings route through the same app actions as
manual operation and persist with the project.

Implementation: `main/services/MidiService.ts`, `main/handlers/midi.ts`,
`renderer/midi-window.ts`.
