# MIDI Control Surfaces

**Status:** stable (engine layer) — engine + CLI + examples only; **no Electron
IPC / UI yet**
**Files:** `src/midi/` — `MidiManager.ts`, `MidiInput.ts`, `MidiOutput.ts`,
`EasyMidiBackend.ts`, `MockMidiBackend.ts`, `controllers/MidiController.ts`,
`controllers/ApcMiniMk2.ts`, barrel `index.ts` (re-exported from `src/index.ts`).
Reached by `cli/lumox-cli.ts` (`midi` command) and `examples/23-midi-apc-mini.ts`.

## What

Lets a hardware MIDI control surface drive the engine — move a fader → group
intensity / GrandMaster, press a pad/button → recall a scene, toggle blackout,
flash a group, etc. — with LED feedback pushed back to the device. One concrete
controller ships: the **AKAI APC Mini MK2**.

This is an **engine-layer feature**. It is exported from the public barrel and
wired up by the CLI and example 23, but it is **not** yet exposed over Electron
IPC and has no renderer UI — there is no `main/handlers/midi.ts`. Add a MIDI IPC
area (and update [app.md](app.md)) when the Electron app gains a control-surface
panel.

## How

Three layers: a **backend** (real ports vs in-process mock), normalized
**input/output** ports, and a **controller** that maps device messages to engine
actions. The `MidiManager` owns the backend and the set of connected controllers.

### Backends (`MidiManager`, `EasyMidiBackend`, `MockMidiBackend`)

A `MidiBackend` is `{ listInputs(), listOutputs(), openInput(name), openOutput(name) }`.
`MidiManager.ensureBackend()` selects one lazily, in order:

1. a backend passed to the constructor (e.g. `new MockMidiBackend()` in tests),
2. **`easymidi`** if the optional dependency is installed (`EasyMidiBackend.tryLoad()`
   dynamically imports it; returns `null` if absent),
3. otherwise the **`MockMidiBackend`** — in-process, no hardware.

So the engine runs everywhere; MIDI just goes quiet without `easymidi` or a device.
`MidiManager` also offers `findPort('in'|'out', hint)` (case-insensitive substring
match) and `attach`/`detach`/`list` for controllers (emitting `'attached'`/`'detached'`).

- **`EasyMidiBackend`** wraps the `easymidi` npm package: inputs re-emit
  `noteon`/`noteoff`/`cc`/`aftertouch`/`pitchbend`; outputs send `noteon`/`noteoff`/`cc`.
- **`MockMidiBackend`** — `MockMidiInput.inject(type, payload)` fires events as if
  from hardware; `MockMidiOutput.sent[]` records every message. Used by unit tests
  and the headless example (`node examples/23-midi-apc-mini.js --mock`).

### Ports (`MidiInput`, `MidiOutput`)

Abstract `EventEmitter` bases with an `open()`/`close()` lifecycle (`isOpen`,
`'opened'`/`'closed'`), backed by `_openImpl`/`_closeImpl`. Inputs emit the
normalized messages above. `MidiOutput` exposes `noteOn(note, velocity, channel)` /
`noteOff(note, channel)` / `cc(controller, value, channel)`, masking to 7-bit data
and a 4-bit channel and no-oping while closed.

### Controllers (`MidiController` → `ApcMiniMk2`)

`MidiController` is the base for a device mapping. Constructed with
`{ engine, patch?, groups? }`; `connect(input, output?)` opens the ports, calls
`_bindHandlers()` (attach input listeners) + `_initLeds()` (push initial LED state),
and emits `'connected'`. `disconnect()` unbinds, turns all LEDs off, closes ports.
`_on(event, fn)` registers input listeners so they're cleanly removed on disconnect.
Subclasses override `_bindHandlers()`, `_initLeds()`, `_allLedsOff()`.

**`ApcMiniMk2`** maps the APC Mini MK2 (`DEFAULT_PORT_HINT = 'APC mini mk2'`):

| Control | Notes / CC | Default action |
| --- | --- | --- |
| 8×8 RGB pad grid | notes 0–63 (bottom-left = 0) | user-bindable via `bindPad(note, {press, release, color})` / `bindScenesRow(row, sceneIds)`; LED off until bound |
| Track row buttons | notes 100–107 | flash bound group (slot 0–7) to 100% while held, restore on release |
| Scene launch column | notes 112–119 | utilities: 112 blackout toggle · 113 all groups full · 114 all half · 115 all off · 116 GM = 1.0 · 117–119 reserved |
| Shift | note 122 | sets `this.shift` modifier flag |
| Channel faders | CC 48–55 | first 8 groups' intensity (groups sorted by `id` for a stable slot mapping) |
| Master fader | CC 56 | `engine.grandMaster.setValue(0..1)` |

LED feedback is sent as Note On to the same notes (`velocity` = palette index from
`ApcMiniMk2.COLOR`); MIDI **channel** selects the pad animation (0 = static, 1–6 =
blink/pulse). Track/scene buttons support on/off only. Extend by subclassing and
overriding `_onScenePress` / `_onTrackPress` (reserved scene slots 5–7 are the hook).

### Reaching it

- **CLI** (`cli/lumox-cli.ts`): `midi list` (ports), `midi connect apc [inHint] [outHint]`
  (auto-detects the port, opens input + optional output for LEDs, attaches an
  `ApcMiniMk2`), `midi disconnect [id]`, `midi controllers`.
- **Example** `examples/23-midi-apc-mini.ts` — full wiring against real hardware or
  the mock backend (`--mock`), including `bindPad` colour demos.
- **Barrel**: `import { MidiManager, ApcMiniMk2, MockMidiBackend } from '../src/index'`.

## Notes / Gotchas

- `easymidi` is an **optional** dependency — never assume it's present; the manager
  falls back to the mock backend (`npm install easymidi` to enable real ports).
- LED output is optional: connecting input-only just disables feedback.
- Group→fader/slot mapping is by **sorted group id**, so renaming/reordering groups
  can shift which fader controls which group — bind explicitly if you need stability.
- No persistence: controller bindings are runtime-only and not stored in the `.lmx`
  project. Adding a MIDI mapping UI means a new IPC area + a persistence model.
- See also: engine actions these controllers call live in
  [mix-engine.md](mix-engine.md) (`scenes`, `grandMaster`, `blackout`, groups).
