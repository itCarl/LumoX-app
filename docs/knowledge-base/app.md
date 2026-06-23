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
banks, palettes, transport, settings, project), channels namespaced
`lumox:<area>:<action>`.

| Path | Role |
| --- | --- |
| `main/index.ts` | Boots engine, creates windows, registers handlers, wires the show runtime |
| `main/handlers/*` | Per-area `lumox:*` IPC handlers |
| `main/services/SceneCompiler.ts` | Translates a `Scene` (show model) → `SceneMixer` track, resolving each FX layer's group + sweep order to absolute DMX target addresses (the one place the patch is consulted; the engine stays fixture-agnostic) |
| `main/services/SceneOrchestrator.ts` | Scene playback orchestration — `recallScene` dipless crossfades, release/protect scopes, counted-loop completion (jump/release/pause), `rebuildSceneTrack` in place ([mix-engine.md](mix-engine.md)) |
| `main/services/OutputPatchService.ts` | Per-universe output patch (one Art-Net/sACN output each), the live programmer + engaged channels, broadcast gating + release linger, and the shutdown blackout ([connection.md](connection.md)) |
| `main/services/SelectionService.ts` | The transient ordered "programming target" (live selection) + a change hook the runtime connects to scene re-fan ([selection.md](selection.md)) |
| `main/services/FixtureMaps.ts` | Resolves each fixture's limits + virtual dimmers to the addresses the engine's `Limits` / `VirtualDimmer` post-stages consume ([limits.md](limits.md), [virtual-dimmers.md](virtual-dimmers.md)) |
| `main/services/showRuntime.ts` | `wireShowRuntime()` — composes the above at boot: the per-tick `engine.on('tick')` runtime + the selection-change hook (keeps the services one-directional, no import cycles) |
| `main/services/ProjectService.ts` | `.lmx` project save/open |
| `main/services/UserLibraryService.ts` | User (**Custom**) fixture library — boot-load, persist, and delete editor-authored fixtures under `userData` ([fixtures.md](fixtures.md)) |
| `main/services/Transport.ts` | master tempo (BPM) for beat-synced scenes; persisted top-level in the project |
| `main/services/MidiService.ts` | MIDI control surface — APC Mini MK2 ports, click-to-assign learn, binding dispatch + LED feedback ([midi.md](midi.md)) |
| `main/validate.ts` | Range-checks IPC payloads (channel/universe/host) |
| `main/dto.ts`, `serializers.ts`, `windows.ts` | DTOs, (de)serialization, window factory |
| `main/context.ts` | **Leaf** — the single `engine` / `show` / `banks` / `discovery` instances + tiny pure helpers (group colour, fixture-config identity). Holds no orchestration; the show-domain services above import these singletons one-directionally |
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
- **`lib/widgets.ts`** — `button()`, `input()`, `toggle()` (the `.sp-toggle` pill
  switch, returned as a trusted HTML string for template composition; callers route
  it via a `data-*` attribute + a delegated handler), `openMenu()` (single dropdown impl).
- **`lib/html.ts`** — `esc()` escaper. **`lib/bus.ts`** / **`lib/dock.ts`** — event bus, docking.
  The dock is the resizable two-row workspace (top: library/banks + patch/FX, a
  full-width groups strip, bottom: stage + limits/fader). Each zone has a per-panel
  **minimum** size (`colMin*`/`colRestMin*` widths, `rowMin*` heights); splitter
  drags **and** window resize clamp to those mins (`apply()` re-runs on resize), so
  a panel scrolls rather than collapsing, and can only grow until the opposite one
  hits its minimum. CSS mirrors the floors as `.z-*` `min-width` backstops; the sums
  stay under the 1024px window min.
- **`lib/store.ts`** — the shared-state store for values read across tiles
  (e.g. `activeGroup`), built on `@preact/signals-core` (`signal`/`effect`/
  `computed`). Signals own *shared state*; the bus stays for fire-and-forget
  notifications. See [reactivity.md](reactivity.md).
- **`lib/confirm.ts`** — `confirmDialog()` modal over the shared `.lx-modal`
  markup; resolves `Promise<boolean>` and takes an async `onConfirm` that shows a
  thrown error inline (keeping the dialog open). Used for destructive actions
  (e.g. deleting a Custom fixture from the library tile).
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
  (local `requestAnimationFrame` clock), an editable tempo field (type, or drag
  vertically to scrub — up = faster, Shift = fine), and tap-tempo. Edits go through
  `lumox:transport:setBpm` and broadcast `EV.TEMPO_CHANGED`, so the scene-properties
  Tempo field and BPM-driven previews stay in sync.

- **Keyboard shortcuts** (`lib/keys.ts` — `onShortcut()` + `isEditable()`; ignored
  while typing in a field). `onShortcut(combo, run, enabled?)` registers a global
  keydown whose `enabled()` guard lets separate tiles bind the **same** key without
  colliding (each scopes to when it's on screen):
  - **Global** (`index.ts`): `Ctrl+Z` undo · `Ctrl+Y` / `Ctrl+Shift+Z` redo ·
    `Ctrl+N`/`O`/`S`/`Shift+S` project new/open/save/save-as · `Ctrl+,` settings.
  - **Stage / Patch** (SETUP): `Delete` / `Backspace` removes the selected
    fixture(s); `Ctrl+A` selects every fixture on the Stage; `V`/`M`/`L`/`H` pick
    the canvas tool (select / rect / lasso / hand). Fixture selection is **shared**
    between the Patch grid and the Stage (via `EV.FIXTURE_SELECTED`, tagged with its
    `src` to avoid echo); the Stage owns the Delete so the two SETUP tiles never
    double-fire.
  - **Banks** (CONTROL): `Delete` deletes · `Ctrl+D` duplicates · `F2` renames the
    edit-selected scene — or, with none selected, the **active bank** (`F2` is the
    Windows-standard rename key, sidestepping the `Ctrl+R` reload clash).
  The ⋯ menu and context menus show each accelerator **flush-right** (`.ctx-key`).
  See also [undo-redo.md](undo-redo.md).

Tiles (views):

| File | Tile |
| --- | --- |
| `views/patchgrid.ts` | PATCH — 512-channel map, drag/drop; click a patched fixture to **select** it (Ctrl/Cmd to multi-select) — selection is shared with the Stage and `Delete` unpatches it |
| `views/library.ts` | FIXTURE LIBRARY — vendor accordion, patch form; **Custom** (user) fixtures carry an inline delete (confirm dialog → `lumox:library:remove`) |
| `views/stage.ts` | STAGE — top-down 2D rig view of per-emitter footprints (emitter count **derived from the channel layout** — a 9-LED bar → 9 cells — drawn at `emitterLayout` positions or a single row), each emitter painting its **live mixed-output colour** (RGB × the dimmer that governs it — a fixture-wide master, or **one dimmer per segment** for multi-segment bars/matrices; RGB-only fixtures carry their **virtual** dimmer baked into the wire RGB already, so they get no extra master; glow; polled from `universes.read`, gated on visibility). Drag-move **always snaps** (fine-grid toggle quarters the step). The live selection is framed by a **bounding box**: round corner handles **rotate** it as a rigid body (about the centre; Ctrl-drag a fixture also rotates), square edge handles **scale** its spread. The stage is **shared between tabs but switches role**: **SETUP** positions fixtures (move/rotate/resize/arrange); **CONTROL** is **selection-only** (positioning controls + handles hidden, a click just selects). A **canvas-tool mode** (header, left) picks the gesture: **select/move** (V), **rect** marquee (M), **lasso** (L, point-in-poly by footprint centre), **hand/pan** (H); only select moves fixtures. A **middle-mouse drag pans** from any tool. Zoomed out far enough to fit the whole box, the card frame drops away so only grid lines show. A **left vertical rail** holds selection (select all `Ctrl+A` / deselect / invert), then align / distribute / reset-rotation. The header also carries **grid** (arrange + fine-grid toggle) and a **zoom** control (− / **log-mapped** slider centred on default / +; also `Ctrl`+scroll toward cursor, double-click slider to reset); zoom drives px-per-world-unit and grid/emitter-dot/selection-handle size via CSS vars. Placement is engine world geometry, persisted per fixture via `lumox:patch:setTransform` (see [fixtures.md](fixtures.md)) and consumed by MATRIX FX |
| `views/groupbar.ts` | GROUPS — group select/highlight |
| `views/fadereditor.ts` | FADER — left sidebar of attribute categories (DIMMER/COLOR/…/FADER) that highlight + scroll to their channels, over a strip-per-channel main area that **always shows every channel** (so switching category never reflows). A mixed-type group (e.g. the **All** tab) splits into labelled **blocks**, one per channel-config (writes broadcast to every fixture of that type); a homogeneous group is one block. Each strip stacks the channel number + value/OFF readout above a **full-height vertical fader** with its **colour swatch (and preset chips) in a left column** and an engage dot at the bottom; moving the fader auto-engages it. **EDIT** (recalled scene) / **BLIND** (edits the scene but freezes live output — skips the live-track mirror, commits on mode-exit via `scenes:commit`) / **LIVE** (programmer) target; LIVE header shows engaged count + **Clear** / **Store**. A compact **quick-ops** group beside the mode toggle acts on the target fixtures: **Beam On / Beam Off / Center Beam / Reset** (release all). Right rail: **GrandMaster** + a momentary **Blackout** (BO) — forced to zero only while held |
| `views/banks.ts` | BANKS — ordered scene groups: scene cells + a `+` that captures current output as a new scene, scene type & chase-step menu |
| `views/fxpalette.ts` | SCENE panel — header: scene name, rename **pencil**, live status + recall. A **right-hand icon rail** (FX / Scene / Advanced) switches the body between **full-width pages** (one section at a time). **FX Rack page** = the scene's content: a scene is a **STATIC base look by default** (its stored `values`, set on the fader bank), and the page is an inline **collapsible stack** of FX layer blocks over that base; each header carries `caret · enable dot · kind icon+name · target hint · reorder ▲▼ · delete`, and clicking it **expands that one layer in place** (single-expand accordion) to reveal target group + sweep order, kind config, then TIMING (Speed/Phasing/Size knobs `lib/knob.ts` + direction + drive/beat/rate); below sits the **content bar** — a leftmost **STEPS** toggle (switches the base from static to a timed cue sequence, whose step table then leads the rack) then the **add-FX** icons (color/move/curve/chaser/value/matrix) — and a **preset** apply/save footer. **Scene page**: Dimmer/Speed knobs, playhead transport, tempo drive+beat+BPM, start mode, fade timing. **Advanced page**: priority (low/normal/high), loop (always / ×N) with jump-to + release-at-end, release mode + protect-from-release (off/all/bank/outside-bank/specific), flash toggle — see [mix-engine.md](mix-engine.md#advanced-playback-priority-loopjump-releaseprotect-flash). Kind editors: COLOR (palette/gradient/transform), MOVE (shape + symmetry), CURVE/VALUE (waveform + min/max/duty), CHASER (lit/gap/levels), MATRIX (pattern + palette + scale/angle). MOVE/CURVE/VALUE editors draw a live full-width `<canvas>` preview (backing store at CSS-size × `devicePixelRatio`; theme colours from CSS vars) whose per-beam dots sit at the current FX playhead: live, the engine's layer phase is polled (`lumox:scenes:layerPhase` → `SceneMixer.layerPhaseInfo`) and dead-reckoned between samples; idle, a local `requestAnimationFrame` clock reuses the mixer's period + direction math. Knob/slider drags update the preview live, and a commit keeps scroll offset + playhead continuity because `rebuildSceneTrack` preserves the phase clock (only recall reseeds it per start mode) |
| `views/debug.ts` | DEBUG — 512 faders + live readback (full-page view, ⋯ menu) |
| `views/connection.ts` | CONNECTION — DMX output transport (Art-Net/sACN cards, target IP, refresh) + live status; full-page view on its own titlebar tab. See [connection.md](connection.md) |
| `fixtureeditor-window.ts` | Fixture editor — standalone window (own taskbar entry) |
| `midi-window.ts` | MIDI mapping — standalone window (own taskbar entry): connection status, **+ Add mapping** (click-to-assign), bindings table, live monitor. See [midi.md](midi.md) |
| `dialog-window.ts` | Generic **dialog window** (`dialog.html`) — button prompts/notices (unsaved-changes, missing fixtures, confirmations) **and text prompts** (rename a scene/bank/group, name a new preset/palette — native `window.prompt()` is unsupported in Electron). Renders a spec from main; reports the clicked button id (+ any typed text). See *Windows — no in-app modals* below |
| `panel-window.ts` | Generic **panel window** (`panel.html`) — hosts the richer former modals (Settings, group fixture-order) as real windows |
| `lib/midiassign.ts` | Main-window assign overlay — paints `[data-midi]` controls purple during assign mode and reports the picked target |

#### Windows — no in-app modals

The app uses **no overlay modals** — every transient surface is a real frameless
top-level window with its own taskbar entry (created **without** `parent`), so it
can be picked from the taskbar / alt-tab. Two are generic and reusable:

- **Dialog window** (`renderer/dialog.html` + `dialog-window.ts`, main:
  `handlers/dialog.ts`) — button prompts + notices, **or a single text field**.
  `openDialog(spec)` / `lumox.dialog.open(spec)` resolve with the clicked button id;
  the window's X / Esc resolve to the spec's `cancelId`. A spec with an `input` is a
  **text prompt**: `openPrompt(spec)` / `lumox.dialog.prompt(spec)` resolve with the
  entered string (or null when cancelled). The renderer helper `lib/prompt.ts`
  `promptText()` wraps it for renames / naming — the replacement for the native
  `window.prompt()`, which Electron does not support. Used by the unsaved-changes
  guard, the missing-fixtures notice, `lib/confirm.ts`, and every rename/name flow
  (scene/bank/group/preset/palette).
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
- **Emitters** — a per-mode **list** of light cells (the QLC-style "head" model).
  Each emitter is a group of channels shown as removable **chips** with a "+
  channel" picker; the cell's colour/dimmer **role is auto-detected** from those
  channels (`RGB`, `RGBW + Dim`, …) and shown beside the row. **+ Add emitter** and
  **Auto-detect** (group the colour channels by order) seed/rebuild the list; the
  groups reconcile when channels are added/removed. Saved as `FixtureMode.emitters`
  (1-based channel indices). This is what `emitterColorAddresses`/`emitterCount`
  resolve from ([fixtures.md](fixtures.md)). The editor no longer authors 2D
  positions — the engine still consumes `FixtureDefinition.emitterLayout` for the
  bundled matrix, but new head-grouped cells lay out as a single row.

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
  channels don't — including the read-only library catalog queries
  `library:vendors`/`library:vendor`, which would otherwise dirty a fresh load).
  The titlebar shows `— <file.lmx>` (the whole file name, derived from the project
  `path`; an unsaved/`Untitled` show falls back to the display `name` with `.lmx`
  appended, so the extension always shows) with a `*` when dirty.
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
