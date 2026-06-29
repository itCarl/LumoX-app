# Plan — MIDI Control Surface

**Status:** ✅ **shipped in full** — phases 1–4 are done; the source of truth is
[docs/knowledge-base/midi.md](../knowledge-base/midi.md). Phase 4 landed the typed
**Action registry** (`main/services/midiActions.ts`) shared by dispatch + the
mapping UI, **relative (encoder) range mode**, and two new actions (`tempo.bpm`,
`programmer.clear`). This plan is kept for design rationale only. Scope was
app-level MIDI device management + mapping on top of the existing engine MIDI stack.
**Multi-device support stayed out of scope** — one connected controller at a time.

**Design deltas from the original spec** (what shipped vs. what was sketched below):

- **Binding shape** = `{ id, trigger, action: { key, params }, options }` (no
  cached label — the registry's `describe()` computes it live for the UI).
- **`relative` is a per-binding option**, not a third action `kind`. Whether a
  control is an endless encoder is a property of the *mapping*, not the action, so
  `master.level` etc. stay `kind: 'range'` and any range binding can opt into
  relative decoding. Action `kind` is `'trigger' | 'range'`.
- **Bank transport** (`bank.play/next/…`) and **`bank.scene`** were **not** built —
  linear bank/cue advance belongs to the future cue-list feature, not this slice.
  `scene.recall` already maps any scene directly. Scene **flash** is the binding's
  `mode: 'flash'`, not a separate `scene.flash` action.
- The registry is shared with the UI via the computed **binding views** (label +
  kind), not a separate "list all actions" IPC — Lumox binds by clicking the actual
  control (click-to-assign), so no action-picker dropdown is needed.

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
  belong to the show). On load, bindings whose action no longer resolves are dropped
  (`actionResolves`). The connected device/port is machine-specific and auto-detected,
  not stored.

## Build phases

1–3. ✅ **Shipped** — app MIDI manager + IPC + mapping window + monitor +
   click-to-assign; bindings + executor dispatch + expanded target set; FeedbackEngine
   (pad-LED + renderer mirror). See [midi.md](../knowledge-base/midi.md).
   *(Encoder LED rings / motor faders are out of scope.)*
4. ✅ **Shipped** — typed **Action registry** (`midiActions.ts`) shared by dispatch
   and the mapping UI (binding labels/kinds are computed from it), **relative
   (encoder) range mode** per binding, and the `tempo.bpm` + `programmer.clear`
   actions. See [midi.md](../knowledge-base/midi.md). *(Bank/cue transport deferred
   to the future cue-list feature — see the design deltas at the top.)*

## Notes / decisions

- Route everything through the existing app actions — never re-implement recall/level
  logic in MIDI code (consistency + one place to fix bugs).
- Split persistence machine-specific (ports) vs show-specific (bindings).
- Keep `MidiManager` / `MidiInput` / `MidiOutput` untouched; all new work is the
  app-layer Action/Binding/Router/Feedback + IPC + view.
- Naming in code/docs/UI stays generic — describe capabilities, never name other
  lighting-control software (see `docs/knowledge-base/conventions.md`).
