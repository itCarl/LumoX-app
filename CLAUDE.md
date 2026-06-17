# Lumox App — Wireless DMX Controller (Electron)

Central controller for the Lumox wireless DMX system. A headless lighting
**engine** (pure Node, no Electron deps) wrapped by a thin Electron shell.
Sends DMX over the network via Art-Net / sACN to ESP32 nodes.

## Architecture

Two layers, cleanly separated:

- **`src/`** — headless engine. No Electron, no DOM. Runnable standalone
  (`npm run headless`, `npm run cli`) and from `examples/`. This is the core.
- **`main/` + `preload.cjs` + `renderer/`** — Electron wrapper. Main process
  boots the engine and exposes it over IPC; renderer is the GUI.

```
renderer (GUI)  ──IPC──▶  main/index.js  ──▶  Engine (src/)  ──▶  Outputs ──▶ network
   window.lumox.*         ipcMain.handle        tick loop          Art-Net/sACN
```

### Engine tick model (`src/core/Engine.js`)
Runs at `refreshHz` (default 44). Per tick, per universe:
1. `mix.process(universe, ctx)` runs the pipeline → writes `universe.data`
2. dirty check vs `_prev`
3. `outputs.dispatch(universe, now)` — outputs gate on dirty / keepalive / rate

Default mix pipeline (order matters):
`BaseLayer → SceneMixer → Effects → GroupEffects → GrandMaster → Blackout`

Add/remove modules at runtime via `engine.mix.add/remove`. Convenience refs:
`engine.scenes`, `engine.effects`, `engine.groupEffects`, `engine.grandMaster`,
`engine.blackout`.

### Universe buffers (`src/core/Universe.js`)
- `programmer` — user/base writes (`setChannel`, IPC) land here
- `data` — final mixed output the pipeline writes; outputs read this
- `_prev` — last-sent snapshot for dirty detection

512 channels, 1-indexed in the `setChannel`/`getChannel` API.

## Layout

| Path | Role |
|---|---|
| `src/index.js` | Public API barrel — single import point; registers Art-Net/sACN output types |
| `src/core/` | `Engine`, `Universe`, `UniverseManager` |
| `src/mix/` | `MixPipeline`, `MixModule`, `modules/*` (BaseLayer, SceneMixer, Effects, GroupEffects, GrandMaster, Blackout) |
| `src/outputs/` | `Output` base, `OutputManager` (type registry + factory), `ArtNetOutput`, `SacnOutput` |
| `src/protocols/` | Wire encoders — `artnet.js`, `sacn.js` |
| `src/fixtures/` | Definitions, modes, channel types, capabilities, library, validator, importers (Lumox JSON + QLC+ XML) |
| `src/show/` | `Show`, `Patch`, `Scene`, `Group`, `GroupManager` |
| `src/midi/` | MIDI manager + controllers (APC mini mk2), easymidi backend (optional dep) + mock |
| `main/index.js` | Electron main — boots engine, `ipcMain.handle('lumox:*')` surface |
| `preload.cjs` | contextBridge → `window.lumox.*` (mirrors main IPC; CJS, not ESM) |
| `renderer/` | GUI (ES6 modules, plain HTML/CSS/JS — no build step) |
| `cli/lumox-cli.js` | Standalone CLI over the engine |
| `examples/` | 24 runnable usage examples — best reference for the engine API |
| `fixtures/` | Built-in fixture library (`.lumox.json`) + JSON schema |

## Conventions

- **ESM everywhere** (`"type": "module"`) — `import`/`export`. Exception:
  `preload.cjs` is CommonJS (Electron preload requirement).
- **Import from the engine via `src/index.js`**, not deep paths.
- New output types: subclass `Output`, set static `TYPE`, register with
  `OutputManager.registerType` (see `src/index.js` bottom).
- New mix behaviour: subclass `MixModule`, implement `process(universe, ctx)`.
- IPC: add `ipcMain.handle('lumox:…')` in `main/index.js`, mirror in
  `preload.cjs`. Channels namespaced `lumox:<area>:<action>`.
- **Language**: code + comments English; user-facing README/UI German.
- Renderer: dark theme, CSS custom props (`--bg`, `--fg`, `--accent`).

## Build & Run

```bash
npm install
npm start       # Electron app
npm run headless # engine only, no GUI
npm run cli      # CLI
npm run validate # validate fixture library
node examples/01-engine.js   # any example
```

`easymidi` is an optional dependency — engine falls back to a mock MIDI
backend if it is not installed.
