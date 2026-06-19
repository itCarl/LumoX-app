# Lumox Fixture Library

Built-in fixture profile data. Each `.lumox.json` file is one or more
fixture definitions loadable via `FixtureLibrary.loadFromDirectory(...)`.

Subfolders group profiles by vendor. The loader recurses, so adding a new
vendor is just `mkdir Vendor/` + dropping profile files in.

> **Built-in profiles only.** This directory ships read-only with the app
> (`source: "builtin"`). Fixtures the user authors in the fixture editor are
> *not* saved here — they are always filed under the **Custom** vendor and
> persist under the Electron `userData` directory (`<userData>/fixtures/`,
> `source: "user"`), kept by `main/services/UserLibraryService.ts` (delete them
> from the library tile). Don't add a `Custom/` folder here.

## Folder layout

```
fixtures/
├── README.md
├── schema/
│   └── lumox-fixture.schema.json   JSON Schema (Draft 2020-12) — for IDE + validators
├── Generic/                        Vendor-agnostic profiles
│   ├── dimmer-1ch.lumox.json
│   ├── par-rgb-4ch.lumox.json
│   ├── par-rgbw-multimode.lumox.json     ← multi-mode example
│   ├── moving-head-multimode.lumox.json  ← multi-mode example
│   └── ...
├── Stairville/                     Vendor folder
│   ├── led-bar-240-8-rgb.lumox.json
│   └── led-pixel-bar-100-mk2-rgb.lumox.json
└── Chauvet DJ/ · American DJ/ · Martin/ · Robe/ · Eurolite/ · Cameo/
    Showtec/ · Elation/ · GLP/ · ETC/ · UKing/ · WLED/ · NoName/   ← brand vendor folders
```

## Validating

```bash
node examples/19-validate-fixtures.js                # whole library
node examples/19-validate-fixtures.js fixtures/Acme  # one vendor
```

Or programmatically:

```js
import { FixtureValidator } from '../src/index.js';
const v = new FixtureValidator();
const result = v.validate(JSON.parse(text));
// { valid: bool, errors: [{path, message}], warnings: [{path, message}] }
```

Checks performed:
- Top-level shape (`version: 1`, `definitions: []`)
- Required fields per definition / mode / channel / capability
- `typeId` registered in `ChannelTypeRegistry`
- Capability `kind` registered in `CapabilityRegistry`
- Capability `min ≤ max` and within 0-255
- Mode ids unique within a definition
- Channel count ≤ 512
- ISO 8601 dates parseable (warning)
- Semver string parseable (warning)
- Capability range overlaps (warning)
- Hex color format `#rgb` / `#rrggbb` (warning)
- Fine channel present without coarse counterpart (warning)

## IDE schema integration

Add `$schema` at the top of any fixture file to get auto-completion +
schema validation in VS Code (and any editor with JSON Schema support):

```json
{
  "$schema": "../schema/lumox-fixture.schema.json",
  "version": 1,
  "definitions": [ ... ]
}
```

The path is relative to the fixture file. The Lumox importer ignores
`$schema` — it's only metadata for tooling.

## Loading

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureLibrary } from '../src/index.js';

const lib = new FixtureLibrary();
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const result = await lib.loadFromDirectory(dir);
console.log(`Loaded ${result.loaded}, skipped ${result.skipped}`);

const movers = lib.find({ type: 'Moving Head' });
const stair  = lib.find({ manufacturer: 'Stairville' });
```

---

# Fixture file format

A `.lumox.json` file is a wrapper around one or more definitions:

```json
{
  "version": 1,
  "definitions": [ /* one or more FixtureDefinition objects */ ]
}
```

## FixtureDefinition

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | no | Auto-derived as `"${manufacturer}/${model}"` if omitted |
| `manufacturer` | string | **yes** | Vendor name. Matches folder convention. |
| `model` | string | **yes** | Product name |
| `type` | string | no | `PAR` · `Moving Head` · `Strobe` · `LED Bar` · `Dimmer` · `Smoke` · `Laser` · `Other` |
| `meta` | object | no | See below |
| `physical` | object | no | See below |
| `modes` | array | **yes** | One or more FixtureMode entries |

## `meta` block

Authorship and provenance info. All fields optional — set what you have.

```json
"meta": {
  "author": "Your Name",
  "version": "1.0.0",
  "createdAt": "2026-06-01T00:00:00.000Z",
  "modifiedAt": "2026-06-01T00:00:00.000Z",
  "source": "URL or manual reference",
  "notes": "Free text — mode mapping caveats, calibration notes, etc."
}
```

| Field | Format |
|-------|--------|
| `author` | string |
| `version` | semver string (`"1.0.0"`) |
| `createdAt` | ISO 8601 timestamp |
| `modifiedAt` | ISO 8601 timestamp — `definition.touch()` updates this |
| `source` | string (URL or text reference where channel mapping came from) |
| `notes` | string (caveats, gotchas, calibration hints) |

## `physical` block

Real-world specs — used by the future patch UI for footprint planning and
weight totals. All sub-objects optional; omit any you don't have.

```json
"physical": {
  "dimensions": { "width": 1000, "height": 60, "depth": 80, "unit": "mm" },
  "weight":     { "value": 3.0, "unit": "kg" },
  "bulb":       { "type": "LED", "lumens": 1500, "colourTemperature": 6500 },
  "lens":       { "name": "PC", "degreesMin": 10, "degreesMax": 60 },
  "focus":      { "type": "Head", "panMax": 540, "tiltMax": 270 },
  "power":      { "consumption": 45, "unit": "W" }
}
```

| Sub-object | Fields | Meaning |
|------------|--------|---------|
| `dimensions` | `width`, `height`, `depth`, `unit` | unit = `"mm"` or `"cm"` |
| `weight` | `value`, `unit` | unit = `"kg"` |
| `bulb` | `type`, `lumens`, `colourTemperature` | type free string (`"LED"`, `"Halogen"`) |
| `lens` | `name`, `degreesMin`, `degreesMax` | beam angle min/max |
| `focus` | `type`, `panMax`, `tiltMax` | `Head` / `Mirror` / `Fixed`. Pan/tilt in degrees. |
| `power` | `consumption`, `unit` | unit = `"W"` |

## FixtureMode

One personality (channel layout). Most fixtures ship multiple modes —
e.g. 3-ch RGB, 6-ch with master+strobe, 24-ch pixel mode. Each goes into
the `modes[]` array.

```json
{
  "id": "8ch",
  "name": "8ch Standard",
  "channels": [ /* ChannelDefinition */ ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | unique within fixture (used by patch save/load) |
| `name` | string | UI label |
| `channels` | array | ordered — index 0 = `startAddress`, index N = `startAddress + N` |

## ChannelDefinition

```json
{
  "name": "Red",
  "typeId": "red",
  "defaultValue": 0,
  "capabilities": []
}
```

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | UI label (free text) |
| `typeId` | string | **must match a registered ChannelType id** |
| `defaultValue` | int 0-255 | power-on value |
| `capabilities` | array | optional list of value-range meanings |

### Built-in `typeId` values

Group `intensity`:  `intensity` · `intensity-fine` · `shutter` · `strobe` · `dimmer-curve`

Group `color`: `red` · `green` · `blue` · `white` · `amber` · `uv` · `lime` ·
`cyan` · `magenta` · `yellow` · `red-fine` · `green-fine` · `blue-fine` ·
`white-fine` · `cto` · `ctb` · `color-wheel` · `color-macro`

Group `position`: `pan` · `tilt` · `pan-fine` · `tilt-fine` · `pan-tilt-speed`

Group `beam`: `zoom` · `focus` · `iris` · `frost` · `prism` · `prism-rotation` · `blade-1` · `blade-2`

Group `gobo`: `gobo-wheel-1` · `gobo-wheel-2` · `gobo-rotation-1` · `gobo-rotation-2` · `gobo-shake`

Group `control` / `maintenance` / `effect`: `speed` · `sound` · `macro` ·
`function` · `reset` · `lamp` · `fan` · `effect` · `effect-speed` · `nothing`

To register custom types at runtime see `examples/15-custom-channel-type.js`.

### 16-bit channel pairs

Coarse + fine channels are linked by `fineOf` on the ChannelType. The
fixture API auto-pairs them:

```js
fixture.set16('pan', 0xa3f7);   // writes pan + pan-fine if both present
```

## Capability

A value-range label. `kind` selects the subclass. All capabilities share
`min`, `max`, `label`. Kind-specific fields below.

```json
{ "kind": "range",  "min": 0,   "max": 9,   "label": "Off" }
{ "kind": "color",  "min": 10,  "max": 20,  "label": "Red",    "color": "#ff0000" }
{ "kind": "gobo",   "min": 21,  "max": 31,  "label": "Stars",  "image": "stars.png", "shake": false }
{ "kind": "shutter","min": 216, "max": 255, "label": "Strobe", "mode": "strobe",     "rateHz": 20 }
{ "kind": "effect", "min": 128, "max": 191, "label": "Chase",  "effectName": "color-chase" }
```

`shutter.mode`: `"open"` · `"closed"` · `"strobe"` · `"pulse"` · `"random"`

Register custom kinds — see `examples/16-custom-capability.js`.

---

# How to create a new fixture

## 1. Pick a vendor folder

`fixtures/<Vendor>/` — make a new one if needed. Use the brand name
exactly as printed on the fixture.

## 2. Name the file

`<model-slug>.lumox.json`. Lowercase, hyphens, no spaces. Match the
product model number.

## 3. Start from this skeleton

```json
{
  "version": 1,
  "definitions": [
    {
      "id": "VendorName/Model Name",
      "manufacturer": "VendorName",
      "model": "Model Name",
      "type": "PAR",
      "meta": {
        "author": "Your Name",
        "version": "1.0.0",
        "createdAt": "2026-06-01T00:00:00.000Z",
        "modifiedAt": "2026-06-01T00:00:00.000Z",
        "source": "Manufacturer manual page 12",
        "notes": ""
      },
      "physical": {
        "dimensions": { "width": 200, "height": 200, "depth": 100, "unit": "mm" },
        "weight":     { "value": 1.5, "unit": "kg" },
        "power":      { "consumption": 30, "unit": "W" }
      },
      "modes": [
        {
          "id": "3ch",
          "name": "3ch",
          "channels": [
            { "name": "Red",   "typeId": "red",   "defaultValue": 0, "capabilities": [] },
            { "name": "Green", "typeId": "green", "defaultValue": 0, "capabilities": [] },
            { "name": "Blue",  "typeId": "blue",  "defaultValue": 0, "capabilities": [] }
          ]
        }
      ]
    }
  ]
}
```

## 4. Add modes

Most fixtures have 2-4 personalities. List all you want to support — your
patch UI lets the user pick one.

See `Generic/par-rgbw-multimode.lumox.json` for 4-mode example (3 / 4 / 5 / 8 ch),
and `Generic/moving-head-multimode.lumox.json` for 3-mode mover
(8 / 13 / 18 ch with 16-bit pan/tilt in extended modes).

## 5. Add capabilities for non-linear channels

Strobe, gobo, color wheels, macro channels — wrap each value range in a
`Capability`. The patch UI can then show "Strobe Fast" instead of
"channel value 142".

```json
{
  "name": "Color Wheel", "typeId": "color-wheel", "defaultValue": 0,
  "capabilities": [
    { "kind": "color", "min": 0,  "max": 9,  "label": "Open",  "color": "#ffffff" },
    { "kind": "color", "min": 10, "max": 20, "label": "Red",   "color": "#ff0000" },
    { "kind": "color", "min": 21, "max": 31, "label": "Green", "color": "#00ff00" },
    { "kind": "color", "min": 32, "max": 42, "label": "Blue",  "color": "#0000ff" }
  ]
}
```

## 6. Validate

Drop the file in place and run:

```bash
node examples/18-builtin-library.js
```

Check that the loaded count includes yours and `errors: 0`.

## 7. Iterate — bump `meta.modifiedAt`

Either edit the timestamp by hand, or call programmatically:

```js
def.touch();    // sets def.meta.modifiedAt = new Date().toISOString()
```

---

# Multiple definitions per file

`definitions[]` accepts more than one — useful when several variants share
metadata (same vendor, same family, different colour:

```json
{
  "version": 1,
  "definitions": [
    { "id": "Acme/PAR 7 RGB",  "model": "PAR 7 RGB",  "manufacturer": "Acme", "type": "PAR", "modes": [/* ... */] },
    { "id": "Acme/PAR 7 RGBW", "model": "PAR 7 RGBW", "manufacturer": "Acme", "type": "PAR", "modes": [/* ... */] }
  ]
}
```

Both load when the file is read.

---

# Programmatic creation

Skip the JSON when prototyping — build in code, then serialize:

```js
import {
  FixtureDefinition, FixtureMode, ChannelDefinition,
  Capability, ColorCapability, ShutterCapability,
  LumoxImporter,
} from '../src/index.js';

const def = new FixtureDefinition({
  manufacturer: 'Acme', model: 'PAR 7', type: 'PAR',
  meta: { author: 'Max', source: 'Manual v2' },
  physical: {
    dimensions: { width: 180, height: 180, depth: 90, unit: 'mm' },
    weight: { value: 1.2, unit: 'kg' },
    power: { consumption: 25, unit: 'W' },
  },
  modes: [
    new FixtureMode({ id: '3ch', name: '3ch', channels: [
      new ChannelDefinition({ name: 'Red',   typeId: 'red'   }),
      new ChannelDefinition({ name: 'Green', typeId: 'green' }),
      new ChannelDefinition({ name: 'Blue',  typeId: 'blue'  }),
    ]}),
    new FixtureMode({ id: '7ch', name: '7ch', channels: [
      new ChannelDefinition({ name: 'Master', typeId: 'intensity' }),
      new ChannelDefinition({ name: 'Red',    typeId: 'red'   }),
      new ChannelDefinition({ name: 'Green',  typeId: 'green' }),
      new ChannelDefinition({ name: 'Blue',   typeId: 'blue'  }),
      new ChannelDefinition({ name: 'Strobe', typeId: 'strobe',
        capabilities: [
          new ShutterCapability({ min: 0,   max: 7,   label: 'Off',    mode: 'open'   }),
          new ShutterCapability({ min: 8,   max: 255, label: 'Strobe', mode: 'strobe', rateHz: 20 }),
        ],
      }),
      new ChannelDefinition({ name: 'Color Macro', typeId: 'color-macro',
        capabilities: [
          new Capability({ min: 0, max: 9, label: 'Off' }),
          new ColorCapability({ min: 10, max: 20, label: 'Red',   color: '#ff0000' }),
          new ColorCapability({ min: 21, max: 31, label: 'Green', color: '#00ff00' }),
        ],
      }),
      new ChannelDefinition({ name: 'Speed', typeId: 'speed' }),
    ]}),
  ],
});
def.touch();

// Serialize to a .lumox.json string
const json = new LumoxImporter().serialize([def]);
```

---

# Built-in profiles reference

## Generic (single mode)

| File | Type | Channels |
|------|------|----------|
| `dimmer-1ch.lumox.json` | Dimmer | 1 |
| `par-rgb-4ch.lumox.json` | PAR | 4 (Dimmer + RGB) |
| `par-rgba-5ch.lumox.json` | PAR | 5 (Dimmer + RGBA) |
| `par-rgbw-5ch.lumox.json` | PAR | 5 (Dimmer + RGBW) |
| `par-rgbwa-6ch.lumox.json` | PAR | 6 (Dimmer + RGBWA) |
| `par-rgbwauv-7ch.lumox.json` | PAR | 7 (Dimmer + RGBWA+UV) |
| `strobe-2ch.lumox.json` | Strobe | 2 |
| `led-bar-rgb-12ch.lumox.json` | LED Bar | 12 |
| `led-matrix-rgb-5x5-75ch.lumox.json` | LED Matrix | 75 (5×5 RGB, positioned `emitterLayout` → pixel-map / MATRIX FX) |
| `smoke-1ch.lumox.json` | Smoke | 1 |
| `moving-head-rgbw-11ch.lumox.json` | Moving Head | 11 |
| `moving-head-beam-16ch.lumox.json` | Moving Head | 16 |
| `moving-head-spot-14ch.lumox.json` | Moving Head | 14 |
| `moving-head-cmy-wash-14ch.lumox.json` | Moving Head | 14 |
| `scanner-8ch.lumox.json` | Scanner | 8 |
| `laser-basic-4ch.lumox.json` | Laser | 4 |
| `dimmer-pack-4ch.lumox.json` | Dimmer | 4 |
| `hazer-2ch.lumox.json` | Smoke | 2 |
| `blinder-2ch.lumox.json` | Strobe | 2 |

## Generic (multi-mode)

| File | Type | Modes |
|------|------|-------|
| `par-rgbw-multimode.lumox.json` | PAR | 3ch · 4ch · 5ch · 8ch |
| `moving-head-multimode.lumox.json` | Moving Head | 8ch · 13ch · 18ch |

## Stairville

| File | Model | Modes |
|------|-------|-------|
| `led-bar-240-8-rgb.lumox.json` | LED Bar 240/8 RGB DMX | 3ch · 6ch · 24ch |
| `led-pixel-bar-100-mk2-rgb.lumox.json` | LED Pixel Bar 100/100 MK2 RGB | 3ch · 6ch · 30ch |
| `mh-x25-led-spot.lumox.json` | MH-x25 LED Spot | 9ch · 11ch |
| `wild-wash-648-led-rgb.lumox.json` | Wild Wash 648 LED RGB | 3ch · 7ch |
| `led-bar-120-4-rgb-dmx.lumox.json` | LED Bar 120/4 RGB DMX | 2ch · 3ch · 5ch · 12ch |
| `mh-x30-led-spot.lumox.json` | MH-x30 LED Spot | 9ch · 12ch |
| `mh-x50-led-spot.lumox.json` | MH-x50 LED Spot | 8ch · 14ch |
| `show-bar-tri-18x3w-rgb.lumox.json` | Show Bar Tri 18x3W RGB | 2 · 3 · 5 · 7 · 18 · 27 · 54ch |

## Brand vendors

Common stage / club fixtures from popular brands. Channel maps follow each
manufacturer's typical DMX chart — verify against your unit's firmware before
a show (each profile's `meta.notes` repeats this caveat).

| Vendor | File | Model | Type | Modes |
|--------|------|-------|------|-------|
| Chauvet DJ | `slimpar-pro-h-usb.lumox.json` | SlimPAR Pro H USB | PAR | 6ch · 8ch · 11ch |
| Chauvet DJ | `slimpar-t6-usb.lumox.json` | SlimPAR T6 USB | PAR | 3ch · 8ch |
| Chauvet DJ | `slimpar-56.lumox.json` | SlimPAR 56 | PAR | 3ch · 7ch |
| Chauvet DJ | `intimidator-spot-360.lumox.json` | Intimidator Spot 360 | Moving Head | 9ch · 13ch |
| Chauvet DJ | `intimidator-spot-260.lumox.json` | Intimidator Spot 260 | Moving Head | 8ch · 14ch |
| Chauvet DJ | `colorband-pix.lumox.json` | COLORband PiX | LED Bar | 3 · 4 · 6 · 7 · 9 · 12 · 18 · 36ch |
| American DJ | `mega-tripar-profile-plus.lumox.json` | Mega TriPar Profile Plus | PAR | 4ch · 6ch · 7ch |
| American DJ | `mega-hex-par.lumox.json` | Mega Hex Par | PAR | 6 · 7 · 8 · 11 · 12ch |
| American DJ | `focus-spot-4z.lumox.json` | Focus Spot 4Z | Moving Head | 16ch · 18ch · 22ch |
| American DJ | `inno-pocket-spot.lumox.json` | Inno Pocket Spot | Moving Head | 9ch · 11ch |
| American DJ | `vizi-beam-5rx.lumox.json` | Vizi Beam 5RX | Moving Head | 16ch |
| American DJ | `vizi-beam-rxone.lumox.json` | Vizi Beam RXONE | Moving Head | 15ch · 17ch |
| Martin | `rush-par-2-rgbw-zoom.lumox.json` | RUSH PAR 2 RGBW Zoom | PAR | 7ch · 10ch |
| Martin | `rush-mh-5-profile.lumox.json` | RUSH MH 5 Profile | Moving Head | 16ch |
| Robe | `robin-ledwash-600.lumox.json` | Robin LEDWash 600 | Moving Head | 16ch |
| Eurolite | `led-par-64-rgbw-10mm.lumox.json` | LED PAR-64 RGBW 10mm | PAR | 4ch · 8ch |
| Eurolite | `led-par-64-rgb-spot.lumox.json` | LED PAR-64 RGB Spot | PAR | 5ch |
| Eurolite | `led-par-56-rgb-spot.lumox.json` | LED PAR-56 RGB Spot | PAR | 5ch |
| Eurolite | `led-tmh-9-moving-head.lumox.json` | LED TMH-9 Moving Head | Moving Head | 4ch · 12ch |
| Eurolite | `led-ip-pix-strobe-rgb-cw-ww-mk2.lumox.json` | LED IP PIX Strobe RGB CW+WW MK2 | LED Bar | 6 · 10 · 18 · 24 · 25 · 32ch |
| Cameo | `flat-pro-7.lumox.json` | Flat PRO 7 | PAR | 6ch · 8ch · 12ch |
| Cameo | `auro-spot-200.lumox.json` | Auro Spot 200 | Moving Head | 5ch · 13ch · 22ch |
| Cameo | `hydrabeam-300-rgbw.lumox.json` | Hydrabeam 300 RGBW | Moving Head | 6 · 10 · 16 · 26 · 42ch |
| Cameo | `pixbar-600-pro.lumox.json` | PIXBAR 600 PRO | LED Bar | 2 · 6 · 8 · 12 · 38 · 42 · 74 · 78ch |
| Showtec | `spectral-m800.lumox.json` | Spectral M800 | Moving Head | 14ch |
| Showtec | `phantom-50-led-spot.lumox.json` | Phantom 50 LED Spot | Moving Head | 8ch · 13ch |
| Elation | `sixpar-200.lumox.json` | SixPar 200 | PAR | 6ch · 8ch · 10ch |
| GLP | `impression-x4.lumox.json` | impression X4 | Moving Head | 12ch · 15ch |
| ETC | `colorsource-par.lumox.json` | ColorSource PAR | PAR | 4ch · 5ch · 7ch |
| UKing | `25w-led-moving-head.lumox.json` | 25W LED Moving Head | Moving Head | 9ch · 11ch |
| UKing | `7r-230w-beam.lumox.json` | 7R 230W Beam | Moving Head | 16ch |
| WLED | `wled-controller.lumox.json` | WLED Controller | LED Bar | Single RGB/DRGB · Effect(+W) · Preset · pixel 50/100px RGB(W) (13 modes) |
| NoName | `9x4w-led-bar-36w.lumox.json` | 9x4W LED BAR (36 Watt) | LED Bar | 4ch · 8ch |
| NoName | `derby.lumox.json` | Derby | Other | 7ch |
| NoName | `200w-mini-beam-spot-moving-head.lumox.json` | 200W mini Beam Spot Moving Head | Moving Head | 12ch |
