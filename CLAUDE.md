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
| `src/show/` | `Show`, `Patch`, `Scene`, `Group`, `GroupManager`, `BankManager` |
| `src/midi/` | MIDI manager + controllers (APC mini mk2), easymidi backend (optional dep) + mock |
| `main/index.ts` | Electron main — thin shell: boot guard, `bootShow()`, app lifecycle, `registerHandlers()` |
| `main/context.ts` | engine/show/bank singletons + domain helpers (`configKey`, `nextColor`, `sameConfig`, `updateActiveUniverses`, broadcast output) |
| `main/windows.ts` | `BrowserWindow` lifecycle + `hardenWindow()` security |
| `main/serializers.ts` + `main/dto.ts` | engine → DTO mappers and the DTO type shapes the renderer consumes |
| `main/validate.ts` | range-checks for IPC payloads (channel/universe/host) |
| `main/handlers/*` | one module per `lumox:<area>` IPC group; `handlers/index.ts` registers all |
| `main/services/ProjectService.ts` | project (de)serialization — `buildProject`/`validateProject`/`restoreProject` |
| `preload.cjs` | contextBridge → `window.lumox.*` (mirrors main IPC; CJS, not ESM) |
| `renderer/` | GUI (TypeScript ES modules, bundled via esbuild; `lib/dom.ts` render primitives + Tailwind) |
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
- IPC: add `ipcMain.handle('lumox:…')` in the matching `main/handlers/<area>.ts`
  module (not `index.ts`), mirror in `preload.cjs`, type the result in `dto.ts`
  if it returns an object, and map it via `serializers.ts`. Channels namespaced
  `lumox:<area>:<action>`.
- **Language**: code + comments English; user-facing README/UI German.
- Renderer: dark theme, CSS custom props (`--bg`, `--fg`, `--accent`).

## Security

**IMPORTANT — run a security audit regularly** (each release, and after any
change to the Electron shell, IPC surface, project-file format, or wire
protocols). The baseline the codebase must hold:

- **Electron checklist**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true` on every `BrowserWindow`; `contextBridge` only (no raw
  `ipcRenderer`/Node in the renderer); CSP `<meta>` in every HTML; nav locked
  down via `hardenWindow()` (`setWindowOpenHandler` deny + `will-navigate`
  guard); local content only (`loadFile`, never `loadURL`); no `eval`/remote
  module; `globalThis.lumox` dev-gated.
- **Untrusted input**: escape all user-controlled strings rendered via
  `innerHTML` with `esc()` (`renderer/lib/html.js`); validate parsed project
  files with `validateProject()` before mutating engine state; range-check IPC
  payloads (channels 1–512, addresses, colours).
- **Protocols**: Art-Net capped at 44 Hz (`ArtNetOutput`); sACN priority
  clamped 0–200 (`buildDataPacket`).
- **Tooling/deps**: `npm run lint` clean; review `npm audit` and bump Electron
  to a supported release.

Audit steps: re-run the Electron security checklist against `main/index.js` +
HTML, grep the renderer for unescaped `innerHTML` interpolation, `npm audit`,
`npm run lint`.

## Build & Run

```bash
npm install
npm start       # Electron app
npm run headless # engine only, no GUI
npm run cli      # CLI
npm run validate # validate fixture library
npm run lint    # ESLint (flat config, eslint.config.js)
npm run format  # Prettier
node examples/01-engine.js   # any example
```

`easymidi` is an optional dependency — engine falls back to a mock MIDI
backend if it is not installed.
