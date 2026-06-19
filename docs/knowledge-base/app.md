# Electron App

**Status:** stable
**Files:** `src/` (engine), `main/`, `preload.ts`, `renderer/`

## What

The central Lumox controller: a headless lighting **engine** (pure Node, no
Electron/DOM) wrapped by a thin Electron shell. TypeScript throughout (ESM,
`"type": "module"`). Sends DMX over the network via Art-Net / sACN to the ESP32
nodes; the engine is also runnable standalone (`npm run headless`, `npm run cli`,
`examples/`).

## Layers

```text
renderer (GUI)  ──IPC──▶  main/  ──▶  Engine (src/)  ──▶  Outputs ──▶ network
 window.lumox.*     ipcMain.handle      tick loop        Art-Net / sACN
```

### Engine (`src/`)

Headless core. Tick loop @ 44 Hz; modular `MixPipeline`
(BaseLayer → SceneMixer → Effects → GroupEffects → GrandMaster → Blackout).
Internals: [mix-engine.md](mix-engine.md).

| Path | Role |
| --- | --- |
| `src/index.ts` | Public API barrel; registers Art-Net/sACN output types |
| `src/core/` | `Engine` (tick loop), `Universe`, `UniverseManager` |
| `src/mix/` | `MixPipeline`, `MixModule`, `modules/*` |
| `src/outputs/` | `Output` base, `OutputManager`, `ArtNetOutput`, `SacnOutput` |
| `src/protocols/` | Wire encoders `artnet.ts`, `sacn.ts` |
| `src/fixtures/` | Definitions, modes, library, validator, importer (Lumox JSON) |
| `src/show/` | `Show`, `Patch`, `Scene`, `Group`, `GroupManager`, `BankManager` |
| `src/midi/` | MIDI manager + controllers (APC mini mk2), easymidi (optional) + mock — [midi.md](midi.md) |

### Electron shell (`main/` + `preload.ts`)

The main process boots the engine and exposes it over IPC. The IPC surface is
**modular**: `main/handlers/index.ts` registers one handler module per area
(window, outputs, universes, engine, library, patch, groups, fixtures, scenes,
banks, palettes, transport, settings, project). Channels are namespaced
`lumox:<area>:<action>`.

| Path | Role |
| --- | --- |
| `main/index.ts` | Boots engine, creates windows, registers handlers |
| `main/handlers/*` | Per-area `lumox:*` IPC handlers |
| `main/services/ProjectService.ts` | `.lmx` project save/open |
| `main/services/UserLibraryService.ts` | User (**Custom**) fixture library — boot-load, persist, and delete editor-authored fixtures under `userData` ([fixtures.md](fixtures.md)) |
| `main/services/Transport.ts` | master tempo (BPM) for beat-synced scenes; persisted top-level in the project |
| `main/services/MidiService.ts` | MIDI control surface — APC Mini MK2 ports, click-to-assign learn, binding dispatch + LED feedback ([midi.md](midi.md)) |
| `main/validate.ts` | Range-checks IPC payloads (channel/universe/host) |
| `main/dto.ts`, `serializers.ts`, `context.ts`, `windows.ts` | DTOs, (de)serialization, shared context, window factory |
| `preload.ts` | contextBridge → `window.lumox.*` (built to `dist/preload.cjs`) |

**Adding an IPC handler:** add `ipcMain.handle('lumox:<area>:<action>', …)` in
the matching `main/handlers/<area>.ts` module (not `index.ts`), mirror the call
in `preload.ts`, type the result in `main/dto.ts` if it returns an object, map it
via `main/serializers.ts`, and range-check inputs in `main/validate.ts`.

### Renderer (`renderer/`)

View-only GUI, TypeScript ES modules, `renderer/{lib,views,styles}/`, bundled by
esbuild. Render primitives + delegated events keep tiles from re-implementing markup/wiring:

- **`lib/dom.ts`** — `html` tagged template (auto-`esc()`, `raw()` for trusted
  markup) + `mount(el)` with **delegated** `.on()` events (bound once, survive re-renders).
- **`lib/widgets.ts`** — `button()`, `input()`, `openMenu()` (single dropdown impl).
- **`lib/html.ts`** — `esc()` escaper. **`lib/bus.ts`** / **`lib/dock.ts`** — event bus, docking.
- **`lib/store.ts`** — the shared-state store for values read across tiles
  (e.g. `activeGroup`), built on `@preact/signals-core` (`signal`/`effect`/
  `computed`). Signals own *shared state*; the bus stays for fire-and-forget
  notifications. See [reactivity.md](reactivity.md).
- **`lib/confirm.ts`** — `confirmDialog()` modal over the shared `.lx-modal`
  markup; resolves `Promise<boolean>` and takes an async `onConfirm` that shows a
  thrown error inline (keeping the dialog open). Used for destructive actions —
  e.g. deleting a Custom fixture from the library tile.
- **`lib/channel-icons.ts`** — `channelIcon()` / `channelIconHtml()` map a channel
  type → Font Awesome glyph (per id, `group` fallback; colour emitters tinted).
  Used by the fader editor columns and fixture editor rows.
- **Input widgets** — factories returning `{ el, set() }` with `onInput` (live,
  while dragging) + `onChange` (committed) callbacks: **`lib/knob.ts`** (rotary).
  Pure UI — no DMX/fixture knowledge; the caller maps the value. Used by the
  SCENE panel FX editors (speed / size / phasing knobs).
- **Styling** — `styles/main.css` (dark theme, CSS custom props) + Tailwind v4
  `.lx-*` classes compiled to `renderer/dist/tailwind.css`. CSP `style-src 'self'`.
- **Titlebar (`index.ts`)** — tab nav, project name/dirty marker, window controls,
  and a **master BPM clock** left of the window buttons: a beat-LED metronome
  (local `requestAnimationFrame` clock, no engine downbeat), an editable tempo
  field (type, or drag it vertically to scrub — up = faster, Shift = fine), and
  tap-tempo. Edits go through `lumox:transport:setBpm` and broadcast
  `EV.TEMPO_CHANGED`, so the scene-properties Tempo field and BPM-driven previews
  stay in sync wherever the tempo is changed.

- **Keyboard shortcuts** (`lib/keys.ts` — `onShortcut()` + `isEditable()`; every
  shortcut is ignored while typing in a field). `onShortcut(combo, run, enabled?)`
  registers a global keydown whose `enabled()` guard lets separate tiles bind the
  **same** key without colliding — each scopes itself to when it's on screen:
  - **Global** (`index.ts`): `Ctrl+Z` undo · `Ctrl+Y` / `Ctrl+Shift+Z` redo ·
    `Ctrl+N`/`O`/`S`/`Shift+S` project new/open/save/save-as · `Ctrl+,` settings.
  - **Stage / Patch** (SETUP): `Delete` / `Backspace` removes the **selected
    fixture(s)**; `Ctrl+A` selects every fixture on the Stage; `V`/`M`/`L`/`H` pick the canvas tool (select / rect / lasso / hand). Fixture selection is **shared** between the Patch grid and the
    Stage (click a patched cell or marquee on the stage → both highlight it, via
    `EV.FIXTURE_SELECTED` tagged with its `src` to avoid echo); the Stage owns the
    Delete so the two SETUP tiles never double-fire.
  - **Banks** (CONTROL): `Delete` deletes · `Ctrl+D` duplicates · `F2` renames the
    edit-selected scene — or, with no scene selected, the **active bank** (`F2` is
    the Windows-standard rename key, sidestepping the `Ctrl+R` reload clash).
  The ⋯ menu and context menus show each accelerator **flush-right** (classic
  Windows style, `.ctx-key`). See also [undo-redo.md](undo-redo.md).

Tiles (views):

| File | Tile |
| --- | --- |
| `views/patchgrid.ts` | PATCH — 512-channel map, drag/drop; click a patched fixture to **select** it (Ctrl/Cmd to multi-select) — selection is shared with the Stage and `Delete` unpatches it |
| `views/library.ts` | FIXTURE LIBRARY — vendor accordion, patch form; **Custom** (user) fixtures carry an inline delete (confirm dialog → `lumox:library:remove`) |
| `views/stage.ts` | STAGE — top-down 2D rig view: per-emitter footprints — emitter count is **derived from the channel layout** (a 9-LED bar's 9 R/G/B clusters → 9 cells), drawn at their `emitterLayout` positions or, with none, a single row — where **each emitter shows its live mixed-output colour** (RGB × master dimmer, with a glow; polled from `universes.read`, gated on visibility). drag-move (**always snaps**; a fine-grid toggle quarters the step for precise placement), Ctrl-drag/edge-handle rotate. A **canvas-tool mode** (header, left) picks the pointer gesture — **select/move** (V), **rectangular** marquee (M), freeform **lasso** (L, SVG polygon → point-in-poly by footprint centre), or **hand/pan** (H, drag-scroll); only select moves fixtures, the rest are whole-canvas gestures. A **left vertical rail** holds commands: selection (select all `Ctrl+A` / deselect / invert) on top, then align (a consistent arrows-to-line family) / distribute / reset-rotation. The header also carries **grid** (arrange-in-grid + fine-grid toggle) and a **zoom** control (− / horizontal slider / +; the slider is **log-mapped** so its centre is the default zoom — left zooms out, right zooms in; also `Ctrl`+scroll, which zooms toward the cursor, and double-click the slider to reset); zoom drives px-per-world-unit and the grid/emitter-dot size via CSS vars, default zoomed in for readable footprints. Placement is the engine's world geometry — persisted per fixture via `lumox:patch:setTransform` (see [fixtures.md](fixtures.md)) and consumed by MATRIX FX |
| `views/groupbar.ts` | GROUPS — group select/highlight |
| `views/fadereditor.ts` | FADER — a left sidebar of attribute categories (DIMMER/COLOR/…/FADER) that only highlights + scrolls to its channels, over a strip-per-channel main area that **always shows every channel** (so switching category never reflows). When the selected group mixes fixture types (e.g. the **All** tab) the strips split into labelled **blocks**; a header **TYPE / FIX** toggle picks one block per channel-config (writes broadcast to every fixture of that type) or one block per individual fixture — a homogeneous group is a single block either way. Each strip: engage dot · channel number · colour swatch · value/OFF · vertical fader; moving one auto-engages it. EDIT (recalled scene) / LIVE (programmer) target; LIVE header shows engaged-channel count + **Clear** / **Store** (capture programmer → new scene in the active bank). Right rail: **GrandMaster** + a momentary **Blackout** (BO) — flash button, forced to zero only while held (pointer capture releases on up) |
| `views/banks.ts` | BANKS — ordered scene groups: scene cells + a `+` that captures current output as a new scene, scene type & chase-step menu |
| `views/fxpalette.ts` | SCENE panel — header has the scene name, a rename **pencil**, live status + recall. A **right-hand icon rail** (Base / FX / Scene / Advanced) switches the body between **full-width pages** — decluttering the narrow column by showing one thing at a time instead of nesting. **Base page**: STATIC/CHASE segment + optional STEPS table (per-step fade/wait). **FX Rack page**: a flat list of layer rows (enable dot · kind icon+name · target hint · ›) — clicking a row **drills into that layer's own full-width editor page** (a `← FX Rack` back link, a title row with reorder ▲▼ + enable + delete, then target group + sweep order, the kind config, then TIMING = Speed/Phasing/Size knobs `lib/knob.ts` + direction + drive/beat/rate); below the list are the add-FX buttons (color/move/curve/chaser/value/matrix) and the rack preset apply/save. **Scene page**: Dimmer/Speed knobs, playhead transport, tempo drive+beat+BPM, start mode, fade timing. **Advanced page**: priority (low/normal/high), loop (always / ×N) with jump-to (next/prev/specific scene) + release-at-end, release mode + protect-from-release (off/all/bank/outside-bank/specific, with a bank checklist for 'specific'), and a flash toggle — see [mix-engine.md](mix-engine.md#advanced-playback-priority-loopjump-releaseprotect-flash). Kind editors: COLOR (palette/gradient/transform), MOVE (shape + symmetry), CURVE/VALUE (waveform + min/max/duty), CHASER (lit/gap/levels), MATRIX (pattern + palette + scale/angle — pixel-maps emitters by their STAGE position). MOVE/CURVE/VALUE editors draw a live, full-width `<canvas>` preview (backing store kept at CSS-size × `devicePixelRatio` for crisp lines; theme colours read from CSS vars) whose per-beam dots sit at the current FX playhead: when the scene is live the engine's actual layer phase is polled (`lumox:scenes:layerPhase` → `SceneMixer.layerPhaseInfo`) and dead-reckoned forward between samples so the dots match the rig exactly; when idle it free-runs a local `requestAnimationFrame` clock reusing the mixer's period + direction math. Knob/slider drags update the preview live (knob `onInput` + slider `input`), and a commit keeps the body's scroll offset (in-place rerender) and the playhead continuous because `rebuildSceneTrack` preserves the playback phase clock (only recall reseeds it per start mode) |
| `views/debug.ts` | DEBUG — 512 faders + live readback (full-page view, ⋯ menu) |
| `views/connection.ts` | CONNECTION — DMX output transport (Art-Net/sACN cards, target IP, refresh) + live status; full-page view on its own titlebar tab. See [connection.md](connection.md) |
| `fixtureeditor-window.ts` | Fixture editor — standalone window (own taskbar entry) |
| `midi-window.ts` | MIDI mapping — standalone window (own taskbar entry): connection status, **+ Add mapping** (click-to-assign), bindings table, live monitor. See [midi.md](midi.md) |
| `dialog-window.ts` | Generic **dialog window** (`dialog.html`) — prompts/notices (unsaved-changes, missing fixtures, confirmations). Renders a spec from main, reports the clicked button id. See *Windows — no in-app modals* below |
| `panel-window.ts` | Generic **panel window** (`panel.html`) — hosts the richer former modals (Settings, group fixture-order) as real windows |
| `lib/midiassign.ts` | Main-window assign overlay — paints `[data-midi]` controls purple during assign mode and reports the picked target |

#### Windows — no in-app modals

The app uses **no overlay modals** — every transient surface is a real frameless
top-level window with its own taskbar entry (created **without** `parent`), so it
can be picked from the taskbar / alt-tab. Two are generic and reusable:

- **Dialog window** (`renderer/dialog.html` + `dialog-window.ts`, main:
  `handlers/dialog.ts`) — button prompts + notices. `openDialog(spec)` (main) and
  `lumox.dialog.open(spec)` (renderer) pop the window and resolve with the clicked
  button id; the window's X / Esc resolve to the spec's `cancelId`. Used by the
  unsaved-changes guard, the missing-fixtures notice, and `lib/confirm.ts`.
- **Panel window** (`renderer/panel.html` + `panel-window.ts`, main:
  `handlers/panel.ts`) — hosts a richer panel chosen by `kind`. `lumox.panel.open({kind})`
  opens it; the page fetches its spec and mounts the matching body. Kinds:
  `settings` (`views/settings-modal.ts` → `buildSettingsBody`) and `group-order`
  (`views/group-order-modal.ts` → `buildGroupOrderBody`).

Both windows reuse the editor/MIDI window chrome (`.ew-titlebar`, `wc-close`).
The dialog/panel IPC areas are transient (never dirty the project).

#### Fixture editor (`fixtureeditor.html` + `fixtureeditor-window.ts`)

Opened from the library tile's **+** via `lumox:editor:open`. It is a real
top-level window (`openEditorWindow()` creates it **without** `parent`, so it
gets its own taskbar button) with a frameless titlebar (minimize via
`lumox:win:minimizeSelf`, close via `lumox:win:closeSelf`). It authors a user
`FixtureDefinition` and saves it through `lumox:library:add`. The **vendor is
fixed to `Custom`** (read-only field — real vendor profiles ship bundled); on
save the handler forces that vendor and persists the fixture to the user library
under `userData`, so it survives restarts ([fixtures.md](fixtures.md)):

- **Multiple channel modes** — a modes column (add / rename / delete, ≥ 1) each
  with its own ordered channel list. Matches the engine's `modes: FixtureMode[]`
  and the library tile's mode picker.
- **Emitter layout** — a bottom-left canvas where light cells are positioned
  (grid generator + free drag). Stored as `FixtureDefinition.emitterLayout`:
  per-emitter normalized `{x,y}` (0..1), the physical layout **matrix effects
  consume**. When present it is the source of truth for the emitter count;
  otherwise the plain numeric `emitters` stands. The STAGE tile renders the real
  layout when set. Coords are clamped/capped in the `FixtureDefinition`
  constructor (defends the `library:add` path).

## Build

esbuild + Tailwind via `build.mjs` → `dist/main/index.cjs`, `dist/preload.cjs`,
`renderer/dist/*.js`, `renderer/dist/tailwind.css`. Commands: [build-run.md](build-run.md).

## Projects

`.lmx` JSON files (format version 1 — the single current format; dev phase, no
legacy loaders), handled in `main/handlers/project.ts` +
`main/services/ProjectService.ts`:

- **Current project** — `ProjectService` tracks `{ name, path, dirty }`. `New`
  resets to a blank **Untitled** show (default universes + bank); the app boots
  into Untitled (`bootShow` → `newProject()`). `Save` writes to the known path
  silently, else falls back to `Save As` (dialog). The file embeds `name`.
  A **5-minute autosave** rewrites a named (non-Untitled) project whenever it has
  unsaved changes.
- **Unsaved-changes guard on close** — closing the main window with a dirty
  project prompts **Save / Don't Save / Cancel** in the in-app **dialog window**
  (see *Windows* below — not a native OS message box). Cancel vetoes the close;
  Save writes (or falls back to Save As for an Untitled show, and cancelling that
  also vetoes the close). The project handler injects this guard into `windows.ts`
  via `setCloseGuard()`, which vetoes the window `close` event until the dialog
  resolves.
- **Dirty marker** — `registerHandlers()` wraps `ipcMain.handle` so any
  show-mutating channel flips a dirty flag (read-only / live / playback / window
  channels don't). The titlebar shows `— <name>` with a `*` when dirty.
  Identity changes are pushed to the renderer via the `projectEvents` emitter
  → `project:changed`.
- **Open** — `validateProject()` rejects malformed files before any mutation;
  `restoreProject()` rebuilds state (best-effort: fixtures with no installed
  definition are skipped). `analyzeProject()` then reports those gaps
  (missing definition / missing mode), surfaced after reload via
  `lumox:project:report` in the dialog window.
- A full project replace sends `project:loaded` → the renderer `location.reload()`s
  for a clean rebuild; identity + report are re-read on startup.

## Notes / Gotchas

- **Single instance** — `main/index.ts` takes `app.requestSingleInstanceLock()`
  at startup; a second launch focuses the existing window (`second-instance` →
  restore + focus) and exits. Two instances would clash over the Art-Net / sACN
  output sockets and the MIDI device.
- Node scripts (headless, cli, examples) run from source via `tsx` — not bundled.
- `easymidi` is optional → mock MIDI backend fallback.
- Conventions: [conventions.md](conventions.md). Security baseline + audit
  checklist: [security.md](security.md).
