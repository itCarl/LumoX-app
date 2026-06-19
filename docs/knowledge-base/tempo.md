# Tempo & BPM sources

**Status:** stable
**Files:** `main/services/Transport.ts`, `main/services/tempo/MidiClockSource.ts`,
`main/services/tempo/LinkSource.ts`, `main/handlers/transport.ts`,
`renderer/lib/audio-engine.ts` (shared Web-Audio capture — BPM + spectrum),
`renderer/index.ts` (titlebar clock), `renderer/views/settings-modal.ts` (Tempo section),
`renderer/views/connection.ts` (audio-input picker), `src/midi/EasyMidiBackend.ts`
(clock-message forwarding).

## What

The show has one **master tempo** (BPM). Scenes / FX layers whose driving mode is
`bpm` derive their cycle period from it (see [mix-engine.md](mix-engine.md) →
`SceneMixer.effectivePeriod`). The tempo can come from one of four **sources**:

| Source | How the BPM is produced |
| --- | --- |
| `manual` | Typed / scrubbed / tapped in the titlebar clock (default). |
| `midi` | Locked to an external **MIDI clock** (24 pulses-per-quarter-note) from a chosen input port. |
| `audio` | Estimated from **audio onsets** by a renderer Web Audio analyser. |
| `link` | Slaved to an **Ableton Link** session (optional native addon). |

The BPM **value** is persisted with the project (top-level `bpm`); the chosen
**source** + MIDI device are machine-scoped [settings](settings.md)
(`tempoSource`, `midiClockInput`), restored at boot. While a non-`manual` source
is active the transport is **locked**: the titlebar field is read-only and shows a
source chip (MIDI / AUDIO / LINK).

## How

`Transport` (main/services) owns the BPM and the active source. `setBpm` always
applies (project load / reset / a live clock source) and pushes the value into the
engine; the IPC `setBpm` handler guards on `locked` so a stray typed value can't
override an external clock. Source switching tears down the previous driver and
starts the new one:

- **MIDI clock** — `MidiClockSource` opens a MIDI input via the engine MIDI backend
  (`src/midi`, reused), counts `clock` (0xF8) pulses, and computes BPM from the
  average pulse interval over ~one beat (`bpm = 60000 / (perPulse × 24)`). The
  window resets on transport start/stop or after a >1 s gap. `EasyMidiBackend` opts
  the underlying node-midi port back into timing messages (ignored by default).
- **Audio** — the shared `renderer/lib/audio-engine.ts` runs only in the renderer (Web
  Audio has no main equivalent). One capture (`getUserMedia` + `AnalyserNode`) feeds many
  consumers; the BPM consumer samples low-band energy, flags onsets above a rolling
  average (with a refractory gap), folds inter-onset intervals into 70–180 BPM, and
  pushes the most common estimate via `lumox:transport:audioBpm`. Main applies it only
  while `audio` is the source. Input denial reverts the source to `manual`. The capture
  device is the machine-scoped `audioInput` setting, chosen on the Connection tab
  ([connection.md](connection.md)); the same engine also feeds the Connection-tab spectrum
  meter, so one capture serves both.
- **Ableton Link** — `LinkSource` lazily `import()`s the optional `abletonlink`
  native addon (gated like `easymidi`; kept out of the esbuild bundle via the
  `external` list and ambient-declared so the build type-checks without it). It
  tracks the session tempo and broadcasts local manual edits back into Link. Absent
  addon → the Settings option is shown disabled.

IPC (`main/handlers/transport.ts`): `lumox:transport:get` (live `TransportStatus`),
`setBpm`, `setSource` (applies + persists), `audioBpm`, `midiInputs` (device picker).
Every tempo/source change is pushed to all windows as `transport:changed`, which the
titlebar reflects. `setSource` / `audioBpm` / `midiInputs` are marked transient (no
project dirty); `setBpm` still dirties (project `bpm`).

## Notes / Gotchas

- `Transport` keeps its **own** `MidiManager` for the clock input, separate from the
  MIDI control-surface service ([midi.md](midi.md)). Opening the *same* port for both
  clock and control may fail on some platforms (exclusive access) — in practice the
  clock source (a DAW / hardware clock) and the control surface are different devices.
  A future consolidation could share one manager.
- Audio detection is energy-based and approximate — good for locking to a clear beat,
  not a substitute for a real clock. The input device is picked on the Connection tab
  (`audioInput` setting); an empty choice uses the system default.
- The titlebar beat LED is a local visual metronome derived from the BPM; the engine
  has no shared downbeat, so it's not phase-locked to an external clock's bar.
