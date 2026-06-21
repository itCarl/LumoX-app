# Plan — MIDI Control Surface

**Status:** phases 1–3 shipped (APC Mini MK2 click-to-assign window, bindings +
executor dispatch, expanded target set, LED feedback, FeedbackEngine, per-project
persistence) — see [docs/knowledge-base/midi.md](../knowledge-base/midi.md), the
source of truth. **Phase 4 remains** (typed Action registry + relative encoders),
specced below. Scope: app-level MIDI device management + mapping on top of the
existing engine MIDI stack. **Multi-device support is out of scope** — one connected
controller at a time.

## Goal

Let a user plug in a MIDI controller, add it in the app, and bind its
buttons/faders/encoders to Lumox actions (recall scenes, run banks, group levels,
master, blackout, tap tempo, …) with LED feedback — configured via a
**MIDI-learn** flow, persisted with the project.

## Guiding principle

**A MIDI message never knows what a scene is.** It fires an **Action**, and Actions
are the *same* operations the UI invokes (through `recallScene`, `banks.*`,
`master.set`, `blackout.set`, group select/level, …). So hardware behaves exactly
like clicking — correct fades, one-active-per-bank, programmer rules — and feedback
reflects true state. This decouples *what a control does* from *what hardware
triggers it*, the way pro consoles separate an input profile from the patch.

## Current state

The engine MIDI stack (`src/midi/`: `MidiManager.ts`, `MidiInput.ts`,
`MidiOutput.ts`, `controllers/MidiController.ts`, `controllers/ApcMiniMk2.ts`,
`examples/23-midi-apc-mini.ts`) plus the shipped app layer (phases 1–3) are live —
see [midi.md](../knowledge-base/midi.md). What phase 4 adds: a typed Action registry
shared by the mapping UI and dispatch, and relative-encoder accumulation.

## Model (new, app layer)

- **Action registry** — the shared, typed vocabulary. Each action:
  `{ key, label, kind, executor }` where `kind ∈ 'trigger' | 'range' | 'relative'`.
  Executors call existing IPC/engine paths. Initial set:
  - `scene.recall` (trigger, `{sceneId}`), `scene.flash` (momentary), `scene.store`
  - `bank.play | pause | stop | next | prev` (trigger, `{bankId}`), `bank.scene` (`{bankId,index}`)
  - `group.select` (trigger, `{groupId}`), `group.level` (range, `{groupId}`)
  - `master.level` (range), `blackout.toggle` (trigger)
  - `tap.tempo` (trigger), `bpm.set` (range)
  - `programmer.clear` (trigger)
  One source of truth for both the mapping UI and the dispatcher.
- **Device** — a single connected controller, auto-selected from the available
  input ports by its profile (`selectDevice`). No multi-device list — one controller
  at a time, opened for input (+ output for LED feedback when the profile has them).
- **Binding** — a mapping row:
  ```
  { id, deviceId,
    trigger: { type:'note'|'cc'|'pitchbend', channel, number },
    action:  { key:'scene.recall', params:{ sceneId } },
    options: { mode:'toggle'|'momentary', invert, min, max } }
  ```
- **Profile** — optional per-model layer, two flavours:
  - **Code driver** (the APC, refactored to emit Actions + own its LED feedback map) for rich grid surfaces.
  - **Data profile** (JSON: channel → name/type + feedback ranges) for generic gear — friendly names in the mapping UI + optional default bindings.

## Runtime services (new, `main/`)

- **InputRouter** — receives messages from the connected device, matches bindings,
  runs the Action. `range` maps CC/velocity 0..127 → param (with min/max/invert);
  `relative` accumulates encoder deltas.
- **FeedbackEngine** — subscribes to app state (scene active, blackout, group
  flash latched, master/group level, …) and pushes **LED** updates back through the
  device's profile feedback map, AND surfaces that same state to the renderer so the
  software mirror reflects exactly what the device shows. (Pad LEDs only — encoder
  LED rings / motor faders are out of scope.)

## Key UX — MIDI Learn

A global **Learn** mode (app menu / toolbar toggle). Bindable UI controls (scene
cells, bank transport, group tabs, master, blackout) become "armed": click one →
move a MIDI control → the router captures the next message and writes the Binding.
Plus a reverse flow in the mapping table (pick a row → Learn → wiggle control).

## UI surface — full-page "MIDI" view

Reuse the `fullViews` mechanism in `renderer/index.ts` (its comment already
anticipates `// debug / devices`).

```text
┌ Device: <controller> — connected ──────────────────────────────┐
│ Trig   Ch Type Num  Action       Target                       │
│ ───────────────────────────────────────────────────────────── │
│ Note   0  note 0    scene.recall  Red…   [colour][solid] ⟳ ✕  │  ⟳ = Learn
│ CC     0  cc   48   group.level   Wash                  ⟳ ✕  │
│ + Add binding                                                  │
├─ Virtual surface (mirrors the hardware LEDs live) ─────────────┤
│  ▦▦▦▦▦▦▦▦   each pad lit in its current colour/animation       │
│  ▦▦▦▦▦▦▦▦   faders show their live value                       │
├────────────────────────────────────────────────────────────────┤
│ MIDI monitor:  noteon ch0 n36 v127   cc ch0 48 → 64  …          │  (live)
└─────────────────────────────────────────────────────────────────┘
```

## Persistence

- **Bindings** → the project file (they reference scene/group/fixture ids that
  belong to the show). On load, bindings whose target id vanished are dropped
  (`targetResolves`). The connected device/port is machine-specific and auto-detected,
  not stored.

## Build phases

1–3. ✅ **Shipped** — app MIDI manager + IPC + mapping window + monitor +
   click-to-assign; bindings + executor dispatch + expanded target set; FeedbackEngine
   (pad-LED + renderer mirror). See [midi.md](../knowledge-base/midi.md).
   *(Encoder LED rings / motor faders are out of scope.)*
4. 📋 **Action registry + relative encoders.** A typed registry of actions (so the
   mapping UI and dispatch share one vocabulary) and relative-encoder accumulation.

## Notes / decisions

- Route everything through the existing app actions — never re-implement recall/level
  logic in MIDI code (consistency + one place to fix bugs).
- Split persistence machine-specific (ports) vs show-specific (bindings).
- Keep `MidiManager` / `MidiInput` / `MidiOutput` untouched; all new work is the
  app-layer Action/Binding/Router/Feedback + IPC + view.
- Naming in code/docs/UI stays generic — describe capabilities, never name other
  lighting-control software (see `docs/knowledge-base/conventions.md`).
