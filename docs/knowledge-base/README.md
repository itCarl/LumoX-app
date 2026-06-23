# Lumox App — Knowledge Base

Source-of-truth docs for **lumox-app** (the Electron DMX controller), one markdown per topic; [`../../CLAUDE.md`](../../CLAUDE.md) is the lean orientation map that links here.

## Maintenance rule

**Keep this current — this is mandatory.** For **every new feature** (or
behaviour change): add a focused new `.md` here (or extend the relevant existing
one) **and** link it in the index table below **and** in the `CLAUDE.md`
Knowledge Base table. Every markdown in this folder MUST appear in both tables.

## Index

| Document | Scope |
| --- | --- |
| [architecture.md](architecture.md) | App's place in the system — host/controller, ESP32 nodes, Art-Net/sACN flow |
| [app.md](app.md) | Electron app — engine/shell split, modular IPC, renderer, build |
| [reactivity.md](reactivity.md) | Renderer reactivity — `@preact/signals-core`, shared `store.ts`, signals vs. event bus |
| [mix-engine.md](mix-engine.md) | Engine tick loop, MixPipeline, universe buffers, scenes/groups/banks |
| [htp-ltp.md](htp-ltp.md) | HTP/LTP merge model — intensity HTP, attributes LTP; per-channel blend, LTP mask + set mask, home-default override, faders mirror live movement |
| [fixtures.md](fixtures.md) | Fixture model + channel-type taxonomy, JSON import, validation, library (built-in + Custom) |
| [selection.md](selection.md) | Live ordered selection — FX fan/phase target, index badges, `lumox:selection:*` IPC |
| [limits.md](limits.md) | Per-fixture output limits — dimmer cap, pan/tilt range/invert, swap; `Limits` stage, `lumox:fixtures:setLimits` |
| [color.md](color.md) | Colour — `hsvToBytes`/`hexToBytes` DMX-byte bridges over culori |
| [midi.md](midi.md) | MIDI control surfaces — backend/port/controller layers, APC Mini MK2 mapping, CLI |
| [tempo.md](tempo.md) | Master tempo & BPM sources — manual/tap, MIDI clock (24 ppqn), audio onset, Ableton Link; `lumox:transport:*` IPC |
| [busking.md](busking.md) | Busking — live, improvised operation: banks/scenes as the surface, base look + FX rack, palettes, groups, HTP/LTP, beat-sync, punt look |
| [artnet-protocol.md](artnet-protocol.md) | Art-Net + sACN wire protocol the app emits (+ discovery) |
| [connection.md](connection.md) | Connection tab — DMX output transport + live status |
| [discovery.md](discovery.md) | Network node discovery — ArtPoll listener, device list, Assign to a universe |
| [settings.md](settings.md) | Application settings — language, appearance, autosave/startup (userData store) |
| [undo-redo.md](undo-redo.md) | Undo / redo — whole-show snapshots at the dirty-flag seam, coalesced gestures, Ctrl+Z/Y |
| [conventions.md](conventions.md) | Coding conventions — language, comments, naming, CSS |
| [icon.md](icon.md) | App icon + brand mark — SVG source, offline raster/.ico generation, wiring |
| [build-run.md](build-run.md) | Build & run commands |
| [e2e-tests.md](e2e-tests.md) | End-to-end tests — Playwright Electron driver over the real app (Chromium-only, 1920×1080) |
| [security.md](security.md) | Electron security baseline + audit checklist |
