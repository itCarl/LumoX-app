---
name: run-app
description: Build, launch, and screenshot the Lumox Electron app to verify renderer/UI changes. Use when asked to run the app, take a screenshot of it, or confirm a UI change works in the real app (not just tests).
---

Lumox is an Electron desktop app. To verify UI changes without a human at the
window, this skill boots the **real** main process and drives the renderer with
Electron's own `webContents` + `capturePage()` — **no Playwright / extra deps**.

The driver boots the actual engine + IPC; on a dev launch the main process seeds
a full demo show (rig + groups + scenes), so screenshots have real content. All
paths are relative to the app root (`lumox-app/`).

## Run it

```bash
npm run shot                 # default scenario (fader editor)
npm run shot -- limits       # one scenario by name (see scenarios/ below)
npm run shot -- all          # every scenario + a contact-sheet.png montage
npm run shot -- ../../wires/scratch/my-thing.cjs   # a throwaway scenario by path
npm run shot -- limits --no-build                   # skip the staleness rebuild
```

`npm run shot` (= `tools/shot.mjs`) **builds if sources changed**, sets the env
correctly (unsets `ELECTRON_RUN_AS_NODE`, `LUMOX_SEED=1`, `LUMOX_DEV=1`), then
launches `shot.cjs <scenario>` under Electron. This replaces the old long
PowerShell incantation — just use `npm run shot`.

Output → `./.shots/` (override with `LUMOX_SHOT_DIR`): `<shot>.png` files,
`contact-sheet.png` (from `all`), and `driver-<scenario>.log` (read this first if
a shot is missing). **Then actually open the PNGs** — a blank frame means the
scenario didn't reach the UI; check the log for the failing step.

## Anatomy

- **`harness.cjs`** — shared boot + the toolkit every scenario gets: `js`,
  `shoot`, `waitFor`, `dev`, `findPanel`, plus `sleep`/`step`. Also `montage()`
  (contact sheet) and `boot()`. One place for the boilerplate that used to be
  copy-pasted.
- **`shot.cjs`** — runner. Resolves a scenario by name from `scenarios/index.cjs`,
  by `.cjs` path (throwaway), or `__contact` (composite the contact sheet).
- **`scenarios/*.cjs`** — one module per view: `{ cover?, async run(ctx) }`.
  `cover` is the hero shot that scenario contributes to the contact sheet.

Built-in scenarios: `fader` (CONTROL faders), `limits` (per-fixture limits clamp,
numeric), `limits-tile` (SETUP limits tile), `stage` (F1 ordered selection), `tempo` (F10 BPM
source via the Settings panel window), `flags` (F1 group fixture-order panel
window), `matrix` (matrix generator end to end — panel, create, patch, stage),
`remap` (pan range-remap, numeric only).

## Author a new scenario

Add `scenarios/<name>.cjs` and register it in `scenarios/index.cjs`:

```js
module.exports = {
  cover: 'my-01-hero',                 // optional — included in `shot -- all`
  async run({ js, waitFor, shoot, dev, sleep, step }) {
    await waitFor(`document.querySelector('.my-tile')`, 'my tile');
    await js(`document.querySelector('.tb-tab[data-tab="setup"]').click()`);
    step('engine state: ' + JSON.stringify(await dev(`return engine.scenes.tracks.size`)));
    await shoot('my-01-hero', '.my-tile');     // selector → clipped; add a 3rd arg for px padding
    await shoot('my-02-window');                // no selector → whole window
  },
};
```

The `ctx` toolkit:
- `js(code)` — run code in the **renderer** (returns the value).
- `dev(code)` — run code in the **main process** with `engine`/`show`/`banks` in
  scope (returns the JSON result). Needs `LUMOX_DEV=1`, which `npm run shot` sets.
  Use it to read engine internals the renderer IPC can't reach.
- `shoot(name, selector?, pad?)` — capture to `.shots/<name>.png`; clip to
  `selector` (+`pad` px) or the whole window.
- `findPanel(tries?)` — wait for the secondary **panel window**
  (`renderer/panel.html` — Settings, group fixture-order, create matrix) and get
  the same `js`/`waitFor`/`shoot` toolkit scoped to it, plus `.win` to close it.
  Returns `null` if it never appears.
- `waitFor(expr, label, tries?)`, `sleep(ms)`, `step(msg)`.

For a quick one-off (e.g. mocking up a layout from `wires/`), drop a `.cjs` in
`wires/scratch/` and run `npm run shot -- <path>` — no need to edit the registry.

## Numeric assertions without screenshots

`npm run frame` (= `tools/frame.ts`) ticks the **real** engine headlessly and
prints the mixed universe buffer as a raw → limited table — use it to assert
output/mix/limits math without a window. See
[build-run.md](../../../docs/knowledge-base/build-run.md).

## Gotchas (things that actually bit)

- **`require('./scenarios')` fails under Electron** — Node resolves a directory to
  `index.js`, not `index.cjs`. The runner requires `./scenarios/index.cjs` explicitly.
- **`capturePage()` throws `UnknownVizError`** intermittently with GPU compositing
  off-screen. Fixed by `app.disableHardwareAcceleration()` (in `harness.boot()`)
  + a capture retry that calls `win.showInactive()` first.
- **Faders need a render target.** In EDIT mode the fader tile shows "Recall a
  scene…" unless a scene is active — the `fader` scenario switches to **LIVE**
  first, which renders faders unconditionally.
- **Don't set `ELECTRON_RUN_AS_NODE`.** With it set, `require('electron')` returns
  the binary path, not the API, and `main/index.ts` bails out by design. The
  wrapper unsets it.
- **All former modals are now real windows** (own taskbar entry, custom Lumox
  chrome — no in-app overlays): the generic **dialog window** (`renderer/dialog.html`)
  for prompts/notices (unsaved-changes, missing-fixtures, confirmations) and the
  generic **panel window** (`renderer/panel.html`) for Settings + group fixture-order.
  A scenario drives the **main** window; drive a panel window via `ctx.findPanel()`
  (see toolkit above). Dialog windows are auto-dismissed (next gotcha) — for
  anything else, fall back to `BrowserWindow.getAllWindows()` and match
  `webContents.getURL()`.
- **Unsaved-changes dialog on quit.** A fresh boot is clean, but a scenario that
  edits the show makes it dirty, so `app.quit()` then fires the unsaved-changes
  prompt — the dialog window, **not** a native `showMessageBox`. With no human it
  would hang, so `harness.boot()` registers `autoDismissDialogs()`: it watches for
  the dialog window and clicks **Don't Save** (`button[data-id="dont-save"]`) once
  its buttons render. Look for `auto-pressed close dialog: dont-save` in the log.
- **Seed:** the demo rig seeds when `!app.isPackaged` (dev). Force with
  `LUMOX_SEED=1` (the wrapper does), force blank with `LUMOX_SEED=0`.
- **`probe-close.cjs`** is a separate one-off (not a screenshot scenario): it
  verifies the unsaved-changes close-guard by driving the real dialog window —
  Cancel keeps the window open, Don't Save closes it. Run it directly:
  `LUMOX_SEED=1 node_modules/electron/dist/electron.exe .claude/skills/run-app/probe-close.cjs`.
