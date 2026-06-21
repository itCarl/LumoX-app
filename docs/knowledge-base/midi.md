# MIDI Control Surfaces

**Status:** stable — engine layer (`src/midi/`) **plus** the app-layer control
surface (`main/services/MidiService.ts` + `main/handlers/midi.ts` + a MIDI
mapping window).
**Files:** `src/midi/` — `MidiManager.ts`, `MidiInput.ts`, `MidiOutput.ts`,
`EasyMidiBackend.ts`, `MockMidiBackend.ts`, `controllers/MidiController.ts`,
`controllers/ApcMiniMk2.ts`, barrel `index.ts` (re-exported from `src/index.ts`).
App layer — `main/services/midi-backend.ts` (the one shared `MidiManager`),
`main/services/MidiService.ts`, `main/midi/profiles/` (device plugins),
`main/handlers/midi.ts`, `renderer/midi.html` + `renderer/midi-window.ts`,
`renderer/lib/midiassign.ts`.
Reached by `cli/lumox-cli.ts` (`midi` command) and `examples/23-midi-apc-mini.ts`
(engine layer) and the title-bar keyboard button (app layer).

## What

Lets a hardware MIDI control surface drive the engine — move a fader → group
intensity / GrandMaster, press a pad/button → recall a scene, toggle blackout,
etc. — with LED feedback pushed back to the device. One concrete controller
ships: the **AKAI APC Mini MK2**.

Two layers, used independently:

- **Engine layer** (`src/midi/`) — device drivers + backends, exported from the
  public barrel, used by the CLI and example 23. The `ApcMiniMk2` driver keeps its
  own hard-wired defaults (faders→groups, scene buttons→utilities) for headless/CLI.
- **App layer** (`main/` + the MIDI window) — the Electron control surface:
  point-and-click "assign mode" binding **any** MIDI control to **any** Lumox
  function, persisted per project. It does **not** use the `ApcMiniMk2` driver's
  default action handlers (that would double-fire); `MidiService` listens to the raw
  input itself and dispatches user **bindings**. See
  [the App control surface](#app-control-surface-midiservice--mapping-window) below.

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
  the mock backend (`--mock`), with `bindPad` colour demos.
- **Barrel**: `import { MidiManager, ApcMiniMk2, MockMidiBackend } from '../src/index'`.

## App control surface (MidiService + mapping window)

The Electron control surface lets the user bind hardware to Lumox functions with
a fully click-driven flow — no typing. **Guiding rule:** a MIDI message never
knows what a scene is; it resolves to a **Target** and runs the *same* engine
path the UI uses (`recallScene`, `grandMaster.setValue`, `blackout.toggle`, group
intensity), so hardware behaves exactly like clicking.

### Pieces

- **`main/services/midi-backend.ts`** — the app's **single** shared `MidiManager`.
  Both the control surface (`MidiService`) and the MIDI tempo clock
  (`Transport`'s `MidiClockSource`) import it, so there is exactly one MIDI
  backend / one clock across the app. Never construct another `MidiManager`.
- **`main/services/MidiService.ts`** — uses the shared `MidiManager`, selects a
  **device profile** (see below) for an available input port, opens it (+ output
  for LEDs when the device has them), holds the binding list, the assign/learn
  state, and the executor dispatch. Listens to the raw input directly (so it does
  **not** run the engine driver's hard-wired defaults). Falls back silently to
  "disconnected" with no device / no `easymidi`.
- **`main/midi/profiles/`** — the **device plugin layer** (see below).
- **`main/handlers/midi.ts`** — the `lumox:midi:*` IPC area; broadcasts service
  events to every window. Registered in `handlers/index.ts`; its transient
  channels (open/list/assign) are listed in `TRANSIENT_CHANNELS`.
- **MIDI window** — `renderer/midi.html` + `renderer/midi-window.ts`, a separate
  frameless window (mirrors the fixture editor; `openMidiWindow()` in
  `main/windows.ts`, third renderer entry in `build.mjs`). Shows the connected
  device + status, **+ Add mapping**, the bindings table (with per-pad LED colour
  and Solid/Blink/Fade controls, driven by the device's reported capabilities),
  a **live state mirror** on each row (a lit dot in the LED colour for active
  triggers, a value bar for ranges — fed by `midi:feedback`), and a live MIDI
  monitor.
- **`renderer/lib/midiassign.ts`** — main-window assign overlay: while assigning,
  every `[data-midi]` control gets a dotted purple border + 45° striped fill; a
  capture-phase click reads its target descriptor → `pickTarget`. `Esc` cancels.
  Closing the MIDI window also cancels assign mode (`midiService.cancelAssign()` in
  `windows.ts`), so the overlay can never get stuck on.

### Device profiles (plugin layer) — `main/midi/profiles/`

Everything controller-specific is a **`MidiDeviceProfile`** (`profiles/types.ts`),
so adding a controller is "drop a module in `profiles/` + list it in
`profiles/index.ts`" — `MidiService` and the UI never change. Input is already
device-agnostic (backends normalise to note/cc), so a profile describes only
*identity + output*:

```ts
MidiDeviceProfile {
  id; name; portHint;                 // recognise the port (or override matches())
  palette: { name, hex }[];           // selectable LED colours ([] = no LEDs)
  ledModes: ('solid'|'blink'|'fade')[];
  led(note, { colorName, mode, active }): { note, velocity, channel } | null;  // encode one LED
}
```

- `apcMiniMk2.ts` — the AKAI APC Mini MK2: velocity = colour, Note-On **channel**
  = behaviour (6 solid 100% · 9 pulse 1/4 "fade" · 13 blink 1/8 · 2 dim 50%).
- `generic.ts` — matches **any** input (always last in the registry) so an unknown
  controller still works for input bindings; it just has no LED feedback.
- `selectDevice(inputs)` picks the first profile that matches an available port
  (specific before generic), so the APC gets LEDs while anything else still binds.

The device's `palette` + `ledModes` are surfaced to the renderer as
`MidiStatus.capabilities`, so the mapping table renders exactly the colours +
animations the connected device supports (and hides LED controls for LED-less
devices). New device, richer controls — with no UI changes.

### Model

```ts
MidiTarget  { key, label, kind: 'trigger'|'range', min?, max? }   // a Lumox control
MidiTrigger { type: 'note'|'cc', channel, number }                // what hardware sends
MidiBinding { id, trigger, target, options }                      // one table row
//   options: trigger → { mode:'toggle'|'flash' } · range → { invert?, min?, max? }
//            note pads → { ledColor?, ledMode?:'solid'|'blink'|'fade' } (LED feedback)
```

Targets are tagged in the DOM as `data-midi="<key>"` + `data-midi-kind` +
`data-midi-label` (+ `data-midi-min`/`-max` for ranges). A control may carry an
**alternate** target of the other kind via `data-midi-alt*`; `learn()` picks which to
bind from the message type (**CC → `range`, note → `trigger`**), so one control
serves both a fader and a pad. The tagged set:

| Control | Key | Kind |
| --- | --- | --- |
| Scene cell (banks tile) | `scene:<id>` | trigger |
| Group tab (group bar) | `group:<id>:intensity` | range |
| Group tab — alt | `group:<id>:flash` | trigger (flash group to full) |
| Channel strip (fader editor) | `fixture:<id>:<localCh>` | range (live programmer write) |
| GrandMaster (fader editor) | `master` | range |
| Blackout (fader editor) | `blackout` | trigger |
| Tap tempo (title bar) | `bpm-tap` | trigger |

Add more by tagging one element — no other code change.

### Assign flow (cross-window)

```text
MIDI window "+ Add mapping" → lumox:midi:beginAssign
  main: broadcast 'midi:assign-mode {active}' → main window paints the overlay
  user clicks a tagged control → lumox:midi:pickTarget {target}
  main: store pending target, broadcast 'midi:awaiting-input' → MIDI window banner
  user actuates a MIDI control → MidiService captures the next note/cc → binding
  main: broadcast 'midi:bindings' + 'midi:assign-mode {active:false}'
later: APC press/move → MidiService matches a binding → recallScene / grandMaster / …
```

### Executor dispatch + LED feedback

A matched binding runs the *same* engine path the UI uses:

| Target | Dispatch |
| --- | --- |
| `scene:` (trigger) | `recallScene` — toggle = flip `isLive`; flash = on press / off on release |
| `blackout` (trigger) | toggle or flash `engine.blackout` |
| `bpm-tap` (trigger) | averages recent tap gaps → `transport.setBpm` (only while the tempo source is `manual`; mirrors the title-bar TAP) |
| `master` (range) | `grandMaster.setValue` (CC 0..127 → min..max, with `invert`) |
| `group:<id>:intensity` (range) | `Group.setIntensity` + `apply` + `markLiveUniverse` |
| `group:<id>:flash` (trigger) | engages every member's intensity to full (flash = while held; toggle = latch) and **releases** it on the way out, back to whatever scene/base drives it |
| `fixture:<id>:<localCh>` (range) | engages that fixture-local channel in the live programmer (`universe.engage`), the same path the fader editor's LIVE strips use |

**Feedback (device LEDs + software mirror).** A single source of truth —
`MidiService.bindingActive(b)` (scene live / blackout on / group-flash latched) for
triggers, `feedbackValue` (last driven 0..1) for ranges — drives **both** the
hardware and the UI:

- **Device LEDs** (per-assignment, richer for RGB pads): each note binding has an
  `ledColor` + `ledMode` (Solid / Blink / Fade), encoded by the device profile — on
  the APC MK2, an **active** target shows the colour with that animation, an **idle**
  one shows it dimmed (so you can see the pad is assigned). `MidiService` diffs LED
  state and pushes only changes on a low-rate poll. Offered colours + modes come from
  the device's `capabilities`, so it adapts per controller.
- **Software mirror** — every poll/dispatch emits `feedback` (`MidiFeedback[]`),
  broadcast as `midi:feedback`; the MIDI window paints each mapping row's live state
  (lit dot / value bar). This runs even with no LED-capable device (works for
  input-only controllers).

### Persistence

Bindings ride in the project file (`ProjectData.midiBindings`,
`buildProject`/`restoreProject`); on load, bindings whose target id no longer
resolves (deleted scene/group) are dropped. They are also part of the undo/redo
whole-show snapshot. The device port itself is machine-specific and not stored.

## Notes / Gotchas

- `easymidi` is an **optional** dependency — never assume it's present; the manager
  falls back to the mock backend (`npm install easymidi` to enable real ports).
- LED output is optional: connecting input-only just disables feedback.
- The engine-layer `ApcMiniMk2` group→fader/slot defaults map by **sorted group
  id** (CLI/headless only). The app layer ignores those defaults entirely — it
  fires explicit per-binding targets.
- App-layer bindings persist in the project (`midiBindings`); engine-layer driver
  bindings (pads bound in code/CLI) remain runtime-only.
- There is **one** shared `MidiManager` (`main/services/midi-backend.ts`) for the
  whole app — the control surface and the MIDI tempo clock both use it, so there's
  a single backend and a single MIDI clock. Add new controllers via a device
  profile (`main/midi/profiles/`), never a second manager.
- To add a controller: write a `MidiDeviceProfile` in `main/midi/profiles/` and
  list it in `profiles/index.ts` before the generic fallback — no other changes.
- See also: engine actions these controllers call live in
  [mix-engine.md](mix-engine.md) (`scenes`, `grandMaster`, `blackout`, groups).
