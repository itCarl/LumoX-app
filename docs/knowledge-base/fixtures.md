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

### Capabilities — value ranges & the channel editor (`Capability.ts`, `goboPattern.ts`)

A channel can carry an ordered list of **capabilities**: labelled DMX value ranges
that say what each value *does* (`0–9 Open`, `10–50 Gobo 1`, `128–200 Strobe
slow→fast`). `Capability` (base `range`) plus subclasses `ColorCapability`
(`color` hex), `GoboCapability` (`pattern`/`shake`), `ShutterCapability`
(`mode`/`rateHz`) and `EffectCapability` (`effectName`) self-register in
`CapabilityRegistry` by `static KIND`; `ChannelDefinition.capabilities` round-trips
them through `toJSON`/`fromJSON`. `FixtureValidator` checks each range is in 0–255,
`min ≤ max`, the `kind` is registered, and warns on overlap.

These are **authored in the fixture editor** ([`renderer/fixtureeditor-window.ts`](../../renderer/fixtureeditor-window.ts)):
each channel row drills down (chevron) to a **VALUE RANGES** panel — a table of
`min / max / label / kind` rows with kind-specific controls (colour swatch, shutter
mode, gobo paint), **+ Range**, remove, and an **Auto-fill** wizard that generates
evenly spaced ranges from start / width / count / a `#`-templated name (mirrors the
QLC+ capability wizard). `caps` reach the renderer via `FixtureDTO` (see
[app.md](app.md)); the fader editor surfaces them as a per-channel column of
**preset chips** beside the fader — a colour swatch, a drawn-gobo thumbnail, or a
labelled chip — and annotates the strip with the active range's label (a drawn gobo
also replaces the strip icon). See [mix-engine.md](mix-engine.md#channel-presets-profile-ranges).

**Drawn gobo icons.** A `GoboCapability.pattern` is a hand-drawn mono icon — a
`GOBO_GRID × GOBO_GRID` (16×16) on/off bitmask encoded `"g16:"+base64` by the pure,
dependency-free [`src/fixtures/goboPattern.ts`](../../src/fixtures/goboPattern.ts)
(`encodeGobo`/`decodeGobo`, bundled into the renderer like `emitterGeometry.ts`). The
editor's **Paint** button opens a click-and-drag grid ([`renderer/lib/goboPaint.ts`](../../renderer/lib/goboPaint.ts));
[`renderer/lib/gobo.ts`](../../renderer/lib/gobo.ts) `goboSvg()` renders a pattern to a
circle-masked SVG. On the **GOBO fader strip** the icon becomes the drawn gobo of the
range the fader is currently on — updated live as you drag — so the selected gobo is
recognisable at a glance instead of a generic glyph.

### Import (`importers/`)

Fixtures load from **Lumox JSON** (`.json` / `.lfx`) via `LumoxImporter`, the
only built-in format (round-trips through `serialize`). `ImporterRegistry` keys
importers by file extension; the registry is open if another format is ever added.

**Bulk porting from upstream `.qxf` (`tools/qxf-to-lumox.ts`).** The shipped library
is grown from an open, community-maintained **DMX fixture library** in the `.qxf`
XML format (Apache-2.0) via an authoring-time converter —
`npm run port-qxf -- <srcDir> <Vendor...>`. Both formats describe ordered channels
per mode (semantic role + value-range meanings), so the port is a structural
translation driven by one preset/group → `typeId` table inside the tool: channel-level
presets (`PositionPan`, `IntensityRed`, `ShutterStrobeSlowFast`, plus a
`<Group>`+`<Colour>`+name fallback) and capability-level presets
(`ColorMacro`/`GoboMacro`/`Rotation*` → Lumox `color`/`gobo`/`shutter`/`effect`
capabilities, colours from `Res1` hex). It writes `fixtures/<Vendor>/<slug>.lumox.json`,
**never overwrites** an existing file (hand-authored profiles win), and only emits
fixtures that pass `FixtureValidator` — anything that doesn't map cleanly is reported
and skipped. Provenance + Apache-2.0 attribution (original author + source file) go in
each definition's `meta`. The upstream `.qxf` source tree is **not** vendored here;
check it out separately to run another batch. Requires the `fast-xml-parser` dev dependency.

### Library & sources (`FixtureLibrary`, `main/services/UserLibraryService.ts`)

`FixtureLibrary` is one searchable store (`Map<id, FixtureDefinition>`, `id =
"${manufacturer}/${model}"`). Every definition carries a `source` tag set when
it's added:

- **`builtin`** — the read-only profiles shipped in the repo's
  [`fixtures/`](../../fixtures) directory, organised `fixtures/<Vendor>/<model>.lumox.json`;
  the full bundled set (Generic + brand vendors) is catalogued in
  [`fixtures/README.md`](../../fixtures/README.md), also the authoring guide
  (skeleton, `typeId`s, `npm run validate`). **Lazy-loaded per vendor:** the
  bundled library is hundreds of files, so boot only registers the root
  (`setBuiltinRoot(FIXTURES_DIR)`) — nothing is parsed. A vendor's files are
  parsed on demand: when its accordion opens (`ensureVendor` via
  `lumox:library:vendor`), when a definition it owns is patched or restored from a
  project (`ensure(id)` / `ensureForIds`, keyed off the `<Vendor>/…` id prefix =
  folder name), or when a search forces a full load (`ensureAll` via
  `lumox:library:list`). The cheap `vendors()` (directory scan, file counts only)
  drives the collapsed accordion heads. `get`/`list` stay synchronous and
  return only what's been loaded so far.
- **`user`** — fixtures the user authors in the fixture editor. Their vendor is
  **forced to `Custom`** (the editor's vendor field is read-only; real vendor
  profiles ship bundled), and they persist outside the repo under the Electron
  `userData` directory (`<userData>/fixtures/<slug>.lumox.json`), so they survive
  restarts and reach every project. `UserLibraryService` owns this:
  `loadUserLibrary()` runs at boot right after the built-ins; the
  `lumox:library:add` IPC handler forces the `Custom` vendor and calls
  `saveUserDefinition()` to write each new fixture to disk. For **Moving Head /
  Scanner** types the editor also authors **pan / tilt max travel in degrees**
  (`physical.focus.panMax`/`tiltMax`) — the source the Limits tile reads to show
  pan/tilt in absolute degrees (see [limits.md](limits.md)). Built-in movers ship
  these in their profiles.

**Editing existing fixtures.** The library tile gives every row an inline **Edit**
(pencil) button; `lumox.editor.open(defId)` opens the editor pre-loaded with that
definition's full authoring JSON (`lumox:editor:target` peeks the id set by the open
and returns `def.toJSON()` + `source`, lazy-loading the vendor so any fixture is
editable). The editor's init builds its `state` from that target — modes, channels,
capabilities, physical, name/type — instead of the blank RGB default. **Saving** goes
through the same `lumox:library:add`, which always forces the `Custom` vendor, so:
a **`user`** fixture updates **in place** (replace by id; the editor passes its old id
as `replaceId` so a rename drops the stale file), while a **built-in** edit saves a new
**Custom copy** (the read-only original is untouched — the Save button reads
*"Save Custom copy"* vs *"Save changes"*). Already-patched fixtures keep the old
definition until re-patched (patched `Fixture` instances hold their definition by
reference).

The renderer's library tile groups by `manufacturer`, so all user fixtures
surface under one **Custom** accordion, each with inline Edit + Delete buttons.
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
  `{x,y}` normalised 0..1 on the `FixtureDefinition`) whose length matches the
  count defines the matrix shape; otherwise the cells lay out as a **single
  horizontal row** (the honest default for a bar/strip).
- **Fixed stage box** — `STAGE_SIZE` (`{ width: 64, height: 36 }` world units, 16:9)
  is the bounded 2D stage every fixture lives inside. The STAGE tile draws it as a
  bordered, grid-ruled box; **only the box is ruled** — the surrounding canvas is a
  plain dark backdrop with no grid of its own, so the grid stays bounded to the stage
  and never bleeds out past the border. Zoom-out is capped so the whole box stays in
  view. The view zooms/pans within it and **Fit** frames the fixtures (not the empty box).
- **`Fixture.stageTransform`** — `{ x, y, rotation }`: the footprint's top-left in
  world units + degrees (about its centre). The **runtime + engine work in raw world
  units** (only relative positions matter to MATRIX FX, so absolute scale is free),
  but the value is **persisted normalised to the stage box** (`x/width`, `y/height`
  → 0..1 per axis) — `normalizeTransform` in `Fixture.toJSON`, `denormalizeTransform`
  in `restoreProject` — so a saved show is resolution-independent. Surfaced (world
  units) as `FixtureDTO.transform`; edited via `lumox:patch:setTransform` (STAGE tile
  drag/rotate, clamped to the box). New fixtures auto-place **clustered at the stage
  centre** on first view and that placement is persisted, so the engine always has
  real coordinates.
- **Per-emitter accessors** — `Fixture.emitterWorldPositions()` (2D positions,
  rotation applied) and `Fixture.emitterColorAddresses()` (per-emitter
  `[r,g,b(,w)]` DMX addresses, by zipping each colour type in mode order). A
  single-colour fixture yields one cell; a matrix yields one per emitter. These
  are index-aligned — the pair MATRIX FX consumes (see
  [mix-engine.md](mix-engine.md)). The bundled `Generic/LED Matrix RGB 5×5 75ch`
  profile is a ready pixel-map example.
- **Virtual dimmers** — `Fixture.needsVirtualDimmer()` / `Fixture.virtualDimmers()`.
  A fixture that mixes colour (≥1 RGB cluster) but has **no `isIntensity` channel**
  gets one synthetic per-cluster dimmer that scales that cluster's RGB output, so
  it dims like any fixture (fader, scenes, group/master, intensity FX). Full
  design in [virtual-dimmers.md](virtual-dimmers.md).

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
  render as a dot tinted with the type's `color`. Used by the fader editor columns
  and the fixture editor channel rows. On the GOBO fader strip a channel whose
  active capability has a drawn `pattern` shows that gobo (via `goboSvg`) instead of
  the group glyph. Adding a new `group` means adding it to `GROUP_ICONS` so unmapped
  ids don't render as `?`; add a `TYPE_ICONS` entry for any new type deserving a
  distinct glyph.
</content>
