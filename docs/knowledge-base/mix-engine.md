# State & Mix Engine

**Status:** stable
**Files:** `src/core/Engine.ts`, `src/core/Universe.ts`, `src/mix/*`, `src/show/*`

## What

The headless engine composes the final DMX frame for every universe each tick.
It is the core of the app and runs with or without the Electron shell.

## How

- **Tick loop** (`src/core/Engine.ts`) runs at `refreshHz` (default **44**). Per
  tick, per universe:
  1. `mix.process(universe, ctx)` runs the pipeline → writes `universe.data`
  2. dirty check vs `_prev` — compares only the **wire region** (first
     `DMX_CHANNELS`); changes in the virtual region never reach the wire so they
     don't mark the universe dirty
  3. `outputs.dispatch(universe, now)` — outputs gate on dirty / keepalive / rate
- **Mix pipeline** (`src/mix/MixPipeline.ts`), order matters:
  `BaseLayer → SceneMixer → Effects → GroupEffects → Limits → VirtualDimmer → GrandMaster → Blackout`.
  Add/remove modules at runtime via `engine.mix.add/remove`; convenience refs
  `engine.scenes`, `engine.effects`, `engine.groupEffects`, `engine.limits`,
  `engine.virtualDimmer`, `engine.grandMaster`, `engine.blackout`.
- **Universe buffers** (`src/core/Universe.ts`):
  - `programmer` — user/base writes (`setChannel`, IPC) land here
  - `data` — final mixed output the pipeline writes; outputs read this
  - `_prev` — last-sent snapshot for dirty detection

  Buffers are `TOTAL_CHANNELS` (1024) long: the **512 wire channels** plus a
  **virtual region** (`VIRTUAL_CHANNELS`, addresses 513..1024) for synthetic
  per-fixture controls (see [virtual-dimmers.md](virtual-dimmers.md)). The pipeline
  blends the virtual region like any channel; only the first 512 reach the wire
  (the Art-Net/sACN encoders cap every frame at `DMX_CHANNELS`). All 1-indexed in
  the `setChannel`/`getChannel` API.
- **Show model** (`src/show/`): `Show`, `Patch`, `Scene`, `Group` + `GroupManager`,
  and `BankManager` (banks of scenes). New mix behaviour = subclass `MixModule`
  and implement `process(universe, ctx)`.

## Scene base + FX rack (`Scene.type` + `Scene.layers`)

A scene is a **base look** plus an ordered **FX rack** of effect layers composited
over it (bottom→top, top layer wins on a conflicting channel). There is **no
legacy single-FX-type path** — all effects are layers.

- **base** — `type: 'static'` (the captured `values` look) or `'chase'` (an ordered
  list of `ChaseStep`s `{ values, fadeMs, waitMs }`: a free-run chase crossfades in
  over `fadeMs` then dwells `waitMs`, cycle = sum across steps; BPM-drive steps
  uniformly with no crossfade; direction fwd/back/bounce reorders play).
- **rack** — `Scene.layers: FxLayer[]`. Each layer has a `kind`
  (`color`/`move`/`curve`/`chaser`/`value`/`matrix`), `enabled`, a `target`
  (`all` | `{group}`), an `order` (`patch`/`reverse`/`mirror`/`random` — the
  per-fixture sweep "index"), its own timing (`rateMs`/`speed`/`driveMode`/`beatDiv`/
  `direction`/`size`/`spread`) and one kind config. The SceneMixer composites the
  base + each enabled layer per tick, each layer on its **own phase clock**
  (`src/mix/sceneFx.ts` holds the FX math; `SceneMixer._frame` composites).

Layer kinds (`src/mix/sceneFx.ts`):

- **color** (`renderColorFx`) — gradient travelling the rig. Empty palette ⇒
  rainbow. `ColorFxConfig`: `palette[]`, `grayscale`, `colorWidth`, `angle`,
  `saturation`, `fade` (stop softness), `randomize`.
- **move** (`renderMoveFx`) — pan/tilt path (`shape`: circle/figure8/line/square),
  `symmetry`, `sizeX`/`sizeY`, `centerX`/`centerY`, `phaseShape` (path rotation).
- **curve** / **value** (`renderWaveFx`) — a waveform (sine/triangle/sawtooth/
  square/random) on **any attribute** (`attr` = channel-type id) mapped into
  `[min,max]`, with `duty` + `invert`; value also has a flat `staticValue`.
- **chaser** (`renderChaserFx`) — a lit window walking the selection: `litCount`,
  `gap`, `fade`, `level`/`bg`, on any `attr`. The head is a **continuous** position
  (not snapped to a fixture): a one-unit lead-in ramp brightens a fixture as the
  head approaches and a one-unit far-edge ramp fades the tail out, so the comet
  flows smoothly between fixtures (at an exact integer head it matches the classic
  stepped look). `fade` stays purely the spatial tail dimming.
- **matrix** (`renderMatrixFx`) — true **pixel-mapping**: colours each emitter
  from its 2D **world position** on the STAGE (not its sweep index). `pattern`
  (`wipe`/`radial`/`plasma`), `palette[]` (empty ⇒ rainbow), `saturation`, `fade`,
  `angle` (wipe direction), `scale` (cycles across the rig). Positions are
  normalized to the rig bounding box each tick, so the look fills the stage at any
  scale; rotating a fixture rotates its pixel-map. Drives per-emitter `[r,g,b]`
  channels — a single-colour fixture is one pixel, a matrix is one per cell. See
  [fixtures.md](fixtures.md) (stage transform + emitter world coordinates).

Each layer's DMX target addresses (`TrackLayer.targets`) are derived from the patch
by the app layer (`main/services/SceneCompiler.ts` `sceneTrack` → `fixturesFor`/
`orderFixtures`/`targetsForKind`, honouring the layer's group + order) and attached to the track —
the engine stays fixture-agnostic. MATRIX layers instead use `matrixTargets`,
which pairs each emitter's `[r,g,b(,w)]` tuple (`Fixture.emitterColorAddresses` —
head-aware: explicit emitter/head groups when set, else zipped colour clusters)
with its world position (`Fixture.emitterWorldPositions`) into the track's
`targets` + `positions`. Rebuild a track after editing with
`rebuildSceneTrack`. IPC: `scenes:setType`, `scenes:{add,remove,move}Step`,
`scenes:setStepTiming`, `scenes:{add,remove,move}Layer`,
`scenes:setLayer{Enabled,Target,Order,Timing,Config}`. Reusable colour palettes +
FX-rack presets persist with the project (`scenes:`… plus `palettes:*` / `presets:*`,
stored in `main/services/presets.ts`).

**Built-in palettes.** `presets.ts` ships a curated set of read-only
`BUILTIN_PALETTES` (multi-stop gradients — Sunset, Lava, Magma, Ocean, Aurora,
Forest, Tropical, Party, Synthwave, Viridis, …) so the COLOR / MATRIX palette
picker is useful before any user palettes exist. They live *outside* the
persistence `Store` (never renamed/removed/saved); `palettes:list` returns them
ahead of the user's saved palettes (stable `builtin_<slug>` ids). `fxpalette.ts`
groups them under **Built-in** vs **Saved** `<optgroup>`s; applying one copies its
hex stops into the layer's `palette[]`, so the layer stays independent afterwards.

## Scene playback: fades, phase clock, tempo, transport

The CONTROL **Scene Properties** panel (`renderer/views/fxpalette.ts`) edits how a
scene plays. The runtime model lives in the `SceneMixer`:

- **Two clocks, one writer.** `process(universe, ctx)` runs once *per universe*
  per tick and is a pure reader (`opacity` + the track's phase). `update(deltaMs)`
  runs **once per tick** (wired in `main/services/showRuntime.ts` off the engine
  `'tick'`) and is the *only* writer of fade ramps and phase clocks, so
  multi-universe shows never double-advance. Direct/headless use without `update()`
  falls back to `ctx.now`.
- **Per-track `playback` state** (`SceneMixer.playback`): fade ramp
  (from/target/elapsed/total + a `preDelayMs`), a `phaseMs` virtual clock,
  `paused`, and a pinned `manualStep`. Created lazily on first fade/transport.
- **Fades.** `fadeTo(id, target, seconds, preDelayMs)` ramps opacity linearly;
  `seconds === 0` (no pre-delay) settles instantly (snap-recall). New scenes
  default to a soft `fadeIn`/`fadeOut` of `DEFAULT_SCENE_FADE` (**0.4 s**,
  `src/show/Scene.ts`). `isLive(id)` (opacity > 0 **or** fading toward a positive
  target) drives broadcast gating; when a fade-out settles to 0,
  `consumeWentInactive()` triggers `updateActiveUniverses()` so the universe stops
  transmitting.
- **Dipless crossfade.** When a recall **releases** other live scenes *and* the
  incoming scene has a fade time, `recallScene` (`SceneOrchestrator`) joins them
  with a **dipless** value-wise crossfade instead of two independent opacity ramps
  (`startTransition`). A `Transition` mixes ONE interpolated source —
  `lerp(from, to·level, f)` — into the normal priority/HTP stack: `from` is the
  frozen combined look of the outgoing tracks (captured lazily per universe at the
  first `process`), `to` is the incoming track's live, animating frame. So a
  channel that is full in **both** scenes stays full (no HTP dip on shared
  channels), and pan/colour interpolate cleanly. The outgoing tracks are held +
  suppressed for the fade, then dropped to opacity 0 (signalling
  `consumeWentInactive()`) — their tracks **persist**, since every scene keeps its
  track so it stays recallable. The
  **incoming `fadeIn`** governs the crossfade duration (the released scene's
  `fadeOut` does not apply here); coexisting scenes in other banks are outside the
  `fromIds`/`toId` set and keep blending independently. A plain recall with no
  released scene (or `fadeIn === 0`) just ramps opacity — already dipless on its
  own. A crossfade does **not** ramp the outgoing track's opacity (the snapshot
  represents it, so it stays pinned at 1 until completion), so `isLive` alone can't
  tell the banks tile the release is still in flight — `isTransitioning(id)` (true
  for the incoming target and every held outgoing source, surfaced as
  `SceneDTO.transitioning`) is the poll signal that keeps the Banks tile refreshing
  until the crossfade settles and the released scene's `active` highlight clears.
- **Tempo.** `driveMode 'off'` → period `rateMs / speed`; `'bpm'` →
  `(60000 / bpm) / beatDiv`. The master `bpm` is owned by
  `main/services/Transport.ts`, pushed into the mixer, and persisted top-level.
- **Start mode** (on recall): `restart` zeroes the phase, `continue` keeps the
  free-running clock, `random` seeds an offset. **Direction**: `forward` /
  `backward` (reverse steps / negate FX angle) / `bounce` (triangle ping-pong).
- **Transport** (runtime only, not persisted): `pause/resume`, `stepNext/stepPrev`
  (chase: pin a step; FX: nudge the phase), `toStart/toEnd`.
- **Scene-timeline readout.** `SceneMixer.sceneTimeline(id)` returns the
  `{ cycleMs, phaseMs }` of whatever drives the *visible* motion: a chase uses its
  base clock; an FX scene uses the **first enabled layer's own clock + period**
  (critical — the base `phaseMs` does NOT advance for a `static`+FX scene; only
  layer clocks do, so reading the base clock would read a stuck 0). Bounce doubles
  the cycle for the out-and-back. Surfaced in `SceneDTO` (`cycleMs`/`phaseMs`); the
  Banks tile draws an **active-scene timeline** from them — a live `MMmSSsCC`
  timecode, a loop icon, and a bottom playhead strip (`phaseMs % cycleMs`),
  interpolated at the display refresh rate (rAF) and re-anchored each poll. The
  timeline is shown **only for periodic scenes** (`cycleMs > 0`); a plain static
  look is just static and shows no timecode or strip.

Scene scalar params (`level`, `speed`, `spread`, `size`, fade times, `driveMode`,
`beatDiv`, `startMode`, `direction`) persist with the project; the panel's setters
(`lumox:scenes:set*`) mutate the scene **and** the live track *in place* (not
`rebuildSceneTrack`) so the fade/phase state survives the edit.

## Advanced playback: priority, loop/jump, release/protect, flash

The CONTROL Scene panel's **Advanced** page (reached from the right-hand section
rail in `fxpalette.ts`) exposes a second set of playback rules. All persist with the project; setters are `lumox:scenes:set{Priority,
Loop,JumpTo,ReleaseAtEnd,ReleaseMode,Protect,Flash}`.

- **Priority** (`low`/`normal`/`high`). The `SceneMixer.process` composites by tier
  **high → low**: a tier "claims" every channel it writes (`_claimed` mask), and
  lower tiers can't touch claimed channels — so a high-priority scene overrides
  lower ones on shared fixtures. Within a tier, tracks blend **per channel by
  HTP/LTP** (intensity highest-takes-precedence, attributes latest-takes-precedence;
  see [htp-ltp.md](htp-ltp.md)). With all scenes at the default `normal`, one pass
  runs with nothing claimed. Carried on the track (`track.priority`).
- **Loop / Jump** (`loop {mode:'always'|'count', count}`, `jumpTo`, `releaseAtEnd`).
  A counted loop runs N cycles then ends. The mixer counts in `update()`:
  `pb.runMs` accumulates live play time since recall (reset by `resetPhase`),
  and once `runMs ≥ count × sceneCycleMs(track)` the id is queued in `_completed`
  (drained by `consumeCompleted()`). `sceneCycleMs` = the chase's real-time cycle,
  else the first enabled FX layer's period (0 = nothing periodic → never completes).
  `SceneOrchestrator.handleLoopComplete` reacts: `jumpTo` (`next`/`prev` in bank, or a
  specific `sceneId`) recalls the target; otherwise `releaseAtEnd` releases the
  scene or pauses it on its last frame. `track.loopCount` (0 = forever) carries it.
- **Release / Protect** (`releaseMode` + `protectFromRelease`, each `off`/`all`/
  `bank`/`outside-bank`/`specific` with a bank-id list). `recallScene` releases
  every live scene its `releaseMode` covers **unless** that target shields itself
  via `protectFromRelease` against the actor's scope (`releases()` =
  `inReleaseScope(actor) && !isProtected(target)`). The defaults
  (`releaseMode:'bank'`, `protect:'off'`) reproduce the old "one active per bank".
- **Flash** (`flash`). The banks tile drives a flash scene from pointer-down
  (recall on) to pointer-up (recall off) instead of click-toggle.

## Banks

A bank is an ordered group of scenes — a container, not a sequencer. Scenes are
recalled individually; the column's `+` captures current output as a new scene in
that bank. Recall goes through `recallScene` (release/protect scopes + broadcast
refresh); the default `bank` release keeps one active scene per bank.

Right-clicking a bank tab (or a bank column header) opens a context menu to
**Rename…** or **Delete** the bank (`lumox:banks:rename` / `lumox:banks:remove`).
Deleting drops the bank's scenes from the engine + show; `ensureDefault()` recreates
an empty bank if the last one is removed.

**Layout.** Banks sit side by side; the row scrolls horizontally (the top dock row
has a CSS min-height floor `.ws-top`). Each `.bank-col` is a CSS `column-wrap` flow
of header, capture button, then scene cells: scenes fill top-to-bottom and **wrap
into a new column to the right** once they fill the bank's height — no vertical
scrollbar. The header being first, wrapped columns start at the **top** and the
header never widens across them. Chromium only widens a column-wrap box for extra
columns when its height is *definite*, so `banks.ts` pins each `.bank-col` to its
resolved height (`pinColumnHeights`, re-run on every rebuild and on a
`ResizeObserver`).

## Recalling vs editing a scene (CONTROL → Banks)

A scene cell has two click regions with distinct jobs:

- **Body** (wide left part) — activates / deactivates the scene (`recallScene`,
  toggle), and on activate makes it the EDIT target so the fader editor + Scene
  panel **follow what is live** (emits `SCENE_SELECTED`). It does **not** change the
  live **fixture selection** — firing scenes mid-show never disturbs what you are
  programming (nor re-fans other selection-targeted FX).
- **Right colour strip** — selects the scene as the EDIT target for the fader
  editor + Scene panel (emits `SCENE_SELECTED`) **and** picks the scene's fixtures
  as the live selection (emits `FIXTURE_SELECTED`) so they're ready to edit, without
  changing playback. **Clicking the already-selected scene's strip again deselects
  it** (emits `SCENE_DESELECTED`) — clearing the edit target so both editors show
  their greyed no-scene state. `SCENE_DESELECTED` is distinct from a
  `SCENE_SELECTED`-null, which instead **re-resolves** the target to whatever scene
  stays active (used by release / delete).

So the body fires-and-follows (playback + edit target, selection untouched) while
the strip is the explicit "edit this scene's fixtures" gesture — the only one that
changes the live fixture selection.

## Fader editor — EDIT vs LIVE

The CONTROL fader editor is **gated on the live selection** (see
[selection.md](selection.md)): it shows one strip per channel of the *selected*
fixtures, grouped into one block per channel-config (a block's faders broadcast to
every selected fixture of that type), in selection order. With nothing selected the
strip area is unavailable (a terse "No fixtures selected" state note); a group-bar tab is the quick
"select this whole group" gesture. The GrandMaster + Blackout sit outside the grid
and stay live regardless.

It writes to one of two targets:

- **EDIT** edits the recalled scene — `lumox:scenes:setChannel` maps a
  fixture-local channel to its absolute address and writes both `scene.values`
  and the live track (an active scene updates immediately). `null` clears the channel.
- **LIVE** engages channels in the universe `programmer` buffer (manual output).

### Channel presets (profile ranges)

A channel that carries profile **capabilities** (gobo / colour-wheel / shutter /
macro value ranges — see [fixtures.md](fixtures.md)) renders a column of **preset
chips** beside its fader. Each chip is
the range's **colour swatch**, its **drawn-gobo thumbnail** (`goboSvg`), or a small
**labelled chip** for everything else. Clicking a chip engages the channel and snaps
it to the range's **mid value** (`data-v`); the chip that contains the live value is
highlighted, the strip's readout shows that range's **label** (e.g. `Orange`), and a
drawn gobo also replaces the round strip icon. A **gobo** strip lays its thumbnails
out as an aligned **2-column** grid (`.fc-chips--gobo`) and a **colour-wheel** strip
its swatches as a matching **2-column** grid (`.fc-chips--color`); non-icon
ranges stay full-width text rows. Preset-bearing strips widen
(`.fcol.has-presets`) to seat the chips next to a slim fader; plain channels keep the
classic narrow strip. The fader still fine-tunes the raw 0–255 value.

### Engaged channels (the programmer)

The programmer carries two parallel buffers: the **values** (`Universe.programmer`)
and an **engaged mask** (`Universe.engaged`). Only channels you actually move are
*engaged*:

- A fader move calls `lumox:fixtures:setChannel` → `Universe.engage(abs, value)`
  (sets the value **and** the engaged flag for that one channel). Releasing a
  channel (its dot) calls `lumox:fixtures:releaseChannel` → `Universe.release(abs)`
  (zeroes it + clears the flag). Raw `setChannel`/`setRange`/`Fixture.apply` leave
  the mask untouched.
- This matters because `Fixture.apply` flushes a fixture's **default** channel
  values into the programmer at patch/load time (`handlers/patch.ts`,
  `ProjectService`) — e.g. pan/tilt home at `128`. Those defaults are not engaged,
  so they are never captured or counted (only the faders you moved are) **and** a
  scene's LTP attribute write overrides them (a non-engaged channel isn't owned by
  the manual layer). See [htp-ltp.md](htp-ltp.md).

### Programmer → Store (scene creation)

LIVE mode *is* the programmer — the staging buffer for building a look. Its header
shows the engaged-channel count plus three actions:

- **Clear** (`lumox:fixtures:clearProgrammer`) zeroes every universe's `programmer`
  buffer and engaged mask (`Universe.fillProgrammer`) and re-evaluates the broadcast
  subscription, so untouched channels stop transmitting.
- **Save** (`lumox:scenes:merge`, floppy-disk icon) overlays the engaged channels
  **into the current scene** — the one being edited (`SCENE_SELECTED`) — keeping the
  scene's other stored values. Distinct from `update`, which *replaces* the whole
  look. Disabled until a scene is active.
- **Snapshot** (`lumox:scenes:capture`, camera icon) snapshots the programmer into a
  **new** scene in the active bank. `Scene.snapshot({ engagedOnly: true })` captures
  **exactly the engaged channels** (even ones engaged at 0) — not fixture defaults,
  not whatever other scenes are live. Chase-step capture (`addStep`), re-capture
  (`update`) and merge (`merge`) use the same snapshot path. The Snapshot target is
  the active bank tab, broadcast over the renderer bus (`BANK_SELECTED`).

`lumox:fixtures:programmer` returns `{ channels, universes }` (counting the engaged
mask) for the header readout. Programmer state is transient (never flags the project
dirty). Headless/engine use without the flag still captures every non-zero channel —
`engagedOnly` is opt-in for the app.

## Broadcast gating

The shell's broadcast output (`main/services/OutputPatchService.ts`) subscribes only to "live"
universes — those with an active scene *or* live programmer output
(`markLiveUniverse`). With nothing live it uses the `NO_UNIVERSE` sentinel rather
than the empty "all" set.

**Release linger.** A universe that just stopped being live is **not** dropped
immediately — it lingers in the subscription for `RELEASE_LINGER_MS` (~1.2 s,
`tickReleaseLinger`). Otherwise it would be unsubscribed *before* the mixed-down
`0` frame is dispatched, so the nodes would latch their last value and stay lit. The
linger keeps it transmitting long enough for the `0` (a dirty frame + keep-alive) to
reach the nodes, then drops it — so "deselect a scene → fixtures go dark" behaves
like a continuously-outputting console; it also covers clearing the LIVE programmer.

**Shutdown blackout.** Same latching problem on quit: closing a socket only *stops*
transmission, leaving nodes on their last frame. So `shutdown()` (`main/index.ts`)
stops the tick first, then calls `blackoutAllOutputs()`
(`main/services/OutputPatchService.ts`) before `closeAll()` — zeroing every universe
and force-sending a full 0 frame via `Output.blackout()`, which **bypasses** the
subscription / dirty / rate-cap gating (an idle, gated-off universe would otherwise
never send the `0`). The frame repeats a few times (`SHUTDOWN_BLACKOUT_FRAMES`,
spaced by `SHUTDOWN_BLACKOUT_SPACING_MS`) because the WiFi/UDP link is lossy. Runs on
every quit path (`before-quit`, `SIGINT`/`SIGTERM`).

## Notes / Gotchas

- Scenes are a mix layer (SceneMixer); Effects / GroupEffects run after.
- SceneMixer blends **per channel by HTP/LTP** — intensity highest-takes-precedence,
  every attribute (pan/tilt/colour/gobo/beam…) latest-takes-precedence — so a scene
  replaces a fixture's home default on attributes instead of being masked by it. The
  app supplies the channel classification from the patch (`SceneMixer.setLtpMask`);
  live-engaged programmer channels still win. Full model: [htp-ltp.md](htp-ltp.md).
- New output type: subclass `Output`, set static `TYPE`, register via
  `OutputManager.registerType` (see `src/index.ts`).
- Best engine-API reference: `examples/`. See also [app.md](app.md).
