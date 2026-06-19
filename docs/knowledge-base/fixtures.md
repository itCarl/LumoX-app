# Fixtures & Channel Types

**Status:** stable
**Files:** `src/fixtures/` — `ChannelType.ts`, `ChannelDefinition.ts`, `FixtureMode.ts`,
`FixtureDefinition.ts`, `Fixture.ts`, `FixtureLibrary.ts`, `FixtureValidator.ts`,
`types/*.ts`, `importers/*.ts`

## What

The fixture system describes lighting devices and how their DMX channels map to
semantic roles. A `FixtureDefinition` carries one or more `FixtureMode`s; each
mode is an ordered list of `ChannelDefinition`s; each channel references a
`ChannelType` by id (`typeId`). When patched, a `Fixture` applies its channel
values into a `Universe` starting at `startAddress`.

The built-in channel-type set covers the **standard DMX channel presets**. New
types are added additively — existing ids never change (fixture-library JSON and
examples depend on them).

## How

### Channel types (`ChannelType` + `ChannelTypeRegistry`)

A `ChannelType` is `{ id, name, group, isIntensity, isColor, isPosition, fineOf,
color, defaultValue }`. Ids are kebab-case ASCII (`pan`, `pan-fine`,
`color-wheel`). Built-ins self-register via side-effecting imports in
[`types/*.ts`](../../src/fixtures/types) (bootstrapped by `src/fixtures/index.ts`).
Register more at runtime with `ChannelTypeRegistry.register(new ChannelType({…}))`
(see `examples/15-custom-channel-type.ts`).

Load-bearing flags (drive engine math, not just UI):

- `isIntensity` — GrandMaster + Blackout `intensity-only` modes scan these.
- `isColor` + `color` (hex) — the colour UI / swatch.
- `isPosition` — position-aware tooling.
- `fineOf` — id of the coarse counterpart for a 16-bit LSB channel
  (`fineOf: 'pan'`).

`group` is mainly a UI categorisation (channel-type dropdown optgroups, fader
icon fallback). Groups: `intensity`, `color`, `position`, `beam`, `prism`, `gobo`,
`control`, `effect`, `maintenance`. All colour-mixing channels (RGB/CMY/…/HSV)
live in `color`; the HSV controls (`hue`/`saturation`/`lightness`/`value`) sit
there too but carry **no** `isColor` (they are single faders, not swatches).

### Import (`importers/`)

Fixtures load from **Lumox JSON** (`.json` / `.lfx`) via `LumoxImporter`, the
only built-in format (round-trips through `serialize`). `ImporterRegistry` keys
importers by file extension; the registry is open if another format is ever added.

### Library & sources (`FixtureLibrary`, `main/services/UserLibraryService.ts`)

`FixtureLibrary` is one searchable store (`Map<id, FixtureDefinition>`, `id =
"${manufacturer}/${model}"`). Every definition carries a `source` tag set when
it's added:

- **`builtin`** — the read-only profiles shipped in the repo's
  [`fixtures/`](../../fixtures) directory, loaded at boot via
  `loadFromDirectory(FIXTURES_DIR, { source: 'builtin' })`. Organised
  `fixtures/<Vendor>/<model>.lumox.json`; the full bundled set (Generic + brand
  vendors) is catalogued in [`fixtures/README.md`](../../fixtures/README.md), which
  is also the authoring guide (skeleton, `typeId`s, `npm run validate`).
- **`user`** — fixtures the user authors in the fixture editor. Their vendor is
  **forced to `Custom`** (the editor's vendor field is read-only; real vendor
  profiles ship bundled with the app), and they persist outside the repo under
  the Electron `userData` directory (`<userData>/fixtures/<slug>.lumox.json`), so
  they survive restarts and are available to every project. `UserLibraryService`
  owns this: `loadUserLibrary()` runs at boot right after the built-ins; the
  `lumox:library:add` IPC handler forces the `Custom` vendor and calls
  `saveUserDefinition()` to write each new fixture to disk.

The renderer's library tile groups by `manufacturer`, so all user fixtures
surface under one **Custom** accordion, each with an inline delete button.
Deletion goes through `lumox:library:remove` → `deleteUserDefinitionFile()`,
which only removes `source === 'user'` profiles and refuses one still in the
patch (so saving a project can't silently drop its definition); the UI gates it
behind a confirm dialog (`renderer/lib/confirm.ts`). A project additionally
*embeds* the `source === 'user'` definitions it uses (see `ProjectService`) so
the project file stays portable on machines without that user's Custom library;
re-adding an embedded def is deduped by id.

### Emitter geometry & stage placement (`emitterGeometry.ts`, `Fixture.stageTransform`)

A fixture's light-emitting cells and where it sits on the 2D stage drive the
**STAGE tile** and **MATRIX FX** (pixel-mapping). The math lives in one pure,
dependency-free module — [`src/fixtures/emitterGeometry.ts`](../../src/fixtures/emitterGeometry.ts) —
shared by the engine **and** the browser renderer (it has only type imports, so
it bundles into the renderer without pulling Node code; the STAGE tile imports it
directly so its picture matches the engine exactly).

- **Emitter count is derived from the channel layout** — `resolveEmitterCount`
  counts the mode's repeating R/G/B clusters (`colorClusterCount`), so a PAR is 1
  cell, a 4-segment bar 4, a 9-LED bar 9, a 5×5 matrix 25 — no explicit count
  needed. It's the max of clusters, an explicit `emitterLayout` length, and any
  declared `emitters` (≥1). Because it reads the *mode's* channels,
  `Fixture.emitterCount` is per-instance (different modes expose different counts)
  and is what `FixtureDTO.emitters` carries (not the raw definition field).
- **World space** — one emitter cell = 1 world unit; a fixture's footprint is
  `cols × rows` cells (`emitterGrid`). A positioned `emitterLayout` (per-emitter
  normalized `{x,y}` 0..1 on the `FixtureDefinition`) whose length matches the
  count defines the matrix shape; otherwise the cells lay out as a **single
  horizontal row** (the honest default for a bar/strip).
- **`Fixture.stageTransform`** — `{ x, y, rotation }`: the footprint's top-left in
  world units + degrees (about its centre). Persisted in the project
  (`Fixture.toJSON`), surfaced as `FixtureDTO.transform`, and edited via
  `lumox:patch:setTransform` (the STAGE tile drag/rotate). New fixtures auto-place
  into a grid on first view and that placement is persisted, so the engine always
  has real coordinates.
- **Per-emitter accessors** — `Fixture.emitterWorldPositions()` (2D positions,
  rotation applied) and `Fixture.emitterColorAddresses()` (per-emitter
  `[r,g,b(,w)]` DMX addresses, by zipping each colour type in mode order). A
  single-colour fixture yields one cell; a matrix yields one per emitter. These
  are index-aligned — the pair MATRIX FX consumes (see
  [mix-engine.md](mix-engine.md)). The bundled `Generic/LED Matrix RGB 5×5 75ch`
  profile is a ready pixel-map example.

### Validation (`FixtureValidator.ts`)

Checks shape (`{version, definitions[]}`, required fields, 0–255 bounds) and
semantics: `typeId` registered, capability `kind` registered, non-overlapping
capability ranges (warning), ≤ 512 channels/mode, and a 16-bit-pair warning when
a `fineOf` channel appears without its coarse counterpart. Run on the built-in
library with `npm run validate`.

## Notes / Gotchas

- Ramp-direction presets keep distinct ids (`pan-speed-slow-fast` vs
  `…-fast-slow`, `prism-rotation-slow-fast` vs `…-fast-slow`) — they are separate
  presets, not a single bidirectional channel.
- `nothing` is a real registered type — the placeholder for unused channel slots.
- **Channel icons** live in `renderer/lib/channel-icons.ts` — `channelIcon()` /
  `channelIconHtml()` map a channel type to a Font Awesome glyph, keyed by id
  (`-fine` reuses its coarse glyph) with a per-`group` fallback. Colour emitters
  render as a dot tinted with the type's `color`. Used by the fader editor
  columns and the fixture editor channel rows. Adding a new `group` means adding
  it to `GROUP_ICONS` so unmapped ids don't render as `?`; add a `TYPE_ICONS`
  entry for any new type that deserves a distinct glyph.
</content>
