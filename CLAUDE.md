# Lumox App — Wireless DMX Controller (Electron)

Central controller for the Lumox wireless DMX system: a headless lighting
**engine** (pure Node, no Electron/DOM) wrapped by a thin Electron shell, sending
DMX over the network via Art-Net / sACN to ESP32 nodes. TypeScript + ESM throughout.

**Detailed docs live in the knowledge base → [`docs/knowledge-base/`](docs/knowledge-base/).**
This file is a lean orientation map; the knowledge base is the source of truth.

## ⚠️ Most important rules (ranked)

These outrank everything else in this file. When two guidelines conflict, the
lower rank number wins.

| # | Rule | What it means |
| --- | --- | --- |
| **1** | **Docs always reflect the code** | Any change to behaviour, features, APIs, formats, or structure is **not complete** until the docs (this file, the knowledge base, any affected `.md`) are updated in the **same change** to match exactly. Docs never lag, contradict, or describe a past/planned state — they describe what the code does *right now*. If you can't update the docs, the work isn't done. |
| **2** | **No legacy / no back-compat** | Replace old designs outright — no dead code paths, deprecated fields, dual implementations, or migration shims. Breaking persisted formats is acceptable; don't write loaders to keep old files working. |
| **3** | **Industry standards & established patterns** | Favour the conventional, recognisable solution over a clever bespoke one; reach for custom only when a standard pattern genuinely doesn't fit. |
| **4** | **Security baseline is mandatory** | The Electron hardening baseline is non-negotiable — [security.md](docs/knowledge-base/security.md). |
| **5** | **Stuck? Build your own tool — then verify before keeping it** | When you can't do something with the tools at hand, you're encouraged to work around it by creating a new skill or helper script under [`.claude/skills/`](.claude/skills/). **Only persist it once you've actually run it and confirmed it works as expected** — verify first, then keep it (and add a row to the Skills table). Never leave behind an unverified, broken, or speculative script; if it doesn't work, throw it away. |

## Knowledge Base

**IMPORTANT — keep it current.** For **every new feature** or behaviour change,
update the knowledge base (add a new `.md` or extend an existing one) **and** add
the entry to the table below. Every markdown in `docs/knowledge-base/` MUST be
referenced here.

| Document | Scope |
| --- | --- |
| [docs/knowledge-base/README.md](docs/knowledge-base/README.md) | Index + maintenance rule + entry template |
| [docs/knowledge-base/architecture.md](docs/knowledge-base/architecture.md) | App's place in the system — host/controller, ESP32 nodes, Art-Net/sACN flow |
| [docs/knowledge-base/app.md](docs/knowledge-base/app.md) | Electron app — engine/shell split, modular IPC, renderer, build |
| [docs/knowledge-base/reactivity.md](docs/knowledge-base/reactivity.md) | Renderer reactivity — `@preact/signals-core` (`signal`/`effect`/`computed`), shared `store.ts`, signals vs. event bus |
| [docs/knowledge-base/mix-engine.md](docs/knowledge-base/mix-engine.md) | Engine tick loop, MixPipeline, universe buffers, scenes/groups/banks |
| [docs/knowledge-base/fixtures.md](docs/knowledge-base/fixtures.md) | Fixture model + channel-type taxonomy, JSON import, validation, library (built-in + Custom user profiles) |
| [docs/knowledge-base/selection.md](docs/knowledge-base/selection.md) | Live ordered selection — the programming target driving FX fan/phase, index badges, `lumox:selection:*` IPC, FX `selection` target |
| [docs/knowledge-base/limits.md](docs/knowledge-base/limits.md) | Per-fixture output limits — dimmer cap, pan/tilt range + invert, swap; `Limits` post-mix stage, `lumox:fixtures:setLimits` IPC, Limits tile |
| [docs/knowledge-base/virtual-dimmers.md](docs/knowledge-base/virtual-dimmers.md) | Virtual dimmers — per-cluster synthetic intensity for RGB-only fixtures; virtual channel region (above 512), `VirtualDimmer` post-mix stage, fader/scene/group/FX wiring |
| [docs/knowledge-base/color.md](docs/knowledge-base/color.md) | Colour — DMX-byte bridges (`hsvToBytes`/`hexToBytes`) over the culori colour library |
| [docs/knowledge-base/midi.md](docs/knowledge-base/midi.md) | MIDI control surfaces — engine backend/port/controller layers + app layer (`MidiService`, `lumox:midi:*` IPC, mapping window), APC Mini MK2 mapping |
| [docs/knowledge-base/tempo.md](docs/knowledge-base/tempo.md) | Master tempo & BPM sources — manual/tap, MIDI clock, audio onset detection, Ableton Link; source-aware `Transport`, `lumox:transport:*` IPC |
| [docs/knowledge-base/busking.md](docs/knowledge-base/busking.md) | Busking — live, improvised operation: banks/scenes as the surface, base look + FX rack, palettes, groups, HTP/LTP, beat-sync, punt look |
| [docs/knowledge-base/audio.md](docs/knowledge-base/audio.md) | Audio-reactive input — shared Web-Audio capture (log-spaced spectrum bands + volume + beat), drag-and-drop input picker, band/volume/beat → target bindings (range + triggers), `lumox:audio:*` IPC |
| [docs/knowledge-base/artnet-protocol.md](docs/knowledge-base/artnet-protocol.md) | Art-Net + sACN wire protocol the app emits (+ discovery) |
| [docs/knowledge-base/connection.md](docs/knowledge-base/connection.md) | Connection tab — DMX output transport (Art-Net/sACN, target IP, refresh) + live status |
| [docs/knowledge-base/discovery.md](docs/knowledge-base/discovery.md) | Network node discovery — Art-Net ArtPoll listener, device list, one-click Assign to a universe |
| [docs/knowledge-base/settings.md](docs/knowledge-base/settings.md) | Application settings — language, appearance, autosave/startup (userData store) |
| [docs/knowledge-base/undo-redo.md](docs/knowledge-base/undo-redo.md) | Undo / redo — whole-show snapshots at the dirty-flag seam, coalesced gestures, Ctrl+Z/Y |
| [docs/knowledge-base/conventions.md](docs/knowledge-base/conventions.md) | Coding conventions — language, comments, naming, CSS |
| [docs/knowledge-base/icon.md](docs/knowledge-base/icon.md) | App icon + brand mark — SVG source, offline raster/.ico generation, wiring |
| [docs/knowledge-base/build-run.md](docs/knowledge-base/build-run.md) | Build & run commands |
| [docs/knowledge-base/e2e-tests.md](docs/knowledge-base/e2e-tests.md) | End-to-end tests — Playwright Electron driver over the real app (Chromium-only, 1920×1080); full smoke sweep of every view + secondary window, plus deep recall/blackout/fader→buffer paths |
| [docs/knowledge-base/security.md](docs/knowledge-base/security.md) | Electron security baseline + audit checklist |

## Skills

**IMPORTANT — always use a skill when one fits.** Before starting any task,
check whether an available skill matches it and invoke that skill first rather
than improvising the work by hand. Skills encode the project's required workflow
(UI design loop, icon spec, app run/screenshot, etc.) — prefer them over ad-hoc
approaches whenever their description applies.

Project skills live in [`.claude/skills/`](.claude/skills/) and are invoked
automatically (or via `/<name>`) when their description matches the task:

| Skill | Use when |
| --- | --- |
| [lumox-ui-design](.claude/skills/lumox-ui-design/SKILL.md) | Building or restyling any renderer UI — encodes Lumox's token system, "soft modern" dark direction, the flat/low-border/drill-down UI laws, generic pro-control-surface conventions, and a plan→critique→build→screenshot loop. Reads as a purpose-built control surface, not generic AI dashboard slop. |
| [lumox-icon-design](.claude/skills/lumox-icon-design/SKILL.md) | Creating a bespoke UI icon when Font Awesome lacks a domain-true glyph (universe, emitter, fixture archetype, fan, beat). Adapts permissively-licensed public SVG sets to Lumox's house spec (filled, FA-Solid weight) so the custom icons read as one consistent set, with the integration + licensing + screenshot loop. |
| [run-app](.claude/skills/run-app/SKILL.md) | Build, launch, and screenshot the Electron app to verify a renderer/UI change in the real app. |

**Stuck? Build your own tool.** You may add a new skill/helper script here as a
workaround when the tools at hand fall short — but only persist it once verified
to work. This is **rule #5** above; see [Most important rules](#️-most-important-rules-ranked).

## Plans / backlog

Forward-looking design plans for features **not yet built** live in
[`docs/plans/`](docs/plans/) (distinct from the knowledge base, which is the source of
truth for shipped behaviour). For what's left to build, start at the backlog summary:

- [docs/plans/backlog-summary.md](docs/plans/backlog-summary.md) — the live **to-do**:
  outstanding features only (Input mapping active; Matrix/strip, Stand-alone export,
  Touch/remote parked) + a roster of shipped ones pointing at the knowledge base.
  Specs for the remaining work in
  [feature-backlog.md](docs/plans/feature-backlog.md); MIDI slices in
  [midi-control-surface.md](docs/plans/midi-control-surface.md) +
  [midi-scene-mapping-apc.md](docs/plans/midi-scene-mapping-apc.md).

## Essentials

- **Two layers** — `src/` is the headless engine (no Electron/DOM; runnable via
  `npm run headless`, `npm run cli`, `examples/`); `main/` + `preload.ts` +
  `renderer/` are the Electron wrapper. Detail: [app.md](docs/knowledge-base/app.md).
- **TypeScript + ESM everywhere** (`"type": "module"`); import the engine via
  `src/index.ts`, not deep paths. Main + preload are emitted as CJS.
- **Comments**: write the minimum necessary — prefer clear names and structure;
  comment only the non-obvious. Full conventions: [conventions.md](docs/knowledge-base/conventions.md).
- **IPC**: channels namespaced `lumox:<area>:<action>`, one handler module per
  area in `main/handlers/`. Recipe: [app.md](docs/knowledge-base/app.md).
- **Language**: everything in English (code, comments, UI, docs).
- **No competitor names**: never name other lighting-control software anywhere
  (UI, docs, comments, commits) — describe capabilities generically. See
  [conventions.md](docs/knowledge-base/conventions.md).
- Best engine-API reference: the runnable `examples/`.
