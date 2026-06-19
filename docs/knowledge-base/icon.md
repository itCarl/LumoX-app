# App Icon

**Status:** stable
**Files:** `assets/icon.svg` (source), `assets/icon.ico` · `assets/icon.png` · `assets/icon@2x.png` (generated), `tools/make-icons.cjs`, `main/windows.ts`

## What

The Lumox brand mark and application icon. Concept: *Lumos* (light) + **DMX** —
two stage-light sources at the top corners fire diagonally, each beam spreading
into a **cone**, and cross through the centre to form an **X**; screen-blended,
their overlap fuses to a white-hot core (a nod to DMX additive colour mixing).
Brand accent blue (`#5eb3ff` family) paired with a violet, two lens sources on a
dark rounded tile that matches the app shell.

`assets/icon.svg` is the **single source of truth**. The raster files are
generated from it and committed so they are available at runtime and to any
future packaging step without a build.

## How

- **Generate:** `npm run icons` → `electron tools/make-icons.cjs`. The tool
  renders `icon.svg` at 1024px via Electron **offscreen rendering** (no GPU,
  `force-device-scale-factor=1` → deterministic pixels), downsamples to each
  target size with `nativeImage.resize({ quality: 'best' })`, and writes:
  - `icon.ico` — multi-resolution `16/24/32/48/64/128/256`, assembled by a tiny
    pure-JS encoder embedding PNG entries (the Vista+ container form).
  - `icon.png` (256) and `icon@2x.png` (512) — PNG fallback / favicon use.
- **Window + taskbar:** `main/windows.ts` sets `icon` on both BrowserWindows to
  `assets/icon.ico` on Windows, `assets/icon.png` elsewhere (macOS ignores it —
  its dock icon comes from the packaged `.app`). This is the only place the icon
  is shown — the custom titlebar deliberately carries the "Lumox" name only, no
  inline mark.

## Notes / Gotchas

- The tool is **CommonJS (`.cjs`) on purpose**: run as an Electron main entry it
  gets the real main-process API from `require('electron')`. An ESM entry only
  sees the npm shim (a path string), and `createRequire` in ESM doesn't route
  through Electron's patched loader.
- If `ELECTRON_RUN_AS_NODE` is set in the environment, Electron starts as plain
  Node and `app`/`BrowserWindow` are undefined — unset it before running.
- Editing the look: change **`assets/icon.svg` only**, then re-run `npm run
  icons` to regenerate every raster. Don't hand-edit the `.ico`/`.png`.
- `screen` blend + the beam gradients keep both cone legs visible end-to-end;
  the two bright top lenses and the centre core are the high-contrast anchors
  that survive downscaling to 16px.
