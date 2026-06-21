# App Security

**Status:** stable
**Files:** `main/windows.ts`, `main/validate.ts`, `main/services/ProjectService.ts`, `main/handlers/dev.ts`, `renderer/lib/html.ts`, `renderer/*.html`, `src/outputs/ArtNetOutput.ts`, `src/protocols/sacn.ts`

## What

The Electron security baseline the app must hold, plus the recurring audit
checklist. Audit each release and after any change to the Electron shell, the IPC
surface, the project-file format, or the wire protocols.

## Baseline

### Electron shell

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every
  `BrowserWindow`.
- `contextBridge` only — no raw `ipcRenderer`/Node in the renderer.
- CSP `<meta>` in every HTML (`renderer/index.html`, `renderer/fixtureeditor.html`);
  `style-src 'self'` (no CDN).
- Navigation locked down via `hardenWindow()` (`main/windows.ts`):
  `setWindowOpenHandler` deny + `will-navigate` guard.
- Local content only — `loadFile`, never `loadURL`. No `eval`/remote module.
- `globalThis.lumox` is dev-gated.

### Dev eval bridge (`main/handlers/dev.ts`)

- `lumox:dev:eval` runs arbitrary code against the engine/show singletons — a
  **deliberate** arbitrary-code surface for the screenshot harness + devtools.
- Gated OFF by default: registered **only** when `LUMOX_DEV=1` (set solely by the
  `npm run shot` wrapper). `registerDevHandlers()` is a no-op otherwise, so the
  IPC channels do not exist in a normal/packaged run and the preload methods
  reject with "No handler registered".
- Never set `LUMOX_DEV` in a packaged/production launch.

### Untrusted input

- Escape all user-controlled strings rendered via `innerHTML` with `esc()`
  (`renderer/lib/html.ts`); prefer the `html` tagged template in
  `renderer/lib/dom.ts`, which auto-escapes (`raw()` only for trusted markup).
- Validate parsed project files with `validateProject()`
  (`main/services/ProjectService.ts`) before mutating engine state.
- Range-check IPC payloads in `main/validate.ts` (channels 1–512, universe,
  addresses, host, colours).

### Protocols

- Art-Net capped at 44 Hz (`src/outputs/ArtNetOutput.ts`).
- sACN priority clamped 0–200 (`buildDataPacket` in `src/protocols/sacn.ts`).

## Audit steps

1. Re-run the Electron shell checklist against `main/index.ts`, `main/windows.ts`
   and both HTML files.
2. Grep the renderer for unescaped `innerHTML` interpolation (anything bypassing
   `esc()` / the `html` template).
3. `npm audit`.
4. `npm run lint`.

## Notes / Gotchas

- Conventions + a short security summary: [conventions.md](conventions.md).
- App overview (shell, IPC surface, renderer): [app.md](app.md).
