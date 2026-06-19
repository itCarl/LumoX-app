# Plan — Feature backlog (capabilities to adopt)

**Status:** detailed plan / backlog (not scheduled)

> Capabilities surveyed from a leading commercial DMX controller's manual, scored
> against Lumox today and worked up into implementable specs. Forward-looking — the
> knowledge base (`docs/knowledge-base/`) is the source of truth for shipped
> behaviour. Per `docs/knowledge-base/conventions.md` we never name competitor
> software in repo docs; features are described by capability.

**Status legend:** ✅ have · 🟡 partial / in progress · ⬜ missing
**Effort:** S (≤½ day) · M (1–2 days) · L (3–5 days) · XL (week+)

## How to read a spec

Each feature below has: **Goal**, **Current state** (grounded in real files),
**Data model**, **Engine**, **App / IPC**, **Persistence**, **UI**, **Edge cases &
decisions**, **Phases** (each shippable + build-green), **Acceptance**, and
**Touch-points**. IPC follows the house style `lumox:<area>:<action>` with a handler
module per area in `main/handlers/` and the dirty-flag wrapper in
`main/handlers/index.ts` (read-only/transient channels excluded). Renderer tiles
talk via the `bus` (`renderer/lib/bus.ts`, `EV.*`). DTOs live in `main/dto.ts`,
mappers in `main/serializers.ts`, the typed surface in `renderer/lumox.d.ts`.

## Architecture facts the specs rely on

- **No general app-settings store yet** — only project identity exists
  (`ProjectService`). Machine-specific config (MIDI ports, BPM device, output
  prefs) needs a small `SettingsService` (JSON in `app.getPath('userData')`). Several
  features below depend on it; build it once (see F8/F9).
- **Engine ↔ app split**: the engine (`src/`) is fixture-agnostic. Anything that
  needs the patch (channel addresses, fixture order) is resolved in `main/context.ts`
  (`sceneTrack`, `colorTargets/moveTargets/curveTargets`) and attached to the mixer
  track. New per-fixture/selection data follows the same pattern.
- **FX rack is mid-migration**: the engine has a full **layer rack**
  (`Scene.layers: FxLayer[]`, `toMixerTrack()→track.layers`, composited in
  `SceneMixer`, renderers in `src/mix/sceneFx.ts`) but the app side (target
  resolution in `context.ts`, DTO, IPC, persistence, UI) is **not wired** — the
  older `scene.type` single-FX path is what ships today. F3 finishes the migration.
- **Group = ordered fixture id list** (`Group.fixtureIds`); a group's order can back
  the "fixture index" (F1). Groups are currently constrained to one channel-config
  (`sameConfig` in `context.ts`).

## Dependency / priority order

```text
F1 Ordered selections ─┬─> F3 FX rack (phase/fan)   ─┬─> F4 Palettes
                       ├─> F5 Per-group mixer         └─> F7 Super scenes
F2 Limitations ────────┘
F8 Settings store ─────┬─> F9 Input mapping
                       └─> F10 BPM sources
F6 Cue semantics (independent)        F11 Matrix/pixel · F12 Stand-alone · F13 3D · F14 Touch
```

Recommended sequence: **F1 → F2 → F3 → F4 → F6 → F5 → F8 → F10 → F9 → F7**, then the
large/optional F11–F14 as appetite allows.

---

## F1 — Fixture index & ordered selections ⬜ (L, foundational)

**Goal.** Make *selection order* a first-class, user-editable index that drives every
effect's fan/phase. A rainbow scrolls in selection order; movement fans by it.

**Current state.** Effects spread by patch order (`context.ts` `colorTargets()` etc.
push fixtures in `show.patch.list()` order). Groups are unordered-ish id arrays. No
"index" concept, no transient selection.

**Data model.**
- Add a **Selection**: an ordered `fixtureId[]` that is the *active programming
  target*, independent of group membership. Lives in `main/` runtime state (not the
  project) — it's transient like the programmer. Shape: `{ ids: string[] }` where
  array position = index (1-based to the user).
- A persistent **fixture index** per group: store `Group.fixtureIds` as the canonical
  order (already ordered) and let the user re-order it.

**Engine.** No change — the engine consumes `targets` arrays already in sweep order.
The order is decided app-side.

**App / IPC.** New `main/handlers/selection.ts` + runtime `Selection` in `context.ts`:
- `lumox:selection:get` → `{ ids }`
- `lumox:selection:set` (ids) — explicit ordered set
- `lumox:selection:add` / `:remove` / `:clear`
- `lumox:selection:reorder` (fromIndex,toIndex) and quick ops:
  `:invert`, `:everyNth` (n, offset), `:shift` (±1), `:mirror`, `:reverse`.
- `context.ts`: replace patch-order target builders so `colorTargets/moveTargets/
  curveTargets` (and F3 layer targets) iterate the **active selection or the layer's
  target group in its stored order**, not raw patch order. Add an `FxOrder`
  transform (`patch | reverse | mirror | random`) applied when building targets
  (the engine's `Scene.ts` already declares `FxOrder`).

**Persistence.** Group order persists in the project (it already serializes
`fixtureIds`); ensure load preserves order. The transient selection is not saved.

**UI.**
- **Stage** (`views/stage.ts`) + **patch grid**: clicking/marquee builds the
  selection; show a small **index badge** on each selected node (the number).
  Ctrl/Cmd-click appends (index+1); Ctrl+Alt gives the previous index (ties).
- Selection toolbar (in stage or a new strip): All / Invert / ½ / ⅓ / ¼ / shift
  ◀▶ / reverse / mirror — mapping 1:1 to the IPC quick ops.
- **Group bar** right-click → "Edit order" opens a reorder list (drag rows).
- The **fader editor** + FX editors operate on the active selection when no group is
  chosen (today they operate on the selected group).

**Edge cases & decisions.**
- Decide: is the "group" the selection, or separate? **Recommendation:** keep groups
  as saved, named, ordered sets; add a *transient selection* for live programming
  that can be seeded from a group ("select group" = load its ids in order). This
  matches the reference's group-vs-selection split and avoids overloading groups.
- Vanished fixtures: prune from selection on patch change (`EV.PATCH_CHANGED`).
- `random` order must be deterministic per layer (seed by layer id) so playback is
  stable — `sceneFx.ts` already has `hash01`.

**Phases.** (1) Runtime selection + IPC + index badges on stage. (2) Quick-select
ops. (3) Re-route FX target builders through selection/group order + `FxOrder`. (4)
Group order editor.

**Acceptance.** Select 4 PARs L→R → a palette COLOR FX scrolls L→R; invert order →
scrolls R→L; mirror → fans from centre. Reordering a group changes an active FX's
direction live.

**Touch-points.** `main/context.ts`, new `main/handlers/selection.ts`,
`main/handlers/index.ts`, `preload.ts`, `renderer/lumox.d.ts`,
`renderer/views/stage.ts`, `renderer/views/patchgrid.ts`, `renderer/views/groupbar.ts`,
`renderer/lib/bus.ts` (new `EV.SELECTION_CHANGED`).

---

## F2 — Per-fixture limitations & channel flags ⬜ (M)

**Goal.** Clamp/shape a fixture's output safely: pan/tilt **range** (min/max angle),
invert pan / invert tilt / swap pan-tilt, dimmer cap, and per-channel
*follows-dimmer* / *follows-fade* flags.

**Current state.** None. `Fixture` has `mode.channels` (typeId/group) and
`addressOf()`, but no per-fixture overrides. MOVE FX assumes a 0..255 centre/size it
can't bound.

**Data model.** Add to `Fixture` (`src/fixtures/Fixture.ts`):

```ts
limits?: {
  dimmer?: { max: number }                       // 0..255 cap
  pan?:  { min: number; max: number; invert?: boolean }   // degrees within profile range
  tilt?: { min: number; max: number; invert?: boolean }
  swapPanTilt?: boolean
}
channelFlags?: { [channelIndex: number]: { fade?: boolean; dimmer?: boolean } }
```

The profile already defines the physical pan/tilt range; limits are a sub-range.

**Engine.** Two clean options:
- (a) Apply limits in a **post-stage** (`src/mix/modules/Limits.ts`) added to the
  pipeline after SceneMixer/Effects, reading per-fixture limits attached from the
  app (like FX targets). Pure, centralised, covers all sources (scenes, FX, live).
  **Recommended.**
- (b) Bake into `Fixture.apply`. Simpler but only covers programmer writes, not mix.
Choose (a). The module needs the patch → app attaches a per-universe limit map.

**App / IPC.** Extend `main/handlers/fixtures.ts`:
`lumox:fixtures:setLimits` (fixtureId, limits), `:setChannelFlag` (fixtureId, channel,
flag, value). `context.ts` builds the limit map for the Limits module on patch change.

**Persistence.** `Fixture.toJSON()` / patch restore carry `limits` + `channelFlags`
(extend `buildProject`/`loadProject` patch mapping). Back-compat: absent = no limits.

**UI.** A **fixture properties / limitations** panel (new tile or a section of the
patch view): a dimmer-cap slider, a draggable pan/tilt min/max box (reuse the
`xypad` lib), invert/swap toggles, per-channel fade/dimmer checkboxes in the channel
list. Beam-on/centre helpers optional.

**Edge cases.** Limits apply per fixture but the UI should support setting them on a
whole selection/group at once. Swap pan/tilt must reorder the two channels' output,
not values. Min>max guard.

**Phases.** (1) Data model + persistence + `Limits` pipeline module (dimmer cap +
invert/swap). (2) Pan/tilt range clamp + app limit map. (3) Per-channel flags. (4) UI.

**Acceptance.** A mover with tilt limited to 60–210° never outputs beyond it from any
scene/FX; invert tilt mirrors it; swap routes pan data to the tilt channel.

**Touch-points.** `src/fixtures/Fixture.ts`, new `src/mix/modules/Limits.ts`,
`src/core/Engine.ts` (add to pipeline), `main/context.ts`, `main/handlers/fixtures.ts`,
`main/serializers.ts`/`dto.ts`, `main/services/ProjectService.ts`, a renderer props view.

---

## F3 — Finish the FX-layer rack (app integration) 🟡 (L, in progress)

**Goal.** Surface the engine's multi-layer FX rack in the app: any scene can stack
N effect layers (`color | move | curve | chaser | value`), each with its own target
selection/group, sweep order, timing, and absolute/relative mode.

**Current state.** Engine **done**: `Scene.layers: FxLayer[]`, `addLayer/removeLayer/
moveLayer`, `toMixerTrack()→track.layers`, `normalizeLayer`/`defaultFxLayer`,
renderers (`renderColorFx/renderMoveFx/renderWaveFx/renderChaserFx`) in
`src/mix/sceneFx.ts`. **Not wired**: `main/context.ts` doesn't attach per-layer
`targets`; no DTO/IPC/preload/persistence/UI for layers. The legacy `scene.type`
single-FX path is what currently ships.

**Engine.** Confirm `SceneMixer` composites `track.layers` bottom→top over the base
look and that each layer reads `layer.targets`. (Mostly present; verify
absolute vs relative blend — relative adds an offset to the base rather than
overwriting.)

**App / IPC.** `context.ts`: for each layer, build `targets` from the layer's
`target` (`{mode:'all'}` or `{mode:'group',groupId}`) in `order` (F1's `FxOrder`),
resolving the right attribute addresses by kind (rgb / pan-tilt / `attr` channel
type). Add to `main/handlers/scenes.ts`:
`lumox:scenes:addLayer` (sceneId, kind) · `:removeLayer` · `:moveLayer` (id,delta) ·
`:setLayer` (sceneId, layerId, partial config) · `:setLayerTarget` · `:setLayerOrder`.
Each mutates the scene then `rebuildSceneTrack`. Extend `sceneJSON` with `layers`.

**Persistence.** `buildProject`/`loadProject` already pass scene fields; add `layers`
(JSON-safe) and run them through `normalizeLayer` on load.

**UI.** Evolve the FX drill-in (`views/fxpalette.ts`): the FX grid becomes an
**FX rack** — a stack of layer chips (add `+`, reorder, enable, delete), each opening
its kind's editor (the color/move/curve/value/chaser panels that already exist),
plus per-layer **Target** (All / group) and **Order** selectors and an
**absolute/relative** toggle. Reuse `colorpicker`, `xypad`, knob widgets.

**Edge cases.** A layer targeting a group with no matching attribute (e.g. a curve on
`pan` for RGB pars) renders nothing — fine. Migration: a legacy `scene.type` FX should
be presentable as a single equivalent layer (write a one-time `type→layer` shim so
old projects open in the rack UI).

**Phases.** (1) `context.ts` layer-target resolution + `rebuildSceneTrack`. (2)
DTO + IPC + preload + persistence. (3) Rack UI (chips + per-layer editors). (4)
legacy `type→layer` migration; retire the single-FX path.

**Acceptance.** A scene with a COLOR FX layer (group A) + a MOVE FX layer (group B)
animates both; reordering/disabling a layer updates live; project round-trips.

**Touch-points.** `src/mix/modules/SceneMixer.ts` (verify), `main/context.ts`,
`main/handlers/scenes.ts`, `main/dto.ts`, `main/serializers.ts`, `preload.ts`,
`renderer/lumox.d.ts`, `renderer/views/fxpalette.ts`, `renderer/styles/main.css`.

---

## F4 — Saved colour palettes ⬜ (M, depends on F3)

**Goal.** Reusable colour/gradient presets: apply to a COLOR FX layer's palette, or
to a selection directly.

**Current state.** COLOR FX has an inline `palette: string[]`. No saved library.

**Data model.** `Palette { id, name, colors: string[] }`. Store a palette **library**
in the project (`project.palettes[]`) and optionally ship built-in defaults
(Rainbow, Fire, Warm, …). (The reference ships palettes as XML; we keep ours in the
project + a built-in set.)

**App / IPC.** `main/handlers/palettes.ts`: `list/add/rename/remove/update`. Apply =
`scenes:setLayer` with the palette colours, or a `selection:applyColors` that writes
rgb to the current selection's programmer.

**Persistence.** `project.palettes` in `buildProject`/`loadProject`; built-ins merged
at load if absent.

**UI.** A palette strip in the COLOR FX editor (swatch row → "save as palette",
load from a dropdown/library popover). Optional palette manager in a settings/library
view.

**Phases.** (1) model + persistence + built-ins. (2) IPC. (3) COLOR-FX editor
load/save. (4) direct-apply-to-selection.

**Acceptance.** Save a 4-colour palette, apply it to a new COLOR FX layer, reopen the
project → palette + assignment survive.

**Touch-points.** `main/` palettes handler + dto/serializers/project, `preload.ts`,
`renderer/lumox.d.ts`, `renderer/views/fxpalette.ts`.

---

## F5 — Per-group live mixer ⬜→🟡 (M, depends on F1)

**Goal.** A live mixer strip **per group** (dimmer, hue/sat, strobe, quick colour) plus
an **All** master strip — fast hands-on control without programming.

**Current state.** Single attribute-tab fader editor + colour picker + xy pad exist
(`views/fadereditor.ts`, `lib/colorpicker.ts`, `lib/xypad.ts`). No per-group strips.

**Data model.** Runtime only — a mixer writes the group's fixtures' programmer (like
LIVE faders today). Optionally persist per-group mixer state as part of the
programmer snapshot.

**Engine/app.** Reuse `fixtures:setChannel` across a group; add convenience
`lumox:groups:setAttr` (groupId, attr, value) that writes the attribute (dimmer / rgb
from hue-sat / strobe) to every fixture in the group. Hue/sat → rgb via `src/util/Color`.

**UI.** A **Mixer** view/tile: one column per group (`groupbar` order) + an "All"
column, each with a dimmer fader, a hue + sat control (small colour wheel), a strobe
toggle/rate, and quick-colour swatches. Mirror the reference's mixer rack.

**Phases.** (1) `groups:setAttr` + hue/sat→rgb. (2) Mixer view (dimmer + colour). (3)
strobe + quick swatches + All master.

**Acceptance.** Dragging a group's dimmer dims only that group; the hue wheel recolours
it live; "All" scales everything.

**Touch-points.** `main/handlers/groups.ts`, `preload.ts`, `renderer/lumox.d.ts`, new
`renderer/views/mixer.ts`, `renderer/styles/main.css`, `src/util/Color.ts`.

---

## F6 — Cue / scene management semantics ⬜ (L, independent)

**Goal.** Turn banks into a real cue engine: per-scene **priority** (LTP), **loop N
times** vs always, **jump-to** (chain), **release modes**, **protect-from-release**,
**flash mode**.

**Current state.** `BankManager` + `CueRunner` give ordered banks, one-active-per-bank,
hold/auto-advance, manual transport. `recallScene` (`context.ts`) enforces
one-per-bank with fades. Missing: priority, loop counts, chaining, configurable
release scope, flash.

**Data model.** Extend `Scene`:

```ts
priority: 'low' | 'normal' | 'high'
loop: { mode: 'always' | 'count'; count: number }
jumpTo: { mode: 'next' | 'prev' | 'scene'; sceneId?: string } | null
releaseAtEnd: boolean
releaseMode: 'off' | 'all' | 'bank' | 'outside-bank' | 'specific'; releaseBanks?: string[]
protectFromRelease: 'off' | 'all' | 'bank' | 'outside-bank' | 'specific'; protectBanks?: string[]
flash: boolean
```

**Engine.** `SceneMixer` blend currently HTP-over-base by opacity. Add **priority**:
when two live tracks write the same channel, the higher-priority track wins (LTP
within a priority tier). Add a per-track **loop counter** + "released at end" so a
scene auto-stops/pauses after N cycles.

**App.** `recallScene` + `CueRunner` implement release/protect logic: on recall,
compute the set of scenes to release from `releaseMode` (respecting each target's
`protectFromRelease`), and honour `jumpTo` when a looped scene ends. `flash` =
recall on press / release on up (wire in `banks.ts`/renderer).

**IPC.** Extend `main/handlers/scenes.ts`: `setPriority/setLoop/setJumpTo/
setReleaseMode/setProtect/setFlash`. Extend `sceneJSON` + DTO + persistence.

**UI.** A scene **Advanced** panel (in `fxpalette.ts` gear view or its own rail icon):
priority dropdown, loop (always / N), jump-to picker, release-at-end toggle, release
mode + bank multiselect, protect mode, flash toggle.

**Edge cases.** Release/protect interaction is subtle — encode as: a scene is released
by X only if X's releaseMode includes it AND its own protect doesn't shield it from
X's scope. Add unit tests for the truth table.

**Phases.** (1) priority in SceneMixer + UI. (2) loop count + release-at-end + jump-to.
(3) release/protect scopes. (4) flash.

**Acceptance.** High-priority Move FX overrides a low one on shared fixtures; a scene
set "loop ×3, jump to next" plays 3 cycles then triggers the next cue; release-mode
"bank" clears siblings only.

**Touch-points.** `src/show/Scene.ts`, `src/mix/modules/SceneMixer.ts`,
`main/context.ts`, `main/services/CueRunner.ts`, `main/handlers/scenes.ts`+`banks.ts`,
`main/dto.ts`/`serializers.ts`/`ProjectService.ts`, `renderer/views/fxpalette.ts`+`banks.ts`.

---

## F7 — Timeline "super scene" (sequencer + audio sync) ⬜ (XL, depends on F3)

**Goal.** A timeline scene type that stacks scene/effect blocks on multi-track lanes
(left→right, layered top→bottom), with per-block fade in/out, loop/stretch/truncate,
per-track dimmer + phasing automation, **audio-file import** with waveform, and a
**beats grid** (tempo + offset) for snapping.

**Current state.** None. Banks are flat cue lists.

**Data model.** A new entity `SuperScene { id, name, tracks: Track[], lengthMs, grid:
{ mode:'time'|'beats'; tempo; offset } }` where `Track { blocks: Block[], dimmerAuto:
Point[], phasingAuto: Point[], locked, hidden }` and `Block { sceneId | audioRef,
startMs, durationMs, fadeInMs, fadeOutMs, loop, stretch }`. Audio stored as a project
asset path + decoded peaks for the waveform.

**Engine.** A `SuperSceneRunner` (app service) drives a playhead; at each tick it
recalls/blends the active blocks at their fade levels and applies track automation.
Reuses scene tracks under the hood (blocks reference existing scenes).

**App / IPC.** `main/handlers/superscene.ts` (CRUD + transport + block edit +
automation points + audio import via dialog). Audio decode for peaks (Web Audio in
renderer, or a main-side decoder). Persist in project; audio referenced by path.

**UI.** A full-page **Timeline** view (reuse `fullViews`): tracks, draggable/resizable
blocks (drag bottom edge = fade), automation lanes, audio waveform, transport, zoom,
grid (time/beats) with snap, play/end markers.

**Phases.** (1) data model + runner (blocks only, no audio). (2) timeline UI (drag/
resize/fade). (3) track automation (dimmer/phasing). (4) beats grid + snap. (5) audio
import + waveform + sync.

**Acceptance.** Place three scenes across a 20 s timeline with fades, hit play →
they trigger and crossfade on schedule; switch to beats grid at 120 BPM and blocks
snap to beats; import a wav and align a block to a downbeat.

**Touch-points.** new `src/show/SuperScene.ts` (or `main/` if app-only), new
`main/services/SuperSceneRunner.ts` + handler, `preload.ts`, `renderer/lumox.d.ts`,
new `renderer/views/timeline.ts`, project format.

---

## F8 — Settings store (enabler for F9/F10) ⬜ (S)

**Goal.** A small persistent app-settings store (machine-specific, separate from the
project): MIDI/OSC ports, BPM source, output prefs.

**Data model.** `SettingsService` reading/writing `settings.json` in
`app.getPath('userData')`; typed getters/setters; change events.

**IPC.** `lumox:settings:get` / `:set` (key, value) / `:all`. Mark non-dirtying.

**Acceptance.** A value set survives app restart and is independent of the open project.

**Touch-points.** new `main/services/SettingsService.ts`, `main/handlers/settings.ts`,
`preload.ts`, `renderer/lumox.d.ts`.

---

## F9 — Input mapping & MIDI-learn ⬜ (L) → see dedicated plan

Full design in [midi-control-surface.md](midi-control-surface.md): Action registry,
MidiDevice/Binding model, InputRouter + FeedbackEngine, MIDI-learn UX, Devices view.
Extends naturally to OSC / keyboard / DMX-in / dry-contact via the same Action
registry. Depends on **F8** (port settings) and benefits from **F1** (selections as
mappable targets).

---

## F10 — BPM sources ⬜→🟡 (M, depends on F8)

**Goal.** Drive beat-synced scenes from **tap tempo**, **audio sync** (peak/onset
detection), **MIDI clock**, or **Ableton Link**.

**Current state.** A master BPM + per-scene `driveMode:'bpm'` + `beatDiv` exist
(`Transport`, SceneMixer). Source is manual only.

**Engine/app.** `Transport` gains a **source** selector. Tap = average recent taps.
Audio = analyse an input device (renderer Web Audio → main, or a main-side capture)
for onsets → BPM. MIDI clock = count 24 ppqn from a MIDI input (reuse `src/midi`).
Ableton Link = optional native addon (stretch goal; gate behind availability like
`easymidi`).

**IPC.** `lumox:transport:setSource` (tap|audio|midi-clock|link) + `:tap`. Source +
device persisted via **F8**.

**UI.** BPM source picker in a settings/transport panel; a Tap button in the toolbar.

**Phases.** (1) tap tempo + UI. (2) MIDI clock (reuses MIDI backend). (3) audio sync.
(4) Ableton Link (optional).

**Acceptance.** Tapping sets BPM and beat-synced scenes follow; MIDI clock from a DAW
locks the tempo.

**Touch-points.** `main/services/Transport.ts`, `main/handlers/transport.ts`,
`src/midi/*`, `preload.ts`, `renderer/lumox.d.ts`, a transport/settings UI.

---

## F11 — Matrix / strip fixtures & pixel effects ⬜→🟡 (L)

**Goal.** Create matrix/strip fixtures in-app (LED mode + width×height/arrangement, or
N LEDs) and run pixel-mapped effects across them.

**Current state.** `emitterLayout` exists on definitions and renders on the stage; no
in-app matrix/strip *creation*, no pixel-matrix effect mapping.

**Plan (sketch).** Patch-time generator that builds a multi-cell fixture (or a group
of single-pixel fixtures) with a 2D layout; a COLOR/VALUE FX `order` that walks the
matrix by row/column/diagonal (extends F1's `FxOrder` with 2D directions, mirroring
the reference's 16-direction custom-matrix index). Pixel effects then reuse the FX
rack with matrix-aware target ordering.

**Acceptance.** Create a 10×5 RGB matrix; a COLOR FX sweeps a gradient across it in a
chosen direction.

**Touch-points.** `main/handlers/patch.ts`, `src/fixtures/*`, `main/context.ts`
(matrix target ordering), `renderer/views/patchgrid.ts`/`stage.ts`, FX UI.

---

## F12 — Stand-alone export ⬜ (XL, strong fit for ESP32 nodes)

**Goal.** Compile a show so a node runs it **without the app** (scenes + simple
triggers + clock/calendar schedules).

**Plan (sketch).** Define a compact stand-alone show format the firmware can play;
an exporter that flattens selected scenes/banks into it; transfer to the node over
the existing network link; a schedule editor (time-of-day / weekday triggers). This
spans the **app + firmware** repos — coordinate the format with `lumox-firmware`.

**Acceptance.** Export a few looks to a node; unplug the laptop; the node keeps
playing / switches on schedule.

**Touch-points.** new `main/services/StandaloneExport.ts`, a transfer channel, an
export/schedule UI, firmware-side player (separate repo).

---

## F13 — Real-time 3D visualiser ⬜ (XL, optional)

**Goal.** A 3D preview of the rig (vs today's 2D top-down stage) for off-site
programming.

**Plan (sketch).** A WebGL view (e.g. three.js, bundled — no CDN) rendering fixtures
from the patch + their live DMX (beam cones, colour, pan/tilt). Reads the same live
output the debug view reads. Large; build only if off-site programming is a goal.

**Touch-points.** new `renderer/views/visualizer3d.ts` (+ a 3D lib in the bundle),
live-output IPC.

---

## F14 — Touch interface & remote ⬜ (XL, optional)

**Goal.** A custom button/fader page surface (touch) and phone/tablet remote control.

**Plan (sketch).** Touch = a user-arrangeable grid of widgets bound to Actions (reuse
F9's Action registry); Remote = serve a small web UI over the node/AP network bound to
the same Actions. Both lean entirely on the Action registry, so do **F9 first**.

**Touch-points.** new touch view + a small served web surface; Action registry from F9.

---

## Notes

- The big unlock is **F1 (ordered selections)** — it makes phase/fan real, which is
  what gives **F3 (FX rack)**, **F5 (per-group mixer)**, and **F7 (super scenes)**
  their expressiveness. Do it first.
- Build **F8 (settings store)** before F9/F10 — it's tiny and unblocks both.
- Keep naming generic in code/UI/docs (`conventions.md`). When a feature ships, fold
  its behaviour into `docs/knowledge-base/` and update the table in `CLAUDE.md`.
