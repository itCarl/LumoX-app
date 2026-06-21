# End-to-End Tests (Playwright + Electron)

**Status:** stable
**Files:** `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/*.spec.ts`

## What

Drives the **real, fully-assembled app** — main process + headless engine +
`preload` IPC bridge + renderer — through Playwright's **Electron driver**
(`_electron.launch`). Where the Vitest specs in `test/` unit-test the deterministic
engine core in isolation (no Electron, no DOM — see
[build-run.md](build-run.md#tests)), the E2E suite verifies the whole product is
*wired*: a click in the renderer travels through IPC to the engine and back, and
multi-window flows work.

Electron renders in its **bundled Chromium only** — the renderer can't run in a
plain browser because it depends on the `window.lumox` bridge the preload injects.
So there is **no Firefox/Chrome cross-browser matrix**; the one "browser" is
Electron's Chromium. The window is pinned to a **1920×1080** content box.

Coverage is **two layers** (~126 tests):

1. **DOM** — every view + secondary window boots and its real controls work (clicks,
   drags, selects, mode toggles), asserting on stable selectors.
2. **IPC integration** — the complete `window.lumox.*` capability surface from
   `preload.ts`, driven end-to-end through the real preload → main process → engine,
   with create→assert→clean-up round-trips so the demo show stays intact. This is
   where the deepest coverage lives: full scene/FX-layer/patch/group/selection/
   palette/preset/bank/transport/audio/settings/library CRUD, plus deterministic
   programmer → GrandMaster → Limits → live-buffer paths.

## How

- **`npm run test:e2e`** builds (`dist/`) then runs `playwright test`. Config:
  `testDir: e2e`, **serial** (`workers: 1`, `fullyParallel: false`) because the app
  takes `requestSingleInstanceLock()` and owns exclusive Art-Net/sACN sockets — two
  instances would fight. HTML report → `e2e/report/` (`npm run test:e2e:report`).
- **`e2e/fixtures.ts`** is the shared harness (a `test.extend`):
  - **`electronApp`** (worker-scoped) launches the app once via
    `electron.launch({ args: ['.'] })` with `LUMOX_SEED=1` (force the bundled demo
    show — 24 fixtures, auto-groups, 9 banks / 55 scenes) and `LUMOX_DEV=1` (enable
    the `window.lumox.dev.eval` main-process bridge); `ELECTRON_RUN_AS_NODE` is
    stripped (it makes `main/index.ts` bail by design). Pins content size to
    1920×1080; teardown calls `app.exit(0)` to bypass the unsaved-changes close guard.
  - **`page`** (test-scoped) returns the main renderer window and runs `resetState`:
    destroy child windows, **reload the renderer** (so view-local DOM state never
    leaks between tests; engine/show state survives the reload), clear the live
    selection + programmer, restore master/blackout, return to the **Setup** tab.
  - Helpers: `gotoTab(page, 'setup'|'control'|'connection')`, `mainWindow(app)`,
    `dev(page, code)` (run code in the main process), `ipc(page, 'area.action', …)`
    (call any `window.lumox.*` method by dotted path — the backbone of the IPC specs),
    `resetState`.
- **Spec files** — DOM specs assert on **stable selectors** (ids, `data-*`,
  semantic classes); `ipc-*` specs drive the capability surface through `ipc()`:

  | Spec | Covers |
  | --- | --- |
  | `app-shell.spec.ts` | Titlebar, tab nav, ⋯ menu, project name, BPM clock, window controls, undo/redo |
  | `setup-library.spec.ts` | Library tile — vendor accordions (lazy), search, fixture detail/patch form |
  | `setup-patchgrid.spec.ts` | Patch grid — populated rig, fixture select, grid/list toggle, universe |
  | `setup-stage.spec.ts` · `stage-deep.spec.ts` | Stage — nodes, click-select + index badge, tool rail, quick-select, zoom in/out/fit, order-invert, arrange |
  | `setup-limits.spec.ts` | Limits tile — ghost vs. selected, name/count label, Clear |
  | `groupbar.spec.ts` | Groups strip — All selects the rig, group tabs select their fixtures |
  | `control-banks.spec.ts` | Banks — scene cells, toggle live, bank switch, select-for-edit |
  | `control-sceneprops.spec.ts` · `sceneprops-deep.spec.ts` | Scene props / FX rack — title, rail pages, add every FX kind, expand/collapse, base STATIC/CHASE |
  | `control-fadereditor.spec.ts` · `fadereditor-deep.spec.ts` | Fader editor — EDIT/LIVE, programmer engage via fader drag, attribute sidebar, GrandMaster, Clear, Blackout |
  | `connection.spec.ts` · `connection-deep.spec.ts` | Connection — output rows, Art-Net/sACN → IP state, enable/mode/rate, audio section + binding add, discovery |
  | `debug.spec.ts` | Debug grid — 512 faders, a fader drives the live buffer, Zero universe |
  | `windows-secondary.spec.ts` | Secondary windows — MIDI, fixture editor, Settings panel, generic dialog |
  | `engine-dmx.spec.ts` · `ipc-limits-engine.spec.ts` | Engine wiring — scene recall + blackout reach the buffer; programmer → GrandMaster → dimmer-Limit → buffer (deterministic) |
  | `ipc-patch-groups.spec.ts` | Patch + group CRUD — add/rename/move/remove, overlap rejection, group membership + config guard |
  | `ipc-selection.spec.ts` | Live selection (set/add/remove/all/invert/reorder) + saved selections (save/recall/rename/setFixtures/remove) |
  | `ipc-scenes.spec.ts` | Scene lifecycle + all playback/advanced properties + chase steps + transport |
  | `ipc-scenes-fx.spec.ts` | FX rack — add every layer kind, enable/target/order/timing, kind-specific config, move/remove |
  | `ipc-banks.spec.ts` | Bank CRUD + capture-into-bank + scene drop on removal |
  | `ipc-transport-audio-midi.spec.ts` | Tempo (BPM clamp, source), audio binding CRUD + targets, MIDI status/bindings/assign |
  | `ipc-settings-library.spec.ts` | Settings get/update round-trip + clamp; library vendors/types/add-Custom/remove guard |
  | `ipc-palettes-presets.spec.ts` | Colour palette CRUD + hex filter; FX-rack preset save/apply/rename/remove |

## Notes / Gotchas

- **Booted once per worker (= per run, since `workers: 1`) and reused.** `resetState`
  reloads the renderer for a pristine DOM, but engine state (a rename, a captured
  scene) persists — mutating tests undo/clean up after themselves.
- **Undo/redo reload the renderer.** Restoring a whole-show snapshot fires
  `project:loaded`, whose handler calls `location.reload()`. History-triggering tests
  must await the `load` event, not just the IPC call (see `app-shell`).
- **The resting universe buffer isn't all zeros** (fixtures hold home values such as
  centred pan/tilt). Engine specs compare against a baseline / look for a blackout
  *reduction*, not absolute zero.
- **No browser download needed.** The Electron driver uses the app's own `electron`
  binary, so `@playwright/test` is the only added dependency — no `playwright install`.
- The mix **math** is not re-tested here — that lives in the Vitest engine specs
  (`test/mix/*`). The E2E suite proves the wiring around it.
