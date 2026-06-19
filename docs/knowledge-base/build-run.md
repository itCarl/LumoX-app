# Build & Run

**Status:** stable
**Files:** `package.json`, `build.mjs`

```bash
npm install
npm start         # build (esbuild + Tailwind) then launch Electron
npm run dev       # watch build + electronmon
npm run build     # build only → dist/ + renderer/dist/
npm run typecheck # tsc --noEmit
npm run headless  # engine only, no GUI (tsx src/headless.ts)
npm run cli       # standalone CLI (tsx cli/lumox-cli.ts)
npm run validate  # validate the built-in fixture library
npm run icons     # regenerate app icons from assets/icon.svg (see icon.md)
npm run lint      # ESLint (flat config)
npm run format    # Prettier
npm run example -- examples/01-engine.ts   # run any example via tsx
```

Build outputs: `dist/main/index.cjs`, `dist/preload.cjs`, `renderer/dist/*.js`,
`renderer/dist/tailwind.css`, `renderer/dist/fontawesome/` (vendored offline icon
font). `easymidi` is an optional dependency — the engine falls back to a mock MIDI
backend if it is absent. See [app.md](app.md).

**Dev boot project.** In development (`!app.isPackaged`) the app opens a bundled
**demo show** — a small rig (RGB PARs, moving heads, dimmers, LED bars) with auto-groups and
banks of scenes covering every FX type — so there's something to test against
immediately. It is a real project file, `resources/demo-show.lmx`, loaded through
the normal open path (`loadProjectFromPath` in `main/index.ts → bootShow`) and then
detached to an untitled "Demo Show" so a stray Save can't clobber the bundled file.
Packaged builds start blank. Override with `LUMOX_SEED=1` (force demo) or
`LUMOX_SEED=0` (force blank).

First-time device setup (flashing/joining an ESP32 node):
[architecture.md](architecture.md#new-device-setup-workflow).
