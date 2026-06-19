# Lumox App — Knowledge Base

Detailed documentation for **lumox-app** (the Electron DMX controller). One
markdown per topic/feature. This knowledge base is the source of truth for the
app; [`../../CLAUDE.md`](../../CLAUDE.md) is a lean orientation map that links here.

## Maintenance rule

**Keep this current — this is mandatory.** For **every new feature** (or
behaviour change): add a focused new `.md` here (or extend the relevant existing
one) **and** link it in the index table below **and** in the `CLAUDE.md`
Knowledge Base table. Every markdown in this folder MUST appear in both tables.

## Index

| Document | Scope |
| --- | --- |
| [architecture.md](architecture.md) | Where the app sits — host/controller, ESP32 nodes, Art-Net/sACN flow |
| [app.md](app.md) | Electron app — engine/shell split, modular IPC, renderer, build |
| [reactivity.md](reactivity.md) | Renderer reactivity — `@preact/signals-core` (`signal`/`effect`/`computed`), shared `store.ts`, signals vs. event bus |
| [mix-engine.md](mix-engine.md) | Engine tick loop, MixPipeline, universe buffers, scenes/groups/banks |
| [fixtures.md](fixtures.md) | Fixture model + channel-type taxonomy, JSON import, validation, library (built-in + Custom user profiles) |
| [selection.md](selection.md) | Live ordered selection — programming target driving FX fan/phase, index badges, `lumox:selection:*` IPC, FX `selection` target |
| [limits.md](limits.md) | Per-fixture output limits — dimmer cap, pan/tilt range + invert, swap; `Limits` post-mix stage, `lumox:fixtures:setLimits` IPC, Limits modal |
| [color.md](color.md) | Colour — DMX-byte bridges (`hsvToBytes`/`hexToBytes`) over the culori colour library |
| [midi.md](midi.md) | MIDI control surfaces — backend/port/controller layers, APC Mini MK2 mapping, CLI (engine-only, no IPC yet) |
| [tempo.md](tempo.md) | Master tempo & BPM sources — manual/tap, MIDI clock (24 ppqn), audio onset detection, Ableton Link; source-aware `Transport`, `lumox:transport:*` IPC |
| [artnet-protocol.md](artnet-protocol.md) | Art-Net + sACN wire protocol the app emits (+ discovery) |
| [connection.md](connection.md) | Connection tab — DMX output transport (Art-Net/sACN, target IP, refresh) + live status |
| [discovery.md](discovery.md) | Network node discovery — Art-Net ArtPoll listener, device list, one-click Assign to a universe |
| [settings.md](settings.md) | Application settings — language, appearance, autosave/startup (userData store) |
| [undo-redo.md](undo-redo.md) | Undo / redo — whole-show snapshots (memento) at the dirty-flag seam, coalesced gestures, Ctrl+Z/Y |
| [conventions.md](conventions.md) | Coding conventions — language, comments, naming, CSS |
| [icon.md](icon.md) | App icon + brand mark — SVG source, offline raster/.ico generation, wiring |
| [build-run.md](build-run.md) | Build & run commands |
| [security.md](security.md) | Electron security baseline + audit checklist |

## Entry template

```markdown
# <Feature / Topic>

**Status:** <stable | wip | experimental>
**Files:** <key source files>

## What
<one-paragraph summary>

## How
<how it works — data flow, key functions>

## Notes / Gotchas
<edge cases, todos>
```
