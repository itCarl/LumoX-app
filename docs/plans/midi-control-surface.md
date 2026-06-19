# Plan — MIDI Control Surface

**Status:** proposed (not started)
**Scope:** app-level MIDI device management + mapping, on top of the existing engine MIDI stack.
**Owner:** —

> This is a forward-looking design/plan, not a description of shipped behaviour.
> The knowledge base (`docs/knowledge-base/`) remains the source of truth for what
> exists; fold the relevant parts into it as each phase ships.

## Goal

Let a user plug in a MIDI controller, add it in the app, and bind its
buttons/faders/encoders to Lumox actions (recall scenes, run banks, group levels,
master, blackout, tap tempo, …) with LED/motor feedback — configured via a
**MIDI-learn** flow, persisted with the project.

## Guiding principle

**A MIDI message never knows what a scene is.** It fires an **Action**, and Actions
are the *same* operations the UI invokes (through `recallScene`, `banks.*`,
`master.set`, `blackout.set`, group select/level, …). So hardware behaves exactly
like clicking — correct fades, one-active-per-bank, programmer rules — and feedback
reflects true state. This decouples *what a control does* from *what hardware
triggers it*, the way pro consoles separate an input profile from the patch.

## Current state (what already exists)

Engine-side MIDI is in good shape and is **reused as-is**:

- `src/midi/MidiManager.ts` — backend select (easymidi → mock), `listInputs()/listOutputs()`, `openInput()/openOutput()`, `attach()/detach()` controllers.
- `src/midi/MidiInput.ts` / `MidiOutput.ts` — port abstractions (input emits `noteon`/`noteoff`/`cc`/…; output sends note/cc for LEDs).
- `src/midi/controllers/MidiController.ts` — base driver (connect/disconnect, handler binding, LED hooks).
- `src/midi/controllers/ApcMiniMk2.ts` — a full driver (8×8 grid, faders, scene/track buttons, LED palette + feedback).
- `examples/23-midi-apc-mini.ts` — the only current consumer.

**Gaps (what this plan adds):** no Electron integration at all — no IPC, no UI, no
persistence, no generic (non-driver) mapping, no MIDI-learn. Also the APC driver
pokes the engine directly (`engine.scenes.setOpacity`, group intensity) and so
**bypasses** app semantics (`recallScene` fades / one-per-bank). The Action layer
below fixes that seam; the APC becomes an Action-emitting profile.

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
- **MidiDevice** — `{ id, name, inputPort, outputPort?, profileId?, enabled }`.
  "Add device" = pick an input port from `MidiManager.listInputs()` (+ optional
  output port for feedback).
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

- **InputRouter** — receives messages from each enabled device, matches bindings,
  runs the Action. `range` maps CC/velocity 0..127 → param (with min/max/invert);
  `relative` accumulates encoder deltas.
- **FeedbackEngine** — subscribes to app state (scene active, bank playing,
  blackout, group selected) and pushes LED / motor-fader updates back through the
  device's profile feedback map.

## Key UX — MIDI Learn

A global **Learn** mode (app menu / toolbar toggle). Bindable UI controls (scene
cells, bank transport, group tabs, master, blackout) become "armed": click one →
move a MIDI control → the router captures the next message and writes the Binding.
Plus a reverse flow in the mapping table (pick a row → Learn → wiggle control).

## UI surface — full-page "MIDI" view

Reuse the `fullViews` mechanism in `renderer/index.ts` (its comment already
anticipates `// debug / devices`).

```
┌ Devices ──────────┬ Mapping: <selected device> ─────────────┐
│ ● <controller>     │ Trig   Ch Type Num  Action       Target │
│   in: …  out: …    │ ───────────────────────────────────────│
│ ○ <controller>     │ Note   0  note 0    scene.recall  Red…  ⟳│  ⟳ = Learn
│ + Add device       │ CC     0  cc   48   group.level   Wash  ⟳│
│ [profile ▾]        │ + Add binding                            │
├────────────────────┴──────────────────────────────────────────┤
│ MIDI monitor:  noteon ch0 n36 v127   cc ch0 48 → 64  …          │  (live — great for debugging)
└─────────────────────────────────────────────────────────────────┘
```

## Persistence

- **Device port + profile** → app settings (machine-specific: ports differ per
  computer). A port missing on launch shows "disconnected" but keeps its bindings
  and rebinds when it reappears.
- **Bindings** → the project file (they reference scene/bank/group ids that belong
  to the show). On load, bindings whose target id vanished get the same
  missing-target report treatment as missing fixtures.

## Build phases (each shippable)

1. **App MIDI manager + IPC + Devices view + monitor.**
   - `main/services/MidiService.ts` (wraps `MidiManager`; owns devices + open ports).
   - IPC area `main/handlers/midi.ts` — `lumox:midi:listPorts`, `:addDevice`,
     `:removeDevice`, `:setEnabled`, `:setProfile`, plus a `midi:message` event
     stream for the monitor. Preload + `renderer/lumox.d.ts`.
   - `renderer/views/midi.ts` registered as a full view; list/add/remove ports,
     enable toggle, live MIDI monitor. No mapping yet — but hardware is visible.
2. **Action registry + generic bindings + InputRouter + mapping table + MIDI Learn.**
   - `main/midi/actions.ts` (registry + executors routing to existing handlers).
   - `main/midi/InputRouter.ts`. IPC for binding CRUD + learn arm/cancel.
   - Mapping table UI + Learn mode overlay.
3. **FeedbackEngine + profiles.**
   - Refactor `ApcMiniMk2` to emit Actions + expose a feedback map; data-profile JSON loader.
4. **Persistence + missing-target report.**
   - Settings (ports/profile) + project (bindings); restore + report.

## Notes / decisions

- Route everything through the existing app actions — never re-implement recall/level
  logic in MIDI code (consistency + one place to fix bugs).
- Split persistence machine-specific (ports) vs show-specific (bindings).
- Keep `MidiManager` / `MidiInput` / `MidiOutput` untouched; all new work is the
  app-layer Action/Binding/Router/Feedback + IPC + view.
- Naming in code/docs/UI stays generic — describe capabilities, never name other
  lighting-control software (see `docs/knowledge-base/conventions.md`).
