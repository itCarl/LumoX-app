# Plan — MIDI mapping (APC Mini MK2): click-to-assign window

**Status:** ✅ shipped — folded into [docs/knowledge-base/midi.md](../knowledge-base/midi.md)
(the source of truth). `MidiService` + `main/handlers/midi.ts` + the separate MIDI
window + the click-to-assign overlay + binding persistence all landed. Two
deviations from this plan: (1) the learn flow lives in `MidiService` listening to
the raw input rather than via an `armLearn` hook on `ApcMiniMk2` — the engine
driver stays untouched so the CLI/examples keep working; (2) the
GrandMaster/Blackout widgets were already in the fader editor, so no duplicate
title-bar widgets were added. v1 tagged target set: scenes, group intensity,
master, blackout (channel / bpm-tap deferred).
**Scope:** a separate **MIDI window** with point-and-click "assign mode" that can
bind **any** MIDI control (button / fader / knob) to **any** Lumox function
(scene, group level, master, blackout, transport, …). Device side = **APC Mini
MK2 only** (the one driver we ship); target side is generic.
**Related:** [midi-control-surface.md](./midi-control-surface.md) (the broader
Action-registry vision — this is its first concrete slice).

> Forward-looking design, not shipped behaviour. The knowledge base
> (`docs/knowledge-base/`) stays the source of truth for what exists.

## Context

The engine MIDI stack (`src/midi/`) is solid (`ApcMiniMk2` driver, backends, LED
feedback) but **nothing in `main/` touches MIDI** — no service, IPC, UI, or
persistence. We want the easiest possible mapping experience, **fully
click-driven ("just clicky")**:

1. Click the **keyboard icon in the title bar** → a **separate MIDI window**
   opens (mirrors the existing fixture-editor window).
2. In that window, click **"+ Add mapping"** → the main window dims and every
   bindable control gets a **purple overlay**.
3. Click the Lumox control you want (a scene, a fader, a knob, blackout…).
4. **Actuate the control on your MIDI device** (press a pad, move a fader).
5. The binding is captured and shown as a row in the **mappings table**. Done.

Every binding behaves **exactly like operating the control by hand** — buttons
route through the same app actions (e.g. `recallScene`, `main/context.ts:367`),
faders/knobs through the same setters. No engine-bypassing shortcuts.

## Model

**Target** — what a Lumox control *is* (lives in the DOM as data-attributes):

```ts
interface MidiTarget {
  key: string;                  // stable, persistable: "scene:<id>", "group:<id>:intensity",
                                //   "master", "blackout", "bpm-tap", "bank:<id>:next",
                                //   "channel:<idx>:<groupId|all>"
  label: string;                // human label for the table ("Scene: Red Wash")
  kind: 'trigger' | 'range';    // button-like vs continuous
  range?: { min: number; max: number };  // for 'range' targets (e.g. 0..255, 0..1)
}
```

**Trigger** — what the hardware sends: `{ type: 'note' | 'cc', channel, number }`.

**Binding** — one table row, persisted in the project:

```ts
interface MidiBinding {
  id: string;
  trigger: { type: 'note' | 'cc'; channel: number; number: number };
  target: MidiTarget;
  options:                       // trigger targets:
    | { mode: 'toggle' | 'flash' }
    // range targets:
    | { invert?: boolean; min?: number; max?: number };
}
```

## Architecture / cross-window flow

Two windows + the service in main. Main brokers everything:

```text
MIDI window: "+ Add mapping" ──► lumox:midi:beginAssign
  main: assignMode=on ─ broadcast 'midi:assign-mode {active:true}' ─► MAIN window
  MAIN window: body.midi-assign, purple overlay on every [data-midi], clicks intercepted
  user clicks a control ──► lumox:midi:pickTarget {target}
  main: store pending target ─ broadcast 'midi:awaiting-input' ─► MIDI window ("press a control…")
  user actuates MIDI control ──► MidiService captures next note/cc
  main: create binding ─ broadcast 'midi:bindings' (table) + 'midi:assign-mode {active:false}'
later: APC press/move ──► MidiService → executor dispatch → recallScene / grandMaster / … 
```

## Implementation

### 1. Separate MIDI window (mirror the fixture-editor window)

- **`main/windows.ts`** — add `openMidiWindow()` cloned from `openEditorWindow()`
  (`main/windows.ts:61`): top-level frameless `BrowserWindow`, same hardening,
  loads `renderer/midi.html`.
- **`main/handlers/window.ts`** — add `lumox:window:openMidi` (next to the
  existing editor-open channel).
- **`renderer/midi.html`** + **`renderer/midi-window.ts`** — new window bundle;
  add `renderer/midi-window.ts` to the renderer `entryPoints` in
  [`build.mjs`](../../build.mjs) (line 104, alongside `fixtureeditor-window.ts`).
- Both windows share the existing `preload.cjs`, so `lumox.midi.*` is available
  in both.

### 2. Engine learn hook (`src/midi/`)

- **`MidiController.ts`** — add `armLearn(cb)`, `cancelLearn()`, `_learn` field.
- **`ApcMiniMk2.ts`** — when `this._learn` is set, **short-circuit all message
  handling** (`_onNoteOn`/`_onNoteOff`/`_onCC`, lines 129/158/182): normalize the
  message to a `trigger` (`{type:'note'|'cc', channel, number}`) and pass it to
  `this._learn(trigger)` instead of firing the bound action. This lets the user
  learn **any** pad, side/track button, **or** fader/knob — not just pads.

### 3. Service (`main/services/MidiService.ts`, new)

Owns the `MidiManager` + connected `ApcMiniMk2`, the binding list, assign state,
and the **executor dispatch**.

- **Connect/reconnect** via `ApcMiniMk2.DEFAULT_PORT_HINT`; emit `status`
  (`connected`, `portName`); falls back to mock silently (existing behaviour).
- **Assign:** `beginAssign()`, `pickTarget(target)` (store pending), then
  `armLearn(trigger => createBinding(trigger, pendingTarget))`; `cancelAssign()`.
- **Executor dispatch** — keyed by `target.key` prefix, each routing to the
  *same* path the UI uses (range targets map CC `0..127` → `target.range`,
  honouring `invert` and clamping to `min/max`):

| key prefix | trigger action | range action |
| --- | --- | --- |
| `scene:` | `recallScene(id, on)` (toggle) / momentary (flash) | — |
| `blackout` | `engine.blackout.toggle()` | — |
| `master` | — | `engine.grandMaster.setValue(0..1)` |
| `group:<id>:intensity` | — | group intensity setter (existing groups path) |
| `channel:<idx>:<g>` | — | `fixtures:setChannel` equivalent (0..255) |
| `bpm-tap` | transport tap | — |
| `bank:<id>:next/prev/go` | bank transport (CueRunner) | — |

- **LED feedback:** `refreshLeds()` lights note-bound *scene* pads by live state
  (`engine.scenes.isLive`); call from `updateActiveUniverses()` (`context.ts:426`).
- **Persistence helpers:** `listBindings()`, `loadBindings(arr)` (drop bindings
  whose `target.key` no longer resolves — e.g. deleted scene/group).

Instantiate once at startup beside the engine context.

### 4. IPC area (`main/handlers/midi.ts`, new) + register in `index.ts`

| Channel | Action |
| --- | --- |
| `lumox:midi:status` | `{ connected, portName }` |
| `lumox:midi:listBindings` | `MidiBinding[]` |
| `lumox:midi:beginAssign` | start assign mode |
| `lumox:midi:pickTarget` | `{ target }` — chosen Lumox control |
| `lumox:midi:cancelAssign` | abort |
| `lumox:midi:setBindingOptions` | `{ id, options }` (toggle/flash, invert/min/max) |
| `lumox:midi:removeBinding` | `{ id }` |

Broadcasts (route to the right window like `settings:changed`):
`midi:assign-mode` (`{active}` → main window), `midi:awaiting-input` (→ MIDI
window), `midi:bindings`, `midi:status`, `midi:message` (monitor).

### 5. Preload + types

- **`preload.ts`** — `midi` namespace: the invokes above +
  `onStatus`/`onBindings`/`onAssignMode`/`onAwaitingInput`/`onMessage`.
- **`renderer/lumox.d.ts`** — type the `midi` API + `MidiTarget`/`MidiBinding`.

### 6. Main-window: make controls assignable (the purple overlay)

- **`renderer/lib/midiassign.ts`** (new) — subscribe to `onAssignMode`; on
  active, add `body.midi-assign`, and for every `[data-midi]` element paint a
  purple overlay (a positioned `::after` wash + outline) and a capture-phase
  click handler that reads the element's target descriptor and calls
  `lumox.midi.pickTarget(target)` (swallowing the normal click). `Esc` or a
  banner button → `cancelAssign`.
- **Tag a curated v1 set** of controls with `data-midi` / `data-midi-kind` /
  `data-midi-label` (+ `data-midi-min`/`-max` for ranges). Representative files
  (the inventory is large; tagging is one attribute per control, extensible):
  - **Scenes** — `renderer/views/banks.ts` scene cells → `scene:<id>` (trigger).
  - **Groups** — `renderer/views/groupbar.ts` tabs → `group:<id>:intensity`
    (range) and/or select.
  - **Channel faders / knobs** — `renderer/views/fadereditor.ts`
    (`.fc-fader`, knobs) → `channel:<idx>:<group|all>` (range).
  - **Tempo** — `#bpm-tap` (`renderer/index.html:30`) → `bpm-tap` (trigger).
  - **Bank transport** — `renderer/views/banks.ts` bank tabs/capture (trigger).
- **Add the two missing globals as real title-bar widgets** (they have APIs but
  no UI today — `lumox.master.set` / `lumox.blackout.set`): a small **GrandMaster
  fader** and a **Blackout** toggle next to the new MIDI button, each tagged
  `master` (range) / `blackout` (trigger). Fills a genuine gap and makes them
  clickable assign targets.

### 7. Title-bar entry point

- **`renderer/index.html`** — between `#bpm-clock` (line 31) and `.tb-winctl`
  (line 33): the MIDI button + the new master/blackout widgets:
  `<button id="midi-btn" class="tb-midi" title="MIDI mapping"><i class="fa-solid fa-keyboard"></i></button>`
- **`renderer/index.ts`** (near window-control wiring, ~line 161) — `#midi-btn`
  → `lumox.window.openMidi()`; reflect `onStatus` (dim/tooltip when no device).
  Init `midiassign.ts`. Wire the master fader / blackout button to their APIs.

### 8. MIDI window UI (`renderer/midi-window.ts` + `renderer/midi.html`)

Built with the renderer DOM/widgets libs (`renderer/lib/dom.ts`, `widgets.ts`):

- **Header:** connection status (`● APC mini mk2 — connected` / disconnected).
- **`+ Add mapping`** button → `beginAssign`; while awaiting, show a banner
  ("Click a control in the main window, then move your MIDI control · Esc to
  cancel"), updated by `onAwaitingInput`.
- **Mappings table** — columns: *Trigger* (Note/CC), *Ch*, *#*, *Target* (label
  with a colour dot for scenes), *Mode* (Toggle/Flash for triggers; Invert and
  min/max for ranges), *Remove*. All edits via clicks/segments — no typing.
  Refresh on `onBindings`.
- **Live MIDI monitor** (one line, `onMessage`) — great for verifying hardware.

### 9. Persistence

- **`main/dto.ts`** `ProjectData` — add `midiBindings?: MidiBinding[]`.
- **`main/services/ProjectService.ts`** — `buildProject()` writes
  `midiService.listBindings()`; `restoreProject()` calls
  `midiService.loadBindings(...)` (drops unresolved targets).

### 10. CSS + knowledge base

- **`renderer/styles/main.css`** — `.tb-midi`, the purple overlay
  (`body.midi-assign [data-midi]` outline + wash, hover emphasis), the assign
  banner, the mappings table, MIDI-window chrome.
- **KB:** update `docs/knowledge-base/midi.md` (remove "no IPC/UI yet"; document
  the window, assign flow, executor dispatch, persistence); add
  `main/handlers/midi.ts` + the MIDI window to `docs/knowledge-base/app.md`; keep
  all wording generic (no competitor names — `conventions.md`).

## Verification

1. **Build/typecheck:** `npm run build` clean (new renderer entry compiles).
2. **Unit (MockMidiBackend):** `beginAssign` → `pickTarget({key:'scene:<id>',
   kind:'trigger'})` → inject `noteon{note:5}` → a binding exists; inject the
   press → `recallScene` fired / scene live; flash release → off. Range path:
   `pickTarget({key:'master',kind:'range',range:{min:0,max:1}})` → inject
   `cc{controller:56,value:127}` → `grandMaster` = 1.0; `value:0` → 0. Round-trip
   `listBindings()`→`loadBindings()`, and confirm a binding to a deleted scene is
   dropped.
3. **Manual (run-app skill):** click the title-bar keyboard icon → MIDI window
   opens; `+ Add mapping` → main window shows purple overlays; click a scene →
   press a pad → row appears, pad lights in the scene colour; press the pad → the
   scene recalls with fade. Add a fader→GrandMaster mapping → move the fader →
   master tracks it; flip Invert. Save project, reload → bindings restored.

## Out of scope (deferred)

Non-APC controllers, OSC/keyboard/DMX-in, motor-fader feedback, tagging *every*
one of the ~130 controls up front (we tag a curated set; the rest is one
attribute each, added on demand). Full generic Action registry → F9 in
[feature-backlog.md](./feature-backlog.md).
