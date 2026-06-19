# Audio-reactive input

**Status:** stable
**Files:** `renderer/lib/audio-engine.ts` (shared capture — spectrum + BPM),
`renderer/views/connection.ts` (input picker, live meter, bindings table),
`main/services/AudioBindingService.ts` (bindings + live apply + persistence),
`main/handlers/audio.ts` (`lumox:audio:*` IPC), `renderer/index.ts` (level-frame
forwarding), `main/services/SettingsService.ts` (`audioInput`),
`main/services/ProjectService.ts` (binding persistence).

## What

Live audio drives the rig in real time. One shared Web-Audio capture turns the chosen
input into a set of **continuous levels** — N log-spaced **frequency bands** (40 Hz–5 kHz),
an overall **volume**, and a **beat** flag — and any of those can be **bound** to a Lumox
target: drive it continuously (a band's level → a value) or **trigger** it on a threshold
crossing. Bass kicks pulse the dimmers, hats shimmer a colour, a beat bumps a scene — with
no clock and no programming beyond a binding row.

This is the spectrum sibling of the BPM sources ([tempo.md](tempo.md)): those answer *how
fast* the music is (one number); this answers *what the music is doing right now, per band*.
Both share the same capture.

## How

### Capture + extraction (renderer)

`renderer/lib/audio-engine.ts` exports a single shared `audioEngine`. It owns one
`getUserMedia` stream + `AnalyserNode` (`fftSize 2048`) and is **reference-counted** —
it opens on the first subscriber and tears down with the last, so BPM, the meter and the
binding stream never each open their own mic. The device is the machine-scoped `audioInput`
setting (a `deviceId`, or null = system default); changing it re-opens the capture.

Each ~20 ms tick (`getByteFrequencyData`):

- **Bands** — the spectrum is bounded to **40 Hz–5000 Hz** and split **logarithmically**
  (matching pitch perception): band `b` of `N` spans
  `fMin·exp(ln(fMax/fMin)·b/N) … fMin·exp(ln(fMax/fMin)·(b+1)/N)`, mapped to FFT bins by
  `bin = floor(freq·fftSize/sampleRate)`. Each band is the mean bin magnitude, **normalised
  against a decaying per-band peak** (auto-gain → 0..1 regardless of input gain) and
  attack/decay-smoothed for display. Default **8 bands** (`getBandCount()`).
- **Volume** — overall mean, peak-normalised the same way.
- **Beat** — bass-band (bins 1–6) energy-flux onset detection with a refractory gap (also
  what feeds the `audio` BPM source).

Subscribers: `onSpectrum({ bands, volume, beat })`, `onBpm(bpm)`, `onState('idle' |
'running' | 'denied')`.

### Bindings + apply (main)

`main/services/AudioBindingService.ts` is the engine side, modelled on the MIDI control
surface ([midi.md](midi.md)): a level never knows what a scene is — it resolves to a
**target** and runs the **same engine path the UI uses**, so audio behaves like a fader or
a button. A binding is `{ source, target, options }`:

- **source** — `band` (with index), `volume`, or `beat`.
- **target** (`AudioTarget.key`):
  - **range** (continuous): `master` (grand master), `group:<id>:intensity`, `dmx:<u>:<ch>`
    (raw channel write).
  - **trigger** (discrete): `scene:<id>`, `blackout`.
- **options** — range: `min`/`max` (output bounds, default the target's natural range),
  `invert`, `curve` (`linear`/`exp`/`log`). Trigger: `threshold` (level that fires; ignored
  for a `beat` source) and `mode` (`flash` = hold while over / `toggle` = flip on each
  rising edge).

`applyLevels(frame)` runs every received frame: range bindings map the source level through
`min..max` + curve + invert and write the target; trigger bindings track a rising edge and
dispatch (`recallScene`, `engine.blackout`). Targets that vanish (deleted group/scene) are
dropped on load. Bindings **persist with the project** (`audioBindings`), like
`midiBindings`.

### Streaming control

The capture must run even when the Connection tab is hidden (so bindings keep reacting), but
only when there's something to drive. The service emits **`stream`** (true when it holds ≥1
binding); `renderer/index.ts` listens and, while streaming, subscribes `audioEngine.onSpectrum`
and forwards each frame to main over **`lumox:audio:levels`** (transient). No bindings → no
stream → the capture closes unless the meter or BPM source still needs it.

### UI (Connection tab)

The Connection tab's **Audio** section ([connection.md](connection.md)) hosts both
halves: a capture pane (drag-and-drop device picker + live meter) and a **Reactive
bindings** table. Each binding
row is `source → target` selects (raw DMX reveals universe/channel inputs) plus the
kind-specific options and a remove button; **Add binding** appends a default (Band 1 → grand
master). Edits go straight to main (`lumox:audio:*`); the refreshed list re-renders the table.

## IPC (`main/handlers/audio.ts`)

`levels` (transient — live frame), `targets` (resolvable target catalog), `listBindings`,
`addBinding`, `setBinding` (re-point source/target in place), `setBindingOptions`,
`removeBinding`. Binding CRUD dirties the project (one undo step each); `levels` / `targets`
/ `listBindings` are transient. `audio:bindings` + `audio:stream` are broadcast to windows.

## Notes / Gotchas

- **One capture, many consumers.** A second `getUserMedia` for bands would double mic usage
  and can fail on exclusive-access devices — the shared `audioEngine` is the point.
- **Bands are show content; the device is machine-scoped** — mirrors how the BPM sources
  split the value (project) from the source/device (settings).
- **Flash triggers are momentary** — a `flash` binding on a `beat` source pulses on then off
  the same frame the beat clears; use `toggle` for a latched flip.
- **Latency** is energy-based (~one analyser frame) — great for groove, not sample-accurate.
- Continuous targets **hold their last value** when the stream stops (binding removed / input
  denied); re-touch the fader/master to reset.
