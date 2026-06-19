---
name: run-app
description: Build, launch, and screenshot the Lumox Electron app to verify renderer/UI changes. Use when asked to run the app, take a screenshot of it, or confirm a UI change works in the real app (not just tests).
---

Lumox is an Electron desktop app. To verify UI changes without a human at the
window, this skill boots the **real** main process and drives the renderer with
Electron's own `webContents` + `capturePage()` — **no Playwright / extra deps**.

The driver (`shot.cjs`) requires `dist/main/index.cjs`, so it boots the actual
engine + IPC; on a dev launch the main process seeds a full demo show (rig +
groups + scenes), so screenshots have real content. All paths are relative to
the app root (`lumox-app/`).

## Build first

```bash
node build.mjs          # produces dist/main/index.cjs + renderer/dist/*
```

## Run (current scenario: CONTROL fader editor)

```bash
# Windows / macOS desktop (needs a real display)
node_modules/electron/dist/electron.exe .claude/skills/run-app/shot.cjs   # Windows
node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .claude/skills/run-app/shot.cjs   # macOS
```

PowerShell, ensuring the env is sane:

```powershell
$env:ELECTRON_RUN_AS_NODE=$null; $env:LUMOX_SEED='1'
& "node_modules\electron\dist\electron.exe" ".claude\skills\run-app\shot.cjs"
```

Output → `./.shots/` (override with `LUMOX_SHOT_DIR`):
- `01-fader-dimmer.png` — fader tile, default tab
- `02-fader-all-live.png` — fader tile, ALL tab, LIVE, engaged faders
- `03-control-window.png` — whole CONTROL window
- `driver.log` — synchronous step log (read this first if a shot is missing)

**Then actually open the PNGs.** A blank/empty frame means the scenario didn't
reach the UI — check `driver.log` for the failing step + the `state:` dump.

## Drive a different view

`shot.cjs` is a scripted scenario, not a REPL. To screenshot something else,
edit the `app.whenReady()` body: it picks the richest auto-group, switches to
CONTROL/LIVE, clicks attribute tabs, and engages faders, all via
`js(wc, '<dom code>')` and `shoot(win, name, rectExpr)`. The helpers
(`waitFor`, `shoot`, `capture`, `dumpState`) are reusable for any view.

## Gotchas (things that actually bit)

- **`capturePage()` throws `UnknownVizError`** intermittently with GPU
  compositing when the window isn't on-screen. Fixed by
  `app.disableHardwareAcceleration()` (top of `shot.cjs`) + a capture retry that
  calls `win.showInactive()` first.
- **Faders need a render target.** In EDIT mode the fader tile shows "Recall a
  scene…" unless a scene is active — so the driver switches to **LIVE** before
  waiting for `.fcol`. LIVE renders faders unconditionally.
- **Don't set `ELECTRON_RUN_AS_NODE`.** With it set, `require('electron')`
  returns the binary path, not the API, and `main/index.ts` bails out by design.
- **Seed:** the demo rig is seeded when `!app.isPackaged` (dev). Force with
  `LUMOX_SEED=1`, force blank with `LUMOX_SEED=0`.
- **Data is driven via `window.lumox.*` IPC**, but the renderer's group bar only
  refreshes on its event bus — the driver clicks the real group **tab** to
  select, rather than poking the bus.
- **Launch by file** (`electron …/shot.cjs`), not `electron .`; the script
  `require()`s the built main itself.
