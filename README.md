# Lumox App

DMX controller — Art-Net + sACN E1.31 outputs, modular mix pipeline,
fixture system with profile library, group-aware effects.

Three ways to drive the engine: programmatic API (Node/Electron), interactive CLI, or planned Electron UI.

## Quick start

```bash
npm install

npm run cli           # interactive REPL
npm run headless      # scripted smoke test (Art-Net + sACN)
npm run validate      # run validator over fixtures/
npm start             # Electron placeholder UI
```

## Layout

```
lumox-app/
├── package.json
├── cli/
│   └── lumox-cli.js          Interactive REPL — `npm run cli`
├── main/index.js             Electron main process (placeholder)
├── preload.cjs               IPC bridge → window.lumox
├── renderer/                 UI placeholder
├── fixtures/                 Built-in fixture library data (see fixtures/README.md)
│   ├── schema/               JSON Schema for .lumox.json
│   ├── Generic/              Vendor-agnostic profiles
│   └── Stairville/           Vendor folder
├── examples/                 22 numbered demo scripts (see examples/README.md)
└── src/
    ├── index.js              Public API + built-in registrations
    ├── headless.js           Smoke test
    ├── core/                 Engine, Universe, UniverseManager
    ├── outputs/              Output base + ArtNet + sACN + OutputManager
    ├── protocols/            Art-Net + sACN packet codecs
    ├── mix/                  MixPipeline + modules (BaseLayer, Scenes, Effects,
    │                         GroupEffects, GrandMaster, Blackout)
    ├── fixtures/             ChannelType registry, Capability registry,
    │                         FixtureDefinition / Mode / Library / Validator,
    │                         Importer registry (Lumox JSON)
    ├── midi/                 MIDI input/output abstraction, EasyMidi + Mock
    │                         backends, controllers (APC Mini MK2 default)
    ├── show/                 Patch, Group, GroupManager, Scene, Show
    └── util/logger.js
```

## CLI

```bash
npm run cli
```

```
Library: 16 profiles loaded
Engine started @ 44 Hz. Type `help` for commands.
lumox> output add artnet 192.168.1.50 false
lumox> lib list par
lumox> patch add "Generic/PAR RGBW 5ch" 0 1 par1
lumox> fx par1 intensity 255
lumox> fx par1 rgbw 255 0 100 0
lumox> group create stage
lumox> group add stage par1
lumox> effect rainbow stage 4000
lumox> gm 0.5
lumox> blackout on
```

Type `help` inside the REPL for the full command list. `quit` or Ctrl+C
twice to exit.

## MIDI control — headless operation

Plug in an AKAI APC Mini MK2 → run `npm run cli` → `midi connect apc`.
Faders + scene buttons + pads now drive the engine; the app needs no
GUI to operate.

```bash
npm install easymidi        # one-time, for hardware
npm run cli
lumox> midi list
lumox> midi connect apc
```

Default bindings (override by subclassing `ApcMiniMk2` or calling
`apc.bindPad(...)`):

| Control | Action |
|---------|--------|
| Master fader (CC 56) | GrandMaster |
| Channel faders CC 48-55 | Groups 1-8 intensity (sorted by group id) |
| Scene 112 (top right) | Blackout toggle |
| Scene 113 | All groups full |
| Scene 114 | All groups half |
| Scene 115 | All groups off |
| Scene 116 | Reset GM = 1.0 |
| Track 100-107 | Flash group N to 100% while held |
| Pads 0-63 | User-bindable via `apc.bindPad(note, {press, release, color})` |

LED feedback uses the MK2's RGB palette (`ApcMiniMk2.COLOR.{off,white,red,green,blue,...}`).
Pads pulse while held; scene buttons lit by utility colors; track buttons green if a group is bound.

See `examples/23-midi-apc-mini.js` — runs with `--mock` if no hardware
attached.

## Programmatic — minimal PAR control

```js
import {
  Engine, ArtNetOutput, FixtureLibrary, Patch, Fixture,
} from './src/index.js';

const library = new FixtureLibrary();
await library.loadFromDirectory('./fixtures');

const engine = new Engine();
engine.universes.ensure(0);

const patch = new Patch();
const par = patch.add(new Fixture({
  id: 'par1',
  definition: library.get('Generic/PAR RGBW 5ch'),
  universeId: 0,
  startAddress: 1,
}));

engine.outputs.add(new ArtNetOutput({
  host: '192.168.1.50', broadcast: false,
}));
await engine.outputs.openAll();
engine.start();

par.setRGBW(255, 0, 100, 0);
patch.applyAll(engine.universes);
```

See `examples/22-control-par.js` for the full end-to-end script.

## Extending

### New output type
```js
class OscOutput extends Output {
  static TYPE = 'osc';
  async _openImpl()  { /* ... */ }
  async _closeImpl() { /* ... */ }
  _sendImpl(universe, data) { /* ... */ }
}
OutputManager.registerType(OscOutput);
```

### New mix module
```js
class GammaCurve extends MixModule {
  process(universe, ctx) { /* mutate universe.data */ }
}
engine.mix.add(new GammaCurve());
```

### New ChannelType / Capability / FixtureImporter
See `examples/15-`, `16-`, and `fixtures/README.md`.

## Status

Backend complete: engine, universes, outputs, mix pipeline, fixture
system, groups, effects, importers, validator, CLI. **Electron UI not
built yet** — the app currently runs via CLI or programmatic API.
