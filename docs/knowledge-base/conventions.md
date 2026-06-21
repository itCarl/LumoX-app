# Conventions

**Status:** stable
**Files:** whole app

## Language

Everything in English — code, comments, identifiers, UI strings, README, docs.

## No competitor names

**Never name other lighting-control software anywhere** — not in UI, README,
docs, comments, or commit messages. Describe capabilities generically instead
(e.g. "compatible with standard Art-Net / sACN consoles and software"). The
*only* exception is an unavoidable interop identifier — the name of a file
format the app actually reads or writes — and only where the feature can't be
described without it.

## Comments

**Use the minimum amount of comments necessary.** Prefer self-explanatory code —
clear names, small functions, obvious structure — over narration. Comment only
what the code cannot say itself: the *why* behind a non-obvious choice, a gotcha,
an invariant, or a workaround. Do not restate what the code already shows, and do
not leave commented-out code.

## Naming

- Project name: **Lumox** (DMX + Lumos).
- WiFi-AP default SSID: `Lumox`. mDNS host: `lumox.local`, service `_lumox._tcp`.

## App (Electron, TypeScript)

- **TypeScript + ESM everywhere** (`"type": "module"`). The Electron main and
  preload are *emitted* as CommonJS (`dist/main/index.cjs`, `dist/preload.cjs`) —
  Electron requires CJS for the main entry and the sandboxed preload.
- Import from the engine via `src/index.ts`, not deep paths.
- New output type: subclass `Output`, set static `TYPE`, register with
  `OutputManager.registerType`. New mix behaviour: subclass `MixModule`.
- IPC channels namespaced `lumox:<area>:<action>`; range-check payloads in
  `main/validate.ts`. Handler recipe: [app.md](app.md).
- The app **has a build step** — esbuild + Tailwind via `build.mjs`.

## UI copy & help text

- **No inline help / instructional text.** No prompts like "Select a fixture to…",
  hint banners, or explanatory paragraphs inside a panel — standing help text is
  clutter that competes with live data. When a control is unavailable, **grey it out
  in place** (don't replace it with a sentence) — see the
  [UI laws](../../.claude/skills/lumox-ui-design/SKILL.md) "disable, don't hide".
- **Explain on hover only.** Put guidance in a `title` tooltip on the control itself.
- A short **status note** for a genuine empty/error condition (e.g. "the selection
  has no dimmer or pan/tilt to limit") is fine — that reports state, not how-to help.

## CSS

- Dark theme, CSS custom properties (`--bg`, `--fg`, `--accent`, …).
- Tailwind v4 utility layer with `.lx-*` component classes; CSP is `style-src 'self'` (no CDN).

## Icons

- **Font Awesome (free, solid)** via `<i class="fa-solid fa-…">` is the default for
  **generic** icons. The webfont is vendored offline by `build.mjs` into
  `renderer/dist/fontawesome/` (no CDN; CSP `font-src 'self'`) and linked from the
  HTML. Size icons with `font-size` on the button/container (`color` tints them).
- **Custom UI icons** are allowed only for **domain-specific glyphs Font Awesome
  lacks** (DMX universe, emitter/node, fixture archetype, fan/phase, beat) — none
  exist yet. When needed, authored filled to match FA Solid weight and rendered as
  inline SVG through an `icon()` helper (spec: `renderer/icons/` source + `lib/icons.ts`).
  Don't redraw an icon FA already has. Full spec + workflow: the `lumox-icon-design` skill.
- Custom **SVG diagrams** (not icons) — e.g. the rotary knob dial (`lib/knob.ts`)
  and the FX preview shapes/waveforms (`views/fxpalette.ts`).

## Security baseline

Electron shell holds: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`; `contextBridge` only; CSP `<meta>` in every HTML; local content
only (`loadFile`); escape user strings via `esc()`; validate project files with
`validateProject()` before mutating engine state. Full checklist + audit steps:
[security.md](security.md).

## Knowledge base

For every new feature, update this knowledge base and link it in both index
tables (here and in `CLAUDE.md`). See [README.md](README.md).
